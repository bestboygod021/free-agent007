/**
 * Capability evidence ledger.
 *
 * The question this answers: how does the platform *know* which model or tool
 * is best for a given part of the work?
 *
 * The honest answer is that it does not know from reading about it. It knows
 * from measuring. So this module ranks evidence by how much it can be trusted,
 * puts the platform's own measurements at the top, and treats scraped web
 * opinion as the weakest, quarantined input it is.
 *
 * Why scraped opinion cannot be the primary source:
 *
 *  1. It is untrusted input. The platform's own safety line says untrusted
 *     content cannot change agent authority. Letting a forum thread pick the
 *     production model hands that authority to whoever can post.
 *  2. It is gameable. Astroturfing, SEO spam, vendor shills and coordinated
 *     brigading all produce exactly the shape of data a scraper rewards.
 *  3. It is not reproducible. The Evidence Rule requires proof that can be
 *     re-run. An opinion cannot.
 *  4. It measures reputation, not fitness. "Best model" in the abstract says
 *     nothing about this repository, these languages, these constraints.
 *
 * So the design is: measure first, and let the web only nudge. An endpoint
 * with no measurements is not ranked highly — it is sent to a canary lane that
 * exists to *produce* measurements.
 */

import { createHash } from "node:crypto";

// ── evidence tiers ──────────────────────────────────────────────────────────

export type EvidenceTier =
  /** produced by our own runs on our own reference projects */
  | "measured"
  /** a public benchmark we actually re-ran and reproduced */
  | "verified_benchmark"
  /** official spec sheet or vendor documentation */
  | "vendor_claim"
  /** scraped from the web: forums, social media, blogs, aggregators */
  | "community_signal";

export const EVIDENCE_TIERS: readonly EvidenceTier[] = [
  "measured",
  "verified_benchmark",
  "vendor_claim",
  "community_signal",
];

export interface TierPolicy {
  /** base multiplier applied to a claim's weight */
  weight: number;
  /** half-life in days; older evidence counts for less */
  halfLifeDays: number;
  /**
   * Hard ceiling on this tier's share of total weight, however many claims it
   * has. This is what stops a brigaded thread from outvoting a measurement.
   */
  maxShare: number;
  fa: string;
}

export const TIER_POLICIES: Record<EvidenceTier, TierPolicy> = {
  measured: {
    weight: 1,
    halfLifeDays: 90,
    maxShare: 1,
    fa: "اندازه‌گیری خود پلتفرم",
  },
  verified_benchmark: {
    weight: 0.6,
    halfLifeDays: 180,
    maxShare: 0.5,
    fa: "بنچمارک عمومی که خودمان بازتولید کردیم",
  },
  vendor_claim: {
    weight: 0.35,
    halfLifeDays: 365,
    maxShare: 0.3,
    fa: "ادعای رسمی فروشنده",
  },
  community_signal: {
    weight: 0.12,
    halfLifeDays: 30,
    maxShare: 0.15,
    fa: "سیگنال جمع‌شده از وب (قرنطینه‌شده)",
  },
};

// ── claims ──────────────────────────────────────────────────────────────────

export interface CapabilityClaim {
  /** what the claim is about: "groq/llama-3.3-70b" or "tool:eslint" */
  subject: string;
  /** the capability being scored, e.g. "code_generation:typescript" */
  capability: string;
  tier: EvidenceTier;
  /** normalised 0..1; the scraper's job is to normalise, not to opine */
  value: number;
  /** how many observations sit behind this one claim */
  sampleSize: number;
  observedAt: number;
  /** run id, benchmark name, or URL */
  source: string;
  /** registrable domain for web claims — used for per-domain caps */
  domain?: string;
}

export interface EvidenceBasis {
  tier: EvidenceTier;
  source: string;
  value: number;
  /** weight after tier multiplier, recency decay and share capping */
  effectiveWeight: number;
  shareOfTotal: number;
}

export interface EvidenceConflict {
  /** spread of the values, 0..1 */
  spread: number;
  highest: EvidenceBasis;
  lowest: EvidenceBasis;
}

export interface ManipulationFinding {
  kind: "domain_flood" | "time_burst" | "value_clustering" | "unattributed";
  detail: string;
  claims: number;
}

