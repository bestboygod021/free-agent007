/** M125 contracts for durable session revocation, membership delegation and MFA recovery. */

export type M125AuthMethod = "passkey" | "oidc" | "local" | "recovery";
export type M125Role = "owner" | "admin" | "member" | "viewer";

export interface M125SessionRecord {
  organizationId: string;
  sessionId: string;
  subjectHash: string;
  authMethod: M125AuthMethod;
  tokenReference: string;
  issuedAt: number;
  expiresAt: number;
  lastSeenAt: number;
  revoked: boolean;
  revocationVersion: number;
  mfaSatisfied: boolean;
  deviceBound: boolean;
}

export interface M125MembershipDelegation {
  organizationId: string;
  delegationId: string;
  delegatorHash: string;
  delegateHash: string;
  role: M125Role;
  scopeHash: string;
  expiresAt: number;
  approvalPresent: boolean;
  revocable: boolean;
  active: boolean;
}

export interface M125RoleChange {
  organizationId: string;
  membershipId: string;
  actorHash: string;
  subjectHash: string;
  fromRole: M125Role;
  toRole: M125Role;
  reasonHash: string;
  approvalPresent: boolean;
  separationOfDuties: boolean;
  privilegedSessionsRevoked: boolean;
}

export interface M125MfaRecovery {
  organizationId: string;
  subjectHash: string;
  challengeId: string;
  method: "backup_code" | "admin_recovery" | "passkey_rebind";
  identityVerified: boolean;
  attempts: number;
  recoveryReference: string;
  rotatedAfterUse: boolean;
  approvalPresent: boolean;
  observedAt: number;
}

export interface M125IdentityDecision {
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

export function validateM125Session(session: M125SessionRecord, now = Date.now()): M125IdentityDecision {
  const reasons: string[] = [];
  required([[session.organizationId, "organizationId"], [session.sessionId, "sessionId"], [session.subjectHash, "subjectHash"], [session.tokenReference, "tokenReference"]], reasons);
  if (!Number.isFinite(session.issuedAt) || !Number.isFinite(session.expiresAt) || session.expiresAt <= session.issuedAt) reasons.push("session lifetime is invalid");
  if (!Number.isFinite(session.lastSeenAt) || session.lastSeenAt < session.issuedAt) reasons.push("session lastSeenAt is invalid");
  if (session.expiresAt <= now) reasons.push("session is expired");
  if (session.revoked || session.revocationVersion < 0) reasons.push("session is revoked or has invalid revocation version");
  if (session.authMethod === "local" && (!session.deviceBound || !session.mfaSatisfied)) reasons.push("local session needs device binding and MFA");
  if (/password|secret|token|api[_-]?key/i.test(session.tokenReference)) reasons.push("session token reference must be opaque");
  return { allowed: reasons.length === 0, reasons, requiresApproval: session.authMethod === "recovery", auditHash: hash(JSON.stringify({ session, reasons })) };
}

export function decideM125Delegation(delegation: M125MembershipDelegation, now = Date.now()): M125IdentityDecision {
  const reasons: string[] = [];
  required([[delegation.organizationId, "organizationId"], [delegation.delegationId, "delegationId"], [delegation.delegatorHash, "delegatorHash"], [delegation.delegateHash, "delegateHash"], [delegation.scopeHash, "scopeHash"]], reasons);
  if (delegation.delegatorHash === delegation.delegateHash) reasons.push("delegator and delegate must be different subjects");
  if (!Number.isFinite(delegation.expiresAt) || delegation.expiresAt <= now) reasons.push("delegation is expired");
  if (!delegation.approvalPresent || !delegation.revocable || !delegation.active) reasons.push("delegation needs approval, revocation and active-state evidence");
  if (delegation.role === "owner") reasons.push("owner authority cannot be delegated");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ delegation, reasons })) };
}

export function decideM125RoleChange(change: M125RoleChange): M125IdentityDecision {
  const reasons: string[] = [];
  required([[change.organizationId, "organizationId"], [change.membershipId, "membershipId"], [change.actorHash, "actorHash"], [change.subjectHash, "subjectHash"], [change.reasonHash, "reasonHash"]], reasons);
  if (change.actorHash === change.subjectHash) reasons.push("role change needs separation between actor and subject");
  if (change.fromRole === change.toRole) reasons.push("role change must change the role");
  if (!change.separationOfDuties) reasons.push("role change needs separation of duties");
  if ((change.toRole === "owner" || change.fromRole === "admin") && !change.approvalPresent) reasons.push("privileged role change needs approval");
  if (change.toRole === "viewer" && !change.privilegedSessionsRevoked) reasons.push("demotion must revoke privileged sessions");
  return { allowed: reasons.length === 0, reasons, requiresApproval: change.toRole === "owner" || change.fromRole === "admin", auditHash: hash(JSON.stringify({ change, reasons })) };
}

export function validateM125MfaRecovery(recovery: M125MfaRecovery): M125IdentityDecision {
  const reasons: string[] = [];
  required([[recovery.organizationId, "organizationId"], [recovery.subjectHash, "subjectHash"], [recovery.challengeId, "challengeId"], [recovery.recoveryReference, "recoveryReference"]], reasons);
  if (!recovery.identityVerified || !recovery.approvalPresent) reasons.push("MFA recovery needs identity verification and approval");
  if (!Number.isInteger(recovery.attempts) || recovery.attempts < 1 || recovery.attempts > 5) reasons.push("MFA recovery attempts must be bounded");
  if (recovery.method === "backup_code" && !recovery.rotatedAfterUse) reasons.push("backup code must rotate after use");
  if (!Number.isFinite(recovery.observedAt)) reasons.push("MFA recovery observedAt is invalid");
  if (/password|secret|token|api[_-]?key/i.test(recovery.recoveryReference)) reasons.push("recovery reference must be opaque");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ recovery, reasons })) };
}
