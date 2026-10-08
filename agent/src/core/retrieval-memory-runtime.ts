/** M94 contracts for semantic memory, governed retrieval and human feedback. */

export type RetrievalMemoryKind = "working" | "episodic" | "semantic" | "artifact";
export type RetrievalMemoryTrust = "workspace" | "verified" | "user_feedback" | "untrusted";
export type RetrievalFeedbackKind = "correct" | "incorrect" | "stale" | "unsafe";

export interface SecureMemoryRecord {
  organizationId: string;
  projectId: string;
  memoryId: string;
  kind: RetrievalMemoryKind;
  contentHash: string;
  embeddingHash?: string;
  sourceHash: string;
  trust: RetrievalMemoryTrust;
  aclSubjectHash: string;
  tokenCount: number;
  expiresAt?: number;
  deleted: boolean;
  piiRedacted: boolean;
}

export interface SecureRetrievalRequest {
  organizationId: string;
  projectId: string;
  requesterId: string;
  queryHash: string;
  maxResults: number;
  maxTokens: number;
  localOnly: boolean;
  candidates: Array<{ memoryId: string; organizationId: string; relevance: number; tokenCount: number; aclAllowed: boolean; trust: RetrievalMemoryTrust; stale: boolean }>;
}

export interface RetrievalQualityEvidence {
  organizationId: string;
  queryHash: string;
  selectedMemoryIds: string[];
  relevantCount: number;
  irrelevantCount: number;
  staleCount: number;
  tenantIsolationPassed: boolean;
  citationCoverage: number;
  evidenceHash: string;
}

export interface RetrievalFeedbackRecord {
  organizationId: string;
  memoryId: string;
  feedbackId: string;
  kind: RetrievalFeedbackKind;
  reviewerHash: string;
  reasonHash: string;
  observedAt: number;
  approvalPresent: boolean;
}

export interface RetrievalMemoryDecision {
  allowed: boolean;
  reasons: string[];
  selectedMemoryIds: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class RetrievalMemoryContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetrievalMemoryContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function validateSecureMemoryRecord(memory: SecureMemoryRecord): RetrievalMemoryDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[memory.organizationId, "organizationId"], [memory.projectId, "projectId"], [memory.memoryId, "memoryId"], [memory.contentHash, "contentHash"], [memory.sourceHash, "sourceHash"], [memory.aclSubjectHash, "aclSubjectHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isSafeInteger(memory.tokenCount) || memory.tokenCount < 1) reasons.push("memory token count is invalid");
  if (memory.trust === "untrusted") reasons.push("untrusted memory cannot be retrieval authority");
  if (!memory.piiRedacted) reasons.push("memory requires PII redaction");
  if (!memory.embeddingHash && memory.kind === "semantic") reasons.push("semantic memory requires embedding hash");
  if (memory.expiresAt !== undefined && !Number.isFinite(memory.expiresAt)) reasons.push("memory expiry is invalid");
  if (memory.deleted) reasons.push("deleted memory cannot be retrieved");
  return { allowed: reasons.length === 0, reasons, selectedMemoryIds: memory.deleted ? [] : [memory.memoryId], requiresApproval: memory.kind === "semantic", auditHash: hash(JSON.stringify({ memory, reasons })) };
}

export function decideSecureRetrieval(request: SecureRetrievalRequest, now: number): RetrievalMemoryDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.projectId, "projectId"], [request.requesterId, "requesterId"], [request.queryHash, "queryHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isSafeInteger(request.maxResults) || request.maxResults < 1 || request.maxResults > 100) reasons.push("retrieval result bound is invalid");
  if (!Number.isSafeInteger(request.maxTokens) || request.maxTokens < 1 || request.maxTokens > 100_000) reasons.push("retrieval token bound is invalid");
  const selectedMemoryIds: string[] = [];
  let tokens = 0;
  for (const candidate of [...request.candidates].sort((a, b) => b.relevance - a.relevance || a.memoryId.localeCompare(b.memoryId))) {
    if (candidate.organizationId !== request.organizationId || !candidate.aclAllowed || candidate.trust === "untrusted" || candidate.stale || candidate.tokenCount < 1) continue;
    if (selectedMemoryIds.length >= request.maxResults || tokens + candidate.tokenCount > request.maxTokens) continue;
    selectedMemoryIds.push(candidate.memoryId);
    tokens += candidate.tokenCount;
  }
  if (selectedMemoryIds.length === 0) reasons.push("no trusted ACL-allowed memory fits retrieval budget");
  if (!Number.isFinite(now)) reasons.push("retrieval clock is invalid");
  return { allowed: reasons.length === 0, reasons, selectedMemoryIds, requiresApproval: !request.localOnly, auditHash: hash(JSON.stringify({ request: { organizationId: request.organizationId, projectId: request.projectId, queryHash: request.queryHash }, selectedMemoryIds, tokens, reasons })) };
}

export function validateRetrievalQualityEvidence(evidence: RetrievalQualityEvidence): RetrievalMemoryDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.queryHash, "queryHash"], [evidence.evidenceHash, "evidenceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isSafeInteger(evidence.relevantCount) || !Number.isSafeInteger(evidence.irrelevantCount) || !Number.isSafeInteger(evidence.staleCount) || evidence.relevantCount < 0 || evidence.irrelevantCount < 0 || evidence.staleCount < 0) reasons.push("retrieval counts are invalid");
  if (!Number.isFinite(evidence.citationCoverage) || evidence.citationCoverage < 0 || evidence.citationCoverage > 1) reasons.push("citation coverage is invalid");
  if (!evidence.tenantIsolationPassed) reasons.push("retrieval tenant isolation failed");
  return { allowed: reasons.length === 0, reasons, selectedMemoryIds: evidence.selectedMemoryIds, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function decideRetrievalFeedback(feedback: RetrievalFeedbackRecord): RetrievalMemoryDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[feedback.organizationId, "organizationId"], [feedback.memoryId, "memoryId"], [feedback.feedbackId, "feedbackId"], [feedback.reviewerHash, "reviewerHash"], [feedback.reasonHash, "reasonHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(feedback.observedAt)) reasons.push("feedback timestamp is invalid");
  if (["stale", "unsafe"].includes(feedback.kind) && !feedback.approvalPresent) reasons.push("stale/unsafe memory feedback requires review approval");
  return { allowed: reasons.length === 0, reasons, selectedMemoryIds: [feedback.memoryId], requiresApproval: feedback.kind !== "correct", auditHash: hash(JSON.stringify({ feedback, reasons })) };
}
