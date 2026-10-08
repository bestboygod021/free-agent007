/** M185 fail-closed contracts for repository intelligence and retrieval evidence. */

export type M185SnapshotState = "captured" | "indexed" | "stale" | "purged";

export interface M185RepositorySnapshot {
  organizationId: string;
  snapshotId: string;
  repositoryReference: string;
  commitHash: string;
  snapshotHash: string;
  indexHash: string;
  aclHash: string;
  pathCount: number;
  state: M185SnapshotState;
  consentPresent: boolean;
  secretsRedacted: boolean;
  tenantBound: boolean;
}

export interface M185RetrievalRequest {
  organizationId: string;
  snapshotId: string;
  retrievalId: string;
  queryHash: string;
  expectedCommitHash: string;
  pathAllowlist: string[];
  resultCount: number;
  evidenceHashes: string[];
  exactCommit: boolean;
  aclChecked: boolean;
  fresh: boolean;
  redacted: boolean;
  tenantMatch: boolean;
}

export interface M185CodeEvidence {
  organizationId: string;
  snapshotId: string;
  evidenceId: string;
  path: string;
  lineStart: number;
  lineEnd: number;
  symbol: string;
  contentHash: string;
  snapshotMatch: boolean;
  aclChecked: boolean;
  redacted: boolean;
  tenantMatch: boolean;
}

export interface M185RefreshRequest {
  organizationId: string;
  snapshotId: string;
  refreshId: string;
  newCommitHash: string;
  oldIndexHash: string;
  newIndexHash: string;
  deletedPaths: string[];
  deletionEvidenceHash: string;
  approvalPresent: boolean;
  tenantMatch: boolean;
}

export interface M185RepositoryDecision {
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

export function validateM185Snapshot(snapshot: M185RepositorySnapshot): M185RepositoryDecision {
  const reasons: string[] = [];
  required([[snapshot.organizationId, "organizationId"], [snapshot.snapshotId, "snapshotId"], [snapshot.repositoryReference, "repositoryReference"], [snapshot.commitHash, "commitHash"], [snapshot.snapshotHash, "snapshotHash"], [snapshot.indexHash, "indexHash"], [snapshot.aclHash, "aclHash"]], reasons);
  if (!Number.isInteger(snapshot.pathCount) || snapshot.pathCount < 0 || snapshot.state === "purged" || !snapshot.consentPresent || !snapshot.secretsRedacted || !snapshot.tenantBound) reasons.push("snapshot needs path, consent, redaction and tenant evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ snapshot, reasons })) };
}

export function decideM185Retrieval(request: M185RetrievalRequest): M185RepositoryDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.snapshotId, "snapshotId"], [request.retrievalId, "retrievalId"], [request.queryHash, "queryHash"], [request.expectedCommitHash, "expectedCommitHash"]], reasons);
  if (request.pathAllowlist.length === 0 || request.pathAllowlist.some((path) => !path.trim()) || !Number.isInteger(request.resultCount) || request.resultCount < 0 || request.resultCount > 100 || request.evidenceHashes.length !== request.resultCount || !request.exactCommit || !request.aclChecked || !request.fresh || !request.redacted || !request.tenantMatch) reasons.push("retrieval needs bounded, exact-commit, ACL and redaction evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateM185CodeEvidence(evidence: M185CodeEvidence): M185RepositoryDecision {
  const reasons: string[] = [];
  required([[evidence.organizationId, "organizationId"], [evidence.snapshotId, "snapshotId"], [evidence.evidenceId, "evidenceId"], [evidence.path, "path"], [evidence.symbol, "symbol"], [evidence.contentHash, "contentHash"]], reasons);
  if (!Number.isInteger(evidence.lineStart) || !Number.isInteger(evidence.lineEnd) || evidence.lineStart < 1 || evidence.lineEnd < evidence.lineStart || !evidence.snapshotMatch || !evidence.aclChecked || !evidence.redacted || !evidence.tenantMatch) reasons.push("code evidence line, snapshot, ACL or privacy proof failed");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function decideM185Refresh(request: M185RefreshRequest): M185RepositoryDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.snapshotId, "snapshotId"], [request.refreshId, "refreshId"], [request.newCommitHash, "newCommitHash"], [request.oldIndexHash, "oldIndexHash"], [request.newIndexHash, "newIndexHash"], [request.deletionEvidenceHash, "deletionEvidenceHash"]], reasons);
  if (request.oldIndexHash === request.newIndexHash || !request.approvalPresent || !request.tenantMatch) reasons.push("refresh needs changed index, approval and tenant evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ request, reasons })) };
}
