/** Benchmark provenance, deterministic replay and regression-integrity contracts. No model runner is included. */

export interface IntegrityBenchmarkCase {
  caseId: string;
  fixtureHash: string;
  promptHash: string;
  expectedArtifactHash: string;
  source: "owned" | "licensed" | "synthetic";
  license: string;
}

export interface ReplayTrace {
  runId: string;
  seed: number;
  inputHashes: string[];
  outputHashes: string[];
  toolCallHashes: string[];
  modelVersion: string;
}

export interface ContaminationFinding {
  caseId: string;
  matchedHash: string;
  source: "fixture" | "output" | "external";
  severity: "low" | "high";
}

export interface IntegrityReport {
  passed: boolean;
  findings: ContaminationFinding[];
  checkedCases: number;
  reportHash: string;
}

export interface RegressionGate {
  minimumScore: number;
  maximumDrop: number;
  minimumRequiredPassRate: number;
}

export interface RegressionDecision {
  passed: boolean;
  score: number;
  drop: number;
  requiredPassRate: number;
  reasons: string[];
  decisionHash: string;
}

export class EvaluationIntegrityContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationIntegrityContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new EvaluationIntegrityContractError(`${label} is required`);
}

export function checkContamination(cases: readonly IntegrityBenchmarkCase[], knownHashes: ReadonlySet<string>): IntegrityReport {
  const findings: ContaminationFinding[] = [];
  const seen = new Set<string>();
  for (const testCase of cases) {
    required(testCase.caseId, "caseId");
    required(testCase.fixtureHash, "fixtureHash");
    required(testCase.promptHash, "promptHash");
    required(testCase.expectedArtifactHash, "expectedArtifactHash");
    if (seen.has(testCase.caseId)) throw new EvaluationIntegrityContractError(`duplicate case: ${testCase.caseId}`);
    seen.add(testCase.caseId);
    for (const [candidate, source] of [[testCase.fixtureHash, "fixture"], [testCase.expectedArtifactHash, "output"]] as const) {
      if (knownHashes.has(candidate)) findings.push({ caseId: testCase.caseId, matchedHash: candidate, source, severity: "high" });
    }
  }
  const body = { checkedCases: cases.length, findings };
  return { passed: findings.length === 0, findings, checkedCases: cases.length, reportHash: hash(JSON.stringify(body)) };
}

export function createReplayTrace(input: ReplayTrace): ReplayTrace {
  if (!input.runId.trim() || !input.modelVersion.trim() || !Number.isInteger(input.seed)) throw new EvaluationIntegrityContractError("invalid replay identity");
  if (input.inputHashes.length === 0 || input.outputHashes.length === 0) throw new EvaluationIntegrityContractError("replay needs input and output hashes");
  return structuredClone(input);
}

export function decideRegression(currentScore: number, baselineScore: number, requiredPassRate: number, gate: RegressionGate): RegressionDecision {
  if (![currentScore, baselineScore, requiredPassRate, gate.minimumScore, gate.maximumDrop, gate.minimumRequiredPassRate].every(Number.isFinite)) throw new EvaluationIntegrityContractError("regression values must be finite");
  if (currentScore < 0 || currentScore > 1 || baselineScore < 0 || baselineScore > 1 || requiredPassRate < 0 || requiredPassRate > 1) throw new EvaluationIntegrityContractError("scores must be between 0 and 1");
  const drop = baselineScore - currentScore;
  const reasons: string[] = [];
  if (currentScore < gate.minimumScore) reasons.push("score below minimum");
  if (drop > gate.maximumDrop) reasons.push("regression exceeds maximum drop");
  if (requiredPassRate < gate.minimumRequiredPassRate) reasons.push("required pass rate below minimum");
  const body = { currentScore, baselineScore, requiredPassRate, gate, reasons };
  return { passed: reasons.length === 0, score: currentScore, drop, requiredPassRate, reasons, decisionHash: hash(JSON.stringify(body)) };
}
