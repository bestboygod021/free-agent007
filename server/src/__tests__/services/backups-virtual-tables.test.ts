import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDb, getDb } from '../../db/index.js';
import { listTables, createBackup, restoreBackup } from '../../services/backups.js';

/**
 * Adding an FTS5 index broke backup and restore, and only the full suite
 * caught it -- the retrieval tests were all green.
 *
 * Two independent faults, which is why a single assertion here would not be
 * enough:
 *
 *  1. A virtual table's schema is `CREATE VIRTUAL TABLE ...`, and the dump
 *     rewrote `^CREATE TABLE` to add IF NOT EXISTS. The virtual table missed
 *     the rewrite, so restoring into an already-migrated database failed with
 *     "table rag_chunks_fts already exists" and rolled the restore back.
 *  2. FTS5 also creates five ordinary tables beside it (_data, _idx,
 *     _content, _docsize, _config) holding the inverted index. Those were
 *     dumped as if they were user data.
 */
describe('backups and virtual tables', () => {
  let dataDir = '';

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    // Dumps are written beside the database file, so point that at scratch.
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fts-backup-'));
    process.env.FREEAPI_DB_PATH = path.join(dataDir, 'freeapi.db');
    initDb(':memory:');
  });

  afterAll(() => {
    delete process.env.FREEAPI_DB_PATH;
  });

  it('includes the FTS index itself in the table list', () => {
    expect(listTables()).toContain('rag_chunks_fts');
  });

  it('excludes the shadow tables that FTS5 creates beside it', () => {
    const tables = listTables();

    for (const suffix of ['data', 'idx', 'content', 'docsize', 'config']) {
      expect(tables).not.toContain(`rag_chunks_fts_${suffix}`);
    }
  });

  it('still lists the ordinary tables', () => {
    const tables = listTables();

    expect(tables).toContain('rag_chunks');
    expect(tables).toContain('rag_documents');
  });

  /**
   * The behavioural test. Asserting on the generated SQL would pass against a
   * rewrite that produces valid-looking text SQLite still rejects.
   */
  it('round-trips a database containing an FTS index', () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO rag_chunks_fts (text, chunk_id, organization_id, project_id)
       VALUES (?, ?, ?, ?)`,
    ).run('Error ERR_QUOTA_7734 was returned', 'chk_1', 'acme', 'web');

    const backup = createBackup(db);

    // Change the indexed content, then restore over it.
    db.prepare('DELETE FROM rag_chunks_fts').run();
    db.prepare(
      `INSERT INTO rag_chunks_fts (text, chunk_id, organization_id, project_id)
       VALUES (?, ?, ?, ?)`,
    ).run('something else entirely', 'chk_2', 'acme', 'web');

    restoreBackup(db, backup.id);

    const rows = getDb()
      .prepare('SELECT chunk_id AS chunkId FROM rag_chunks_fts')
      .all() as Array<{ chunkId: string }>;
    expect(rows.map((r) => r.chunkId)).toEqual(['chk_1']);
  });

  /**
   * Restoring the rows is not enough: the inverted index has to be rebuilt
   * from them, or the table holds the right content and answers no queries.
   */
  it('leaves the restored index actually searchable', () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO rag_chunks_fts (text, chunk_id, organization_id, project_id)
       VALUES (?, ?, ?, ?)`,
    ).run('Error ERR_QUOTA_7734 was returned', 'chk_1', 'acme', 'web');

    const backup = createBackup(db);
    db.prepare('DELETE FROM rag_chunks_fts').run();
    restoreBackup(db, backup.id);

    const hit = getDb()
      .prepare('SELECT count(*) AS n FROM rag_chunks_fts WHERE rag_chunks_fts MATCH ?')
      .get('"err_quota_7734"') as { n: number };
    expect(hit.n).toBe(1);
  });
});
