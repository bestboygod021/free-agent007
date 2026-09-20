/**
 * Reference benchmark orchestration.
 *
 * This module deliberately does not execute arbitrary repository code. An
 * Executor supplied by the trusted sandbox/worker plane performs the run and
 * returns a measured result. The core validates that result, scores it, and
 * turns it into first-party evidence. This separation prevents a benchmark
 * adapter from silently becoming an unconfined shell.
 */

import { createHash } from "node:crypto";
import type { ModelTaskType } from "./types.js";
import type { CapabilityClaim } from "./capability-evidence.js";

export type BenchmarkOutcome = "passed" | "failed" | "timeout" | "error" | "blocked";

export interface BenchmarkCase {
  caseId: string;
  taskType: ModelTaskType;
  repositoryId: string;
  commitSha: string;
  objective: string;
  acceptanceCriteria: string[];
  /** hard ceiling enforced by the worker, not merely displayed in the UI */
  maxDurationMs: number;
  /** true when the repository and issue have a licence permitting evaluation */
  evaluationPermission: boolean;
}

export interface BenchmarkSuite {
  suiteId: string;
  version: string;
  cases: BenchmarkCase[];
  /** the suite itself must be reproducible and permissioned */
  source: string;
  license: string;
}

export interface BenchmarkCandidate {
  subject: string;
  provider: string;
  model: string;
  modelVersion: string;
}

export interface BenchmarkRequest {
  trialId: string;
  suiteId: string;
  suiteVersion: string;
  benchmarkCase: BenchmarkCase;
  candidate: BenchmarkCandidate;
  seed: number;
  /** the worker receives this as a hard budget */
  budget: { maxCost: number; currency: string };
}

export interface BenchmarkExecutionResult {
  outcome: BenchmarkOutcome;
  acceptancePassed: boolean;
  tests: { passed: number; failed: number; skipped: number };
  changedFiles: string[];
  patchHash?: string;
  durationMs: number;
  cost: number;
  currency: string;
  /** already redacted by the worker; raw secrets must never reach this type */
  redactedSummary: string;
}

export interface BenchmarkExecutor {
  execute(request: BenchmarkRequest): Promise<BenchmarkExecutionResult>;
}

export interface BenchmarkTrial {
  trialId: string;
  suiteId: string;
  suiteVersion: string;
  caseId: string;
  candidate: BenchmarkCandidate;
  seed: number;
  measuredAt: number;
  result: BenchmarkExecutionResult;
  score: BenchmarkScore;
}

export interface BenchmarkScore {
  correctness: number;
  testPassRate: number;
  efficiency: number;
  composite: number;
}

export interface CandidateBenchmarkSummary {
  subject: string;
  trials: number;
  passed: number;
  failed: number;
  meanScore: number;
  passRate: number;
  totalCost: number;
  currency: string;
}

export class BenchmarkContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BenchmarkContractError";
  }
}

function finiteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new BenchmarkContractError(`${label} must be a finite non-negative number`);
  }
}

function requiredText(value: string, label: string): void {
  if (value.trim().length === 0) throw new BenchmarkContractError(`${label} must not be empty`);
}

/** Validate a suite before it can consume any provider or worker budget. */
export function validateBenchmarkSuite(suite: BenchmarkSuite): string[] {
  const errors: string[] = [];
  if (!suite.suiteId.trim()) errors.push("suiteId is empty");
  if (!suite.version.trim()) errors.push("version is empty");
  if (!suite.source.trim()) errors.push("source is empty");
  if (!suite.license.trim()) errors.push("license is empty");
  if (suite.cases.length === 0) errors.push("suite must contain at least one case");

  const seen = new Set<string>();
  for (const item of suite.cases) {
    if (seen.has(item.caseId)) errors.push(`duplicate caseId: ${item.caseId}`);
    seen.add(item.caseId);
    if (!item.caseId.trim()) errors.push("caseId is empty");
    if (!item.repositoryId.trim()) errors.push(`${item.caseId}: repositoryId is empty`);
    if (!/^[0-9a-f]{7,64}$/i.test(item.commitSha)) {
      errors.push(`${item.caseId}: commitSha is not a valid hexadecimal commit`);
    }
    if (!item.objective.trim()) errors.push(`${item.caseId}: objective is empty`);
    if (item.acceptanceCriteria.length === 0) {
      errors.push(`${item.caseId}: acceptanceCriteria is empty`);
    }
    if (!Number.isInteger(item.maxDurationMs) || item.maxDurationMs <= 0) {
      errors.push(`${item.caseId}: maxDurationMs must be a positive integer`);
    }
    if (!item.evaluationPermission) {
      errors.push(`${item.caseId}: evaluation permission is required`);
    }
  }
  return errors;
}

