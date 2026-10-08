/** M77 contracts for connector apps, signed webhook ingress, rate limits and delivery actions. */

export type DeliveryPlatform = "github" | "gitlab" | "bitbucket" | "slack" | "linear" | "notion" | "custom";
export type DeliveryAuthMode = "oauth_app" | "installation_token" | "local" | "byok";
export type DeliveryMode = "local" | "free" | "byok" | "paid";
export type DeliveryActionRisk = "read" | "write" | "admin";

export interface ConnectorAppManifest {
  organizationId: string;
  connectorId: string;
  platform: DeliveryPlatform;
  authMode: DeliveryAuthMode;
  requestedScopes: string[];
  webhookEndpointReference?: string;
  signingKeyReference?: string;
  shortLivedTokenRequired: boolean;
  reviewed: boolean;
  mode: DeliveryMode;
}

export interface WebhookIngressEvent {
  organizationId: string;
  connectorId: string;
  deliveryId: string;
  eventType: string;
  payloadHash: string;
  signatureValid: boolean;
  observedAt: number;
  maxAgeSeconds: number;
  dedupeKey: string;
  sourceReference: string;
}

export interface ConnectorRateLimitState {
  organizationId: string;
  connectorId: string;
  remaining: number;
  limit: number;
  resetAt: number;
  retryAfterSeconds?: number;
  responseClass?: "success" | "rate_limited" | "server_error";
}

export interface ConnectorActionRequest {
  organizationId: string;
  connectorId: string;
  actorId: string;
  actionId: string;
  platform: DeliveryPlatform;
  risk: DeliveryActionRisk;
  targetReference: string;
  scope: string;
  approvalPresent: boolean;
  idempotencyKey: string;
  mode: DeliveryMode;
  targetOrganizationId: string;
}

export interface ConnectorDeliveryDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class ConnectorDeliveryContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorDeliveryContractError";
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

export function validateConnectorApp(manifest: ConnectorAppManifest): ConnectorDeliveryDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[manifest.organizationId, "organizationId"], [manifest.connectorId, "connectorId"]] as const) nonEmpty(value, label, reasons);
  if (manifest.requestedScopes.length === 0 || new Set(manifest.requestedScopes).size !== manifest.requestedScopes.length) reasons.push("connector scopes must be non-empty and unique");
  if (manifest.authMode !== "local" && !manifest.shortLivedTokenRequired) reasons.push("remote connector requires short-lived token");
  if (manifest.webhookEndpointReference && !manifest.webhookEndpointReference.startsWith("https://")) reasons.push("webhook endpoint must use HTTPS");
  if (manifest.signingKeyReference && /password|secret|token|api[_-]?key/i.test(manifest.signingKeyReference)) reasons.push("signing key reference must be opaque");
  if (!manifest.reviewed && manifest.mode === "paid") reasons.push("paid connector requires review");
  return { allowed: reasons.length === 0, reasons, requiresApproval: manifest.mode === "paid", auditHash: hash(JSON.stringify({ manifest, reasons })) };
}

export function decideWebhookIngress(event: WebhookIngressEvent, now: number): ConnectorDeliveryDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[event.organizationId, "organizationId"], [event.connectorId, "connectorId"], [event.deliveryId, "deliveryId"], [event.eventType, "eventType"], [event.payloadHash, "payloadHash"], [event.dedupeKey, "dedupeKey"], [event.sourceReference, "sourceReference"]] as const) nonEmpty(value, label, reasons);
  if (!event.signatureValid) reasons.push("webhook signature is invalid");
  if (!Number.isFinite(event.observedAt) || !Number.isFinite(now) || event.observedAt > now) reasons.push("webhook timestamp is invalid");
  if (!Number.isInteger(event.maxAgeSeconds) || event.maxAgeSeconds < 1 || now - event.observedAt > event.maxAgeSeconds) reasons.push("webhook is stale");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ event, now, reasons })) };
}

export function validateConnectorRateLimit(state: ConnectorRateLimitState, now: number): ConnectorDeliveryDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[state.organizationId, "organizationId"], [state.connectorId, "connectorId"]] as const) nonEmpty(value, label, reasons);
  if (!Number.isInteger(state.limit) || state.limit < 1 || !Number.isInteger(state.remaining) || state.remaining < 0 || state.remaining > state.limit) reasons.push("connector rate limit values are invalid");
  if (!Number.isFinite(state.resetAt) || state.resetAt < now) reasons.push("connector rate limit reset is invalid");
  if (state.responseClass === "rate_limited" && (!state.retryAfterSeconds || state.retryAfterSeconds < 1)) reasons.push("rate-limited response needs Retry-After");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ state, now, reasons })) };
}

export function decideDeliveryConnectorAction(action: ConnectorActionRequest): ConnectorDeliveryDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[action.organizationId, "organizationId"], [action.connectorId, "connectorId"], [action.actorId, "actorId"], [action.actionId, "actionId"], [action.targetReference, "targetReference"], [action.scope, "scope"], [action.idempotencyKey, "idempotencyKey"], [action.targetOrganizationId, "targetOrganizationId"]] as const) nonEmpty(value, label, reasons);
  if (action.organizationId !== action.targetOrganizationId) reasons.push("connector action crosses organization boundary");
  if (action.risk !== "read" && !action.approvalPresent) reasons.push("connector mutation requires approval");
  if (action.mode === "local" && action.risk !== "read") reasons.push("local mode cannot silently perform remote mutation");
  return { allowed: reasons.length === 0, reasons, requiresApproval: action.risk !== "read", auditHash: hash(JSON.stringify({ action, reasons })) };
}
