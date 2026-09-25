/** M73 contracts for SLOs, backup/restore, incident response and chaos drills. */

export type ResilienceSeverity = "low" | "medium" | "high" | "critical";
export type ResilienceAction = "observe" | "degrade" | "failover" | "restore" | "rollback" | "human_review";
export type ChaosTarget = "api" | "database" | "queue" | "provider" | "sandbox" | "webhook";

export interface PlatformSloContract {
  organizationId: string;
  serviceId: string;
  window: "hour" | "day" | "month";
  availabilityTarget: number;
  latencyP95TargetMs: number;
  errorBudgetPercent: number;
  alertThresholdPercent: number;
  ownerId: string;
  approved: boolean;
}

export interface BackupRestoreEvidence {
  organizationId: string;
  backupId: string;
  storeName: string;
  backupHash: string;
  encrypted: boolean;
  createdAt: number;
  restoredAt?: number;
  restoreExitCode?: number;
  restoredRecordCount?: number;
  rpoMinutes: number;
  rtoMinutes: number;
  verificationHash: string;
}

export interface ResilienceIncident {
  organizationId: string;
  incidentId: string;
  serviceId: string;
  severity: ResilienceSeverity;
  observedAt: number;
  evidenceHash: string;
  runbookId: string;
  selectedAction: ResilienceAction;
  acknowledged: boolean;
  resolvedAt?: number;
}

export interface PlatformChaosExperiment {
  organizationId: string;
  experimentId: string;
  target: ChaosTarget;
  failureMode: "latency" | "error" | "disconnect" | "quota" | "data_corruption_simulation";
  durationMs: number;
  blastRadiusPercent: number;
  rollbackPlanHash: string;
  approvalPresent: boolean;
  production: boolean;
}

export interface PlatformResilienceDecision {
  allowed: boolean;
  reasons: string[];
  selectedAction: ResilienceAction;
  auditHash: string;
}

export class PlatformResilienceContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformResilienceContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new PlatformResilienceContractError(`${label} is required`);
}

export function validatePlatformSlo(contract: PlatformSloContract): PlatformResilienceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[contract.organizationId, "organizationId"], [contract.serviceId, "serviceId"], [contract.ownerId, "ownerId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(contract.availabilityTarget) || contract.availabilityTarget < 0.9 || contract.availabilityTarget > 0.99999) reasons.push("availability target is outside bounds");
  if (!Number.isInteger(contract.latencyP95TargetMs) || contract.latencyP95TargetMs < 1) reasons.push("latency target is invalid");
  if (!Number.isFinite(contract.errorBudgetPercent) || contract.errorBudgetPercent <= 0 || contract.errorBudgetPercent > 10) reasons.push("error budget is invalid");
  if (!Number.isFinite(contract.alertThresholdPercent) || contract.alertThresholdPercent <= 0 || contract.alertThresholdPercent > 100) reasons.push("alert threshold is invalid");
  if (!contract.approved) reasons.push("SLO contract requires approval");
  return { allowed: reasons.length === 0, reasons, selectedAction: "observe", auditHash: hash(JSON.stringify({ contract, reasons })) };
}

export function validateBackupRestoreEvidence(evidence: BackupRestoreEvidence, now: number): PlatformResilienceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.backupId, "backupId"], [evidence.storeName, "storeName"], [evidence.backupHash, "backupHash"], [evidence.verificationHash, "verificationHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!evidence.encrypted) reasons.push("backup must be encrypted");
  if (!Number.isFinite(evidence.createdAt) || evidence.createdAt > now) reasons.push("backup timestamp is invalid");
  if (!Number.isInteger(evidence.rpoMinutes) || evidence.rpoMinutes < 0 || !Number.isInteger(evidence.rtoMinutes) || evidence.rtoMinutes < 0) reasons.push("RPO/RTO values are invalid");
  if (evidence.restoredAt !== undefined && (evidence.restoreExitCode !== 0 || evidence.restoredRecordCount === undefined || evidence.restoredRecordCount < 0)) reasons.push("restore evidence did not pass");
  return { allowed: reasons.length === 0, reasons, selectedAction: evidence.restoredAt === undefined ? "observe" : "restore", auditHash: hash(JSON.stringify({ evidence, now, reasons })) };
}

export function decidePlatformIncident(incident: ResilienceIncident): PlatformResilienceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[incident.organizationId, "organizationId"], [incident.incidentId, "incidentId"], [incident.serviceId, "serviceId"], [incident.evidenceHash, "evidenceHash"], [incident.runbookId, "runbookId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(incident.observedAt)) reasons.push("incident timestamp is invalid");
  if (incident.severity === "critical" && !["failover", "restore", "rollback", "human_review"].includes(incident.selectedAction)) reasons.push("critical incident needs controlled response");
  if (incident.resolvedAt !== undefined && incident.resolvedAt < incident.observedAt) reasons.push("incident resolved before observation");
  return { allowed: reasons.length === 0, reasons, selectedAction: incident.selectedAction, auditHash: hash(JSON.stringify({ incident, reasons })) };
}

export function validatePlatformChaosExperiment(experiment: PlatformChaosExperiment, now: number): PlatformResilienceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[experiment.organizationId, "organizationId"], [experiment.experimentId, "experimentId"], [experiment.rollbackPlanHash, "rollbackPlanHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(experiment.durationMs) || experiment.durationMs < 1000 || experiment.durationMs > 60 * 60 * 1000) reasons.push("chaos duration is outside bounds");
  if (!Number.isInteger(experiment.blastRadiusPercent) || experiment.blastRadiusPercent < 1 || experiment.blastRadiusPercent > 10) reasons.push("chaos blast radius must be 1..10 percent");
  if (experiment.production && !experiment.approvalPresent) reasons.push("production chaos requires approval");
  if (!Number.isFinite(now)) reasons.push("chaos clock is invalid");
  return { allowed: reasons.length === 0, reasons, selectedAction: "human_review", auditHash: hash(JSON.stringify({ experiment, now, reasons })) };
}
