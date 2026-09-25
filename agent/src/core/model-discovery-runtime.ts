/** M56 contracts for bounded web discovery and verified free-API model candidates. */

export type DiscoverySourceKind = "official_catalog" | "provider_docs" | "model_card" | "repository" | "search_result";
export type FreeApiStatus = "free" | "free_tier" | "paid" | "unknown";
export type CandidateTrust = "official" | "reviewed" | "untrusted";

export interface ModelDiscoveryRequest {
  organizationId: string;
  queryHash: string;
  allowedDomains: string[];
  maxResults: number;
  maxPagesPerDomain: number;
  rateLimitPerMinute: number;
  robotsPolicyChecked: boolean;
  termsPolicyChecked: boolean;
  userApproved: boolean;
  networkMode: "free" | "byok" | "local";
}

export interface ModelDiscoveryCandidate {
  candidateId: string;
  provider: string;
  modelId: string;
  canonicalUrl: string;
  sourceKind: DiscoverySourceKind;
  sourceUrlHash: string;
  modelCardHash: string;
  shortDescription: string;
  capabilities: string[];
  trust: CandidateTrust;
  discoveredAt: number;
  containsInstruction: boolean;
}

export interface FreeApiEvidence {
  provider: string;
  modelId: string;
  status: FreeApiStatus;
  evidenceUrlHash: string;
  evidenceTextHash: string;
  checkedAt: number;
  requiresApiKey: boolean;
  quotaSummary: string;
  termsReviewed: boolean;
  verifiedBy: "official_docs" | "provider_endpoint" | "manual_review";
}

export interface ModelDiscoveryDecision {
  allowed: boolean;
  reasons: string[];
  catalogState: "candidate" | "verified" | "rejected";
  freeApiBadge: FreeApiStatus;
  auditHash: string;
}

export class ModelDiscoveryContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelDiscoveryContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new ModelDiscoveryContractError(`${label} is required`);
}

export function validateModelDiscoveryRequest(request: ModelDiscoveryRequest): ModelDiscoveryDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.queryHash, "queryHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.allowedDomains.length === 0 || request.allowedDomains.some((domain) => !domain.includes("."))) reasons.push("discovery requires a bounded domain allowlist");
  if (!Number.isInteger(request.maxResults) || request.maxResults < 1 || request.maxResults > 500) reasons.push("maxResults is outside bounds");
  if (!Number.isInteger(request.maxPagesPerDomain) || request.maxPagesPerDomain < 1 || request.maxPagesPerDomain > 50) reasons.push("maxPagesPerDomain is outside bounds");
  if (!Number.isInteger(request.rateLimitPerMinute) || request.rateLimitPerMinute < 1) reasons.push("rate limit is invalid");
  if (!request.robotsPolicyChecked || !request.termsPolicyChecked) reasons.push("robots and terms policy must be checked");
  if (!request.userApproved) reasons.push("web discovery requires user approval");
  if (request.networkMode === "local") reasons.push("local mode cannot perform web egress");
  return { allowed: reasons.length === 0, reasons, catalogState: reasons.length === 0 ? "candidate" : "rejected", freeApiBadge: "unknown", auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function classifyModelCandidate(candidate: ModelDiscoveryCandidate): ModelDiscoveryDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[candidate.candidateId, "candidateId"], [candidate.provider, "provider"], [candidate.modelId, "modelId"], [candidate.canonicalUrl, "canonicalUrl"], [candidate.sourceUrlHash, "sourceUrlHash"], [candidate.modelCardHash, "modelCardHash"], [candidate.shortDescription, "shortDescription"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!candidate.canonicalUrl.startsWith("https://")) reasons.push("candidate canonical URL must use HTTPS");
  if (candidate.shortDescription.length > 600) reasons.push("short description is too long");
  if (candidate.trust === "untrusted") reasons.push("untrusted source remains a candidate only");
  if (candidate.containsInstruction) reasons.push("web instructions cannot authorize catalog actions");
  if (!Number.isFinite(candidate.discoveredAt)) reasons.push("discoveredAt must be finite");
  return { allowed: reasons.length === 0, reasons, catalogState: reasons.length === 0 && candidate.trust === "official" ? "verified" : "candidate", freeApiBadge: "unknown", auditHash: hash(JSON.stringify({ candidate, reasons })) };
}

export function verifyFreeApiEvidence(evidence: FreeApiEvidence): ModelDiscoveryDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.provider, "provider"], [evidence.modelId, "modelId"], [evidence.evidenceUrlHash, "evidenceUrlHash"], [evidence.evidenceTextHash, "evidenceTextHash"], [evidence.quotaSummary, "quotaSummary"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(evidence.checkedAt)) reasons.push("checkedAt must be finite");
  if (!evidence.termsReviewed) reasons.push("provider terms must be reviewed");
  if (evidence.status === "free" && !["official_docs", "provider_endpoint", "manual_review"].includes(evidence.verifiedBy)) reasons.push("free API status needs verifiable evidence");
  if (/unlimited|guaranteed|always free/i.test(evidence.quotaSummary)) reasons.push("free API quota claim is too strong without bounded evidence");
  return { allowed: reasons.length === 0, reasons, catalogState: reasons.length === 0 && evidence.status !== "unknown" ? "verified" : "candidate", freeApiBadge: reasons.length === 0 ? evidence.status : "unknown", auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function decideAutomaticCatalogIngestion(candidate: ModelDiscoveryCandidate, evidence: FreeApiEvidence | undefined, humanReviewPresent: boolean): ModelDiscoveryDecision {
  const reasons: string[] = [];
  if (candidate.trust === "untrusted") reasons.push("untrusted discovery result cannot be auto-published");
  if (!humanReviewPresent && candidate.sourceKind !== "official_catalog") reasons.push("non-official model candidate requires review before publication");
  if (evidence && evidence.modelId !== candidate.modelId) reasons.push("free API evidence does not match candidate model");
  if (evidence && !evidence.termsReviewed) reasons.push("free API evidence lacks terms review");
  return { allowed: reasons.length === 0, reasons, catalogState: reasons.length === 0 ? "verified" : "candidate", freeApiBadge: evidence?.status ?? "unknown", auditHash: hash(JSON.stringify({ candidate, evidence, humanReviewPresent, reasons })) };
}
