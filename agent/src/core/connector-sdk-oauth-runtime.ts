/** M145 contracts for connector SDK capability, OAuth/PKCE lifecycle and webhook admission. */

export type M145Trust = "builtin" | "signed_registry" | "local" | "untrusted";
export type M145AuthMethod = "oauth_pkce" | "api_key_reference" | "local_session";

export interface M145ConnectorManifest {
  organizationId: string;
  connectorId: string;
  version: string;
  capabilities: string[];
  requestedScopes: string[];
  permissionHash: string;
  authMethod: M145AuthMethod;
  webhookSupport: boolean;
  localOnly: boolean;
  sourceTrust: M145Trust;
  approvalPresent: boolean;
  noRawCredential: boolean;
}

export interface M145OAuthFlow {
  organizationId: string;
  authorizationId: string;
  connectorId: string;
  stateHash: string;
  pkceVerified: boolean;
  redirectUriAllowed: boolean;
  consentAt: number;
  expiresAt: number;
  tokenReference: string;
  tenantMatch: boolean;
  userApproved: boolean;
}

export interface M145ConnectorTokenLease {
  organizationId: string;
  leaseId: string;
  connectorId: string;
  tokenReference: string;
  scopeHash: string;
  issuedAt: number;
  expiresAt: number;
  revoked: boolean;
  encryptedReference: boolean;
  rawTokenStored: false;
}

export interface M145WebhookEnvelope {
  organizationId: string;
  connectorId: string;
  deliveryId: string;
  signatureHash: string;
  sentAt: number;
  eventHash: string;
  dedupeKey: string;
  verified: boolean;
  redacted: boolean;
  tenantMatch: boolean;
}

export interface M145ConnectorDecision {
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

function required(values: Array<readonly [string, string]>, reasons: string[]): void {
  for (const [value, label] of values) if (!value.trim()) reasons.push(`${label} is required`);
}

export function validateM145Manifest(manifest: M145ConnectorManifest): M145ConnectorDecision {
  const reasons: string[] = [];
  required([[manifest.organizationId, "organizationId"], [manifest.connectorId, "connectorId"], [manifest.version, "version"], [manifest.permissionHash, "permissionHash"]], reasons);
  if (manifest.capabilities.length === 0 || manifest.requestedScopes.length === 0) reasons.push("connector must declare capabilities and scopes");
  if (!manifest.noRawCredential) reasons.push("connector must declare no raw credential storage");
  if (manifest.sourceTrust === "untrusted") reasons.push("untrusted connector cannot enter SDK runtime");
  if (!manifest.localOnly && !manifest.approvalPresent) reasons.push("external connector needs approval");
  if (manifest.authMethod === "oauth_pkce" && !manifest.webhookSupport && manifest.capabilities.includes("webhook_receive")) reasons.push("webhook capability requires webhook support");
  return { allowed: reasons.length === 0, reasons, requiresApproval: !manifest.localOnly, auditHash: hash(JSON.stringify({ manifest, reasons })) };
}

export function decideM145OAuth(flow: M145OAuthFlow, now: number): M145ConnectorDecision {
  const reasons: string[] = [];
  required([[flow.organizationId, "organizationId"], [flow.authorizationId, "authorizationId"], [flow.connectorId, "connectorId"], [flow.stateHash, "stateHash"], [flow.tokenReference, "tokenReference"]], reasons);
  if (!flow.pkceVerified || !flow.redirectUriAllowed || !flow.tenantMatch || !flow.userApproved) reasons.push("OAuth flow needs PKCE, redirect, tenant and user approval evidence");
  if (!Number.isFinite(flow.consentAt) || !Number.isFinite(flow.expiresAt) || flow.expiresAt <= flow.consentAt || flow.expiresAt <= now) reasons.push("OAuth flow lifetime is invalid");
  if (/token|secret|password|key/i.test(flow.tokenReference)) reasons.push("OAuth token reference must be opaque");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ flow, now, reasons })) };
}

export function validateM145TokenLease(lease: M145ConnectorTokenLease, now: number): M145ConnectorDecision {
  const reasons: string[] = [];
  required([[lease.organizationId, "organizationId"], [lease.leaseId, "leaseId"], [lease.connectorId, "connectorId"], [lease.tokenReference, "tokenReference"], [lease.scopeHash, "scopeHash"]], reasons);
  if (!Number.isFinite(lease.issuedAt) || !Number.isFinite(lease.expiresAt) || lease.expiresAt <= lease.issuedAt || lease.expiresAt <= now) reasons.push("token lease lifetime is invalid");
  if (lease.revoked || !lease.encryptedReference || lease.rawTokenStored !== false) reasons.push("token lease must be encrypted, active and raw-token-free");
  if (/token|secret|password|key/i.test(lease.tokenReference)) reasons.push("token reference must be opaque");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ lease, now, reasons })) };
}

export function decideM145Webhook(envelope: M145WebhookEnvelope): M145ConnectorDecision {
  const reasons: string[] = [];
  required([[envelope.organizationId, "organizationId"], [envelope.connectorId, "connectorId"], [envelope.deliveryId, "deliveryId"], [envelope.signatureHash, "signatureHash"], [envelope.eventHash, "eventHash"], [envelope.dedupeKey, "dedupeKey"]], reasons);
  if (!envelope.verified || !envelope.redacted || !envelope.tenantMatch) reasons.push("webhook needs signature, redaction and tenant verification");
  if (!Number.isFinite(envelope.sentAt)) reasons.push("sentAt is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ envelope, reasons })) };
}
