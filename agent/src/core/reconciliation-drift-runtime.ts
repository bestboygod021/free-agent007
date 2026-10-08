/** M201 fail-closed contracts for connector reconciliation and drift repair. */

export type M201ChangeDirection = "local_to_remote" | "remote_to_local" | "bidirectional";
export type M201ConflictState = "none" | "detected" | "review_required" | "resolved";

export interface M201ConnectorSnapshot {
  organizationId: string;
  connectorId: string;
  snapshotId: string;
  resourceType: string;
  cursor: string;
  localRevisionHash: string;
  remoteRevisionHash: string;
  aclHash: string;
  consentPresent: boolean;
  capturedAt: number;
  tenantBound: boolean;
}

export interface M201ChangeRecord {
  organizationId: string;
  connectorId: string;
  changeId: string;
  direction: M201ChangeDirection;
  operation: "create" | "update" | "delete";
  resourceReferenceHash: string;
  baseRevisionHash: string;
  localRevisionHash: string;
  remoteRevisionHash: string;
  conflictState: M201ConflictState;
  idempotencyKey: string;
  tenantMatch: boolean;
}

export interface M201ReconcileDecision {
  organizationId: string;
  connectorId: string;
  reconciliationId: string;
  snapshotId: string;
  changeIds: string[];
  conflicts: string[];
  mergePlanHash: string;
  reviewApproved: boolean;
  safeToApply: boolean;
  noClobber: boolean;
  tenantMatch: boolean;
}

export interface M201DriftEvidence {
  organizationId: string;
  connectorId: string;
  driftId: string;
  expectedRevisionHash: string;
  observedRevisionHash: string;
  detectedAt: number;
  repairedAt: number;
  repairEvidenceHash: string;
  residualDrift: boolean;
  redacted: boolean;
  tenantMatch: boolean;
}

export interface M201ReconciliationDecision {
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

export function validateM201Snapshot(snapshot: M201ConnectorSnapshot): M201ReconciliationDecision {
  const reasons: string[] = [];
  required([[snapshot.organizationId, "organizationId"], [snapshot.connectorId, "connectorId"], [snapshot.snapshotId, "snapshotId"], [snapshot.resourceType, "resourceType"], [snapshot.cursor, "cursor"], [snapshot.localRevisionHash, "localRevisionHash"], [snapshot.remoteRevisionHash, "remoteRevisionHash"], [snapshot.aclHash, "aclHash"]], reasons);
  if (!snapshot.consentPresent || !Number.isFinite(snapshot.capturedAt) || !snapshot.tenantBound) reasons.push("connector snapshot needs consent, capture time and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ snapshot, reasons })) };
}

export function validateM201Change(change: M201ChangeRecord): M201ReconciliationDecision {
  const reasons: string[] = [];
  required([[change.organizationId, "organizationId"], [change.connectorId, "connectorId"], [change.changeId, "changeId"], [change.resourceReferenceHash, "resourceReferenceHash"], [change.baseRevisionHash, "baseRevisionHash"], [change.localRevisionHash, "localRevisionHash"], [change.remoteRevisionHash, "remoteRevisionHash"], [change.idempotencyKey, "idempotencyKey"]], reasons);
  if (change.conflictState === "detected" && change.direction === "bidirectional" || !change.tenantMatch) reasons.push("bidirectional conflict or tenant mismatch cannot be applied automatically");
  return { allowed: reasons.length === 0, reasons, requiresApproval: change.conflictState !== "none", auditHash: hash(JSON.stringify({ change, reasons })) };
}

export function decideM201Reconcile(decision: M201ReconcileDecision): M201ReconciliationDecision {
  const reasons: string[] = [];
  required([[decision.organizationId, "organizationId"], [decision.connectorId, "connectorId"], [decision.reconciliationId, "reconciliationId"], [decision.snapshotId, "snapshotId"], [decision.mergePlanHash, "mergePlanHash"]], reasons);
  if (decision.changeIds.length === 0 || decision.conflicts.length > 0 || !decision.reviewApproved || !decision.safeToApply || !decision.noClobber || !decision.tenantMatch) reasons.push("reconciliation needs changes, conflict review, safe apply, no-clobber and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ decision, reasons })) };
}

export function validateM201Drift(evidence: M201DriftEvidence): M201ReconciliationDecision {
  const reasons: string[] = [];
  required([[evidence.organizationId, "organizationId"], [evidence.connectorId, "connectorId"], [evidence.driftId, "driftId"], [evidence.expectedRevisionHash, "expectedRevisionHash"], [evidence.observedRevisionHash, "observedRevisionHash"], [evidence.repairEvidenceHash, "repairEvidenceHash"]], reasons);
  if (evidence.expectedRevisionHash === evidence.observedRevisionHash || !Number.isFinite(evidence.detectedAt) || !Number.isFinite(evidence.repairedAt) || evidence.repairedAt < evidence.detectedAt || evidence.residualDrift || !evidence.redacted || !evidence.tenantMatch) reasons.push("drift evidence needs changed revision, ordered repair, no residue and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
