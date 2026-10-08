import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  readOfficeDocument,
  detectOfficeFormat,
  extractDocxText,
  extractSharedStrings,
  extractSheetText,
  decodeXmlEntities,
  OfficeParseError,
} from '../../services/office-text.js';
import {
  readZipEntries,
  readZipEntry,
  findZipEntry,
  ZipError,
  MAX_ENTRY_BYTES,
} from '../../services/office-zip.js';

const FIXTURES = path.join(import.meta.dirname, '../fixtures/office');
const fixture = (name: string): Buffer => fs.readFileSync(path.join(FIXTURES, name));

describe('office-zip', () => {
  /**
   * Against archives this project did not write. Testing a zip reader with
   * zips from the same codebase is circular -- a shared misreading of the
   * format passes both ways.
   */
  it('reads the central directory of a real archive', () => {
    const entries = readZipEntries(fixture('word-document.docx'));

    expect(entries.length).toBeGreaterThan(5);
    expect(entries.map((e) => e.name)).toContain('word/document.xml');
    expect(entries.map((e) => e.name)).toContain('[Content_Types].xml');
  });

  it('inflates a deflated entry', () => {
    const bytes = fixture('word-document.docx');
    const entries = readZipEntries(bytes);
    const entry = findZipEntry(entries, 'word/document.xml')!;

    const content = readZipEntry(bytes, entry).toString('utf8');

    expect(entry.compressionMethod).toBe(8);
    expect(content).toContain('<w:document');
  });

  it('matches entry names exactly, so a lookalike path cannot substitute', () => {
    const entries = readZipEntries(fixture('word-document.docx'));

    expect(findZipEntry(entries, 'document.xml')).toBeNull();
    expect(findZipEntry(entries, 'evil/word/document.xml')).toBeNull();
  });

  it('refuses something that is not a zip', () => {
    expect(() => readZipEntries(Buffer.from('not a zip at all'))).toThrow(ZipError);
  });

  it('reports a corrupt deflate stream as a ZipError naming the entry', () => {
    const archive = buildArchive([
      { name: 'broken.xml', data: Buffer.from('not deflate data'), method: 8, declaredSize: 16 },
    ]);
    const entries = readZipEntries(archive);

    expect(() => readZipEntry(archive, entries[0]!)).toThrow(ZipError);
    expect(() => readZipEntry(archive, entries[0]!)).toThrow(/broken\.xml/);
  });

  it('refuses a truncated archive', () => {
    const bytes = fixture('word-document.docx');

    expect(() => readZipEntries(bytes.subarray(0, bytes.length - 40))).toThrow(ZipError);
  });

  /**
   * The zip bomb. A few hundred bytes of deflate expand to well past the
   * ceiling, and the declared size in the header is attacker-chosen -- so the
   * check that matters is on the bytes actually produced.
   */
  it('refuses an entry that expands past the ceiling', () => {
    const huge = Buffer.alloc(MAX_ENTRY_BYTES + 1024, 0x41);
    const deflated = zlib.deflateRawSync(huge);
    const archive = buildArchive([
      { name: 'bomb.bin', data: deflated, method: 8, declaredSize: 10 },
    ]);
    const entries = readZipEntries(archive);

    // A ZipError naming the entry, not a raw zlib RangeError. An operator
    // needs to know which file in the upload was hostile.
    expect(() => readZipEntry(archive, entries[0]!)).toThrow(ZipError);
    expect(() => readZipEntry(archive, entries[0]!)).toThrow(/bomb\.bin/);
  });

  /**
   * Every entry declares ten bytes and delivers eight megabytes. The
   * pre-allocation check reads the declared size and waves all of them
   * through, so only the check on what was *actually* produced can stop the
   * total -- which is the whole reason there are two checks.
   *
   * The first version of this test declared the real size, so the cheap check
   * fired first and deleting the measured one changed nothing. The mutant
   * survived, and the fixture was the reason.
   */
  it('refuses entries that together exceed the budget while each lies about its size', () => {
    // Sizes chosen so the overflow lands on the *last* entry. With equal
    // entries the loop takes another turn after the budget is blown and the
    // cheap pre-check fires with the same message, so the measured check
    // could be deleted and the test stayed green. Five 8 MB entries leave the
    // total at 40 MB, under the 48 MB ceiling; the 10 MB entry that follows
    // passes the pre-check on its declared ten bytes and can only be caught
    // after it is inflated.
    const chunk = zlib.deflateRawSync(Buffer.alloc(8 * 1024 * 1024, 0x42));
    const last = zlib.deflateRawSync(Buffer.alloc(10 * 1024 * 1024, 0x42));
    const archive = buildArchive([
      ...Array.from({ length: 5 }, (_, i) => ({
        name: `part${i}.bin`,
        data: chunk,
        method: 8,
        declaredSize: 10,
      })),
      { name: 'last.bin', data: last, method: 8, declaredSize: 10 },
    ]);
    const entries = readZipEntries(archive);

    const budget = { used: 0 };
    expect(() => {
      for (const entry of entries) readZipEntry(archive, entry, budget);
    }).toThrow(/total budget/);
  });

  /**
   * A stored entry never goes through zlib, so `maxOutputLength` cannot help.
   * The size check on the produced bytes is the only thing standing there.
   */
  it('refuses an oversized stored entry, which zlib limits cannot catch', () => {
    const archive = buildArchive([
      {
        name: 'big.bin',
        data: Buffer.alloc(MAX_ENTRY_BYTES + 1024, 0x43),
        method: 0,
        declaredSize: 10,
      },
    ]);
    const entries = readZipEntries(archive);

    expect(() => readZipEntry(archive, entries[0]!)).toThrow(/expands past/);
  });

  /**
   * The local header and the central directory carry their own extra-field
   * lengths and they routinely differ. Using the central directory's length
   * to find the data lands mid-stream; using a hardcoded zero does the same.
   */
  it('uses the local header extra-field length to find the data', () => {
    const archive = buildArchive([
      { name: 'padded.txt', data: Buffer.from('payload'), method: 0, declaredSize: 7, localExtra: 24 },
    ]);
    const entries = readZipEntries(archive);

    expect(readZipEntry(archive, entries[0]!).toString('utf8')).toBe('payload');
  });

  /**
   * A well-formed EOCD that points at a central directory past the end of the
   * file. Truncating the tail instead removes the EOCD and fails earlier, so
   * that version of the test never reached this check.
   */
  it('refuses a central directory that claims to run past the archive', () => {
    const archive = buildArchive([
      { name: 'a.txt', data: Buffer.from('hi'), method: 0, declaredSize: 2 },
    ]);
    const eocd = archive.length - 22;
    archive.writeUInt32LE(0xffff_0000 >>> 8, eocd + 12); // absurd directory size

    expect(() => readZipEntries(archive)).toThrow(/past the end/);
  });

  it('refuses an unsupported compression method', () => {
    const archive = buildArchive([
      { name: 'weird.bin', data: Buffer.from('xx'), method: 14, declaredSize: 2 },
    ]);
    const entries = readZipEntries(archive);

    expect(() => readZipEntry(archive, entries[0]!)).toThrow(/unsupported compression/);
  });

  it('reads a stored (uncompressed) entry', () => {
    const archive = buildArchive([
      { name: 'plain.txt', data: Buffer.from('hello'), method: 0, declaredSize: 5 },
    ]);
    const entries = readZipEntries(archive);

    expect(readZipEntry(archive, entries[0]!).toString('utf8')).toBe('hello');
  });
});

