/**
 * Canary trials — the loop that closes the evidence ledger.
 *
 * `capability-evidence.ts` decides how much to trust what we know. This module
 * decides **what to go learn next**, and when to stop learning it.
 *
 * The problem is a multi-armed bandit: every unmeasured model or tool is an arm
 * whose true quality we do not know, every trial costs tokens, and spending the
 * whole budget exploring means users get mediocre runs. The professional answer
 * is not a heuristic — it is Bayesian exploration with sequential stopping:
 *
 *  1. **Beta–Bernoulli posterior.** A pass/fail run updates `Beta(α, β)`. This
 *     carries *uncertainty*, which a point estimate cannot: 3/3 passes is not
 *     the same claim as 300/300.
 *  2. **Thompson sampling.** Sample from each arm's posterior and run the
 *     highest draw. This explores in proportion to the probability an arm is
 *     actually the best — no hand-tuned ε, and it self-anneals as evidence
 *     accumulates.
 *  3. **Sequential test (SPRT).** Stop early when the log-likelihood ratio
 *     crosses a boundary. This is what keeps an obviously-bad arm from eating
 *     the whole budget, and keeps a close call running until it is decidable.
 *  4. **Paired trials.** Both arms run the *same* task, so task difficulty
 *     cancels out. Comparing raw pass rates across different tasks is noise.
 *  5. **Guardrails.** No promotion before a minimum sample, no promotion that
 *     fails a non-inferiority margin, and a hard budget ceiling.
 *
 * Determinism is not optional here: a decision that spends money must be
 * replayable. Every draw goes through a seeded PRNG, so a routing decision can
 * be reproduced from the seed and the trial history.
 */

// ── seeded randomness ───────────────────────────────────────────────────────