export interface CapabilityScore {
  subject: string;
  capability: string;
  /** weighted value, 0..1 */
  value: number;
  /**
   * How much the platform is entitled to trust `value`. Low confidence means
   * "we have not measured this", not "this is bad".
   */
  confidence: number;
  totalSampleSize: number;
  /**
   * Sample count from `measured` claims only.
   *
   * Use this — never `totalSampleSize` — to decide whether a subject still
   * needs trials. A subject with 300 scraped posts and zero runs has
   * `totalSampleSize` 300 and `measuredSamples` 0; gating on the former skips
   * measurement for exactly the subjects that need it most.
   */
  measuredSamples: number;
  /** true when the score rests on no first-party measurement at all */
  unmeasured: boolean;
  basis: EvidenceBasis[];
  conflict?: EvidenceConflict;
  manipulation: ManipulationFinding[];
  /** traffic share to give this subject so measurements get produced */
  canaryShare: number;
  /** short Persian sentence for the UI */
  explanationFa: string;
}

// ── weighting ───────────────────────────────────────────────────────────────

export interface EvidenceOptions {
  now?: number;
  /** minimum claims before a tier is believed at full weight */
  minSamples?: number;
  /** above this weighted spread the score is flagged as contested */
  conflictSpread?: number;
  /** maximum canary traffic a single subject may receive */
  maxCanaryShare?: number;
}

const DAY_MS = 86_400_000;

/** Exponential recency decay. Fresh evidence counts; stale evidence fades. */
export function recencyFactor(tier: EvidenceTier, observedAt: number, now: number): number {
  const ageDays = Math.max(0, (now - observedAt) / DAY_MS);
  const halfLife = TIER_POLICIES[tier].halfLifeDays;
  return Math.pow(0.5, ageDays / halfLife);
}

/**
 * Cap a single domain's contribution. Scraped sources are correlated: ten
 * reposts of one blog are not ten independent observations.
 */
function domainCap(claims: readonly CapabilityClaim[], perDomain = 2): Map<string, number> {
  const seen = new Map<string, number>();
  const allowed = new Map<string, number>();
  for (const c of claims) {
    if (c.tier !== "community_signal" || !c.domain) {
      allowed.set(claimKey(c), 1);
      continue;
    }
    const used = seen.get(c.domain) ?? 0;
    seen.set(c.domain, used + 1);
    // first `perDomain` claims count fully; the rest decay hard
    allowed.set(claimKey(c), used < perDomain ? 1 : 0.25);
  }
  return allowed;
}

function claimKey(c: CapabilityClaim): string {
  return `${c.tier}|${c.source}|${c.observedAt}|${c.value}`;
}

/**
 * Detect the shapes that indicate coordinated rather than organic signal.
 * Detection lowers influence; it never silently deletes evidence.
 */
