/** M93 contracts for deployment adapters, environment promotion, migrations and self-host config. */

export type OperationsDeploymentTarget = "compose" | "kubernetes" | "vercel" | "fly" | "cloud_run";
export type DeploymentEnvironment = "development" | "staging" | "canary" | "production";
export type DeploymentAction = "plan" | "apply" | "promote" | "rollback";

export interface DeploymentAdapterContract {
  organizationId: string;
  adapterId: string;
  target: OperationsDeploymentTarget;
  endpointReference: string;
  artifactHash: string;
  configHash: string;
  secretReferences: string[];
  dryRunPassed: boolean;
  reviewed: boolean;
  rollbackSupported: boolean;
  productionAllowed: boolean;
}

export interface EnvironmentPromotionRequest {
  organizationId: string;
  deploymentId: string;
  fromEnvironment: DeploymentEnvironment;
  toEnvironment: DeploymentEnvironment;
  action: DeploymentAction;
  artifactHash: string;
  operatorId: string;
  approvalPresent: boolean;
  smokeEvidenceHash: string;
  openIncident: boolean;
}

export interface DeploymentMigrationEvidence {
  organizationId: string;
  deploymentId: string;
  migrationId: string;
  dryRunPassed: boolean;
  backupHash: string;
  lockReleased: boolean;
  exitCode: number;
  schemaVersion: string;
  rollbackTested: boolean;
  evidenceHash: string;
}

export interface SelfHostConfiguration {
  organizationId: string;
  configId: string;
  mode: "compose" | "kubernetes";
  imageDigest: string;
  databaseUrlReference: string;
  secretReferences: string[];
  egressPolicy: "local_only" | "allowlisted";
  tlsConfigured: boolean;
  backupConfigured: boolean;
  noClobberExistingConfig: boolean;
}

export interface DeploymentOperationsDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class DeploymentOperationsContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeploymentOperationsContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function validateDeploymentAdapter(adapter: DeploymentAdapterContract): DeploymentOperationsDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[adapter.organizationId, "organizationId"], [adapter.adapterId, "adapterId"], [adapter.endpointReference, "endpointReference"], [adapter.artifactHash, "artifactHash"], [adapter.configHash, "configHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!adapter.dryRunPassed || !adapter.reviewed || !adapter.rollbackSupported) reasons.push("deployment adapter evidence is incomplete");
  if (!adapter.productionAllowed && adapter.target !== "compose") reasons.push("adapter is not allowed for production target");
  if (adapter.secretReferences.some((reference) => /password|secret|token|api[_-]?key/i.test(reference))) reasons.push("deployment secret references must be opaque");
  if (adapter.target !== "compose" && !adapter.endpointReference.startsWith("https://")) reasons.push("remote deployment adapter endpoint must use HTTPS");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ adapter, reasons })) };
}

export function decideEnvironmentPromotion(request: EnvironmentPromotionRequest): DeploymentOperationsDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.deploymentId, "deploymentId"], [request.artifactHash, "artifactHash"], [request.operatorId, "operatorId"], [request.smokeEvidenceHash, "smokeEvidenceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.openIncident) reasons.push("open incident blocks environment promotion");
  if (request.fromEnvironment === request.toEnvironment) reasons.push("promotion must change environment");
  if (request.toEnvironment === "production" && !request.approvalPresent) reasons.push("production promotion requires approval");
  if (request.action !== "plan" && !request.smokeEvidenceHash) reasons.push("apply/promotion needs smoke evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.toEnvironment === "production" || request.action !== "plan", auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateDeploymentMigrationEvidence(evidence: DeploymentMigrationEvidence): DeploymentOperationsDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.deploymentId, "deploymentId"], [evidence.migrationId, "migrationId"], [evidence.backupHash, "backupHash"], [evidence.schemaVersion, "schemaVersion"], [evidence.evidenceHash, "evidenceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!evidence.dryRunPassed || !evidence.lockReleased || evidence.exitCode !== 0 || !evidence.rollbackTested) reasons.push("migration evidence is incomplete");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function validateSelfHostConfiguration(config: SelfHostConfiguration): DeploymentOperationsDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[config.organizationId, "organizationId"], [config.configId, "configId"], [config.imageDigest, "imageDigest"], [config.databaseUrlReference, "databaseUrlReference"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!config.tlsConfigured || !config.backupConfigured || !config.noClobberExistingConfig) reasons.push("self-host safety configuration is incomplete");
  if (config.secretReferences.some((reference) => /password|secret|token|api[_-]?key/i.test(reference))) reasons.push("self-host secret references must be opaque");
  if (config.egressPolicy === "allowlisted" && config.mode === "compose" && !config.tlsConfigured) reasons.push("allowlisted egress requires TLS");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ config, reasons })) };
}
