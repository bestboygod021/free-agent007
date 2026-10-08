/**
 * A CSV reader, written here rather than installed.
 *
 * There is no CSV library in the lockfile, and adding one to parse a format
 * whose whole grammar is "commas, quotes, doubled quotes to escape" is a poor
 * trade: a dependency is a supply-chain surface and a permanent upgrade
 * obligation. RFC 4180 is small enough to implement correctly and test
 * thoroughly, which is what the tests next door do.
 *
 * What it handles: quoted fields, embedded commas, embedded newlines, doubled
 * quotes, CRLF, a configurable delimiter, and a BOM. What it does not: the
 * various dialects that allow backslash escapes, and files that are not UTF-8
 * by the time they reach here.
 */

export interface ParsedTable {
  headers: string[];
  rows: string[][];
  /** True when a row limit stopped parsing before the end of the input. */
  truncated: boolean;
}

export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvError';
  }
}

const MAX_COLUMNS = 512;

/**
 * Split CSV text into fields.
 *
 * A single pass over characters with an `inQuotes` flag. Splitting on `\n`
 * first and repairing afterwards is the usual shortcut and it is wrong: a
 * quoted field may legally contain a newline, and every bug report about a
 * CSV reader mangling an address field traces back to that shortcut.
 */
export function parseCsv(
  input: string,
  options: { delimiter?: string; maxRows?: number } = {},
): ParsedTable {
  const delimiter = options.delimiter ?? ',';
  if (delimiter.length !== 1) {
    throw new CsvError('delimiter must be a single character.');
  }
  const maxRows = options.maxRows ?? Number.MAX_SAFE_INTEGER;

  // A BOM survives most upload paths and, left in place, becomes part of the
  // first header name — so the first column silently fails to match by name.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let truncated = false;
  let sawAnyChar = false;

  const endField = (): void => {
    row.push(field);
    field = '';
    if (row.length > MAX_COLUMNS) {
      throw new CsvError(`row has more than ${MAX_COLUMNS} columns.`);
    }
  };

  const endRow = (): boolean => {
    endField();
    // A trailing newline at end of file must not produce a phantom empty row.
    const isBlank = row.length === 1 && row[0] === '';
    if (!isBlank) rows.push(row);
    row = [];
    if (rows.length >= maxRows + 1) {
      truncated = true;
      return false;
    }
    return true;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    sawAnyChar = true;

    if (inQuotes) {
      if (ch === '"') {
        // A doubled quote inside a quoted field is a literal quote.
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field === '') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      endField();
      continue;
    }
    if (ch === '\r') {
      // CRLF: consume the pair as one terminator.
      if (text[i + 1] === '\n') i++;
      if (!endRow()) break;
      continue;
    }
    if (ch === '\n') {
      if (!endRow()) break;
      continue;
    }
    field += ch;
  }

  if (inQuotes) {
    throw new CsvError('unterminated quoted field: the file has an odd number of quotes.');
  }
  // Flush a final row that had no trailing newline.
  if (!truncated && sawAnyChar && (field !== '' || row.length > 0)) endRow();

  if (rows.length === 0) {
    throw new CsvError('no rows found: the file is empty.');
  }

  const headers = rows[0]!;
  return { headers, rows: rows.slice(1), truncated };
}

/**
 * Turn header text into a column name that is safe to use unquoted in SQL.
 *
 * Names are rewritten rather than escaped. A quoted identifier would let the
 * header text of an uploaded file decide part of a query string, and an empty
 * or duplicate name breaks the query in ways that are hard to read. Rewriting
 * is lossy but total: every input produces one usable name.
 */
export function normaliseColumnName(raw: string, index: number, taken: Set<string>): string {
  let name = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (name === '' || /^[0-9]/.test(name)) name = `col_${name === '' ? index + 1 : name}`;

  let candidate = name;
  let suffix = 2;
  while (taken.has(candidate)) candidate = `${name}_${suffix++}`;
  taken.add(candidate);
  return candidate;
}

export type ColumnType = 'INTEGER' | 'REAL' | 'TEXT';

/**
 * Guess a column's type from its values.
 *
 * Conservative on purpose: one unparseable value makes the whole column TEXT,
 * because a column typed INTEGER that silently drops "N/A" is a data-loss bug
 * that surfaces much later as a wrong total. Blanks are ignored — they become
 * NULL and say nothing about the type.
 */
export function inferColumnType(values: readonly string[]): ColumnType {
  let sawValue = false;
  let allInteger = true;
  let allNumeric = true;

  for (const value of values) {
    const v = value.trim();
    if (v === '') continue;
    sawValue = true;
    if (!/^[+-]?\d+$/.test(v)) allInteger = false;
    // Rejects Infinity and NaN, which Number() would otherwise accept.
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(v)) allNumeric = false;
    if (!allInteger && !allNumeric) break;
  }

  if (!sawValue) return 'TEXT';
  if (allInteger) return 'INTEGER';
  if (allNumeric) return 'REAL';
  return 'TEXT';
}

/** Convert a cell to the value bound for its column type. */
export function coerceValue(raw: string, type: ColumnType): string | number | null {
  const v = raw.trim();
  if (v === '') return null;
  if (type === 'INTEGER') {
    const n = Number.parseInt(v, 10);
    return Number.isSafeInteger(n) ? n : v;
  }
  if (type === 'REAL') {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : v;
  }
  return raw;
}
