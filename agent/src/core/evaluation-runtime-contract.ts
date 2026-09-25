/**
 * M35 contracts for reproducible evaluation, benchmark planning and feedback.
 *
 * Dataset content remains outside this kernel. Only hashes, provenance and
 * measured summaries cross the boundary, so a passing decision never implies
 * that an external evaluator or CI runner actually ran.
 */

export type EvaluationSplit = "train" | "validation" | "test" | "holdout";
export type EvaluationRunner = "local" | "sandbox" | "ci";

export interface BenchmarkEvaluationCase {
  caseId: string;
  datasetId: string;
  split: EvaluationSplit;
  promptVersion: string;
  inputHash: string;
  expectedOutputHash: string;
  provenanceHash: string;
  markedTrainingData: boolean;
}

export interface EvaluationCaseDecision {
  accepted: boolean;
  reasons: string[];
  caseHash: string;
}

export interface BenchmarkPlan {
  runId: string;
  organizationId: string;
  datasetId: string;
  caseIds: string[];
  runner: EvaluationRunner;
  environmentDigest: string;
  seed: number;
  budgetAllowed: boolean;
}

export interface BenchmarkDecision {
  allowed: boolean;
  reasons: string[];
  deterministicSeed: number;
  planHash: string;
}

export interface BenchmarkEvaluationObservation {
  caseId: string;
  passed: boolean;
  qualityScore: number;
  latencyMs: number;
  cost: number;
  outputHash: string;
  evidenceHash: string;
}

export interface EvaluationAggregate {
  count: number;
  passRate: number;
  meanQuality: number;
  p95LatencyMs: number;
  totalCost: number;
  aggregateHash: string;
}

export interface RegressionBaseline {
  passRate: number;
  meanQuality: number;
  p95LatencyMs: number;
  maxCost: number;
}

export interface EvaluationRegressionDecision {
  allowed: boolean;
  reasons: string[];
  requiresHumanReview: boolean;
  decisionHash: string;
}

export interface HumanEvaluationFeedback {
  organizationId: string;
  caseId: string;
  evaluatorId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  correctionHash?: string;
  feedbackHash: string;
}

export class EvaluationRuntimeContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationRuntimeContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new EvaluationRuntimeContractError(`${label} is required`);
}

export function validateEvaluationCase(item: BenchmarkEvaluationCase): EvaluationCaseDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[item.caseId, "caseId"], [item.datasetId, "datasetId"], [item.promptVersion, "promptVersion"], [item.inputHash, "inputHash"], [item.expectedOutputHash, "expectedOutputHash"], [item.provenanceHash, "provenanceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (item.split === "test" && item.markedTrainingData) reasons.push("test case cannot be marked as training data");
  if (item.split === "holdout" && item.markedTrainingData) reasons.push("holdout case cannot be training data");
  return { accepted: reasons.length === 0, reasons, caseHash: hash(JSON.stringify({ item, reasons })) };
}

export function planBenchmarkRun(plan: BenchmarkPlan): BenchmarkDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[plan.runId, "runId"], [plan.organizationId, "organizationId"], [plan.datasetId, "datasetId"], [plan.environmentDigest, "environmentDigest"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (plan.caseIds.length === 0 || new Set(plan.caseIds).size !== plan.caseIds.length) reasons.push("benchmark case ids must be non-empty and unique");
  if (!Number.isSafeInteger(plan.seed) || plan.seed < 0) reasons.push("benchmark seed must be a non-negative safe integer");
  if (!plan.budgetAllowed) reasons.push("benchmark budget gate denied execution");
  return { allowed: reasons.length === 0, reasons, deterministicSeed: plan.seed, planHash: hash(JSON.stringify({ plan, reasons })) };
}

export function aggregateEvaluation(observations: readonly BenchmarkEvaluationObservation[]): EvaluationAggregate {
  if (observations.length === 0) throw new EvaluationRuntimeContractError("at least one evaluation observation is required");
  for (const item of observations) {
    required(item.caseId, "caseId");
    required(item.outputHash, "outputHash");
    required(item.evidenceHash, "evidenceHash");
    if (!Number.isFinite(item.qualityScore) || item.qualityScore < 0 || item.qualityScore > 1 || !Number.isFinite(item.latencyMs) || item.latencyMs < 0 || !Number.isFinite(item.cost) || item.cost < 0) throw new EvaluationRuntimeContractError("evaluation observation is invalid");
  }
  const latencies = observations.map((item) => item.latencyMs).sort((a, b) => a - b);
  const p95Index = Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1);
  const passRate = observations.filter((item) => item.passed).length / observations.length;
  const meanQuality = observations.reduce((sum, item) => sum + item.qualityScore, 0) / observations.length;
  const totalCost = observations.reduce((sum, item) => sum + item.cost, 0);
  const p95LatencyMs = latencies[p95Index] ?? 0;
  return { count: observations.length, passRate: Number(passRate.toFixed(6)), meanQuality: Number(meanQuality.toFixed(6)), p95LatencyMs, totalCost: Number(totalCost.toFixed(6)), aggregateHash: hash(JSON.stringify(observations)) };
}

export function decideRegressionGate(current: EvaluationAggregate, baseline: RegressionBaseline, maxQualityDrop = 0.02, maxPassRateDrop = 0.02, maxLatencyIncrease = 0.2): EvaluationRegressionDecision {
  const reasons: string[] = [];
  if (current.meanQuality < baseline.meanQuality - maxQualityDrop) reasons.push("mean quality regressed");
  if (current.passRate < baseline.passRate - maxPassRateDrop) reasons.push("pass rate regressed");
  if (current.p95LatencyMs > baseline.p95LatencyMs * (1 + maxLatencyIncrease)) reasons.push("p95 latency regressed");
  if (current.totalCost > baseline.maxCost) reasons.push("evaluation cost exceeded budget");
  return { allowed: reasons.length === 0, reasons, requiresHumanReview: reasons.length > 0, decisionHash: hash(JSON.stringify({ current, baseline, maxQualityDrop, maxPassRateDrop, maxLatencyIncrease, reasons })) };
}

export function validateHumanFeedback(feedback: HumanEvaluationFeedback): EvaluationCaseDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[feedback.organizationId, "organizationId"], [feedback.caseId, "caseId"], [feedback.evaluatorId, "evaluatorId"], [feedback.feedbackHash, "feedbackHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (feedback.correctionHash !== undefined && !feedback.correctionHash.trim()) reasons.push("correction hash cannot be empty");
  return { accepted: reasons.length === 0, reasons, caseHash: hash(JSON.stringify({ ...feedback, reasons })) };
}
