/** M40 contracts for GitHub/MCP/database connectors, backoff and signed webhooks. */

export type ConnectorTransport = "github" | "mcp" | "database";
export type ConnectorPermission = "read" | "write" | "admin";

export interface GithubInstallation {
  organizationId: string;
  installationId: string;
  appId: string;
  repositoryId: string;
  permission: ConnectorPermission;
  tokenReference: string;
  expiresAt: number;
}

export interface ConnectorGatewayDecision {
  allowed: boolean;
  reasons: string[];
  auditHash: string;
}

export interface ConnectorRateState {
  organizationId: string;
  connectorId: string;
  remaining: number;
  resetAt: number;
  retryAfterMs?: number;
  now: number;
  requestedUnits: number;
}

export interface OutboundWebhookRequest {
  organizationId: string;
  endpointId: string;
  eventId: string;
  payloadHash: string;
  signingKeyReference: string;
  attempt: number;
  idempotencyKey: string;
}

export interface DatabaseIntrospectionRequest {
  organizationId: string;
  connectorId: string;
  operation: "list_tables" | "describe_columns" | "sample_rows" | "write";
  requestedSchemas: string[];
  grantedSchemas: string[];
  approvalPresent: boolean;
}

export interface McpEnvelope {
  organizationId: string;
  sessionId: string;
  requestId: string;
  serverIdentityHash: string;
  method: "tools/list" | "tools/call" | "resources/list" | "resources/read";
  capability: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  sideEffect: boolean;
  approvalPresent: boolean;
}

export class ConnectorGatewayContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorGatewayContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new ConnectorGatewayContractError(`${label} is required`);
}

export function validateGithubInstallation(installation: GithubInstallation, now: number): ConnectorGatewayDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[installation.organizationId, "organizationId"], [installation.installationId, "installationId"], [installation.appId, "appId"], [installation.repositoryId, "repositoryId"], [installation.tokenReference, "tokenReference"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(now) || installation.expiresAt <= now) reasons.push("GitHub installation token reference is expired");
  if (installation.permission === "admin") reasons.push("admin installation permission requires a separate reviewed flow");
  if (/password|secret|token|api[_-]?key/i.test(installation.tokenReference)) reasons.push("tokenReference must be opaque");
  return { allowed: reasons.length === 0, reasons, auditHash: hash(JSON.stringify({ installation, now, reasons })) };
}

export function decideConnectorBackoff(state: ConnectorRateState): ConnectorGatewayDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[state.organizationId, "organizationId"], [state.connectorId, "connectorId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(state.remaining) || state.remaining < 0 || !Number.isInteger(state.requestedUnits) || state.requestedUnits < 1) reasons.push("rate state is invalid");
  if (!Number.isFinite(state.now) || !Number.isFinite(state.resetAt)) reasons.push("rate timestamps must be finite");
  if (state.remaining < state.requestedUnits) reasons.push("connector quota is exhausted");
  if (state.retryAfterMs !== undefined && (!Number.isInteger(state.retryAfterMs) || state.retryAfterMs < 0)) reasons.push("Retry-After is invalid");
  return { allowed: reasons.length === 0, reasons, auditHash: hash(JSON.stringify({ state, reasons })) };
}

export function validateSignedOutboundWebhook(request: OutboundWebhookRequest): ConnectorGatewayDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.endpointId, "endpointId"], [request.eventId, "eventId"], [request.payloadHash, "payloadHash"], [request.signingKeyReference, "signingKeyReference"], [request.idempotencyKey, "idempotencyKey"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(request.attempt) || request.attempt < 1 || request.attempt > 8) reasons.push("webhook retry attempt is outside bounds");
  if (/password|secret|token|api[_-]?key/i.test(request.signingKeyReference)) reasons.push("signing key reference must be opaque");
  return { allowed: reasons.length === 0, reasons, auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function decideDatabaseIntrospection(request: DatabaseIntrospectionRequest): ConnectorGatewayDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.connectorId, "connectorId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.requestedSchemas.some((schema) => !request.grantedSchemas.includes(schema))) reasons.push("database request exceeds granted schemas");
  if (request.operation === "write") reasons.push("database connector introspection is read-only");
  if (request.operation === "sample_rows" && !request.approvalPresent) reasons.push("row samples require explicit approval");
  return { allowed: reasons.length === 0, reasons, auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateMcpEnvelope(envelope: McpEnvelope, now: number): ConnectorGatewayDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[envelope.organizationId, "organizationId"], [envelope.sessionId, "sessionId"], [envelope.requestId, "requestId"], [envelope.serverIdentityHash, "serverIdentityHash"], [envelope.capability, "capability"], [envelope.nonce, "nonce"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(now) || envelope.issuedAt > now || envelope.expiresAt <= now || envelope.expiresAt <= envelope.issuedAt) reasons.push("MCP envelope is expired or not yet valid");
  if (envelope.sideEffect && !envelope.approvalPresent) reasons.push("MCP side effect requires approval");
  if (envelope.method === "tools/call" && !envelope.capability.startsWith("tool:")) reasons.push("tools/call requires a tool capability");
  return { allowed: reasons.length === 0, reasons, auditHash: hash(JSON.stringify({ envelope, now, reasons })) };
}
