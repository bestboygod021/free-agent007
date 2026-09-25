/** M78 contracts for CI evidence, self-host artifacts, upgrades and release gates. */

export type SelfHostReleaseMode = "docker_compose" | "kubernetes" | "local_bundle";
export type SelfHostReleaseChannel = "stable" | "canary" | "nightly";
export type SelfHostRollout = "manual" | "canary" | "blue_green";

export interface SelfHostArtifact {
  organizationId: string;
  artifactId: string;
  version: string;
  mode: SelfHostReleaseMode;
  imageDigest: string;
  sbomHash: string;
  signatureHash: string;
  vulnerabilityScanPassed: boolean;
  licenseScanPassed: boolean;
  backupBeforeUpgrade: boolean;
  rollbackHash: string;
}

export interface CiPipelineEvidence {
  organizationId: string;
  pipelineId: string;
  commitHash: string;
  typecheckPassed: boolean;
  testsPassed: boolean;
  lintPassed: boolean;
  securityScanPassed: boolean;
  testCount: number;
  artifactHash: string;
  completedAt: number;
}

export interface SelfHostReleasePlan {
  organizationId: string;
  releaseId: string;
  artifactId: string;
  channel: SelfHostReleaseChannel;
  environment: "staging" | "canary" | "production";
  rollout: SelfHostRollout;
  changelogHash: string;
  approvalPresent: boolean;
  rollbackVerified: boolean;
  production: boolean;
}

export interface SelfHostUpgradeEvidence {
  organizationId: string;
  upgradeId: string;
  fromVersion: string;
  toVersion: string;
  migrationDryRunPassed: boolean;
  compatibilityCheckPassed: boolean;
  backupHash: string;
  rollbackTestPassed: boolean;
  downtimeMinutes: number;
  operatorId: string;
}

export interface SelfHostReleaseDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class SelfHostReleaseContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelfHostReleaseContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function nonEmpty(value: string, label: string, reasons: string[]): void {
  if (!value.trim()) reasons.push(`${label} is required`);
}

export function validateSelfHostArtifact(artifact: SelfHostArtifact): SelfHostReleaseDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[artifact.organizationId, "organizationId"], [artifact.artifactId, "artifactId"], [artifact.version, "version"], [artifact.imageDigest, "imageDigest"], [artifact.sbomHash, "sbomHash"], [artifact.signatureHash, "signatureHash"], [artifact.rollbackHash, "rollbackHash"]] as const) nonEmpty(value, label, reasons);
  if (!artifact.vulnerabilityScanPassed || !artifact.licenseScanPassed) reasons.push("release artifact scans must pass");
  if (!artifact.backupBeforeUpgrade) reasons.push("release artifact needs backup-before-upgrade evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ artifact, reasons })) };
}

export function validateCiPipelineEvidence(evidence: CiPipelineEvidence): SelfHostReleaseDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.pipelineId, "pipelineId"], [evidence.commitHash, "commitHash"], [evidence.artifactHash, "artifactHash"]] as const) nonEmpty(value, label, reasons);
  if (!evidence.typecheckPassed || !evidence.testsPassed || !evidence.lintPassed || !evidence.securityScanPassed) reasons.push("CI pipeline evidence is incomplete");
  if (!Number.isInteger(evidence.testCount) || evidence.testCount < 1) reasons.push("CI evidence needs a positive test count");
  if (!Number.isFinite(evidence.completedAt)) reasons.push("CI completion timestamp is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function decideSelfHostRelease(plan: SelfHostReleasePlan, artifact: SelfHostArtifact, ci: CiPipelineEvidence): SelfHostReleaseDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[plan.organizationId, "organizationId"], [plan.releaseId, "releaseId"], [plan.artifactId, "artifactId"], [plan.changelogHash, "changelogHash"]] as const) nonEmpty(value, label, reasons);
  if (plan.organizationId !== artifact.organizationId || plan.organizationId !== ci.organizationId) reasons.push("release crosses organization boundary");
  if (plan.artifactId !== artifact.artifactId) reasons.push("release artifact does not match plan");
  if (!plan.rollbackVerified || !plan.approvalPresent) reasons.push("release needs verified rollback and approval");
  if (plan.production && plan.environment !== "production") reasons.push("production release must target production environment");
  if (plan.production && plan.channel === "nightly") reasons.push("nightly release cannot target production");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ plan, artifact, ci, reasons })) };
}

export function validateSelfHostUpgrade(evidence: SelfHostUpgradeEvidence): SelfHostReleaseDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.upgradeId, "upgradeId"], [evidence.fromVersion, "fromVersion"], [evidence.toVersion, "toVersion"], [evidence.backupHash, "backupHash"], [evidence.operatorId, "operatorId"]] as const) nonEmpty(value, label, reasons);
  if (evidence.fromVersion === evidence.toVersion) reasons.push("upgrade versions must differ");
  if (!evidence.migrationDryRunPassed || !evidence.compatibilityCheckPassed || !evidence.rollbackTestPassed) reasons.push("upgrade evidence is incomplete");
  if (!Number.isInteger(evidence.downtimeMinutes) || evidence.downtimeMinutes < 0 || evidence.downtimeMinutes > 1440) reasons.push("upgrade downtime is outside bounds");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
