/** M163 fail-closed contracts for budget guardrails and usage enforcement. */

export type M163BudgetMode = "free" | "byok" | "local" | "paid";
export type M163UsageState = "reserved" | "committed" | "reconciled" | "rejected";

export interface M163BudgetPolicy {
  organizationId: string;
  budgetId: string;
  mode: M163BudgetMode;
  periodStart: number;
  periodEnd: number;
  tokenLimit: number;
  costLimitMicros: number;
  egressAllowed: boolean;
  approvalPresent: boolean;
  tenantScoped: boolean;
  hardStop: boolean;
  fallbackMode?: M163BudgetMode;
}

export interface M163Reservation {
  organizationId: string;
  budgetId: string;
  reservationId: string;
  tokenUnits: number;
  costMicros: number;
  providerReference: string;
  idempotencyKey: string;
  expiresAt: number;
  remainingTokens: number;
  remainingCostMicros: number;
  state: M163UsageState;
}

export interface M163Usage {
  organizationId: string;
  budgetId: string;
  usageId: string;
  reservationId: string;
  estimatedTokens: number;
  actualTokens: number;
  estimatedCostMicros: number;
  actualCostMicros: number;
  state: M163UsageState;
  providerReceiptHash: string;
  reconciledAt?: number;
  redacted: boolean;
}

export interface M163Circuit {
  organizationId: string;
  budgetId: string;
  circuitId: string;
  open: boolean;
  reasonHash: string;
  observedFailureRate: number;
  observedCostMicros: number;
  thresholdRate: number;
  thresholdCostMicros: number;
  cooldownUntil: number;
  approvalPresent: boolean;
}

export interface M163FinopsDecision {
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

export function validateM163Budget(policy: M163BudgetPolicy): M163FinopsDecision {
  const reasons: string[] = [];
  required([[policy.organizationId, "organizationId"], [policy.budgetId, "budgetId"]], reasons);
  if (!Number.isFinite(policy.periodStart) || !Number.isFinite(policy.periodEnd) || policy.periodEnd <= policy.periodStart) reasons.push("budget period is invalid");
  if (!Number.isInteger(policy.tokenLimit) || policy.tokenLimit < 1 || !Number.isInteger(policy.costLimitMicros) || policy.costLimitMicros < 0) reasons.push("budget limits are invalid");
  if (!policy.approvalPresent || !policy.tenantScoped || !policy.hardStop) reasons.push("budget needs approval, tenant scope and hard stop");
  if (policy.mode === "local" && policy.egressAllowed) reasons.push("local mode cannot allow egress");
  if (policy.fallbackMode === "paid" && policy.mode !== "paid") reasons.push("paid fallback requires explicit paid mode");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ policy, reasons })) };
}

export function decideM163Reservation(reservation: M163Reservation, now: number): M163FinopsDecision {
  const reasons: string[] = [];
  required([[reservation.organizationId, "organizationId"], [reservation.budgetId, "budgetId"], [reservation.reservationId, "reservationId"], [reservation.providerReference, "providerReference"], [reservation.idempotencyKey, "idempotencyKey"]], reasons);
  if (!Number.isInteger(reservation.tokenUnits) || reservation.tokenUnits < 1 || !Number.isInteger(reservation.costMicros) || reservation.costMicros < 0) reasons.push("reservation units are invalid");
  if (reservation.tokenUnits > reservation.remainingTokens || reservation.costMicros > reservation.remainingCostMicros) reasons.push("budget is insufficient");
  if (reservation.expiresAt <= now) reasons.push("reservation is expired");
  if (reservation.state !== "reserved") reasons.push("reservation must be reserved before execution");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ reservation, now, reasons })) };
}

export function validateM163Usage(usage: M163Usage): M163FinopsDecision {
  const reasons: string[] = [];
  required([[usage.organizationId, "organizationId"], [usage.budgetId, "budgetId"], [usage.usageId, "usageId"], [usage.reservationId, "reservationId"], [usage.providerReceiptHash, "providerReceiptHash"]], reasons);
  for (const value of [usage.estimatedTokens, usage.actualTokens, usage.estimatedCostMicros, usage.actualCostMicros]) if (!Number.isFinite(value) || value < 0) reasons.push("usage values are invalid");
  if (usage.state === "reconciled" && usage.reconciledAt === undefined) reasons.push("reconciled usage needs timestamp");
  if (!usage.redacted) reasons.push("usage must be redacted");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ usage, reasons })) };
}

export function decideM163Circuit(circuit: M163Circuit, now: number): M163FinopsDecision {
  const reasons: string[] = [];
  required([[circuit.organizationId, "organizationId"], [circuit.budgetId, "budgetId"], [circuit.circuitId, "circuitId"], [circuit.reasonHash, "reasonHash"]], reasons);
  if (circuit.observedFailureRate < 0 || circuit.observedFailureRate > 1 || circuit.thresholdRate < 0 || circuit.thresholdRate > 1) reasons.push("failure rates are invalid");
  if (circuit.observedCostMicros < 0 || circuit.thresholdCostMicros < 0) reasons.push("cost thresholds are invalid");
  if (circuit.open && circuit.cooldownUntil <= now) reasons.push("open circuit cooldown has elapsed");
  if (!circuit.approvalPresent) reasons.push("circuit decision needs approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ circuit, now, reasons })) };
}
