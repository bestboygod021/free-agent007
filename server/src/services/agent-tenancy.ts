/**
 * Membership: who may act inside which organisation and project.
 *
 * The agent tables have always been scoped by `organization_id` and
 * `project_id`, but the route read both from the request body and believed
 * them. That is the same shape as the three bugs already fixed in this
 * surface — protected branches, approver identity, granted scopes — where the
 * subject of a control supplied the control's input. Here the consequence is
 * tenancy: a caller naming another organisation reads its memories.
 *
 * So the request may still *say* which scope it wants, because a user can
 * belong to several. What it cannot do is be believed. Every scoped call
 * resolves the caller's membership from the database and refuses anything it
 * does not hold.
 *
 * The decision rules for invites and role changes already exist, tested, in
 * `agent/src/core/identity-access-contract.ts`. This module is the machinery
 * those rules were missing: it supplies the membership facts they reason over.
 */

import { getDb } from '../db/index.js';

/** The kernel's vocabulary, from `identity-access-contract.ts`. Kept identical
 *  on purpose — two role vocabularies in one system is how authorisation bugs
 *  start. `agent` lets an autonomous run act with less authority than the
 *  human who started it. */
export const ROLES = ['owner', 'admin', 'developer', 'reviewer', 'viewer', 'agent'] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** What a role may do. Ordered least to most, so a check is a comparison
 *  rather than a list of role names scattered through the routes. */
const RANK: Record<Role, number> = {
  viewer: 0,
  agent: 1,
  reviewer: 2,
  developer: 3,
  admin: 4,
  owner: 5,
};

/** Reading scoped data. Every member can. */
export function canRead(role: Role): boolean {
  return RANK[role] >= RANK.viewer;
}

/** Writing scoped data — memories, runs, tool calls. A viewer cannot; an
 *  `agent` can, which is the point of the role. */
export function canWrite(role: Role): boolean {
  return RANK[role] >= RANK.agent;
}

/** Managing the organisation itself: projects, members, roles. An agent
 *  deliberately cannot, however autonomous it is — changing who is allowed in
 *  is not a task a run should be able to do on its own. */
export function canAdminister(role: Role): boolean {
  return RANK[role] >= RANK.admin;
}

export interface Scope {
  organizationId: string;
  projectId: string;
  role: Role;
}

export type ScopeFailure = { status: 400 | 403 | 404; message: string };

function isFailure(value: Scope | ScopeFailure): value is ScopeFailure {
  return 'status' in value;
}

export { isFailure as isScopeFailure };

/** The role this user holds in this organisation, or null. */
export function membershipRole(userId: number, organizationId: string): Role | null {
  const row = getDb()
    .prepare('SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ?')
    .get(organizationId, userId) as { role?: string } | undefined;
  return row && isRole(row.role) ? row.role : null;
}

export function organizationExists(organizationId: string): boolean {
  return (
    getDb()
      .prepare('SELECT 1 FROM organizations WHERE organization_id = ?')
      .get(organizationId) !== undefined
  );
}

export function projectExists(organizationId: string, projectId: string): boolean {
  return (
    getDb()
      .prepare('SELECT 1 FROM projects WHERE organization_id = ? AND project_id = ?')
      .get(organizationId, projectId) !== undefined
  );
}

/**
 * Resolve the scope a request may act in.
 *
 * The body names the organisation and project; membership decides whether the
 * caller gets them. A non-member is told the organisation was not found rather
 * than that they lack access, so the endpoint cannot be used to enumerate
 * which organisations exist.
 */
export function resolveScope(
  userId: number,
  body: Record<string, unknown>,
): Scope | ScopeFailure {
  const organizationId = body.organizationId;
  const projectId = body.projectId;

  if (typeof organizationId !== 'string' || organizationId.trim() === '') {
    return { status: 400, message: '"organizationId" must be a non-empty string.' };
  }
  if (typeof projectId !== 'string' || projectId.trim() === '') {
    return { status: 400, message: '"projectId" must be a non-empty string.' };
  }

  const org = organizationId.trim();
  const project = projectId.trim();

  const role = membershipRole(userId, org);
  if (role === null) {
    // Deliberately indistinguishable from a genuinely missing organisation.
    return { status: 404, message: `organization "${org}" was not found.` };
  }
  if (!projectExists(org, project)) {
    return { status: 404, message: `project "${project}" was not found in that organization.` };
  }

  return { organizationId: org, projectId: project, role };
}

