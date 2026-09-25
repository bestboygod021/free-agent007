/** M105 contracts for identity sessions, invitations, membership changes and MFA evidence. */

export type MembershipRole = "owner" | "admin" | "member" | "viewer";
export type IdentityFactor = "passkey" | "totp" | "oidc" | "recovery_code";

export interface IdentitySessionContract {
  organizationId: string;
  sessionId: string;
  subjectHash: string;
  authMethod: "passwordless" | "oidc" | "local";
  factor: IdentityFactor;
  issuedAt: number;
  expiresAt: number;
  tokenReference: string;
  deviceBound: boolean;
  revoked: boolean;
  reauthenticationRequired: boolean;
}

export interface MembershipInvitationContract {
  organizationId: string;
  invitationId: string;
  inviteeReference: string;
  role: MembershipRole;
  inviterHash: string;
  expiresAt: number;
  acceptedAt?: number;
  revoked: boolean;
  approvalPresent: boolean;
  tokenHash: string;
}

export interface MembershipRoleChangeRequest {
  organizationId: string;
  membershipId: string;
  actorHash: string;
  subjectHash: string;
  fromRole: MembershipRole;
  toRole: MembershipRole;
  approvalPresent: boolean;
  separationOfDuties: boolean;
  reauthenticationEvidenceHash: string;
  activeSessionRevoked: boolean;
}

export interface MfaEvidence {
  organizationId: string;
  subjectHash: string;
  factor: IdentityFactor;
  challengeId: string;
  verified: boolean;
  attempts: number;
  recoveryCodeUsed: boolean;
  recoveryCodeRotated: boolean;
  phishingResistant: boolean;
  observedAt: number;
}

export interface IdentityMembershipDecision {
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

export function validateM105IdentitySession(session: IdentitySessionContract, now = Date.now()): IdentityMembershipDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[session.organizationId, "organizationId"], [session.sessionId, "sessionId"], [session.subjectHash, "subjectHash"], [session.tokenReference, "tokenReference"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(session.issuedAt) || !Number.isFinite(session.expiresAt) || session.expiresAt <= session.issuedAt) reasons.push("session lifetime is invalid");
  if (session.expiresAt <= now) reasons.push("identity session is expired");
  if (session.revoked) reasons.push("identity session is revoked");
  if (!session.deviceBound && session.authMethod === "local") reasons.push("local session must be device-bound");
  if (/password|secret|token|api[_-]?key/i.test(session.tokenReference)) reasons.push("session token reference must be opaque");
  return { allowed: reasons.length === 0, reasons, requiresApproval: session.reauthenticationRequired, auditHash: hash(JSON.stringify({ session, reasons })) };
}

export function decideM105Invitation(invitation: MembershipInvitationContract, now = Date.now()): IdentityMembershipDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[invitation.organizationId, "organizationId"], [invitation.invitationId, "invitationId"], [invitation.inviteeReference, "inviteeReference"], [invitation.inviterHash, "inviterHash"], [invitation.tokenHash, "tokenHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(invitation.expiresAt) || invitation.expiresAt <= now) reasons.push("invitation is expired");
  if (invitation.acceptedAt !== undefined) reasons.push("invitation has already been accepted");
  if (invitation.revoked) reasons.push("invitation is revoked");
  if (!invitation.approvalPresent) reasons.push("membership invitation needs approval");
  if (invitation.role === "owner") reasons.push("owner role cannot be granted by invitation");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ invitation, reasons })) };
}

export function decideM105RoleChange(request: MembershipRoleChangeRequest): IdentityMembershipDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.membershipId, "membershipId"], [request.actorHash, "actorHash"], [request.subjectHash, "subjectHash"], [request.reauthenticationEvidenceHash, "reauthenticationEvidenceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.actorHash === request.subjectHash) reasons.push("role change actor and subject must be separated");
  if (request.fromRole === request.toRole) reasons.push("role change must change the role");
  if (request.toRole === "owner" && !request.approvalPresent) reasons.push("owner promotion requires approval");
  if (!request.separationOfDuties) reasons.push("role change requires separation of duties");
  if (!request.activeSessionRevoked && request.toRole === "viewer") reasons.push("demotion must revoke active privileged sessions");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.toRole === "owner" || request.fromRole === "admin", auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateM105MfaEvidence(evidence: MfaEvidence): IdentityMembershipDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.subjectHash, "subjectHash"], [evidence.challengeId, "challengeId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!evidence.verified) reasons.push("MFA challenge is not verified");
  if (!Number.isInteger(evidence.attempts) || evidence.attempts < 1 || evidence.attempts > 5) reasons.push("MFA attempts must be between one and five");
  if (evidence.recoveryCodeUsed && !evidence.recoveryCodeRotated) reasons.push("used recovery code must be rotated");
  if (!Number.isFinite(evidence.observedAt)) reasons.push("MFA observedAt is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: evidence.factor === "recovery_code", auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
