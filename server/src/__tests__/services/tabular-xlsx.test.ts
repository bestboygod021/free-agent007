import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  loadXlsxBytes,
  runReadOnlyQuery,
  TabularError,
} from '../../services/tabular-query.js';
import {
  extractSheetGrid,
  resolveWorkbookSheets,
  columnIndexFromRef,
  MAX_SHEET_COLUMNS,
} from '../../services/office-text.js';

/**
 * Querying a spreadsheet in SQL.
 *
 * Text extraction can be sloppy about which column a value came from and the
 * result still reads correctly. A table cannot: a value under the wrong
 * column is not a formatting problem, it is a wrong answer delivered with
 * confidence. Most of what follows is about column identity.
 */

const FIXTURES = path.join(import.meta.dirname, '../fixtures/office');
const read = (name: string): Buffer => readFileSync(path.join(FIXTURES, name));

describe('columnIndexFromRef', () => {
  it('maps the spreadsheet alphabet, which is not base 26', () => {
    // 'A' is 0 but 'AA' is 26, not 0: there is no zero digit, so the usual
    // positional formula is off by one per extra letter.
    expect(columnIndexFromRef('A1')).toBe(0);
    expect(columnIndexFromRef('Z1')).toBe(25);
    expect(columnIndexFromRef('AA1')).toBe(26);
    expect(columnIndexFromRef('AZ9')).toBe(51);
    expect(columnIndexFromRef('BA1')).toBe(52);
    expect(columnIndexFromRef('XFD1048576')).toBe(MAX_SHEET_COLUMNS - 1);
  });

  it('returns null rather than a wrong column for a reference it cannot read', () => {
    // Losing one cell beats shifting every cell after it.
    expect(columnIndexFromRef('')).toBeNull();
    expect(columnIndexFromRef('1')).toBeNull();
    expect(columnIndexFromRef('a1')).toBeNull();
    expect(columnIndexFromRef('A')).toBeNull();
    expect(columnIndexFromRef('XFE1')).toBeNull();
  });
});

describe('extractSheetGrid — column identity', () => {
  it('places a value by its reference, not by its position in the row', () => {
    const grid = extractSheetGrid(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c>' +
        '<c r="D1" t="inlineStr"><is><t>d</t></is></c></row>',
      [],
    );
    expect(grid.rows).toEqual([['a', '', '', 'd']]);
  });

  it('pads every row to the widest, so rows line up as a table', () => {
    const grid = extractSheetGrid(
      '<row r="1"><c r="A1"><v>1</v></c><c r="C1"><v>3</v></c></row>' +
        '<row r="2"><c r="A2"><v>9</v></c></row>',
      [],
    );
    expect(grid.rows).toEqual([
      ['1', '', '3'],
      ['9', '', ''],
    ]);
    expect(grid.columns).toBe(3);
  });

  it('falls back to document order only when a cell carries no reference', () => {
    const grid = extractSheetGrid('<row><c><v>1</v></c><c><v>2</v></c></row>', []);
    expect(grid.rows).toEqual([['1', '2']]);
  });

  /**
   * A single reference decides how wide every row is, and a reference comes
   * from the file. Without a ceiling, `<c r="XFD1"/>` in a tall sheet asks
   * for billions of entries.
   */
  it('caps the grid rather than letting a cell reference allocate it', () => {
    const rows = Array.from(
      { length: 400 },
      (_, i) => `<row r="${i + 1}"><c r="XFD${i + 1}"><v>1</v></c></row>`,
    ).join('');
    const grid = extractSheetGrid(rows, []);

    expect(grid.columns).toBe(MAX_SHEET_COLUMNS);
    expect(grid.truncated).toBe(true);
    expect(grid.rows.length).toBeLessThan(400);
    expect(grid.rows.length * grid.columns).toBeLessThanOrEqual(2_000_000);
  });

  it('does not recreate absent rows, which carry nothing', () => {
    const grid = extractSheetGrid(
      '<row r="1"><c r="A1"><v>1</v></c></row><row r="9"><c r="A9"><v>9</v></c></row>',
      [],
    );
    expect(grid.rows).toEqual([['1'], ['9']]);
  });
});

