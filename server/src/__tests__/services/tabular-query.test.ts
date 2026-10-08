import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import {
  loadCsvText,
  runReadOnlyQuery,
  queryCsvFile,
  describeCsvFile,
  TabularError,
} from '../../services/tabular-query.js';

const runtimeRequire = createRequire(import.meta.url);

const SALES = [
  'Region,Product,Units,Revenue',
  'north,widget,10,199.50',
  'south,widget,5,99.75',
  'north,gadget,2,50.00',
  'south,gadget,,0',
].join('\n');

describe('tabular query: answering questions', () => {
  it('aggregates correctly, which is the whole point', () => {
    const { db } = loadCsvText(SALES);
    try {
      const r = runReadOnlyQuery(
        db,
        'SELECT region, SUM(units) AS units FROM data GROUP BY region ORDER BY region',
      );
      expect(r.columns).toEqual(['region', 'units']);
      expect(r.rows).toEqual([
        ['north', 12],
        ['south', 5],
      ]);
    } finally {
      db.close();
    }
  });

  it('infers numeric columns so arithmetic works', () => {
    const { db, info } = loadCsvText(SALES);
    try {
      expect(info.columns.map((c) => [c.name, c.type])).toEqual([
        ['region', 'TEXT'],
        ['product', 'TEXT'],
        ['units', 'INTEGER'],
        ['revenue', 'REAL'],
      ]);
      const r = runReadOnlyQuery(db, 'SELECT ROUND(SUM(revenue), 2) AS total FROM data');
      expect(r.rows[0]![0]).toBe(349.25);
    } finally {
      db.close();
    }
  });

  it('treats a blank numeric cell as NULL, not zero', () => {
    const { db } = loadCsvText(SALES);
    try {
      // 4 rows, one blank: AVG over 3 values, not 4.
      const r = runReadOnlyQuery(db, 'SELECT COUNT(units) AS n, COUNT(*) AS total FROM data');
      expect(r.rows[0]).toEqual([3, 4]);
    } finally {
      db.close();
    }
  });

  it('exposes the original header alongside the usable name', () => {
    const { db, info } = loadCsvText('Total Amount,Order-ID\n5,a\n');
    try {
      expect(info.columns.map((c) => [c.original, c.name])).toEqual([
        ['Total Amount', 'total_amount'],
        ['Order-ID', 'order_id'],
      ]);
    } finally {
      db.close();
    }
  });

  it('caps the rows it returns and says so', () => {
    const rows = Array.from({ length: 50 }, (_, i) => `r${i},${i}`).join('\n');
    const { db } = loadCsvText(`name,n\n${rows}\n`);
    try {
      const r = runReadOnlyQuery(db, 'SELECT * FROM data', 10);
      expect(r.rowCount).toBe(10);
      expect(r.truncated).toBe(true);
    } finally {
      db.close();
    }
  });
});