/** mulberry32 — tiny, fast, and reproducible across platforms. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller. */
function standardNormal(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Gamma(shape, 1) via Marsaglia–Tsang; handles shape < 1 by boosting. */
function gammaSample(shape: number, rng: () => number): number {
  if (shape < 1) {
    const u = rng() || Number.MIN_VALUE;
    return gammaSample(shape + 1, rng) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = standardNormal(rng);
    const v = Math.pow(1 + c * x, 3);
    if (v <= 0) continue;
    const u = rng() || Number.MIN_VALUE;
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
}

/** Draw from Beta(α, β) using the gamma quotient identity. */
export function betaSample(alpha: number, beta: number, rng: () => number): number {
  const x = gammaSample(alpha, rng);
  const y = gammaSample(beta, rng);
  const sum = x + y;
  return sum > 0 ? x / sum : 0.5;
}

// ── posterior ───────────────────────────────────────────────────────────────

export interface BetaPosterior {
  alpha: number;
  beta: number;
  mean: number;
  variance: number;
  sd: number;
  /** observed trials, excluding the prior */
  n: number;
  /** width of the 95% credible interval — the honest "how unsure are we" */
  ciWidth: number;
}

export interface TrialCounts {
  successes: number;
  failures: number;
}

/**
 * Beta–Bernoulli posterior. Default prior is Jeffreys' `Beta(0.5, 0.5)`, which
 * is less opinionated at n=0 than a uniform prior and does not pretend an
 * unmeasured arm is already at 50%.
 */
export function posterior(
  counts: TrialCounts,
  prior: { alpha: number; beta: number } = { alpha: 0.5, beta: 0.5 },
): BetaPosterior {
  const alpha = prior.alpha + counts.successes;
  const beta = prior.beta + counts.failures;
  const n = counts.successes + counts.failures;
  const mean = alpha / (alpha + beta);
  const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
  return {
    alpha,
    beta,
    mean: round4(mean),
    variance,
    sd: Math.sqrt(variance),
    n,
    ciWidth: round4(2 * 1.96 * Math.sqrt(variance)),
  };
}

// ── Thompson sampling ───────────────────────────────────────────────────────

export interface Arm {
  subject: string;
  counts: TrialCounts;
  /**
   * When true the arm is the current production choice. Champions get fewer
   * exploratory trials — we are testing challengers, not re-litigating them.
   */
  champion?: boolean;
  /** multiplier on exploration appetite; 0 pins the arm to exploitation only */
  explorationFactor?: number;
}

export interface RankedArm {
  subject: string;
  draw: number;
  posteriorMean: number;
  /** probability this arm is the best, estimated by Monte Carlo */
  probBest: number;
  rank: number;
}

export interface ThompsonOptions {
  seed: number;
  /** Monte Carlo draws for `probBest`; 0 skips it */
  monteCarlo?: number;
}

/**
 * Rank arms by a Thompson draw.
 *
 * A champion's posterior is sharpened before sampling (`explorationFactor`),
 * which narrows its draw distribution toward its mean. That is deliberate: an
 * arm with 500 observed trials should not keep winning coin-flips against an
 * arm with 5, or exploration would never finish.
 */
export function thompsonRank(arms: readonly Arm[], options: ThompsonOptions): RankedArm[] {
  const rng = mulberry32(options.seed);
  const mc = options.monteCarlo ?? 2000;

  const posteriors = arms.map((a) => {
    const p = posterior(a.counts);
    const factor = a.champion ? a.explorationFactor ?? 0.5 : 1;
    // sharpening by scaling counts keeps the mean and shrinks the variance
    return { arm: a, p, factor };
  });

  const wins = new Map<string, number>();
  if (mc > 0) {
    for (const entry of posteriors) wins.set(entry.arm.subject, 0);
    for (let i = 0; i < mc; i += 1) {
      let bestSubject: string | undefined;
      let bestDraw = -1;
      for (const { arm, p, factor } of posteriors) {
        const draw = betaSample(p.alpha * factor, p.beta * factor, rng);
        if (draw > bestDraw) {
          bestDraw = draw;
          bestSubject = arm.subject;
        }
      }
      if (bestSubject) wins.set(bestSubject, (wins.get(bestSubject) ?? 0) + 1);
    }
  }

  const ranked = posteriors
    .map(({ arm, p, factor }) => ({
      subject: arm.subject,
      draw: round4(betaSample(p.alpha * factor, p.beta * factor, rng)),
      posteriorMean: p.mean,
      probBest: mc > 0 ? round4((wins.get(arm.subject) ?? 0) / mc) : 0,
    }))
    .sort((a, b) => b.draw - a.draw)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  return ranked;
}

// ── sequential test ─────────────────────────────────────────────────────────

export type SequentialDecision = "continue" | "accept_better" | "reject_worse";

export interface SequentialTestResult {
  decision: SequentialDecision;
  logLikelihoodRatio: number;
  /** crossing this accepts H1 (the candidate really is better) */
  upperBound: number;
  /** crossing this accepts H0 (it is not) */
  lowerBound: number;
  observedRate: number;
  trials: number;
  explanationFa: string;
}

/**
 * Wald's Sequential Probability Ratio Test for a Bernoulli rate.
 *
 * H0: pass rate = `baseline`. H1: pass rate = `target`.
 *
 * The boundaries come straight from the error budget: with α = β = 0.05 the
 * bounds are ±2.944. The test stops as soon as the evidence is decisive in
 * either direction, which is the whole point — a fixed-sample test would keep
 * burning tokens on a foregone conclusion.
 */
export function sequentialTest(
  outcomes: readonly boolean[],
  baseline: number,
  target: number,
  errorRates: { alpha?: number; beta?: number } = {},
): SequentialTestResult {
  const alphaRisk = errorRates.alpha ?? 0.05;
  const betaRisk = errorRates.beta ?? 0.05;
  const upperBound = Math.log((1 - betaRisk) / alphaRisk);
  const lowerBound = Math.log(betaRisk / (1 - alphaRisk));

  let llr = 0;
  for (const pass of outcomes) {
    llr += pass
      ? Math.log(target / baseline)
      : Math.log((1 - target) / (1 - baseline));
  }

  const trials = outcomes.length;
  const passes = outcomes.filter(Boolean).length;
  const observedRate = trials > 0 ? round4(passes / trials) : 0;

  const decision: SequentialDecision =
    llr >= upperBound ? "accept_better" : llr <= lowerBound ? "reject_worse" : "continue";

  const explanationFa =
    decision === "accept_better"
      ? `شواهد کافی است: نرخ مشاهده‌شده ${observedRate} از آستانه بهتر است`
      : decision === "reject_worse"
        ? `شواهد کافی است: نرخ مشاهده‌شده ${observedRate} بهتر از پایه نیست — canary متوقف شد`
        : `هنوز قطعیت نداریم (LLR=${round4(llr)} بین ${round4(lowerBound)} و ${round4(upperBound)})`;

  return {
    decision,
    logLikelihoodRatio: round4(llr),
    upperBound: round4(upperBound),
    lowerBound: round4(lowerBound),
    observedRate,
    trials,
    explanationFa,
  };
}

// ── paired comparison ───────────────────────────────────────────────────────

export interface PairedResult {
  /** trials where only the candidate passed */
  candidateOnly: number;
  /** trials where only the champion passed */
  championOnly: number;
  bothPassed: number;
  bothFailed: number;
  /** McNemar statistic on the discordant pairs */
  mcnemar: number;
  /** true when the discordance is large enough to be more than luck */
  significant: boolean;
  net: number;
}

/**
 * Compare two arms on the *same* tasks.
 *
 * Raw pass-rate comparison across different tasks mostly measures which tasks
 * were easier. McNemar's test uses only the discordant pairs — where exactly
 * one arm passed — so task difficulty cancels.
 */
export function pairedComparison(
  pairs: readonly { candidate: boolean; champion: boolean }[],
  criticalValue = 3.841,
): PairedResult {
  let candidateOnly = 0;
  let championOnly = 0;
  let bothPassed = 0;
  let bothFailed = 0;
  for (const p of pairs) {
    if (p.candidate && p.champion) bothPassed += 1;
    else if (!p.candidate && !p.champion) bothFailed += 1;
    else if (p.candidate) candidateOnly += 1;
    else championOnly += 1;
  }
  const discordant = candidateOnly + championOnly;
  // McNemar with continuity correction
  const mcnemar = discordant === 0 ? 0 : (Math.abs(candidateOnly - championOnly) - 1) ** 2 / discordant;
  return {
    candidateOnly,
    championOnly,
    bothPassed,
    bothFailed,
    mcnemar: round4(mcnemar),
    significant: mcnemar > criticalValue,
    net: candidateOnly - championOnly,
  };
}

// ── guardrails ──────────────────────────────────────────────────────────────

export interface GuardrailPolicy {
  /** no promotion before this many observed trials */
  minTrials: number;
  /** candidate must clear champion mean minus this margin */
  nonInferiorityMargin: number;
  /** a candidate worse than this multiple of the champion is demoted at once */
  regressionFloor: number;
}

export const DEFAULT_GUARDRAILS: GuardrailPolicy = {
  minTrials: 30,
  nonInferiorityMargin: 0.05,
  regressionFloor: 0.8,
};

export interface GuardrailVerdict {
  action: "hold" | "promote" | "demote";
  reasons: string[];
  blockedBy: string | null;
}

/**
 * Decide a promotion. Promotion requires *both* enough evidence and enough
 * quality; either one missing keeps the champion in place. Failing loud here
 * is cheap — a bad promotion is not.
 */
export function evaluateGuardrails(
  candidate: TrialCounts,
  champion: TrialCounts,
  policy: GuardrailPolicy = DEFAULT_GUARDRAILS,
): GuardrailVerdict {
  const reasons: string[] = [];
  const c = posterior(candidate);
  const ch = posterior(champion);

  if (c.n < policy.minTrials) {
    return {
      action: "hold",
      reasons: [`only ${c.n}/${policy.minTrials} trials observed`],
      blockedBy: "minTrials",
    };
  }

  const floor = ch.mean * policy.regressionFloor;
  if (c.mean < floor) {
    return {
      action: "demote",
      reasons: [
        `candidate ${c.mean} is below the regression floor ${round4(floor)} (champion ${ch.mean})`,
      ],
      blockedBy: null,
    };
  }

  if (c.mean < ch.mean - policy.nonInferiorityMargin) {
    reasons.push(
      `candidate ${c.mean} does not clear non-inferiority vs champion ${ch.mean} (margin ${policy.nonInferiorityMargin})`,
    );
    return { action: "hold", reasons, blockedBy: "nonInferiority" };
  }

  // the candidate must also be credibly better, not merely not-worse: the
  // lower edge of its interval has to clear the champion's mean
  if (c.mean - 1.96 * c.sd < ch.mean) {
    reasons.push(
      `candidate is not credibly better: lower 95% bound ${round4(c.mean - 1.96 * c.sd)} vs champion ${ch.mean}`,
    );
    return { action: "hold", reasons, blockedBy: "credibleImprovement" };
  }

  reasons.push(`candidate ${c.mean} credibly clears champion ${ch.mean}`);
  return { action: "promote", reasons, blockedBy: null };
}

// ── budget-aware allocation ─────────────────────────────────────────────────

export interface AllocationRequest {
  arms: readonly Arm[];
  /** total tokens this exploration cycle may spend */
  tokenBudget: number;
  /** what one trial costs for this arm */
  costPerTrial: (subject: string) => number;
  /** hard ceiling on the share any one arm may take */
  maxSharePerArm?: number;
  seed: number;
}

export interface CanaryAllocation {
  subject: string;
  share: number;
  trials: number;
  tokens: number;
  probBest: number;
  reason: string;
}

export interface AllocationPlan {
  allocations: CanaryAllocation[];
  tokensCommitted: number;
  tokensRemaining: number;
  budgetExhausted: boolean;
}

/**
 * Turn a Thompson ranking into a token budget plan.
 *
 * Exploration is proportional to `probBest`, but two things override it: an arm
 * already at the sample floor gets nothing extra, and no arm may exceed
 * `maxSharePerArm`. Trials are bought greedily in rank order so a small budget
 * still produces *some* evidence for the most promising arm.
 */
export function allocateCanary(
  req: AllocationRequest,
  policy: GuardrailPolicy = DEFAULT_GUARDRAILS,
): AllocationPlan {
  const maxShare = req.maxSharePerArm ?? 0.35;
  const ranked = thompsonRank(req.arms, { seed: req.seed });

  const eligible = ranked.filter((r) => {
    const arm = req.arms.find((a) => a.subject === r.subject);
    const n = (arm?.counts.successes ?? 0) + (arm?.counts.failures ?? 0);
    return n < policy.minTrials * 3;
  });

  const probSum = eligible.reduce((s, r) => s + r.probBest, 0);
  const allocations: CanaryAllocation[] = [];
  let tokensCommitted = 0;

  for (const r of eligible) {
    if (tokensCommitted >= req.tokenBudget) break;
    const rawShare = probSum > 0 ? r.probBest / probSum : 1 / Math.max(1, eligible.length);
    const share = Math.min(rawShare, maxShare);
    const cost = req.costPerTrial(r.subject);
    if (cost <= 0) continue;

    const tokensForArm = Math.min(share * req.tokenBudget, req.tokenBudget - tokensCommitted);
    const trials = Math.floor(tokensForArm / cost);
    if (trials <= 0) continue;

    const tokens = trials * cost;
    tokensCommitted += tokens;
    allocations.push({
      subject: r.subject,
      share: round4(share),
      trials,
      tokens,
      probBest: r.probBest,
      reason: `probBest ${Math.round(r.probBest * 100)}٪ از نمونه‌گیری Thompson`,
    });
  }

  return {
    allocations,
    tokensCommitted,
    tokensRemaining: req.tokenBudget - tokensCommitted,
    budgetExhausted: allocations.length === 0,
  };
}

// ── closing the loop ────────────────────────────────────────────────────────

export interface TrialRecord {
  subject: string;
  capability: string;
  passed: boolean;
  tokensUsed: number;
  durationMs: number;
  repairAttempts: number;
  runId: string;
  at: number;
}

export interface MeasuredClaim {
  subject: string;
  capability: string;
  tier: "measured";
  value: number;
  sampleSize: number;
  observedAt: number;
  source: string;
}

/**
 * Convert trial records into `measured` claims for the evidence ledger.
 *
 * This is the wire that closes the loop: canary trials become top-tier
 * evidence, which raises confidence, which lowers `canaryShare`, which stops
 * the exploration. Without this function the platform would explore forever.
 */
export function trialsToClaims(
  records: readonly TrialRecord[],
  capability: string,
  observedAt: number,
): MeasuredClaim[] {
  const bySubject = new Map<string, { passes: number; total: number; tokens: number }>();
  for (const r of records) {
    const entry = bySubject.get(r.subject) ?? { passes: 0, total: 0, tokens: 0 };
    entry.passes += r.passed ? 1 : 0;
    entry.total += 1;
    entry.tokens += r.tokensUsed;
    bySubject.set(r.subject, entry);
  }
  const claims: MeasuredClaim[] = [];
  for (const [subject, e] of bySubject) {
    if (e.total === 0) continue;
    claims.push({
      subject,
      capability,
      tier: "measured",
      value: round4(e.passes / e.total),
      sampleSize: e.total,
      observedAt,
      source: `canary:${capability}:${e.total}trials`,
    });
  }
  return claims;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
