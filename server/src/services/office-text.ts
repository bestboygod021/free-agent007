/**
 * Text out of DOCX and XLSX, with no dependency.
 *
 * The hard part is not the zip and it is not the XML. It is that a word in a
 * Word document is routinely **split across several runs**:
 *
 *   <w:r><w:t>resolve</w:t></w:r><w:r><w:t>Scope</w:t></w:r>
 *
 * Word does this whenever formatting, spell-check state or a tracked revision
 * changes mid-word, which is constantly. A parser that joins runs with a space
 * turns `resolveScope` into `resolve Scope`, and the identifier the hybrid
 * search was built to find becomes unfindable. Runs are therefore concatenated
 * with nothing between them, and separation comes only from the elements that
 * actually mean separation: `<w:p>`, `<w:br/>`, `<w:tab/>`, and cell
 * boundaries.
 *
 * XLSX has its own version of the same trap: cell text lives in a shared
 * string table and a cell holds an *index* into it, so reading the sheet alone
 * gives a grid of integers.
 */

import { readZipEntries, readZipEntry, findZipEntry, ZipError } from './office-zip.js';

export class OfficeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfficeParseError';
  }
}

export type OfficeFormat = 'docx' | 'xlsx';

export interface OfficeDocument {
  format: OfficeFormat;
  text: string;
  /** Paragraphs for a DOCX, rows for an XLSX. */
  blocks: number;
  /** Sheet names, for an XLSX. Empty for a DOCX. */
  sheets: string[];
  /** True when output was cut short by a ceiling, so a caller can say so. */
  truncated: boolean;
}

/** Longest text this will return, per document. */
export const MAX_TEXT_CHARS = 2_000_000;

/**
 * Detect the format from the bytes, never from the filename.
 *
 * An extension is a claim by whoever uploaded the file. The content types
 * part inside the archive is the document's own statement about itself.
 */
export function detectOfficeFormat(bytes: Buffer): OfficeFormat | null {
  if (bytes.length < 4) return null;
  // Every OOXML file is a zip, so it starts with "PK\x03\x04".
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04)) {
    return null;
  }

  let entries;
  try {
    entries = readZipEntries(bytes);
  } catch {
    return null;
  }

  if (findZipEntry(entries, 'word/document.xml')) return 'docx';
  if (findZipEntry(entries, 'xl/workbook.xml')) return 'xlsx';
  return null;
}

/* ------------------------------------------------------------------ */
/* XML                                                                 */
/* ------------------------------------------------------------------ */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** Resolve XML entities, including numeric ones. */
export function decodeXmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

/* ------------------------------------------------------------------ */
/* DOCX                                                                */
/* ------------------------------------------------------------------ */

/**
 * Pull the visible text out of a WordprocessingML body.
 *
 * Scanned with a tag-level regex rather than a DOM. A DOM would be tidier, but
 * every XML parser is itself a dependency, and the subset needed here is one
 * pass over well-formed markup emitted by Word.
 *
 * `<w:instrText>` is deliberately skipped: it holds field *instructions* such
 * as a HYPERLINK target, which are not what the reader sees. Including them
 * puts URLs into the indexed text that never appeared on the page.
 */
