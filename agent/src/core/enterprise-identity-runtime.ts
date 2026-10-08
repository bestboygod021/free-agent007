/** M69 contracts for enterprise identity, membership, invitations and delegation. */

export type EnterpriseIdentityMethod = "oidc" | "saml" | "local" | "passwordless";
export type EnterpriseRole = "owner" | "admin" | "developer" | "reviewer" | "viewer" | "agent";
export type MembershipState = "invited" | "active" | "suspended" | "revoked";

export interface EnterpriseIdentityProvider {
  organizationId: string;
  providerId: string;
  method: EnterpriseIdentityMethod;
  issuerUrl?: string;
  clientIdReference?: string;
  signingKeyReference?: string;
  allowedDomains: string[];
  mfaRequired: boolean;
  reviewed: boolean;
}

export interface EnterpriseInvitation {
  organizationId: string;
  invitationId: string;
  invitedEmailHash: string;
  role: EnterpriseRole;
  expiresAt: number;
  invitedBy: string;
  acceptedAt?: number;
  revoked: boolean;
}

export interface EnterpriseMembershipChange {
  organizationId: string;
  membershipId: string;
  actorId: string;
  subjectId: string;
  fromRole: EnterpriseRole;
  toRole: EnterpriseRole;
  fromState: MembershipState;
  toState: MembershipState;
  approvalPresent: boolean;
  reasonHash: string;
}

export interface EnterpriseDelegation {
  organizationId: string;
  delegationId: string;
  delegatorId: string;
  delegateId: string;
  capability: string;
  resourceScope: string;
  expiresAt: number;
  revocable: boolean;
  approvalPresent: boolean;
}

export interface EnterpriseIdentityDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class EnterpriseIdentityContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnterpriseIdentityContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new EnterpriseIdentityContractError(`${label} is required`);
}

export function validateEnterpriseIdentityProvider(provider: EnterpriseIdentityProvider): EnterpriseIdentityDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[provider.organizationId, "organizationId"], [provider.providerId, "providerId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (["oidc", "saml"].includes(provider.method) && (!provider.issuerUrl || !provider.issuerUrl.startsWith("https://"))) reasons.push("federated identity issuer must use HTTPS");
  if (provider.clientIdReference && /password|secret|token|api[_-]?key/i.test(provider.clientIdReference)) reasons.push("client reference must be opaque");
  if (provider.signingKeyReference && /password|secret|token|api[_-]?key/i.test(provider.signingKeyReference)) reasons.push("signing key reference must be opaque");
  if (provider.allowedDomains.length === 0) reasons.push("identity provider needs an allowed domain");
  if (!provider.mfaRequired && ["oidc", "saml"].includes(provider.method)) reasons.push("enterprise federation requires MFA policy");
  if (!provider.reviewed) reasons.push("identity provider requires review");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ provider, reasons })) };
}

export function decideEnterpriseInvitation(invitation: EnterpriseInvitation, now: number, acceptingUserId: string): EnterpriseIdentityDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[invitation.organizationId, "organizationId"], [invitation.invitationId, "invitationId"], [invitation.invitedEmailHash, "invitedEmailHash"], [invitation.invitedBy, "invitedBy"], [acceptingUserId, "acceptingUserId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(now) || invitation.expiresAt <= now) reasons.push("invitation is expired");
  if (invitation.revoked || invitation.acceptedAt !== undefined) reasons.push("invitation is no longer active");
  if (invitation.invitedBy === acceptingUserId) reasons.push("inviter cannot accept their own invitation");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ invitation, now, acceptingUserId, reasons })) };
}

export function validateEnterpriseMembershipChange(change: EnterpriseMembershipChange): EnterpriseIdentityDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[change.organizationId, "organizationId"], [change.membershipId, "membershipId"], [change.actorId, "actorId"], [change.subjectId, "subjectId"], [change.reasonHash, "reasonHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (change.actorId === change.subjectId && change.fromRole !== change.toRole) reasons.push("member cannot elevate their own role");
  if (change.toRole === "owner" && !change.approvalPresent) reasons.push("owner transfer requires approval");
  if (change.fromState === "revoked" && change.toState === "active") reasons.push("revoked membership needs a new invitation");
  return { allowed: reasons.length === 0, reasons, requiresApproval: change.toRole === "owner" || change.fromRole === "owner", auditHash: hash(JSON.stringify({ change, reasons })) };
}

export function validateEnterpriseDelegation(delegation: EnterpriseDelegation, now: number): EnterpriseIdentityDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[delegation.organizationId, "organizationId"], [delegation.delegationId, "delegationId"], [delegation.delegatorId, "delegatorId"], [delegation.delegateId, "delegateId"], [delegation.capability, "capability"], [delegation.resourceScope, "resourceScope"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (delegation.delegatorId === delegation.delegateId) reasons.push("delegator and delegate must differ");
  if (!Number.isFinite(now) || delegation.expiresAt <= now) reasons.push("delegation is expired");
  if (!delegation.revocable) reasons.push("delegation must be revocable");
  if (!delegation.approvalPresent) reasons.push("delegation requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ delegation, now, reasons })) };
}
