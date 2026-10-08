/** M122 contracts for key rotation, erasure propagation and deletion proof. */

export type M122KeyState = "active" | "retiring" | "revoked" | "destroyed";
export type M122DeletionTarget = "database" | "object_store" | "vector_index" | "cache" | "backup";

export interface M122KeyRotationContract {
  organizationId: string;
  keyId: string;
  previousKeyId?: string;
  state: M122KeyState;
  algorithm: "aes-256-gcm" | "ed25519";
  createdAt: number;
  expiresAt: number;
  rotationReason: "scheduled" | "incident" | "deprovision";
  wrappedReference: string;
  oldKeyRevoked: boolean;
  dualReadWindowHours: number;
}

export interface M122DeletionPropagationRequest {
  organizationId: string;
  requestId: string;
  subjectHash: string;
  targets: M122DeletionTarget[];
  propagationPlanHash: string;
  legalHold: boolean;
  identityVerified: boolean;
  approvalPresent: boolean;
  idempotencyKey: string;
}

export interface M122DeletionProof {
  organizationId: string;
  proofId: string;
  requestId: string;
  target: M122DeletionTarget;
  tombstoneHash: string;
  deletedRecords: number;
  residualRecords: number;
  checkedAt: number;
  verifierHash: string;
  immutable: boolean;
}

export interface M122BackupRetentionEvidence {
  organizationId: string;
  backupId: string;
  subjectHash: string;
  retentionUntil: number;
  legalHold: boolean;
  keyDestroyed: boolean;
  deletionDeferred: boolean;
  deferredReasonHash?: string;
  operatorHash: string;
}

export interface M122PrivacyDecision {
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

export function validateM122KeyRotation(key: M122KeyRotationContract, now = Date.now()): M122PrivacyDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[key.organizationId, "organizationId"], [key.keyId, "keyId"], [key.wrappedReference, "wrappedReference"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(key.createdAt) || !Number.isFinite(key.expiresAt) || key.expiresAt <= key.createdAt) reasons.push("key lifetime is invalid");
  if (key.expiresAt <= now && key.state === "active") reasons.push("active key is expired");
  if (key.state !== "active" && !key.oldKeyRevoked) reasons.push("retiring/revoked key needs old-key revocation");
  if (key.rotationReason === "incident" && key.dualReadWindowHours > 1) reasons.push("incident rotation has an excessive dual-read window");
  if (!Number.isInteger(key.dualReadWindowHours) || key.dualReadWindowHours < 0 || key.dualReadWindowHours > 72) reasons.push("dual-read window must be between zero and seventy-two hours");
  return { allowed: reasons.length === 0, reasons, requiresApproval: key.rotationReason !== "scheduled", auditHash: hash(JSON.stringify({ key, reasons })) };
}

export function decideM122Deletion(request: M122DeletionPropagationRequest): M122PrivacyDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.requestId, "requestId"], [request.subjectHash, "subjectHash"], [request.propagationPlanHash, "propagationPlanHash"], [request.idempotencyKey, "idempotencyKey"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.targets.length === 0) reasons.push("deletion needs at least one target");
  if (!request.identityVerified || !request.approvalPresent) reasons.push("deletion needs verified identity and approval");
  if (request.legalHold) reasons.push("legal hold blocks deletion");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateM122DeletionProof(proof: M122DeletionProof): M122PrivacyDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[proof.organizationId, "organizationId"], [proof.proofId, "proofId"], [proof.requestId, "requestId"], [proof.tombstoneHash, "tombstoneHash"], [proof.verifierHash, "verifierHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(proof.deletedRecords) || proof.deletedRecords < 0 || !Number.isInteger(proof.residualRecords) || proof.residualRecords < 0) reasons.push("deletion counts are invalid");
  if (proof.residualRecords > 0 || !proof.immutable) reasons.push("deletion proof contains residual data or is mutable");
  if (!Number.isFinite(proof.checkedAt)) reasons.push("deletion proof timestamp is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ proof, reasons })) };
}

export function validateM122BackupRetention(evidence: M122BackupRetentionEvidence): M122PrivacyDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.backupId, "backupId"], [evidence.subjectHash, "subjectHash"], [evidence.operatorHash, "operatorHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(evidence.retentionUntil)) reasons.push("backup retention is invalid");
  if (evidence.legalHold && (!evidence.deletionDeferred || !evidence.deferredReasonHash)) reasons.push("legal hold needs deferred deletion evidence");
  if (!evidence.legalHold && !evidence.keyDestroyed) reasons.push("non-held backup needs key destruction evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: evidence.legalHold, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
