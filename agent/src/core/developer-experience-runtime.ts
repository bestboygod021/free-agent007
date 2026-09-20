/** M71 contracts for public API versioning, SDK compatibility and Forge CLI commands. */

export type DeveloperApiTransport = "rest" | "trpc" | "sse" | "webhook";
export type DeveloperSdkLanguage = "typescript" | "python" | "go" | "rust";
export type DeveloperCommandKind = "init" | "connect" | "run" | "approve" | "logs" | "export" | "doctor";

export interface DeveloperApiContract {
  apiName: string;
  version: string;
  transport: DeveloperApiTransport;
  route: string;
  requestSchemaHash: string;
  responseSchemaHash: string;
  tenantHeaderRequired: boolean;
  idempotencyRequired: boolean;
  deprecated: boolean;
  sunsetAt?: number;
}

export interface DeveloperSdkTarget {
  organizationId: string;
  sdkName: string;
  language: DeveloperSdkLanguage;
  sdkVersion: string;
  apiVersion: string;
  generatedFromSchemaHash: string;
  supportsStreaming: boolean;
  supportsRetries: boolean;
  compatibilityReviewed: boolean;
}

export interface ForgeCommandRequest {
  organizationId: string;
  userId: string;
  command: DeveloperCommandKind;
  projectPath: string;
  argsHash: string;
  interactive: boolean;
  approvalPresent: boolean;
  localMode: boolean;
}

export interface DeveloperWebhookClient {
  organizationId: string;
  clientId: string;
  endpointReference: string;
  subscribedEvents: string[];
  signingSecretReference: string;
  retryPolicyVersion: string;
  verified: boolean;
}

export interface DeveloperExperienceDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class DeveloperExperienceContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeveloperExperienceContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new DeveloperExperienceContractError(`${label} is required`);
}

export function validateDeveloperApiContract(contract: DeveloperApiContract, now: number): DeveloperExperienceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[contract.apiName, "apiName"], [contract.version, "version"], [contract.route, "route"], [contract.requestSchemaHash, "requestSchemaHash"], [contract.responseSchemaHash, "responseSchemaHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!contract.route.startsWith("/api/")) reasons.push("public API route must use /api prefix");
  if (!contract.tenantHeaderRequired) reasons.push("public API must require tenant context");
  if (["POST", "PATCH", "DELETE"].some((method) => contract.route.includes(method))) reasons.push("HTTP method must be represented separately from route");
  if (contract.deprecated && (!contract.sunsetAt || contract.sunsetAt <= now)) reasons.push("deprecated API needs a future sunset date");
  return { allowed: reasons.length === 0, reasons, requiresApproval: contract.deprecated, auditHash: hash(JSON.stringify({ contract, now, reasons })) };
}

export function decideDeveloperSdkCompatibility(target: DeveloperSdkTarget, contract: DeveloperApiContract): DeveloperExperienceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[target.organizationId, "organizationId"], [target.sdkName, "sdkName"], [target.sdkVersion, "sdkVersion"], [target.generatedFromSchemaHash, "generatedFromSchemaHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (target.apiVersion !== contract.version) reasons.push("SDK API version does not match contract");
  if (target.generatedFromSchemaHash !== contract.responseSchemaHash && target.generatedFromSchemaHash !== contract.requestSchemaHash) reasons.push("SDK was generated from an unrelated schema");
  if (!target.compatibilityReviewed) reasons.push("SDK compatibility requires review");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ target, contract, reasons })) };
}

export function validateForgeCommand(request: ForgeCommandRequest): DeveloperExperienceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.userId, "userId"], [request.projectPath, "projectPath"], [request.argsHash, "argsHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.projectPath.startsWith("/") || request.projectPath.includes("..")) reasons.push("Forge project path must be workspace-relative");
  if (["approve", "run"].includes(request.command) && !request.approvalPresent) reasons.push("Forge command requires approval");
  if (request.localMode && request.command === "connect") reasons.push("local mode cannot create external connection");
  return { allowed: reasons.length === 0, reasons, requiresApproval: ["approve", "run"].includes(request.command), auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateDeveloperWebhookClient(client: DeveloperWebhookClient): DeveloperExperienceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[client.organizationId, "organizationId"], [client.clientId, "clientId"], [client.endpointReference, "endpointReference"], [client.signingSecretReference, "signingSecretReference"], [client.retryPolicyVersion, "retryPolicyVersion"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!client.endpointReference.startsWith("https://")) reasons.push("webhook client endpoint must use HTTPS");
  if (client.subscribedEvents.length === 0 || new Set(client.subscribedEvents).size !== client.subscribedEvents.length) reasons.push("webhook subscriptions must be non-empty and unique");
  if (/password|secret|token|api[_-]?key/i.test(client.signingSecretReference)) reasons.push("signing secret reference must be opaque");
  if (!client.verified) reasons.push("webhook client requires verification");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ client, reasons })) };
}
