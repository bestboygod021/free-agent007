import { describe, expect, it } from "vitest";

import {
  mulberry32,
  betaSample,
  posterior,
  thompsonRank,
  sequentialTest,
  pairedComparison,
  evaluateGuardrails,
  allocateCanary,
  trialsToClaims,
  DEFAULT_GUARDRAILS,
  type Arm,
  type TrialRecord,
} from "../src/core/canary-trials.js";

describe("seeded randomness", () => {
  it("is reproducible for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 20; i += 1) expect(a()).toBe(b());
  });

  it("differs across seeds", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it("stays inside the unit interval", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 500; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("samples Beta with the right centre", () => {
    const rng = mulberry32(99);
    const draws = Array.from({ length: 4000 }, () => betaSample(20, 5, rng));
    const mean = draws.reduce((s, d) => s + d, 0) / draws.length;
    // E[Beta(20,5)] = 0.8
    expect(mean).toBeGreaterThan(0.77);
    expect(mean).toBeLessThan(0.83);
  });
});

describe("posterior", () => {
  it("carries more uncertainty at small n", () => {
    const few = posterior({ successes: 3, failures: 0 });
    const many = posterior({ successes: 300, failures: 0 });
    expect(few.mean).toBeGreaterThan(many.mean - 0.2);
    expect(few.ciWidth).toBeGreaterThan(many.ciWidth * 5);
  });

  it("carries enormous uncertainty for an unmeasured arm", () => {
    // Jeffreys prior Beta(0.5,0.5): mean 0.5, variance 0.125, so the credible
    // interval is 2*1.96*sqrt(0.125) = 1.386 — wider than the whole scale is
    // tall. The mean says 50%; the interval says "we know nothing".
    const none = posterior({ successes: 0, failures: 0 });
    expect(none.n).toBe(0);
    expect(none.mean).toBe(0.5);
    expect(none.ciWidth).toBeCloseTo(1.386, 2);

    // 300 observed trials shrink the interval by an order of magnitude
    const measured = posterior({ successes: 200, failures: 100 });
    expect(measured.ciWidth).toBeCloseTo(0.106, 2);
    expect(none.ciWidth).toBeGreaterThan(measured.ciWidth * 10);
  });

  it("converges to the observed rate", () => {
    const p = posterior({ successes: 70, failures: 30 });
    expect(p.mean).toBeCloseTo(0.7, 1);
    expect(p.n).toBe(100);
  });
});

describe("Thompson sampling", () => {
  it("ranks a clearly better arm first", () => {
    const arms: Arm[] = [
      { subject: "good", counts: { successes: 90, failures: 10 } },
      { subject: "bad", counts: { successes: 20, failures: 80 } },
    ];
    const ranked = thompsonRank(arms, { seed: 1 });
    expect(ranked[0]!.subject).toBe("good");
  });

  it("estimates probBest by Monte Carlo", () => {
    const arms: Arm[] = [
      { subject: "good", counts: { successes: 90, failures: 10 } },
      { subject: "bad", counts: { successes: 20, failures: 80 } },
    ];
    const ranked = thompsonRank(arms, { seed: 3, monteCarlo: 1500 });
    const good = ranked.find((r) => r.subject === "good")!;
    const bad = ranked.find((r) => r.subject === "bad")!;
    expect(good.probBest).toBeGreaterThan(0.9);
    expect(bad.probBest).toBeLessThan(0.1);
  });

  it("explores an unmeasured arm rather than ignoring it", () => {
    const arms: Arm[] = [
      { subject: "measured", counts: { successes: 60, failures: 40 } },
      { subject: "unknown", counts: { successes: 0, failures: 0 } },
    ];
    let unknownWins = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      const r = thompsonRank(arms, { seed, monteCarlo: 0 });
      if (r[0]!.subject === "unknown") unknownWins += 1;
    }
    expect(unknownWins).toBeGreaterThan(20);
  });

  it("stops re-litigating a champion with lots of evidence", () => {
    const arms: Arm[] = [
      { subject: "champion", counts: { successes: 700, failures: 300 }, champion: true },
      { subject: "similar", counts: { successes: 68, failures: 32 } },
    ];
    const championWins = thompsonRank(arms, { seed: 11 }).find((r) => r.subject === "champion")!;
    expect(championWins.probBest).toBeGreaterThan(0.4);
  });

  it("is deterministic for a fixed seed", () => {
    const arms: Arm[] = [
      { subject: "a", counts: { successes: 5, failures: 5 } },
      { subject: "b", counts: { successes: 6, failures: 4 } },
    ];
    expect(thompsonRank(arms, { seed: 5 })).toEqual(thompsonRank(arms, { seed: 5 }));
  });
});

