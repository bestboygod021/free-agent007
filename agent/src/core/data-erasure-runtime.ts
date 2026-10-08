/** M191 fail-closed contracts for retention, legal hold and secure erasure. */

export type M191RecordClass = "run" | "artifact" | "prompt" | "feedback" | "credential-reference";

export interface M191RetentionRecord {
  organizationId: string;
  recordIdHash: string;
  recordClass: M191RecordClass;
  createdAt: number;
  retentionSeconds: number;
  legalHold: boolean;
  encrypted: boolean;
  consentBound: boolean;
  tenantBound: boolean;
}

export interface M191DeletionRequest {
  organizationId: string;
  deletionId: string;
  subjectIdHash: string;
  requestedAt: number;
  stores: string[];
  replicaCount: number;
  backupScope: string;
  legalHold: boolean;
  approvalPresent: boolean;
  idempotencyKey: string;
  tenantMatch: boolean;
}

export interface M191DeletionEvidence {
  organizationId: string;
  deletionId: string;
  subjectIdHash: string;
  completedAt: number;
  storesPurged: string[];
  replicasPurged: number;
  backupsPurged: boolean;
  residualHash: string;
  verificationHash: string;
  legalHold: boolean;
  tenantMatch: boolean;
}

export interface M191RetentionException {
  organizationId: string;
  exceptionId: string;
  subjectIdHash: string;
  reasonHash: string;
  legalBasisHash: string;
  expiresAt: number;
  approvalPresent: boolean;
  userDisclosed: boolean;
  bounded: boolean;
  tenantMatch: boolean;
}

export interface M191ErasureDecision {
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

export function validateM191Retention(record: M191RetentionRecord, now: number): M191ErasureDecision {
  const reasons: string[] = [];
  required([[record.organizationId, "organizationId"], [record.recordIdHash, "recordIdHash"]], reasons);
  if (!Number.isFinite(record.createdAt) || !Number.isInteger(record.retentionSeconds) || record.retentionSeconds < 0 || record.createdAt + record.retentionSeconds * 1000 < now || !record.encrypted || !record.consentBound || !record.tenantBound) reasons.push("retention record needs valid lifetime, encryption, consent and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: record.legalHold, auditHash: hash(JSON.stringify({ record, now, reasons })) };
}

export function decideM191Deletion(request: M191DeletionRequest): M191ErasureDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.deletionId, "deletionId"], [request.subjectIdHash, "subjectIdHash"], [request.backupScope, "backupScope"], [request.idempotencyKey, "idempotencyKey"]], reasons);
  if (request.stores.length === 0 || request.stores.some((store) => !store.trim()) || !Number.isInteger(request.replicaCount) || request.replicaCount < 0 || request.legalHold || !request.approvalPresent || !request.tenantMatch) reasons.push("deletion needs stores, replica bound, no legal hold, approval and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateM191DeletionEvidence(evidence: M191DeletionEvidence): M191ErasureDecision {
  const reasons: string[] = [];
  required([[evidence.organizationId, "organizationId"], [evidence.deletionId, "deletionId"], [evidence.subjectIdHash, "subjectIdHash"], [evidence.residualHash, "residualHash"], [evidence.verificationHash, "verificationHash"]], reasons);
  if (!Number.isFinite(evidence.completedAt) || evidence.storesPurged.length === 0 || evidence.storesPurged.some((store) => !store.trim()) || !Number.isInteger(evidence.replicasPurged) || evidence.replicasPurged < 0 || !evidence.backupsPurged || evidence.legalHold || !evidence.tenantMatch) reasons.push("deletion evidence needs store, replica, backup and no-hold proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function decideM191RetentionException(exception: M191RetentionException, now: number): M191ErasureDecision {
  const reasons: string[] = [];
  required([[exception.organizationId, "organizationId"], [exception.exceptionId, "exceptionId"], [exception.subjectIdHash, "subjectIdHash"], [exception.reasonHash, "reasonHash"], [exception.legalBasisHash, "legalBasisHash"]], reasons);
  if (!Number.isFinite(exception.expiresAt) || exception.expiresAt <= now || !exception.approvalPresent || !exception.userDisclosed || !exception.bounded || !exception.tenantMatch) reasons.push("retention exception needs fresh legal basis, disclosure, approval and bound");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ exception, now, reasons })) };
}
