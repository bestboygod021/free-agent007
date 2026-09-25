// Migration: vectors for the response cache, so a reworded question can hit.
// Created: 2026-09-21
//
// The response cache is exact: a SHA-256 over the messages and every sampling
// knob. That is the right default — its own comment says wrong-answer
// collisions are worse than missed hits — but it means "how do I reset my
// password?" and "how can I reset my password" are two provider calls for one
// answer. Paraphrase is the normal case in chat, so the exact cache misses
// most of what it could save.
//
// This table stores one embedding per cached prompt so a near-miss can be
// found. It deliberately does NOT replace the exact key:
//
//   cache_key    the exact key this vector belongs to. A semantic match
//                resolves to a real entry in the existing store, which is then
//                read through the normal path (TTL, LRU, hit counting).
//   variant_key  a hash of everything in the request that is NOT the message
//                text — model, temperature, tools, response_format, and the
//                rest. Similarity is only ever compared within one variant, so
//                a JSON-mode request can never be served a plain-text answer
//                however similar the wording.
//
// Splitting the key this way is the whole safety argument: semantics are
// allowed to vary only in the part where paraphrase is meaningful, and
// everything else must still match bit for bit.
//
// Vectors are float32 BLOBs for the same reason as rag_embeddings: a 1536-dim
// vector is ~6KB as bytes and ~40KB as JSON, and every candidate is parsed on
// every lookup.
//
// DOWN: reversible — drops the table. The exact cache is untouched, so a
// down-migration only loses the ability to match paraphrases.

import type { Db } from '../types.js';

export function up(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS semantic_cache (
      cache_key     TEXT PRIMARY KEY,
      -- Everything except the message text. Candidates are filtered on this
      -- before any vector is compared.
      variant_key   TEXT NOT NULL,
      -- Vectors from different embedding families are not comparable.
      family        TEXT NOT NULL,
      dimensions    INTEGER NOT NULL,
      vector        BLOB NOT NULL,
      -- The canonical prompt text this vector came from. Kept so a match can
      -- be re-checked cheaply (digit comparison) without another embedding
      -- call, and so an operator can see what actually got cached.
      prompt_text   TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      expires_at_ms INTEGER NOT NULL
    );

    -- The lookup: narrow to one variant and one family, then scan.
    CREATE INDEX IF NOT EXISTS idx_semantic_cache_variant
      ON semantic_cache (variant_key, family, expires_at_ms);
    CREATE INDEX IF NOT EXISTS idx_semantic_cache_expires
      ON semantic_cache (expires_at_ms);
  `);
}

export function down(db: Db): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_semantic_cache_expires;
    DROP INDEX IF EXISTS idx_semantic_cache_variant;
    DROP TABLE IF EXISTS semantic_cache;
  `);
}