describe('decodeXmlEntities', () => {
  it('decodes the named entities', () => {
    expect(decodeXmlEntities('5 &lt; 7 &amp;&amp; &quot;x&quot; &apos;y&apos; &gt;')).toBe(
      `5 < 7 && "x" 'y' >`,
    );
  });

  it('decodes numeric and hex entities', () => {
    expect(decodeXmlEntities('caf&#233; &#x645;')).toBe('café م');
  });

  it('leaves an unknown entity alone rather than dropping it', () => {
    expect(decodeXmlEntities('a &nosuch; b')).toBe('a &nosuch; b');
  });
});

describe('extractDocxText', () => {
  /**
   * The bug this parser exists to avoid. Word splits a word across runs
   * whenever formatting, spell-check state or a tracked revision changes
   * mid-word, which is constantly. Joining runs with a space turns
   * `resolveScope` into `resolve Scope` and the identifier that hybrid
   * retrieval was built to find becomes unfindable.
   */
  it('keeps a word that Word split across runs intact', () => {
    const xml =
      '<w:body><w:p><w:r><w:t>resolve</w:t></w:r><w:r><w:t>Scope</w:t></w:r></w:p></w:body>';

    expect(extractDocxText(xml).text).toBe('resolveScope');
  });

  it('honours a preserved leading space', () => {
    const xml =
      '<w:body><w:p><w:r><w:t>Hello</w:t></w:r>' +
      '<w:r><w:t xml:space="preserve"> world</w:t></w:r></w:p></w:body>';

    expect(extractDocxText(xml).text).toBe('Hello world');
  });

  it('turns a line break into a newline and a tab element into a tab', () => {
    const xml =
      '<w:body><w:p><w:r><w:t>a</w:t></w:r><w:r><w:br/></w:r><w:r><w:t>b</w:t></w:r>' +
      '<w:r><w:tab/></w:r><w:r><w:t>c</w:t></w:r></w:p></w:body>';

    expect(extractDocxText(xml).text).toBe('a\nb\tc');
  });

  /**
   * Field instructions live in the markup and never appear on the page.
   * Indexing them would put a URL into the searchable text that no reader
   * ever saw -- and in a document built to mislead, a URL the author chose.
   */
  it('excludes field instruction text such as a hyperlink target', () => {
    const xml =
      '<w:body><w:p><w:r><w:instrText>HYPERLINK http://evil.example</w:instrText></w:r>' +
      '<w:r><w:t>click here</w:t></w:r></w:p></w:body>';

    const { text } = extractDocxText(xml);
    expect(text).toBe('click here');
    expect(text).not.toContain('evil.example');
  });

  /**
   * Pretty-printed XML puts whitespace text nodes between elements. Treating
   * those as content produced a blank line after every paragraph.
   */
  it('ignores whitespace between elements', () => {
    const xml =
      '<w:body>\n  <w:p><w:r><w:t>one</w:t></w:r></w:p>\n  <w:p><w:r><w:t>two</w:t></w:r></w:p>\n</w:body>';

    expect(extractDocxText(xml).text).toBe('one\ntwo');
  });

  it('lays a table row out as one tab-separated line', () => {
    const xml =
      '<w:body><w:tbl><w:tr>' +
      '<w:tc><w:p><w:r><w:t>A1</w:t></w:r></w:p></w:tc>' +
      '<w:tc><w:p><w:r><w:t>B1</w:t></w:r></w:p></w:tc>' +
      '<w:tc><w:p><w:r><w:t>C1</w:t></w:r></w:p></w:tc>' +
      '</w:tr></w:tbl></w:body>';

    expect(extractDocxText(xml).text).toBe('A1\tB1\tC1');
  });

  it('returns nothing for an empty body rather than throwing', () => {
    expect(extractDocxText('<w:body></w:body>').text).toBe('');
  });
});