describe('resolveWorkbookSheets', () => {
  it('follows r:id into the relationships part', () => {
    const refs = resolveWorkbookSheets(
      '<sheets><sheet name="First" r:id="rId1"/><sheet name="Third" r:id="rId2"/></sheets>',
      '<Relationships><Relationship Id="rId1" Target="/xl/worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Target="/xl/worksheets/sheet3.xml"/></Relationships>',
    );
    expect(refs.map((r) => r.path)).toEqual([
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet3.xml',
    ]);
  });

  it('resolves a target relative to the workbook part', () => {
    const refs = resolveWorkbookSheets(
      '<sheet name="S" r:id="rId1"/>',
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    );
    expect(refs[0]!.path).toBe('xl/worksheets/sheet1.xml');
  });

  it('resolves .. without walking out of the archive namespace', () => {
    const refs = resolveWorkbookSheets(
      '<sheet name="S" r:id="rId1"/>',
      '<Relationships><Relationship Id="rId1" Target="../xl/worksheets/sheet1.xml"/></Relationships>',
    );
    expect(refs[0]!.path).toBe('xl/worksheets/sheet1.xml');
  });

  it('guesses by position only when there is no relationships part', () => {
    const refs = resolveWorkbookSheets('<sheet name="A"/><sheet name="B"/>', null);
    expect(refs.map((r) => r.path)).toEqual([
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ]);
  });

  it('does not mistake the <sheets> container for a sheet', () => {
    const refs = resolveWorkbookSheets('<sheets><sheet name="Only" r:id="rId1"/></sheets>', null);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.name).toBe('Only');
  });
});