function validateExecution(result: BenchmarkExecutionResult, request: BenchmarkRequest): void {
  if (!Object.values<BenchmarkOutcome>(["passed", "failed", "timeout", "error", "blocked"]).includes(result.outcome)) {
    throw new BenchmarkContractError(`unknown benchmark outcome: ${result.outcome}`);
  }
  for (const [name, value] of Object.entries(result.tests)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new BenchmarkContractError(`tests.${name} must be a non-negative integer`);
    }
  }
  finiteNonNegative(result.durationMs, "durationMs");
  finiteNonNegative(result.cost, "cost");
  requiredText(result.currency, "currency");
  requiredText(result.redactedSummary, "redactedSummary");
  if (result.changedFiles.some((file) => file.trim().length === 0)) {
    throw new BenchmarkContractError("changedFiles cannot contain empty paths");
  }
  if (result.outcome === "passed" && (!result.acceptancePassed || result.tests.failed > 0)) {
    throw new BenchmarkContractError("passed outcome requires acceptancePassed and zero failed tests");
  }
  if (result.durationMs > request.benchmarkCase.maxDurationMs && result.outcome !== "timeout") {
    throw new BenchmarkContractError("result exceeded the case duration without timeout outcome");
  }
  if (result.cost > request.budget.maxCost) {
    throw new BenchmarkContractError("result exceeded the trial budget");
  }
  if (result.currency !== request.budget.currency) {
    throw new BenchmarkContractError("result currency differs from trial budget currency");
  }
}

/** Score a measured result; no model opinion or simulated skill is involved. */
export function scoreBenchmarkResult(
  result: BenchmarkExecutionResult,
  maxDurationMs: number,
): BenchmarkScore {
  const totalTests = result.tests.passed + result.tests.failed + result.tests.skipped;
  const testPassRate = totalTests === 0 ? (result.acceptancePassed ? 1 : 0) : result.tests.passed / totalTests;
  const correctness = result.acceptancePassed && result.tests.failed === 0 && result.outcome === "passed" ? 1 : 0;
  const efficiency = Math.max(0, Math.min(1, 1 - result.durationMs / maxDurationMs));
  return {
    correctness,
    testPassRate: round4(testPassRate),
    efficiency: round4(efficiency),
    composite: round4(correctness * 0.6 + testPassRate * 0.3 + efficiency * 0.1),
  };
}

/** Execute one case through a trusted worker and record the measured result. */
export async function runBenchmarkTrial(
  request: BenchmarkRequest,
  executor: BenchmarkExecutor,
  measuredAt = Date.now(),
): Promise<BenchmarkTrial> {
  if (request.suiteId !== request.suiteId.trim() || !request.suiteId) {
    throw new BenchmarkContractError("suiteId is empty");
  }
  if (!Number.isInteger(request.seed)) throw new BenchmarkContractError("seed must be an integer");
  finiteNonNegative(request.budget.maxCost, "budget.maxCost");
  if (!request.budget.currency.trim()) throw new BenchmarkContractError("budget.currency is empty");
  const suiteErrors = validateBenchmarkSuite({
    suiteId: request.suiteId,
    version: request.suiteVersion,
    cases: [request.benchmarkCase],
    source: "request",
    license: "request",
  });
  if (suiteErrors.some((error) => error.includes("evaluation permission") || error.includes("commitSha"))) {
    throw new BenchmarkContractError(suiteErrors.join("; "));
  }
  const result = await executor.execute(request);
  validateExecution(result, request);
  return {
    trialId: request.trialId,
    suiteId: request.suiteId,
    suiteVersion: request.suiteVersion,
    caseId: request.benchmarkCase.caseId,
    candidate: request.candidate,
    seed: request.seed,
    measuredAt,
    result,
    score: scoreBenchmarkResult(result, request.benchmarkCase.maxDurationMs),
  };
}

export function summarizeBenchmarkTrials(trials: readonly BenchmarkTrial[]): CandidateBenchmarkSummary[] {
  const bySubject = new Map<string, BenchmarkTrial[]>();
  for (const trial of trials) {
    const rows = bySubject.get(trial.candidate.subject) ?? [];
    rows.push(trial);
    bySubject.set(trial.candidate.subject, rows);
  }
  return [...bySubject.entries()]
    .map(([subject, rows]) => ({
      subject,
      trials: rows.length,
      passed: rows.filter((row) => row.result.outcome === "passed").length,
      failed: rows.filter((row) => row.result.outcome !== "passed").length,
      meanScore: round4(rows.reduce((sum, row) => sum + row.score.composite, 0) / rows.length),
      passRate: round4(rows.filter((row) => row.result.outcome === "passed").length / rows.length),
      totalCost: round4(rows.reduce((sum, row) => sum + row.result.cost, 0)),
      currency: rows[0]?.result.currency ?? "USD",
    }))
    .sort((a, b) => b.meanScore - a.meanScore || a.subject.localeCompare(b.subject));
}

/** Convert only a measured trial set into the existing evidence ledger format. */
export function trialsToCapabilityClaims(
  trials: readonly BenchmarkTrial[],
): CapabilityClaim[] {
  return trials.map((trial) => ({
    subject: trial.candidate.subject,
    capability: `benchmark:${trial.candidate.model}`,
    tier: "measured",
    value: trial.score.composite,
    sampleSize: 1,
    observedAt: trial.measuredAt,
    source: `benchmark:${trial.suiteId}@${trial.suiteVersion}/${trial.caseId}/${trial.trialId}`,
  }));
}

/** Stable fingerprint for a benchmark request, useful for idempotency. */
export function benchmarkRequestFingerprint(request: BenchmarkRequest): string {
  return createHash("sha256")
    .update(JSON.stringify({
      trialId: request.trialId,
      suiteId: request.suiteId,
      suiteVersion: request.suiteVersion,
      caseId: request.benchmarkCase.caseId,
      candidate: request.candidate,
      seed: request.seed,
      budget: request.budget,
    }))
    .digest("hex")
    .slice(0, 32);
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