describe('extractSharedStrings', () => {
  it('reads each string, concatenating its runs', () => {
    const xml =
      '<sst><si><t>plain</t></si>' +
      '<si><r><t>split</t></r><r><t>Word</t></r></si></sst>';

    expect(extractSharedStrings(xml)).toEqual(['plain', 'splitWord']);
  });

  /**
   * An empty `<si>` still occupies its index. Skipping it shifts every later
   * index by one, so every cell after it shows the wrong string -- a failure
   * that looks like a data problem rather than a parser bug.
   */
  it('keeps an empty entry so later indices stay correct', () => {
    const xml = '<sst><si><t>a</t></si><si/><si><t>c</t></si></sst>';

    expect(extractSharedStrings(xml)).toEqual(['a', '', 'c']);
  });
});

describe('extractSheetText', () => {
  it('resolves a shared-string cell through the table', () => {
    const xml = '<sheetData><row><c t="s"><v>1</v></c><c><v>42</v></c></row></sheetData>';

    expect(extractSheetText(xml, ['zero', 'one']).text).toBe('one\t42');
  });

  it('reads an inline string', () => {
    const xml = '<sheetData><row><c t="inlineStr"><is><t>inline</t></is></c></row></sheetData>';

    expect(extractSheetText(xml, []).text).toBe('inline');
  });

  it('emits nothing for an out-of-range shared-string index', () => {
    const xml = '<sheetData><row><c t="s"><v>99</v></c></row></sheetData>';

    expect(extractSheetText(xml, ['only']).text).toBe('');
  });

  it('keeps an empty cell so the columns stay aligned', () => {
    const xml = '<sheetData><row><c><v>1</v></c><c/><c><v>3</v></c></row></sheetData>';

    expect(extractSheetText(xml, []).text).toBe('1\t\t3');
  });
});