describe('loadXlsxBytes — the sheet a real reader would open', () => {
  /**
   * The regression this fixture exists for. Deleting a middle tab leaves
   * `sheet1.xml` and `sheet3.xml`; guessing `sheet{n+1}.xml` reads nothing
   * for the second tab while still reporting its name, so the caller is told
   * a sheet was read that was not.
   */
  it('reads a tab whose part is not numbered by position', () => {
    const { db, info, sheet, sheets } = loadXlsxBytes(read('renumbered-sheets.xlsx'), {
      sheet: 'Third',
      headerRow: 1,
    });
    try {
      expect(sheets).toEqual(['First', 'Third']);
      expect(sheet).toBe('Third');
      expect(info.columns.map((c) => c.original)).toEqual(['third-sheet']);
    } finally {
      db.close();
    }
  });

  it('aggregates over a sheet with gaps, with values under the right columns', () => {
    const { db, info, sheet } = loadXlsxBytes(read('sparse-columns.xlsx'));
    try {
      expect(sheet).toBe('Sparse');
      expect(info.columns.map((c) => c.name)).toEqual(['region', 'q1', 'q2', 'owner']);
      expect(info.rowCount).toBe(3);

      // q2 holds 7 and 9. Reading cells in document order would put the 7 in
      // q1 and this sum would be 9.
      const summed = runReadOnlyQuery(db, 'SELECT SUM(q2) AS total FROM data');
      expect(summed.rows[0]![0]).toBe(16);

      // The emea row has no q1 value at all, and an absent number must not
      // become a zero that changes an average.
      const emea = runReadOnlyQuery(db, "SELECT q1, q2, owner FROM data WHERE region = 'emea'");
      expect(emea.rows[0]).toEqual([null, 7, 'ops']);

      // The last row has no region and no q2, and its 1 belongs to q1 — not
      // to region, which is where document order would have put it.
      const orphan = runReadOnlyQuery(db, "SELECT region, q1, q2 FROM data WHERE owner = 'net'");
      expect(orphan.rows).toHaveLength(1);
      expect(orphan.rows[0]).toEqual([null, 1, null]);
    } finally {
      db.close();
    }
  });

  it('resolves shared strings and formula caches from a real workbook', () => {
    const { db, info } = loadXlsxBytes(read('excel-workbook.xlsx'));
    try {
      expect(info.rowCount).toBeGreaterThan(0);
      const found = runReadOnlyQuery(db, 'SELECT * FROM data');
      expect(JSON.stringify(found.rows)).toContain('ERR_QUOTA_7734');
    } finally {
      db.close();
    }
  });

  it('selects a sheet by 1-based tab index', () => {
    const { db, sheet } = loadXlsxBytes(read('excel-workbook.xlsx'), { sheet: 2 });
    db.close();
    expect(sheet).toBe('Notes');
  });

  it('names the available sheets when asked for one that is not there', () => {
    expect(() => loadXlsxBytes(read('excel-workbook.xlsx'), { sheet: 'Ledger' })).toThrow(
      /no sheet named "Ledger".*Errors, Notes/s,
    );
  });

  it('refuses a tab index outside the workbook', () => {
    expect(() => loadXlsxBytes(read('excel-workbook.xlsx'), { sheet: 99 })).toThrow(
      /out of range; the workbook has 2/,
    );
  });

  it('takes the header from a later row when asked', () => {
    const { db, info } = loadXlsxBytes(read('sparse-columns.xlsx'), { headerRow: 2 });
    try {
      expect(info.columns.map((c) => c.original)).toEqual(['emea', '', '7', 'ops']);
      expect(info.rowCount).toBe(2);
    } finally {
      db.close();
    }
  });

  it('refuses a header row past the end instead of loading an empty table', () => {
    expect(() => loadXlsxBytes(read('sparse-columns.xlsx'), { headerRow: 99 })).toThrow(
      /headerRow 99 is past the end/,
    );
  });

  it('rejects a .docx sent to the spreadsheet loader', () => {
    expect(() => loadXlsxBytes(read('word-document.docx'))).toThrow(/not an \.xlsx/);
  });

  it('rejects bytes that are not an archive at all', () => {
    expect(() => loadXlsxBytes(Buffer.from('%PDF-1.7'))).toThrow(TabularError);
  });
});

describe('loadXlsxBytes — the sandbox still holds', () => {
  it('disables writes once the sheet is loaded', () => {
    const { db } = loadXlsxBytes(read('excel-workbook.xlsx'));
    try {
      expect(() => runReadOnlyQuery(db, 'DELETE FROM data')).toThrow(/read-only/);
      expect(() => runReadOnlyQuery(db, 'CREATE TABLE t (a)')).toThrow(/read-only/);
    } finally {
      db.close();
    }
  });

  /**
   * The hole `tabular-query.ts` documents: ATTACH reports readonly and is
   * permitted under query_only, so it is refused by name. A second loader
   * that reached the same sandbox by a different door had to inherit that,
   * and inheriting it is not automatic — it is only true because both go
   * through `runReadOnlyQuery`.
   */
  it('still refuses ATTACH, which SQLite considers a read', () => {
    const { db } = loadXlsxBytes(read('excel-workbook.xlsx'));
    try {
      expect(() => runReadOnlyQuery(db, "ATTACH DATABASE 'freeapi.db' AS x")).toThrow(
        /ATTACH and DETACH are not allowed/,
      );
    } finally {
      db.close();
    }
  });

  it('cannot see the gateway tables from inside the spreadsheet sandbox', () => {
    const { db } = loadXlsxBytes(read('excel-workbook.xlsx'));
    try {
      const tables = runReadOnlyQuery(db, "SELECT name FROM sqlite_master WHERE type = 'table'");
      expect(tables.rows.flat()).toEqual(['data']);
    } finally {
      db.close();
    }
  });
});
