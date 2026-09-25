// Migration: organisations, projects, and who is allowed in them.
// Created: 2026-09-21
//
// Every agent table already carries `organization_id` and `project_id`, but
// until now nothing defined what those strings *were*. They arrived in the
// request body, were trusted, and were written down. Two different callers
// naming the same organisation shared a bucket; a caller naming someone
// else's organisation read their memories. With a single-user install that is
// theoretical, but the scoping columns are load-bearing and the roadmap's next
// step is multi-user, so the identifiers need an owner before more data is
// written against them.
//
// The rules for this already exist in the kernel and are well tested
// (`identity-access-contract.ts`, `tenant-context.ts`). They were written for
// PostgreSQL row-level security, which this SQLite deployment does not have,
// so enforcement here is in the query layer instead: every scoped read and
// write resolves membership first. This migration supplies the tables that
// resolution reads.
//
// Roles are the kernel's own vocabulary from `identity-access-contract.ts`
// (owner/admin/developer/reviewer/viewer/agent) rather than the four-role set
// in `tenant-context.ts`, because the six-role set is the one the invite and
// role-change decisions are written against, and having two vocabularies in
// one system is how authorisation bugs start.
//
// `agent` is a role a *member* can hold, which is deliberate: it lets an
// autonomous run act with less authority than the human who started it.
//
// DOWN: reversible — drops the tables and their indexes. Existing agent rows
// keep their organization_id strings, so a down-migration loses membership but
// not scoped data.

import type { Db } from '../types.js';

export function up(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      -- Text, not an integer: these ids already appear in agent tables as
      -- free-form strings, and a slug survives an export/import that a
      -- rowid does not.
      organization_id TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      created_at      INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      project_id      TEXT NOT NULL,
      organization_id TEXT NOT NULL
        REFERENCES organizations(organization_id) ON DELETE CASCADE,
      name            TEXT NOT NULL,
      created_at      INTEGER NOT NULL,
      -- A project id is unique within its organisation, not globally: two
      -- tenants may both have a project called "default" without collision.
      PRIMARY KEY (organization_id, project_id)
    );

    CREATE TABLE IF NOT EXISTS organization_members (
      organization_id TEXT NOT NULL
        REFERENCES organizations(organization_id) ON DELETE CASCADE,
      -- References users(id). Not a foreign key with ON DELETE CASCADE by
      -- accident: deleting a user should be a deliberate act that considers
      -- what they owned, so the constraint is RESTRICT-by-omission here and
      -- handled in application code.
      user_id         INTEGER NOT NULL,
      -- owner | admin | developer | reviewer | viewer | agent
      role            TEXT NOT NULL,
      created_at      INTEGER NOT NULL,
      PRIMARY KEY (organization_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_organization_members_user
      ON organization_members (user_id);
    CREATE INDEX IF NOT EXISTS idx_projects_organization
      ON projects (organization_id);
  `);
}

export function down(db: Db): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_projects_organization;
    DROP INDEX IF EXISTS idx_organization_members_user;
    DROP TABLE IF EXISTS organization_members;
    DROP TABLE IF EXISTS projects;
    DROP TABLE IF EXISTS organizations;
  `);
}
