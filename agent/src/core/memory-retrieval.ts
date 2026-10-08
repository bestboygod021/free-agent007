/** Tenant-bound, provenance-aware lexical memory retrieval. No external vector database is used. */

export type MemoryTrust = "untrusted" | "observed" | "verified";
export type MemoryKind = "project_fact" | "run_summary" | "user_preference" | "decision";

export interface MemorySource {
  sourceType: "user" | "tool" | "model" | "test";
  sourceId: string;
  evidenceHash: string;
}

export interface MemoryRecord {
  memoryId: string;
  organizationId: string;
  projectId: string;
  kind: MemoryKind;
  content: string;
  source: MemorySource;
  trust: MemoryTrust;
  createdAt: number;
  expiresAt?: number;
  tags: string[];
  contentHash: string;
}

export interface MemoryQuery {
  organizationId: string;
  projectId: string;
  query: string;
  now: number;
  maxResults: number;
  allowedTrust: MemoryTrust[];
}

export interface MemoryHit {
  memoryId: string;
  content: string;
  score: number;
  trust: MemoryTrust;
  source: MemorySource;
  provenanceRequired: true;
}

export class MemoryRetrievalContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryRetrievalContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function terms(value: string): string[] {
  return [...new Set(value.toLocaleLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter((term) => term.length >= 2))];
}

function secretLike(value: string): boolean {
  return /-----BEGIN [^-]*PRIVATE KEY-----|(?:password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]/i.test(value);
}

export function createMemoryRecord(input: Omit<MemoryRecord, "contentHash">): MemoryRecord {
  if (!input.memoryId.trim() || !input.organizationId.trim() || !input.projectId.trim()) throw new MemoryRetrievalContractError("memory identity is required");
  if (!input.content.trim() || secretLike(input.content)) throw new MemoryRetrievalContractError("memory content is empty or secret-like");
  if (!input.source.sourceId.trim() || !input.source.evidenceHash.trim()) throw new MemoryRetrievalContractError("memory provenance is required");
  if (!Number.isFinite(input.createdAt) || input.createdAt < 0 || (input.expiresAt !== undefined && input.expiresAt < input.createdAt)) throw new MemoryRetrievalContractError("invalid memory timestamps");
  return { ...structuredClone(input), contentHash: hash(input.content) };
}

export function retrieveMemories(records: readonly MemoryRecord[], query: MemoryQuery): MemoryHit[] {
  if (!query.organizationId.trim() || !query.projectId.trim() || !query.query.trim()) throw new MemoryRetrievalContractError("memory query identity and text are required");
  if (!Number.isInteger(query.maxResults) || query.maxResults < 1 || query.maxResults > 100) throw new MemoryRetrievalContractError("maxResults must be between 1 and 100");
  if (!Number.isFinite(query.now) || query.now < 0) throw new MemoryRetrievalContractError("now must be non-negative");
  const queryTerms = terms(query.query);
  if (queryTerms.length === 0) return [];
  return records
    .filter((record) => record.organizationId === query.organizationId && record.projectId === query.projectId && query.allowedTrust.includes(record.trust) && (record.expiresAt === undefined || query.now < record.expiresAt))
    .map((record) => {
      const recordTerms = new Set(terms(`${record.content} ${record.tags.join(" ")}`));
      const matches = queryTerms.filter((term) => recordTerms.has(term)).length;
      const trustBonus = record.trust === "verified" ? 0.2 : record.trust === "observed" ? 0.1 : 0;
      return { record, score: matches / queryTerms.length + trustBonus };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.record.memoryId.localeCompare(b.record.memoryId))
    .slice(0, query.maxResults)
    .map(({ record, score }) => ({ memoryId: record.memoryId, content: record.content, score, trust: record.trust, source: record.source, provenanceRequired: true as const }));
}
