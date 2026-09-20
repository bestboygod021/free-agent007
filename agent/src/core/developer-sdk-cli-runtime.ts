/** M121 contracts for SDK compatibility, Forge CLI commands and safe developer configuration. */

export type M121SdkLanguage = "typescript" | "python" | "go" | "rust";
export type M121CliAction = "plan" | "run" | "approve" | "status" | "export";

export interface M121SdkContract {
  organizationId: string;
  sdkId: string;
  language: M121SdkLanguage;
  apiVersion: string;
  schemaBundleHash: string;
  generatedAt: number;
  compatibilityChecked: boolean;
  examplesTested: boolean;
  secretsExcluded: boolean;
  deprecationWarningsHandled: boolean;
}

export interface M121CliRequest {
  organizationId: string;
  commandId: string;
  action: M121CliAction;
  projectPath: string;
  configPath: string;
  argsHash: string;
  confirmationPresent: boolean;
  idempotencyKey: string;
  outputRedacted: boolean;
  localMode: boolean;
}

export interface M121ConfigBootstrapEvidence {
  organizationId: string;
  configId: string;
  targetPath: string;
  existingConfigDetected: boolean;
  backupHash?: string;
  noClobber: boolean;
  secretReferencesOnly: boolean;
  fileModeRestricted: boolean;
  generatedHash: string;
}

export interface M121DeveloperHandoffEvidence {
  organizationId: string;
  sdkId: string;
  version: string;
  changelogHash: string;
  migrationGuideHash: string;
  breakingChanges: boolean;
  deprecationWindowDays: number;
  testCommandHash: string;
  docsPublished: boolean;
}

export interface M121DeveloperDecision {
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

export function validateM121SdkContract(sdk: M121SdkContract): M121DeveloperDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[sdk.organizationId, "organizationId"], [sdk.sdkId, "sdkId"], [sdk.apiVersion, "apiVersion"], [sdk.schemaBundleHash, "schemaBundleHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(sdk.generatedAt)) reasons.push("SDK generatedAt is invalid");
  if (!sdk.compatibilityChecked || !sdk.examplesTested || !sdk.secretsExcluded || !sdk.deprecationWarningsHandled) reasons.push("SDK compatibility/evidence is incomplete");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ sdk, reasons })) };
}

export function decideM121CliRequest(request: M121CliRequest): M121DeveloperDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.commandId, "commandId"], [request.projectPath, "projectPath"], [request.configPath, "configPath"], [request.argsHash, "argsHash"], [request.idempotencyKey, "idempotencyKey"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.projectPath.startsWith("/") || request.projectPath.includes("..") || request.configPath.startsWith("/") || request.configPath.includes("..")) reasons.push("CLI paths must be workspace-relative");
  if (!request.outputRedacted) reasons.push("CLI output must be redacted");
  if (request.action === "approve" && !request.confirmationPresent) reasons.push("CLI approval needs explicit confirmation");
  if (request.localMode && request.action === "export") reasons.push("local mode cannot export without an explicit egress route");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.action === "approve" || request.action === "run", auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateM121ConfigBootstrap(evidence: M121ConfigBootstrapEvidence): M121DeveloperDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.configId, "configId"], [evidence.targetPath, "targetPath"], [evidence.generatedHash, "generatedHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (evidence.targetPath.startsWith("/") || evidence.targetPath.includes("..")) reasons.push("config target path must be relative");
  if (evidence.existingConfigDetected && (!evidence.backupHash || !evidence.noClobber)) reasons.push("existing config needs backup and no-clobber");
  if (!evidence.secretReferencesOnly || !evidence.fileModeRestricted) reasons.push("config must use opaque references and restricted file mode");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function validateM121DeveloperHandoff(evidence: M121DeveloperHandoffEvidence): M121DeveloperDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.sdkId, "sdkId"], [evidence.version, "version"], [evidence.changelogHash, "changelogHash"], [evidence.migrationGuideHash, "migrationGuideHash"], [evidence.testCommandHash, "testCommandHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (evidence.breakingChanges && evidence.deprecationWindowDays < 1) reasons.push("breaking change needs a deprecation window");
  if (!Number.isInteger(evidence.deprecationWindowDays) || evidence.deprecationWindowDays < 0) reasons.push("deprecation window is invalid");
  if (!evidence.docsPublished) reasons.push("developer handoff docs must be published");
  return { allowed: reasons.length === 0, reasons, requiresApproval: evidence.breakingChanges, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