describe('readOfficeDocument', () => {
  it('detects the format from the bytes, not from a filename', () => {
    expect(detectOfficeFormat(fixture('word-document.docx'))).toBe('docx');
    expect(detectOfficeFormat(fixture('excel-workbook.xlsx'))).toBe('xlsx');
    expect(detectOfficeFormat(Buffer.from('plain text'))).toBeNull();
  });

  it('reads a document written by Word tooling, tables included', () => {
    const document = readOfficeDocument(fixture('word-document.docx'));

    expect(document.format).toBe('docx');
    expect(document.text).toContain('The request timeout is 30 seconds.');
    // The split runs, and the table as rows rather than one cell per line.
    expect(document.text).toContain('resolveScope returns the scope.');
    expect(document.text).toContain('Name\tCode\tOwner');
    expect(document.text).toContain('quota\tERR_QUOTA_7734\tops');
  });

  it('reads every hazard in one pass', () => {
    const text = readOfficeDocument(fixture('word-hazards.docx')).text;

    expect(text).toContain('Hello world');
    expect(text).toContain('resolveScope(user)');
    expect(text).toContain('Line one\nLine two');
    expect(text).toContain('Tab\tseparated');
    expect(text).toContain('5 < 7 && "quoted"');
    expect(text).toContain('café مهلت');
    expect(text).toContain('A1\tB1');
    expect(text).not.toContain('evil.example');
  });

  it('reads a workbook, naming each sheet and resolving its strings', () => {
    const document = readOfficeDocument(fixture('excel-workbook.xlsx'));

    expect(document.format).toBe('xlsx');
    expect(document.sheets).toEqual(['Errors', 'Notes']);
    expect(document.text).toContain('# Errors');
    expect(document.text).toContain('ERR_QUOTA_7734\tquota rejected\t42');
    expect(document.text).toContain('# Notes');
    expect(document.text).toContain('café مهلت');
  });

  it('refuses a file that is not an office document', () => {
    expect(() => readOfficeDocument(Buffer.from('%PDF-1.7 not ooxml'))).toThrow(OfficeParseError);
  });

  it('refuses a zip that is not an office document', () => {
    const archive = buildArchive([
      { name: 'readme.txt', data: Buffer.from('hi'), method: 0, declaredSize: 2 },
    ]);

    expect(() => readOfficeDocument(archive)).toThrow(/not a readable/);
  });
});

/* ------------------------------------------------------------------ */
/* A hand-built archive, for the cases no real document contains.      */
/* ------------------------------------------------------------------ */

interface RawEntry {
  name: string;
  data: Buffer;
  method: number;
  declaredSize: number;
  /** Bytes of local-header extra field. The central directory gets none, which
   *  is the mismatch real archives have and a reader must respect. */
  localExtra?: number;
}

/**
 * Only used for malformed and hostile archives -- a zip bomb is not something
 * python-docx will produce on request. Every *well-formed* assertion above
 * runs against a fixture written by other people's code.
 */
function buildArchive(entries: readonly RawEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.method, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.declaredSize, 22);
    const localExtra = Buffer.alloc(entry.localExtra ?? 0, 0);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(localExtra.length, 28);
    locals.push(local, name, localExtra, entry.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(entry.method, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.declaredSize, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + localExtra.length + entry.data.length;
  }

  const directory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, directory, eocd]);
}
