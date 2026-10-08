/**
 * Invitations: how `organization_members` grows.
 *
 * The decisions here are not ours. `decideMembershipInvite` and
 * `decideRoleChange` in `agent/src/core/identity-access-contract.ts` already
 * encode who may invite whom — a non-admin cannot invite, only an owner may
 * grant elevated roles, an actor cannot change their own role — and they have
 * 611 sibling tests and no callers. This module supplies what that file
 * deliberately left out: "it does not implement an auth provider, mailer or
 * durable membership store."
 *
 * So the rules are imported rather than restated. Re-deriving them here would
 * give the system two answers to the same question, which is how the role
 * vocabulary nearly ended up duplicated in the previous change.
 */

import { createHash, randomBytes } from 'node:crypto';
import {
  decideMembershipInvite,
  decideRoleChange,
  type IdentityRole,
} from '@freellmapi/agent/core/identity-access-contract.js';
import { getDb } from '../db/index.js';
import { addMember, membershipRole, isRole, type Role } from './agent-tenancy.js';

/** Invites are short-lived by default: an outstanding grant of access is a
 *  standing risk, and a week is long enough for a colleague to notice an
 *  email. */
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface Invite {
  inviteId: string;
  organizationId: string;
  email: string;
  role: Role;
  invitedBy: number;
  expiresAt: number;
  createdAt: number;
  acceptedAt: number | null;
}

export type InviteFailure = { status: 400 | 403 | 404 | 409; message: string };

