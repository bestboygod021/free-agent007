import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  parseCsv,
  normaliseColumnName,
  inferColumnType,
  coerceValue,
  CsvError,
  type ColumnType,
} from './tabular-csv.js';

/**
 * Ask questions of a spreadsheet in SQL, without letting SQL out of the room.
 *
 * A CSV is loaded into a private in-memory SQLite database and queried there.
 * The gateway's own `freeapi.db` is never opened by this code: a separate
 * connection means a query cannot reach `api_keys` even if every other guard
 * here failed, which is the only isolation argument that does not depend on
 * getting the details right.
 *
 * ## What actually stops a write
 *
 * Not a regex over the SQL. Three layers, in decreasing order of how much I
 * trust them:
 *
 * 1. **`PRAGMA query_only`** — SQLite refuses writes in the engine. This does
 *    not care how the statement was spelled, so obfuscation buys nothing.
 * 2. **`statement.readonly`** — SQLite's own parse of the prepared statement,
 *    consulted *before* execution so the caller gets a clear refusal rather
 *    than a driver error.
 * 3. **An explicit `ATTACH`/`DETACH` refusal** — see below. This one is a
 *    keyword check, and it is here because the first two do not cover it.
 *
 * ## The hole worth knowing about
 *
 * `ATTACH DATABASE '/path/to/anything.db' AS x` reports `readonly === true`
 * and is permitted under `query_only`. Verified, not assumed: attaching a
 * file and selecting from it returned its contents. It is a file-read
 * primitive wearing a SELECT's clothes, so it is refused by name before
 * anything is prepared. `load_extension` reports readonly too, but
 * better-sqlite3 leaves extension loading unauthorised by default, so it
 * fails at runtime regardless.
 *
 * Stacked statements need no guard: `prepare()` rejects a string containing
 * more than one statement, which removes the `'; DROP TABLE --` shape
 * entirely. Comments cannot smuggle a second statement past it either.
 */

const runtimeRequire = createRequire(import.meta.url);

/** Hard ceilings. A spreadsheet question should not be able to exhaust the box. */
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_ROWS = 200_000;
const MAX_RESULT_ROWS = 1000;
const MAX_SQL_CHARS = 8000;
/** Batch size for the load transaction; large enough to be fast, small enough to bound memory. */
const INSERT_BATCH = 1000;

export class TabularError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'TabularError';
  }
}

export interface LoadedTable {
  table: string;
  columns: { name: string; type: ColumnType; original: string }[];
  rowCount: number;
  truncated: boolean;
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
}

interface SqliteHandle {
  prepare(sql: string): {
    readonly: boolean;
    iterate(...params: unknown[]): IterableIterator<unknown>;
    run(...params: unknown[]): unknown;
    columns(): { name: string }[];
  };
  exec(sql: string): void;
  pragma(source: string): unknown;
  transaction<F extends (...args: never[]) => unknown>(fn: F): F;
  close(): void;
}

/**
 * Statements refused before SQLite ever sees them.
 *
 * Only for cases the engine's own read-only enforcement does not cover, and
 * kept deliberately short — a long keyword blacklist is a sign that something
 * is being defended in the wrong layer.
 */
const REFUSED_LEADING_KEYWORDS = /^\s*(attach|detach)\b/i;

/** Open a private, write-disabled, in-memory database. */
function openSandbox(): SqliteHandle {
  const Database = runtimeRequire('better-sqlite3') as new (path: string) => SqliteHandle;
  const db = new Database(':memory:');
  // Bound the damage a pathological query can do to the host process.
  db.pragma('hard_heap_limit = 268435456');
  db.pragma('trusted_schema = 0');
  return db;
}

/** Turn a CSV file into a queryable table inside a fresh sandbox. */
export async function loadCsvFile(
  filePath: string,
  options: { table?: string; delimiter?: string } = {},
): Promise<{ db: SqliteHandle; info: LoadedTable }> {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat) throw new TabularError(`no such file: ${path.basename(filePath)}`, 404);
  if (stat.isDirectory()) throw new TabularError('path is a directory, not a CSV file.');
  if (stat.size > MAX_FILE_BYTES) {
    throw new TabularError(
      `file is ${(stat.size / 1048576).toFixed(1)}MB; the limit is ${MAX_FILE_BYTES / 1048576}MB.`,
    );
  }

  const text = await fs.readFile(filePath, 'utf8');
  return loadCsvText(text, options);
}

