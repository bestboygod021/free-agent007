import { describe, it, expect } from 'vitest';
import {
  parseCsv,
  normaliseColumnName,
  inferColumnType,
  coerceValue,
  CsvError,
} from '../../services/tabular-csv.js';

/**
 * CSV looks trivial and is not. Everything here is a case that a
 * `split(',')` implementation gets wrong.
 */

describe('CSV parsing', () => {
  it('reads a plain file', () => {
    const t = parseCsv('name,age\nada,36\ngrace,45\n');
    expect(t.headers).toEqual(['name', 'age']);
    expect(t.rows).toEqual([
      ['ada', '36'],
      ['grace', '45'],
    ]);
  });

  it('keeps a comma inside a quoted field', () => {
    const t = parseCsv('name,address\n"Lovelace, Ada","12 High St, London"\n');
    expect(t.rows[0]).toEqual(['Lovelace, Ada', '12 High St, London']);
  });

  it('keeps a newline inside a quoted field', () => {
    const t = parseCsv('name,note\n"Ada","line one\nline two"\n');
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]![1]).toBe('line one\nline two');
  });

  it('unescapes a doubled quote', () => {
    const t = parseCsv('quote\n"she said ""hello"""\n');
    expect(t.rows[0]![0]).toBe('she said "hello"');
  });

  it('handles CRLF line endings', () => {
    const t = parseCsv('a,b\r\n1,2\r\n');
    expect(t.headers).toEqual(['a', 'b']);
    expect(t.rows).toEqual([['1', '2']]);
  });

  it('strips a byte order mark from the first header', () => {
    const t = parseCsv('\uFEFFname,age\nada,36\n');
    // Without this the first column is named "\uFEFFname" and never matches.
    expect(t.headers[0]).toBe('name');
  });

  it('does not invent a row from a trailing newline', () => {
    expect(parseCsv('a\n1\n').rows).toEqual([['1']]);
    expect(parseCsv('a\n1').rows).toEqual([['1']]);
  });

  it('keeps empty fields rather than dropping them', () => {
    const t = parseCsv('a,b,c\n1,,3\n');
    expect(t.rows[0]).toEqual(['1', '', '3']);
  });

  it('supports another delimiter', () => {
    const t = parseCsv('a;b\n1;2\n', { delimiter: ';' });
    expect(t.rows[0]).toEqual(['1', '2']);
  });

  it('refuses an unterminated quoted field instead of guessing', () => {
    expect(() => parseCsv('a\n"never closed\n')).toThrow(CsvError);
  });

  it('refuses an empty file', () => {
    expect(() => parseCsv('')).toThrow(CsvError);
  });

  it('reports truncation at the row limit', () => {
    const csv = `a\n${Array.from({ length: 10 }, (_, i) => i).join('\n')}\n`;
    const t = parseCsv(csv, { maxRows: 4 });
    expect(t.truncated).toBe(true);
    expect(t.rows).toHaveLength(4);
  });
});

describe('column naming', () => {
  it('makes a header safe to use as an identifier', () => {
    const taken = new Set<string>();
    expect(normaliseColumnName('Total Amount ($)', 0, taken)).toBe('total_amount');
    expect(normaliseColumnName('  Order-ID  ', 1, taken)).toBe('order_id');
  });

  it('disambiguates duplicate headers instead of losing one', () => {
    const taken = new Set<string>();
    expect(normaliseColumnName('name', 0, taken)).toBe('name');
    expect(normaliseColumnName('Name', 1, taken)).toBe('name_2');
    expect(normaliseColumnName('NAME', 2, taken)).toBe('name_3');
  });

  it('gives an empty or numeric header a usable name', () => {
    const taken = new Set<string>();
    expect(normaliseColumnName('', 0, taken)).toBe('col_1');
    expect(normaliseColumnName('2024', 1, taken)).toBe('col_2024');
  });

  it('cannot produce a name that would need quoting', () => {
    const taken = new Set<string>();
    for (const evil of ['a"; DROP TABLE x --', "'; DELETE --", 'a b', '../etc']) {
      expect(normaliseColumnName(evil, 0, taken)).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});

describe('type inference', () => {
  it('detects integers, reals and text', () => {
    expect(inferColumnType(['1', '2', '-3'])).toBe('INTEGER');
    expect(inferColumnType(['1.5', '2', '3e4'])).toBe('REAL');
    expect(inferColumnType(['a', 'b'])).toBe('TEXT');
  });

  it('ignores blanks when deciding', () => {
    expect(inferColumnType(['1', '', '2'])).toBe('INTEGER');
  });

  it('falls back to TEXT for one bad value rather than losing it', () => {
    // The important case: a single "N/A" must not make the column numeric,
    // because the value would then be dropped and a total would be wrong.
    expect(inferColumnType(['1', '2', 'N/A'])).toBe('TEXT');
  });

  it('does not treat Infinity or NaN as numbers', () => {
    expect(inferColumnType(['Infinity', '1'])).toBe('TEXT');
    expect(inferColumnType(['NaN'])).toBe('TEXT');
  });

  it('treats an all-blank column as text', () => {
    expect(inferColumnType(['', '  '])).toBe('TEXT');
  });
});

describe('value coercion', () => {
  it('turns a blank into NULL, not zero', () => {
    // Zero would silently change an average.
    expect(coerceValue('', 'INTEGER')).toBeNull();
    expect(coerceValue('  ', 'REAL')).toBeNull();
  });

  it('converts according to the column type', () => {
    expect(coerceValue('42', 'INTEGER')).toBe(42);
    expect(coerceValue('1.5', 'REAL')).toBe(1.5);
    expect(coerceValue(' padded ', 'TEXT')).toBe(' padded ');
  });

  it('keeps an oversized integer as text rather than rounding it', () => {
    const huge = '99999999999999999999';
    expect(coerceValue(huge, 'INTEGER')).toBe(huge);
  });
});