export function extractDocxText(documentXml: string): { text: string; paragraphs: number } {
  // The body only. Headers, footers, footnotes and comments are separate
  // parts and are not read -- said out loud rather than silently dropped.
  const bodyMatch = /<w:body\b[^>]*>([\s\S]*)<\/w:body>/.exec(documentXml);
  const body = bodyMatch?.[1] ?? documentXml;

  const lines: string[] = [];
  let current = '';
  let paragraphs = 0;

  // Only text inside <w:t> counts. Whitespace *between* elements is layout in
  // the file, not content on the page, and collecting it produced a blank line
  // after every paragraph for any generator that pretty-prints its XML. The
  // first version filtered that whitespace after the fact, which also ate the
  // meaningful leading space in `<w:t xml:space="preserve"> world</w:t>`.
  let inText = false;
  // Table cells and rows override paragraph breaks: a cell's paragraph must
  // not end the line, or a 3-column row comes out as three lines.
  let cellDepth = 0;

  const tagPattern = /<([^>]*)>([^<]*)/g;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(body)) !== null) {
    const tag = match[1] ?? '';
    const following = match[2] ?? '';
    const name = /^\/?([\w:.-]+)/.exec(tag)?.[1] ?? '';
    const closing = tag.startsWith('/');
    const selfClosing = tag.endsWith('/');

    switch (name) {
      case 'w:t':
        // `<w:t/>` is an empty run, not an opening tag.
        inText = !closing && !selfClosing;
        break;
      case 'w:br':
      case 'w:cr':
        current += '\n';
        break;
      case 'w:tab':
        current += '\t';
        break;
      case 'w:tc':
        if (closing) {
          cellDepth = Math.max(0, cellDepth - 1);
          current += '\t';
        } else if (!selfClosing) {
          cellDepth += 1;
        }
        break;
      case 'w:tr':
        if (closing) {
          // Trailing tab from the last cell; the row separator replaces it.
          lines.push(current.replace(/\t$/, ''));
          paragraphs += 1;
          current = '';
        }
        break;
      case 'w:p':
        if (closing && cellDepth === 0) {
          lines.push(current);
          paragraphs += 1;
          current = '';
        }
        break;
      default:
        break;
    }

    // `<w:instrText>` holds field *instructions* -- a HYPERLINK target, a
    // merge field name -- which are in the markup and not on the page.
    // Indexing them puts URLs into the text that no reader ever saw. It is
    // excluded by only ever collecting `<w:t>`, which is why that rule is
    // stated as the mechanism rather than as a side effect.
    if (inText && following !== '') current += decodeXmlEntities(following);
  }

  if (current !== '') {
    lines.push(current);
    paragraphs += 1;
  }

  const text = lines
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    // Word emits an empty paragraph per blank line; three or more in a row is
    // padding rather than structure.
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text, paragraphs };
}

/* ------------------------------------------------------------------ */
/* XLSX                                                                */
/* ------------------------------------------------------------------ */

/**
 * The shared string table.
 *
 * A cell of type `s` stores an index into this, so without it a sheet reads as
 * a grid of integers. Each `<si>` may hold several `<t>` runs, concatenated
 * for the same reason Word runs are.
 */
export function extractSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  // The `/>` branch and the non-greedy attribute match are both load-bearing.
  // `<si\b[^>]*>` matches the `>` of a self-closing `<si/>` and then hunts for
  // the next `</si>`, swallowing the following entry whole: the empty string
  // vanishes *and* its successor is consumed. Measured on
  // `<si><t>a</t></si><si/><si><t>c</t></si>`, the old pattern produced
  // `['a', '<si><t>c</t>']`.
  const itemPattern = /<si\b([^>]*?)(?:\/>|>([\s\S]*?)<\/si>)/g;
  let item: RegExpExecArray | null;

  while ((item = itemPattern.exec(xml)) !== null) {
    const inner = item[2] ?? '';
    let value = '';
    const textPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let piece: RegExpExecArray | null;
    while ((piece = textPattern.exec(inner)) !== null) {
      value += decodeXmlEntities(piece[1] ?? '');
    }
    strings.push(value);
  }

  // A `<si/>` with no `<t>` is a legitimate empty string and must still occupy
  // its index, or every later index is off by one.
  return strings;
}

/**
 * Largest grid a single sheet may produce.
 *
 * Filling column gaps means a cell reference decides how much memory a row
 * costs, and a reference is attacker-controlled. `<c r="XFD1"/>` alone asks
 * for 16,384 entries; sixteen megabytes of XML can hold enough of those to
 * ask for billions. The ceiling is on the product, so a wide sheet and a tall
 * sheet are both allowed but their combination is not.
 */
export const MAX_SHEET_COLUMNS = 16_384;
export const MAX_SHEET_ROWS = 200_000;
export const MAX_GRID_CELLS = 2_000_000;

/**
 * Column index from a cell reference: `A` -> 0, `Z` -> 25, `AA` -> 26.
 *
 * Returns null for a reference this does not understand, so a corrupt file
 * loses one cell rather than shifting the whole row.
 */
export function columnIndexFromRef(ref: string): number | null {
  const letters = /^([A-Z]+)\d+$/.exec(ref)?.[1];
  if (letters === undefined) return null;
  let index = 0;
  for (const character of letters) {
    index = index * 26 + (character.charCodeAt(0) - 64);
  }
  const zeroBased = index - 1;
  return zeroBased >= 0 && zeroBased < MAX_SHEET_COLUMNS ? zeroBased : null;
}

