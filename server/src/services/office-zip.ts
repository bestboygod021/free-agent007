/**
 * A minimal, defensive ZIP reader — enough to open an OOXML file and no more.
 *
 * DOCX and XLSX are zip archives of XML, and Node ships `zlib`, so reading
 * them needs no dependency. Verified absent from the lockfile before writing
 * this: `pdf-parse`, `pdfjs-dist`, `mammoth`, `docx`, `xlsx`, `exceljs`,
 * `unzipper`, `adm-zip` and `jszip` all fail to resolve.
 *
 * This reads the **central directory**, not the stream of local file headers.
 * The two disagree in real archives: a local header may carry zeroed sizes
 * with the real ones in a trailing data descriptor, and a crafted archive can
 * hide an entry from a local-header scan while the central directory lists it.
 * The central directory is the authoritative index, which is why every ZIP
 * implementation that got this wrong grew a CVE.
 *
 * Everything here is bounded. A zip is a compressed format handed to us by a
 * user, so a 40 KB upload can decompress to gigabytes. Each entry is checked
 * against its declared uncompressed size, the declared size is checked against
 * a ceiling before any memory is allocated, and the total across the archive
 * is capped as well.
 */

import zlib from 'node:zlib';

/** Largest archive this will look at. */
export const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;

/** Largest single entry, decompressed. */
export const MAX_ENTRY_BYTES = 16 * 1024 * 1024;

/** Largest total decompressed across every entry read from one archive. */
export const MAX_TOTAL_BYTES = 48 * 1024 * 1024;

/** Most entries considered. A zip bomb can be a million empty files. */
export const MAX_ENTRIES = 4096;

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
const SIG_ZIP64_EOCD = 0x06064b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

export interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

/**
 * Locate the End Of Central Directory record.
 *
 * It is at the end of the file, but a zip comment of up to 65535 bytes may
 * follow it, so it has to be searched for backwards. Searching forwards would
 * find the signature inside compressed data of some other entry.
 */
function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimum = 22;
  if (buffer.length < minimum) throw new ZipError('not a zip archive: too short');

  const earliest = Math.max(0, buffer.length - minimum - 0xffff);
  for (let offset = buffer.length - minimum; offset >= earliest; offset -= 1) {
    if (buffer.readUInt32LE(offset) === SIG_EOCD) return offset;
  }
  throw new ZipError('not a zip archive: no end-of-central-directory record');
}

/**
 * Reject ZIP64 rather than mis-read it.
 *
 * A ZIP64 archive stores the real offsets in a separate record and leaves
 * 0xffffffff sentinels in the classic fields. Parsing those sentinels as
 * numbers yields an offset of four gigabytes into a file that is not that
 * long, so the failure is confusing rather than clean. Refusing is honest:
 * nothing this reader is for — a document under 32 MB — is ever ZIP64.
 */
function rejectZip64(buffer: Buffer, eocd: number): void {
  const locator = eocd - 20;
  if (locator >= 0 && buffer.readUInt32LE(locator) === SIG_ZIP64_LOCATOR) {
    throw new ZipError('zip64 archives are not supported');
  }
  if (
    buffer.readUInt16LE(eocd + 10) === 0xffff ||
    buffer.readUInt32LE(eocd + 12) === 0xffffffff ||
    buffer.readUInt32LE(eocd + 16) === 0xffffffff
  ) {
    throw new ZipError('zip64 archives are not supported');
  }
  if (buffer.indexOf(Buffer.from([0x50, 0x4b, 0x06, 0x06])) >= 0) {
    const found = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x06, 0x06]));
    if (buffer.readUInt32LE(found) === SIG_ZIP64_EOCD) {
      throw new ZipError('zip64 archives are not supported');
    }
  }
}

