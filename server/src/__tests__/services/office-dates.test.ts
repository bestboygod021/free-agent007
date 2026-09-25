import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  excelSerialToIso,
  dateFormatKind,
  dateStyleKind,
  parseNumberFormats,
  extractMergedRanges,
  extractSheetGrid,
  readOfficeDocument,
} from '../../services/office-text.js';
import { loadXlsxBytes, runReadOnlyQuery } from '../../services/tabular-query.js';

/**
 * Dates and merged cells.
 *
 * A date in a spreadsheet is a number, and the only thing that makes it a
 * date lives in `styles.xml`. Before this, an incident log's `opened` column
 * arrived as five-digit integers: no error, no warning, just arithmetic over
 * serial numbers.
 *
 * Every expected value here was taken from `openpyxl` reading the same file,
 * not from working the arithmetic out by hand. The 1900 leap-year rule is
 * exactly the kind of thing that is easy to reconstruct wrongly and then
 * enshrine in a test that agrees with the bug.
 */

const FIXTURES = path.join(import.meta.dirname, '../fixtures/office');
const read = (name: string): Buffer => readFileSync(path.join(FIXTURES, name));

describe('excelSerialToIso', () => {
  /**
   * Excel believes 1900 was a leap year. Serial 60 is its 29 February 1900, a
   * day that did not happen, so serials above it are one ahead of an honest
   * count and the two sides of the gap need different epochs.
   *
   * Using one epoch for everything is the common mistake, and it is not a
   * small one: pick the low epoch and every date after February 1900 — which
   * is every date anyone has — is a day late.
   */
  it('matches a real reader on both sides of the phantom leap day', () => {
    expect(excelSerialToIso(1, 'date')).toBe('1900-01-01');
    expect(excelSerialToIso(2, 'date')).toBe('1900-01-02');
    expect(excelSerialToIso(59, 'date')).toBe('1900-02-28');
    expect(excelSerialToIso(61, 'date')).toBe('1900-03-01');
    expect(excelSerialToIso(100, 'date')).toBe('1900-04-09');
    expect(excelSerialToIso(45292, 'date')).toBe('2024-01-01');
    expect(excelSerialToIso(46095, 'date')).toBe('2026-03-14');
  });

  /**
   * Serial 60 is reported as the date Excel shows rather than clamped onto
   * the 28th. Clamping would make serials 59 and 60 the same value, and two
   * different cells silently becoming one is worse than a date that is
   * visibly impossible.
   */
  it('reports the phantom day rather than merging it into the 28th', () => {
    expect(excelSerialToIso(60, 'date')).toBe('1900-02-29');
    expect(excelSerialToIso(59, 'date')).not.toBe(excelSerialToIso(60, 'date'));
  });

  it('reads the 1904 calendar when the workbook uses it', () => {
    // A Mac-saved workbook read as 1900 is four years early, and nothing
    // about the number itself says which calendar it belongs to.
    expect(excelSerialToIso(1, 'date', true)).toBe('1904-01-02');
    expect(excelSerialToIso(61, 'date', true)).toBe('1904-03-02');
    expect(excelSerialToIso(44562, 'date', true)).toBe('2026-01-02');
    // No phantom day in this calendar.
    expect(excelSerialToIso(60, 'date', true)).toBe('1904-03-01');
  });

  it('rounds the time rather than truncating it', () => {
    // 09:30 is stored as 0.39583333333..., and truncating gives 09:29:59.
    expect(excelSerialToIso(46095.39583333334, 'datetime')).toBe('2026-03-14T09:30:00');
    expect(excelSerialToIso(45292.99998842592, 'datetime')).toBe('2024-01-01T23:59:59');
  });

  it('carries a rounded-up midnight into the next day', () => {
    // 0.9999999 of a day rounds to 86,400 seconds, which is not a time.
    expect(excelSerialToIso(45292.9999999, 'datetime')).toBe('2024-01-02T00:00:00');
  });

  it('lets the format decide whether a time is shown, not the value', () => {
    // A datetime column whose midnight rows render as bare dates compares
    // differently from its other rows.
    expect(excelSerialToIso(46387, 'datetime')).toBe('2026-12-31T00:00:00');
    expect(excelSerialToIso(46387, 'date')).toBe('2026-12-31');
    expect(excelSerialToIso(46095.39583333334, 'time')).toBe('09:30:00');
  });

  it('returns null for a value that is not a serial', () => {
    expect(excelSerialToIso(Number.NaN, 'date')).toBeNull();
    expect(excelSerialToIso(-1, 'date')).toBeNull();
    expect(excelSerialToIso(Number.POSITIVE_INFINITY, 'date')).toBeNull();
  });
});

