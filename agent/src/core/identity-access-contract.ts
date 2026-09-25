/**
 * M34 contracts for platform identity, membership, settings and notifications.
 *
 * This module handles opaque proof references only. It never receives or stores a
 * raw password, recovery secret or MFA seed, and it does not implement an auth
 * provider, mailer or durable membership store.
 */

export type IdentityRole = "owner" | "admin" | "developer" | "reviewer" | "viewer" | "agent";
export type NotificationChannel = "in_app" | "email" | "webhook";

export interface SessionProof {
  organizationId: string;
  userId: string;
  sessionId: string;
  tokenDigest: string;
  issuedAt: number;
  expiresAt: number;
  mfaVerified: boolean;
}

export interface IdentityDecision {
  allowed: boolean;
  reasons: string[];
  requiresMfa: boolean;
  auditHash: string;
}

export interface MembershipInvite {
  inviteId: string;
  organizationId: string;
  inviteeDigest: string;
  role: IdentityRole;
  inviterId: string;
  expiresAt: number;
}

export interface RoleChangeRequest {
  organizationId: string;
  subjectId: string;
  actorId: string;
  actorRole: IdentityRole;
  currentRole: IdentityRole;
  nextRole: IdentityRole;
}

export interface SettingsLayer {
  organizationId: string;
  values: Readonly<Record<string, string | number | boolean>>;
}

export interface NotificationIntent {
  organizationId: string;
  recipientId: string;
  kind: "approval" | "run_failed" | "quota_warning" | "invite";
  channel: NotificationChannel;
  dedupeKey: string;
  payloadHash: string;
  containsSecret: false;
}

export class IdentityAccessContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentityAccessContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new IdentityAccessContractError(`${label} is required`);
}

export function validateSessionProof(proof: SessionProof, now: number, requiresMfa: boolean): IdentityDecision {
  for (const [value, label] of [[proof.organizationId, "organizationId"], [proof.userId, "userId"], [proof.sessionId, "sessionId"], [proof.tokenDigest, "tokenDigest"]] as const) required(value, label);
  const reasons: string[] = [];
  if (!Number.isFinite(now) || !Number.isFinite(proof.issuedAt) || !Number.isFinite(proof.expiresAt)) reasons.push("session timestamps must be finite");
  if (proof.expiresAt <= proof.issuedAt || now < proof.issuedAt || now >= proof.expiresAt) reasons.push("session proof is expired or not yet valid");
  if (requiresMfa && !proof.mfaVerified) reasons.push("fresh MFA proof is required");
  return { allowed: reasons.length === 0, reasons, requiresMfa, auditHash: hash(JSON.stringify({ proof: { organizationId: proof.organizationId, userId: proof.userId, sessionId: proof.sessionId, issuedAt: proof.issuedAt, expiresAt: proof.expiresAt, mfaVerified: proof.mfaVerified }, now, requiresMfa, reasons })) };
}

export function decideMembershipInvite(invite: MembershipInvite, actorRole: IdentityRole, now: number): IdentityDecision {
  for (const [value, label] of [[invite.inviteId, "inviteId"], [invite.organizationId, "organizationId"], [invite.inviteeDigest, "inviteeDigest"], [invite.inviterId, "inviterId"]] as const) required(value, label);
  const reasons: string[] = [];
  if (!Number.isFinite(now) || invite.expiresAt <= now) reasons.push("membership invite is expired");
  if (!["owner", "admin"].includes(actorRole)) reasons.push("only owner or admin may invite members");
  if (["owner", "admin"].includes(invite.role) && actorRole !== "owner") reasons.push("only owner may grant elevated organization roles");
  if (invite.role === "agent" && actorRole === "viewer") reasons.push("viewer cannot create an agent membership");
  return { allowed: reasons.length === 0, reasons, requiresMfa: invite.role === "owner" || invite.role === "admin", auditHash: hash(JSON.stringify({ invite, actorRole, now, reasons })) };
}

export function decideRoleChange(request: RoleChangeRequest): IdentityDecision {
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.subjectId, "subjectId"], [request.actorId, "actorId"]] as const) required(value, label);
  const reasons: string[] = [];
  if (request.actorId === request.subjectId) reasons.push("actor cannot change their own role");
  if (!["owner", "admin"].includes(request.actorRole)) reasons.push("only owner or admin may change roles");
  if (request.nextRole === "owner" && request.actorRole !== "owner") reasons.push("only owner may grant owner role");
  if (request.currentRole === "owner" && request.actorRole !== "owner") reasons.push("only owner may change owner role");
  return { allowed: reasons.length === 0, reasons, requiresMfa: request.nextRole === "owner" || request.currentRole === "owner", auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function resolveIdentitySettings(defaults: Readonly<Record<string, string | number | boolean>>, organization: SettingsLayer, project: SettingsLayer, user: SettingsLayer): Record<string, string | number | boolean> {
  const layers = [organization, project, user];
  for (const layer of layers) {
    required(layer.organizationId, "settings organizationId");
    if (layer.organizationId !== organization.organizationId) throw new IdentityAccessContractError("settings layers must share an organization");
  }
  const resolved: Record<string, string | number | boolean> = { ...defaults };
  for (const layer of layers) Object.assign(resolved, layer.values);
  return resolved;
}

export function planNotification(intent: NotificationIntent): IdentityDecision {
  for (const [value, label] of [[intent.organizationId, "organizationId"], [intent.recipientId, "recipientId"], [intent.dedupeKey, "dedupeKey"], [intent.payloadHash, "payloadHash"]] as const) required(value, label);
  const reasons: string[] = [];
  if (intent.containsSecret) reasons.push("notification payload cannot contain a secret");
  if (intent.channel === "webhook" && intent.kind === "invite") reasons.push("invite notifications require a controlled channel");
  return { allowed: reasons.length === 0, reasons, requiresMfa: false, auditHash: hash(JSON.stringify({ ...intent, reasons })) };
}
