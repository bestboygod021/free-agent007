/** M133 contracts for self-host upgrades, backup restore and controlled cutover. */

export type M133Target = "compose" | "kubernetes" | "binary";
export type M133Stage = "plan" | "canary" | "promote" | "rollback";
export type M133DrillKind = "process_restart" | "network_delay" | "dependency_failure" | "disk_pressure";

export interface M133ReleasePlan {
  organizationId: string;
  releaseId: string;
  version: string;
  target: M133Target;
  imageDigest: string;
  configSchemaHash: string;
  sbomHash: string;
  signatureHash: string;
  migrationPlanHash: string;
  rollbackPlanHash: string;
  tlsConfigured: boolean;
  noClobberConfig: boolean;
  approvalPresent: boolean;
}

export interface M133BackupRestoreEvidence {
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

export interface M133CutoverRequest {
  organizationId: string;
  releaseId: string;
  stage: M133Stage;
  artifactDigest: string;
  canaryPercent: number;
  smokeEvidenceHash: string;
  openIncident: boolean;
  errorBudgetAvailable: boolean;
  approvalPresent: boolean;
  rollbackReady: boolean;
  localFallbackAvailable: boolean;
}

export interface M133ResilienceDrill {
  organizationId: string;
  drillId: string;
  kind: M133DrillKind;
  blastRadius: "single_worker" | "single_preview" | "staging";
  approvalPresent: boolean;
  sandboxed: boolean;
  steadyStateHash: string;
  recoveryEvidenceHash: string;
  observedRecoverySeconds: number;
  recoveryBudgetSeconds: number;
  noDataLoss: boolean;
  customerImpactRedacted: boolean;
}

export interface M133SelfHostDecision {
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

export function validateM133ReleasePlan(plan: M133ReleasePlan): M133SelfHostDecision {
  const reasons: string[] = [];
  required([[plan.organizationId, "organizationId"], [plan.releaseId, "releaseId"], [plan.version, "version"], [plan.imageDigest, "imageDigest"], [plan.configSchemaHash, "configSchemaHash"], [plan.sbomHash, "sbomHash"], [plan.signatureHash, "signatureHash"], [plan.migrationPlanHash, "migrationPlanHash"], [plan.rollbackPlanHash, "rollbackPlanHash"]], reasons);
  if (!plan.tlsConfigured || !plan.noClobberConfig) reasons.push("self-host release needs TLS and no-clobber config");
  if (!plan.approvalPresent) reasons.push("self-host release requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ plan, reasons })) };
}

export function validateM133BackupRestore(evidence: M133BackupRestoreEvidence, now: number): M133SelfHostDecision {
  const reasons: string[] = [];
  required([[evidence.organizationId, "organizationId"], [evidence.backupId, "backupId"], [evidence.checksum, "checksum"], [evidence.restoredVersion, "restoredVersion"], [evidence.operatorHash, "operatorHash"]], reasons);
  if (!Number.isFinite(evidence.createdAt) || evidence.createdAt > now) reasons.push("backup creation time is invalid");
  if (!evidence.encrypted || !evidence.restoreTested || evidence.exitCode !== 0) reasons.push("encrypted backup restore evidence is incomplete");
  if (!Number.isFinite(evidence.retentionUntil) || evidence.retentionUntil <= evidence.createdAt) reasons.push("backup retention is invalid");
  if (![evidence.rtoSeconds, evidence.rpoSeconds].every((value) => Number.isFinite(value) && value >= 0)) reasons.push("RTO/RPO values are invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function decideM133Cutover(request: M133CutoverRequest): M133SelfHostDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.releaseId, "releaseId"], [request.artifactDigest, "artifactDigest"], [request.smokeEvidenceHash, "smokeEvidenceHash"]], reasons);
  if (request.stage === "canary" && (!Number.isFinite(request.canaryPercent) || request.canaryPercent <= 0 || request.canaryPercent > 25)) reasons.push("canary must be greater than zero and at most twenty-five percent");
  if (request.stage === "promote" && request.canaryPercent !== 100) reasons.push("promotion requires a completed one-hundred-percent canary");
  if (request.openIncident || !request.errorBudgetAvailable) reasons.push("incident or exhausted error budget blocks cutover");
  if (!request.rollbackReady) reasons.push("cutover requires tested rollback");
  if (request.stage !== "plan" && !request.approvalPresent) reasons.push("non-plan cutover needs approval");
  if (request.stage !== "plan" && !request.localFallbackAvailable) reasons.push("cutover needs local/read-only fallback");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.stage !== "plan", auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateM133Drill(drill: M133ResilienceDrill): M133SelfHostDecision {
  const reasons: string[] = [];
  required([[drill.organizationId, "organizationId"], [drill.drillId, "drillId"], [drill.steadyStateHash, "steadyStateHash"], [drill.recoveryEvidenceHash, "recoveryEvidenceHash"]], reasons);
  if (drill.blastRadius === "staging" && !drill.approvalPresent) reasons.push("staging drill needs approval");
  if (!drill.sandboxed || !drill.noDataLoss || !drill.customerImpactRedacted) reasons.push("drill must be sandboxed, no-data-loss and redacted");
  if (!Number.isFinite(drill.observedRecoverySeconds) || drill.observedRecoverySeconds > drill.recoveryBudgetSeconds) reasons.push("recovery exceeds budget");
  return { allowed: reasons.length === 0, reasons, requiresApproval: drill.blastRadius === "staging", auditHash: hash(JSON.stringify({ drill, reasons })) };
}