/** Read one cell's value, resolving a shared-string index and any date format. */
function cellValue(
  attributes: string,
  inner: string,
  sharedStrings: readonly string[],
  options: GridOptions,
): string {
  const type = /\bt="([^"]*)"/.exec(attributes)?.[1] ?? 'n';

  if (type === 'inlineStr') {
    let value = '';
    const textPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let piece: RegExpExecArray | null;
    while ((piece = textPattern.exec(inner)) !== null) {
      value += decodeXmlEntities(piece[1] ?? '');
    }
    return value;
  }

  // `<v>` is the value; a formula cell also has `<f>`, and the cached value is
  // what a reader sees, so `<f>` is ignored.
  const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1];
  if (raw === undefined) return '';
  const value = decodeXmlEntities(raw);

  if (type === 's') {
    const index = Number.parseInt(value, 10);
    // An out-of-range index is a corrupt file, not a crash.
    return sharedStrings[index] ?? '';
  }

  // A number carrying a date format is a date. `t="n"` is the default and is
  // also what a date has, so the type attribute cannot be used to tell them
  // apart — only the style can.
  if ((type === 'n' || type === '') && options.formats !== undefined) {
    const styleIndex = Number.parseInt(/\bs="(\d+)"/.exec(attributes)?.[1] ?? '', 10);
    const kind = Number.isInteger(styleIndex)
      ? dateStyleKind(styleIndex, options.formats)
      : null;
    if (kind !== null) {
      const iso = excelSerialToIso(Number(value), kind, options.date1904 ?? false);
      // A style that says date over something that is not a number means the
      // file is inconsistent; the raw value is the honest answer.
      if (iso !== null) return iso;
    }
  }

  return value;
}

export interface GridOptions {
  formats?: NumberFormats;
  date1904?: boolean;
  /**
   * Ranges from `<mergeCells>`. When given, the top-left value is repeated
   * across the block.
   */
  merges?: readonly MergedRange[];
}

/* ------------------------------------------------------------------ */
/* Number formats: telling a date from a number                        */
/* ------------------------------------------------------------------ */

/**
 * A date in a spreadsheet is a number. `2026-03-14` is stored as `46095`, and
 * the only thing that makes it a date is a number format referenced through
 * the cell's `s=` style index. Ignoring styles means a date column arrives as
 * five-digit integers: not an error anywhere, just a wrong answer.
 */
export interface NumberFormats {
  /** numFmtId per cellXfs index, in order. */
  styleFormats: number[];
  /** Custom format codes by id. Built-ins are not listed in the file. */
  customCodes: Map<number, string>;
}

/**
 * Built-in format ids that mean a date or a time.
 *
 * These are fixed by the spec and carry no `formatCode` in the file, so there
 * is nothing to inspect — they have to be known. 14–17 are dates, 18–21 are
 * times, 22 is a date and time, 45–47 are elapsed time.
 */
const BUILTIN_DATE_ONLY_IDS = new Set([14, 15, 16, 17]);
const BUILTIN_TIME_ONLY_IDS = new Set([18, 19, 20, 21, 45, 46, 47]);
const BUILTIN_DATETIME_IDS = new Set([22]);

/** What a date format renders. */
export type DateStyleKind = 'date' | 'time' | 'datetime';

export function parseNumberFormats(stylesXml: string | null): NumberFormats {
  const styleFormats: number[] = [];
  const customCodes = new Map<number, string>();
  if (stylesXml === null) return { styleFormats, customCodes };

  const numFmts = /<numFmts\b[^>]*>([\s\S]*?)<\/numFmts>/.exec(stylesXml)?.[1];
  if (numFmts !== undefined) {
    const pattern = /<numFmt\b([^>]*?)\/?>/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(numFmts)) !== null) {
      const attributes = match[1] ?? '';
      const id = Number.parseInt(/\bnumFmtId="(\d+)"/.exec(attributes)?.[1] ?? '', 10);
      const code = /\bformatCode="([^"]*)"/.exec(attributes)?.[1];
      if (Number.isInteger(id) && code !== undefined) {
        customCodes.set(id, decodeXmlEntities(code));
      }
    }
  }

  // Only `cellXfs` — `cellStyleXfs` appears first in the file and has the same
  // element name, so matching `<xf>` document-wide indexes into the wrong
  // table.
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1];
  if (cellXfs !== undefined) {
    const pattern = /<xf\b([^>]*?)(?:\/>|>[\s\S]*?<\/xf>)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(cellXfs)) !== null) {
      const id = Number.parseInt(/\bnumFmtId="(\d+)"/.exec(match[1] ?? '')?.[1] ?? '', 10);
      styleFormats.push(Number.isInteger(id) ? id : 0);
    }
  }

  return { styleFormats, customCodes };
}

