/** M43 contracts for self-host profiles, releases, recovery and chaos boundaries. */

export type SelfHostMode = "local" | "docker_compose" | "kubernetes";
export type ReleaseChannel = "stable" | "canary" | "nightly";

export interface SelfHostProfile {
  organizationId: string;
  mode: SelfHostMode;
  appVersion: string;
  imageDigests: string[];
  databaseUrlReference: string;
  secretStore: "local_encrypted" | "vault" | "kms";
  externalEgressAllowed: boolean;
  approvalPresent: boolean;
}

export interface ResilienceDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  evidenceHash: string;
}

export interface ReleaseCandidate {
  organizationId: string;
  version: string;
  commitSha: string;
  channel: ReleaseChannel;
  artifactDigests: string[];
  changelogHash: string;
  testsPassed: boolean;
  securityPassed: boolean;
  approvalPresent: boolean;
}

export interface RecoveryPlan {
  organizationId: string;
  backupId: string;
  target: "isolated" | "staging";
  expectedRpoMs: number;
  expectedRtoMs: number;
  restoreSteps: string[];
  rollbackPlanHash: string;
  approvalPresent: boolean;
}

export interface ChaosExperiment {
  organizationId: string;
  experimentId: string;
  target: "worker" | "provider" | "database" | "network";
  blastRadius: "single_run" | "single_tenant" | "staging";
  durationMs: number;
  stopConditionHash: string;
  isolated: boolean;
  approvalPresent: boolean;
}

export interface UpgradePlan {
  organizationId: string;
  fromVersion: string;
  toVersion: string;
  migrationPlanHash: string;
  rollbackPlanHash: string;
  compatibilityChecked: boolean;
  backupVerified: boolean;
  approvalPresent: boolean;
}

export class SelfHostResilienceContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelfHostResilienceContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new SelfHostResilienceContractError(`${label} is required`);
}

export function validateSelfHostProfile(profile: SelfHostProfile): ResilienceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[profile.organizationId, "organizationId"], [profile.appVersion, "appVersion"], [profile.databaseUrlReference, "databaseUrlReference"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (profile.imageDigests.length === 0 || profile.imageDigests.some((digest) => !/^sha256:[a-f0-9]{8,}$/i.test(digest))) reasons.push("self-host images must be digest-pinned");
  if (/password|secret|token|api[_-]?key/i.test(profile.databaseUrlReference)) reasons.push("database URL must be an opaque reference");
  if (profile.externalEgressAllowed && !profile.approvalPresent) reasons.push("external self-host egress requires approval");
  if (profile.mode === "kubernetes" && profile.secretStore === "local_encrypted") reasons.push("Kubernetes profile requires Vault or KMS secret storage");
  return { allowed: reasons.length === 0, reasons, requiresApproval: profile.externalEgressAllowed, evidenceHash: hash(JSON.stringify({ profile, reasons })) };
}

export function planReleaseCandidate(candidate: ReleaseCandidate): ResilienceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[candidate.organizationId, "organizationId"], [candidate.version, "version"], [candidate.commitSha, "commitSha"], [candidate.changelogHash, "changelogHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (candidate.artifactDigests.length === 0 || candidate.artifactDigests.some((digest) => !/^sha256:[a-f0-9]{8,}$/i.test(digest))) reasons.push("release artifacts must be digest-pinned");
  if (!candidate.testsPassed || !candidate.securityPassed) reasons.push("release tests and security checks must pass");
  if (candidate.channel === "stable" && !candidate.approvalPresent) reasons.push("stable release requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: candidate.channel === "stable", evidenceHash: hash(JSON.stringify({ candidate, reasons })) };
}

export function planSelfHostRecovery(plan: RecoveryPlan): ResilienceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[plan.organizationId, "organizationId"], [plan.backupId, "backupId"], [plan.rollbackPlanHash, "rollbackPlanHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (plan.target === "isolated" || plan.target === "staging") {
    if (plan.expectedRpoMs < 0 || plan.expectedRtoMs <= 0 || plan.restoreSteps.length === 0) reasons.push("recovery targets or steps are invalid");
  }
  if (!plan.approvalPresent) reasons.push("recovery drill requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, evidenceHash: hash(JSON.stringify({ plan, reasons })) };
}

export function decideChaosExperiment(experiment: ChaosExperiment): ResilienceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[experiment.organizationId, "organizationId"], [experiment.experimentId, "experimentId"], [experiment.stopConditionHash, "stopConditionHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!experiment.isolated || experiment.blastRadius === "staging" && !experiment.approvalPresent) reasons.push("chaos must be isolated and approved for staging");
  if (!Number.isInteger(experiment.durationMs) || experiment.durationMs < 1 || experiment.durationMs > 3_600_000) reasons.push("chaos duration is outside bounds");
  return { allowed: reasons.length === 0, reasons, requiresApproval: experiment.blastRadius !== "single_run", evidenceHash: hash(JSON.stringify({ experiment, reasons })) };
}

export function validateUpgradePlan(plan: UpgradePlan): ResilienceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[plan.organizationId, "organizationId"], [plan.fromVersion, "fromVersion"], [plan.toVersion, "toVersion"], [plan.migrationPlanHash, "migrationPlanHash"], [plan.rollbackPlanHash, "rollbackPlanHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (plan.fromVersion === plan.toVersion) reasons.push("upgrade versions must differ");
  if (!plan.compatibilityChecked || !plan.backupVerified) reasons.push("compatibility and backup verification are required");
  if (!plan.approvalPresent) reasons.push("upgrade requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, evidenceHash: hash(JSON.stringify({ plan, reasons })) };
}
