/** M160 fail-closed contracts for feature flags and progressive delivery. */

export type M160FlagState = "draft" | "active" | "paused" | "retired";
export type M160RolloutMode = "all" | "allowlist" | "percentage" | "cohort";

export interface M160FeatureFlag {
  organizationId: string;
  flagId: string;
  key: string;
  state: M160FlagState;
  defaultValue: boolean;
  rolloutMode: M160RolloutMode;
  ownerReference: string;
  expiresAt: number;
  approvalPresent: boolean;
  auditReasonHash: string;
  noSecretValue: boolean;
  tenantScoped: boolean;
}

export interface M160Rollout {
  organizationId: string;
  flagId: string;
  rolloutId: string;
  percentage: number;
  cohortHash: string;
  previousPercentage: number;
  monotonic: boolean;
  guardrailSloHash: string;
  canaryEvidenceHash: string;
  approvalPresent: boolean;
  rollbackAvailable: boolean;
}

export interface M160KillSwitch {
  organizationId: string;
  flagId: string;
  switchId: string;
  activated: boolean;
  reasonHash: string;
  operatorReference: string;
  propagationDeadlineMs: number;
  auditHash: string;
  tenantMatch: boolean;
}

export interface M160Exposure {
  organizationId: string;
  flagId: string;
  subjectReference: string;
  evaluatedAt: number;
  result: boolean;
  ruleVersion: number;
  deterministicKey: string;
  tenantMatch: boolean;
  redacted: boolean;
}

export interface M160RolloutDecision {
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

export function validateM160Flag(flag: M160FeatureFlag, now: number): M160RolloutDecision {
  const reasons: string[] = [];
  required([[flag.organizationId, "organizationId"], [flag.flagId, "flagId"], [flag.key, "key"], [flag.ownerReference, "ownerReference"], [flag.auditReasonHash, "auditReasonHash"]], reasons);
  if (!/^[a-z][a-z0-9_.-]{2,63}$/.test(flag.key)) reasons.push("flag key is invalid");
  if (!Number.isFinite(flag.expiresAt) || flag.expiresAt <= now) reasons.push("flag expiry is invalid");
  if (!flag.approvalPresent || !flag.noSecretValue || !flag.tenantScoped) reasons.push("flag needs approval, no-secret and tenant scope");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ flag, now, reasons })) };
}

export function decideM160Rollout(rollout: M160Rollout): M160RolloutDecision {
  const reasons: string[] = [];
  required([[rollout.organizationId, "organizationId"], [rollout.flagId, "flagId"], [rollout.rolloutId, "rolloutId"], [rollout.cohortHash, "cohortHash"], [rollout.guardrailSloHash, "guardrailSloHash"], [rollout.canaryEvidenceHash, "canaryEvidenceHash"]], reasons);
  if (!Number.isFinite(rollout.percentage) || rollout.percentage < 0 || rollout.percentage > 100) reasons.push("rollout percentage is invalid");
  if (!Number.isFinite(rollout.previousPercentage) || rollout.previousPercentage < 0 || rollout.previousPercentage > 100) reasons.push("previous percentage is invalid");
  if (rollout.monotonic && rollout.percentage < rollout.previousPercentage) reasons.push("monotonic rollout cannot decrease");
  if (!rollout.approvalPresent || !rollout.rollbackAvailable) reasons.push("rollout needs approval and rollback");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ rollout, reasons })) };
}

export function validateM160KillSwitch(kill: M160KillSwitch): M160RolloutDecision {
  const reasons: string[] = [];
  required([[kill.organizationId, "organizationId"], [kill.flagId, "flagId"], [kill.switchId, "switchId"], [kill.reasonHash, "reasonHash"], [kill.operatorReference, "operatorReference"], [kill.auditHash, "auditHash"]], reasons);
  if (kill.propagationDeadlineMs < 1 || kill.propagationDeadlineMs > 60_000) reasons.push("kill-switch deadline is outside bounds");
  if (!kill.tenantMatch || !kill.activated) reasons.push("kill switch must be activated and tenant-bound");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ kill, reasons })) };
}

export function decideM160Exposure(exposure: M160Exposure): M160RolloutDecision {
  const reasons: string[] = [];
  required([[exposure.organizationId, "organizationId"], [exposure.flagId, "flagId"], [exposure.subjectReference, "subjectReference"], [exposure.deterministicKey, "deterministicKey"]], reasons);
  if (!Number.isFinite(exposure.evaluatedAt) || !Number.isInteger(exposure.ruleVersion) || exposure.ruleVersion < 1) reasons.push("exposure metadata is invalid");
  if (!exposure.tenantMatch || !exposure.redacted) reasons.push("exposure must be tenant-bound and redacted");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ exposure, reasons })) };
}