export function detectManipulation(
  claims: readonly CapabilityClaim[],
  now = Date.now(),
): ManipulationFinding[] {
  const findings: ManipulationFinding[] = [];
  const web = claims.filter((c) => c.tier === "community_signal");
  if (web.length === 0) return findings;

  const byDomain = new Map<string, number>();
  for (const c of web) {
    if (!c.domain) {
      findings.push({
        kind: "unattributed",
        detail: "web claim without an attributable domain",
        claims: 1,
      });
      continue;
    }
    byDomain.set(c.domain, (byDomain.get(c.domain) ?? 0) + 1);
  }
  for (const [domain, count] of byDomain) {
    if (count >= 4) {
      findings.push({
        kind: "domain_flood",
        detail: `${count} claims attributed to ${domain}`,
        claims: count,
      });
    }
  }

  const windowMs = 6 * 60 * 60 * 1000;
  const buckets = new Map<number, number>();
  for (const c of web) {
    const bucket = Math.floor(c.observedAt / windowMs);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  for (const [bucket, count] of buckets) {
    if (count >= 5 && now - bucket * windowMs < 7 * DAY_MS) {
      findings.push({
        kind: "time_burst",
        detail: `${count} claims inside one 6h window`,
        claims: count,
      });
    }
  }

  const extremes = web.filter((c) => c.value >= 0.98 || c.value <= 0.02).length;
  if (web.length >= 4 && extremes / web.length > 0.6) {
    findings.push({
      kind: "value_clustering",
      detail: `${extremes}/${web.length} web claims pinned at an extreme value`,
      claims: extremes,
    });
  }
  return findings;
}

// ── aggregation ─────────────────────────────────────────────────────────────

export interface AggregateResult {
  score: CapabilityScore;
}

/**
 * Fold claims about one (subject, capability) pair into a single score.
 *
 * Order matters: per-domain caps first, then tier weighting and recency, then
 * the tier share ceiling. The ceiling is applied last so that no quantity of
 * low-tier evidence can buy its way past it.
 */
export function aggregateEvidence(
  claims: readonly CapabilityClaim[],
  options: EvidenceOptions = {},
): CapabilityScore {
  const now = options.now ?? Date.now();
  const minSamples = options.minSamples ?? 3;
  const conflictSpread = options.conflictSpread ?? 0.25;
  const maxCanaryShare = options.maxCanaryShare ?? 0.15;

  const subject = claims[0]?.subject ?? "(unknown)";
  const capability = claims[0]?.capability ?? "(unknown)";
  const manipulation = detectManipulation(claims, now);
  const floodDomains = new Set(
    manipulation.filter((m) => m.kind === "domain_flood").map((m) => m.detail.split(" ").pop() ?? ""),
  );

  const caps = domainCap(claims);

  // 1 — raw weights
  const raw = claims.map((c) => {
    const policy = TIER_POLICIES[c.tier];
    const sampleFactor = c.sampleSize >= minSamples ? 1 : Math.max(0.3, c.sampleSize / minSamples);
    const floodPenalty = c.domain && floodDomains.has(c.domain) ? 0.5 : 1;
    const domainFactor = caps.get(claimKey(c)) ?? 1;
    return {
      claim: c,
      raw: policy.weight * recencyFactor(c.tier, c.observedAt, now) * sampleFactor * domainFactor * floodPenalty,
    };
  });

  // 2 — tier share ceiling. Each tier may hold at most `maxShare` of the
  //     *final* total, so 500 scraped posts cannot outweigh three of our runs.
  //
  //     Capping the raw share is not enough: scaling one tier down raises every
  //     other tier's share, which silently pushes the capped tier back over its
  //     ceiling. Solve for the contribution instead — a tier capped at `m`
  //     against `others` may contribute at most m*others/(1-m) — and apply the
  //     caps from the tightest ceiling outward so each sees the others settled.
  const tierRaw = new Map<EvidenceTier, number>();
  for (const r of raw) tierRaw.set(r.claim.tier, (tierRaw.get(r.claim.tier) ?? 0) + r.raw);

  const contribution = new Map<EvidenceTier, number>(tierRaw);
  const ordered = [...tierRaw.keys()].sort(
    (a, b) => TIER_POLICIES[a].maxShare - TIER_POLICIES[b].maxShare,
  );
  for (const tier of ordered) {
    const maxShare = TIER_POLICIES[tier].maxShare;
    if (maxShare >= 1) continue;
    let others = 0;
    for (const [other, sum] of contribution) if (other !== tier) others += sum;
    // A ceiling only means something relative to other tiers. When this tier is
    // the only evidence present there is nothing for it to outvote, and capping
    // it against `others = 0` would discard the evidence outright. Low-tier-only
    // scores are handled by `unmeasured` and `confidence`, not by deletion.
    if (others <= 0) continue;
    const limit = (maxShare * others) / (1 - maxShare);
    const current = contribution.get(tier) ?? 0;
    if (current > limit) contribution.set(tier, limit);
  }

  const tierScale = new Map<EvidenceTier, number>();
  for (const [tier, sum] of tierRaw) {
    const capped = contribution.get(tier) ?? 0;
    tierScale.set(tier, sum > 0 ? capped / sum : 1);
  }

  const weighted = raw.map((r) => ({
    claim: r.claim,
    effectiveWeight: r.raw * (tierScale.get(r.claim.tier) ?? 1),
  }));
  const totalWeight = weighted.reduce((s, w) => s + w.effectiveWeight, 0);

  const basis: EvidenceBasis[] = weighted
    .filter((w) => w.effectiveWeight > 0)
    .map((w) => ({
      tier: w.claim.tier,
      source: w.claim.source,
      value: w.claim.value,
      effectiveWeight: round4(w.effectiveWeight),
      shareOfTotal: totalWeight > 0 ? round4(w.effectiveWeight / totalWeight) : 0,
    }))
    .sort((a, b) => b.effectiveWeight - a.effectiveWeight);

  const value =
    totalWeight > 0
      ? weighted.reduce((s, w) => s + w.effectiveWeight * w.claim.value, 0) / totalWeight
      : 0;

  // 3 — confidence. Driven by how much *first-party* evidence exists, because
  //     that is the only kind that can be re-run.
  const measuredWeight = weighted
    .filter((w) => w.claim.tier === "measured")
    .reduce((s, w) => s + w.effectiveWeight, 0);
  const measuredSamples = claims
    .filter((c) => c.tier === "measured")
    .reduce((s, c) => s + c.sampleSize, 0);
  const unmeasured = measuredWeight === 0;

  let confidence = unmeasured ? 0 : Math.min(1, measuredWeight) * Math.min(1, measuredSamples / 10);
  // corroborating tiers raise it a little; they can never create it from zero
  if (unmeasured) {
    confidence = Math.min(0.35, totalWeight * 0.25);
  }
  if (manipulation.length > 0) confidence *= 0.8;

  // 4 — conflict detection
  let conflict: EvidenceConflict | undefined;
  if (basis.length >= 2) {
    const values = basis.map((b) => b.value);
    const spread = Math.max(...values) - Math.min(...values);
    if (spread > conflictSpread) {
      const highest = basis.reduce((a, b) => (b.value > a.value ? b : a));
      const lowest = basis.reduce((a, b) => (b.value < a.value ? b : a));
      conflict = { spread: round4(spread), highest, lowest };
      confidence *= 0.7;
    }
  }

  confidence = round4(Math.max(0, Math.min(1, confidence)));

  // 5 — canary share. Low confidence is an instruction to go measure, not a
  //     verdict. Explore/exploit: the least-known subject earns probe traffic.
  const canaryShare = round4(Math.min(maxCanaryShare, (1 - confidence) * 0.2));

  const totalSampleSize = claims.reduce((s, c) => s + c.sampleSize, 0);

  return {
    subject,
    capability,
    value: round4(value),
    confidence,
    totalSampleSize,
    measuredSamples,
    unmeasured,
    basis,
    ...(conflict ? { conflict } : {}),
    manipulation,
    canaryShare,
    explanationFa: explainFa({
      value, confidence, unmeasured, conflict, manipulation, claims, canaryShare,
    }),
  };
}

function explainFa(input: {
  value: number;
  confidence: number;
  unmeasured: boolean;
  conflict?: EvidenceConflict;
  manipulation: ManipulationFinding[];
  claims: readonly CapabilityClaim[];
  canaryShare: number;
}): string {
  const measured = input.claims.filter((c) => c.tier === "measured").length;
  const web = input.claims.filter((c) => c.tier === "community_signal").length;
  const parts: string[] = [];

  if (input.unmeasured) {
    parts.push("هیچ اندازه‌گیری داخلی نداریم؛ امتیاز فقط از ادعای بیرونی است");
    parts.push(`${Math.round(input.canaryShare * 100)}٪ ترافیک canary برای تولید شواهد`);
  } else {
    parts.push(`${measured} اندازه‌گیری داخلی`);
    parts.push(`اطمینان ${Math.round(input.confidence * 100)}٪`);
  }
  if (web > 0) parts.push(`${web} سیگنال وب با سقف نفوذ ۱۵٪`);
  if (input.conflict) parts.push(`اختلاف منابع ${input.conflict.spread} — contested`);
  if (input.manipulation.length > 0) {
    parts.push(`${input.manipulation.length} نشانه دستکاری کاهش نفوذ خورد`);
  }
  return parts.join(" · ");
}

// ── ranking ─────────────────────────────────────────────────────────────────

export interface RankedCandidate {
  score: CapabilityScore;
  /** value discounted by how little we actually know */
  adjustedValue: number;
  rank: number;
}

/**
 * Rank candidates for one capability.
 *
 * The adjustment is the whole point: an endpoint with a spectacular but
 * unverified reputation is placed *below* a mediocre endpoint we have measured,
 * because the measured one's number can be trusted and re-produced.
 */
export function rankCandidates(
  scores: readonly CapabilityScore[],
  options: { unmeasuredPenalty?: number } = {},
): RankedCandidate[] {
  const penalty = options.unmeasuredPenalty ?? 0.5;
  return scores
    .map((s) => ({
      score: s,
      adjustedValue: round4(s.value * (s.unmeasured ? penalty : 0.5 + s.confidence * 0.5)),
    }))
    .sort((a, b) => b.adjustedValue - a.adjustedValue || b.score.confidence - a.score.confidence)
    .map((c, i) => ({ ...c, rank: i + 1 }));
}

/**
 * Turn scores into the `{speed, capability, reliability}` shape the provider
 * pool already consumes. This is the bridge from evidence to routing.
 */
export function toEndpointScores(scores: {
  speed?: CapabilityScore;
  capability?: CapabilityScore;
  reliability?: CapabilityScore;
}): { speed: number; capability: number; reliability: number } {
  const pick = (s: CapabilityScore | undefined, fallback: number): number => {
    if (!s) return fallback;
    // unmeasured subjects are pulled toward a conservative middle rather than
    // being allowed to inherit a scraped reputation
    if (s.unmeasured) return round4(0.5 + (s.value - 0.5) * 0.3);
    return round4(s.value * (0.5 + s.confidence * 0.5));
  };
  return {
    speed: pick(scores.speed, 0.5),
    capability: pick(scores.capability, 0.5),
    reliability: pick(scores.reliability, 0.5),
  };
}

/** Stable digest so a routing decision can be replayed against its evidence. */
export function evidenceDigest(scores: readonly CapabilityScore[]): string {
  const canonical = scores
    .map((s) => `${s.subject}|${s.capability}|${s.value}|${s.confidence}`)
    .sort()
    .join(";");
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
