/** M166 fail-closed contracts for cancellation, cleanup and compensation. */

export type M166CancellationState = "requested" | "accepted" | "running" | "cancelled" | "compensated" | "failed";
export type M166TaskState = "pending" | "running" | "succeeded" | "failed" | "cancelled";

export interface M166CancellationRequest {
  organizationId: string;
  runId: string;
  cancellationId: string;
  requestedBy: string;
  reasonHash: string;
  requestedAt: number;
  state: M166CancellationState;
  tenantBound: boolean;
  approvalPresent: boolean;
  force: boolean;
}

export interface M166TaskCheckpoint {
  organizationId: string;
  runId: string;
  taskId: string;
  state: M166TaskState;
  checkpointHash: string;
  sideEffectClass: "none" | "reversible" | "external";
  cancelSafe: boolean;
  leaseRevoked: boolean;
  tenantMatch: boolean;
}

export interface M166Compensation {
  organizationId: string;
  runId: string;
  compensationId: string;
  taskId: string;
  actionHash: string;
  state: "planned" | "running" | "succeeded" | "failed";
  idempotencyKey: string;
  rollbackEvidenceHash?: string;
  noNewSideEffects: boolean;
  approvalPresent: boolean;
}

export interface M166CleanupEvidence {
  organizationId: string;
  runId: string;
  cleanupId: string;
  processCount: number;
  volumeCount: number;
  networkLeaseCount: number;
  artifactManifestHash: string;
  secretsPurged: boolean;
  tenantMatch: boolean;
  completedAt: number;
  evidenceHash: string;
}

export interface M166CancellationDecision {
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

export function validateM166Cancellation(request: M166CancellationRequest): M166CancellationDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.runId, "runId"], [request.cancellationId, "cancellationId"], [request.requestedBy, "requestedBy"], [request.reasonHash, "reasonHash"]], reasons);
  if (request.state !== "requested" && request.state !== "accepted") reasons.push("cancellation is not admissible");
  if (!Number.isFinite(request.requestedAt) || !request.tenantBound || !request.approvalPresent) reasons.push("cancellation needs time, tenant binding and approval");
  if (request.force && !request.approvalPresent) reasons.push("force cancellation needs explicit approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.force, auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function decideM166Checkpoint(checkpoint: M166TaskCheckpoint): M166CancellationDecision {
  const reasons: string[] = [];
  required([[checkpoint.organizationId, "organizationId"], [checkpoint.runId, "runId"], [checkpoint.taskId, "taskId"], [checkpoint.checkpointHash, "checkpointHash"]], reasons);
  if (checkpoint.state === "running" && !checkpoint.leaseRevoked) reasons.push("running task needs revoked lease before cancellation");
  if (checkpoint.sideEffectClass === "external" && !checkpoint.cancelSafe) reasons.push("external side effect is not cancellation-safe");
  if (!checkpoint.tenantMatch) reasons.push("checkpoint tenant does not match");
  return { allowed: reasons.length === 0, reasons, requiresApproval: checkpoint.sideEffectClass === "external", auditHash: hash(JSON.stringify({ checkpoint, reasons })) };
}

export function decideM166Compensation(compensation: M166Compensation): M166CancellationDecision {
  const reasons: string[] = [];
  required([[compensation.organizationId, "organizationId"], [compensation.runId, "runId"], [compensation.compensationId, "compensationId"], [compensation.taskId, "taskId"], [compensation.actionHash, "actionHash"], [compensation.idempotencyKey, "idempotencyKey"]], reasons);
  if (compensation.state === "succeeded" && !compensation.rollbackEvidenceHash) reasons.push("successful compensation needs rollback evidence");
  if (!compensation.noNewSideEffects || !compensation.approvalPresent) reasons.push("compensation needs no-new-side-effects and approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ compensation, reasons })) };
}

export function validateM166Cleanup(evidence: M166CleanupEvidence): M166CancellationDecision {
  const reasons: string[] = [];
  required([[evidence.organizationId, "organizationId"], [evidence.runId, "runId"], [evidence.cleanupId, "cleanupId"], [evidence.artifactManifestHash, "artifactManifestHash"], [evidence.evidenceHash, "evidenceHash"]], reasons);
  if (evidence.processCount < 0 || evidence.volumeCount < 0 || evidence.networkLeaseCount < 0) reasons.push("cleanup counts cannot be negative");
  if (!evidence.secretsPurged || !evidence.tenantMatch || !Number.isFinite(evidence.completedAt)) reasons.push("cleanup evidence is incomplete");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
