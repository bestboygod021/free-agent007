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

/** One sheet as tab-separated rows. */
export function extractSheetText(sheetXml: string, sharedStrings: readonly string[]): {
  text: string;
  rows: number;
} {
  const lines: string[] = [];
  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let row: RegExpExecArray | null;

  while ((row = rowPattern.exec(sheetXml)) !== null) {
    const cells: string[] = [];
    // Non-greedy, for the same reason as `<si>` above: a greedy `[^>]*`
    // consumes the `/` of `<c/>`, leaving a bare `>` that sends the match down
    // the container branch and eats the next cell.
    const cellPattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cell: RegExpExecArray | null;

    while ((cell = cellPattern.exec(row[1] ?? '')) !== null) {
      const attributes = cell[1] ?? '';
      const inner = cell[2] ?? '';
      const type = /\bt="([^"]*)"/.exec(attributes)?.[1] ?? 'n';

      if (type === 'inlineStr') {
        let value = '';
        const textPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        let piece: RegExpExecArray | null;
        while ((piece = textPattern.exec(inner)) !== null) {
          value += decodeXmlEntities(piece[1] ?? '');
        }
        cells.push(value);
        continue;
      }

      // `<v>` is the value; a formula cell also has `<f>`, and the cached
      // value is what a reader sees, so `<f>` is ignored.
      const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      if (raw === undefined) {
        cells.push('');
        continue;
      }
      const value = decodeXmlEntities(raw);

      if (type === 's') {
        const index = Number.parseInt(value, 10);
        // An out-of-range index is a corrupt file, not a crash: emit nothing
        // for that cell rather than `undefined`.
        cells.push(sharedStrings[index] ?? '');
      } else {
        cells.push(value);
      }
    }

    lines.push(cells.join('\t'));
  }

  return { text: lines.join('\n'), rows: lines.length };
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

  // Sheet order comes from the workbook, not from the zip's entry order, which
  // has no defined relationship to the tabs a user sees.
  const names: string[] = [];
  const sheetPattern = /<sheet\b([^>]*)\/?>/g;
  let sheet: RegExpExecArray | null;
  while ((sheet = sheetPattern.exec(workbook)) !== null) {
    const name = /\bname="([^"]*)"/.exec(sheet[1] ?? '')?.[1];
    if (name !== undefined) names.push(decodeXmlEntities(name));
  }

  const parts: string[] = [];
  let rows = 0;
  names.forEach((name, index) => {
    const xml = read(`xl/worksheets/sheet${index + 1}.xml`);
    if (xml === null) return;
    const extracted = extractSheetText(xml, sharedStrings);
    if (extracted.rows === 0) return;
    parts.push(`# ${name}\n${extracted.text}`);
    rows += extracted.rows;
  });

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
