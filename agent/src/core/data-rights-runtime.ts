/** M162 fail-closed contracts for export, DSAR and deletion orchestration. */

export type M162RequestKind = "export" | "delete" | "rectify" | "access";
export type M162RequestState = "received" | "verified" | "running" | "completed" | "blocked";

export interface M162RightsRequest {
  organizationId: string;
  requestId: string;
  subjectReference: string;
  kind: M162RequestKind;
  state: M162RequestState;
  identityProofHash: string;
  scopeHash: string;
  receivedAt: number;
  dueAt: number;
  legalHold: boolean;
  approvalPresent: boolean;
  tenantMatch: boolean;
  noRawSecrets: boolean;
}

export interface M162ExportJob {
  organizationId: string;
  requestId: string;
  exportId: string;
  format: "json" | "csv" | "manifest";
  datasetHashes: string[];
  encryptionReference: string;
  expiresAt: number;
  redacted: boolean;
  signed: boolean;
  recipientVerified: boolean;
  noClobber: boolean;
}

export interface M162DeletionJob {
  organizationId: string;
  requestId: string;
  deletionId: string;
  stores: string[];
  tombstoneHash: string;
  replicasEnumerated: boolean;
  completedAt?: number;
  residualProofHash?: string;
  legalHold: boolean;
  approvalPresent: boolean;
}

export interface M162Hold {
  organizationId: string;
  holdId: string;
  requestId: string;
  reasonHash: string;
  stores: string[];
  expiresAt: number;
  authorizedBy: string;
  tenantMatch: boolean;
}

export interface M162RightsDecision {
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

export function validateM162Request(request: M162RightsRequest, now: number): M162RightsDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.requestId, "requestId"], [request.subjectReference, "subjectReference"], [request.identityProofHash, "identityProofHash"], [request.scopeHash, "scopeHash"]], reasons);
  if (request.state !== "verified" && request.state !== "received") reasons.push("request is not admissible");
  if (!Number.isFinite(request.receivedAt) || !Number.isFinite(request.dueAt) || request.dueAt <= request.receivedAt || request.dueAt < now) reasons.push("request deadline is invalid");
  if (request.legalHold || !request.approvalPresent || !request.tenantMatch || !request.noRawSecrets) reasons.push("request is blocked by hold or safety boundary");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ request, now, reasons })) };
}

export function decideM162Export(job: M162ExportJob, now: number): M162RightsDecision {
  const reasons: string[] = [];
  required([[job.organizationId, "organizationId"], [job.requestId, "requestId"], [job.exportId, "exportId"], [job.encryptionReference, "encryptionReference"]], reasons);
  if (job.datasetHashes.length === 0 || job.datasetHashes.some((item) => !item.trim())) reasons.push("export datasets are required");
  if (!Number.isFinite(job.expiresAt) || job.expiresAt <= now) reasons.push("export expiry is invalid");
  if (!job.redacted || !job.signed || !job.recipientVerified || !job.noClobber) reasons.push("export needs redaction, signature, recipient verification and no-clobber");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ job, now, reasons })) };
}

export function validateM162Deletion(job: M162DeletionJob): M162RightsDecision {
  const reasons: string[] = [];
  required([[job.organizationId, "organizationId"], [job.requestId, "requestId"], [job.deletionId, "deletionId"], [job.tombstoneHash, "tombstoneHash"]], reasons);
  if (job.stores.length === 0 || !job.replicasEnumerated) reasons.push("all deletion stores must be enumerated");
  if (job.legalHold || !job.approvalPresent) reasons.push("deletion is blocked by hold or missing approval");
  if (job.completedAt !== undefined && !Number.isFinite(job.completedAt)) reasons.push("completedAt is invalid");
  if (job.completedAt !== undefined && !job.residualProofHash) reasons.push("completed deletion needs residual proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ job, reasons })) };
}

export function decideM162Hold(hold: M162Hold, now: number): M162RightsDecision {
  const reasons: string[] = [];
  required([[hold.organizationId, "organizationId"], [hold.holdId, "holdId"], [hold.requestId, "requestId"], [hold.reasonHash, "reasonHash"], [hold.authorizedBy, "authorizedBy"]], reasons);
  if (hold.stores.length === 0 || hold.expiresAt <= now || !hold.tenantMatch) reasons.push("hold needs stores, future expiry and tenant match");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ hold, now, reasons })) };
}
