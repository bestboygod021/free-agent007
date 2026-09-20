/** M36 contracts for repository intelligence, context packing and delegation. */

export interface RepositorySnapshot {
  organizationId: string;
  projectId: string;
  commitSha: string;
  rootHash: string;
  fileCount: number;
  capturedAt: number;
  sourceTrust: "workspace" | "git" | "uploaded" | "untrusted";
}

export interface RepositoryDecision {
  allowed: boolean;
  reasons: string[];
  decisionHash: string;
}

export interface RepositoryPathRequest {
  path: string;
  allowedPaths: string[];
  protectedPaths: string[];
  operation: "read" | "write" | "delete";
}

export interface ContextCandidate {
  id: string;
  path: string;
  contentHash: string;
  tokenCount: number;
  relevance: number;
  aclAllows: boolean;
  sourceTrust: "workspace" | "git" | "uploaded" | "untrusted";
}

export interface ContextPackRequest {
  organizationId: string;
  queryHash: string;
  candidates: ContextCandidate[];
  maxTokens: number;
  maxItems: number;
}

export interface ContextPackDecision {
  allowed: boolean;
  reasons: string[];
  selectedIds: string[];
  tokenCount: number;
  packHash: string;
}

export interface DelegationRequest {
  organizationId: string;
  parentAgentId: string;
  childAgentId: string;
  taskHash: string;
  inputContractHash: string;
  outputContractHash: string;
  requestedCapabilities: string[];
  grantedCapabilities: string[];
  sideEffect: boolean;
  approvalPresent: boolean;
}

export interface RepositoryMutationRequest {
  organizationId: string;
  projectId: string;
  branch: string;
  baseCommitSha: string;
  patchHash: string;
  operation: "draft" | "commit" | "merge";
  protectedBranch: boolean;
  approvalPresent: boolean;
}

export class RepositoryContextContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryContextContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new RepositoryContextContractError(`${label} is required`);
}

function unsafePath(path: string): boolean {
  return path.startsWith("/") || path.includes("\\") || path.split("/").some((segment) => segment === ".." || segment === "");
}

export function validateRepositorySnapshot(snapshot: RepositorySnapshot): RepositoryDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[snapshot.organizationId, "organizationId"], [snapshot.projectId, "projectId"], [snapshot.commitSha, "commitSha"], [snapshot.rootHash, "rootHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!/^[a-f0-9]{7,64}$/i.test(snapshot.commitSha)) reasons.push("commitSha must be a git-like hexadecimal identifier");
  if (!Number.isInteger(snapshot.fileCount) || snapshot.fileCount < 0) reasons.push("fileCount is invalid");
  if (!Number.isFinite(snapshot.capturedAt)) reasons.push("capturedAt must be finite");
  if (snapshot.sourceTrust === "untrusted") reasons.push("untrusted source cannot be used as repository authority");
  return { allowed: reasons.length === 0, reasons, decisionHash: hash(JSON.stringify({ snapshot, reasons })) };
}

export function validateRepositoryPath(request: RepositoryPathRequest): RepositoryDecision {
  required(request.path, "path");
  const reasons: string[] = [];
  if (unsafePath(request.path)) reasons.push("repository path must be relative and normalized");
  if (!request.allowedPaths.some((allowed) => request.path === allowed || request.path.startsWith(`${allowed}/`))) reasons.push("path is outside allowed paths");
  if (request.operation !== "read" && request.protectedPaths.some((protectedPath) => request.path === protectedPath || request.path.startsWith(`${protectedPath}/`))) reasons.push("mutation targets a protected path");
  return { allowed: reasons.length === 0, reasons, decisionHash: hash(JSON.stringify({ request, reasons })) };
}

export function planContextPack(request: ContextPackRequest): ContextPackDecision {
  required(request.organizationId, "organizationId");
  required(request.queryHash, "queryHash");
  const reasons: string[] = [];
  if (!Number.isInteger(request.maxTokens) || request.maxTokens < 1 || !Number.isInteger(request.maxItems) || request.maxItems < 1) reasons.push("context limits are invalid");
  const candidates = [...request.candidates].sort((a, b) => b.relevance - a.relevance || a.path.localeCompare(b.path) || a.id.localeCompare(b.id));
  const selectedIds: string[] = [];
  let tokenCount = 0;
  for (const candidate of candidates) {
    if (!candidate.aclAllows || candidate.sourceTrust === "untrusted" || candidate.tokenCount <= 0) continue;
    if (selectedIds.length >= request.maxItems || tokenCount + candidate.tokenCount > request.maxTokens) continue;
    selectedIds.push(candidate.id);
    tokenCount += candidate.tokenCount;
  }
  if (selectedIds.length === 0) reasons.push("no ACL-allowed trusted context candidate fits the budget");
  return { allowed: reasons.length === 0, reasons, selectedIds, tokenCount, packHash: hash(JSON.stringify({ organizationId: request.organizationId, queryHash: request.queryHash, selectedIds, tokenCount })) };
}

export function decideAgentDelegation(request: DelegationRequest): RepositoryDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.parentAgentId, "parentAgentId"], [request.childAgentId, "childAgentId"], [request.taskHash, "taskHash"], [request.inputContractHash, "inputContractHash"], [request.outputContractHash, "outputContractHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.parentAgentId === request.childAgentId) reasons.push("agent cannot delegate to itself");
  if (request.requestedCapabilities.some((capability) => !request.grantedCapabilities.includes(capability))) reasons.push("delegation requests an ungranted capability");
  if (request.sideEffect && !request.approvalPresent) reasons.push("delegated side effect requires approval");
  return { allowed: reasons.length === 0, reasons, decisionHash: hash(JSON.stringify({ request, reasons })) };
}

export function decideRepositoryMutation(request: RepositoryMutationRequest): RepositoryDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.projectId, "projectId"], [request.branch, "branch"], [request.baseCommitSha, "baseCommitSha"], [request.patchHash, "patchHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.operation !== "draft" && request.protectedBranch && !request.approvalPresent) reasons.push("protected branch mutation requires approval");
  if (request.operation === "merge" && !request.approvalPresent) reasons.push("merge requires explicit approval");
  if (request.branch === "main" || request.branch === "master") reasons.push("direct main/master mutation is forbidden");
  return { allowed: reasons.length === 0, reasons, decisionHash: hash(JSON.stringify({ request, reasons })) };
}
