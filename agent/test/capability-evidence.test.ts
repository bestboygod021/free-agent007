import { describe, expect, it } from "vitest";

import {
  aggregateEvidence,
  rankCandidates,
  toEndpointScores,
  detectManipulation,
  recencyFactor,
  evidenceDigest,
  TIER_POLICIES,
  EVIDENCE_TIERS,
  type CapabilityClaim,
} from "../src/core/capability-evidence.js";

const NOW = Date.parse("2026-09-08T00:00:00Z");
const days = (n: number) => NOW - n * 86_400_000;

function claim(over: Partial<CapabilityClaim> & Pick<CapabilityClaim, "tier" | "value">): CapabilityClaim {
  return {
    subject: "groq/llama-3.3-70b",
    capability: "code_generation:typescript",
    sampleSize: 20,
    observedAt: days(1),
    source: "run:1",
    ...over,
  };
}

const measured = (value: number, n = 20) =>
  claim({ tier: "measured", value, sampleSize: n, source: `run:${value}:${n}`, observedAt: days(2) });
const web = (value: number, domain: string, i: number) =>
  claim({ tier: "community_signal", value, domain, source: `https://${domain}/p${i}`, sampleSize: 1, observedAt: days(1) });

describe("tier policy", () => {
  it("ranks measurement above scraped opinion", () => {
    expect(TIER_POLICIES.measured.weight).toBeGreaterThan(TIER_POLICIES.verified_benchmark.weight);
    expect(TIER_POLICIES.verified_benchmark.weight).toBeGreaterThan(TIER_POLICIES.vendor_claim.weight);
    expect(TIER_POLICIES.vendor_claim.weight).toBeGreaterThan(TIER_POLICIES.community_signal.weight);
  });

  it("caps community influence well below half", () => {
    expect(TIER_POLICIES.community_signal.maxShare).toBeLessThanOrEqual(0.15);
    for (const tier of EVIDENCE_TIERS) {
      expect(TIER_POLICIES[tier].maxShare).toBeGreaterThan(0);
      expect(TIER_POLICIES[tier].maxShare).toBeLessThanOrEqual(1);
    }
  });

  it("decays scraped signal fastest and measurement slowest", () => {
    expect(TIER_POLICIES.community_signal.halfLifeDays).toBeLessThan(TIER_POLICIES.measured.halfLifeDays);
    expect(recencyFactor("community_signal", days(30), NOW)).toBeCloseTo(0.5, 5);
    expect(recencyFactor("measured", days(90), NOW)).toBeCloseTo(0.5, 5);
    expect(recencyFactor("measured", days(30), NOW)).toBeGreaterThan(
      recencyFactor("community_signal", days(30), NOW),
    );
  });
});

describe("the central claim: scraped opinion cannot outvote measurement", () => {
  it("500 brigaded web posts do not overturn 3 of our own runs", () => {
    const claims = [
      measured(0.35, 12),
      measured(0.33, 12),
      measured(0.36, 12),
      ...Array.from({ length: 500 }, (_, i) => web(0.99, `hype${i % 40}.example`, i)),
    ];
    const score = aggregateEvidence(claims, { now: NOW });
    // the measured value is ~0.35; a 0.15 web ceiling may nudge, not replace
    expect(score.value).toBeLessThan(0.5);
    expect(score.value).toBeGreaterThan(0.3);
    const webShare = score.basis
      .filter((b) => b.tier === "community_signal")
      .reduce((s, b) => s + b.shareOfTotal, 0);
    expect(webShare).toBeLessThanOrEqual(0.16);
  });

  it("keeps an unmeasured subject at low confidence no matter the hype", () => {
    const score = aggregateEvidence(
      Array.from({ length: 200 }, (_, i) => web(1, `blog${i}.example`, i)),
      { now: NOW },
    );
    expect(score.unmeasured).toBe(true);
    expect(score.confidence).toBeLessThanOrEqual(0.35);
    expect(score.canaryShare).toBeGreaterThan(0);
  });

  it("gives a measured subject real confidence", () => {
    const score = aggregateEvidence([measured(0.8, 40), measured(0.82, 40)], { now: NOW });
    expect(score.unmeasured).toBe(false);
    expect(score.confidence).toBeGreaterThan(0.5);
  });
});

