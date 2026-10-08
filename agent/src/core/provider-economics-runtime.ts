/** M86 contracts for provider offers, routing, quota budgets and cost reconciliation. */

export type ProviderComputeMode = "local" | "byok" | "free_api" | "paid_api";
export type ProviderPrivacyClass = "local_only" | "no_training" | "standard";
export type ProviderResponseClass = "success" | "rate_limited" | "server_error" | "client_error";

export interface ProviderOfferContract {
  organizationId: string;
  providerId: string;
  modelReference: string;
  mode: ProviderComputeMode;
  endpointReference: string;
  keyReference?: string;
  priceMicrosPerUnit: number;
  quotaReference: string;
  privacy: ProviderPrivacyClass;
  termsReviewed: boolean;
  healthScore: number;
  supportsStructuredOutput: boolean;
  fallbackRank: number;
}

export interface ProviderRouteRequest {
  organizationId: string;
  requestId: string;
  dataClass: "public" | "internal" | "private" | "confidential";
  allowedModes: ProviderComputeMode[];
  selectedProviderId: string;
  fallbackProviderIds: string[];
  budgetMicros: number;
  consentPresent: boolean;
  approvalPresent: boolean;
  localPreferred: boolean;
}

export interface ProviderQuotaBudget {
  organizationId: string;
  budgetId: string;
  providerId: string;
  period: "hour" | "day" | "month";
  allowanceMicros: number;
  usedMicros: number;
  requestedMicros: number;
  requestsPerMinute: number;
  requestsUsedThisMinute: number;
  approved: boolean;
}

export interface CostReconciliationEvidence {
  organizationId: string;
  reconciliationId: string;
  providerId: string;
  usageUnits: number;
  expectedCostMicros: number;
  reportedCostMicros: number;
  ledgerHash: string;
  invoiceHash?: string;
  deltaMicros: number;
  reconciled: boolean;
  localMode: boolean;
}

export interface ProviderEconomicsDecision {
  allowed: boolean;
  reasons: string[];
  selectedProviderId?: string;
  requiresApproval: boolean;
  auditHash: string;
}

export class ProviderEconomicsContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderEconomicsContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function validateProviderOffer(offer: ProviderOfferContract): ProviderEconomicsDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[offer.organizationId, "organizationId"], [offer.providerId, "providerId"], [offer.modelReference, "modelReference"], [offer.endpointReference, "endpointReference"], [offer.quotaReference, "quotaReference"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (offer.mode !== "local" && !offer.endpointReference.startsWith("https://")) reasons.push("external provider endpoint must use HTTPS");
  if (offer.mode === "local" && offer.endpointReference && !offer.endpointReference.startsWith("local:")) reasons.push("local provider endpoint must remain local");
  if (!Number.isSafeInteger(offer.priceMicrosPerUnit) || offer.priceMicrosPerUnit < 0) reasons.push("provider price is invalid");
  if (!Number.isFinite(offer.healthScore) || offer.healthScore < 0 || offer.healthScore > 1) reasons.push("provider health score is invalid");
  if (!Number.isSafeInteger(offer.fallbackRank) || offer.fallbackRank < 0) reasons.push("fallback rank is invalid");
  if (!offer.termsReviewed) reasons.push("provider terms require review");
  if (offer.mode === "paid_api" && !offer.keyReference) reasons.push("paid provider needs opaque key reference");
  if (offer.keyReference && /password|secret|token|api[_-]?key/i.test(offer.keyReference)) reasons.push("provider key reference must be opaque");
  return { allowed: reasons.length === 0, reasons, selectedProviderId: offer.providerId, requiresApproval: offer.mode === "paid_api", auditHash: hash(JSON.stringify({ offer, reasons })) };
}

export function decideProviderRoute(request: ProviderRouteRequest, offers: ProviderOfferContract[]): ProviderEconomicsDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.requestId, "requestId"], [request.selectedProviderId, "selectedProviderId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  const selected = offers.find((offer) => offer.providerId === request.selectedProviderId && offer.organizationId === request.organizationId);
  if (!selected) reasons.push("selected provider is not available for this organization");
  if (selected && !request.allowedModes.includes(selected.mode)) reasons.push("selected provider mode is not allowed");
  if (selected && request.dataClass === "confidential" && selected.privacy !== "local_only") reasons.push("confidential data requires local-only provider");
  if (selected && selected.mode !== "local" && (!request.consentPresent || !request.approvalPresent)) reasons.push("external provider route requires consent and approval");
  if (!Number.isSafeInteger(request.budgetMicros) || request.budgetMicros < 0) reasons.push("route budget is invalid");
  if (request.fallbackProviderIds.includes(request.selectedProviderId) || new Set(request.fallbackProviderIds).size !== request.fallbackProviderIds.length) reasons.push("fallback provider chain is invalid");
  return { allowed: reasons.length === 0, reasons, selectedProviderId: selected?.providerId, requiresApproval: selected?.mode !== "local", auditHash: hash(JSON.stringify({ request, offers: offers.map((offer) => offer.providerId), reasons })) };
}

export function validateProviderQuotaBudget(budget: ProviderQuotaBudget): ProviderEconomicsDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[budget.organizationId, "organizationId"], [budget.budgetId, "budgetId"], [budget.providerId, "providerId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!["hour", "day", "month"].includes(budget.period)) reasons.push("quota period is invalid");
  if (![budget.allowanceMicros, budget.usedMicros, budget.requestedMicros, budget.requestsPerMinute, budget.requestsUsedThisMinute].every((value) => Number.isSafeInteger(value) && value >= 0)) reasons.push("quota values are invalid");
  if (budget.usedMicros + budget.requestedMicros > budget.allowanceMicros) reasons.push("provider cost budget exceeded");
  if (budget.requestsUsedThisMinute > budget.requestsPerMinute) reasons.push("provider request rate exceeded");
  if (!budget.approved) reasons.push("provider quota requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ budget, reasons })) };
}

export function validateCostReconciliation(evidence: CostReconciliationEvidence): ProviderEconomicsDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.reconciliationId, "reconciliationId"], [evidence.providerId, "providerId"], [evidence.ledgerHash, "ledgerHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isSafeInteger(evidence.usageUnits) || evidence.usageUnits < 0 || !Number.isSafeInteger(evidence.expectedCostMicros) || evidence.expectedCostMicros < 0 || !Number.isSafeInteger(evidence.reportedCostMicros) || evidence.reportedCostMicros < 0) reasons.push("cost values are invalid");
  if (evidence.deltaMicros !== evidence.reportedCostMicros - evidence.expectedCostMicros) reasons.push("cost delta does not reconcile");
  if (!evidence.localMode && !evidence.invoiceHash) reasons.push("external cost needs invoice evidence");
  if (!evidence.reconciled) reasons.push("cost reconciliation is incomplete");
  return { allowed: reasons.length === 0, reasons, requiresApproval: Math.abs(evidence.deltaMicros) > 0, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
