/** M109 contracts for repository intelligence, context assembly and citation quality. */

export type M109ContextSourceKind = "repository" | "memory" | "run" | "document";
export type M109ContextTrust = "verified" | "observed" | "untrusted";

export interface M109ContextSourceContract {
  organizationId: string;
  sourceId: string;
  kind: M109ContextSourceKind;
  locator: string;
  contentHash: string;
  snapshotHash: string;
  ownerTenantId: string;
  accessSubjectHash: string;
  trust: M109ContextTrust;
  redacted: boolean;
  freshUntil: number;
  deleted: boolean;
}

export interface M109ContextAssemblyRequest {
  organizationId: string;
  taskId: string;
  sourceIds: string[];
  requiredLayers: M109ContextSourceKind[];
  tokenBudget: number;
  pathAllowlist: string[];
  localOnly: boolean;
  staleAllowed: boolean;
  citationRequired: boolean;
}

export interface M109RepositoryIndexEvidence {
  organizationId: string;
  repositoryId: string;
  snapshotHash: string;
  parserVersion: string;
  symbolCount: number;
  importEdgeCount: number;
  indexedPaths: string[];
  complete: boolean;
  untrustedFilesExcluded: boolean;
  pathTraversalChecked: boolean;
}

export interface M109ContextQualityEvidence {
  organizationId: string;
  taskId: string;
  selectedSourceIds: string[];
  citationHashes: string[];
  tokenBudget: number;
  tokenUsed: number;
  staleSourceCount: number;
  omittedSourceCount: number;
  qualityReviewed: boolean;
}

export interface M109ContextDecision {
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

export function validateM109ContextSource(source: M109ContextSourceContract, now = Date.now()): M109ContextDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[source.organizationId, "organizationId"], [source.sourceId, "sourceId"], [source.locator, "locator"], [source.contentHash, "contentHash"], [source.snapshotHash, "snapshotHash"], [source.ownerTenantId, "ownerTenantId"], [source.accessSubjectHash, "accessSubjectHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (source.ownerTenantId !== source.organizationId) reasons.push("context source tenant does not match organization");
  if (!source.redacted || source.deleted) reasons.push("context source must be redacted and live");
  if (!Number.isFinite(source.freshUntil) || source.freshUntil <= now) reasons.push("context source is stale");
  if (source.trust === "untrusted") reasons.push("untrusted source cannot enter assembled context");
  if (source.locator.startsWith("/") || source.locator.includes("..")) reasons.push("context locator must be workspace-relative");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ source, reasons })) };
}

export function decideM109ContextAssembly(request: M109ContextAssemblyRequest): M109ContextDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.taskId, "taskId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.sourceIds.length === 0) reasons.push("context assembly needs at least one source");
  if (request.requiredLayers.length === 0) reasons.push("context assembly needs an explicit layer list");
  if (!Number.isInteger(request.tokenBudget) || request.tokenBudget < 128) reasons.push("context token budget must be at least 128");
  if (request.pathAllowlist.length === 0 || request.pathAllowlist.some((path) => path.startsWith("/") || path.includes(".."))) reasons.push("context paths must be relative and allowlisted");
  if (request.localOnly && !request.staleAllowed && request.requiredLayers.includes("document")) reasons.push("local-only fresh document retrieval needs a local index evidence");
  if (request.citationRequired && request.sourceIds.length !== request.requiredLayers.length && request.requiredLayers.length > request.sourceIds.length) reasons.push("required context layers are missing citations");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateM109RepositoryIndex(evidence: M109RepositoryIndexEvidence): M109ContextDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.repositoryId, "repositoryId"], [evidence.snapshotHash, "snapshotHash"], [evidence.parserVersion, "parserVersion"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(evidence.symbolCount) || evidence.symbolCount < 0 || !Number.isInteger(evidence.importEdgeCount) || evidence.importEdgeCount < 0) reasons.push("repository index counts are invalid");
  if (!evidence.complete || !evidence.untrustedFilesExcluded || !evidence.pathTraversalChecked) reasons.push("repository index safety evidence is incomplete");
  if (evidence.indexedPaths.some((path) => path.startsWith("/") || path.includes(".."))) reasons.push("repository index contains unsafe paths");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function validateM109ContextQuality(evidence: M109ContextQualityEvidence): M109ContextDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.taskId, "taskId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (evidence.selectedSourceIds.length === 0 || evidence.citationHashes.length < evidence.selectedSourceIds.length) reasons.push("each selected context source needs a citation");
  if (!Number.isInteger(evidence.tokenBudget) || evidence.tokenUsed < 0 || evidence.tokenUsed > evidence.tokenBudget) reasons.push("context token usage exceeds budget");
  if (!Number.isInteger(evidence.staleSourceCount) || evidence.staleSourceCount < 0 || !Number.isInteger(evidence.omittedSourceCount) || evidence.omittedSourceCount < 0) reasons.push("context omission counts are invalid");
  if (!evidence.qualityReviewed) reasons.push("context quality requires review");
  return { allowed: reasons.length === 0, reasons, requiresApproval: evidence.staleSourceCount > 0, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
