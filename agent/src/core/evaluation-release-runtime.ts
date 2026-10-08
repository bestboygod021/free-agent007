/** M127 contracts for benchmark corpus, deterministic replay, quality gates and release evidence. */

export type M127EvaluationMode = "offline" | "shadow" | "canary" | "e2e";
export type M127GateState = "pass" | "fail" | "hold";

export interface M127BenchmarkCorpus {
  organizationId: string;
  corpusId: string;
  version: string;
  caseCount: number;
  corpusHash: string;
  provenanceHash: string;
  rubricHash: string;
  piiRedacted: boolean;
  contaminationChecked: boolean;
  fixtureLocked: boolean;
  approved: boolean;
}

export interface M127ReplayEvidence {
  organizationId: string;
  replayId: string;
  corpusId: string;
  corpusVersion: string;
  modelReference: string;
  mode: M127EvaluationMode;
  seed: number;
  expectedCases: number;
  completedCases: number;
  resultHash: string;
  environmentHash: string;
  deterministic: boolean;
  logsRedacted: boolean;
}

export interface M127QualityGate {
  organizationId: string;
  gateId: string;
  baselineScore: number;
  candidateScore: number;
  allowedRegression: number;
  baselineSafetyViolations: number;
  candidateSafetyViolations: number;
  latencyP95Ms: number;
  latencyBudgetMs: number;
  state: M127GateState;
  reviewerHash: string;
  approvalPresent: boolean;
}

export interface M127ReleaseEvidence {
  organizationId: string;
  evidenceId: string;
  releaseId: string;
  scenarioId: string;
  exitCode: number;
  tenantIsolationPassed: boolean;
  securityPassed: boolean;
  accessibilityPassed: boolean;
  loadEvidenceHash: string;
  rollbackEvidenceHash: string;
  artifactsRedacted: boolean;
  customerImpactRedacted: boolean;
}

export interface M127EvaluationDecision {
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

function required(values: Array<readonly [string, string]>, reasons: string[]): void {
  for (const [value, label] of values) if (!value.trim()) reasons.push(`${label} is required`);
}

export function validateM127Corpus(corpus: M127BenchmarkCorpus): M127EvaluationDecision {
  const reasons: string[] = [];
  required([[corpus.organizationId, "organizationId"], [corpus.corpusId, "corpusId"], [corpus.version, "version"], [corpus.corpusHash, "corpusHash"], [corpus.provenanceHash, "provenanceHash"], [corpus.rubricHash, "rubricHash"]], reasons);
  if (!Number.isInteger(corpus.caseCount) || corpus.caseCount < 1) reasons.push("benchmark corpus needs at least one case");
  if (!corpus.piiRedacted || !corpus.contaminationChecked || !corpus.fixtureLocked || !corpus.approved) reasons.push("corpus provenance, privacy, fixture and approval evidence is incomplete");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ corpus, reasons })) };
}

export function validateM127Replay(replay: M127ReplayEvidence): M127EvaluationDecision {
  const reasons: string[] = [];
  required([[replay.organizationId, "organizationId"], [replay.replayId, "replayId"], [replay.corpusId, "corpusId"], [replay.corpusVersion, "corpusVersion"], [replay.modelReference, "modelReference"], [replay.resultHash, "resultHash"], [replay.environmentHash, "environmentHash"]], reasons);
  if (!Number.isInteger(replay.seed) || replay.seed < 0) reasons.push("replay seed must be a non-negative integer");
  if (!Number.isInteger(replay.expectedCases) || replay.expectedCases < 1 || replay.completedCases !== replay.expectedCases) reasons.push("replay case completion is incomplete");
  if (!replay.deterministic || !replay.logsRedacted) reasons.push("replay must be deterministic and redacted");
  return { allowed: reasons.length === 0, reasons, requiresApproval: replay.mode === "canary" || replay.mode === "e2e", auditHash: hash(JSON.stringify({ replay, reasons })) };
}

export function decideM127QualityGate(gate: M127QualityGate): M127EvaluationDecision {
  const reasons: string[] = [];
  required([[gate.organizationId, "organizationId"], [gate.gateId, "gateId"], [gate.reviewerHash, "reviewerHash"]], reasons);
  if (![gate.baselineScore, gate.candidateScore, gate.allowedRegression, gate.latencyP95Ms, gate.latencyBudgetMs].every(Number.isFinite)) reasons.push("quality values must be finite");
  if (gate.candidateScore < gate.baselineScore - gate.allowedRegression) reasons.push("candidate quality regresses beyond allowance");
  if (gate.candidateSafetyViolations > gate.baselineSafetyViolations) reasons.push("candidate safety violations increased");
  if (gate.latencyP95Ms > gate.latencyBudgetMs) reasons.push("candidate latency exceeds budget");
  if (gate.state !== "pass" || !gate.approvalPresent) reasons.push("quality gate needs pass state and approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ gate, reasons })) };
}

export function validateM127ReleaseEvidence(evidence: M127ReleaseEvidence): M127EvaluationDecision {
  const reasons: string[] = [];
  required([[evidence.organizationId, "organizationId"], [evidence.evidenceId, "evidenceId"], [evidence.releaseId, "releaseId"], [evidence.scenarioId, "scenarioId"], [evidence.loadEvidenceHash, "loadEvidenceHash"], [evidence.rollbackEvidenceHash, "rollbackEvidenceHash"]], reasons);
  if (evidence.exitCode !== 0) reasons.push("release scenario did not exit successfully");
  if (!evidence.tenantIsolationPassed || !evidence.securityPassed || !evidence.accessibilityPassed) reasons.push("release isolation, security and accessibility gates must pass");
  if (!evidence.artifactsRedacted || !evidence.customerImpactRedacted) reasons.push("release evidence must redact artifacts and customer impact");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
