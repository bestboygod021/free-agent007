/** M140 contracts for ACL-aware full-text search, result integrity and query governance. */

export type M140IndexSource = "workspace" | "run" | "artifact" | "knowledge";
export type M140QueryClass = "lookup" | "aggregate" | "export";
export type M140Sort = "relevance" | "updated_at" | "path";

export interface M140SearchIndexEvidence {
  organizationId: string;
  indexId: string;
  projectId: string;
  snapshotHash: string;
  source: M140IndexSource;
  documentCount: number;
  indexedAt: number;
  aclFiltered: boolean;
  tenantBound: boolean;
  contentHash: string;
  schemaVersion: string;
}

export interface M140SearchRequest {
  organizationId: string;
  queryHash: string;
  queryClass: M140QueryClass;
  indexId: string;
  aclSubjectHash: string;
  maxResults: number;
  maxBytes: number;
  sort: M140Sort;
  cursor?: string;
  requestedFields: string[];
  exportAllowed: boolean;
  approvalPresent: boolean;
}

export interface M140SearchResult {
  organizationId: string;
  queryHash: string;
  resultId: string;
  documentId: string;
  rank: number;
  score: number;
  contentHash: string;
  freshnessHash: string;
  aclVerified: boolean;
  tenantMatch: boolean;
  redacted: boolean;
}

export interface M140SearchAudit {
  organizationId: string;
  queryHash: string;
  queryClass: M140QueryClass;
  returnedCount: number;
  returnedBytes: number;
  rowLimit: number;
  exportAllowed: boolean;
  approvalPresent: boolean;
  resultHashes: string[];
  completedAt: number;
}

export interface M140SearchDecision {
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

export function validateM140Index(index: M140SearchIndexEvidence): M140SearchDecision {
  const reasons: string[] = [];
  required([[index.organizationId, "organizationId"], [index.indexId, "indexId"], [index.projectId, "projectId"], [index.snapshotHash, "snapshotHash"], [index.contentHash, "contentHash"], [index.schemaVersion, "schemaVersion"]], reasons);
  if (!Number.isInteger(index.documentCount) || index.documentCount < 0) reasons.push("document count must be non-negative");
  if (!Number.isFinite(index.indexedAt)) reasons.push("indexedAt is invalid");
  if (!index.aclFiltered || !index.tenantBound) reasons.push("index must be ACL-filtered and tenant-bound");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ index, reasons })) };
}

export function decideM140Query(request: M140SearchRequest, index: M140SearchIndexEvidence): M140SearchDecision {
  const reasons: string[] = [];
  const indexDecision = validateM140Index(index);
  reasons.push(...indexDecision.reasons);
  required([[request.organizationId, "organizationId"], [request.queryHash, "queryHash"], [request.indexId, "indexId"], [request.aclSubjectHash, "aclSubjectHash"]], reasons);
  if (request.organizationId !== index.organizationId || request.indexId !== index.indexId) reasons.push("query and index boundaries do not match");
  if (!Number.isInteger(request.maxResults) || request.maxResults < 1 || request.maxResults > 1000) reasons.push("max results must be between one and one thousand");
  if (!Number.isInteger(request.maxBytes) || request.maxBytes < 1 || request.maxBytes > 10_000_000) reasons.push("max bytes is outside the bounded query budget");
  if (request.requestedFields.length === 0) reasons.push("query must request an explicit field set");
  if (request.queryClass === "export" && (!request.exportAllowed || !request.approvalPresent)) reasons.push("export query needs permission and approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.queryClass === "export", auditHash: hash(JSON.stringify({ request, index: index.indexId, reasons })) };
}

export function validateM140Result(result: M140SearchResult): M140SearchDecision {
  const reasons: string[] = [];
  required([[result.organizationId, "organizationId"], [result.queryHash, "queryHash"], [result.resultId, "resultId"], [result.documentId, "documentId"], [result.contentHash, "contentHash"], [result.freshnessHash, "freshnessHash"]], reasons);
  if (!Number.isInteger(result.rank) || result.rank < 1) reasons.push("rank must be a positive integer");
  if (!Number.isFinite(result.score) || result.score < 0) reasons.push("score must be non-negative");
  if (!result.aclVerified || !result.tenantMatch || !result.redacted) reasons.push("result needs ACL, tenant and redaction evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ result, reasons })) };
}

export function validateM140SearchAudit(audit: M140SearchAudit): M140SearchDecision {
  const reasons: string[] = [];
  required([[audit.organizationId, "organizationId"], [audit.queryHash, "queryHash"]], reasons);
  if (![audit.returnedCount, audit.returnedBytes, audit.rowLimit].every((value) => Number.isInteger(value) && value >= 0)) reasons.push("search audit counts must be non-negative integers");
  if (audit.returnedCount > audit.rowLimit) reasons.push("returned count exceeds row limit");
  if (audit.queryClass === "export" && (!audit.exportAllowed || !audit.approvalPresent)) reasons.push("export audit needs permission and approval");
  if (audit.resultHashes.length !== audit.returnedCount) reasons.push("audit result hashes do not match returned count");
  if (!Number.isFinite(audit.completedAt)) reasons.push("completedAt is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: audit.queryClass === "export", auditHash: hash(JSON.stringify({ audit, reasons })) };
}
