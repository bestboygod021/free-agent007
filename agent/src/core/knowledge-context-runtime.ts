/** M79 contracts for secure knowledge fabric, repository indexing and context assembly. */

export type KnowledgeSourceKind = "repository" | "memory" | "document" | "tool_output";
export type KnowledgeTrust = "workspace" | "git" | "approved_upload" | "untrusted";

export interface KnowledgeSourceRecord {
  organizationId: string;
  projectId: string;
  sourceId: string;
  kind: KnowledgeSourceKind;
  contentHash: string;
  lineageHash: string;
  trust: KnowledgeTrust;
  aclSubjectHash: string;
  expiresAt?: number;
  retentionDays: number;
  piiRedacted: boolean;
}

export interface KnowledgeContextCandidate {
  organizationId: string;
  sourceId: string;
  path: string;
  tokenCount: number;
  relevance: number;
  aclAllowed: boolean;
  trust: KnowledgeTrust;
  stale: boolean;
  contentHash: string;
}

export interface KnowledgeContextRequest {
  organizationId: string;
  queryHash: string;
  maxTokens: number;
  maxItems: number;
  candidates: KnowledgeContextCandidate[];
}

export interface KnowledgeRepositoryIndex {
  organizationId: string;
  projectId: string;
  snapshotHash: string;
  rootHash: string;
  symbolCount: number;
  importEdgeCount: number;
  fileCount: number;
  capturedAt: number;
  incremental: boolean;
  previousIndexHash?: string;
  trust: KnowledgeTrust;
}

export interface KnowledgeDelegation {
  organizationId: string;
  parentAgentId: string;
  childAgentId: string;
  taskHash: string;
  requestedCapabilities: string[];
  grantedCapabilities: string[];
  expiresAt: number;
  sideEffect: boolean;
  approvalPresent: boolean;
}

export interface KnowledgeContextDecision {
  allowed: boolean;
  reasons: string[];
  selectedSourceIds: string[];
  tokenCount: number;
  decisionHash: string;
}

export class KnowledgeContextContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgeContextContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new KnowledgeContextContractError(`${label} is required`);
}

export function validateKnowledgeSource(source: KnowledgeSourceRecord): KnowledgeContextDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[source.organizationId, "organizationId"], [source.projectId, "projectId"], [source.sourceId, "sourceId"], [source.contentHash, "contentHash"], [source.lineageHash, "lineageHash"], [source.aclSubjectHash, "aclSubjectHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (source.trust === "untrusted") reasons.push("untrusted source cannot become knowledge authority");
  if (!Number.isInteger(source.retentionDays) || source.retentionDays < 1 || source.retentionDays > 3650) reasons.push("knowledge retention is outside bounds");
  if (!source.piiRedacted) reasons.push("knowledge source requires PII redaction");
  if (source.expiresAt !== undefined && !Number.isFinite(source.expiresAt)) reasons.push("source expiry is invalid");
  return { allowed: reasons.length === 0, reasons, selectedSourceIds: source.trust === "untrusted" ? [] : [source.sourceId], tokenCount: 0, decisionHash: hash(JSON.stringify({ source, reasons })) };
}

export function decideKnowledgeContextPack(request: KnowledgeContextRequest, now: number): KnowledgeContextDecision {
  const reasons: string[] = [];
  required(request.organizationId, "organizationId");
  required(request.queryHash, "queryHash");
  if (!Number.isInteger(request.maxTokens) || request.maxTokens < 1 || !Number.isInteger(request.maxItems) || request.maxItems < 1) reasons.push("context limits are invalid");
  const selectedSourceIds: string[] = [];
  let tokenCount = 0;
  const candidates = [...request.candidates].sort((a, b) => b.relevance - a.relevance || a.path.localeCompare(b.path) || a.sourceId.localeCompare(b.sourceId));
  for (const candidate of candidates) {
    if (candidate.organizationId !== request.organizationId || !candidate.aclAllowed || candidate.trust === "untrusted" || candidate.stale || !Number.isInteger(candidate.tokenCount) || candidate.tokenCount <= 0) continue;
    if (selectedSourceIds.length >= request.maxItems || tokenCount + candidate.tokenCount > request.maxTokens) continue;
    selectedSourceIds.push(candidate.sourceId);
    tokenCount += candidate.tokenCount;
  }
  if (selectedSourceIds.length === 0) reasons.push("no trusted ACL-allowed context fits the budget");
  if (!Number.isFinite(now)) reasons.push("context clock is invalid");
  return { allowed: reasons.length === 0, reasons, selectedSourceIds, tokenCount, decisionHash: hash(JSON.stringify({ request: { organizationId: request.organizationId, queryHash: request.queryHash }, selectedSourceIds, tokenCount, reasons })) };
}

export function validateKnowledgeRepositoryIndex(index: KnowledgeRepositoryIndex): KnowledgeContextDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[index.organizationId, "organizationId"], [index.projectId, "projectId"], [index.snapshotHash, "snapshotHash"], [index.rootHash, "rootHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(index.fileCount) || index.fileCount < 0 || !Number.isInteger(index.symbolCount) || index.symbolCount < 0 || !Number.isInteger(index.importEdgeCount) || index.importEdgeCount < 0) reasons.push("repository index counts are invalid");
  if (!Number.isFinite(index.capturedAt)) reasons.push("repository index timestamp is invalid");
  if (index.incremental && !index.previousIndexHash) reasons.push("incremental index needs previous index hash");
  if (index.trust === "untrusted") reasons.push("untrusted repository snapshot cannot be indexed as authority");
  return { allowed: reasons.length === 0, reasons, selectedSourceIds: [index.snapshotHash], tokenCount: 0, decisionHash: hash(JSON.stringify({ index, reasons })) };
}

export function validateKnowledgeDelegation(delegation: KnowledgeDelegation, now: number): KnowledgeContextDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[delegation.organizationId, "organizationId"], [delegation.parentAgentId, "parentAgentId"], [delegation.childAgentId, "childAgentId"], [delegation.taskHash, "taskHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (delegation.parentAgentId === delegation.childAgentId) reasons.push("agent cannot delegate to itself");
  if (delegation.requestedCapabilities.some((capability) => !delegation.grantedCapabilities.includes(capability))) reasons.push("delegation requests an ungranted capability");
  if (delegation.sideEffect && !delegation.approvalPresent) reasons.push("delegated side effect requires approval");
  if (!Number.isFinite(delegation.expiresAt) || delegation.expiresAt <= now) reasons.push("delegation is expired");
  return { allowed: reasons.length === 0, reasons, selectedSourceIds: [], tokenCount: 0, decisionHash: hash(JSON.stringify({ delegation, now, reasons })) };
}
