/** M108 contracts for self-host packaging, backup/restore, cutover and bounded chaos. */

export type SelfHostTarget = "compose" | "kubernetes" | "binary";
export type CutoverStage = "plan" | "canary" | "promote" | "rollback";
export type ChaosKind = "process_restart" | "network_delay" | "dependency_failure" | "disk_pressure";

export interface M108SelfHostReleasePlan {
  organizationId: string;
  releaseId: string;
  version: string;
  target: SelfHostTarget;
  imageDigest: string;
  configSchemaHash: string;
  sbomHash: string;
  signatureHash: string;
  tlsConfigured: boolean;
  noClobberConfig: boolean;
  migrationPlanHash: string;
  rollbackPlanHash: string;
  approvalPresent: boolean;
}

export interface M108BackupRestoreEvidence {
  organizationId: string;
  backupId: string;
  createdAt: number;
  encrypted: boolean;
  checksum: string;
  retentionUntil: number;
  restoreTested: boolean;
  restoredVersion: string;
  rtoSeconds: number;
  rpoSeconds: number;
  exitCode: number;
  operatorHash: string;
}

export interface M108ReleaseCutoverRequest {
  organizationId: string;
  releaseId: string;
  stage: CutoverStage;
  artifactDigest: string;
  canaryPercent: number;
  smokeEvidenceHash: string;
  openIncident: boolean;
  errorBudgetAvailable: boolean;
  approvalPresent: boolean;
  rollbackReady: boolean;
}

export interface ChaosEvidence {
  organizationId: string;
  experimentId: string;
  kind: ChaosKind;
  blastRadius: "single_worker" | "single_preview" | "staging";
  approvalPresent: boolean;
  sandboxed: boolean;
  steadyStateHash: string;
  recoveryEvidenceHash: string;
  observedRecoverySeconds: number;
  recoveryBudgetSeconds: number;
  noDataLoss: boolean;
}

export interface ReleaseCutoverDecision {
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

export function validateM108SelfHostPlan(plan: M108SelfHostReleasePlan): ReleaseCutoverDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[plan.organizationId, "organizationId"], [plan.releaseId, "releaseId"], [plan.version, "version"], [plan.imageDigest, "imageDigest"], [plan.configSchemaHash, "configSchemaHash"], [plan.sbomHash, "sbomHash"], [plan.signatureHash, "signatureHash"], [plan.migrationPlanHash, "migrationPlanHash"], [plan.rollbackPlanHash, "rollbackPlanHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!plan.tlsConfigured || !plan.noClobberConfig) reasons.push("self-host plan needs TLS and no-clobber config");
  if (!plan.approvalPresent) reasons.push("self-host release requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ plan, reasons })) };
}

export function validateM108BackupRestore(evidence: M108BackupRestoreEvidence, now = Date.now()): ReleaseCutoverDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.backupId, "backupId"], [evidence.checksum, "checksum"], [evidence.restoredVersion, "restoredVersion"], [evidence.operatorHash, "operatorHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(evidence.createdAt) || evidence.createdAt > now) reasons.push("backup creation time is invalid");
  if (!evidence.encrypted || !evidence.restoreTested || evidence.exitCode !== 0) reasons.push("encrypted backup restore evidence is incomplete");
  if (!Number.isFinite(evidence.retentionUntil) || evidence.retentionUntil <= evidence.createdAt) reasons.push("backup retention is invalid");
  if (!Number.isFinite(evidence.rtoSeconds) || evidence.rtoSeconds < 0 || !Number.isFinite(evidence.rpoSeconds) || evidence.rpoSeconds < 0) reasons.push("RTO/RPO values are invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function decideM108Cutover(request: M108ReleaseCutoverRequest): ReleaseCutoverDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.releaseId, "releaseId"], [request.artifactDigest, "artifactDigest"], [request.smokeEvidenceHash, "smokeEvidenceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.stage === "canary" && (!Number.isFinite(request.canaryPercent) || request.canaryPercent <= 0 || request.canaryPercent > 25)) reasons.push("canary must be greater than zero and at most twenty-five percent");
  if (request.stage === "promote" && request.canaryPercent !== 100) reasons.push("promotion requires a completed one-hundred-percent canary");
  if (request.stage !== "plan" && !request.smokeEvidenceHash) reasons.push("non-plan cutover needs smoke evidence");
  if (request.openIncident || !request.errorBudgetAvailable) reasons.push("incident or exhausted error budget blocks cutover");
  if (!request.rollbackReady) reasons.push("cutover requires a tested rollback path");
  if (request.stage !== "plan" && !request.approvalPresent) reasons.push("cutover needs approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.stage !== "plan", auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateM108ChaosEvidence(evidence: ChaosEvidence): ReleaseCutoverDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.experimentId, "experimentId"], [evidence.steadyStateHash, "steadyStateHash"], [evidence.recoveryEvidenceHash, "recoveryEvidenceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (evidence.blastRadius === "staging" && !evidence.approvalPresent) reasons.push("staging chaos requires approval");
  if (!evidence.sandboxed) reasons.push("chaos experiment must be sandboxed");
  if (!Number.isFinite(evidence.observedRecoverySeconds) || evidence.observedRecoverySeconds > evidence.recoveryBudgetSeconds) reasons.push("recovery exceeds its budget");
  if (!evidence.noDataLoss) reasons.push("chaos evidence reports data loss");
  return { allowed: reasons.length === 0, reasons, requiresApproval: evidence.blastRadius === "staging", auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
