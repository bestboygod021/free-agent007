/** M38 contracts for tenant probes, key rotation, deletion, abuse and egress. */

export type RetentionClass = "run" | "artifact" | "audit" | "account";
export type UntrustedSource = "issue" | "readme" | "webpage" | "model_output" | "user_input";
export type EgressDestination = "local" | "approved_provider" | "webhook" | "unknown";

export interface TenantIsolationProbe {
  organizationId: string;
  actorOrganizationId: string;
  resourceOrganizationId: string;
  resourceId: string;
  operation: "read" | "write" | "delete";
  probeHash: string;
}

export interface SecurityDecision {
  allowed: boolean;
  reasons: string[];
  severity: "info" | "warning" | "critical";
  evidenceHash: string;
}

export interface KeyRotationPlan {
  organizationId: string;
  keyReference: string;
  previousVersion: number;
  nextVersion: number;
  reason: "scheduled" | "suspected_compromise" | "member_change";
  approvalPresent: boolean;
}

export interface DeletionRequest {
  organizationId: string;
  subjectId: string;
  retentionClass: RetentionClass;
  requestedBy: string;
  legalHold: boolean;
  cascadeResourceIds: string[];
  approvalPresent: boolean;
}

export interface UntrustedInput {
  source: UntrustedSource;
  contentHash: string;
  containsInstruction: boolean;
  containsCredentialPattern: boolean;
  requestedAction: "read" | "write" | "execute" | "egress";
}

export interface EgressRequest {
  organizationId: string;
  destination: EgressDestination;
  dataClass: "public" | "internal" | "private" | "confidential";
  payloadHash: string;
  userConsent: boolean;
  dlpPassed: boolean;
  approvalPresent: boolean;
}

export class SecurityPrivacyGovernanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecurityPrivacyGovernanceError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new SecurityPrivacyGovernanceError(`${label} is required`);
}

export function validateTenantIsolationProbe(probe: TenantIsolationProbe): SecurityDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[probe.organizationId, "organizationId"], [probe.actorOrganizationId, "actorOrganizationId"], [probe.resourceOrganizationId, "resourceOrganizationId"], [probe.resourceId, "resourceId"], [probe.probeHash, "probeHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (probe.actorOrganizationId !== probe.organizationId || probe.resourceOrganizationId !== probe.organizationId) reasons.push("cross-tenant access detected");
  if (probe.operation === "delete") reasons.push("isolation probes cannot delete resources");
  return { allowed: reasons.length === 0, reasons, severity: reasons.length > 0 ? "critical" : "info", evidenceHash: hash(JSON.stringify({ probe, reasons })) };
}

export function planKeyRotation(plan: KeyRotationPlan): SecurityDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[plan.organizationId, "organizationId"], [plan.keyReference, "keyReference"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isSafeInteger(plan.previousVersion) || !Number.isSafeInteger(plan.nextVersion) || plan.nextVersion !== plan.previousVersion + 1) reasons.push("key versions must rotate monotonically");
  if (plan.reason === "suspected_compromise" && !plan.approvalPresent) reasons.push("suspected compromise rotation requires approval and incident evidence");
  if (/password|secret|token|api[_-]?key/i.test(plan.keyReference)) reasons.push("key reference must not contain a raw credential");
  return { allowed: reasons.length === 0, reasons, severity: plan.reason === "suspected_compromise" ? "critical" : "info", evidenceHash: hash(JSON.stringify({ plan, reasons })) };
}

export function decideDataDeletion(request: DeletionRequest): SecurityDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.subjectId, "subjectId"], [request.requestedBy, "requestedBy"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.legalHold) reasons.push("legal hold blocks deletion");
  if (request.retentionClass === "audit" && !request.approvalPresent) reasons.push("audit deletion requires approval");
  if (request.cascadeResourceIds.some((id) => !id.trim())) reasons.push("cascade resource ids must be non-empty");
  return { allowed: reasons.length === 0, reasons, severity: request.retentionClass === "audit" ? "warning" : "info", evidenceHash: hash(JSON.stringify({ request, reasons })) };
}

export function classifyUntrustedInput(input: UntrustedInput): SecurityDecision {
  const reasons: string[] = [];
  required(input.contentHash, "contentHash");
  if (input.containsInstruction && ["write", "execute", "egress"].includes(input.requestedAction)) reasons.push("untrusted instruction cannot authorize a side effect");
  if (input.containsCredentialPattern) reasons.push("credential-like content requires redaction and human review");
  return { allowed: reasons.length === 0, reasons, severity: reasons.length > 0 ? "warning" : "info", evidenceHash: hash(JSON.stringify({ input, reasons })) };
}

export function decideGovernedEgress(request: EgressRequest): SecurityDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.payloadHash, "payloadHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.destination === "unknown") reasons.push("unknown egress destination is forbidden");
  if (!request.dlpPassed) reasons.push("DLP gate has not passed");
  if (request.dataClass === "confidential" && request.destination !== "local") reasons.push("confidential data must remain local");
  if (request.destination !== "local" && !request.userConsent) reasons.push("external egress requires user consent");
  if (["webhook", "approved_provider"].includes(request.destination) && !request.approvalPresent) reasons.push("external side effect requires approval");
  return { allowed: reasons.length === 0, reasons, severity: reasons.length > 0 ? "critical" : "info", evidenceHash: hash(JSON.stringify({ request, reasons })) };
}
