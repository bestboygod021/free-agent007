/** M110 contracts for model discovery, AI directory entries and free-endpoint verification. */

export type M110ModelSource = "local" | "provider" | "web" | "community";
export type M110ModelLifecycle = "candidate" | "verified" | "listed" | "suspended";

export interface M110ModelCandidateContract {
  organizationId: string;
  candidateId: string;
  modelReference: string;
  source: M110ModelSource;
  sourceUrl: string;
  descriptionHash: string;
  licenseReference: string;
  capabilities: string[];
  contextWindow: number;
  freeTierClaimed: boolean;
  localCompatible: boolean;
  discoveredAt: number;
  untrustedDescription: boolean;
}

export interface M110FreeEndpointEvidence {
  organizationId: string;
  candidateId: string;
  endpointReference: string;
  protocol: "openai_compatible" | "ollama" | "custom";
  authMode: "none" | "byok" | "local";
  requestHash: string;
  responseSchemaHash: string;
  observedStatus: number;
  quotaDocumented: boolean;
  tosReviewed: boolean;
  noRawKeyStored: boolean;
  verifiedAt: number;
}

export interface M110CatalogPublicationRequest {
  organizationId: string;
  candidateId: string;
  lifecycle: M110ModelLifecycle;
  modelCardHash: string;
  provenanceHash: string;
  safetyReviewHash: string;
  freshnessUntil: number;
  reviewerHash: string;
  publishApproved: boolean;
}

export interface M110ModelActivationRequest {
  organizationId: string;
  modelReference: string;
  route: "local" | "byok" | "free" | "paid";
  candidateVerified: boolean;
  privacyReviewed: boolean;
  quotaKnown: boolean;
  fallbackRoute: "local" | "byok" | "free" | "none";
  userConsent: boolean;
  active: boolean;
}

export interface M110ModelDirectoryDecision {
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

export function validateM110ModelCandidate(candidate: M110ModelCandidateContract): M110ModelDirectoryDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[candidate.organizationId, "organizationId"], [candidate.candidateId, "candidateId"], [candidate.modelReference, "modelReference"], [candidate.sourceUrl, "sourceUrl"], [candidate.descriptionHash, "descriptionHash"], [candidate.licenseReference, "licenseReference"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (candidate.sourceUrl !== "local" && !candidate.sourceUrl.startsWith("https://")) reasons.push("non-local model source must use HTTPS");
  if (candidate.capabilities.length === 0) reasons.push("model candidate needs capabilities");
  if (!Number.isInteger(candidate.contextWindow) || candidate.contextWindow < 1) reasons.push("context window must be positive");
  if (!Number.isFinite(candidate.discoveredAt)) reasons.push("discoveredAt is invalid");
  if (!candidate.untrustedDescription) reasons.push("external model descriptions must be marked untrusted");
  return { allowed: reasons.length === 0, reasons, requiresApproval: candidate.source === "web" || candidate.source === "community", auditHash: hash(JSON.stringify({ candidate, reasons })) };
}

export function validateM110FreeEndpointEvidence(evidence: M110FreeEndpointEvidence): M110ModelDirectoryDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.candidateId, "candidateId"], [evidence.endpointReference, "endpointReference"], [evidence.requestHash, "requestHash"], [evidence.responseSchemaHash, "responseSchemaHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (evidence.authMode !== "local" && !evidence.endpointReference.startsWith("https://")) reasons.push("remote free endpoint must use HTTPS");
  if (evidence.authMode === "local" && !evidence.endpointReference.startsWith("http://localhost") && !evidence.endpointReference.startsWith("http://127.0.0.1")) reasons.push("local endpoint must be loopback");
  if (evidence.observedStatus < 200 || evidence.observedStatus >= 300) reasons.push("free endpoint health probe did not succeed");
  if (!evidence.quotaDocumented || !evidence.tosReviewed || !evidence.noRawKeyStored) reasons.push("free endpoint evidence is incomplete");
  if (!Number.isFinite(evidence.verifiedAt)) reasons.push("verifiedAt is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function decideM110CatalogPublication(request: M110CatalogPublicationRequest, now = Date.now()): M110ModelDirectoryDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.candidateId, "candidateId"], [request.modelCardHash, "modelCardHash"], [request.provenanceHash, "provenanceHash"], [request.safetyReviewHash, "safetyReviewHash"], [request.reviewerHash, "reviewerHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.lifecycle === "listed" && !request.publishApproved) reasons.push("listing requires publication approval");
  if (request.lifecycle !== "candidate" && request.freshnessUntil <= now) reasons.push("model catalog evidence is stale");
  if (request.lifecycle === "suspended" && request.publishApproved) reasons.push("suspended model cannot be published");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.lifecycle === "listed", auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function decideM110ModelActivation(request: M110ModelActivationRequest): M110ModelDirectoryDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.modelReference, "modelReference"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!request.candidateVerified || !request.privacyReviewed || !request.quotaKnown) reasons.push("model activation evidence is incomplete");
  if (!request.userConsent) reasons.push("model route requires user consent");
  if (request.route === "paid" && request.fallbackRoute === "none") reasons.push("paid route needs an explicit fallback or explicit deny");
  if (!request.active) reasons.push("model activation request is not active");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.route === "paid", auditHash: hash(JSON.stringify({ request, reasons })) };
}
