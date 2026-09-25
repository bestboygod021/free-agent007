/** M57 contracts for a comprehensive, searchable AI directory and model cards. */

import type { FreeApiStatus } from "./model-discovery-runtime.js";

export type AiDirectoryCategory = "chat" | "code" | "image" | "video" | "audio" | "speech" | "embedding" | "vision" | "search" | "agentic" | "3d" | "translation" | "productivity" | "education" | "security" | "science" | "local_runtime";
export type DirectoryListingState = "candidate" | "listed" | "verified" | "retired";

export interface AiDirectoryEntry {
  entryId: string;
  provider: string;
  modelId: string;
  displayName: string;
  shortDescription: string;
  categories: readonly AiDirectoryCategory[];
  modalities: string[];
  contextWindow?: number;
  license?: string;
  regions: string[];
  freeApiStatus: FreeApiStatus;
  freeApiEvidenceHash?: string;
  sourceUrl: string;
  modelCardHash: string;
  listingState: DirectoryListingState;
  updatedAt: number;
}

export interface AiDirectoryQuery {
  query: string;
  categories: AiDirectoryCategory[];
  freeApiOnly: boolean;
  modalities: string[];
  region?: string;
  includeCandidates: boolean;
  maxResults: number;
}

export interface AiDirectoryDecision {
  allowed: boolean;
  reasons: string[];
  searchable: boolean;
  freeApiBadge: FreeApiStatus;
  auditHash: string;
}

export class AiDirectoryContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiDirectoryContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new AiDirectoryContractError(`${label} is required`);
}

export function validateAiDirectoryEntry(entry: AiDirectoryEntry): AiDirectoryDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[entry.entryId, "entryId"], [entry.provider, "provider"], [entry.modelId, "modelId"], [entry.displayName, "displayName"], [entry.shortDescription, "shortDescription"], [entry.sourceUrl, "sourceUrl"], [entry.modelCardHash, "modelCardHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!entry.sourceUrl.startsWith("https://")) reasons.push("directory source URL must use HTTPS");
  if (entry.shortDescription.length > 600) reasons.push("directory description is too long");
  if (entry.categories.length === 0 || new Set(entry.categories).size !== entry.categories.length) reasons.push("directory entry needs unique categories");
  if (entry.freeApiStatus === "free" && !entry.freeApiEvidenceHash) reasons.push("free API badge requires evidence hash");
  if (!Number.isFinite(entry.updatedAt)) reasons.push("updatedAt must be finite");
  return { allowed: reasons.length === 0, reasons, searchable: reasons.length === 0, freeApiBadge: entry.freeApiStatus, auditHash: hash(JSON.stringify({ entry, reasons })) };
}

export function validateAiDirectoryQuery(query: AiDirectoryQuery): AiDirectoryDecision {
  const reasons: string[] = [];
  required(query.query, "query");
  if (query.categories.some((category) => !category)) reasons.push("directory category filter is invalid");
  if (!Number.isInteger(query.maxResults) || query.maxResults < 1 || query.maxResults > 200) reasons.push("directory result bound is invalid");
  if (query.freeApiOnly && query.categories.length === 0 && query.modalities.length === 0 && query.query.trim().length < 2) reasons.push("free API search needs a meaningful filter");
  return { allowed: reasons.length === 0, reasons, searchable: reasons.length === 0, freeApiBadge: query.freeApiOnly ? "free_tier" : "unknown", auditHash: hash(JSON.stringify({ query, reasons })) };
}

export function decideDirectoryPublication(entry: AiDirectoryEntry, humanReviewPresent: boolean): AiDirectoryDecision {
  const validation = validateAiDirectoryEntry(entry);
  const reasons = [...validation.reasons];
  if (entry.listingState === "listed" || entry.listingState === "verified") {
    if (!humanReviewPresent) reasons.push("public directory listing requires review");
  }
  if (entry.freeApiStatus === "free" && !entry.freeApiEvidenceHash) reasons.push("free API label cannot be published without evidence");
  return { allowed: reasons.length === 0, reasons, searchable: reasons.length === 0, freeApiBadge: entry.freeApiStatus, auditHash: hash(JSON.stringify({ entry, humanReviewPresent, reasons })) };
}

export function rankAiDirectoryEntry(entry: AiDirectoryEntry, query: AiDirectoryQuery, healthScore: number, freshnessScore: number): AiDirectoryDecision {
  const reasons: string[] = [];
  if (entry.listingState === "retired") reasons.push("retired model cannot be ranked for active use");
  if (!Number.isFinite(healthScore) || healthScore < 0 || healthScore > 1) reasons.push("health score is invalid");
  if (!Number.isFinite(freshnessScore) || freshnessScore < 0 || freshnessScore > 1) reasons.push("freshness score is invalid");
  if (query.freeApiOnly && !["free", "free_tier"].includes(entry.freeApiStatus)) reasons.push("entry does not satisfy free API filter");
  if (query.region && !entry.regions.includes(query.region)) reasons.push("entry does not satisfy region filter");
  return { allowed: reasons.length === 0, reasons, searchable: reasons.length === 0, freeApiBadge: entry.freeApiStatus, auditHash: hash(JSON.stringify({ entry, query, healthScore, freshnessScore, reasons })) };
}
