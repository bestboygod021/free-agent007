/** M91 contracts for plans, entitlements, usage charges, invoices and subscription changes. */

export type BillingPlanMode = "local" | "free" | "byok" | "paid";
export type BillingChargeState = "estimated" | "authorized" | "captured" | "voided";
export type BillingSubscriptionAction = "start" | "upgrade" | "downgrade" | "cancel" | "renew";

export interface BillingPlanEntitlement {
  organizationId: string;
  planId: string;
  mode: BillingPlanMode;
  includedRuns: number;
  includedTokens: number;
  includedStorageMb: number;
  connectorLimit: number;
  effectiveAt: number;
  expiresAt?: number;
  approved: boolean;
  localFallbackAvailable: boolean;
}

export interface BillingUsageCharge {
  organizationId: string;
  chargeId: string;
  runId?: string;
  metric: "run" | "token" | "storage_mb" | "connector_action";
  quantity: number;
  unitPriceMicros: number;
  totalMicros: number;
  state: BillingChargeState;
  usageLedgerHash: string;
  idempotencyKey: string;
  rawCredentialPresent: false;
}

export interface BillingInvoiceEvidence {
  organizationId: string;
  invoiceId: string;
  period: "day" | "month";
  invoiceHash: string;
  ledgerHash: string;
  expectedMicros: number;
  reportedMicros: number;
  deltaMicros: number;
  reconciled: boolean;
  providerReference: string;
}

export interface BillingSubscriptionChange {
  organizationId: string;
  subscriptionId: string;
  currentPlanId: string;
  targetPlanId: string;
  action: BillingSubscriptionAction;
  approvalPresent: boolean;
  prorationAcknowledged: boolean;
  effectiveAt: number;
  requestedBy: string;
}

export interface BillingEntitlementDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class BillingEntitlementContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingEntitlementContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function validateBillingPlan(plan: BillingPlanEntitlement): BillingEntitlementDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[plan.organizationId, "organizationId"], [plan.planId, "planId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (![plan.includedRuns, plan.includedTokens, plan.includedStorageMb, plan.connectorLimit].every((value) => Number.isSafeInteger(value) && value >= 0)) reasons.push("plan allowances are invalid");
  if (!Number.isFinite(plan.effectiveAt) || (plan.expiresAt !== undefined && plan.expiresAt <= plan.effectiveAt)) reasons.push("plan dates are invalid");
  if (!plan.approved) reasons.push("billing plan requires approval");
  if (plan.mode !== "paid" && !plan.localFallbackAvailable) reasons.push("non-paid plan needs honest local fallback");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ plan, reasons })) };
}

export function decideBillingUsageCharge(charge: BillingUsageCharge): BillingEntitlementDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[charge.organizationId, "organizationId"], [charge.chargeId, "chargeId"], [charge.usageLedgerHash, "usageLedgerHash"], [charge.idempotencyKey, "idempotencyKey"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isSafeInteger(charge.quantity) || charge.quantity < 0 || !Number.isSafeInteger(charge.unitPriceMicros) || charge.unitPriceMicros < 0 || !Number.isSafeInteger(charge.totalMicros) || charge.totalMicros < 0) reasons.push("charge values are invalid");
  if (charge.totalMicros !== charge.quantity * charge.unitPriceMicros) reasons.push("charge total does not reconcile");
  if (charge.rawCredentialPresent) reasons.push("raw credential cannot enter billing charge");
  if (charge.state === "captured" && !charge.runId && charge.metric === "run") reasons.push("captured run charge needs run id");
  return { allowed: reasons.length === 0, reasons, requiresApproval: charge.state === "captured", auditHash: hash(JSON.stringify({ charge, reasons })) };
}

export function validateBillingInvoiceEvidence(invoice: BillingInvoiceEvidence): BillingEntitlementDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[invoice.organizationId, "organizationId"], [invoice.invoiceId, "invoiceId"], [invoice.invoiceHash, "invoiceHash"], [invoice.ledgerHash, "ledgerHash"], [invoice.providerReference, "providerReference"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (![invoice.expectedMicros, invoice.reportedMicros, invoice.deltaMicros].every((value) => Number.isSafeInteger(value) && value >= 0)) reasons.push("invoice values are invalid");
  if (invoice.deltaMicros !== invoice.reportedMicros - invoice.expectedMicros) reasons.push("invoice delta does not reconcile");
  if (!invoice.reconciled) reasons.push("invoice reconciliation is incomplete");
  return { allowed: reasons.length === 0, reasons, requiresApproval: Math.abs(invoice.deltaMicros) > 0, auditHash: hash(JSON.stringify({ invoice, reasons })) };
}

export function decideBillingSubscriptionChange(change: BillingSubscriptionChange): BillingEntitlementDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[change.organizationId, "organizationId"], [change.subscriptionId, "subscriptionId"], [change.currentPlanId, "currentPlanId"], [change.targetPlanId, "targetPlanId"], [change.requestedBy, "requestedBy"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (change.currentPlanId === change.targetPlanId && change.action !== "renew") reasons.push("subscription change must change plan or renew");
  if (change.action !== "cancel" && !change.prorationAcknowledged) reasons.push("proration must be acknowledged");
  if (change.action !== "downgrade" && !change.approvalPresent) reasons.push("subscription change requires approval");
  if (!Number.isFinite(change.effectiveAt)) reasons.push("subscription effective time is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: change.action !== "cancel", auditHash: hash(JSON.stringify({ change, reasons })) };
}