/** Identifiers end up in URLs, logs and file paths, so keep them boring. */
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;

export function isValidIdentifier(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

export function createOrganization(input: {
  organizationId: string;
  name: string;
  ownerUserId: number;
}): void {
  const db = getDb();
  const now = Date.now();
  // One transaction: an organisation with no owner is unreachable, and an
  // owner row pointing at no organisation is orphaned.
  db.transaction(() => {
    db.prepare(
      'INSERT INTO organizations (organization_id, name, created_at) VALUES (?, ?, ?)',
    ).run(input.organizationId, input.name, now);
    db.prepare(
      'INSERT INTO organization_members (organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?)',
    ).run(input.organizationId, input.ownerUserId, 'owner', now);
  })();
}

export function createProject(input: {
  organizationId: string;
  projectId: string;
  name: string;
}): void {
  getDb()
    .prepare(
      'INSERT INTO projects (organization_id, project_id, name, created_at) VALUES (?, ?, ?, ?)',
    )
    .run(input.organizationId, input.projectId, input.name, Date.now());
}

export function addMember(input: {
  organizationId: string;
  userId: number;
  role: Role;
}): void {
  getDb()
    .prepare(
      'INSERT OR REPLACE INTO organization_members (organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?)',
    )
    .run(input.organizationId, input.userId, input.role, Date.now());
}

export function listOrganizations(userId: number): Array<{
  organizationId: string;
  name: string;
  role: Role;
}> {
  const rows = getDb()
    .prepare(
      `SELECT o.organization_id AS organizationId, o.name AS name, m.role AS role
         FROM organizations o
         JOIN organization_members m ON m.organization_id = o.organization_id
        WHERE m.user_id = ?
        ORDER BY o.created_at`,
    )
    .all(userId) as Array<{ organizationId: string; name: string; role: string }>;
  return rows.filter((r): r is { organizationId: string; name: string; role: Role } =>
    isRole(r.role),
  );
}

export function listProjects(organizationId: string): Array<{
  projectId: string;
  name: string;
}> {
  return getDb()
    .prepare(
      `SELECT project_id AS projectId, name FROM projects
        WHERE organization_id = ? ORDER BY created_at`,
    )
    .all(organizationId) as Array<{ projectId: string; name: string }>;
}

/**
 * Give a brand-new install somewhere to put things.
 *
 * Without this, the first account would exist but belong to no organisation,
 * and every agent call would fail on a missing scope — technically correct and
 * useless. The first user owns a `default` organisation with a `default`
 * project, which is what the previous free-form strings effectively meant.
 *
 * Only a genuinely empty install is bootstrapped. If organisations already
 * exist and this user is in none of them, they get nothing: silently adding
 * them to whatever is called `default` would hand a stranger ownership of
 * someone else's tenant, which is precisely the class of bug this module was
 * written to close. Returns null in that case so the caller can show an empty
 * list rather than crash.
 */
export function ensureDefaultOrganization(userId: number): Scope | null {
  const existing = listOrganizations(userId);
  const first = existing[0];
  if (first) {
    const projects = listProjects(first.organizationId);
    const project = projects[0];
    if (project) {
      return {
        organizationId: first.organizationId,
        projectId: project.projectId,
        role: first.role,
      };
    }
    // A member of an organisation with no project still needs somewhere to
    // write, and they are already inside the tenant, so this grants nothing new.
    createProject({
      organizationId: first.organizationId,
      projectId: 'default',
      name: 'Default project',
    });
    return { organizationId: first.organizationId, projectId: 'default', role: first.role };
  }

  const anyOrganizationExists =
    getDb().prepare('SELECT 1 FROM organizations LIMIT 1').get() !== undefined;
  if (anyOrganizationExists) {
    return null;
  }

  createOrganization({ organizationId: 'default', name: 'Default', ownerUserId: userId });
  createProject({ organizationId: 'default', projectId: 'default', name: 'Default project' });
  return { organizationId: 'default', projectId: 'default', role: 'owner' };
}
