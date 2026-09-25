import { describe, it, expect, beforeEach } from 'vitest';
import { initDb, getDb } from '../../db/index.js';
import {
  resolveScope,
  isScopeFailure,
  membershipRole,
  createOrganization,
  createProject,
  addMember,
  listOrganizations,
  listProjects,
  ensureDefaultOrganization,
  isValidIdentifier,
  canRead,
  canWrite,
  canAdminister,
  isRole,
} from '../../services/agent-tenancy.js';

function makeUser(email: string): number {
  const info = getDb()
    .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
    .run(email, 'x');
  return Number(info.lastInsertRowid);
}

describe('agent tenancy', () => {
  let alice: number;
  let mallory: number;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    alice = makeUser('alice@example.com');
    mallory = makeUser('mallory@example.com');
    createOrganization({ organizationId: 'acme', name: 'Acme', ownerUserId: alice });
    createProject({ organizationId: 'acme', projectId: 'web', name: 'Web' });
  });

  describe('scope resolution', () => {
    it('gives a member the scope it asked for, with its role', () => {
      const scope = resolveScope(alice, { organizationId: 'acme', projectId: 'web' });
      expect(isScopeFailure(scope)).toBe(false);
      expect(scope).toMatchObject({ organizationId: 'acme', projectId: 'web', role: 'owner' });
    });

    it('refuses an organisation the caller is not a member of', () => {
      // The whole point: the body named a real organisation and was not believed.
      const scope = resolveScope(mallory, { organizationId: 'acme', projectId: 'web' });
      expect(isScopeFailure(scope)).toBe(true);
      expect(scope).toMatchObject({ status: 404 });
    });

    it('does not reveal whether a refused organisation exists', () => {
      // Otherwise the endpoint enumerates tenants for anyone with an account.
      const real = resolveScope(mallory, { organizationId: 'acme', projectId: 'web' });
      const fake = resolveScope(mallory, { organizationId: 'ghost', projectId: 'web' });
      expect(isScopeFailure(real) && real.message).toBe(
        isScopeFailure(fake) && fake.message.replace('ghost', 'acme'),
      );
      expect(isScopeFailure(real) && real.status).toBe(isScopeFailure(fake) && fake.status);
    });

    it('refuses a project that belongs to another organisation', () => {
      createOrganization({ organizationId: 'other', name: 'Other', ownerUserId: alice });
      createProject({ organizationId: 'other', projectId: 'secret', name: 'Secret' });

      const scope = resolveScope(alice, { organizationId: 'acme', projectId: 'secret' });
      expect(isScopeFailure(scope)).toBe(true);
      expect(scope).toMatchObject({ status: 404 });
    });

    it('rejects a missing or blank identifier before touching the database', () => {
      for (const body of [
        {},
        { organizationId: 'acme' },
        { organizationId: '', projectId: 'web' },
        { organizationId: 'acme', projectId: '   ' },
        { organizationId: 42, projectId: 'web' },
      ]) {
        const scope = resolveScope(alice, body as Record<string, unknown>);
        expect(isScopeFailure(scope)).toBe(true);
        expect(scope).toMatchObject({ status: 400 });
      }
    });

    it('tolerates surrounding whitespace rather than creating a second tenant', () => {
      const scope = resolveScope(alice, { organizationId: ' acme ', projectId: ' web ' });
      expect(scope).toMatchObject({ organizationId: 'acme', projectId: 'web' });
    });
  });

  describe('roles', () => {
    it('ranks what each role may do', () => {
      expect(canRead('viewer')).toBe(true);
      expect(canWrite('viewer')).toBe(false);

      // An agent may write — that is the point of the role — but may not
      // change who is allowed in.
      expect(canWrite('agent')).toBe(true);
      expect(canAdminister('agent')).toBe(false);

      expect(canAdminister('admin')).toBe(true);
      expect(canAdminister('owner')).toBe(true);
      expect(canAdminister('developer')).toBe(false);
    });

    it('matches the kernel vocabulary exactly', () => {
      // Two role vocabularies in one system is how authorisation bugs start.
      for (const role of ['owner', 'admin', 'developer', 'reviewer', 'viewer', 'agent']) {
        expect(isRole(role)).toBe(true);
      }
      expect(isRole('OWNER')).toBe(false);
      expect(isRole('superuser')).toBe(false);
    });

    it('reports the role a member actually holds', () => {
      addMember({ organizationId: 'acme', userId: mallory, role: 'viewer' });
      expect(membershipRole(mallory, 'acme')).toBe('viewer');
      expect(membershipRole(alice, 'acme')).toBe('owner');
      expect(membershipRole(mallory, 'ghost')).toBeNull();
    });

    it('lets a role be changed without duplicating the membership', () => {
      addMember({ organizationId: 'acme', userId: mallory, role: 'viewer' });
      addMember({ organizationId: 'acme', userId: mallory, role: 'developer' });
      expect(membershipRole(mallory, 'acme')).toBe('developer');
      expect(listOrganizations(mallory)).toHaveLength(1);
    });
  });

  describe('listing', () => {
    it('lists only the organisations the caller belongs to', () => {
      createOrganization({ organizationId: 'zeta', name: 'Zeta', ownerUserId: mallory });

      expect(listOrganizations(alice).map((o) => o.organizationId)).toEqual(['acme']);
      expect(listOrganizations(mallory).map((o) => o.organizationId)).toEqual(['zeta']);
    });

    it('scopes project ids to their organisation', () => {
      createOrganization({ organizationId: 'zeta', name: 'Zeta', ownerUserId: mallory });
      // Both tenants may have a project called "web" without collision.
      createProject({ organizationId: 'zeta', projectId: 'web', name: 'Web' });

      expect(listProjects('acme')).toEqual([{ projectId: 'web', name: 'Web' }]);
      expect(listProjects('zeta')).toEqual([{ projectId: 'web', name: 'Web' }]);
      expect(resolveScope(mallory, { organizationId: 'zeta', projectId: 'web' })).toMatchObject({
        organizationId: 'zeta',
      });
    });
  });

  describe('first-run bootstrap', () => {
    it('gives a brand-new user somewhere to put things', () => {
      // A genuinely empty install: no organisations at all.
      getDb().prepare('DELETE FROM organizations').run();
      const fresh = makeUser('fresh@example.com');
      const scope = ensureDefaultOrganization(fresh);

      expect(scope).toMatchObject({ organizationId: 'default', projectId: 'default', role: 'owner' });
      expect(resolveScope(fresh, { organizationId: 'default', projectId: 'default' })).toMatchObject(
        { role: 'owner' },
      );
    });

    it('refuses to adopt a stranger into an existing tenant', () => {
      // An install that already has organisations is not a fresh install. Auto-
      // joining this user to whatever is called "default" would hand them
      // ownership of someone else's data.
      const stranger = makeUser('stranger@example.com');
      expect(ensureDefaultOrganization(stranger)).toBeNull();
      expect(listOrganizations(stranger)).toEqual([]);
      expect(membershipRole(stranger, 'acme')).toBeNull();
    });

    it('does not crash when a default organisation is orphaned', () => {
      // Deleting users without deleting organisations leaves `default` behind;
      // bootstrapping a new user must not collide on the primary key.
      createOrganization({ organizationId: 'default', name: 'Default', ownerUserId: alice });
      const fresh = makeUser('later@example.com');
      expect(() => ensureDefaultOrganization(fresh)).not.toThrow();
      expect(ensureDefaultOrganization(fresh)).toBeNull();
    });

    it('is idempotent and does not clone an existing organisation', () => {
      const first = ensureDefaultOrganization(alice);
      const second = ensureDefaultOrganization(alice);

      expect(first).toEqual(second);
      expect(first.organizationId).toBe('acme');
      expect(listOrganizations(alice)).toHaveLength(1);
    });

    it('repairs an organisation that somehow has no project', () => {
      createOrganization({ organizationId: 'empty', name: 'Empty', ownerUserId: mallory });
      const scope = ensureDefaultOrganization(mallory);
      expect(scope).toMatchObject({ organizationId: 'empty', projectId: 'default' });
    });
  });

  describe('identifiers', () => {
    it('accepts boring ids and rejects ones that would break a URL or path', () => {
      for (const good of ['acme', 'acme-corp', 'a', 'team_1', 'x9']) {
        expect(isValidIdentifier(good)).toBe(true);
      }
      for (const bad of [
        '',
        'Acme', // uppercase would make two ids look like one
        '-leading',
        '_leading',
        'has space',
        '../escape',
        'semi;colon',
        'a'.repeat(64),
        null,
        7,
      ]) {
        expect(isValidIdentifier(bad)).toBe(false);
      }
    });
  });

  describe('data integrity', () => {
    it('never leaves an organisation without an owner', () => {
      // Both rows are written in one transaction, so a failure cannot produce
      // an organisation nobody can administer.
      expect(() =>
        createOrganization({ organizationId: 'acme', name: 'Duplicate', ownerUserId: mallory }),
      ).toThrow();
      expect(membershipRole(mallory, 'acme')).toBeNull();
      expect(membershipRole(alice, 'acme')).toBe('owner');
    });

    it('removes projects and memberships when an organisation is deleted', () => {
      getDb().prepare('DELETE FROM organizations WHERE organization_id = ?').run('acme');
      expect(listProjects('acme')).toEqual([]);
      expect(membershipRole(alice, 'acme')).toBeNull();
    });
  });
});
