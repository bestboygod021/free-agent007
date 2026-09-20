/** M171 fail-closed contracts for offline snapshots, sync and conflict resolution. */

export type M171SyncState = "local" | "queued" | "syncing" | "synced" | "conflict" | "blocked";
export type M171ConflictKind = "version" | "field" | "permission" | "deletion";

export interface M171ClientSnapshot {
  organizationId: string;
  clientId: string;
  snapshotId: string;
  baseRevision: string;
  localRevision: string;
  state: M171SyncState;
  entityHashes: string[];
  encrypted: boolean;
  tenantBound: boolean;
  deviceTrusted: boolean;
  capturedAt: number;
  expiresAt: number;
}

export interface M171SyncRequest {
  organizationId: string;
  syncId: string;
  clientId: string;
  snapshotId: string;
  baseRevision: string;
  operationsHash: string;
  cursor: string;
  idempotencyKey: string;
  state: M171SyncState;
  networkAllowed: boolean;
  tenantMatch: boolean;
  redacted: boolean;
}

export interface M171Conflict {
  organizationId: string;
  conflictId: string;
  syncId: string;
  kind: M171ConflictKind;
  localHash: string;
  remoteHash: string;
  baseHash: string;
  resolutionRequired: boolean;
  autoMergeAllowed: boolean;
  tenantMatch: boolean;
  protectedTarget: boolean;
}

export interface M171Resolution {
  organizationId: string;
  conflictId: string;
  resolutionId: string;
  strategy: "local" | "remote" | "merge" | "abort";
  mergedHash?: string;
  reviewerReference: string;
  approvalPresent: boolean;
  evidenceHash: string;
  noClobber: boolean;
}

export interface M171SyncDecision {
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

export function validateM171Snapshot(snapshot: M171ClientSnapshot, now: number): M171SyncDecision {
  const reasons: string[] = [];
  required([[snapshot.organizationId, "organizationId"], [snapshot.clientId, "clientId"], [snapshot.snapshotId, "snapshotId"], [snapshot.baseRevision, "baseRevision"], [snapshot.localRevision, "localRevision"]], reasons);
  if (snapshot.entityHashes.length === 0 || snapshot.entityHashes.some((value) => !value.trim())) reasons.push("snapshot entities are required");
  if (!snapshot.encrypted || !snapshot.tenantBound || !snapshot.deviceTrusted) reasons.push("snapshot needs encryption, tenant binding and trusted device");
  if (!Number.isFinite(snapshot.capturedAt) || !Number.isFinite(snapshot.expiresAt) || snapshot.expiresAt <= snapshot.capturedAt || snapshot.expiresAt <= now) reasons.push("snapshot lifetime is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ snapshot, now, reasons })) };
}

export function decideM171Sync(request: M171SyncRequest, now: number): M171SyncDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.syncId, "syncId"], [request.clientId, "clientId"], [request.snapshotId, "snapshotId"], [request.baseRevision, "baseRevision"], [request.operationsHash, "operationsHash"], [request.cursor, "cursor"], [request.idempotencyKey, "idempotencyKey"]], reasons);
  if (request.state !== "queued" && request.state !== "syncing") reasons.push("sync is not admissible");
  if (!request.networkAllowed || !request.tenantMatch || !request.redacted) reasons.push("sync needs network policy, tenant match and redaction");
  if (!Number.isFinite(now)) reasons.push("sync clock is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ request, now, reasons })) };
}

export function validateM171Conflict(conflict: M171Conflict): M171SyncDecision {
  const reasons: string[] = [];
  required([[conflict.organizationId, "organizationId"], [conflict.conflictId, "conflictId"], [conflict.syncId, "syncId"], [conflict.localHash, "localHash"], [conflict.remoteHash, "remoteHash"], [conflict.baseHash, "baseHash"]], reasons);
  if (!conflict.resolutionRequired || !conflict.tenantMatch) reasons.push("conflict needs resolution and tenant match");
  if (conflict.protectedTarget && conflict.autoMergeAllowed) reasons.push("protected target cannot auto-merge");
  return { allowed: reasons.length === 0, reasons, requiresApproval: conflict.protectedTarget, auditHash: hash(JSON.stringify({ conflict, reasons })) };
}

export function decideM171Resolution(resolution: M171Resolution): M171SyncDecision {
  const reasons: string[] = [];
  required([[resolution.organizationId, "organizationId"], [resolution.conflictId, "conflictId"], [resolution.resolutionId, "resolutionId"], [resolution.reviewerReference, "reviewerReference"], [resolution.evidenceHash, "evidenceHash"]], reasons);
  if (resolution.strategy === "merge" && !resolution.mergedHash) reasons.push("merge needs merged hash");
  if (!resolution.approvalPresent || !resolution.noClobber) reasons.push("resolution needs approval and no-clobber");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ resolution, reasons })) };
}