describe('tabular query: what it refuses', () => {
  let db: ReturnType<typeof loadCsvText>['db'];

  beforeEach(() => {
    db = loadCsvText(SALES).db;
  });
  afterEach(() => db.close());

  it('refuses every writing statement', () => {
    for (const sql of [
      'DELETE FROM data',
      "UPDATE data SET region = 'x'",
      'DROP TABLE data',
      'CREATE TABLE evil (a)',
      "INSERT INTO data VALUES ('a','b',1,1.0)",
      'ALTER TABLE data RENAME TO other',
    ]) {
      expect(() => runReadOnlyQuery(db, sql), sql).toThrow(TabularError);
    }
  });

  it('refuses ATTACH, which SQLite itself reports as read-only', () => {
    // The hole this guard exists for. `statement.readonly` is true for ATTACH
    // and `query_only` permits it, so without an explicit refusal this is a
    // read primitive for any file on disk.
    expect(() => runReadOnlyQuery(db, "ATTACH DATABASE '/etc/passwd' AS x")).toThrow(
      /ATTACH and DETACH are not allowed/,
    );
    expect(() => runReadOnlyQuery(db, "  attach database '/tmp/a.db' as x")).toThrow(TabularError);
    expect(() => runReadOnlyQuery(db, 'DETACH DATABASE main')).toThrow(TabularError);
  });

  it('cannot reach a real database file even if ATTACH were attempted', async () => {
    // Proves the isolation claim rather than asserting it: a separate file is
    // created, and the sandbox has no route to its contents.
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tab-iso-'));
    const secretPath = path.join(dir, 'secret.db');
    const Database = runtimeRequire('better-sqlite3') as new (p: string) => {
      exec(s: string): void;
      close(): void;
    };
    const secret = new Database(secretPath);
    secret.exec("CREATE TABLE creds (k TEXT); INSERT INTO creds VALUES ('TOP_SECRET')");
    secret.close();

    expect(() => runReadOnlyQuery(db, `ATTACH DATABASE '${secretPath}' AS leak`)).toThrow(
      TabularError,
    );
    // And the name is not reachable without the attach.
    expect(() => runReadOnlyQuery(db, 'SELECT * FROM leak.creds')).toThrow(TabularError);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it('refuses a second statement smuggled after a semicolon', () => {
    // better-sqlite3's prepare() rejects multi-statement strings outright,
    // which removes the classic injection shape.
    expect(() => runReadOnlyQuery(db, 'SELECT 1; DROP TABLE data')).toThrow(/invalid SQL/);
  });

  it('is not fooled by a comment before a write', () => {
    expect(() => runReadOnlyQuery(db, '/* harmless */ DELETE FROM data')).toThrow(TabularError);
    expect(() => runReadOnlyQuery(db, '-- note\nDELETE FROM data')).toThrow(TabularError);
  });

  it('still refuses a write with the readonly check bypassed', () => {
    // Defence in depth, verified rather than asserted. The `statement.readonly`
    // check exists to give a clear message; `PRAGMA query_only` is what makes
    // the refusal true. Driving the statement straight at the connection skips
    // the first layer and must still fail — otherwise the two "layers" are one.
    const raw = db as unknown as { prepare(sql: string): { run(): unknown } };
    expect(() => raw.prepare('DELETE FROM data').run()).toThrow(/readonly database/);
    expect(() => raw.prepare('CREATE TABLE evil (a)').run()).toThrow(/readonly database/);
  });

  it('leaves the data intact after a refused write', () => {
    expect(() => runReadOnlyQuery(db, 'DELETE FROM data')).toThrow();
    const r = runReadOnlyQuery(db, 'SELECT COUNT(*) AS n FROM data');
    expect(r.rows[0]![0]).toBe(4);
  });

  it('refuses an empty or oversized query', () => {
    expect(() => runReadOnlyQuery(db, '   ')).toThrow(TabularError);
    expect(() => runReadOnlyQuery(db, `SELECT '${'x'.repeat(9000)}'`)).toThrow(/exceeds/);
  });

  it('reports a syntax error as a refusal rather than crashing', () => {
    expect(() => runReadOnlyQuery(db, 'SELECT FROM WHERE')).toThrow(/invalid SQL/);
  });
});

describe('tabular query: files', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tab-')));
    await fs.writeFile(path.join(dir, 'sales.csv'), SALES, 'utf8');
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('queries a file end to end', async () => {
    const { result } = await queryCsvFile(
      path.join(dir, 'sales.csv'),
      "SELECT SUM(units) AS n FROM data WHERE region = 'north'",
    );
    expect(result.rows[0]![0]).toBe(12);
  });

  it('describes a file without being asked a query', async () => {
    const { info, sample } = await describeCsvFile(path.join(dir, 'sales.csv'), { sampleRows: 2 });
    expect(info.rowCount).toBe(4);
    expect(info.columns.map((c) => c.name)).toEqual(['region', 'product', 'units', 'revenue']);
    expect(sample.rows).toHaveLength(2);
  });

  it('reports a missing file clearly', async () => {
    await expect(queryCsvFile(path.join(dir, 'nope.csv'), 'SELECT 1')).rejects.toThrow(
      /no such file/,
    );
  });

  it('rejects a table name that is not a safe identifier', () => {
    expect(() => loadCsvText(SALES, { table: 'data"; DROP TABLE x --' })).toThrow(TabularError);
  });
});
