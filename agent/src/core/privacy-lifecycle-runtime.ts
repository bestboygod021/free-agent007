/** M70 contracts for privacy rights, retention, legal holds and deletion evidence. */

export type PrivacySubjectRequest = "access" | "export" | "rectify" | "delete" | "restrict";
export type PrivacyDataClass = "identity" | "run" | "prompt" | "output" | "telemetry" | "credential_reference";
export type PrivacyRequestState = "received" | "verified" | "processing" | "completed" | "blocked";

export interface PrivacyRetentionPolicy {
  organizationId: string;
  policyId: string;
  dataClass: PrivacyDataClass;
  retentionDays: number;
  deletionGraceDays: number;
  legalHoldOverrides: boolean;
  region: string;
  approved: boolean;
}

export interface PrivacySubjectRequestRecord {
  organizationId: string;
  requestId: string;
  subjectHash: string;
  requestType: PrivacySubjectRequest;
  state: PrivacyRequestState;
  receivedAt: number;
  verifiedAt?: number;
  completedAt?: number;
  evidenceHash: string;
  approvalPresent: boolean;
}

export interface PrivacyLegalHold {
  organizationId: string;
  holdId: string;
  matterHash: string;
  dataClasses: PrivacyDataClass[];
  subjectHashes: string[];
  startsAt: number;
  endsAt?: number;
  approvedBy: string;
  active: boolean;
}

export interface PrivacyDeletionEvidence {
  organizationId: string;
  requestId: string;
  dataClass: PrivacyDataClass;
  storeName: string;
  deletedRecordCount: number;
  tombstoneHash: string;
  completedAt: number;
  legalHoldChecked: boolean;
  residualSearchHash: string;
  residualFound: false;
}

export interface PrivacyLifecycleDecision {
  allowed: boolean;
  reasons: string[];
  requiresReview: boolean;
  auditHash: string;
}

export class PrivacyLifecycleContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrivacyLifecycleContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new PrivacyLifecycleContractError(`${label} is required`);
}

export function validatePrivacyRetentionPolicy(policy: PrivacyRetentionPolicy): PrivacyLifecycleDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[policy.organizationId, "organizationId"], [policy.policyId, "policyId"], [policy.region, "region"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(policy.retentionDays) || policy.retentionDays < 1 || policy.retentionDays > 3650) reasons.push("retention days are outside bounds");
  if (!Number.isInteger(policy.deletionGraceDays) || policy.deletionGraceDays < 0 || policy.deletionGraceDays > 365) reasons.push("deletion grace period is outside bounds");
  if (!policy.approved) reasons.push("retention policy requires approval");
  return { allowed: reasons.length === 0, reasons, requiresReview: true, auditHash: hash(JSON.stringify({ policy, reasons })) };
}

export function decidePrivacySubjectRequest(request: PrivacySubjectRequestRecord, now: number): PrivacyLifecycleDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.requestId, "requestId"], [request.subjectHash, "subjectHash"], [request.evidenceHash, "evidenceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(request.receivedAt) || request.receivedAt > now) reasons.push("request received timestamp is invalid");
  if (request.requestType === "delete" && !request.approvalPresent) reasons.push("deletion request requires verified approval context");
  if (request.state === "completed" && !request.completedAt) reasons.push("completed privacy request needs completion time");
  if (request.state === "processing" && !request.verifiedAt) reasons.push("processing privacy request needs subject verification");
  return { allowed: reasons.length === 0, reasons, requiresReview: request.requestType === "delete" || request.requestType === "export", auditHash: hash(JSON.stringify({ request, now, reasons })) };
}

export function validatePrivacyLegalHold(hold: PrivacyLegalHold, now: number): PrivacyLifecycleDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[hold.organizationId, "organizationId"], [hold.holdId, "holdId"], [hold.matterHash, "matterHash"], [hold.approvedBy, "approvedBy"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (hold.dataClasses.length === 0) reasons.push("legal hold needs data classes");
  if (hold.subjectHashes.length === 0) reasons.push("legal hold needs subject scope");
  if (!Number.isFinite(hold.startsAt) || hold.startsAt > now) reasons.push("legal hold start time is invalid");
  if (hold.endsAt !== undefined && hold.endsAt <= hold.startsAt) reasons.push("legal hold end must follow start");
  if (hold.active && !hold.approvedBy) reasons.push("active legal hold needs approver");
  return { allowed: reasons.length === 0, reasons, requiresReview: true, auditHash: hash(JSON.stringify({ hold, now, reasons })) };
}

export function validatePrivacyDeletionEvidence(evidence: PrivacyDeletionEvidence): PrivacyLifecycleDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.requestId, "requestId"], [evidence.storeName, "storeName"], [evidence.tombstoneHash, "tombstoneHash"], [evidence.residualSearchHash, "residualSearchHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(evidence.deletedRecordCount) || evidence.deletedRecordCount < 0) reasons.push("deleted record count is invalid");
  if (!Number.isFinite(evidence.completedAt)) reasons.push("deletion completion time is invalid");
  if (!evidence.legalHoldChecked) reasons.push("legal hold must be checked before deletion");
  if (evidence.residualFound !== false) reasons.push("residual data was found");
  return { allowed: reasons.length === 0, reasons, requiresReview: true, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