/** Read the central directory. Does not decompress anything. */
export function readZipEntries(buffer: Buffer): ZipEntry[] {
  if (buffer.length > MAX_ARCHIVE_BYTES) {
    throw new ZipError(`archive exceeds ${MAX_ARCHIVE_BYTES} bytes`);
  }

  const eocd = findEndOfCentralDirectory(buffer);
  rejectZip64(buffer, eocd);

  const count = buffer.readUInt16LE(eocd + 10);
  const directorySize = buffer.readUInt32LE(eocd + 12);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);

  if (count > MAX_ENTRIES) throw new ZipError(`archive has more than ${MAX_ENTRIES} entries`);
  if (directoryOffset + directorySize > buffer.length) {
    throw new ZipError('central directory runs past the end of the archive');
  }

  const entries: ZipEntry[] = [];
  let cursor = directoryOffset;

  for (let i = 0; i < count; i += 1) {
    if (cursor + 46 > buffer.length) throw new ZipError('truncated central directory');
    if (buffer.readUInt32LE(cursor) !== SIG_CENTRAL) {
      throw new ZipError('corrupt central directory entry');
    }

    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);

    const nameStart = cursor + 46;
    if (nameStart + nameLength > buffer.length) throw new ZipError('truncated entry name');
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');

    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    cursor = nameStart + nameLength + extraLength + commentLength;
  }

  return entries;
}

/**
 * Decompress one entry.
 *
 * `budget` is the caller's running total across the archive, so a set of
 * individually-legal entries cannot add up to an illegal one.
 */
export function readZipEntry(
  buffer: Buffer,
  entry: ZipEntry,
  budget: { used: number } = { used: 0 },
): Buffer {
  // Checked before allocating anything: the declared size is attacker-chosen,
  // and allocating first is how a 40 KB upload becomes an OOM.
  if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
    throw new ZipError(`entry "${entry.name}" declares more than ${MAX_ENTRY_BYTES} bytes`);
  }
  if (budget.used + entry.uncompressedSize > MAX_TOTAL_BYTES) {
    throw new ZipError('archive decompresses to more than the total budget');
  }

  const header = entry.localHeaderOffset;
  if (header + 30 > buffer.length) throw new ZipError(`entry "${entry.name}" has no local header`);
  if (buffer.readUInt32LE(header) !== SIG_LOCAL) {
    throw new ZipError(`entry "${entry.name}" has a corrupt local header`);
  }

  // The local header's own name and extra lengths, not the central
  // directory's: the extra field routinely differs between the two, and using
  // the central directory's length here lands the read mid-data.
  const nameLength = buffer.readUInt16LE(header + 26);
  const extraLength = buffer.readUInt16LE(header + 28);
  const dataStart = header + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buffer.length) throw new ZipError(`entry "${entry.name}" runs past the archive`);

  const compressed = buffer.subarray(dataStart, dataEnd);

  let output: Buffer;
  if (entry.compressionMethod === METHOD_STORED) {
    output = Buffer.from(compressed);
  } else if (entry.compressionMethod === METHOD_DEFLATE) {
    try {
      // maxOutputLength makes zlib itself stop, so a lying uncompressedSize
      // cannot expand past the ceiling before anyone checks it afterwards.
      output = zlib.inflateRawSync(compressed, { maxOutputLength: MAX_ENTRY_BYTES });
    } catch (err) {
      // zlib raises a RangeError for the size ceiling and a generic Error for
      // corrupt input. Letting either escape means a hostile upload throws
      // something the caller is not catching, and "Cannot create a Buffer
      // larger than..." tells an operator nothing about which file did it.
      throw new ZipError(
        `entry "${entry.name}" could not be inflated: ${
          err instanceof Error ? err.message : 'corrupt deflate stream'
        }`,
      );
    }
  } else {
    throw new ZipError(
      `entry "${entry.name}" uses unsupported compression method ${entry.compressionMethod}`,
    );
  }

  // The declared size is a claim; this is the measurement. They disagree in a
  // zip bomb, and the bomb is the case that matters.
  if (output.length > MAX_ENTRY_BYTES) {
    throw new ZipError(`entry "${entry.name}" expands past ${MAX_ENTRY_BYTES} bytes`);
  }
  budget.used += output.length;
  if (budget.used > MAX_TOTAL_BYTES) {
    throw new ZipError('archive decompresses to more than the total budget');
  }

  return output;
}

/**
 * Find one entry by exact name.
 *
 * Exact, because OOXML part names are fixed by the spec. A prefix or suffix
 * match would let `evil/word/document.xml` stand in for `word/document.xml`.
 */
export function findZipEntry(entries: readonly ZipEntry[], name: string): ZipEntry | null {
  return entries.find((entry) => entry.name === name) ?? null;
}