/**
 * What a format code renders, or null if it is not a date or time at all.
 *
 * Literal text and bracketed sections are removed first. `0.00"m"` is metres
 * and `[Red]#,##0` is a colour; both contain letters that would otherwise
 * read as date tokens.
 *
 * The `m` token is ambiguous in the format language — it is minutes directly
 * after `h` or before `s`, and months everywhere else. That ambiguity only
 * matters for choosing between "date" and "time", so it is resolved the same
 * way Excel resolves it rather than being ignored.
 */
export function dateFormatKind(code: string): DateStyleKind | null {
  const stripped = (code
    .replace(/\\./g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/\[[^\]]*\]/g, '')
    // Only the first section matters: the rest are the negative, zero and
    // text variants of the same quantity.
    .split(';')[0] ?? '')
    .toLowerCase();

  // AM/PM has to go before anything is tokenised, because it contains two
  // `m` characters that are not minutes and not months. A regex that looks at
  // what surrounds an `m` reads the one in "pm" as a month and turns every
  // twelve-hour clock format into a date.
  let hasTime = /am\/pm|a\/p/.test(stripped);
  const cleaned = stripped.replace(/am\/pm|a\/p/g, ' ');

  // Runs of format letters, with everything else treated as a separator.
  const runs = cleaned.match(/[ymdhs]+/g) ?? [];
  let hasDate = false;

  runs.forEach((run, index) => {
    const letter = run[0]!;
    if (letter === 'y' || letter === 'd') {
      hasDate = true;
      return;
    }
    if (letter === 'h' || letter === 's') {
      hasTime = true;
      return;
    }
    // `m` is minutes when it follows an hour or precedes a second, and months
    // everywhere else. This is Excel's own rule, and without it `mm:ss` is a
    // date and `mmm yyyy` is a time.
    const previous = runs[index - 1]?.[0];
    const next = runs[index + 1]?.[0];
    if (previous === 'h' || next === 's') hasTime = true;
    else hasDate = true;
  });

  if (hasDate && hasTime) return 'datetime';
  if (hasTime) return 'time';
  if (hasDate) return 'date';
  return null;
}

/** What kind of date this cell's style renders, or null if it is a plain number. */
export function dateStyleKind(
  styleIndex: number | null,
  formats: NumberFormats,
): DateStyleKind | null {
  if (styleIndex === null) return null;
  const id = formats.styleFormats[styleIndex];
  if (id === undefined) return null;
  if (BUILTIN_DATE_ONLY_IDS.has(id)) return 'date';
  if (BUILTIN_TIME_ONLY_IDS.has(id)) return 'time';
  if (BUILTIN_DATETIME_IDS.has(id)) return 'datetime';
  const code = formats.customCodes.get(id);
  return code === undefined ? null : dateFormatKind(code);
}

/**
 * Turn an Excel serial number into an ISO 8601 string.
 *
 * Two traps, both verified against a real reader rather than recalled:
 *
 * 1. **1900 is not a leap year, and Excel thinks it is.** Serial 60 is
 *    Excel's 29 February 1900, a day that never happened. Everything from 61
 *    onwards is therefore one day ahead of a naive count, so serials below 60
 *    and serials above it need different epochs. Getting this wrong shifts
 *    every date before March 1900 by a day — or, if you use one epoch for
 *    everything, shifts *every date in the file* by a day.
 * 2. **There is a second calendar.** A workbook saved by Excel for Mac may
 *    carry `date1904="1"`, where serial 1 is 2 January 1904 and the leap-year
 *    bug does not exist. Assuming 1900 reads those files four years early.
 *
 * Serial 60 is returned as `1900-02-29`: that is what Excel displays, it is
 * distinct from serial 59, and it is visibly not a real date. Clamping it to
 * the 28th would merge two different cells into one value silently, which is
 * the worse failure.
 */