describe('dateFormatKind', () => {
  it('recognises the shapes a date format takes', () => {
    expect(dateFormatKind('yyyy-mm-dd')).toBe('date');
    expect(dateFormatKind('dd/mm/yy')).toBe('date');
    expect(dateFormatKind('yyyy-mm-dd h:mm:ss')).toBe('datetime');
    expect(dateFormatKind('h:mm:ss')).toBe('time');
    expect(dateFormatKind('h:mm AM/PM')).toBe('time');
  });

  /**
   * The letters that make a date also appear in money and units. A format
   * that is not a date must not be converted, because the "date" would be a
   * price turned into 1907.
   */
  it('does not see a date in a number format that merely contains letters', () => {
    expect(dateFormatKind('#,##0.00')).toBeNull();
    expect(dateFormatKind('0.00"m"')).toBeNull();
    expect(dateFormatKind('[Red]#,##0')).toBeNull();
    expect(dateFormatKind('"Days: "0')).toBeNull();
    expect(dateFormatKind('0.00%')).toBeNull();
    expect(dateFormatKind('[$-409]#,##0.00')).toBeNull();
  });

  /**
   * `m` is minutes after an `h` and months everywhere else. Reading `h:mm` as
   * a month would call a duration a date.
   */
  it('reads m as minutes after an hour and as months otherwise', () => {
    expect(dateFormatKind('h:mm')).toBe('time');
    expect(dateFormatKind('mm:ss')).toBe('time');
    expect(dateFormatKind('mmm yyyy')).toBe('date');
    expect(dateFormatKind('mmmm')).toBe('date');
  });

  it('judges only the first section of a multi-section format', () => {
    expect(dateFormatKind('yyyy-mm-dd;@')).toBe('date');
    expect(dateFormatKind('#,##0;[Red]#,##0')).toBeNull();
  });
});

describe('parseNumberFormats', () => {
  it('reads custom codes and the style table together', () => {
    const formats = parseNumberFormats(
      '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>' +
        '<cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>',
    );
    expect(dateStyleKind(0, formats)).toBeNull();
    expect(dateStyleKind(1, formats)).toBe('date');
  });

  /**
   * `cellStyleXfs` comes first in the file and holds `<xf>` elements too.
   * Indexing into a table built from every `<xf>` in the document points at
   * the wrong format, which is a bug that shows up only in files that have
   * named styles.
   */
  it('indexes cellXfs, not the cellStyleXfs table that precedes it', () => {
    const formats = parseNumberFormats(
      '<styleSheet><cellStyleXfs count="1"><xf numFmtId="14"/></cellStyleXfs>' +
        '<cellXfs count="1"><xf numFmtId="0"/></cellXfs></styleSheet>',
    );
    expect(formats.styleFormats).toEqual([0]);
    expect(dateStyleKind(0, formats)).toBeNull();
  });

  it('knows the built-in date ids, which carry no format code', () => {
    const formats = parseNumberFormats(
      '<cellXfs><xf numFmtId="14"/><xf numFmtId="18"/><xf numFmtId="22"/><xf numFmtId="2"/></cellXfs>',
    );
    expect(dateStyleKind(0, formats)).toBe('date');
    expect(dateStyleKind(1, formats)).toBe('time');
    expect(dateStyleKind(2, formats)).toBe('datetime');
    expect(dateStyleKind(3, formats)).toBeNull();
  });

  it('treats a missing styles part as no dates rather than throwing', () => {
    const formats = parseNumberFormats(null);
    expect(formats.styleFormats).toEqual([]);
    expect(dateStyleKind(0, formats)).toBeNull();
  });
});