export function loadCsvText(
  text: string,
  options: { table?: string; delimiter?: string } = {},
): { db: SqliteHandle; info: LoadedTable } {
  const table = options.table ?? 'data';
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(table)) {
    throw new TabularError('table name must be lowercase letters, digits and underscores.');
  }

  let parsed;
  try {
    parsed = parseCsv(text, { delimiter: options.delimiter ?? ',', maxRows: MAX_ROWS });
  } catch (err) {
    throw new TabularError(err instanceof CsvError ? err.message : 'could not parse the CSV.');
  }

  const taken = new Set<string>();
  const columns = parsed.headers.map((header, index) => ({
    name: normaliseColumnName(header, index, taken),
    original: header,
    // Sampling the first 500 rows rather than all of them: type inference is a
    // convenience, and a full pass over a large file to decide it is not worth
    // the time. A wrong guess degrades to TEXT-like behaviour, not to bad data.
    type: inferColumnType(parsed.rows.slice(0, 500).map((r) => r[index] ?? '')),
  }));

  if (columns.length === 0) throw new TabularError('the CSV has no columns.');

  const db = openSandbox();
  try {
    // Identifiers are generated by normaliseColumnName, never taken from the
    // file verbatim, so this string is built from a known-safe alphabet.
    const columnSql = columns.map((c) => `"${c.name}" ${c.type}`).join(', ');
    db.exec(`CREATE TABLE "${table}" (${columnSql})`);

    const placeholders = columns.map(() => '?').join(', ');
    const insert = db.prepare(`INSERT INTO "${table}" VALUES (${placeholders})`);

    const insertBatch = db.transaction((batch: string[][]) => {
      for (const row of batch) {
        insert.run(
          ...columns.map((col, i) => coerceValue(row[i] ?? '', col.type)),
        );
      }
    }) as (batch: string[][]) => void;

    for (let i = 0; i < parsed.rows.length; i += INSERT_BATCH) {
      insertBatch(parsed.rows.slice(i, i + INSERT_BATCH));
    }

    // Only after loading: the table had to be written before writes are
    // disabled, and everything the caller can run happens after this line.
    db.pragma('query_only = 1');

    return {
      db,
      info: { table, columns, rowCount: parsed.rows.length, truncated: parsed.truncated },
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Run one read-only statement against a loaded sandbox.
 *
 * Results are pulled with `iterate` and stopped at the cap, so a query that
 * would match a million rows never materialises a million rows in memory.
 */
export function runReadOnlyQuery(
  db: SqliteHandle,
  sql: string,
  limit = MAX_RESULT_ROWS,
): QueryResult {
  if (typeof sql !== 'string' || sql.trim() === '') {
    throw new TabularError('sql must be a non-empty string.');
  }
  if (sql.length > MAX_SQL_CHARS) {
    throw new TabularError(`sql exceeds ${MAX_SQL_CHARS} characters.`);
  }
  if (REFUSED_LEADING_KEYWORDS.test(sql)) {
    throw new TabularError(
      'ATTACH and DETACH are not allowed: they read database files outside this dataset.',
    );
  }

  let statement;
  try {
    statement = db.prepare(sql);
  } catch (err) {
    // Includes the multi-statement rejection, which is a useful message.
    throw new TabularError(`invalid SQL: ${err instanceof Error ? err.message : 'parse failed'}`);
  }

  // Checked before running so the refusal is explicit rather than a driver
  // error, even though `query_only` would also stop it.
  if (!statement.readonly) {
    throw new TabularError('only read-only statements are allowed; this one writes.');
  }

  const cap = Math.max(1, Math.min(limit, MAX_RESULT_ROWS));
  const rows: unknown[][] = [];
  let truncated = false;
  let columns: string[] = [];

  try {
    columns = statement.columns().map((c) => c.name);
  } catch {
    // Some statements (e.g. a bare PRAGMA) expose no column metadata.
    columns = [];
  }

  for (const row of statement.iterate()) {
    if (rows.length >= cap) {
      truncated = true;
      break;
    }
    const record = row as Record<string, unknown>;
    if (columns.length === 0) columns = Object.keys(record);
    rows.push(columns.map((c) => record[c]));
  }

  return { columns, rows, rowCount: rows.length, truncated };
}

/** Load, query and dispose in one call. The sandbox never outlives the question. */
export async function queryCsvFile(
  filePath: string,
  sql: string,
  options: { table?: string; delimiter?: string; limit?: number } = {},
): Promise<{ info: LoadedTable; result: QueryResult }> {
  const { db, info } = await loadCsvFile(filePath, options);
  try {
    return { info, result: runReadOnlyQuery(db, sql, options.limit ?? MAX_RESULT_ROWS) };
  } finally {
    db.close();
  }
}

/** Load a file and describe it, without running a query. */
export async function describeCsvFile(
  filePath: string,
  options: { table?: string; delimiter?: string; sampleRows?: number } = {},
): Promise<{ info: LoadedTable; sample: QueryResult }> {
  const { db, info } = await loadCsvFile(filePath, options);
  try {
    const sample = runReadOnlyQuery(
      db,
      `SELECT * FROM "${info.table}"`,
      Math.max(1, Math.min(options.sampleRows ?? 5, 50)),
    );
    return { info, sample };
  } finally {
    db.close();
  }
}
