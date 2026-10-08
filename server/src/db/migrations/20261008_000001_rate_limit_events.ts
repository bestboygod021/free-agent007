// Migration: durable rate-limit rejection events (operator visibility).
// Created: 2026-10-08
//
// DOWN: reversible
//
// The middleware keeps a 200-entry ring for the hot path, but an operator who
// restarts the server mid-incident should not lose the trail of what the
// limiter just turned away. Rejections are rare (that is the point of a
// limiter), so a plain insert per event is cheap, and pruning on insert keeps
// a 7-day window without a background job.

import type { Db } from '../types.js';

export function up(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      scope TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      ip TEXT,
      subject TEXT,
      limit_rpm INTEGER NOT NULL,
      retry_after INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rate_limit_events_ts ON rate_limit_events (ts DESC);
  `);
}

export function down(db: Db): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_rate_limit_events_ts;
    DROP TABLE IF EXISTS rate_limit_events;
  `);
}
