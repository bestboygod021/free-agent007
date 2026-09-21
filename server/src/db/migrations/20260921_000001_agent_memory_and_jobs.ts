// Migration: durable agent memory + job queue for the ForgePilot kernel.
// Created: 2026-09-21
//
// The kernel shipped two capabilities that only ever lived in process memory:
// `memory-retrieval.ts` (tenant-scoped, provenance-carrying recall) and
// `job-queue.ts` (priority + lease + retry + DLQ). Both lost everything on
// restart, which makes them unusable for real work: an agent that forgets the
// project between runs re-asks the same questions, and a queue that forgets
// in-flight jobs silently drops them.
//
// These two tables give both a SQLite home, so memory survives restarts and a
// crashed worker's lease expires instead of stranding the job forever.
//
// DOWN: reversible — drops both tables and their indexes.

import type { Db } from '../types.js';

export function up(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_memories (
      memory_id       TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      project_id      TEXT NOT NULL,
      kind            TEXT NOT NULL,
      content         TEXT NOT NULL,
      content_hash    TEXT NOT NULL,
      trust           TEXT NOT NULL,
      source_type     TEXT NOT NULL,
      source_id       TEXT NOT NULL,
      evidence_hash   TEXT NOT NULL,
      tags            TEXT NOT NULL DEFAULT '[]',
      created_at      INTEGER NOT NULL,
      expires_at      INTEGER
    );

    -- Retrieval always filters by tenant first, then drops expired rows, so the
    -- scan this index serves is the only one the hot path performs.
    CREATE INDEX IF NOT EXISTS idx_agent_memories_scope
      ON agent_memories(organization_id, project_id, expires_at);

    -- Writing the same fact twice must not create a second row. The kernel
    -- hashes content; this makes that hash authoritative per project.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_memories_dedupe
      ON agent_memories(organization_id, project_id, content_hash);

    CREATE TABLE IF NOT EXISTS agent_jobs (
      job_id          TEXT PRIMARY KEY,
      queue           TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      run_id          TEXT,
      idempotency_key TEXT NOT NULL,
      payload         TEXT NOT NULL,
      payload_hash    TEXT NOT NULL,
      priority        INTEGER NOT NULL DEFAULT 0,
      status          TEXT NOT NULL,
      attempts        INTEGER NOT NULL DEFAULT 0,
      max_attempts    INTEGER NOT NULL,
      available_at    INTEGER NOT NULL,
      created_at      INTEGER NOT NULL,
      -- Lease fields. A claimed job is owned by exactly one worker until
      -- lease_expires_at passes; after that any worker may reclaim it, which is
      -- what stops a crashed worker from stranding the job.
      worker_id         TEXT,
      lease_expires_at  INTEGER,
      last_error        TEXT,
      completed_at      INTEGER
    );

    -- Same idempotency key + same queue + same tenant = the same job.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_jobs_dedupe
      ON agent_jobs(queue, organization_id, idempotency_key);

    -- The claim query: highest priority first, then oldest, among rows that are
    -- due and claimable.
    CREATE INDEX IF NOT EXISTS idx_agent_jobs_claim
      ON agent_jobs(queue, status, available_at, priority DESC, created_at);

    -- Reclaiming expired leases scans only leased rows.
    CREATE INDEX IF NOT EXISTS idx_agent_jobs_lease
      ON agent_jobs(status, lease_expires_at)
      WHERE lease_expires_at IS NOT NULL;
  `);
}

export function down(db: Db): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_agent_jobs_lease;
    DROP INDEX IF EXISTS idx_agent_jobs_claim;
    DROP INDEX IF EXISTS idx_agent_jobs_dedupe;
    DROP TABLE IF EXISTS agent_jobs;
    DROP INDEX IF EXISTS idx_agent_memories_dedupe;
    DROP INDEX IF EXISTS idx_agent_memories_scope;
    DROP TABLE IF EXISTS agent_memories;
  `);
}
