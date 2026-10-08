import { describe, it, expect, beforeEach } from 'vitest';
import { initDb, getDb } from '../../db/index.js';
import {
  createInvite,
  acceptInvite,
  previewInvite,
  revokeInvite,
  listInvites,
  listMembers,
  changeRole,
  removeMember,
  countOwners,
  isInviteFailure,
} from '../../services/agent-invites.js';
import {
  createOrganization,
  createProject,
  addMember,
  membershipRole,
} from '../../services/agent-tenancy.js';

function makeUser(email: string): number {
  const info = getDb()
    .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
    .run(email.toLowerCase(), 'x');
  return Number(info.lastInsertRowid);
}

/** Narrow past the failure union so the success shape can be read. */
function ok<T>(value: T | { status: number; message: string }): T {
  if (isInviteFailure(value)) {
    throw new Error(`expected success, got ${value.status}: ${value.message}`);
  }
  return value;
}

describe('membership invites', () => {
  let owner: number;
  let admin: number;
  let developer: number;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    owner = makeUser('owner@example.com');
    admin = makeUser('admin@example.com');
    developer = makeUser('dev@example.com');
    createOrganization({ organizationId: 'acme', name: 'Acme', ownerUserId: owner });
    createProject({ organizationId: 'acme', projectId: 'web', name: 'Web' });
    addMember({ organizationId: 'acme', userId: admin, role: 'admin' });
    addMember({ organizationId: 'acme', userId: developer, role: 'developer' });
  });

  describe('who may invite — delegated to the kernel', () => {
    it('lets an owner invite', () => {
      const result = ok(
        createInvite({ organizationId: 'acme', actorUserId: owner, email: 'new@example.com', role: 'developer' }),
      );
      expect(result.invite.role).toBe('developer');
      expect(result.token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('refuses a developer, using the kernel\'s own wording', () => {
      const result = createInvite({
        organizationId: 'acme', actorUserId: developer, email: 'new@example.com', role: 'viewer',
      });
      expect(isInviteFailure(result) && result.status).toBe(403);
      // decideMembershipInvite produced this, not us.
      expect(isInviteFailure(result) && result.message).toContain('only owner or admin may invite');
    });

    it('refuses an admin granting an elevated role', () => {
      const result = createInvite({
        organizationId: 'acme', actorUserId: admin, email: 'new@example.com', role: 'owner',
      });
      expect(isInviteFailure(result) && result.status).toBe(403);
      expect(isInviteFailure(result) && result.message).toContain('only owner may grant elevated');
    });

    it('hides organisations the actor is not in', () => {
      const stranger = makeUser('stranger@example.com');
      const result = createInvite({
        organizationId: 'acme', actorUserId: stranger, email: 'x@example.com', role: 'viewer',
      });
      expect(isInviteFailure(result) && result.status).toBe(404);
      expect(isInviteFailure(result) && result.message).toContain('was not found');
    });

    it('validates the address and the role before deciding anything', () => {
      for (const bad of ['not-an-email', '', 'a@b', 42, null]) {
        const result = createInvite({
          organizationId: 'acme', actorUserId: owner, email: bad, role: 'viewer',
        });
        expect(isInviteFailure(result) && result.status).toBe(400);
      }
      const badRole = createInvite({
        organizationId: 'acme', actorUserId: owner, email: 'x@example.com', role: 'superuser',
      });
      expect(isInviteFailure(badRole) && badRole.status).toBe(400);
    });

    it('refuses a second live invite for the same person', () => {
      ok(createInvite({ organizationId: 'acme', actorUserId: owner, email: 'dup@example.com', role: 'viewer' }));
      const second = createInvite({
        organizationId: 'acme', actorUserId: owner, email: 'DUP@example.com', role: 'viewer',
      });
      expect(isInviteFailure(second) && second.status).toBe(409);
    });

    it('refuses to invite somebody who is already a member', () => {
      const result = createInvite({
        organizationId: 'acme', actorUserId: owner, email: 'dev@example.com', role: 'viewer',
      });
      expect(isInviteFailure(result) && result.status).toBe(409);
      expect(isInviteFailure(result) && result.message).toContain('already a member');
    });
  });

  describe('the token', () => {
    it('is never stored in the clear', () => {
      const { token } = ok(
        createInvite({ organizationId: 'acme', actorUserId: owner, email: 'n@example.com', role: 'viewer' }),
      );
      const rows = getDb().prepare('SELECT * FROM organization_invites').all() as Array<Record<string, unknown>>;
      expect(JSON.stringify(rows)).not.toContain(token);
    });

    it('is single-use', () => {
      const invitee = makeUser('n@example.com');
      const { token } = ok(
        createInvite({ organizationId: 'acme', actorUserId: owner, email: 'n@example.com', role: 'viewer' }),
      );

      expect(ok(acceptInvite({ token, userId: invitee, userEmail: 'n@example.com' })).role).toBe('viewer');

      const again = acceptInvite({ token, userId: invitee, userEmail: 'n@example.com' });
      expect(isInviteFailure(again) && again.status).toBe(404);
    });

    it('expires', () => {
      const invitee = makeUser('n@example.com');
      const now = Date.now();
      const { token } = ok(
        createInvite({
          organizationId: 'acme', actorUserId: owner, email: 'n@example.com', role: 'viewer',
          ttlMs: 60_000, now,
        }),
      );
      const late = acceptInvite({ token, userId: invitee, userEmail: 'n@example.com', now: now + 61_000 });
      expect(isInviteFailure(late) && late.status).toBe(404);
      expect(membershipRole(invitee, 'acme')).toBeNull();
    });

    it('gives one answer for wrong, used and expired', () => {
      // Otherwise the endpoint tells an attacker which tokens are real.
      const invitee = makeUser('n@example.com');
      const now = Date.now();
      const { token } = ok(
        createInvite({ organizationId: 'acme', actorUserId: owner, email: 'n@example.com', role: 'viewer', now }),
      );
      acceptInvite({ token, userId: invitee, userEmail: 'n@example.com', now });

      const used = acceptInvite({ token, userId: invitee, userEmail: 'n@example.com', now });
      const wrong = acceptInvite({ token: 'deadbeef', userId: invitee, userEmail: 'n@example.com', now });
      expect(isInviteFailure(used) && used.message).toBe(isInviteFailure(wrong) && wrong.message);
      expect(isInviteFailure(used) && used.status).toBe(isInviteFailure(wrong) && wrong.status);
    });

    it('is bound to the address it was issued to', () => {
      // A leaked token must not let a signed-in stranger join as themselves.
      const stranger = makeUser('stranger@example.com');
      const { token } = ok(
        createInvite({ organizationId: 'acme', actorUserId: owner, email: 'n@example.com', role: 'viewer' }),
      );
      const result = acceptInvite({ token, userId: stranger, userEmail: 'stranger@example.com' });
      expect(isInviteFailure(result) && result.status).toBe(403);
      expect(membershipRole(stranger, 'acme')).toBeNull();
    });

    it('previews without spending', () => {
      const { token } = ok(
        createInvite({ organizationId: 'acme', actorUserId: owner, email: 'n@example.com', role: 'reviewer' }),
      );
      expect(previewInvite(token)).toMatchObject({ email: 'n@example.com', role: 'reviewer' });
      // Still redeemable afterwards.
      const invitee = makeUser('n@example.com');
      expect(ok(acceptInvite({ token, userId: invitee, userEmail: 'n@example.com' })).role).toBe('reviewer');
    });

    it('can be revoked before use', () => {
      const { invite, token } = ok(
        createInvite({ organizationId: 'acme', actorUserId: owner, email: 'n@example.com', role: 'viewer' }),
      );
      expect(revokeInvite({ organizationId: 'acme', inviteId: invite.inviteId })).toBe(true);

      const invitee = makeUser('n@example.com');
      const result = acceptInvite({ token, userId: invitee, userEmail: 'n@example.com' });
      expect(isInviteFailure(result)).toBe(true);
    });

    it('cannot be revoked from another organisation', () => {
      const other = makeUser('other@example.com');
      createOrganization({ organizationId: 'zeta', name: 'Zeta', ownerUserId: other });
      const { invite } = ok(
        createInvite({ organizationId: 'acme', actorUserId: owner, email: 'n@example.com', role: 'viewer' }),
      );
      expect(revokeInvite({ organizationId: 'zeta', inviteId: invite.inviteId })).toBe(false);
    });

    it('keeps an accepted invite as a record of who let someone in', () => {
      const invitee = makeUser('n@example.com');
      const { token } = ok(
        createInvite({ organizationId: 'acme', actorUserId: owner, email: 'n@example.com', role: 'viewer' }),
      );
      acceptInvite({ token, userId: invitee, userEmail: 'n@example.com' });

      const record = listInvites('acme')[0];
      expect(record?.acceptedAt).toBeTypeOf('number');
      expect(record?.invitedBy).toBe(owner);
    });
  });

  describe('role changes', () => {
    it('refuses to let an actor change their own role', () => {
      const result = changeRole({
        organizationId: 'acme', actorUserId: owner, subjectUserId: owner, nextRole: 'viewer',
      });
      expect(isInviteFailure(result) && result.status).toBe(403);
      expect(isInviteFailure(result) && result.message).toContain('cannot change their own role');
    });

    it('refuses an admin promoting somebody to owner', () => {
      const result = changeRole({
        organizationId: 'acme', actorUserId: admin, subjectUserId: developer, nextRole: 'owner',
      });
      expect(isInviteFailure(result) && result.status).toBe(403);
    });

    it('lets an owner promote', () => {
      expect(ok(changeRole({
        organizationId: 'acme', actorUserId: owner, subjectUserId: developer, nextRole: 'admin',
      })).role).toBe('admin');
      expect(membershipRole(developer, 'acme')).toBe('admin');
    });

    it('cannot demote the last owner, because only another owner could try', () => {
      const second = makeUser('owner2@example.com');
      addMember({ organizationId: 'acme', userId: second, role: 'owner' });

      // Two owners: one may be demoted, leaving exactly one.
      expect(ok(changeRole({
        organizationId: 'acme', actorUserId: owner, subjectUserId: second, nextRole: 'viewer',
      })).role).toBe('viewer');
      expect(countOwners('acme')).toBe(1);

      // With one owner left, nobody else can demote them: the kernel requires
      // the actor to be an owner and forbids changing your own role, so the
      // only candidate is the owner themselves — and that is refused. The
      // organisation cannot be stranded through this path at all.
      addMember({ organizationId: 'acme', userId: second, role: 'admin' });
      const byAdmin = changeRole({
        organizationId: 'acme', actorUserId: second, subjectUserId: owner, nextRole: 'viewer',
      });
      expect(isInviteFailure(byAdmin) && byAdmin.status).toBe(403);
      expect(isInviteFailure(byAdmin) && byAdmin.message).toContain('only owner may change owner');

      const bySelf = changeRole({
        organizationId: 'acme', actorUserId: owner, subjectUserId: owner, nextRole: 'viewer',
      });
      expect(isInviteFailure(bySelf) && bySelf.status).toBe(403);
      expect(countOwners('acme')).toBe(1);
    });

    it('will not touch a non-member', () => {
      const stranger = makeUser('stranger@example.com');
      const result = changeRole({
        organizationId: 'acme', actorUserId: owner, subjectUserId: stranger, nextRole: 'admin',
      });
      expect(isInviteFailure(result) && result.status).toBe(404);
    });
  });

  describe('removal', () => {
    it('removes a member', () => {
      expect(removeMember({ organizationId: 'acme', subjectUserId: developer })).toBe(true);
      expect(membershipRole(developer, 'acme')).toBeNull();
    });

    it('refuses to remove the last owner', () => {
      const result = removeMember({ organizationId: 'acme', subjectUserId: owner });
      expect(isInviteFailure(result) && result.status).toBe(409);
      expect(membershipRole(owner, 'acme')).toBe('owner');
    });

    it('lists members with their addresses', () => {
      expect(listMembers('acme')).toEqual([
        { userId: owner, email: 'owner@example.com', role: 'owner' },
        { userId: admin, email: 'admin@example.com', role: 'admin' },
        { userId: developer, email: 'dev@example.com', role: 'developer' },
      ]);
    });
  });
});
