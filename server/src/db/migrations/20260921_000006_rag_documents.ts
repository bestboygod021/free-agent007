// Migration: documents, their chunks, and the vectors that find them.
// Created: 2026-09-21
//
// `runEmbeddings()` has worked for a long time — 20 provider families, failover
// within a family, cost accounting. What was missing was anywhere to *put* an
// embedding: every call returned vectors to a caller who then dropped them, so
// nothing could ever be retrieved later. This is that missing half.
//
// Three tables rather than one, because the three things have different
// lifetimes. A document is what a user uploaded and can delete. A chunk is a
// derived slice of it, disposable and re-derivable if the chunker improves. A
// vector is derived again from the chunk, and is invalidated by something else
// entirely: changing the embedding model. Keeping them apart means re-chunking
// or re-embedding does not touch the source text.
//
// Vectors are stored as raw little-endian float32 BLOBs, not JSON. A 1536-dim
// vector is 6KB as bytes and about 40KB as a JSON array of decimals, and the
// scorer has to parse every candidate on every query. There is no vector index
// here — no sqlite-vss in the lockfile, and an honest brute-force scan over a
// tenant's chunks is fast enough for the corpus sizes this serves. The scan is
// bounded by (organization_id, project_id) in SQL, so it never walks another
// tenant's rows.
//
// DOWN: reversible — drops all three tables.

import type { Db } from '../types.js';

export function up(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rag_documents (
      document_id     TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      project_id      TEXT NOT NULL,
      title           TEXT NOT NULL,
      -- Where this came from: a filename, a URL, a commit. Shown in citations,
      -- so a reader can go and check the claim.
      source_uri      TEXT,
      -- SHA-256 of the full text. Re-ingesting identical content is a no-op
      -- rather than a duplicate, which matters when a folder is synced twice.
      content_hash    TEXT NOT NULL,
      -- Kept so a chunk can be re-derived without the original file, and so a
      -- citation can quote exact characters rather than a paraphrase.
      content         TEXT NOT NULL,
      byte_size       INTEGER NOT NULL,
      created_at      INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_rag_documents_dedupe
      ON rag_documents (organization_id, project_id, content_hash);

    CREATE TABLE IF NOT EXISTS rag_chunks (
      chunk_id        TEXT PRIMARY KEY,
      document_id     TEXT NOT NULL
        REFERENCES rag_documents(document_id) ON DELETE CASCADE,
      organization_id TEXT NOT NULL,
      project_id      TEXT NOT NULL,
      -- Position within the document, so chunks can be re-assembled in order
      -- and a citation can say "part 3 of 9".
      ordinal         INTEGER NOT NULL,
      -- Character offsets into rag_documents.content. A citation is only
      -- checkable if you can point at the exact span it came from.
      start_offset    INTEGER NOT NULL,
      end_offset      INTEGER NOT NULL,
      text            TEXT NOT NULL,
      token_estimate  INTEGER NOT NULL,
      created_at      INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rag_chunks_document
      ON rag_chunks (document_id, ordinal);
    CREATE INDEX IF NOT EXISTS idx_rag_chunks_scope
      ON rag_chunks (organization_id, project_id);

    CREATE TABLE IF NOT EXISTS rag_embeddings (
      chunk_id        TEXT NOT NULL
        REFERENCES rag_chunks(chunk_id) ON DELETE CASCADE,
      -- The family the vector came from. Vectors from different models are not
      -- comparable, so every query filters on this; it is half the primary key
      -- so a corpus can hold two models at once during a migration.
      family          TEXT NOT NULL,
      dimensions      INTEGER NOT NULL,
      -- Raw little-endian float32. See the note above on why not JSON.
      vector          BLOB NOT NULL,
      created_at      INTEGER NOT NULL,
      PRIMARY KEY (chunk_id, family)
    );

    CREATE INDEX IF NOT EXISTS idx_rag_embeddings_family
      ON rag_embeddings (family);
  `);
}

export function down(db: Db): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_rag_embeddings_family;
    DROP TABLE IF EXISTS rag_embeddings;
    DROP INDEX IF EXISTS idx_rag_chunks_scope;
    DROP INDEX IF EXISTS idx_rag_chunks_document;
    DROP TABLE IF EXISTS rag_chunks;
    DROP INDEX IF EXISTS idx_rag_documents_dedupe;
    DROP TABLE IF EXISTS rag_documents;
  `);
}
