/** M102 contracts for privacy lifecycle, retention, erasure and tenant-safe output filtering. */

export type PrivacyAction = "retain" | "erase" | "export" | "hold";
export type RetainedDataClass = "public" | "workspace" | "personal" | "secret";

export interface RetentionPolicyContract {
  organizationId: string;
  policyId: string;
  dataClass: RetainedDataClass;
  retentionDays: number;
  deletionGraceDays: number;
  legalHoldAllowed: boolean;
  region: string;
  reviewed: boolean;
  defaultDenyUnknownClass: boolean;
}

export interface PrivacyErasureRequest {
  organizationId: string;
  requestId: string;
  subjectHash: string;
  requestedAction: "erase" | "export";
  scope: string;
  receivedAt: number;
  identityVerified: boolean;
  legalHold: boolean;
  approvalPresent: boolean;
  propagationPlanHash: string;
  tombstoneHash: string;
}

export interface TenantIsolationProbeEvidence {
  organizationId: string;
  probeId: string;
  actorTenantId: string;
  targetTenantId: string;
  attemptedResource: string;
  denied: boolean;
  responseRedacted: boolean;
  queryBoundToTenant: boolean;
  residualDataHash?: string;
}

export interface PrivacyOutputFilterRequest {
  organizationId: string;
  outputHash: string;
  dataClasses: RetainedDataClass[];
  containsSecret: boolean;
  containsOtherTenantData: boolean;
  redacted: boolean;
  sourceTenantId: string;
  targetTenantId: string;
  humanReview: boolean;
}

export interface PrivacyRetentionDecision {
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

export function validateM102RetentionPolicy(policy: RetentionPolicyContract): PrivacyRetentionDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[policy.organizationId, "organizationId"], [policy.policyId, "policyId"], [policy.region, "region"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(policy.retentionDays) || policy.retentionDays < 1) reasons.push("retentionDays must be a positive integer");
  if (!Number.isInteger(policy.deletionGraceDays) || policy.deletionGraceDays < 0) reasons.push("deletionGraceDays must be non-negative");
  if (!policy.reviewed || !policy.defaultDenyUnknownClass) reasons.push("privacy policy requires review and default-deny unknown data classes");
  if (policy.dataClass === "secret" && policy.retentionDays > 30) reasons.push("secret data retention is capped at thirty days");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ policy, reasons })) };
}

export function decidePrivacyErasure(request: PrivacyErasureRequest): PrivacyRetentionDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.requestId, "requestId"], [request.subjectHash, "subjectHash"], [request.scope, "scope"], [request.propagationPlanHash, "propagationPlanHash"], [request.tombstoneHash, "tombstoneHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(request.receivedAt)) reasons.push("receivedAt is invalid");
  if (!request.identityVerified) reasons.push("privacy request identity is not verified");
  if (request.requestedAction === "erase" && request.legalHold) reasons.push("legal hold blocks erasure");
  if (!request.approvalPresent) reasons.push("privacy export/erasure requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateM102TenantIsolationProbe(evidence: TenantIsolationProbeEvidence): PrivacyRetentionDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.probeId, "probeId"], [evidence.actorTenantId, "actorTenantId"], [evidence.targetTenantId, "targetTenantId"], [evidence.attemptedResource, "attemptedResource"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (evidence.actorTenantId === evidence.targetTenantId) reasons.push("isolation probe must use distinct tenants");
  if (!evidence.denied || !evidence.responseRedacted || !evidence.queryBoundToTenant) reasons.push("cross-tenant probe must deny, redact and prove tenant-bound query");
  if (evidence.residualDataHash) reasons.push("isolation probe reports residual cross-tenant data");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function decidePrivacyOutputFilter(request: PrivacyOutputFilterRequest): PrivacyRetentionDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.outputHash, "outputHash"], [request.sourceTenantId, "sourceTenantId"], [request.targetTenantId, "targetTenantId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.containsSecret && !request.redacted) reasons.push("secret-bearing output must be redacted");
  if (request.containsOtherTenantData) reasons.push("output contains another tenant's data");
  if (request.sourceTenantId !== request.targetTenantId) reasons.push("output tenant does not match the requesting tenant");
  if (request.dataClasses.includes("secret") && !request.redacted) reasons.push("secret data class requires redaction");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.humanReview, auditHash: hash(JSON.stringify({ request, reasons })) };
}
