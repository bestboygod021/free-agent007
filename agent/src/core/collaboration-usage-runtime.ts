/** M81 contracts for collaboration, onboarding, notifications and usage entitlements. */

export type UsageCollaborationRole = "owner" | "admin" | "developer" | "reviewer" | "viewer" | "agent";
export type GovernedOnboardingMode = "local" | "byok" | "free_api";
export type UsageMetric = "run" | "token" | "storage" | "connector_action";
export type GovernedNotificationChannel = "in_app" | "email_reference" | "webhook_reference";

export interface CollaborationRunAccess {
  organizationId: string;
  actorOrganizationId: string;
  runOrganizationId: string;
  runId: string;
  actorId: string;
  role: UsageCollaborationRole;
  action: "comment" | "assign_approval" | "handoff" | "read";
  commentHash?: string;
  targetUserId?: string;
  approvalDelegationPresent: boolean;
}

export interface GovernedOnboardingPlan {
  organizationId: string;
  userId: string;
  mode: GovernedOnboardingMode;
  steps: string[];
  completedSteps: string[];
  localFallbackAvailable: boolean;
  byokConfigured: boolean;
  freeProviderReviewed: boolean;
  consentPresent: boolean;
}

export interface UsageEntitlement {
  organizationId: string;
  entitlementId: string;
  metric: UsageMetric;
  period: "day" | "month";
  allowance: number;
  used: number;
  requested: number;
  planReference: string;
  approved: boolean;
  localMode: boolean;
}

export interface NotificationDeliveryRequest {
  organizationId: string;
  eventId: string;
  eventType: "approval_required" | "run_failed" | "quota_near_limit" | "handoff_ready";
  recipientHash: string;
  channel: GovernedNotificationChannel;
  templateVersion: string;
  preferenceAllowed: boolean;
  payloadHash: string;
  idempotencyKey: string;
}

export interface CollaborationUsageDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class CollaborationUsageContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CollaborationUsageContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new CollaborationUsageContractError(`${label} is required`);
}

export function validateCollaborationRunAccess(access: CollaborationRunAccess): CollaborationUsageDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[access.organizationId, "organizationId"], [access.actorOrganizationId, "actorOrganizationId"], [access.runOrganizationId, "runOrganizationId"], [access.runId, "runId"], [access.actorId, "actorId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (access.actorOrganizationId !== access.organizationId || access.runOrganizationId !== access.organizationId) reasons.push("cross-tenant collaboration access is forbidden");
  if (["comment", "handoff"].includes(access.action) && !access.commentHash) reasons.push("collaboration mutation needs content hash");
  if (access.action === "assign_approval" && !["owner", "admin", "reviewer"].includes(access.role)) reasons.push("role cannot assign approval");
  if (access.action === "assign_approval" && !access.approvalDelegationPresent) reasons.push("approval delegation requires explicit evidence");
  if (access.action === "handoff" && !access.targetUserId) reasons.push("handoff needs a target user");
  return { allowed: reasons.length === 0, reasons, requiresApproval: access.action === "assign_approval" || access.action === "handoff", auditHash: hash(JSON.stringify({ access, reasons })) };
}

export function decideGovernedOnboardingPlan(plan: GovernedOnboardingPlan): CollaborationUsageDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[plan.organizationId, "organizationId"], [plan.userId, "userId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (plan.steps.length === 0 || new Set(plan.steps).size !== plan.steps.length) reasons.push("onboarding steps must be non-empty and unique");
  if (plan.completedSteps.some((step) => !plan.steps.includes(step))) reasons.push("completed onboarding step is undeclared");
  if (plan.mode === "local" && !plan.localFallbackAvailable) reasons.push("local mode requires a local fallback");
  if (plan.mode === "byok" && !plan.byokConfigured) reasons.push("BYOK mode requires explicit configuration");
  if (plan.mode === "free_api" && (!plan.freeProviderReviewed || !plan.consentPresent)) reasons.push("free API mode requires provider review and consent");
  return { allowed: reasons.length === 0, reasons, requiresApproval: plan.mode !== "local", auditHash: hash(JSON.stringify({ plan, reasons })) };
}

export function validateUsageEntitlement(entitlement: UsageEntitlement): CollaborationUsageDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[entitlement.organizationId, "organizationId"], [entitlement.entitlementId, "entitlementId"], [entitlement.planReference, "planReference"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!["day", "month"].includes(entitlement.period)) reasons.push("usage period is invalid");
  if (!Number.isSafeInteger(entitlement.allowance) || !Number.isSafeInteger(entitlement.used) || !Number.isSafeInteger(entitlement.requested) || entitlement.allowance < 0 || entitlement.used < 0 || entitlement.requested < 0) reasons.push("usage values are invalid");
  if (entitlement.used + entitlement.requested > entitlement.allowance && !entitlement.localMode) reasons.push("usage request exceeds entitlement");
  if (!entitlement.approved) reasons.push("entitlement requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ entitlement, reasons })) };
}

export function decideNotificationDelivery(request: NotificationDeliveryRequest): CollaborationUsageDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.eventId, "eventId"], [request.recipientHash, "recipientHash"], [request.templateVersion, "templateVersion"], [request.payloadHash, "payloadHash"], [request.idempotencyKey, "idempotencyKey"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!request.preferenceAllowed) reasons.push("recipient notification preference does not allow delivery");
  if (request.channel === "email_reference" && /@/.test(request.recipientHash)) reasons.push("notification recipient must be a hash/reference, not raw email");
  if (request.channel === "webhook_reference" && !request.payloadHash) reasons.push("webhook notification needs redacted payload hash");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.channel === "webhook_reference", auditHash: hash(JSON.stringify({ request, reasons })) };
}