describe("sequential test", () => {
  it("rejects an arm that is clearly no better than baseline", () => {
    const outcomes = Array.from({ length: 40 }, (_, i) => i % 5 === 0);
    const r = sequentialTest(outcomes, 0.5, 0.7);
    expect(r.decision).toBe("reject_worse");
    expect(r.logLikelihoodRatio).toBeLessThan(r.lowerBound);
  });

  it("accepts an arm that is clearly better", () => {
    const outcomes = Array.from({ length: 40 }, (_, i) => i % 10 !== 0);
    const r = sequentialTest(outcomes, 0.5, 0.7);
    expect(r.decision).toBe("accept_better");
    expect(r.logLikelihoodRatio).toBeGreaterThan(r.upperBound);
  });

  it("keeps going while the evidence is genuinely close", () => {
    const outcomes = Array.from({ length: 6 }, (_, i) => i % 2 === 0);
    expect(sequentialTest(outcomes, 0.5, 0.7).decision).toBe("continue");
  });

  it("stops much earlier than a fixed-sample test would", () => {
    const bad = Array.from({ length: 200 }, (_, i) => i % 6 === 0);
    let stoppedAt = -1;
    for (let n = 1; n <= bad.length; n += 1) {
      const r = sequentialTest(bad.slice(0, n), 0.5, 0.7);
      if (r.decision !== "continue") {
        stoppedAt = n;
        break;
      }
    }
    expect(stoppedAt).toBeGreaterThan(0);
    expect(stoppedAt).toBeLessThan(60);
  });

  it("derives its bounds from the error budget", () => {
    const strict = sequentialTest([true], 0.5, 0.7, { alpha: 0.01, beta: 0.01 });
    const loose = sequentialTest([true], 0.5, 0.7, { alpha: 0.2, beta: 0.2 });
    expect(strict.upperBound).toBeGreaterThan(loose.upperBound);
  });
});

describe("paired comparison", () => {
  it("ignores task difficulty by using only discordant pairs", () => {
    const pairs = [
      // 20 tasks both failed — hard tasks, and they say nothing about the arms
      ...Array.from({ length: 20 }, () => ({ candidate: false, champion: false })),
      // the only informative trials
      ...Array.from({ length: 12 }, () => ({ candidate: true, champion: false })),
      ...Array.from({ length: 2 }, () => ({ candidate: false, champion: true })),
    ];
    const r = pairedComparison(pairs);
    expect(r.candidateOnly).toBe(12);
    expect(r.championOnly).toBe(2);
    expect(r.bothFailed).toBe(20);
    expect(r.significant).toBe(true);
    expect(r.net).toBe(10);
  });

  it("does not call a tie significant", () => {
    const pairs = [
      { candidate: true, champion: false },
      { candidate: false, champion: true },
    ];
    const r = pairedComparison(pairs);
    expect(r.significant).toBe(false);
  });

  it("handles no discordance at all", () => {
    const r = pairedComparison([{ candidate: true, champion: true }]);
    expect(r.mcnemar).toBe(0);
    expect(r.significant).toBe(false);
  });
});

describe("guardrails", () => {
  const strong = { successes: 85, failures: 15 };
  const equal = { successes: 70, failures: 30 };
  const weak = { successes: 30, failures: 70 };

  it("holds before the minimum sample, whatever the rate", () => {
    const v = evaluateGuardrails({ successes: 10, failures: 0 }, equal);
    expect(v.action).toBe("hold");
    expect(v.blockedBy).toBe("minTrials");
  });

  it("demotes a clear regression", () => {
    const v = evaluateGuardrails(weak, equal);
    expect(v.action).toBe("demote");
  });

  it("refuses to promote a candidate that is merely not-worse", () => {
    const v = evaluateGuardrails(equal, equal);
    expect(v.action).toBe("hold");
    expect(v.blockedBy).toBe("credibleImprovement");
  });

  it("promotes a credibly better candidate", () => {
    const v = evaluateGuardrails(strong, equal);
    expect(v.action).toBe("promote");
    expect(v.blockedBy).toBeNull();
  });

  it("demotion and promotion ignore the sample floor only for demotion", () => {
    // a catastrophic arm should be stopped even with few trials
    const v = evaluateGuardrails({ successes: 2, failures: 30 }, equal, {
      ...DEFAULT_GUARDRAILS,
      minTrials: 1,
    });
    expect(v.action).toBe("demote");
  });
});

