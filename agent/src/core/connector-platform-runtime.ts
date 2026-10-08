/** M101 contracts for OAuth/PKCE connections, GitHub App adapters and connector quotas. */

export type ConnectorOperation = "read" | "write" | "admin";
export type ConnectorProvider = "github" | "gitlab" | "database" | "mcp" | "custom";

export interface ConnectorConnectionContract {
  organizationId: string;
  connectionId: string;
  provider: ConnectorProvider;
  accountReference: string;
  oauthStateHash: string;
  pkceVerified: boolean;
  requestedScopes: string[];
  grantedScopes: string[];
  credentialReference: string;
  consentRecorded: boolean;
  expiresAt: number;
  revoked: boolean;
}

export interface GitHubAppInstallationContract {
  organizationId: string;
  installationId: string;
  repositoryAllowlist: string[];
  permissionManifestHash: string;
  installationTokenReference: string;
  webhookSecretReference: string;
  webhookSignatureVerified: boolean;
  shortLivedToken: boolean;
  approved: boolean;
}

export interface ConnectorOperationRequest {
  organizationId: string;
  connectionId: string;
  provider: ConnectorProvider;
  operation: ConnectorOperation;
  resource: string;
  scopeGranted: boolean;
  resourceAllowlisted: boolean;
  approvalPresent: boolean;
  idempotencyKey: string;
  requestHash: string;
  readOnlyMode: boolean;
}

export interface ConnectorRateLimitEvidence {
  organizationId: string;
  connectionId: string;
  provider: ConnectorProvider;
  remaining: number;
  resetAt: number;
  retryAfterMs?: number;
  responseClass: "success" | "rate_limited" | "server_error";
  cooldownApplied: boolean;
  rotatedCredential: boolean;
}

export interface ConnectorPlatformDecision {
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

export function validateConnectorConnection(connection: ConnectorConnectionContract, now = Date.now()): ConnectorPlatformDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[connection.organizationId, "organizationId"], [connection.connectionId, "connectionId"], [connection.accountReference, "accountReference"], [connection.oauthStateHash, "oauthStateHash"], [connection.credentialReference, "credentialReference"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!connection.pkceVerified || !connection.consentRecorded) reasons.push("OAuth PKCE and explicit consent are required");
  if (connection.requestedScopes.length === 0 || connection.grantedScopes.some((scope) => !connection.requestedScopes.includes(scope))) reasons.push("granted scopes exceed the requested scope set");
  if (/password|secret|token|api[_-]?key/i.test(connection.credentialReference)) reasons.push("credential reference must be opaque");
  if (!Number.isFinite(connection.expiresAt) || connection.expiresAt <= now) reasons.push("connector credential is expired");
  if (connection.revoked) reasons.push("connector connection is revoked");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ connection, reasons })) };
}

export function validateGitHubAppInstallation(installation: GitHubAppInstallationContract): ConnectorPlatformDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[installation.organizationId, "organizationId"], [installation.installationId, "installationId"], [installation.permissionManifestHash, "permissionManifestHash"], [installation.installationTokenReference, "installationTokenReference"], [installation.webhookSecretReference, "webhookSecretReference"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (installation.repositoryAllowlist.length === 0) reasons.push("GitHub App requires an explicit repository allowlist");
  if (!installation.webhookSignatureVerified || !installation.shortLivedToken) reasons.push("GitHub App webhook and short-lived token evidence is incomplete");
  if (/password|secret|token|api[_-]?key/i.test(installation.installationTokenReference) || /password|secret|token|api[_-]?key/i.test(installation.webhookSecretReference)) reasons.push("GitHub credential references must be opaque");
  if (!installation.approved) reasons.push("GitHub App installation requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ installation, reasons })) };
}

export function decideConnectorOperation(request: ConnectorOperationRequest): ConnectorPlatformDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.connectionId, "connectionId"], [request.resource, "resource"], [request.idempotencyKey, "idempotencyKey"], [request.requestHash, "requestHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!request.scopeGranted || !request.resourceAllowlisted) reasons.push("connector scope and resource allowlist are required");
  if (request.operation !== "read" && !request.approvalPresent) reasons.push("write/admin connector operations require approval");
  if (request.readOnlyMode && request.operation !== "read") reasons.push("read-only mode blocks connector mutation");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.operation !== "read", auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function decideConnectorRateLimit(evidence: ConnectorRateLimitEvidence): ConnectorPlatformDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.connectionId, "connectionId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(evidence.remaining) || evidence.remaining < 0) reasons.push("remaining quota must be a non-negative integer");
  if (!Number.isFinite(evidence.resetAt)) reasons.push("quota reset time is required");
  if (evidence.responseClass === "rate_limited" && (!evidence.cooldownApplied || !Number.isFinite(evidence.retryAfterMs))) reasons.push("rate-limited connector must honor cooldown and Retry-After");
  if (evidence.responseClass === "server_error" && !evidence.cooldownApplied) reasons.push("server errors require connector cooldown");
  if (evidence.rotatedCredential && evidence.responseClass === "success") reasons.push("credential rotation must be justified by a failure or expiry");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
