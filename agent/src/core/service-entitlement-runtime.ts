/** M183 fail-closed contracts for service entitlements, SLA evidence and degraded disclosure. */

export type M183ServiceMode = "local" | "free" | "byok" | "hosted";
export type M183AdmissionState = "admitted" | "quota_denied" | "degraded" | "blocked";

export interface M183Entitlement {
  organizationId: string;
  entitlementId: string;
  planId: string;
  mode: M183ServiceMode;
  capabilities: string[];
  quotaRemaining: number;
  monthlyBudgetCents: number;
  providerPolicyHash: string;
  expiresAt: number;
  approved: boolean;
  noSilentUpgrade: boolean;
  tenantBound: boolean;
}

export interface M183Admission {
  organizationId: string;
  entitlementId: string;
  admissionId: string;
  requestedCapability: string;
  estimatedCostCents: number;
  quotaRemaining: number;
  dataEgress: "never" | "approved";
  state: M183AdmissionState;
  degradedMode: boolean;
  fallbackDisclosed: boolean;
  idempotencyKey: string;
  tenantMatch: boolean;
}

export interface M183SlaEvidence {
  organizationId: string;
  entitlementId: string;
  windowStart: number;
  windowEnd: number;
  targetAvailabilityBps: number;
  observedAvailabilityBps: number;
  sampleCount: number;
  incidentHash: string;
  evidenceHash: string;
  redacted: boolean;
  approved: boolean;
  tenantMatch: boolean;
}

export interface M183Disclosure {
  organizationId: string;
  disclosureId: string;
  claimHash: string;
  evidenceHash: string;
  expiresAt: number;
  fallbackDisclosed: boolean;
  noFalseGuarantee: boolean;
  approved: boolean;
  tenantMatch: boolean;
}

export interface M183ServiceDecision {
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

export function validateM183Entitlement(entitlement: M183Entitlement, now: number): M183ServiceDecision {
  const reasons: string[] = [];
  required([[entitlement.organizationId, "organizationId"], [entitlement.entitlementId, "entitlementId"], [entitlement.planId, "planId"], [entitlement.providerPolicyHash, "providerPolicyHash"]], reasons);
  if (!Number.isInteger(entitlement.quotaRemaining) || entitlement.quotaRemaining < 0 || !Number.isInteger(entitlement.monthlyBudgetCents) || entitlement.monthlyBudgetCents < 0 || !Number.isFinite(entitlement.expiresAt) || entitlement.expiresAt <= now) reasons.push("entitlement quota, budget or expiry is invalid");
  if (entitlement.capabilities.length === 0 || entitlement.capabilities.some((capability) => !capability.trim()) || !entitlement.approved || !entitlement.noSilentUpgrade || !entitlement.tenantBound) reasons.push("entitlement needs capability, approval, no-upgrade and tenant gates");
  return { allowed: reasons.length === 0, reasons, requiresApproval: entitlement.mode === "hosted", auditHash: hash(JSON.stringify({ entitlement, now, reasons })) };
}

export function decideM183Admission(admission: M183Admission): M183ServiceDecision {
  const reasons: string[] = [];
  required([[admission.organizationId, "organizationId"], [admission.entitlementId, "entitlementId"], [admission.admissionId, "admissionId"], [admission.requestedCapability, "requestedCapability"], [admission.idempotencyKey, "idempotencyKey"]], reasons);
  if (!Number.isInteger(admission.estimatedCostCents) || admission.estimatedCostCents < 0 || !Number.isInteger(admission.quotaRemaining) || admission.quotaRemaining < 0 || admission.estimatedCostCents > admission.quotaRemaining || admission.dataEgress === "approved" && !admission.fallbackDisclosed || !admission.tenantMatch) reasons.push("admission quota, egress, disclosure or tenant gate failed");
  if (admission.state === "blocked" || admission.state === "quota_denied") reasons.push("admission state is denied");
  if (admission.degradedMode && !admission.fallbackDisclosed) reasons.push("degraded mode must be disclosed");
  return { allowed: reasons.length === 0, reasons, requiresApproval: admission.dataEgress === "approved", auditHash: hash(JSON.stringify({ admission, reasons })) };
}

export function validateM183SlaEvidence(evidence: M183SlaEvidence, now: number): M183ServiceDecision {
  const reasons: string[] = [];
  required([[evidence.organizationId, "organizationId"], [evidence.entitlementId, "entitlementId"], [evidence.incidentHash, "incidentHash"], [evidence.evidenceHash, "evidenceHash"]], reasons);
  if (!Number.isFinite(evidence.windowStart) || !Number.isFinite(evidence.windowEnd) || evidence.windowEnd <= evidence.windowStart || evidence.windowEnd > now || !Number.isInteger(evidence.targetAvailabilityBps) || evidence.targetAvailabilityBps < 0 || evidence.targetAvailabilityBps > 10_000 || !Number.isInteger(evidence.observedAvailabilityBps) || evidence.observedAvailabilityBps < 0 || evidence.observedAvailabilityBps > 10_000 || !Number.isInteger(evidence.sampleCount) || evidence.sampleCount < 1 || !evidence.redacted || !evidence.approved || !evidence.tenantMatch) reasons.push("SLA evidence window, availability or approval is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ evidence, now, reasons })) };
}

export function decideM183Disclosure(disclosure: M183Disclosure, now: number): M183ServiceDecision {
  const reasons: string[] = [];
  required([[disclosure.organizationId, "organizationId"], [disclosure.disclosureId, "disclosureId"], [disclosure.claimHash, "claimHash"], [disclosure.evidenceHash, "evidenceHash"]], reasons);
  if (!Number.isFinite(disclosure.expiresAt) || disclosure.expiresAt <= now || !disclosure.fallbackDisclosed || !disclosure.noFalseGuarantee || !disclosure.approved || !disclosure.tenantMatch) reasons.push("service disclosure needs fresh, bounded and honest evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ disclosure, now, reasons })) };
}
