/** M132 contracts for ACL-aware knowledge, freshness, context lineage and deletion markers. */

export type M132Trust = "workspace" | "git" | "approved_upload" | "untrusted";
export type M132SourceKind = "repository" | "memory" | "document" | "tool_output";

export interface M132KnowledgeSource {
  organizationId: string;
  projectId: string;
  sourceId: string;
  kind: M132SourceKind;
  contentHash: string;
  lineageHash: string;
  aclSubjectHash: string;
  trust: M132Trust;
  piiRedacted: boolean;
  deletionMarked: boolean;
  expiresAt?: number;
  capturedAt: number;
}

export interface M132ContextCandidate {
  organizationId: string;
  sourceId: string;
  path: string;
  tokenCount: number;
  relevance: number;
  aclAllowed: boolean;
  trust: M132Trust;
  stale: boolean;
  contentHash: string;
  lineageHash: string;
}

export interface M132ContextRequest {
  organizationId: string;
  queryHash: string;
  maxTokens: number;
  maxItems: number;
  candidates: M132ContextCandidate[];
  requireFresh: boolean;
}

export interface M132FreshnessAssessment {
  organizationId: string;
  sourceId: string;
  capturedAt: number;
  checkedAt: number;
  maxAgeSeconds: number;
  sourceRevisionHash: string;
  observedRevisionHash: string;
  stale: boolean;
  deletionMarked: boolean;
  refreshPlanHash: string;
}

export interface M132IndexEvidence {
  organizationId: string;
  projectId: string;
  snapshotHash: string;
  rootHash: string;
  fileCount: number;
  symbolCount: number;
  importEdgeCount: number;
  incremental: boolean;
  previousIndexHash?: string;
  aclFiltered: boolean;
  sourceTrust: M132Trust;
}

export interface M132KnowledgeDecision {
  allowed: boolean;
  reasons: string[];
  selectedSourceIds: string[];
  tokenCount: number;
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

export function validateM132Source(source: M132KnowledgeSource): M132KnowledgeDecision {
  const reasons: string[] = [];
  required([[source.organizationId, "organizationId"], [source.projectId, "projectId"], [source.sourceId, "sourceId"], [source.contentHash, "contentHash"], [source.lineageHash, "lineageHash"], [source.aclSubjectHash, "aclSubjectHash"]], reasons);
  if (source.trust === "untrusted") reasons.push("untrusted source cannot become knowledge authority");
  if (!source.piiRedacted || source.deletionMarked) reasons.push("source must be PII-redacted and not marked for deletion");
  if (!Number.isFinite(source.capturedAt)) reasons.push("source capturedAt is invalid");
  if (source.expiresAt !== undefined && !Number.isFinite(source.expiresAt)) reasons.push("source expiry is invalid");
  return { allowed: reasons.length === 0, reasons, selectedSourceIds: reasons.length === 0 ? [source.sourceId] : [], tokenCount: 0, auditHash: hash(JSON.stringify({ source, reasons })) };
}

export function decideM132Context(request: M132ContextRequest, now = Date.now()): M132KnowledgeDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.queryHash, "queryHash"]], reasons);
  if (!Number.isInteger(request.maxTokens) || request.maxTokens < 1 || !Number.isInteger(request.maxItems) || request.maxItems < 1) reasons.push("context limits are invalid");
  const selectedSourceIds: string[] = [];
  let tokenCount = 0;
  const candidates = [...request.candidates].sort((a, b) => b.relevance - a.relevance || a.path.localeCompare(b.path) || a.sourceId.localeCompare(b.sourceId));
  for (const candidate of candidates) {
    if (candidate.organizationId !== request.organizationId || !candidate.aclAllowed || candidate.trust === "untrusted" || candidate.tokenCount <= 0 || (request.requireFresh && candidate.stale)) continue;
    if (selectedSourceIds.length >= request.maxItems || tokenCount + candidate.tokenCount > request.maxTokens) continue;
    selectedSourceIds.push(candidate.sourceId);
    tokenCount += candidate.tokenCount;
  }
  if (selectedSourceIds.length === 0) reasons.push("no trusted ACL-allowed context fits the budget");
  if (!Number.isFinite(now)) reasons.push("context clock is invalid");
  return { allowed: reasons.length === 0, reasons, selectedSourceIds, tokenCount, auditHash: hash(JSON.stringify({ organizationId: request.organizationId, queryHash: request.queryHash, selectedSourceIds, tokenCount, reasons })) };
}

export function validateM132Freshness(assessment: M132FreshnessAssessment): M132KnowledgeDecision {
  const reasons: string[] = [];
  required([[assessment.organizationId, "organizationId"], [assessment.sourceId, "sourceId"], [assessment.sourceRevisionHash, "sourceRevisionHash"], [assessment.observedRevisionHash, "observedRevisionHash"], [assessment.refreshPlanHash, "refreshPlanHash"]], reasons);
  if (!Number.isFinite(assessment.capturedAt) || !Number.isFinite(assessment.checkedAt) || assessment.checkedAt < assessment.capturedAt) reasons.push("freshness timestamps are invalid");
  if (!Number.isInteger(assessment.maxAgeSeconds) || assessment.maxAgeSeconds < 1) reasons.push("max age must be positive");
  if (assessment.stale !== (assessment.sourceRevisionHash !== assessment.observedRevisionHash)) reasons.push("stale flag does not match revision evidence");
  if (assessment.deletionMarked) reasons.push("deleted source cannot be refreshed into context");
  return { allowed: reasons.length === 0, reasons, selectedSourceIds: reasons.length === 0 ? [assessment.sourceId] : [], tokenCount: 0, auditHash: hash(JSON.stringify({ assessment, reasons })) };
}

export function validateM132Index(index: M132IndexEvidence): M132KnowledgeDecision {
  const reasons: string[] = [];
  required([[index.organizationId, "organizationId"], [index.projectId, "projectId"], [index.snapshotHash, "snapshotHash"], [index.rootHash, "rootHash"]], reasons);
  if (![index.fileCount, index.symbolCount, index.importEdgeCount].every((value) => Number.isInteger(value) && value >= 0)) reasons.push("index counts must be non-negative integers");
  if (index.incremental && !index.previousIndexHash) reasons.push("incremental index needs previous index hash");
  if (!index.aclFiltered || index.sourceTrust === "untrusted") reasons.push("index must be ACL-filtered and trusted");
  return { allowed: reasons.length === 0, reasons, selectedSourceIds: reasons.length === 0 ? [index.snapshotHash] : [], tokenCount: 0, auditHash: hash(JSON.stringify({ index, reasons })) };
}
