// Migration: an audit log for every tool invocation an agent attempts.
// Created: 2026-09-21
//
// The driver can decide what should happen next, but no phase can act: there
// is no way for an agent to read a file, search a repo or run a test. Adding
// that capability is the point at which an agent stops being advisory and
// starts changing things, so the first thing it needs is a record.
//
// Every attempt is written here — allowed or refused, succeeded or failed —
// before and after execution. A refused call is a row too, because "the agent
// tried to delete the database and was stopped" is exactly the event an
// operator needs to see. Rows reference a run when one exists, so a run's
// history of decisions (agent_checkpoints) and its history of effects
// (agent_tool_calls) can be read side by side.
//
// DOWN: reversible — drops the table and its indexes.

import type { Db } from '../types.js';

export function up(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_tool_calls (
      call_id         TEXT PRIMARY KEY,
      run_id          TEXT,
      organization_id TEXT NOT NULL,
      project_id      TEXT NOT NULL,
      tool            TEXT NOT NULL,
      -- Arguments as given, after redaction. Stored as text so a tool's schema
      -- can evolve without a migration.
      args            TEXT NOT NULL,
      -- allowed | denied | error | ok. 'denied' means policy or validation
      -- refused it and the handler never ran.
      outcome         TEXT NOT NULL,
      -- Why it was refused, or how it failed. Null on success.
      reason          TEXT,
      risk_level      TEXT NOT NULL,
      side_effect     TEXT NOT NULL,
      -- Hash of the result, so a later claim about what a tool returned can be
      -- checked without storing the whole payload.
      result_hash     TEXT,
      result_preview  TEXT,
      duration_ms     INTEGER NOT NULL DEFAULT 0,
      created_at      INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_run
      ON agent_tool_calls (run_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_scope
      ON agent_tool_calls (organization_id, project_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_tool
      ON agent_tool_calls (tool, created_at);
  `);
}

export function down(db: Db): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_agent_tool_calls_tool;
    DROP INDEX IF EXISTS idx_agent_tool_calls_scope;
    DROP INDEX IF EXISTS idx_agent_tool_calls_run;
    DROP TABLE IF EXISTS agent_tool_calls;
  `);
}
