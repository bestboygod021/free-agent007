/** M116 contracts for cross-platform sync, cursor/conflict handling and connection health. */

export type M116SyncDirection = "pull" | "push" | "bidirectional";
export type M116ConflictKind = "version" | "permission" | "deleted" | "schema";
export type M116HealthState = "healthy" | "degraded" | "reconnect" | "revoked";

export interface M116SyncConnectionContract {
  organizationId: string;
  connectionId: string;
  provider: string;
  direction: M116SyncDirection;
  scopeHash: string;
  credentialReference: string;
  consentRecorded: boolean;
  webhookVerified: boolean;
  cursorNamespace: string;
  revoked: boolean;
  localFallback: "local" | "read_only" | "none";
}

export interface M116SyncCursorContract {
  organizationId: string;
  connectionId: string;
  cursorId: string;
  providerCursor: string;
  localSequence: number;
  lastEventHash: string;
  dedupeWindowSeconds: number;
  observedAt: number;
  monotonic: boolean;
}

export interface M116ConflictRecord {
  organizationId: string;
  conflictId: string;
  connectionId: string;
  kind: M116ConflictKind;
  localVersion: string;
  remoteVersion: string;
  resourceReference: string;
  localHash: string;
  remoteHash: string;
  resolution: "hold" | "local" | "remote" | "merged";
  humanReviewed: boolean;
  dataRedacted: boolean;
}

export interface M116ConnectionHealthEvidence {
  organizationId: string;
  connectionId: string;
  state: M116HealthState;
  checkedAt: number;
  latencyMs: number;
  consecutiveFailures: number;
  lastSuccessAt?: number;
  retryAfterMs?: number;
  revokedConfirmed: boolean;
  fallbackAvailable: boolean;
}

export interface M116SyncDecision {
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

export function validateM116Connection(connection: M116SyncConnectionContract): M116SyncDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[connection.organizationId, "organizationId"], [connection.connectionId, "connectionId"], [connection.provider, "provider"], [connection.scopeHash, "scopeHash"], [connection.credentialReference, "credentialReference"], [connection.cursorNamespace, "cursorNamespace"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!connection.consentRecorded || !connection.webhookVerified) reasons.push("sync connection consent and webhook evidence is incomplete");
  if (/password|secret|token|api[_-]?key/i.test(connection.credentialReference)) reasons.push("sync credential reference must be opaque");
  if (connection.revoked) reasons.push("sync connection is revoked");
  if (connection.direction === "bidirectional" && connection.localFallback === "none") reasons.push("bidirectional sync needs a fallback");
  return { allowed: reasons.length === 0, reasons, requiresApproval: connection.direction !== "pull", auditHash: hash(JSON.stringify({ connection, reasons })) };
}

export function validateM116Cursor(cursor: M116SyncCursorContract): M116SyncDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[cursor.organizationId, "organizationId"], [cursor.connectionId, "connectionId"], [cursor.cursorId, "cursorId"], [cursor.providerCursor, "providerCursor"], [cursor.lastEventHash, "lastEventHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(cursor.localSequence) || cursor.localSequence < 0) reasons.push("local sequence must be non-negative");
  if (!Number.isInteger(cursor.dedupeWindowSeconds) || cursor.dedupeWindowSeconds < 1) reasons.push("dedupe window must be positive");
  if (!Number.isFinite(cursor.observedAt) || !cursor.monotonic) reasons.push("cursor must be timestamped and monotonic");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ cursor, reasons })) };
}

export function decideM116Conflict(conflict: M116ConflictRecord): M116SyncDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[conflict.organizationId, "organizationId"], [conflict.conflictId, "conflictId"], [conflict.connectionId, "connectionId"], [conflict.localVersion, "localVersion"], [conflict.remoteVersion, "remoteVersion"], [conflict.resourceReference, "resourceReference"], [conflict.localHash, "localHash"], [conflict.remoteHash, "remoteHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (conflict.localHash === conflict.remoteHash) reasons.push("identical versions are not a conflict");
  if (!conflict.dataRedacted) reasons.push("conflict data must be redacted");
  if (conflict.resolution !== "hold" && !conflict.humanReviewed) reasons.push("conflict resolution needs human review");
  if (conflict.kind === "permission" && conflict.resolution === "merged") reasons.push("permission conflicts cannot be auto-merged");
  return { allowed: reasons.length === 0, reasons, requiresApproval: conflict.resolution === "remote" || conflict.resolution === "merged", auditHash: hash(JSON.stringify({ conflict, reasons })) };
}

export function validateM116Health(evidence: M116ConnectionHealthEvidence, now = Date.now()): M116SyncDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.connectionId, "connectionId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(evidence.checkedAt) || evidence.checkedAt > now || !Number.isFinite(evidence.latencyMs) || evidence.latencyMs < 0) reasons.push("health timestamp/latency is invalid");
  if (!Number.isInteger(evidence.consecutiveFailures) || evidence.consecutiveFailures < 0) reasons.push("failure count is invalid");
  if (evidence.state === "reconnect" && (!Number.isFinite(evidence.retryAfterMs) || evidence.retryAfterMs! < 0)) reasons.push("reconnect state needs Retry-After");
  if (evidence.state === "revoked" && !evidence.revokedConfirmed) reasons.push("revoked state needs confirmation");
  if (evidence.state !== "healthy" && !evidence.fallbackAvailable) reasons.push("degraded connection needs a fallback");
  return { allowed: reasons.length === 0, reasons, requiresApproval: evidence.state === "revoked", auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
