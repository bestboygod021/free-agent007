/** M118 contracts for cross-phase production evidence, readiness, canary and cutover gates. */

export type M118EvidenceLayer = "design" | "kernel" | "integration" | "production";
export type M118ReadinessState = "not_ready" | "ready_with_hold" | "ready" | "blocked";
export type M118CanaryState = "planned" | "running" | "passed" | "failed" | "rolled_back";

export interface M118IntegrationEvidenceEnvelope {
  organizationId: string;
  evidenceId: string;
  phase: string;
  layer: M118EvidenceLayer;
  environment: "local" | "staging" | "canary" | "production";
  commandHash: string;
  artifactHash: string;
  testEvidenceHash: string;
  securityEvidenceHash: string;
  tenantProbePassed: boolean;
  redacted: boolean;
  observedAt: number;
  operatorHash: string;
}

export interface M118ReadinessAssessment {
  organizationId: string;
  assessmentId: string;
  releaseId: string;
  requiredEvidence: string[];
  completedEvidence: string[];
  openGaps: string[];
  openIncidents: number;
  approvalPresent: boolean;
  rollbackReady: boolean;
  productionClaimAllowed: boolean;
}

export interface M118CanaryEvidence {
  organizationId: string;
  canaryId: string;
  releaseId: string;
  trafficPercent: number;
  durationMinutes: number;
  errorRate: number;
  latencyP95Ms: number;
  baselineErrorRate: number;
  baselineLatencyP95Ms: number;
  state: M118CanaryState;
  rollbackTested: boolean;
  customerImpactRedacted: boolean;
}

export interface M118CutoverDecisionRequest {
  organizationId: string;
  releaseId: string;
  readiness: M118ReadinessState;
  canaryPassed: boolean;
  approvalPresent: boolean;
  openIncidents: number;
  rollbackReady: boolean;
  productionDeployRequested: boolean;
  localFallbackAvailable: boolean;
}

export interface M118ProductionEvidenceDecision {
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

export function validateM118EvidenceEnvelope(envelope: M118IntegrationEvidenceEnvelope): M118ProductionEvidenceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[envelope.organizationId, "organizationId"], [envelope.evidenceId, "evidenceId"], [envelope.phase, "phase"], [envelope.commandHash, "commandHash"], [envelope.artifactHash, "artifactHash"], [envelope.testEvidenceHash, "testEvidenceHash"], [envelope.securityEvidenceHash, "securityEvidenceHash"], [envelope.operatorHash, "operatorHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(envelope.observedAt)) reasons.push("observedAt is invalid");
  if (!envelope.tenantProbePassed || !envelope.redacted) reasons.push("integration evidence needs tenant probe and redaction");
  if (envelope.layer === "production" && envelope.environment !== "production") reasons.push("production evidence must use production environment");
  if (envelope.layer === "production" && !envelope.operatorHash) reasons.push("production evidence needs operator identity");
  return { allowed: reasons.length === 0, reasons, requiresApproval: envelope.layer === "production", auditHash: hash(JSON.stringify({ envelope, reasons })) };
}

export function decideM118Readiness(assessment: M118ReadinessAssessment): M118ProductionEvidenceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[assessment.organizationId, "organizationId"], [assessment.assessmentId, "assessmentId"], [assessment.releaseId, "releaseId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (assessment.requiredEvidence.length === 0 || assessment.completedEvidence.length < assessment.requiredEvidence.length) reasons.push("required release evidence is incomplete");
  if (assessment.openGaps.length > 0 || assessment.openIncidents > 0) reasons.push("open gaps or incidents block readiness");
  if (!assessment.approvalPresent || !assessment.rollbackReady) reasons.push("readiness needs approval and rollback evidence");
  if (assessment.productionClaimAllowed) reasons.push("production claim requires independent integration evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ assessment, reasons })) };
}

export function validateM118CanaryEvidence(canary: M118CanaryEvidence): M118ProductionEvidenceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[canary.organizationId, "organizationId"], [canary.canaryId, "canaryId"], [canary.releaseId, "releaseId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(canary.trafficPercent) || canary.trafficPercent <= 0 || canary.trafficPercent > 25) reasons.push("canary traffic must be between zero and twenty-five percent");
  if (!Number.isFinite(canary.durationMinutes) || canary.durationMinutes < 5) reasons.push("canary must run for at least five minutes");
  if (!Number.isFinite(canary.errorRate) || !Number.isFinite(canary.baselineErrorRate) || canary.errorRate > canary.baselineErrorRate * 1.2) reasons.push("canary error rate exceeds baseline tolerance");
  if (!Number.isFinite(canary.latencyP95Ms) || !Number.isFinite(canary.baselineLatencyP95Ms) || canary.latencyP95Ms > canary.baselineLatencyP95Ms * 1.2) reasons.push("canary latency exceeds baseline tolerance");
  if (canary.state !== "passed" || !canary.rollbackTested || !canary.customerImpactRedacted) reasons.push("canary evidence is incomplete");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ canary, reasons })) };
}

export function decideM118Cutover(request: M118CutoverDecisionRequest): M118ProductionEvidenceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.releaseId, "releaseId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.readiness !== "ready") reasons.push("release readiness is not ready");
  if (!request.canaryPassed || !request.approvalPresent || !request.rollbackReady) reasons.push("cutover needs passed canary, approval and rollback readiness");
  if (request.openIncidents > 0) reasons.push("open incidents block cutover");
  if (request.productionDeployRequested && !request.localFallbackAvailable) reasons.push("production cutover needs a local/read-only fallback");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.productionDeployRequested, auditHash: hash(JSON.stringify({ request, reasons })) };
}