export function isInviteFailure(value: unknown): value is InviteFailure {
  return typeof value === 'object' && value !== null && 'status' in value;
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Email is the identity an invite is addressed to, so it must compare the
 *  same way the users table compares it. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function looksLikeEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function rowToInvite(row: Record<string, unknown>): Invite {
  return {
    inviteId: row.invite_id as string,
    organizationId: row.organization_id as string,
    email: row.email as string,
    role: row.role as Role,
    invitedBy: row.invited_by as number,
    expiresAt: row.expires_at as number,
    createdAt: row.created_at as number,
    acceptedAt: (row.accepted_at as number | null) ?? null,
  };
}

/**
 * Create an invite.
 *
 * Returns the raw token exactly once. It is not stored and cannot be
 * recovered; an inviter who loses it must revoke and re-invite.
 */
export function createInvite(input: {
  organizationId: string;
  actorUserId: number;
  email: unknown;
  role: unknown;
  ttlMs?: number;
  now?: number;
}): { invite: Invite; token: string } | InviteFailure {
  const now = input.now ?? Date.now();

  if (!looksLikeEmail(input.email)) {
    return { status: 400, message: '"email" must be a valid email address.' };
  }
  if (!isRole(input.role)) {
    return {
      status: 400,
      message: '"role" must be one of: owner, admin, developer, reviewer, viewer, agent.',
    };
  }

  const actorRole = membershipRole(input.actorUserId, input.organizationId);
  if (actorRole === null) {
    // Same wording as a missing organisation, so this cannot be used to probe
    // which organisations exist.
    return { status: 404, message: `organization "${input.organizationId}" was not found.` };
  }

  const ttl = Math.min(Math.max(input.ttlMs ?? DEFAULT_TTL_MS, 60_000), MAX_TTL_MS);
  const expiresAt = now + ttl;
  const inviteId = `inv_${randomBytes(9).toString('hex')}`;
  const email = normalizeEmail(input.email);

  // The kernel decides. We only supply facts it cannot know.
  const decision = decideMembershipInvite(
    {
      inviteId,
      organizationId: input.organizationId,
      // The kernel takes a digest, never an address — it is written to avoid
      // holding personal data.
      inviteeDigest: tokenHash(email),
      role: input.role as IdentityRole,
      inviterId: String(input.actorUserId),
      expiresAt,
    },
    actorRole as IdentityRole,
    now,
  );

  if (!decision.allowed) {
    return { status: 403, message: decision.reasons.join('; ') };
  }

  const db = getDb();
  if (membershipByEmail(input.organizationId, email) !== null) {
    return { status: 409, message: `${email} is already a member of this organization.` };
  }

  const token = randomBytes(32).toString('hex');
  try {
    db.prepare(
      `INSERT INTO organization_invites
         (invite_id, organization_id, email, token_hash, role, invited_by, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      inviteId,
      input.organizationId,
      email,
      tokenHash(token),
      input.role,
      input.actorUserId,
      expiresAt,
      now,
    );
  } catch {
    // The partial unique index refused a second live invite for this person.
    return { status: 409, message: `${email} already has a pending invite.` };
  }

  const row = db
    .prepare('SELECT * FROM organization_invites WHERE invite_id = ?')
    .get(inviteId) as Record<string, unknown>;
  return { invite: rowToInvite(row), token };
}

function membershipByEmail(organizationId: string, email: string): Role | null {
  const row = getDb()
    .prepare(
      `SELECT m.role AS role FROM organization_members m
         JOIN users u ON u.id = m.user_id
        WHERE m.organization_id = ? AND u.email = ?`,
    )
    .get(organizationId, email) as { role?: string } | undefined;
  return row && isRole(row.role) ? row.role : null;
}

/**
 * Redeem an invite.
 *
 * The caller must already have an account and must be signed in as the address
 * the invite was sent to — otherwise a leaked token would let whoever found it
 * join under their own identity.
 */
export function acceptInvite(input: {
  token: unknown;
  userId: number;
  userEmail: string;
  now?: number;
}): { organizationId: string; role: Role } | InviteFailure {
  const now = input.now ?? Date.now();
  if (typeof input.token !== 'string' || input.token.trim() === '') {
    return { status: 400, message: '"token" is required.' };
  }

  const db = getDb();
  const row = db
    .prepare('SELECT * FROM organization_invites WHERE token_hash = ?')
    .get(tokenHash(input.token.trim())) as Record<string, unknown> | undefined;

  // One message for every failure mode below: a wrong token, a used token and
  // an expired token are indistinguishable to the caller, so the endpoint
  // cannot be used to probe which tokens exist.
  const invalid: InviteFailure = { status: 404, message: 'that invite is not valid.' };
  if (!row) return invalid;

  const invite = rowToInvite(row);
  if (invite.acceptedAt !== null) return invalid;
  if (invite.expiresAt <= now) return invalid;
  if (invite.email !== normalizeEmail(input.userEmail)) {
    return {
      status: 403,
      message: 'that invite was issued to a different email address.',
    };
  }

  // Claim and join together: a membership without a spent invite would let the
  // token be redeemed twice.
  const accepted = db.transaction(() => {
    const claim = db
      .prepare(
        `UPDATE organization_invites
            SET accepted_at = ?, accepted_by = ?
          WHERE invite_id = ? AND accepted_at IS NULL`,
      )
      .run(now, input.userId, invite.inviteId);
    if (claim.changes !== 1) return false;
    addMember({
      organizationId: invite.organizationId,
      userId: input.userId,
      role: invite.role,
    });
    return true;
  })();

  if (!accepted) return invalid;
  return { organizationId: invite.organizationId, role: invite.role };
}

/**
 * Look up a live invite by its token, without redeeming it.
 *
 * The signup route needs to know which address an invite was issued to before
 * it can create the account. Returns null for wrong, used and expired tokens
 * alike, so nothing distinguishes them to a caller.
 */
export function previewInvite(
  token: string,
  now: number = Date.now(),
): { inviteId: string; organizationId: string; email: string; role: Role } | null {
  const row = getDb()
    .prepare('SELECT * FROM organization_invites WHERE token_hash = ?')
    .get(tokenHash(token.trim())) as Record<string, unknown> | undefined;
  if (!row) return null;

  const invite = rowToInvite(row);
  if (invite.acceptedAt !== null || invite.expiresAt <= now) return null;
  return {
    inviteId: invite.inviteId,
    organizationId: invite.organizationId,
    email: invite.email,
    role: invite.role,
  };
}

/** Outstanding and historical invites, for an organisation the caller can see. */
export function listInvites(organizationId: string): Invite[] {
  const rows = getDb()
    .prepare(
      'SELECT * FROM organization_invites WHERE organization_id = ? ORDER BY created_at DESC',
    )
    .all(organizationId) as Array<Record<string, unknown>>;
  return rows.map(rowToInvite);
}

/** Withdraw an invite that has not been used. */
export function revokeInvite(input: {
  organizationId: string;
  inviteId: string;
}): boolean {
  const result = getDb()
    .prepare(
      `DELETE FROM organization_invites
        WHERE invite_id = ? AND organization_id = ? AND accepted_at IS NULL`,
    )
    .run(input.inviteId, input.organizationId);
  return result.changes === 1;
}

/**
 * Change an existing member's role.
 *
 * Delegated to `decideRoleChange`, which refuses self-promotion and protects
 * the owner role. The extra rule here is numerical rather than logical: an
 * organisation must keep at least one owner, or it becomes unadministrable.
 */
export function changeRole(input: {
  organizationId: string;
  actorUserId: number;
  subjectUserId: number;
  nextRole: unknown;
}): { role: Role } | InviteFailure {
  if (!isRole(input.nextRole)) {
    return {
      status: 400,
      message: '"role" must be one of: owner, admin, developer, reviewer, viewer, agent.',
    };
  }

  const actorRole = membershipRole(input.actorUserId, input.organizationId);
  if (actorRole === null) {
    return { status: 404, message: `organization "${input.organizationId}" was not found.` };
  }
  const currentRole = membershipRole(input.subjectUserId, input.organizationId);
  if (currentRole === null) {
    return { status: 404, message: 'that user is not a member of this organization.' };
  }

  const decision = decideRoleChange({
    organizationId: input.organizationId,
    subjectId: String(input.subjectUserId),
    actorId: String(input.actorUserId),
    actorRole: actorRole as IdentityRole,
    currentRole: currentRole as IdentityRole,
    nextRole: input.nextRole as IdentityRole,
  });
  if (!decision.allowed) {
    return { status: 403, message: decision.reasons.join('; ') };
  }

  // No last-owner check here, deliberately. `decideRoleChange` only permits
  // demoting an owner when the actor is *also* an owner and is not the
  // subject, which means a second owner exists by construction. A guard here
  // would be unreachable code pretending to be a safety net — `removeMember`
  // is where the check is real, because deletion has no such kernel rule.

  addMember({
    organizationId: input.organizationId,
    userId: input.subjectUserId,
    role: input.nextRole,
  });
  return { role: input.nextRole };
}

export function countOwners(organizationId: string): number {
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) AS n FROM organization_members WHERE organization_id = ? AND role = 'owner'",
    )
    .get(organizationId) as { n: number };
  return row.n;
}

/** Remove a member. Same owner-of-last-resort rule as a demotion. */
export function removeMember(input: {
  organizationId: string;
  subjectUserId: number;
}): true | InviteFailure {
  const current = membershipRole(input.subjectUserId, input.organizationId);
  if (current === null) {
    return { status: 404, message: 'that user is not a member of this organization.' };
  }
  if (current === 'owner' && countOwners(input.organizationId) <= 1) {
    return { status: 409, message: 'an organization must keep at least one owner.' };
  }
  getDb()
    .prepare('DELETE FROM organization_members WHERE organization_id = ? AND user_id = ?')
    .run(input.organizationId, input.subjectUserId);
  return true;
}

export function listMembers(organizationId: string): Array<{
  userId: number;
  email: string;
  role: Role;
}> {
  const rows = getDb()
    .prepare(
      `SELECT m.user_id AS userId, u.email AS email, m.role AS role
         FROM organization_members m
         JOIN users u ON u.id = m.user_id
        WHERE m.organization_id = ?
        ORDER BY m.created_at`,
    )
    .all(organizationId) as Array<{ userId: number; email: string; role: string }>;
  return rows.filter((r): r is { userId: number; email: string; role: Role } => isRole(r.role));
}
