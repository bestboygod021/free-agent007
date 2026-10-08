// Migration: a keyword index beside the vector index.
// Created: 2026-09-24
//
// Measured, not assumed. With the deterministic embedding stub the retrieval
// tests use, searching a corpus for `ERR_QUOTA_7734` -- a string that is
// literally present in it -- returns *nothing* under production defaults. The
// identifier carries no signal in the embedding, every chunk ties at 0.000,
// and the default `minScore: 0.2` discards the lot. The same query as a
// keyword lookup finds the one right chunk immediately.
//
// That is not a defect of the stub. A real embedding model has a fixed
// tokenizer vocabulary too: a rare identifier is split into subword fragments
// whose average is close to nothing in particular. Dense retrieval is good at
// "what is the timeout policy" and bad at "ERR_QUOTA_7734", and the second is
// the query an agent debugging a codebase actually types.
//
// FTS5 is compiled into the better-sqlite3 build already in the lockfile --
// checked by running it, not by reading the build flags -- and it ships real
// BM25 via the `bm25()` auxiliary function. So this needs no new dependency,
// and unlike the vector scan it is a genuine index rather than a full walk.
//
// An external-content table would be tidier, but it makes the FTS index a
// silent function of rag_chunks: rebuilds and `delete-all` commands have to be
// issued by hand anyway, and a mismatch between the two shows up as missing
// search results rather than as an error. A plain table with the chunk_id
// stored alongside is dumber and easier to reason about, and the writer keeps
// both in one transaction.
//
// Tenant columns are indexed *inside* the FTS table as UNINDEXED so scoping
// can happen in SQL. Filtering after the fact would let a large `limit` walk
// another tenant's rows, which is exactly the property the vector path is
// careful about.
//
// DOWN: reversible — drops the table.

import type { Db } from '../types.js';

export function up(db: Db): void {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS rag_chunks_fts USING fts5(
      text,
      chunk_id        UNINDEXED,
      organization_id UNINDEXED,
      project_id      UNINDEXED,
      tokenize = 'unicode61'
    );
  `);

  // Backfill, so a corpus ingested before this migration is searchable by
  // keyword without being re-ingested. Skipped silently when rag_chunks does
  // not exist yet, which is the case on a fresh database where the migrations
  // run in order and this one lands after the table is created but before
  // anything is in it.
  const hasChunks = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rag_chunks'`)
    .get();
  if (hasChunks) {
    db.exec(`
      INSERT INTO rag_chunks_fts (text, chunk_id, organization_id, project_id)
      SELECT text, chunk_id, organization_id, project_id FROM rag_chunks;
    `);
  }
}

export function down(db: Db): void {
  db.exec('DROP TABLE IF EXISTS rag_chunks_fts;');
}