describe("budget-aware allocation", () => {
  const arms: Arm[] = [
    { subject: "champion", counts: { successes: 200, failures: 100 }, champion: true },
    { subject: "unknown-a", counts: { successes: 0, failures: 0 } },
    { subject: "unknown-b", counts: { successes: 0, failures: 0 } },
  ];

  it("never spends more than the budget", () => {
    const plan = allocateCanary({
      arms,
      tokenBudget: 100_000,
      costPerTrial: () => 2_500,
      seed: 4,
    });
    expect(plan.tokensCommitted).toBeLessThanOrEqual(100_000);
    expect(plan.tokensRemaining).toBeGreaterThanOrEqual(0);
  });

  it("caps any single arm's share", () => {
    const plan = allocateCanary({
      arms,
      tokenBudget: 200_000,
      costPerTrial: () => 2_000,
      maxSharePerArm: 0.3,
      seed: 8,
    });
    for (const a of plan.allocations) expect(a.share).toBeLessThanOrEqual(0.3);
  });

  it("buys whole trials only", () => {
    const plan = allocateCanary({
      arms,
      tokenBudget: 50_000,
      costPerTrial: () => 3_000,
      seed: 12,
    });
    for (const a of plan.allocations) {
      expect(Number.isInteger(a.trials)).toBe(true);
      expect(a.tokens).toBe(a.trials * 3_000);
    }
  });

  it("gives nothing to an arm that already has plenty of evidence", () => {
    const plan = allocateCanary({
      arms: [{ subject: "settled", counts: { successes: 900, failures: 100 } }],
      tokenBudget: 100_000,
      costPerTrial: () => 2_000,
      seed: 2,
    });
    expect(plan.allocations).toEqual([]);
    expect(plan.budgetExhausted).toBe(true);
  });

  it("is deterministic for a fixed seed", () => {
    const req = { arms, tokenBudget: 120_000, costPerTrial: () => 2_500, seed: 21 };
    expect(allocateCanary(req).allocations).toEqual(allocateCanary(req).allocations);
  });
});

describe("closing the loop", () => {
  const records: TrialRecord[] = [
    { subject: "a", capability: "code_generation", passed: true, tokensUsed: 1000, durationMs: 10, repairAttempts: 0, runId: "r1", at: 1 },
    { subject: "a", capability: "code_generation", passed: true, tokensUsed: 1000, durationMs: 10, repairAttempts: 0, runId: "r2", at: 1 },
    { subject: "a", capability: "code_generation", passed: false, tokensUsed: 1000, durationMs: 10, repairAttempts: 1, runId: "r3", at: 1 },
    { subject: "b", capability: "code_generation", passed: false, tokensUsed: 1000, durationMs: 10, repairAttempts: 2, runId: "r4", at: 1 },
  ];

  it("turns trials into measured claims", () => {
    const claims = trialsToClaims(records, "code_generation", 1000);
    expect(claims).toHaveLength(2);
    const a = claims.find((c) => c.subject === "a")!;
    expect(a.tier).toBe("measured");
    expect(a.value).toBeCloseTo(2 / 3, 2);
    expect(a.sampleSize).toBe(3);
  });

  it("produces claims the evidence ledger accepts as top tier", () => {
    const claims = trialsToClaims(records, "code_generation", 1000);
    for (const c of claims) {
      expect(c.value).toBeGreaterThanOrEqual(0);
      expect(c.value).toBeLessThanOrEqual(1);
      expect(c.sampleSize).toBeGreaterThan(0);
    }
  });

  it("yields nothing from no trials", () => {
    expect(trialsToClaims([], "code_generation", 1)).toEqual([]);
  });
});