describe("measuredSamples vs totalSampleSize", () => {
  it("does not count scraped posts as measurements", () => {
    const hyped = aggregateEvidence(
      Array.from({ length: 300 }, (_, i) => web(0.99, `b${i}.example`, i)),
      { now: NOW },
    );
    // the trap: totalSampleSize is 300, so gating exploration on it would skip
    // exactly the subject that has never been measured
    expect(hyped.totalSampleSize).toBe(300);
    expect(hyped.measuredSamples).toBe(0);
    expect(hyped.unmeasured).toBe(true);
  });

  it("counts real runs", () => {
    const s = aggregateEvidence([measured(0.8, 12), measured(0.82, 8)], { now: NOW });
    expect(s.measuredSamples).toBe(20);
    expect(s.totalSampleSize).toBe(20);
  });

  it("separates the two when both kinds are present", () => {
    const s = aggregateEvidence(
      [measured(0.7, 10), web(0.9, "a.example", 0), web(0.9, "b.example", 1)],
      { now: NOW },
    );
    expect(s.measuredSamples).toBe(10);
    expect(s.totalSampleSize).toBe(12);
  });
});

describe("ranking", () => {
  it("places a measured mediocre endpoint above an unmeasured spectacular one", () => {
    const measuredMid = aggregateEvidence([measured(0.6, 30)], { now: NOW });
    const hypedUnknown = aggregateEvidence(
      Array.from({ length: 50 }, (_, i) => web(0.99, `b${i}.example`, i)),
      { now: NOW },
    );
    const ranked = rankCandidates([hypedUnknown, measuredMid]);
    expect(ranked[0]!.score.subject).toBeDefined();
    expect(ranked[0]!.score.confidence).toBeGreaterThan(ranked[1]!.score.confidence);
    expect(ranked[0]!.score.unmeasured).toBe(false);
  });

  it("ranks by adjusted value and numbers from 1", () => {
    const a = aggregateEvidence([measured(0.9, 30)], { now: NOW });
    const b = aggregateEvidence([measured(0.4, 30)], { now: NOW });
    const ranked = rankCandidates([b, a]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2]);
    expect(ranked[0]!.adjustedValue).toBeGreaterThan(ranked[1]!.adjustedValue);
  });
});

describe("manipulation detection", () => {
  it("flags a domain flood", () => {
    const findings = detectManipulation(
      Array.from({ length: 6 }, (_, i) => web(0.9, "spam.example", i)),
      NOW,
    );
    expect(findings.some((f) => f.kind === "domain_flood")).toBe(true);
  });

  it("flags a time burst", () => {
    const burst = Array.from({ length: 6 }, (_, i) =>
      claim({
        tier: "community_signal", value: 0.9, domain: `d${i}.example`,
        source: `https://d${i}.example/x`, sampleSize: 1, observedAt: NOW - i * 60_000,
      }),
    );
    expect(detectManipulation(burst, NOW).some((f) => f.kind === "time_burst")).toBe(true);
  });

  it("flags values pinned at an extreme", () => {
    const extreme = Array.from({ length: 8 }, (_, i) => web(i % 2 === 0 ? 1 : 0, `e${i}.example`, i));
    expect(detectManipulation(extreme, NOW).some((f) => f.kind === "value_clustering")).toBe(true);
  });

  it("flags web claims with no attributable domain", () => {
    const f = detectManipulation([claim({ tier: "community_signal", value: 0.8, source: "anon" })], NOW);
    expect(f.some((x) => x.kind === "unattributed")).toBe(true);
  });

  it("reports nothing for organic spread", () => {
    const organic = [
      web(0.7, "a.example", 0),
      web(0.6, "b.example", 1),
      web(0.75, "c.example", 2),
    ];
    expect(detectManipulation(organic, NOW)).toEqual([]);
  });

  it("reduces influence rather than deleting the evidence", () => {
    const clean = aggregateEvidence([measured(0.7, 20)], { now: NOW });
    const brigaded = aggregateEvidence(
      [measured(0.7, 20), ...Array.from({ length: 10 }, (_, i) => web(0.99, "spam.example", i))],
      { now: NOW },
    );
    expect(brigaded.confidence).toBeLessThan(clean.confidence);
    expect(brigaded.manipulation.length).toBeGreaterThan(0);
    expect(brigaded.basis.some((b) => b.tier === "community_signal")).toBe(true);
  });
});

