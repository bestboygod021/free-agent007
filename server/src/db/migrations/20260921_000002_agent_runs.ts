// Migration: durable agent runs + hash-chained checkpoints.
// Created: 2026-09-21
//
// The kernel has a 19-state machine with six enforced invariants, a policy
// engine, a DAG planner and a repair budget — and nothing that drives them. A
// run existed only as a `transition()` call the caller made by hand, so there
// was no such thing as "a run" you could inspect, resume or audit.
//
// Two tables fix that:
//
//   agent_runs         one row per run: where it is, what it is allowed to
//                      spend, and why it stopped.
//   agent_checkpoints  an append-only, hash-chained log of every step, so a
//                      crashed run resumes from its last committed step and
//                      the history cannot be silently rewritten.
//
// DOWN: reversible — drops both tables and their indexes.

import type { Db } from '../types.js';

export function up(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_runs (
      run_id          TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      project_id      TEXT NOT NULL,
      goal            TEXT NOT NULL,
      mode            TEXT NOT NULL,
      privacy_level   TEXT NOT NULL,
      state           TEXT NOT NULL,
      -- The RunContext the state machine mutates (repair budget, approval
      -- flags). Stored whole because the kernel owns its shape, not the DB.
      context         TEXT NOT NULL,
      -- Ceilings resolved from the compute mode at creation time. Copied onto
      -- the run rather than re-read, so changing a mode profile cannot
      -- retroactively widen a running agent's budget.
      max_steps       INTEGER NOT NULL,
      max_tokens      INTEGER NOT NULL,
      max_cost        REAL NOT NULL,
      deadline_at     INTEGER,
      steps_used      INTEGER NOT NULL DEFAULT 0,
      tokens_used     INTEGER NOT NULL DEFAULT 0,
      cost_used       REAL NOT NULL DEFAULT 0,
      -- Set when the run stops for a reason worth showing a human.
      stop_reason     TEXT,
      -- Populated when the run is waiting on a person (plan/deploy approval).
      awaiting        TEXT,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    );

    -- Listing a project's runs newest-first is the dashboard's default view.
    CREATE INDEX IF NOT EXISTS idx_agent_runs_scope
      ON agent_runs(organization_id, project_id, created_at DESC);

    -- Finding resumable work after a restart.
    CREATE INDEX IF NOT EXISTS idx_agent_runs_state
      ON agent_runs(state, updated_at);

    CREATE TABLE IF NOT EXISTS agent_checkpoints (
      checkpoint_id TEXT PRIMARY KEY,
      run_id        TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
      sequence      INTEGER NOT NULL,
      state         TEXT NOT NULL,
      event         TEXT,
      payload       TEXT NOT NULL,
      previous_hash TEXT NOT NULL,
      hash          TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    );

    -- A sequence number is written once. The UNIQUE constraint is what makes
    -- the append-only promise enforceable by the database rather than by
    -- convention: a replayed or duplicated step fails loudly.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_checkpoints_seq
      ON agent_checkpoints(run_id, sequence);

    CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_run
      ON agent_checkpoints(run_id, sequence DESC);
  `);
}

export function down(db: Db): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_agent_checkpoints_run;
    DROP INDEX IF EXISTS idx_agent_checkpoints_seq;
    DROP TABLE IF EXISTS agent_checkpoints;
    DROP INDEX IF EXISTS idx_agent_runs_state;
    DROP INDEX IF EXISTS idx_agent_runs_scope;
    DROP TABLE IF EXISTS agent_runs;
  `);
}
