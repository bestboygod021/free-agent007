/** M49 contracts for user-controlled platform connections, OAuth/PKCE and consent. */

export type ConnectedPlatform = "github" | "gitlab" | "bitbucket" | "slack" | "linear" | "notion" | "google_drive" | "jira" | "custom";
export type ConnectionAuthMethod = "oauth2" | "oidc" | "pat" | "api_key" | "local";
export type ConnectionMode = "free" | "paid" | "local";

export interface PlatformDescriptor {
  platform: ConnectedPlatform;
  authorizationEndpoint: string;
  tokenEndpoint?: string;
  allowedRedirectUris: string[];
  supportedScopes: string[];
  authMethods: ConnectionAuthMethod[];
  requiresPkce: boolean;
}

export interface PlatformConnectionRequest {
  organizationId: string;
  userId: string;
  connectionId: string;
  platform: ConnectedPlatform;
  authMethod: ConnectionAuthMethod;
  requestedScopes: string[];
  redirectUri: string;
  stateHash: string;
  codeChallenge: string;
  codeChallengeMethod: "S256" | "plain";
  mode: ConnectionMode;
  userConsentPresent: boolean;
  storesRawCredential: false;
}

export interface PlatformConnectionDecision {
  allowed: boolean;
  reasons: string[];
  requiresUserConsent: boolean;
  auditHash: string;
}

export interface ConnectionSecretReference {
  organizationId: string;
  connectionId: string;
  tokenReference: string;
  expiresAt: number;
  revocable: boolean;
  rawCredentialPresent: false;
}

export class PlatformConnectionContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformConnectionContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new PlatformConnectionContractError(`${label} is required`);
}

export function validatePlatformDescriptor(descriptor: PlatformDescriptor): PlatformConnectionDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[descriptor.platform, "platform"], [descriptor.authorizationEndpoint, "authorizationEndpoint"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!descriptor.authorizationEndpoint.startsWith("https://")) reasons.push("authorization endpoint must use HTTPS");
  if (descriptor.tokenEndpoint && !descriptor.tokenEndpoint.startsWith("https://")) reasons.push("token endpoint must use HTTPS");
  if (descriptor.allowedRedirectUris.length === 0 || new Set(descriptor.allowedRedirectUris).size !== descriptor.allowedRedirectUris.length) reasons.push("redirect URI allowlist must be non-empty and unique");
  if (descriptor.supportedScopes.length === 0 || new Set(descriptor.supportedScopes).size !== descriptor.supportedScopes.length) reasons.push("supported scopes must be non-empty and unique");
  if (descriptor.authMethods.length === 0) reasons.push("at least one authentication method is required");
  return { allowed: reasons.length === 0, reasons, requiresUserConsent: true, auditHash: hash(JSON.stringify({ descriptor, reasons })) };
}

export function decidePlatformConnection(request: PlatformConnectionRequest, descriptor: PlatformDescriptor): PlatformConnectionDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.userId, "userId"], [request.connectionId, "connectionId"], [request.redirectUri, "redirectUri"], [request.stateHash, "stateHash"], [request.codeChallenge, "codeChallenge"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.platform !== descriptor.platform) reasons.push("connection platform does not match descriptor");
  if (!descriptor.allowedRedirectUris.includes(request.redirectUri)) reasons.push("redirect URI is not allowlisted");
  if (request.requestedScopes.length === 0 || request.requestedScopes.some((scope) => !descriptor.supportedScopes.includes(scope))) reasons.push("requested scope is not supported by the platform");
  if (new Set(request.requestedScopes).size !== request.requestedScopes.length) reasons.push("requested scopes must be unique");
  if (!descriptor.authMethods.includes(request.authMethod)) reasons.push("authentication method is not supported");
  if (descriptor.requiresPkce && request.authMethod === "oauth2" && request.codeChallengeMethod !== "S256") reasons.push("OAuth connection requires S256 PKCE");
  if (!request.userConsentPresent) reasons.push("explicit user consent is required");
  if (request.storesRawCredential !== false) reasons.push("raw credentials must never be stored");
  if (request.mode === "local" && request.authMethod !== "local") reasons.push("local mode cannot silently use a remote credential");
  return { allowed: reasons.length === 0, reasons, requiresUserConsent: true, auditHash: hash(JSON.stringify({ request, descriptor, reasons })) };
}

export function validateConnectionSecretReference(reference: ConnectionSecretReference, now: number): PlatformConnectionDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[reference.organizationId, "organizationId"], [reference.connectionId, "connectionId"], [reference.tokenReference, "tokenReference"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(now) || reference.expiresAt <= now) reasons.push("connection credential reference is expired");
  if (!reference.revocable) reasons.push("connection credential must be revocable");
  if (reference.rawCredentialPresent !== false) reasons.push("raw credentials are forbidden");
  if (/password|secret|token|api[_-]?key/i.test(reference.tokenReference)) reasons.push("credential reference must be opaque");
  return { allowed: reasons.length === 0, reasons, requiresUserConsent: false, auditHash: hash(JSON.stringify({ reference, now, reasons })) };
}

export function revokePlatformConnection(organizationId: string, connectionId: string, userInitiated: boolean): PlatformConnectionDecision {
  required(organizationId, "organizationId");
  required(connectionId, "connectionId");
  const reasons: string[] = [];
  if (!userInitiated) reasons.push("connection revocation requires a user or policy action");
  return { allowed: reasons.length === 0, reasons, requiresUserConsent: false, auditHash: hash(JSON.stringify({ organizationId, connectionId, userInitiated, reasons })) };
}