describe("conflict", () => {
  it("flags sources that disagree and lowers confidence", () => {
    const contested = aggregateEvidence(
      [measured(0.9, 20), claim({ tier: "verified_benchmark", value: 0.2, source: "bench:x" })],
      { now: NOW },
    );
    expect(contested.conflict).toBeDefined();
    expect(contested.conflict!.spread).toBeGreaterThan(0.25);

    const agreeing = aggregateEvidence([measured(0.7, 20), measured(0.72, 20)], { now: NOW });
    expect(agreeing.conflict).toBeUndefined();
    expect(agreeing.confidence).toBeGreaterThan(contested.confidence);
  });
});

describe("recency", () => {
  it("counts stale scraped signal for almost nothing", () => {
    const fresh = aggregateEvidence([web(0.9, "a.example", 0)], { now: NOW });
    const stale = aggregateEvidence(
      [claim({ tier: "community_signal", value: 0.9, domain: "a.example", source: "old", sampleSize: 1, observedAt: days(180) })],
      { now: NOW },
    );
    expect(stale.basis[0]!.effectiveWeight).toBeLessThan(fresh.basis[0]!.effectiveWeight);
  });

  it("discounts small samples", () => {
    const big = aggregateEvidence([measured(0.8, 40)], { now: NOW });
    const small = aggregateEvidence([measured(0.8, 1)], { now: NOW });
    expect(small.confidence).toBeLessThan(big.confidence);
  });
});

describe("bridge to routing", () => {
  it("produces the shape the provider pool consumes", () => {
    const scores = {
      speed: aggregateEvidence([measured(0.9, 30)], { now: NOW }),
      capability: aggregateEvidence([measured(0.7, 30)], { now: NOW }),
      reliability: aggregateEvidence([measured(0.8, 30)], { now: NOW }),
    };
    const out = toEndpointScores(scores);
    for (const k of ["speed", "capability", "reliability"] as const) {
      expect(out[k]).toBeGreaterThanOrEqual(0);
      expect(out[k]).toBeLessThanOrEqual(1);
    }
  });

  it("pulls an unmeasured subject toward the middle instead of inheriting hype", () => {
    const hyped = aggregateEvidence(
      Array.from({ length: 30 }, (_, i) => web(1, `h${i}.example`, i)),
      { now: NOW },
    );
    const out = toEndpointScores({ capability: hyped });
    expect(out.capability).toBeLessThan(0.7);
    expect(out.capability).toBeGreaterThan(0.5);
  });

  it("falls back to a neutral 0.5 with no evidence at all", () => {
    expect(toEndpointScores({})).toEqual({ speed: 0.5, capability: 0.5, reliability: 0.5 });
  });
});

describe("replayability", () => {
  it("digests identically for identical evidence", () => {
    const a = [aggregateEvidence([measured(0.7, 20)], { now: NOW })];
    const b = [aggregateEvidence([measured(0.7, 20)], { now: NOW })];
    expect(evidenceDigest(a)).toBe(evidenceDigest(b));
    expect(evidenceDigest(a)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("digests differently when the evidence changes", () => {
    const a = [aggregateEvidence([measured(0.7, 20)], { now: NOW })];
    const b = [aggregateEvidence([measured(0.3, 20)], { now: NOW })];
    expect(evidenceDigest(a)).not.toBe(evidenceDigest(b));
  });
});

describe("explanation", () => {
  it("explains an unmeasured subject in Persian", () => {
    const s = aggregateEvidence([web(0.9, "a.example", 0)], { now: NOW });
    expect(s.explanationFa).toContain("canary");
    expect(s.explanationFa).toContain("اندازه‌گیری داخلی نداریم");
  });

  it("explains a measured subject in Persian", () => {
    const s = aggregateEvidence([measured(0.8, 30)], { now: NOW });
    expect(s.explanationFa).toContain("اندازه‌گیری داخلی");
    expect(s.explanationFa).toContain("اطمینان");
  });
});
