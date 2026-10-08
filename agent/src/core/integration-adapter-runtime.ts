/** M82 contracts for GitHub, MCP, database and browser adapter delivery. */

export type IntegrationAdapterKind = "github_app" | "mcp" | "database" | "browser";
export type IntegrationOperation = "read" | "write" | "execute" | "introspect";

export interface IntegrationAdapterManifest {
  organizationId: string;
  adapterId: string;
  kind: IntegrationAdapterKind;
  endpointReference: string;
  authReference: string;
  requestedScopes: string[];
  capabilities: string[];
  tenantScoped: boolean;
  localMode: boolean;
  reviewed: boolean;
  probeRequired: boolean;
}

export interface IntegrationOperationRequest {
  organizationId: string;
  adapterId: string;
  actorId: string;
  targetOrganizationId: string;
  operation: IntegrationOperation;
  scope: string;
  targetReference: string;
  approvalPresent: boolean;
  idempotencyKey: string;
  localMode: boolean;
}

export interface BrowserSessionPolicy {
  organizationId: string;
  sessionId: string;
  allowedDomains: string[];
  recordingEnabled: boolean;
  handoverRequired: boolean;
  humanHandoverPresent: boolean;
  egressApprovalPresent: boolean;
  secretInjectionAllowed: false;
}

export interface IntegrationProbeEvidence {
  organizationId: string;
  adapterId: string;
  probeId: string;
  authenticated: boolean;
  leastPrivilegePassed: boolean;
  tenantIsolationPassed: boolean;
  webhookOrProtocolPassed: boolean;
  rollbackPassed: boolean;
  exitCode: number;
  evidenceHash: string;
}

export interface IntegrationAdapterDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class IntegrationAdapterContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationAdapterContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new IntegrationAdapterContractError(`${label} is required`);
}

export function validateIntegrationAdapterManifest(manifest: IntegrationAdapterManifest): IntegrationAdapterDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[manifest.organizationId, "organizationId"], [manifest.adapterId, "adapterId"], [manifest.endpointReference, "endpointReference"], [manifest.authReference, "authReference"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!manifest.tenantScoped) reasons.push("integration adapter must declare tenant scope");
  if (!manifest.reviewed) reasons.push("integration adapter requires review");
  if (!manifest.probeRequired) reasons.push("integration adapter requires a probe");
  if (manifest.endpointReference && manifest.kind !== "database" && !manifest.endpointReference.startsWith("https://")) reasons.push("external adapter endpoint must use HTTPS");
  if (manifest.kind === "browser" && manifest.localMode && manifest.endpointReference) reasons.push("local browser mode cannot use remote endpoint");
  if (/password|secret|token|api[_-]?key/i.test(manifest.authReference)) reasons.push("auth reference must be opaque");
  if (manifest.requestedScopes.length === 0 || new Set(manifest.requestedScopes).size !== manifest.requestedScopes.length) reasons.push("adapter scopes must be non-empty and unique");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ manifest, reasons })) };
}

export function decideIntegrationOperation(request: IntegrationOperationRequest, manifest: IntegrationAdapterManifest): IntegrationAdapterDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.adapterId, "adapterId"], [request.actorId, "actorId"], [request.targetOrganizationId, "targetOrganizationId"], [request.scope, "scope"], [request.targetReference, "targetReference"], [request.idempotencyKey, "idempotencyKey"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.organizationId !== manifest.organizationId || request.targetOrganizationId !== manifest.organizationId) reasons.push("integration operation crosses organization boundary");
  if (request.adapterId !== manifest.adapterId || !manifest.requestedScopes.includes(request.scope)) reasons.push("operation is outside the reviewed adapter scope");
  if (["write", "execute"].includes(request.operation) && !request.approvalPresent) reasons.push("sensitive adapter operation requires approval");
  if (request.localMode && !manifest.localMode) reasons.push("local request cannot use a remote-only adapter");
  return { allowed: reasons.length === 0, reasons, requiresApproval: ["write", "execute"].includes(request.operation), auditHash: hash(JSON.stringify({ request, manifest: manifest.adapterId, reasons })) };
}

export function validateBrowserSessionPolicy(policy: BrowserSessionPolicy): IntegrationAdapterDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[policy.organizationId, "organizationId"], [policy.sessionId, "sessionId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (policy.allowedDomains.length === 0 || policy.allowedDomains.some((domain) => !domain.includes(".") || domain.startsWith("*"))) reasons.push("browser session needs explicit allowed domains");
  if (!policy.recordingEnabled) reasons.push("browser session recording is required for evidence");
  if (policy.handoverRequired && !policy.humanHandoverPresent) reasons.push("browser session requires human handover");
  if (!policy.egressApprovalPresent) reasons.push("browser egress requires approval");
  if (policy.secretInjectionAllowed) reasons.push("raw secret injection is forbidden");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ policy, reasons })) };
}

export function validateIntegrationProbeEvidence(evidence: IntegrationProbeEvidence): IntegrationAdapterDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.adapterId, "adapterId"], [evidence.probeId, "probeId"], [evidence.evidenceHash, "evidenceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!evidence.authenticated || !evidence.leastPrivilegePassed || !evidence.tenantIsolationPassed || !evidence.webhookOrProtocolPassed || !evidence.rollbackPassed || evidence.exitCode !== 0) reasons.push("integration probe evidence is incomplete");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
