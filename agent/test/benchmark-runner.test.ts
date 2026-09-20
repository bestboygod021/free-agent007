import { describe, expect, it } from "vitest";

import {
  benchmarkRequestFingerprint,
  runBenchmarkTrial,
  scoreBenchmarkResult,
  summarizeBenchmarkTrials,
  trialsToCapabilityClaims,
  validateBenchmarkSuite,
  type BenchmarkCase,
  type BenchmarkRequest,
  type BenchmarkSuite,
} from "../src/core/benchmark-runner.js";

const benchmarkCase: BenchmarkCase = {
  caseId: "case-001",
  taskType: "code_edit",
  repositoryId: "fixture-typescript",
  commitSha: "0123456789abcdef",
  objective: "fix the parser bug",
  acceptanceCriteria: ["all tests pass"],
  maxDurationMs: 1_000,
  evaluationPermission: true,
};

const suite: BenchmarkSuite = {
  suiteId: "forgepilot-reference",
  version: "1.0.0",
  cases: [benchmarkCase],
  source: "owned fixture",
  license: "MIT",
};

function request(subject = "local/test-model"): BenchmarkRequest {
  return {
    trialId: `trial-${subject}`,
    suiteId: suite.suiteId,
    suiteVersion: suite.version,
    benchmarkCase,
    candidate: { subject, provider: "local", model: "test-model", modelVersion: "1" },
    seed: 7,
    budget: { maxCost: 1, currency: "USD" },
  };
}

describe("reference benchmark contracts", () => {
  it("accepts a permissioned, pinned suite", () => {
    expect(validateBenchmarkSuite(suite)).toEqual([]);
  });

  it("rejects duplicate cases, missing permission and unpinned commits", () => {
    const errors = validateBenchmarkSuite({
      ...suite,
      cases: [
        { ...benchmarkCase, commitSha: "main", evaluationPermission: false },
        { ...benchmarkCase, commitSha: "main", evaluationPermission: false },
      ],
    });
    expect(errors).toEqual(expect.arrayContaining([
      "duplicate caseId: case-001",
      "case-001: commitSha is not a valid hexadecimal commit",
      "case-001: evaluation permission is required",
    ]));
  });

  it("scores only measured execution output", () => {
    expect(scoreBenchmarkResult({
      outcome: "passed",
      acceptancePassed: true,
      tests: { passed: 4, failed: 0, skipped: 0 },
      changedFiles: ["src/parser.ts"],
      durationMs: 250,
      cost: 0.1,
      currency: "USD",
      redactedSummary: "tests passed",
    }, 1_000)).toEqual({
      correctness: 1,
      testPassRate: 1,
      efficiency: 0.75,
      composite: 0.975,
    });
  });

  it("runs through an injected trusted executor and produces measured evidence", async () => {
    const trial = await runBenchmarkTrial(request(), {
      async execute(input) {
        expect(input.seed).toBe(7);
        return {
          outcome: "passed",
          acceptancePassed: true,
          tests: { passed: 3, failed: 0, skipped: 0 },
          changedFiles: ["src/parser.ts"],
          patchHash: "patch-hash",
          durationMs: 400,
          cost: 0.2,
          currency: "USD",
          redactedSummary: "3 tests passed",
        };
      },
    }, 1_700_000_000_000);

    expect(trial.score.correctness).toBe(1);
    expect(trial.measuredAt).toBe(1_700_000_000_000);
    expect(trialsToCapabilityClaims([trial])[0]).toMatchObject({
      tier: "measured",
      sampleSize: 1,
      source: "benchmark:forgepilot-reference@1.0.0/case-001/trial-local/test-model",
    });
  });

  it("rejects an executor that claims success while tests fail or exceeds budget", async () => {
    await expect(runBenchmarkTrial(request(), {
      async execute() {
        return {
          outcome: "passed",
          acceptancePassed: true,
          tests: { passed: 1, failed: 1, skipped: 0 },
          changedFiles: [],
          durationMs: 100,
          cost: 0.1,
          currency: "USD",
          redactedSummary: "invalid",
        };
      },
    })).rejects.toThrow("passed outcome requires");

    await expect(runBenchmarkTrial(request(), {
      async execute() {
        return {
          outcome: "failed",
          acceptancePassed: false,
          tests: { passed: 0, failed: 1, skipped: 0 },
          changedFiles: [],
          durationMs: 100,
          cost: 2,
          currency: "USD",
          redactedSummary: "over budget",
        };
      },
    })).rejects.toThrow("exceeded the trial budget");
  });

  it("summarizes candidates and fingerprints requests stably", async () => {
    const passed = await runBenchmarkTrial(request(), {
      async execute() {
        return {
          outcome: "passed", acceptancePassed: true,
          tests: { passed: 1, failed: 0, skipped: 0 }, changedFiles: [],
          durationMs: 100, cost: 0.1, currency: "USD", redactedSummary: "ok",
        };
      },
    });
    const failed = await runBenchmarkTrial(request("other/model"), {
      async execute() {
        return {
          outcome: "failed", acceptancePassed: false,
          tests: { passed: 0, failed: 1, skipped: 0 }, changedFiles: [],
          durationMs: 100, cost: 0.1, currency: "USD", redactedSummary: "failed",
        };
      },
    });
    const summaries = summarizeBenchmarkTrials([passed, failed]);
    expect(summaries.map((item) => item.subject)).toEqual(["local/test-model", "other/model"]);
    expect(benchmarkRequestFingerprint(request())).toBe(benchmarkRequestFingerprint(request()));
    expect(benchmarkRequestFingerprint(request())).not.toBe(benchmarkRequestFingerprint(request("other/model")));
  });
});
