/** M135 contracts for local-first device pairing, trust and scoped session grants. */

export type M135Platform = "desktop" | "cli" | "browser" | "worker";
export type M135TrustState = "pending" | "trusted" | "suspended" | "revoked";
export type M135PairingMethod = "local_loopback" | "qr_challenge" | "admin_invite";

export interface M135DeviceIdentity {
  organizationId: string;
  deviceId: string;
  platform: M135Platform;
  keyReference: string;
  attestationHash: string;
  trustState: M135TrustState;
  capabilities: string[];
  localOnly: boolean;
  lastSeenAt: number;
  revokedAt?: number;
}

export interface M135PairingRequest {
  organizationId: string;
  pairingId: string;
  deviceId: string;
  method: M135PairingMethod;
  challengeHash: string;
  requestedScopes: string[];
  expiresAt: number;
  userConsent: boolean;
  approvalPresent: boolean;
  tenantMatch: boolean;
  mfaSatisfied: boolean;
  initiatorDeviceId?: string;
}

export interface M135SessionGrant {
  organizationId: string;
  grantId: string;
  deviceId: string;
  scopes: string[];
  issuedAt: number;
  expiresAt: number;
  tenantMatch: boolean;
  mfaSatisfied: boolean;
  approvalPresent: boolean;
  refreshable: boolean;
  rawPrivateKeyStored: false;
}

export interface M135RevocationRequest {
  organizationId: string;
  deviceId: string;
  reasonHash: string;
  requestedAt: number;
  propagated: boolean;
  activeGrantsRevoked: boolean;
  localCacheInvalidated: boolean;
  auditReference: string;
}

export interface M135DeviceDecision {
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

export function validateM135Device(device: M135DeviceIdentity): M135DeviceDecision {
  const reasons: string[] = [];
  required([[device.organizationId, "organizationId"], [device.deviceId, "deviceId"], [device.keyReference, "keyReference"], [device.attestationHash, "attestationHash"]], reasons);
  if (device.trustState === "trusted" && device.localOnly === false && !device.capabilities.includes("approved_remote")) reasons.push("remote device needs explicit approved_remote capability");
  if (device.trustState === "revoked" && device.revokedAt === undefined) reasons.push("revoked device needs revocation timestamp");
  if (!Number.isFinite(device.lastSeenAt)) reasons.push("lastSeenAt is invalid");
  if (/private|secret|password|token/i.test(device.keyReference)) reasons.push("key reference must be opaque");
  return { allowed: reasons.length === 0, reasons, requiresApproval: device.trustState === "trusted", auditHash: hash(JSON.stringify({ device, reasons })) };
}

export function decideM135Pairing(request: M135PairingRequest, now: number): M135DeviceDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.pairingId, "pairingId"], [request.deviceId, "deviceId"], [request.challengeHash, "challengeHash"]], reasons);
  if (request.requestedScopes.length === 0) reasons.push("pairing must request at least one scope");
  if (!request.userConsent || !request.approvalPresent || !request.tenantMatch || !request.mfaSatisfied) reasons.push("pairing needs consent, approval, tenant match and MFA evidence");
  if (!Number.isFinite(request.expiresAt) || request.expiresAt <= now) reasons.push("pairing challenge is expired");
  if (request.method === "admin_invite" && !request.initiatorDeviceId) reasons.push("admin invite needs initiator reference");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ request, now, reasons })) };
}

export function validateM135Grant(grant: M135SessionGrant, now: number): M135DeviceDecision {
  const reasons: string[] = [];
  required([[grant.organizationId, "organizationId"], [grant.grantId, "grantId"], [grant.deviceId, "deviceId"]], reasons);
  if (grant.scopes.length === 0) reasons.push("grant must have scopes");
  if (!Number.isFinite(grant.issuedAt) || !Number.isFinite(grant.expiresAt) || grant.expiresAt <= grant.issuedAt || grant.expiresAt <= now) reasons.push("grant lifetime is invalid");
  if (!grant.tenantMatch || !grant.mfaSatisfied || !grant.approvalPresent) reasons.push("grant needs tenant, MFA and approval evidence");
  if (grant.rawPrivateKeyStored !== false) reasons.push("raw private key must never be stored");
  if (grant.refreshable && grant.expiresAt - grant.issuedAt > 86_400_000) reasons.push("refreshable grant must be short-lived");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ grant, now, reasons })) };
}

export function decideM135Revocation(request: M135RevocationRequest): M135DeviceDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.deviceId, "deviceId"], [request.reasonHash, "reasonHash"], [request.auditReference, "auditReference"]], reasons);
  if (!request.propagated || !request.activeGrantsRevoked || !request.localCacheInvalidated) reasons.push("revocation needs propagation, grant revoke and cache invalidation evidence");
  if (!Number.isFinite(request.requestedAt)) reasons.push("requestedAt is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ request, reasons })) };
}