export function excelSerialToIso(
  serial: number,
  kind: DateStyleKind = 'datetime',
  date1904 = false,
): string | null {
  if (!Number.isFinite(serial) || serial < 0) return null;

  const days = Math.floor(serial);
  const fraction = serial - days;
  const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

  // Rounded, not truncated: a stored 09:30 is 0.3958333... and truncating
  // gives 09:29:59. A round that reaches the next day carries into it.
  let seconds = Math.round(fraction * 86_400);
  let dayOffset = 0;
  if (seconds >= 86_400) {
    seconds -= 86_400;
    dayOffset = 1;
  }
  const time = `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;

  if (kind === 'time') return time;

  let day: string;
  if (!date1904 && days === 60 && dayOffset === 0) {
    day = '1900-02-29';
  } else {
    const epochUtc = date1904
      ? Date.UTC(1904, 0, 1)
      : // Below the phantom day the count is honest; above it, one day must
        // be given back.
        days + dayOffset < 60
        ? Date.UTC(1899, 11, 31)
        : Date.UTC(1899, 11, 30);
    const date = new Date(epochUtc + (days + dayOffset) * 86_400_000);
    if (Number.isNaN(date.getTime())) return null;
    day = `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  }

  // The format decides whether a time is shown, not the value. A datetime
  // column whose midnight rows render as bare dates sorts and filters
  // differently from its other rows, which is a trap laid for the caller.
  return kind === 'date' ? day : `${day}T${time}`;
}

/* ------------------------------------------------------------------ */
/* Merged cells                                                        */
/* ------------------------------------------------------------------ */

export interface MergedRange {
  firstRow: number;
  lastRow: number;
  firstColumn: number;
  lastColumn: number;
}

/**
 * Ranges from `<mergeCells>`, as zero-based row and column indices.
 *
 * A merged block stores its value in the top-left cell only; the rest are
 * absent. A human sees one label spanning three rows, and a reader that does
 * not expand the range produces two rows with an empty label — which then
 * group and filter as if the label were missing.
 */
export function extractMergedRanges(sheetXml: string): MergedRange[] {
  const block = /<mergeCells\b[^>]*>([\s\S]*?)<\/mergeCells>/.exec(sheetXml)?.[1];
  if (block === undefined) return [];

  const ranges: MergedRange[] = [];
  const pattern = /<mergeCell\b[^>]*?\bref="([A-Z]+\d+):([A-Z]+\d+)"[^>]*?\/?>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(block)) !== null) {
    const from = parseCellRef(match[1] ?? '');
    const to = parseCellRef(match[2] ?? '');
    if (from === null || to === null) continue;
    ranges.push({
      firstRow: Math.min(from.row, to.row),
      lastRow: Math.max(from.row, to.row),
      firstColumn: Math.min(from.column, to.column),
      lastColumn: Math.max(from.column, to.column),
    });
  }
  return ranges;
}

function parseCellRef(ref: string): { row: number; column: number } | null {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) return null;
  const column = columnIndexFromRef(`${match[1]}1`);
  const row = Number.parseInt(match[2] ?? '', 10) - 1;
  if (column === null || !Number.isInteger(row) || row < 0) return null;
  return { row, column };
}

export interface SheetGrid {
  rows: string[][];
  /** Width every row has been padded to. */
  columns: number;
  truncated: boolean;
}

/**
 * One sheet as a rectangular grid.
 *
 * The `r="C2"` reference is what decides a cell's column, never its position
 * in the document. Excel omits empty cells entirely, so a four-column sheet
 * with a gap in the second column writes three `<c>` elements and reading
 * them in order silently files the third column's value under the second.
 * That is invisible in extracted text and is data corruption in a table.
 *
 * Rows that are absent are not recreated: a gap between `r="3"` and `r="9"`
 * is five blank rows that carry nothing, and emitting them only inflates the
 * grid. Column gaps *within* a row are filled, because those shift data.
 */
