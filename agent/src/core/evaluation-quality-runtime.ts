/** M103 contracts for evaluation datasets, regression gates and release quality evidence. */

export type EvaluationMode = "offline" | "shadow" | "canary" | "e2e";
export type QualityGateStatus = "pass" | "fail" | "hold";

export interface EvaluationDatasetContract {
  organizationId: string;
  datasetId: string;
  version: string;
  datasetHash: string;
  provenanceHash: string;
  piiRedacted: boolean;
  contaminationChecked: boolean;
  cases: number;
  rubricHash: string;
  approved: boolean;
}

export interface EvaluationRunEvidence {
  organizationId: string;
  runId: string;
  datasetId: string;
  datasetVersion: string;
  mode: EvaluationMode;
  modelReference: string;
  seed: number;
  caseCount: number;
  completedCases: number;
  score: number;
  safetyViolations: number;
  latencyP95Ms: number;
  resultHash: string;
  reviewerHash?: string;
}

export interface RegressionGateRequest {
  organizationId: string;
  gateId: string;
  baselineScore: number;
  candidateScore: number;
  allowedRegression: number;
  safetyBaseline: number;
  safetyCandidate: number;
  latencyP95Ms: number;
  latencyBudgetMs: number;
  status: QualityGateStatus;
  approvalPresent: boolean;
}

export interface EndToEndReleaseEvidence {
  organizationId: string;
  evidenceId: string;
  scenarioId: string;
  steps: string[];
  tenantIsolationPassed: boolean;
  securityScanPassed: boolean;
  accessibilityPassed: boolean;
  loadEvidenceHash: string;
  artifactsRedacted: boolean;
  exitCode: number;
  rollbackEvidenceHash: string;
}

export interface EvaluationQualityDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function validateEvaluationDataset(dataset: EvaluationDatasetContract): EvaluationQualityDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[dataset.organizationId, "organizationId"], [dataset.datasetId, "datasetId"], [dataset.version, "version"], [dataset.datasetHash, "datasetHash"], [dataset.provenanceHash, "provenanceHash"], [dataset.rubricHash, "rubricHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!dataset.piiRedacted || !dataset.contaminationChecked || !dataset.approved) reasons.push("dataset privacy, contamination and approval evidence is incomplete");
  if (!Number.isInteger(dataset.cases) || dataset.cases < 1) reasons.push("dataset must contain at least one case");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ dataset, reasons })) };
}

export function validateEvaluationRun(evidence: EvaluationRunEvidence): EvaluationQualityDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.runId, "runId"], [evidence.datasetId, "datasetId"], [evidence.datasetVersion, "datasetVersion"], [evidence.modelReference, "modelReference"], [evidence.resultHash, "resultHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(evidence.seed) || evidence.seed < 0) reasons.push("evaluation requires a replayable non-negative seed");
  if (!Number.isInteger(evidence.caseCount) || evidence.caseCount < 1 || evidence.completedCases !== evidence.caseCount) reasons.push("evaluation case completion is incomplete");
  if (!Number.isFinite(evidence.score) || evidence.score < 0 || evidence.score > 1) reasons.push("score must be between zero and one");
  if (!Number.isInteger(evidence.safetyViolations) || evidence.safetyViolations < 0) reasons.push("safety violation count is invalid");
  if (!Number.isFinite(evidence.latencyP95Ms) || evidence.latencyP95Ms < 0) reasons.push("latency p95 is invalid");
  if (evidence.mode === "canary" && !evidence.reviewerHash) reasons.push("canary evaluation requires a reviewer hash");
  return { allowed: reasons.length === 0, reasons, requiresApproval: evidence.mode === "canary" || evidence.mode === "e2e", auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function decideM103RegressionGate(request: RegressionGateRequest): EvaluationQualityDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.gateId, "gateId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (![request.baselineScore, request.candidateScore, request.allowedRegression, request.safetyBaseline, request.safetyCandidate].every(Number.isFinite)) reasons.push("regression scores must be finite");
  if (request.candidateScore < request.baselineScore - request.allowedRegression) reasons.push("candidate score regresses beyond the allowed threshold");
  if (request.safetyCandidate < request.safetyBaseline) reasons.push("candidate safety score regresses");
  if (!Number.isFinite(request.latencyP95Ms) || request.latencyP95Ms > request.latencyBudgetMs) reasons.push("candidate latency exceeds the budget");
  if (request.status !== "pass") reasons.push("quality gate is not passing");
  if (!request.approvalPresent) reasons.push("release quality gate requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateEndToEndReleaseEvidence(evidence: EndToEndReleaseEvidence): EvaluationQualityDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.evidenceId, "evidenceId"], [evidence.scenarioId, "scenarioId"], [evidence.loadEvidenceHash, "loadEvidenceHash"], [evidence.rollbackEvidenceHash, "rollbackEvidenceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (evidence.steps.length < 3) reasons.push("end-to-end evidence needs at least three ordered steps");
  if (!evidence.tenantIsolationPassed || !evidence.securityScanPassed || !evidence.accessibilityPassed) reasons.push("tenant, security and accessibility gates must pass");
  if (!evidence.artifactsRedacted || evidence.exitCode !== 0) reasons.push("release artifacts must be redacted and the run must exit zero");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
