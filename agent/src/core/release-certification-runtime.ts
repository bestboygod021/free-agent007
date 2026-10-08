/** M88 contracts for release candidates, cutover, canary evidence and rollback. */

export type ReleaseEnvironment = "staging" | "canary" | "production";
export type ReleaseRollout = "manual" | "canary" | "progressive";
export type ReleaseAction = "hold" | "promote" | "rollback" | "abort";

export interface ReleaseCandidateContract {
  organizationId: string;
  releaseId: string;
  version: string;
  commitHash: string;
  artifactHash: string;
  sbomHash: string;
  signatureHash: string;
  ciEvidenceHash: string;
  e2eEvidenceHash: string;
  securityEvidenceHash: string;
  accessibilityEvidenceHash: string;
  changelogHash: string;
  backupVerified: boolean;
  rollbackVerified: boolean;
  approved: boolean;
}

export interface ReleaseCutoverRequest {
  organizationId: string;
  releaseId: string;
  environment: ReleaseEnvironment;
  rollout: ReleaseRollout;
  trafficPercent: number;
  operatorId: string;
  approvalPresent: boolean;
  incidentOpen: boolean;
  rollbackHash: string;
}

export interface ReleaseCanaryEvidence {
  organizationId: string;
  releaseId: string;
  observationId: string;
  trafficPercent: number;
  errorRate: number;
  latencyP95Ms: number;
  availability: number;
  thresholdPassed: boolean;
  tenantIsolationPassed: boolean;
  observedAt: number;
}

export interface ReleaseRollbackEvidence {
  organizationId: string;
  releaseId: string;
  rollbackId: string;
  targetVersion: string;
  backupHash: string;
  commandHash: string;
  exitCode: number;
  restoredHealth: boolean;
  dataIntegrityPassed: boolean;
  completedAt: number;
}

export interface ReleaseCertificationDecision {
  allowed: boolean;
  action: ReleaseAction;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class ReleaseCertificationContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReleaseCertificationContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function validateReleaseCandidate(candidate: ReleaseCandidateContract): ReleaseCertificationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[candidate.organizationId, "organizationId"], [candidate.releaseId, "releaseId"], [candidate.version, "version"], [candidate.commitHash, "commitHash"], [candidate.artifactHash, "artifactHash"], [candidate.sbomHash, "sbomHash"], [candidate.signatureHash, "signatureHash"], [candidate.ciEvidenceHash, "ciEvidenceHash"], [candidate.e2eEvidenceHash, "e2eEvidenceHash"], [candidate.securityEvidenceHash, "securityEvidenceHash"], [candidate.accessibilityEvidenceHash, "accessibilityEvidenceHash"], [candidate.changelogHash, "changelogHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!candidate.backupVerified || !candidate.rollbackVerified) reasons.push("release backup/rollback evidence is incomplete");
  if (!candidate.approved) reasons.push("release candidate requires approval");
  return { allowed: reasons.length === 0, action: reasons.length === 0 ? "promote" : "hold", reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ candidate, reasons })) };
}

export function decideReleaseCutover(request: ReleaseCutoverRequest, candidate: ReleaseCandidateContract): ReleaseCertificationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.releaseId, "releaseId"], [request.operatorId, "operatorId"], [request.rollbackHash, "rollbackHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.organizationId !== candidate.organizationId || request.releaseId !== candidate.releaseId) reasons.push("cutover crosses release organization boundary");
  if (!Number.isFinite(request.trafficPercent) || request.trafficPercent < 0 || request.trafficPercent > 100) reasons.push("traffic percentage is invalid");
  if (request.environment === "production" && !request.approvalPresent) reasons.push("production cutover requires approval");
  if (request.incidentOpen) reasons.push("open incident blocks cutover");
  if (request.rollout === "canary" && (request.trafficPercent <= 0 || request.trafficPercent > 25)) reasons.push("canary traffic must be between 1 and 25 percent");
  return { allowed: reasons.length === 0, action: reasons.length === 0 ? "promote" : "hold", reasons, requiresApproval: request.environment === "production", auditHash: hash(JSON.stringify({ request, candidate: candidate.releaseId, reasons })) };
}

export function validateReleaseCanaryEvidence(evidence: ReleaseCanaryEvidence): ReleaseCertificationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.releaseId, "releaseId"], [evidence.observationId, "observationId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(evidence.trafficPercent) || evidence.trafficPercent <= 0 || evidence.trafficPercent > 25) reasons.push("canary traffic is outside bounds");
  if (!Number.isFinite(evidence.errorRate) || evidence.errorRate < 0 || evidence.errorRate > 1 || !Number.isFinite(evidence.availability) || evidence.availability < 0 || evidence.availability > 1 || !Number.isFinite(evidence.latencyP95Ms) || evidence.latencyP95Ms < 0) reasons.push("canary metrics are invalid");
  if (!evidence.thresholdPassed || !evidence.tenantIsolationPassed) reasons.push("canary threshold or tenant probe failed");
  if (!Number.isFinite(evidence.observedAt)) reasons.push("canary observation time is invalid");
  return { allowed: reasons.length === 0, action: reasons.length === 0 ? "promote" : "rollback", reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function validateReleaseRollbackEvidence(evidence: ReleaseRollbackEvidence): ReleaseCertificationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.releaseId, "releaseId"], [evidence.rollbackId, "rollbackId"], [evidence.targetVersion, "targetVersion"], [evidence.backupHash, "backupHash"], [evidence.commandHash, "commandHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (evidence.exitCode !== 0 || !evidence.restoredHealth || !evidence.dataIntegrityPassed) reasons.push("rollback evidence did not pass");
  if (!Number.isFinite(evidence.completedAt)) reasons.push("rollback completion time is invalid");
  return { allowed: reasons.length === 0, action: reasons.length === 0 ? "rollback" : "abort", reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
