/** M58 contracts for model catalog publication, auto-discovery review and activation. */

import type { AiDirectoryCategory } from "./ai-directory-runtime.js";
import type { FreeApiStatus } from "./model-discovery-runtime.js";

export type CatalogPublicationState = "candidate" | "verified" | "listed" | "enabled" | "retired";
export type ModelActivationMode = "free_api" | "byok" | "local" | "manual_provider";

export interface ModelCatalogRecord {
  organizationId: string;
  catalogId: string;
  provider: string;
  modelId: string;
  displayName: string;
  description: string;
  categories: readonly AiDirectoryCategory[];
  freeApiStatus: FreeApiStatus;
  freeApiEvidenceHash?: string;
  sourceEvidenceHashes: string[];
  publicationState: CatalogPublicationState;
  lastVerifiedAt: number;
  retired: boolean;
}

export interface ModelActivationRequest {
  organizationId: string;
  userId: string;
  catalogId: string;
  modelId: string;
  mode: ModelActivationMode;
  userConsentPresent: boolean;
  providerCredentialReference?: string;
  egressConsent: boolean;
  localRuntimeAvailable: boolean;
  freeApiEvidencePresent: boolean;
}

export interface ModelHealthEvidence {
  organizationId: string;
  catalogId: string;
  modelId: string;
  checkedAt: number;
  latencyMs: number;
  status: "available" | "rate_limited" | "unreachable" | "retired";
  probeHash: string;
  capabilityResponseHash: string;
}

export interface ModelCatalogDecision {
  allowed: boolean;
  reasons: string[];
  publicationState: CatalogPublicationState;
  freeApiBadge: FreeApiStatus;
  requiresReview: boolean;
  auditHash: string;
}

export class ModelCatalogGovernanceContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelCatalogGovernanceContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new ModelCatalogGovernanceContractError(`${label} is required`);
}

export function validateModelCatalogRecord(record: ModelCatalogRecord): ModelCatalogDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[record.organizationId, "organizationId"], [record.catalogId, "catalogId"], [record.provider, "provider"], [record.modelId, "modelId"], [record.displayName, "displayName"], [record.description, "description"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (record.categories.length === 0) reasons.push("catalog record needs at least one category");
  if (record.sourceEvidenceHashes.length === 0) reasons.push("catalog record needs source evidence");
  if (record.freeApiStatus === "free" && !record.freeApiEvidenceHash) reasons.push("free API badge needs evidence");
  if (!Number.isFinite(record.lastVerifiedAt)) reasons.push("lastVerifiedAt must be finite");
  if (record.retired && record.publicationState === "enabled") reasons.push("retired model cannot remain enabled");
  return { allowed: reasons.length === 0, reasons, publicationState: reasons.length === 0 ? record.publicationState : "candidate", freeApiBadge: record.freeApiStatus, requiresReview: record.publicationState !== "candidate", auditHash: hash(JSON.stringify({ record, reasons })) };
}

export function decideCatalogPublication(record: ModelCatalogRecord, officialEvidencePresent: boolean, reviewerApproved: boolean): ModelCatalogDecision {
  const reasons: string[] = [];
  if (!officialEvidencePresent) reasons.push("catalog publication requires official or reviewed source evidence");
  if (!reviewerApproved) reasons.push("catalog publication requires reviewer approval");
  if (record.sourceEvidenceHashes.length === 0) reasons.push("publication requires source evidence hashes");
  if (record.freeApiStatus === "free" && !record.freeApiEvidenceHash) reasons.push("free API badge cannot be published without evidence");
  return { allowed: reasons.length === 0, reasons, publicationState: reasons.length === 0 ? "listed" : "candidate", freeApiBadge: record.freeApiStatus, requiresReview: true, auditHash: hash(JSON.stringify({ record, officialEvidencePresent, reviewerApproved, reasons })) };
}

export function decideModelActivation(request: ModelActivationRequest, record: ModelCatalogRecord): ModelCatalogDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.userId, "userId"], [request.catalogId, "catalogId"], [request.modelId, "modelId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (record.catalogId !== request.catalogId || record.modelId !== request.modelId) reasons.push("activation target does not match catalog record");
  if (!request.userConsentPresent) reasons.push("model activation requires user consent");
  if (request.mode === "free_api" && (!request.freeApiEvidencePresent || !["free", "free_tier"].includes(record.freeApiStatus))) reasons.push("free API activation requires verified free API evidence");
  if (request.mode === "byok" && (!request.providerCredentialReference || !request.egressConsent)) reasons.push("BYOK activation requires opaque credential reference and egress consent");
  if (request.mode === "local" && (!request.localRuntimeAvailable || request.egressConsent)) reasons.push("local activation requires local runtime and no external egress");
  if (record.retired || record.publicationState === "candidate") reasons.push("candidate or retired model cannot be enabled");
  if (request.providerCredentialReference && /password|secret|token|api[_-]?key/i.test(request.providerCredentialReference)) reasons.push("provider credential reference must be opaque");
  return { allowed: reasons.length === 0, reasons, publicationState: reasons.length === 0 ? "enabled" : record.publicationState, freeApiBadge: record.freeApiStatus, requiresReview: request.mode !== "local", auditHash: hash(JSON.stringify({ request, record, reasons })) };
}

export function validateModelHealthEvidence(evidence: ModelHealthEvidence, now: number): ModelCatalogDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.catalogId, "catalogId"], [evidence.modelId, "modelId"], [evidence.probeHash, "probeHash"], [evidence.capabilityResponseHash, "capabilityResponseHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(now) || !Number.isFinite(evidence.checkedAt) || evidence.checkedAt > now) reasons.push("health evidence timestamp is invalid");
  if (!Number.isInteger(evidence.latencyMs) || evidence.latencyMs < 0) reasons.push("latency is invalid");
  if (evidence.status === "available" && evidence.capabilityResponseHash.length < 4) reasons.push("available model needs capability response evidence");
  return { allowed: reasons.length === 0, reasons, publicationState: evidence.status === "available" ? "verified" : "candidate", freeApiBadge: "unknown", requiresReview: true, auditHash: hash(JSON.stringify({ evidence, now, reasons })) };
}

export function decideCatalogRefresh(organizationId: string, catalogId: string, sourceEvidenceHashes: string[], previousVerifiedAt: number, now: number, reviewerApproved: boolean): ModelCatalogDecision {
  required(organizationId, "organizationId");
  required(catalogId, "catalogId");
  const reasons: string[] = [];
  if (sourceEvidenceHashes.length === 0) reasons.push("catalog refresh requires source evidence");
  if (!Number.isFinite(previousVerifiedAt) || !Number.isFinite(now) || now < previousVerifiedAt) reasons.push("catalog refresh time is invalid");
  if (!reviewerApproved) reasons.push("catalog refresh requires review");
  return { allowed: reasons.length === 0, reasons, publicationState: reasons.length === 0 ? "verified" : "candidate", freeApiBadge: "unknown", requiresReview: true, auditHash: hash(JSON.stringify({ organizationId, catalogId, sourceEvidenceHashes, previousVerifiedAt, now, reviewerApproved, reasons })) };
}