describe('merged cells', () => {
  it('reads the ranges as zero-based indices', () => {
    expect(extractMergedRanges('<mergeCells count="1"><mergeCell ref="A2:C4"/></mergeCells>')).toEqual(
      [{ firstRow: 1, lastRow: 3, firstColumn: 0, lastColumn: 2 }],
    );
  });

  it('has no ranges when the sheet has no mergeCells block', () => {
    expect(extractMergedRanges('<worksheet><sheetData/></worksheet>')).toEqual([]);
  });

  it('repeats the top-left value across the block', () => {
    const grid = extractSheetGrid(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>emea</t></is></c>' +
        '<c r="B1" t="inlineStr"><is><t>q1</t></is></c></row>' +
        '<row r="2"><c r="B2" t="inlineStr"><is><t>q2</t></is></c></row>',
      [],
      { merges: [{ firstRow: 0, lastRow: 1, firstColumn: 0, lastColumn: 0 }] },
    );
    expect(grid.rows).toEqual([
      ['emea', 'q1'],
      ['emea', 'q2'],
    ]);
  });

  /**
   * If a file both merges a range and stores a value inside it, the stored
   * value is what the file says. Overwriting it would be this code inventing
   * data to make the shape tidier.
   */
  it('does not overwrite a value that is already inside the range', () => {
    const grid = extractSheetGrid(
      '<row r="1"><c r="A1"><v>1</v></c></row><row r="2"><c r="A2"><v>2</v></c></row>',
      [],
      { merges: [{ firstRow: 0, lastRow: 1, firstColumn: 0, lastColumn: 0 }] },
    );
    expect(grid.rows).toEqual([['1'], ['2']]);
  });

  it('clips a range that reaches past the grid instead of growing it', () => {
    const grid = extractSheetGrid('<row r="1"><c r="A1"><v>x</v></c></row>', [], {
      merges: [{ firstRow: 0, lastRow: 5000, firstColumn: 0, lastColumn: 5000 }],
    });
    expect(grid.rows).toEqual([['x']]);
  });
});

describe('a real workbook with dates and a merge', () => {
  /**
   * Expected values are `openpyxl`'s reading of this exact file:
   *   [1, 2026-03-14 00:00, 1250.5, 2026-03-14 09:30]
   *   [2, 2024-01-01 00:00, 99,     2024-01-01 23:59:59]
   *   [3, 1900-03-01 00:00, 0,      2026-12-31 00:00]
   */
  it('extracts dates as ISO text rather than serial numbers', () => {
    const document = readOfficeDocument(read('dates-and-merges.xlsx'));
    expect(document.text).toContain('1\t2026-03-14\t1250.5\t2026-03-14T09:30:00');
    expect(document.text).toContain('2\t2024-01-01\t99\t2024-01-01T23:59:59');
    expect(document.text).toContain('3\t1900-03-01\t0\t2026-12-31T00:00:00');
    // The serials themselves must not survive into the indexed text.
    expect(document.text).not.toContain('46095');
    expect(document.text).not.toContain('45292');
  });

  it('gives SQL a date it can compare, not an integer', () => {
    const { db, info } = loadXlsxBytes(read('dates-and-merges.xlsx'), { sheet: 'Incidents' });
    try {
      // ISO text compares correctly with `<` and `>`, which a serial number
      // also does — but only by accident, and it reads as nonsense.
      expect(info.columns.find((c) => c.name === 'opened')?.type).toBe('TEXT');

      const recent = runReadOnlyQuery(db, "SELECT id FROM data WHERE opened >= '2025-01-01'");
      expect(recent.rows).toEqual([[1]]);

      // SQLite's own date functions work on the extracted values, which is
      // the practical test of whether this is a date.
      const year = runReadOnlyQuery(
        db,
        "SELECT id FROM data WHERE strftime('%Y', opened) = '2024'",
      );
      expect(year.rows).toEqual([[2]]);
    } finally {
      db.close();
    }
  });

  it('does not turn the amount column into dates', () => {
    const { db } = loadXlsxBytes(read('dates-and-merges.xlsx'), { sheet: 'Incidents' });
    try {
      const amounts = runReadOnlyQuery(db, 'SELECT amount FROM data ORDER BY id');
      expect(amounts.rows).toEqual([[1250.5], [99], [0]]);
    } finally {
      db.close();
    }
  });

  /**
   * openpyxl reads the merged column as `['emea', None]`: the label is stored
   * once. A human sees it spanning both rows, and a GROUP BY that does not
   * agree with the human is the wrong answer.
   */
  it('groups by a merged label instead of losing half the rows', () => {
    const { db } = loadXlsxBytes(read('dates-and-merges.xlsx'), { sheet: 'Merged' });
    try {
      const grouped = runReadOnlyQuery(
        db,
        'SELECT region, SUM(v) AS total FROM data GROUP BY region',
      );
      expect(grouped.rows).toEqual([['emea', 30]]);
    } finally {
      db.close();
    }
  });
});