export function extractSheetGrid(
  sheetXml: string,
  sharedStrings: readonly string[],
  options: GridOptions = {},
): SheetGrid {
  const sparse: Map<number, string>[] = [];
  let widest = 0;
  let truncated = false;

  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let row: RegExpExecArray | null;

  while ((row = rowPattern.exec(sheetXml)) !== null) {
    if (sparse.length >= MAX_SHEET_ROWS) {
      truncated = true;
      break;
    }
    const cells = new Map<number, string>();
    // Non-greedy, for the same reason as `<si>` above: a greedy `[^>]*`
    // consumes the `/` of `<c/>`, leaving a bare `>` that sends the match down
    // the container branch and eats the next cell.
    const cellPattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cell: RegExpExecArray | null;
    let fallbackColumn = 0;

    while ((cell = cellPattern.exec(row[1] ?? '')) !== null) {
      const attributes = cell[1] ?? '';
      const ref = /\br="([A-Z]+\d+)"/.exec(attributes)?.[1];
      // A cell with no usable reference keeps document order. That is the old
      // behaviour and it is only reached for files that omit `r`, which the
      // format permits.
      const column = (ref !== undefined ? columnIndexFromRef(ref) : null) ?? fallbackColumn;
      fallbackColumn = column + 1;
      cells.set(column, cellValue(attributes, cell[2] ?? '', sharedStrings, options));
      if (column + 1 > widest) widest = column + 1;
    }

    sparse.push(cells);
  }

  // Trim to fit the cell budget rather than refusing the file: a caller gets
  // the first part of an oversized sheet and is told it was cut.
  let height = sparse.length;
  if (widest > 0 && height * widest > MAX_GRID_CELLS) {
    height = Math.max(1, Math.floor(MAX_GRID_CELLS / widest));
    truncated = true;
  }

  const rows: string[][] = [];
  for (let r = 0; r < height; r += 1) {
    const cells = sparse[r] ?? new Map<number, string>();
    const line: string[] = new Array<string>(widest).fill('');
    for (const [column, value] of cells) {
      if (column < widest) line[column] = value;
    }
    rows.push(line);
  }

  fillMergedRanges(rows, options.merges ?? []);

  return { rows, columns: widest, truncated };
}

/**
 * Repeat a merged block's value across the cells it covers.
 *
 * Only over cells that are empty: if a file both merges a range and stores a
 * value inside it, the stored value is what the file says and overwriting it
 * would be this code inventing data. Ranges that reach past the loaded grid
 * are clipped rather than extending it, so a `ref` cannot grow the table.
 */
function fillMergedRanges(rows: string[][], merges: readonly MergedRange[]): void {
  for (const range of merges) {
    const source = rows[range.firstRow]?.[range.firstColumn];
    if (source === undefined || source === '') continue;

    for (let r = range.firstRow; r <= range.lastRow; r += 1) {
      const row = rows[r];
      if (row === undefined) break;
      for (let c = range.firstColumn; c <= range.lastColumn; c += 1) {
        if (c >= row.length) break;
        if (row[c] === '') row[c] = source;
      }
    }
  }
}

/** One sheet as tab-separated rows. */
export function extractSheetText(
  sheetXml: string,
  sharedStrings: readonly string[],
  options: GridOptions = {},
): { text: string; rows: number } {
  const grid = extractSheetGrid(sheetXml, sharedStrings, options);
  // Trailing empties would add tabs that carry no information and make every
  // short row look padded in a search snippet.
  const lines = grid.rows.map((cells) => {
    let end = cells.length;
    while (end > 0 && cells[end - 1] === '') end -= 1;
    return cells.slice(0, end).join('\t');
  });
  return { text: lines.join('\n'), rows: lines.length };
}

export interface SheetRef {
  name: string;
  /** Archive path of this sheet's XML. */
  path: string;
  relationshipId: string | null;
}

/**
 * Map each sheet tab to the archive entry that holds it.
 *
 * `xl/workbook.xml` gives the tab order and names but only an `r:id`; the
 * actual filename lives in `xl/_rels/workbook.xml.rels`. Guessing
 * `sheet{n+1}.xml` from the tab position is right for files a library wrote
 * and wrong for files Excel wrote: deleting the second of three tabs leaves
 * `sheet1.xml` and `sheet3.xml` behind, and the guess then reads nothing for
 * the second tab. That failure is silent and therefore the dangerous kind —
 * the sheet name is still reported, so a caller believes it was read.
 *
 * The positional guess survives only as a fallback for archives with no
 * relationships part, where there is nothing better to do.
 */
