/**
 * M31 contracts for connector OAuth, signed webhooks and provider calls.
 * Adapters may implement these contracts later; no credential is persisted here.
 */

export type ConnectorAction = "read" | "write" | "webhook";
export type ProviderLocality = "local" | "cloud";
export type ProviderMode = "free" | "paid" | "local";

export interface OAuthStateContract {
  state: string;
  organizationId: string;
  connectorId: string;
  redirectUriHash: string;
  codeVerifierHash: string;
  issuedAt: number;
  expiresAt: number;
}

export interface OAuthCallbackInput {
  state: string;
  code: string;
  redirectUriHash: string;
  codeVerifierHash: string;
  now: number;
}

export interface ConnectorDecision {
  allowed: boolean;
  reasons: string[];
  auditHash: string;
}

export interface WebhookEnvelope {
  eventId: string;
  organizationId: string;
  connectorId: string;
  payloadHash: string;
  signatureDigest: string;
  receivedAt: number;
}

export interface WebhookReplayRecord {
  eventId: string;
  expiresAt: number;
}

export interface ProviderCallRequest {
  organizationId: string;
  mode: ProviderMode;
  privacy: "public" | "internal" | "private" | "confidential";
  provider: string;
  locality: ProviderLocality;
  userConsentedToCloud: boolean;
  budgetAllowed: boolean;
  keyReference?: string;
}

export interface ProviderCallDecision {
  allowed: boolean;
  reasons: string[];
  rawCredentialPresent: false;
  externalEgress: boolean;
  decisionHash: string;
}

export class ConnectorProviderContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorProviderContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new ConnectorProviderContractError(`${label} is required`);
}

export function validateOAuthCallback(state: OAuthStateContract, callback: OAuthCallbackInput): ConnectorDecision {
  const reasons: string[] = [];
  required(state.state, "oauth state");
  required(callback.code, "oauth code");
  required(callback.codeVerifierHash, "code verifier");
  if (state.state !== callback.state) reasons.push("oauth state mismatch");
  if (state.redirectUriHash !== callback.redirectUriHash) reasons.push("redirect URI mismatch");
  if (state.codeVerifierHash !== callback.codeVerifierHash) reasons.push("PKCE verifier mismatch");
  if (!Number.isFinite(callback.now) || callback.now < state.issuedAt || callback.now >= state.expiresAt) reasons.push("oauth state is expired");
  return { allowed: reasons.length === 0, reasons, auditHash: hash(JSON.stringify({ connectorId: state.connectorId, organizationId: state.organizationId, reasons })) };
}

export function validateWebhook(envelope: WebhookEnvelope, replay: readonly WebhookReplayRecord[], now: number, expectedSignatureDigest: string): ConnectorDecision {
  const reasons: string[] = [];
  required(envelope.eventId, "eventId");
  required(envelope.organizationId, "organizationId");
  required(envelope.payloadHash, "payloadHash");
  required(envelope.signatureDigest, "signatureDigest");
  required(expectedSignatureDigest, "expectedSignatureDigest");
  if (!Number.isFinite(now) || !Number.isFinite(envelope.receivedAt)) reasons.push("webhook timestamps must be finite");
  if (envelope.signatureDigest !== expectedSignatureDigest) reasons.push("webhook signature digest mismatch");
  if (replay.some((item) => item.eventId === envelope.eventId && item.expiresAt > now)) reasons.push("duplicate webhook event");
  if (envelope.receivedAt > now + 60_000 || envelope.receivedAt < now - 86_400_000) reasons.push("webhook timestamp is outside the accepted window");
  return { allowed: reasons.length === 0, reasons, auditHash: hash(JSON.stringify({ eventId: envelope.eventId, organizationId: envelope.organizationId, reasons })) };
}

export function decideConnectorAction(organizationId: string, action: ConnectorAction, requiredScope: string, grantedScopes: readonly string[], idempotencyKey: string): ConnectorDecision {
  const reasons: string[] = [];
  required(organizationId, "organizationId");
  required(requiredScope, "requiredScope");
  required(idempotencyKey, "idempotencyKey");
  if (!grantedScopes.includes(requiredScope)) reasons.push("connector scope is not granted");
  if (action === "write" && !idempotencyKey.trim()) reasons.push("write connector action requires idempotency");
  return { allowed: reasons.length === 0, reasons, auditHash: hash(JSON.stringify({ organizationId, action, requiredScope, idempotencyKey, reasons })) };
}

export function decideProviderCall(request: ProviderCallRequest): ProviderCallDecision {
  const reasons: string[] = [];
  required(request.organizationId, "organizationId");
  required(request.provider, "provider");
  if (!request.budgetAllowed) reasons.push("budget gate denied provider call");
  if (request.mode === "local" && request.locality !== "local") reasons.push("local mode cannot call a cloud provider");
  if (request.mode !== "local" && request.locality === "cloud" && !request.userConsentedToCloud) reasons.push("cloud egress requires explicit user consent");
  if (request.privacy === "confidential" && request.locality !== "local") reasons.push("confidential data requires local provider in this contract");
  if (request.keyReference && /password|secret|token|api[_-]?key/i.test(request.keyReference)) reasons.push("keyReference must be an opaque reference, not a raw credential");
  const externalEgress = request.locality === "cloud";
  return { allowed: reasons.length === 0, reasons, rawCredentialPresent: false, externalEgress, decisionHash: hash(JSON.stringify({ ...request, keyReference: request.keyReference ? hash(request.keyReference) : undefined, reasons })) };
}
