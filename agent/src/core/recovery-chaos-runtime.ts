/** M192 fail-closed contracts for recovery drills, failover and chaos evidence. */

export type M192FailureScenario = "worker_loss" | "database_unavailable" | "provider_timeout" | "network_partition" | "artifact_corruption";

export interface M192ChaosPlan {
  organizationId: string;
  planId: string;
  scenario: M192FailureScenario;
  target: string;
  blastRadius: "single-run" | "single-tenant" | "staging";
  durationSeconds: number;
  budgetCents: number;
  approvalPresent: boolean;
  sandboxed: boolean;
  rollbackReady: boolean;
  observabilityReady: boolean;
  productionTarget: boolean;
  tenantBound: boolean;
}

export interface M192RecoveryEvidence {
  organizationId: string;
  incidentId: string;
  scenario: M192FailureScenario;
  failureStartedAt: number;
  detectedAt: number;
  recoveredAt: number;
  rtoSeconds: number;
  rpoSeconds: number;
  checkpointHash: string;
  dataLossBytes: number;
  runbookHash: string;
  evidenceHash: string;
  approved: boolean;
  tenantMatch: boolean;
}

export interface M192FailoverDecision {
  organizationId: string;
  failoverId: string;
  primary: string;
  secondary: string;
  healthEvidenceHash: string;
  consistencyHash: string;
  fencingEvidenceHash: string;
  quorumPresent: boolean;
  approvalPresent: boolean;
  bounded: boolean;
  tenantMatch: boolean;
}

export interface M192RestoreProof {
  organizationId: string;
  restoreId: string;
  backupId: string;
  backupHash: string;
  restoredHash: string;
  schemaVersion: number;
  integrityPassed: boolean;
  tenantIsolationPassed: boolean;
  replayPassed: boolean;
  rollbackReady: boolean;
  approvalPresent: boolean;
  tenantMatch: boolean;
}

export interface M192RecoveryDecision {
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

export function validateM192ChaosPlan(plan: M192ChaosPlan): M192RecoveryDecision {
  const reasons: string[] = [];
  required([[plan.organizationId, "organizationId"], [plan.planId, "planId"], [plan.target, "target"]], reasons);
  if (!Number.isInteger(plan.durationSeconds) || plan.durationSeconds < 1 || plan.durationSeconds > 3_600 || !Number.isInteger(plan.budgetCents) || plan.budgetCents < 0 || !plan.approvalPresent || !plan.sandboxed || !plan.rollbackReady || !plan.observabilityReady || plan.productionTarget || !plan.tenantBound) reasons.push("chaos plan needs bounded duration/budget, sandbox, rollback, observability and non-production proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ plan, reasons })) };
}

export function validateM192RecoveryEvidence(evidence: M192RecoveryEvidence): M192RecoveryDecision {
  const reasons: string[] = [];
  required([[evidence.organizationId, "organizationId"], [evidence.incidentId, "incidentId"], [evidence.checkpointHash, "checkpointHash"], [evidence.runbookHash, "runbookHash"], [evidence.evidenceHash, "evidenceHash"]], reasons);
  if (!Number.isFinite(evidence.failureStartedAt) || !Number.isFinite(evidence.detectedAt) || !Number.isFinite(evidence.recoveredAt) || evidence.detectedAt < evidence.failureStartedAt || evidence.recoveredAt < evidence.detectedAt || !Number.isInteger(evidence.rtoSeconds) || evidence.rtoSeconds < 0 || !Number.isInteger(evidence.rpoSeconds) || evidence.rpoSeconds < 0 || !Number.isInteger(evidence.dataLossBytes) || evidence.dataLossBytes < 0 || !evidence.approved || !evidence.tenantMatch) reasons.push("recovery timing, loss, approval or tenant evidence failed");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function decideM192Failover(failover: M192FailoverDecision): M192RecoveryDecision {
  const reasons: string[] = [];
  required([[failover.organizationId, "organizationId"], [failover.failoverId, "failoverId"], [failover.primary, "primary"], [failover.secondary, "secondary"], [failover.healthEvidenceHash, "healthEvidenceHash"], [failover.consistencyHash, "consistencyHash"], [failover.fencingEvidenceHash, "fencingEvidenceHash"]], reasons);
  if (failover.primary === failover.secondary || !failover.quorumPresent || !failover.approvalPresent || !failover.bounded || !failover.tenantMatch) reasons.push("failover needs distinct targets, quorum, fencing, approval and bound");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ failover, reasons })) };
}

export function validateM192RestoreProof(proof: M192RestoreProof): M192RecoveryDecision {
  const reasons: string[] = [];
  required([[proof.organizationId, "organizationId"], [proof.restoreId, "restoreId"], [proof.backupId, "backupId"], [proof.backupHash, "backupHash"], [proof.restoredHash, "restoredHash"]], reasons);
  if (!Number.isInteger(proof.schemaVersion) || proof.schemaVersion < 1 || !proof.integrityPassed || !proof.tenantIsolationPassed || !proof.replayPassed || !proof.rollbackReady || !proof.approvalPresent || !proof.tenantMatch) reasons.push("restore needs schema, integrity, isolation, replay, rollback and approval proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ proof, reasons })) };
}
