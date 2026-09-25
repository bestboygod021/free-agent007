/** M75 contracts for reproducible evaluation harnesses, scoring and regression gates. */

export type BenchmarkTaskKind = "generation" | "coding" | "classification" | "tool_use" | "safety" | "retrieval";
export type BenchmarkComputeMode = "local" | "free" | "byok" | "paid";
export type BenchmarkScoreStatus = "pass" | "fail" | "blocked";

export interface BenchmarkScenario {
  organizationId: string;
  scenarioId: string;
  taskKind: BenchmarkTaskKind;
  inputHash: string;
  expectedOutputSchemaHash: string;
  rubricHash: string;
  provenanceHash: string;
  untrustedInput: boolean;
  secretScanPassed: boolean;
}

export interface BenchmarkRun {
  organizationId: string;
  runId: string;
  datasetHash: string;
  scenarioIds: string[];
  modelReference: string;
  computeMode: BenchmarkComputeMode;
  seed: number;
  scorerVersion: string;
  blindScoring: boolean;
  approvalPresent: boolean;
}

export interface BenchmarkScoreEvidence {
  organizationId: string;
  runId: string;
  scenarioId: string;
  outputHash: string;
  score: number;
  threshold: number;
  status: BenchmarkScoreStatus;
  scorerHash: string;
  contaminationChecked: boolean;
  safetyChecked: boolean;
  latencyMs: number;
}

export interface BenchmarkRegressionGate {
  organizationId: string;
  gateId: string;
  baselineRunId: string;
  candidateRunId: string;
  maxRegressionPercent: number;
  candidateScore: number;
  baselineScore: number;
  requiredScenarioCount: number;
  allScenarioEvidencePresent: boolean;
  approvalPresent: boolean;
}

export interface EvaluationHarnessDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class EvaluationHarnessContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationHarnessContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function nonEmpty(value: string, label: string, reasons: string[]): void {
  if (!value.trim()) reasons.push(`${label} is required`);
}

export function validateBenchmarkScenario(scenario: BenchmarkScenario): EvaluationHarnessDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[scenario.organizationId, "organizationId"], [scenario.scenarioId, "scenarioId"], [scenario.inputHash, "inputHash"], [scenario.expectedOutputSchemaHash, "expectedOutputSchemaHash"], [scenario.rubricHash, "rubricHash"], [scenario.provenanceHash, "provenanceHash"]] as const) nonEmpty(value, label, reasons);
  if (scenario.untrustedInput && !scenario.secretScanPassed) reasons.push("untrusted benchmark input requires secret scan");
  return { allowed: reasons.length === 0, reasons, requiresApproval: scenario.taskKind === "safety", auditHash: hash(JSON.stringify({ scenario, reasons })) };
}

export function decideBenchmarkRun(run: BenchmarkRun, scenarios: readonly BenchmarkScenario[]): EvaluationHarnessDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[run.organizationId, "organizationId"], [run.runId, "runId"], [run.datasetHash, "datasetHash"], [run.modelReference, "modelReference"], [run.scorerVersion, "scorerVersion"]] as const) nonEmpty(value, label, reasons);
  if (!Number.isInteger(run.seed) || run.seed < 0) reasons.push("benchmark seed must be a non-negative integer");
  if (run.scenarioIds.length === 0 || new Set(run.scenarioIds).size !== run.scenarioIds.length) reasons.push("benchmark scenario IDs must be non-empty and unique");
  const scenarioIds = new Set(scenarios.map((scenario) => scenario.scenarioId));
  if (run.scenarioIds.some((scenarioId) => !scenarioIds.has(scenarioId))) reasons.push("benchmark run references unknown scenario");
  if (scenarios.some((scenario) => scenario.organizationId !== run.organizationId)) reasons.push("benchmark run crosses organization boundary");
  if (!run.blindScoring) reasons.push("benchmark run requires blind scoring");
  if (!run.approvalPresent && run.computeMode === "paid") reasons.push("paid benchmark compute requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: run.computeMode === "paid", auditHash: hash(JSON.stringify({ run, scenarios, reasons })) };
}

export function validateBenchmarkScoreEvidence(evidence: BenchmarkScoreEvidence): EvaluationHarnessDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.runId, "runId"], [evidence.scenarioId, "scenarioId"], [evidence.outputHash, "outputHash"], [evidence.scorerHash, "scorerHash"]] as const) nonEmpty(value, label, reasons);
  if (!Number.isFinite(evidence.score) || evidence.score < 0 || evidence.score > 1) reasons.push("benchmark score must be between zero and one");
  if (!Number.isFinite(evidence.threshold) || evidence.threshold < 0 || evidence.threshold > 1) reasons.push("benchmark threshold must be between zero and one");
  if (!Number.isInteger(evidence.latencyMs) || evidence.latencyMs < 0) reasons.push("benchmark latency is invalid");
  if (!evidence.contaminationChecked || !evidence.safetyChecked) reasons.push("benchmark evidence is missing contamination or safety check");
  if ((evidence.score >= evidence.threshold) !== (evidence.status === "pass")) reasons.push("benchmark status does not match score threshold");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function decideBenchmarkRegressionGate(gate: BenchmarkRegressionGate): EvaluationHarnessDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[gate.organizationId, "organizationId"], [gate.gateId, "gateId"], [gate.baselineRunId, "baselineRunId"], [gate.candidateRunId, "candidateRunId"]] as const) nonEmpty(value, label, reasons);
  if (gate.baselineRunId === gate.candidateRunId) reasons.push("baseline and candidate runs must differ");
  if (!Number.isInteger(gate.requiredScenarioCount) || gate.requiredScenarioCount < 1) reasons.push("regression gate needs scenarios");
  if (!gate.allScenarioEvidencePresent) reasons.push("regression gate needs complete scenario evidence");
  if (!Number.isFinite(gate.maxRegressionPercent) || gate.maxRegressionPercent < 0 || gate.maxRegressionPercent > 100) reasons.push("regression bound is invalid");
  if (gate.baselineScore <= 0 || gate.candidateScore < 0) reasons.push("regression scores are invalid");
  const regression = ((gate.baselineScore - gate.candidateScore) / gate.baselineScore) * 100;
  if (regression > gate.maxRegressionPercent) reasons.push("candidate exceeds allowed regression");
  if (!gate.approvalPresent) reasons.push("regression gate requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ gate, regression, reasons })) };
}
