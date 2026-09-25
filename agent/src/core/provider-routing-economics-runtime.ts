/** M115 contracts for provider offers, quota-aware routing and cost guardrails. */

export type M115ProviderMode = "local" | "byok" | "free" | "paid";
export type M115RouteReason = "privacy" | "quota" | "latency" | "capability" | "cost";

export interface M115ProviderOfferContract {
  organizationId: string;
  providerId: string;
  modelReference: string;
  mode: M115ProviderMode;
  endpointReference: string;
  capabilityHashes: string[];
  pricePerUnit: number;
  currency: string;
  quotaUnits: number;
  privacyReviewed: boolean;
  healthEvidenceHash: string;
  termsAccepted: boolean;
  enabled: boolean;
}

export interface M115RouteRequest {
  organizationId: string;
  requestId: string;
  requiredCapability: string;
  preferredMode: M115ProviderMode;
  allowedModes: M115ProviderMode[];
  maxCost: number;
  maxLatencyMs: number;
  dataLocalOnly: boolean;
  fallbackMode: M115ProviderMode | "none";
  userConsent: boolean;
}

export interface M115QuotaEvidence {
  organizationId: string;
  providerId: string;
  mode: M115ProviderMode;
  quotaLimit: number;
  quotaUsed: number;
  resetAt: number;
  requestCost: number;
  rpmLimit: number;
  rpmUsed: number;
  cooldownUntil?: number;
  headersObserved: boolean;
}

export interface M115RoutingOutcome {
  organizationId: string;
  requestId: string;
  providerId: string;
  modelReference: string;
  selectedMode: M115ProviderMode;
  reason: M115RouteReason;
  estimatedCost: number;
  estimatedLatencyMs: number;
  fallbackAvailable: boolean;
  routeEvidenceHash: string;
  privacyBoundaryPassed: boolean;
}

export interface M115RoutingDecision {
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

export function validateM115ProviderOffer(offer: M115ProviderOfferContract): M115RoutingDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[offer.organizationId, "organizationId"], [offer.providerId, "providerId"], [offer.modelReference, "modelReference"], [offer.endpointReference, "endpointReference"], [offer.healthEvidenceHash, "healthEvidenceHash"], [offer.currency, "currency"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (offer.mode === "local" && !offer.endpointReference.startsWith("http://localhost") && !offer.endpointReference.startsWith("http://127.0.0.1")) reasons.push("local provider must use loopback endpoint");
  if (offer.mode !== "local" && !offer.endpointReference.startsWith("https://")) reasons.push("remote provider must use HTTPS");
  if (!Number.isFinite(offer.pricePerUnit) || offer.pricePerUnit < 0 || !Number.isInteger(offer.quotaUnits) || offer.quotaUnits < 0) reasons.push("provider price/quota is invalid");
  if (offer.capabilityHashes.length === 0 || !offer.privacyReviewed || !offer.termsAccepted || !offer.enabled) reasons.push("provider capability, privacy, terms and enabled evidence is incomplete");
  return { allowed: reasons.length === 0, reasons, requiresApproval: offer.mode === "paid", auditHash: hash(JSON.stringify({ offer, reasons })) };
}

export function decideM115Route(request: M115RouteRequest, offer: M115ProviderOfferContract): M115RoutingDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.requestId, "requestId"], [request.requiredCapability, "requiredCapability"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (offer.organizationId !== request.organizationId) reasons.push("provider route crosses organization boundary");
  if (!request.allowedModes.includes(offer.mode)) reasons.push("provider mode is not allowed for this request");
  if (request.dataLocalOnly && offer.mode !== "local") reasons.push("local-only data cannot use a remote provider");
  if (!offer.capabilityHashes.includes(request.requiredCapability)) reasons.push("provider lacks required capability");
  if (!request.userConsent) reasons.push("provider route needs user consent");
  if (offer.pricePerUnit > request.maxCost) reasons.push("provider cost exceeds request budget");
  if (request.preferredMode !== offer.mode && request.fallbackMode === "none") reasons.push("non-preferred route needs an explicit fallback or deny");
  return { allowed: reasons.length === 0, reasons, requiresApproval: offer.mode === "paid", auditHash: hash(JSON.stringify({ request, offer: offer.providerId, reasons })) };
}

export function validateM115Quota(evidence: M115QuotaEvidence, now = Date.now()): M115RoutingDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.providerId, "providerId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(evidence.quotaLimit) || evidence.quotaLimit < 0 || !Number.isInteger(evidence.quotaUsed) || evidence.quotaUsed < 0 || evidence.quotaUsed > evidence.quotaLimit) reasons.push("quota values are invalid");
  if (!Number.isInteger(evidence.rpmLimit) || evidence.rpmLimit < 1 || !Number.isInteger(evidence.rpmUsed) || evidence.rpmUsed < 0 || evidence.rpmUsed > evidence.rpmLimit) reasons.push("RPM values are invalid");
  if (!Number.isInteger(evidence.requestCost) || evidence.requestCost < 1) reasons.push("request cost must be positive");
  if (!Number.isFinite(evidence.resetAt) || evidence.resetAt <= now) reasons.push("quota reset must be in the future");
  if (evidence.cooldownUntil !== undefined && evidence.cooldownUntil > now) reasons.push("provider is in cooldown");
  if (!evidence.headersObserved) reasons.push("quota evidence needs observed provider headers");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function validateM115RoutingOutcome(outcome: M115RoutingOutcome): M115RoutingDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[outcome.organizationId, "organizationId"], [outcome.requestId, "requestId"], [outcome.providerId, "providerId"], [outcome.modelReference, "modelReference"], [outcome.routeEvidenceHash, "routeEvidenceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(outcome.estimatedCost) || outcome.estimatedCost < 0 || !Number.isFinite(outcome.estimatedLatencyMs) || outcome.estimatedLatencyMs < 0) reasons.push("route cost/latency is invalid");
  if (!outcome.privacyBoundaryPassed) reasons.push("route privacy boundary did not pass");
  if (!outcome.fallbackAvailable) reasons.push("routing outcome needs fallback evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: outcome.selectedMode === "paid", auditHash: hash(JSON.stringify({ outcome, reasons })) };
}
