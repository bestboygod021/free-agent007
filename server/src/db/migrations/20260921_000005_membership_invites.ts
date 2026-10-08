// Migration: invitations to join an organisation.
// Created: 2026-09-21
//
// The previous migration gave organisations members, but the only way to
// become one was a direct database write: `createUser` has no notion of an
// organisation, and there is no register route at all. So an install is
// permanently single-user, and `organization_members` can never grow.
//
// The rules for who may invite whom already exist and are tested, in
// `agent/src/core/identity-access-contract.ts` — `decideMembershipInvite`
// refuses a non-admin inviter, refuses a non-owner granting elevated roles,
// and refuses an expired invite. They have never been reachable. This table is
// the durable store those rules were explicitly written without ("it does not
// implement an auth provider, mailer or durable membership store").
//
// The invitee is stored as an email plus a secret token hash, never a raw
// token: a leaked database should not let someone redeem an outstanding
// invite. That mirrors how `sessions` stores `token_hash`.
//
// An invite is single-use. `accepted_at` is the record of use rather than a
// deletion, so an operator can answer "who let this person in, and when"
// after the fact — the same reason `agent_tool_calls` keeps refused calls.
//
// DOWN: reversible — drops the table and its indexes. Memberships already
// created from accepted invites survive, which is correct: revoking the
// paperwork should not silently eject people.

import type { Db } from '../types.js';

export function up(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS organization_invites (
      invite_id       TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL
        REFERENCES organizations(organization_id) ON DELETE CASCADE,
      -- Normalised email. Stored in the clear because the inviter must be able
      -- to see who they invited and revoke it.
      email           TEXT NOT NULL,
      -- SHA-256 of the single-use token handed to the inviter. The raw token
      -- is returned once, at creation, and never stored.
      token_hash      TEXT NOT NULL UNIQUE,
      role            TEXT NOT NULL,
      invited_by      INTEGER NOT NULL,
      expires_at      INTEGER NOT NULL,
      created_at      INTEGER NOT NULL,
      -- Null while outstanding; the acceptance timestamp once redeemed.
      accepted_at     INTEGER,
      accepted_by     INTEGER
    );

    -- One outstanding invite per person per organisation. A partial index, so
    -- the same person may be re-invited after an invite is accepted or
    -- revoked, but cannot hold two live invites at once.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_invites_pending
      ON organization_invites (organization_id, email)
      WHERE accepted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_organization_invites_org
      ON organization_invites (organization_id, created_at);
  `);
}

export function down(db: Db): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_organization_invites_org;
    DROP INDEX IF EXISTS idx_organization_invites_pending;
    DROP TABLE IF EXISTS organization_invites;
  `);
}