export function resolveWorkbookSheets(
  workbookXml: string,
  relsXml: string | null,
): SheetRef[] {
  const targets = new Map<string, string>();
  if (relsXml !== null) {
    const relPattern = /<Relationship\b([^>]*?)(?:\/>|>[\s\S]*?<\/Relationship>)/g;
    let rel: RegExpExecArray | null;
    while ((rel = relPattern.exec(relsXml)) !== null) {
      const attributes = rel[1] ?? '';
      const id = /\bId="([^"]*)"/.exec(attributes)?.[1];
      const target = /\bTarget="([^"]*)"/.exec(attributes)?.[1];
      if (id === undefined || target === undefined) continue;
      targets.set(id, normaliseRelationshipTarget(decodeXmlEntities(target)));
    }
  }

  const refs: SheetRef[] = [];
  // `<sheets>` does not match: there is no word boundary between "sheet" and
  // the "s" that follows it.
  const sheetPattern = /<sheet\b([^>]*?)\/?>/g;
  let sheet: RegExpExecArray | null;
  while ((sheet = sheetPattern.exec(workbookXml)) !== null) {
    const attributes = sheet[1] ?? '';
    const name = /\bname="([^"]*)"/.exec(attributes)?.[1];
    if (name === undefined) continue;
    const relationshipId = /\br:id="([^"]*)"/.exec(attributes)?.[1] ?? null;
    const mapped = relationshipId !== null ? targets.get(relationshipId) : undefined;
    refs.push({
      name: decodeXmlEntities(name),
      path: mapped ?? `xl/worksheets/sheet${refs.length + 1}.xml`,
      relationshipId: relationshipId ?? null,
    });
  }
  return refs;
}

/**
 * Turn a relationship Target into an archive path.
 *
 * Targets come absolute (`/xl/worksheets/sheet1.xml`) or relative to the part
 * that owns the relationships file (`worksheets/sheet1.xml`, and `../` is
 * legal). Segments are resolved here rather than passed through, so `..`
 * cannot walk out of the archive namespace.
 */
function normaliseRelationshipTarget(target: string): string {
  const absolute = target.startsWith('/');
  const base = absolute ? [] : ['xl'];
  const segments = target.replace(/^\//, '').split('/');
  const resolved = [...base];
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return resolved.join('/');
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

/** Read a DOCX or XLSX from its bytes. */
export function readOfficeDocument(bytes: Buffer): OfficeDocument {
  const format = detectOfficeFormat(bytes);
  if (format === null) {
    throw new OfficeParseError('not a readable .docx or .xlsx file');
  }

  let entries;
  try {
    entries = readZipEntries(bytes);
  } catch (err) {
    throw new OfficeParseError(err instanceof ZipError ? err.message : 'unreadable archive');
  }

  const budget = { used: 0 };
  const read = (name: string): string | null => {
    const entry = findZipEntry(entries, name);
    if (!entry) return null;
    try {
      return readZipEntry(bytes, entry, budget).toString('utf8');
    } catch (err) {
      throw new OfficeParseError(err instanceof ZipError ? err.message : `cannot read ${name}`);
    }
  };

  if (format === 'docx') {
    const xml = read('word/document.xml');
    if (xml === null) throw new OfficeParseError('the archive has no word/document.xml');

    const { text, paragraphs } = extractDocxText(xml);
    const truncated = text.length > MAX_TEXT_CHARS;
    return {
      format,
      text: truncated ? text.slice(0, MAX_TEXT_CHARS) : text,
      blocks: paragraphs,
      sheets: [],
      truncated,
    };
  }

  const workbook = read('xl/workbook.xml');
  if (workbook === null) throw new OfficeParseError('the archive has no xl/workbook.xml');

  const sharedStrings = (() => {
    const xml = read('xl/sharedStrings.xml');
    return xml === null ? [] : extractSharedStrings(xml);
  })();

  const formats = parseNumberFormats(read('xl/styles.xml'));
  // A Mac-saved workbook counts from 1904. Reading it as 1900 puts every date
  // four years early, and nothing about the number says which it is.
  const date1904 = /<workbookPr\b[^>]*\bdate1904="(1|true)"/.test(workbook);

  const sheetRefs = resolveWorkbookSheets(workbook, read('xl/_rels/workbook.xml.rels'));
  const names = sheetRefs.map((ref) => ref.name);

  const parts: string[] = [];
  let rows = 0;
  for (const ref of sheetRefs) {
    const xml = read(ref.path);
    if (xml === null) continue;
    const extracted = extractSheetText(xml, sharedStrings, {
      formats,
      date1904,
      merges: extractMergedRanges(xml),
    });
    if (extracted.rows === 0) continue;
    parts.push(`# ${ref.name}\n${extracted.text}`);
    rows += extracted.rows;
  }

  const text = parts.join('\n\n');
  const truncated = text.length > MAX_TEXT_CHARS;
  return {
    format,
    text: truncated ? text.slice(0, MAX_TEXT_CHARS) : text,
    blocks: rows,
    sheets: names,
    truncated,
  };
}
