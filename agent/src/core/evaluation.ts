/** Deterministic evaluation and regression-gate primitives. */

export interface EvaluationCase {
  caseId: string;
  promptHash: string;
  expectedSignals: string[];
  forbiddenSignals: string[];
  weight: number;
  required: boolean;
}

export interface EvaluationObservation {
  caseId: string;
  outputHash: string;
  observedSignals: string[];
  invariantPass: boolean;
  latencyMs: number;
  cost: number;
}

export interface EvaluationScore {
  caseId: string;
  score: number;
  invariantPass: boolean;
  reasons: string[];
}

export interface EvaluationGate {
  minimumWeightedScore: number;
  minimumRequiredPassRate: number;
  maximumRegression: number;
  maxCost: number;
  maxLatencyMs: number;
}

export interface EvaluationReport {
  suiteId: string;
  scores: EvaluationScore[];
  weightedScore: number;
  requiredPassRate: number;
  totalCost: number;
  p95LatencyMs: number;
  regression?: number;
  passed: boolean;
  reasons: string[];
  reportHash: string;
}

export class EvaluationContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function validateCase(testCase: EvaluationCase): void {
  if (!testCase.caseId.trim() || !testCase.promptHash.trim()) throw new EvaluationContractError("case identity is required");
  if (!Number.isFinite(testCase.weight) || testCase.weight <= 0) throw new EvaluationContractError("case weight must be positive");
}

function validateObservation(observation: EvaluationObservation): void {
  if (!observation.caseId.trim() || !observation.outputHash.trim()) throw new EvaluationContractError("observation identity is required");
  if (!Number.isFinite(observation.latencyMs) || observation.latencyMs < 0) throw new EvaluationContractError("latency must be non-negative");
  if (!Number.isFinite(observation.cost) || observation.cost < 0) throw new EvaluationContractError("cost must be non-negative");
}

export function scoreCase(testCase: EvaluationCase, observation: EvaluationObservation): EvaluationScore {
  validateCase(testCase);
  validateObservation(observation);
  if (testCase.caseId !== observation.caseId) throw new EvaluationContractError("case and observation do not match");
  const observed = new Set(observation.observedSignals);
  const reasons: string[] = [];
  const expected = testCase.expectedSignals.filter((signal) => observed.has(signal)).length;
  const forbidden = testCase.forbiddenSignals.filter((signal) => observed.has(signal));
  const expectedScore = testCase.expectedSignals.length === 0 ? 1 : expected / testCase.expectedSignals.length;
  const score = forbidden.length > 0 || !observation.invariantPass ? 0 : expectedScore;
  if (forbidden.length > 0) reasons.push(`forbidden signals: ${forbidden.join(", ")}`);
  if (!observation.invariantPass) reasons.push("invariant gate failed");
  if (expectedScore < 1) reasons.push(`missing expected signals: ${testCase.expectedSignals.filter((s) => !observed.has(s)).join(", ")}`);
  return { caseId: testCase.caseId, score, invariantPass: observation.invariantPass, reasons };
}

function percentile95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

export function runEvaluation(
  suiteId: string,
  cases: readonly EvaluationCase[],
  observations: readonly EvaluationObservation[],
  gate: EvaluationGate,
  baselineWeightedScore?: number,
): EvaluationReport {
  if (!suiteId.trim() || cases.length === 0) throw new EvaluationContractError("suite and cases are required");
  if (!Number.isFinite(gate.minimumWeightedScore) || gate.minimumWeightedScore < 0 || gate.minimumWeightedScore > 1 ||
      !Number.isFinite(gate.minimumRequiredPassRate) || gate.minimumRequiredPassRate < 0 || gate.minimumRequiredPassRate > 1 ||
      !Number.isFinite(gate.maximumRegression) || gate.maximumRegression < 0 || !Number.isFinite(gate.maxCost) || gate.maxCost < 0 ||
      !Number.isFinite(gate.maxLatencyMs) || gate.maxLatencyMs < 0) {
    throw new EvaluationContractError("invalid evaluation gate");
  }
  const caseIds = new Set<string>();
  for (const testCase of cases) {
    validateCase(testCase);
    if (caseIds.has(testCase.caseId)) throw new EvaluationContractError(`duplicate case: ${testCase.caseId}`);
    caseIds.add(testCase.caseId);
  }
  const byId = new Map(observations.map((observation) => [observation.caseId, observation]));
  if (byId.size !== observations.length) throw new EvaluationContractError("duplicate observation");
  const scores = cases.map((testCase) => {
    const observation = byId.get(testCase.caseId);
    if (!observation) return { caseId: testCase.caseId, score: 0, invariantPass: false, reasons: ["missing observation"] };
    return scoreCase(testCase, observation);
  });
  const totalWeight = cases.reduce((sum, testCase) => sum + testCase.weight, 0);
  const weightedScore = cases.reduce((sum, testCase, index) => sum + (scores[index]?.score ?? 0) * testCase.weight, 0) / totalWeight;
  const required = cases.filter((testCase) => testCase.required);
  const requiredPassRate = required.length === 0 ? 1 : required.filter((testCase) => scores.find((score) => score.caseId === testCase.caseId)?.score === 1).length / required.length;
  const relevant = observations.filter((observation) => byId.has(observation.caseId));
  const totalCost = relevant.reduce((sum, observation) => sum + observation.cost, 0);
  const p95LatencyMs = percentile95(relevant.map((observation) => observation.latencyMs));
  const regression = baselineWeightedScore === undefined ? 0 : baselineWeightedScore - weightedScore;
  const reasons: string[] = [];
  if (weightedScore < gate.minimumWeightedScore) reasons.push(`weighted score ${weightedScore} below ${gate.minimumWeightedScore}`);
  if (requiredPassRate < gate.minimumRequiredPassRate) reasons.push(`required pass rate ${requiredPassRate} below ${gate.minimumRequiredPassRate}`);
  if (regression > gate.maximumRegression) reasons.push(`regression ${regression} exceeds ${gate.maximumRegression}`);
  if (totalCost > gate.maxCost) reasons.push(`cost ${totalCost} exceeds ${gate.maxCost}`);
  if (p95LatencyMs > gate.maxLatencyMs) reasons.push(`p95 latency ${p95LatencyMs} exceeds ${gate.maxLatencyMs}`);
  const reportBody = { suiteId, scores, weightedScore, requiredPassRate, totalCost, p95LatencyMs, regression };
  return { ...reportBody, passed: reasons.length === 0, reasons, reportHash: hash(JSON.stringify(reportBody)) };
}
