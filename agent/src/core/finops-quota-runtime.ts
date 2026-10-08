/** M128 contracts for usage ledgers, quota scheduling, provider allocation and cost guardrails. */

export type M128ComputeMode = "local" | "free" | "byok" | "paid";
export type M128UsageUnit = "request" | "token" | "cpu_ms" | "storage_mb";

export interface M128UsageLedgerEntry {
  organizationId: string;
  entryId: string;
  runId: string;
  providerReference: string;
  mode: M128ComputeMode;
  unit: M128UsageUnit;
  quantity: number;
  estimatedCost: number;
  currency: string;
  idempotencyKey: string;
  appendOnly: boolean;
  sourceHash: string;
  recordedAt: number;
}

export interface M128QuotaDecisionRequest {
  organizationId: string;
  requestId: string;
  mode: M128ComputeMode;
  requestedUnits: number;
  usedUnits: number;
  quotaLimit: number;
  costEstimate: number;
  costLimit: number;
  localFallbackAvailable: boolean;
  userConsent: boolean;
  approvalPresent: boolean;
}

export interface M128ProviderAllocation {
  organizationId: string;
  allocationId: string;
  providerReference: string;
  mode: M128ComputeMode;
  quotaRemaining: number;
  rpmRemaining: number;
  privacyBoundaryPassed: boolean;
  termsReviewed: boolean;
  fallbackRank: number;
  selected: boolean;
  allocationEvidenceHash: string;
}

export interface M128CostReconciliation {
  organizationId: string;
  reportId: string;
  periodStart: number;
  periodEnd: number;
  ledgerCost: number;
  providerCost: number;
  varianceAllowed: number;
  budgetLimit: number;
  reconciled: boolean;
  sourceHash: string;
  reviewerHash: string;
}

export interface M128FinopsDecision {
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

export function validateM128UsageLedger(entry: M128UsageLedgerEntry): M128FinopsDecision {
  const reasons: string[] = [];
  required([[entry.organizationId, "organizationId"], [entry.entryId, "entryId"], [entry.runId, "runId"], [entry.providerReference, "providerReference"], [entry.currency, "currency"], [entry.idempotencyKey, "idempotencyKey"], [entry.sourceHash, "sourceHash"]], reasons);
  if (!Number.isFinite(entry.quantity) || entry.quantity <= 0 || !Number.isFinite(entry.estimatedCost) || entry.estimatedCost < 0) reasons.push("usage quantity/cost is invalid");
  if (!entry.appendOnly) reasons.push("usage ledger must be append-only");
  if (!Number.isFinite(entry.recordedAt)) reasons.push("usage recordedAt is invalid");
  if (entry.mode === "local" && entry.estimatedCost !== 0) reasons.push("local mode cannot claim provider cost");
  if (entry.mode === "free" && entry.estimatedCost !== 0) reasons.push("free mode cannot claim paid provider cost");
  return { allowed: reasons.length === 0, reasons, requiresApproval: entry.mode === "paid", auditHash: hash(JSON.stringify({ entry, reasons })) };
}

export function decideM128Quota(request: M128QuotaDecisionRequest): M128FinopsDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.requestId, "requestId"]], reasons);
  if (![request.requestedUnits, request.usedUnits, request.quotaLimit, request.costEstimate, request.costLimit].every(Number.isFinite)) reasons.push("quota and cost values must be finite");
  if (request.requestedUnits <= 0 || request.usedUnits < 0 || request.quotaLimit < 0 || request.costEstimate < 0 || request.costLimit < 0) reasons.push("quota and cost values must be non-negative and requested units positive");
  if (request.usedUnits + request.requestedUnits > request.quotaLimit) reasons.push("request exceeds usage quota");
  if (request.costEstimate > request.costLimit) reasons.push("request exceeds cost limit");
  if (request.mode === "free" || request.mode === "local") {
    if (request.costEstimate !== 0) reasons.push("free/local request must have zero paid cost");
    if (request.mode === "free" && !request.userConsent) reasons.push("free provider use needs explicit consent");
  }
  if (request.mode === "paid" && !request.approvalPresent) reasons.push("paid request needs approval");
  if (request.mode !== "local" && !request.localFallbackAvailable) reasons.push("non-local request needs a local/read-only fallback");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.mode === "paid", auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateM128ProviderAllocation(allocation: M128ProviderAllocation): M128FinopsDecision {
  const reasons: string[] = [];
  required([[allocation.organizationId, "organizationId"], [allocation.allocationId, "allocationId"], [allocation.providerReference, "providerReference"], [allocation.allocationEvidenceHash, "allocationEvidenceHash"]], reasons);
  if (!Number.isInteger(allocation.quotaRemaining) || allocation.quotaRemaining < 0 || !Number.isInteger(allocation.rpmRemaining) || allocation.rpmRemaining < 0) reasons.push("provider quota values must be non-negative integers");
  if (!allocation.privacyBoundaryPassed || !allocation.termsReviewed) reasons.push("provider privacy and terms evidence is incomplete");
  if (!Number.isInteger(allocation.fallbackRank) || allocation.fallbackRank < 0) reasons.push("fallback rank is invalid");
  if (allocation.selected && (allocation.quotaRemaining === 0 || allocation.rpmRemaining === 0)) reasons.push("selected provider has no remaining quota");
  return { allowed: reasons.length === 0, reasons, requiresApproval: allocation.mode === "paid", auditHash: hash(JSON.stringify({ allocation, reasons })) };
}

export function validateM128CostReconciliation(report: M128CostReconciliation): M128FinopsDecision {
  const reasons: string[] = [];
  required([[report.organizationId, "organizationId"], [report.reportId, "reportId"], [report.sourceHash, "sourceHash"], [report.reviewerHash, "reviewerHash"]], reasons);
  if (!Number.isFinite(report.periodStart) || !Number.isFinite(report.periodEnd) || report.periodEnd <= report.periodStart) reasons.push("cost report period is invalid");
  if (![report.ledgerCost, report.providerCost, report.varianceAllowed, report.budgetLimit].every(Number.isFinite) || report.ledgerCost < 0 || report.providerCost < 0 || report.varianceAllowed < 0 || report.budgetLimit < 0) reasons.push("cost report values are invalid");
  if (Math.abs(report.ledgerCost - report.providerCost) > report.varianceAllowed) reasons.push("ledger/provider variance exceeds allowance");
  if (report.ledgerCost > report.budgetLimit) reasons.push("ledger cost exceeds budget");
  if (!report.reconciled) reasons.push("cost report is not reconciled");
  return { allowed: reasons.length === 0, reasons, requiresApproval: report.ledgerCost > report.budgetLimit, auditHash: hash(JSON.stringify({ report, reasons })) };
}
