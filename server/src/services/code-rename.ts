import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  findReferences,
  isValidSymbolName,
  type CodeReference,
  type ReferenceContext,
} from './code-references.js';
import { buildCodeIndex, type CodeSymbol } from './code-index.js';
import { hashContent, type FileEdit } from './atomic-write.js';

/**
 * Turning "rename this symbol" into an exact, auditable set of edits.
 *
 * The hard part is not rewriting text. It is deciding which occurrences are
 * the symbol. `code-references.ts` classifies each one as code, string,
 * comment, import or declaration, and that classification is the answer —
 * measured on this repository, `redactToken` has 7 code references against 28
 * inside string literals. Rewriting all 35 corrupts strings; rewriting 7
 * leaves documentation lying. Neither is right without being told, so the
 * caller chooses which contexts to include and the choice is recorded.
 *
 * Everything here is pure computation over file contents. Nothing is written:
 * the preview is what a human or a model approves, and `agent-tools-rename.ts`
 * hands the resulting edits to `writeFilesAtomically`.
 */

/** Contexts a rename may be asked to rewrite. Declarations are always included. */
export const RENAMEABLE_CONTEXTS: readonly ReferenceContext[] = [
  'code',
  'declaration',
  'string',
  'comment',
];

/** What a rename would do to one line. */
export interface RenameEdit {
  path: string;
  line: number;
  column: number;
  context: ReferenceContext;
  before: string;
  after: string;
}

export interface RenamePreview {
  symbol: string;
  newName: string;
  edits: RenameEdit[];
  /** Contexts the caller asked to rewrite. */
  included: ReferenceContext[];
  /** Matches deliberately left alone, so the caller sees what is not fixed. */
  excluded: { context: ReferenceContext; count: number }[];
  files: string[];
  confidence: 'exact' | 'approximate';
  confidenceReason: string;
  /**
   * Covers the edit set AND the current bytes of every file it touches.
   *
   * The second half is the point. Between preview and apply a test run or
   * another tool may rewrite a file, and an edit list that still *looks*
   * right against changed content is precisely the dangerous case. Hashing
   * only the edits would miss it.
   */
  digest: string;
  /** Present when the rename must not proceed, with the reason. */
  refusal?: string;
}

/** A collision means the new name already exists where the rename would land. */
export interface Collision {
  path: string;
  line: number;
  kind: string;
}

function replaceAt(line: string, column: number, oldName: string, newName: string): string {
  const index = column - 1;
  return line.slice(0, index) + newName + line.slice(index + oldName.length);
}

/**
 * Apply a file's edits to its content.
 *
 * Right-to-left within each line, so an earlier replacement cannot shift the
 * column of a later one. Two occurrences of the same symbol on one line is
 * ordinary (`foo(foo)`), and left-to-right silently corrupts the second.
 *
 * The old and new names are passed in rather than carried on the edit. A
 * first draft kept them in a WeakMap keyed by the edit object, which worked
 * in-process and would have broken the moment an edit set made a round trip
 * through JSON -- which is exactly what happens between the preview tool and
 * the apply tool.
 */
export function applyEditsToContent(
  content: string,
  edits: readonly RenameEdit[],
  oldName: string,
  newName: string,
): string {
  const lines = content.split('\n');
  const byLine = new Map<number, RenameEdit[]>();
  for (const edit of edits) {
    const list = byLine.get(edit.line) ?? [];
    list.push(edit);
    byLine.set(edit.line, list);
  }

  for (const [lineNumber, lineEdits] of byLine) {
    const index = lineNumber - 1;
    if (index < 0 || index >= lines.length) continue;
    let text = lines[index]!;
    for (const edit of [...lineEdits].sort((a, b) => b.column - a.column)) {
      // Verified before substituting: if the text at that column is not the
      // symbol, the file moved and rewriting blind would corrupt it.
      if (text.slice(edit.column - 1, edit.column - 1 + oldName.length) !== oldName) continue;
      text = replaceAt(text, edit.column, oldName, newName);
    }
    lines[index] = text;
  }

  return lines.join('\n');
}

export interface BuildPreviewOptions {
  root: string;
  symbol: string;
  newName: string;
  /** Defaults to code and declaration only: the conservative choice. */
  include?: readonly ReferenceContext[];
}

/**
 * Compute what a rename would do, without doing it.
 *
 * Returns a preview carrying `refusal` rather than throwing, for anything the
 * caller could reasonably fix by choosing different arguments. A thrown error
 * is reserved for "this input makes no sense".
 */
export async function buildRenamePreview(
  options: BuildPreviewOptions,
): Promise<RenamePreview> {
  const { root, symbol, newName } = options;
  const included = [...(options.include ?? ['code', 'declaration'])];

  const base: Omit<RenamePreview, 'digest'> = {
    symbol,
    newName,
    edits: [],
    included,
    excluded: [],
    files: [],
    confidence: 'approximate',
    confidenceReason: '',
  };

  if (!isValidSymbolName(symbol)) {
    return { ...base, digest: '', refusal: `"${symbol}" is not a valid identifier.` };
  }
  if (!isValidSymbolName(newName)) {
    return { ...base, digest: '', refusal: `"${newName}" is not a valid identifier.` };
  }
  if (symbol === newName) {
    return { ...base, digest: '', refusal: 'the new name is the same as the old one.' };
  }

  const index = await buildCodeIndex(root);
  const declarations = index.symbols.filter((s) => s.name === symbol);
  const report = await findReferences(root, symbol, declarations);

  const wanted = new Set(included);
  const kept: CodeReference[] = [];
  const skippedCounts = new Map<ReferenceContext, number>();
  for (const reference of report.references) {
    if (wanted.has(reference.context)) kept.push(reference);
    else skippedCounts.set(reference.context, (skippedCounts.get(reference.context) ?? 0) + 1);
  }

  const excluded = [...skippedCounts.entries()].map(([context, count]) => ({ context, count }));

  if (kept.length === 0) {
    return {
      ...base,
      excluded,
      confidence: report.confidence,
      confidenceReason: report.confidenceReason,
      digest: '',
      refusal:
        `no ${included.join('/')} references to "${symbol}" were found. ` +
        'Renaming nothing is not a successful rename.',
    };
  }

  // Collisions are checked against the index that is already built, so this
  // costs nothing extra. A rename onto an existing declaration is a compile
  // error at best and a silent behaviour change at worst.
  const collisions = findCollisions(index.symbols, newName, kept);

  const edits: RenameEdit[] = [];
  const fileContents = new Map<string, string>();
  for (const reference of kept) {
    const absolute = path.join(root, reference.path);
    let content = fileContents.get(absolute);
    if (content === undefined) {
      const read = await fs.readFile(absolute, 'utf8').catch(() => null);
      if (read === null) continue;
      content = read;
      fileContents.set(absolute, content);
    }
    const line = content.split('\n')[reference.line - 1];
    if (line === undefined) continue;
    // The reference was located against this exact content, so a mismatch
    // here means the file changed underneath the scan. Skipping is right:
    // the digest will fail at apply time and the caller re-previews.
    if (line.slice(reference.column - 1, reference.column - 1 + symbol.length) !== symbol) {
      continue;
    }

    const edit: RenameEdit = {
      path: reference.path,
      line: reference.line,
      column: reference.column,
      context: reference.context,
      before: line.trim().slice(0, 200),
      after: replaceAt(line, reference.column, symbol, newName).trim().slice(0, 200),
    };
    edits.push(edit);
  }

  const files = [...new Set(edits.map((e) => e.path))].sort();
  const digest = computeDigest(symbol, newName, edits, files, fileContents, root);

  const preview: RenamePreview = {
    symbol,
    newName,
    edits,
    included,
    excluded,
    files,
    confidence: report.confidence,
    confidenceReason: report.confidenceReason,
    digest,
  };

  if (collisions.length > 0) {
    preview.refusal =
      `"${newName}" is already declared in ${collisions
        .map((c) => `${c.path}:${c.line}`)
        .slice(0, 3)
        .join(', ')}; renaming would shadow it.`;
  }

  return preview;
}

/** Declarations of the new name in any file the rename would touch. */
function findCollisions(
  symbols: readonly CodeSymbol[],
  newName: string,
  references: readonly CodeReference[],
): Collision[] {
  const touched = new Set(references.map((r) => r.path));
  return symbols
    .filter((s) => s.name === newName && touched.has(s.path))
    .map((s) => ({ path: s.path, line: s.line, kind: s.kind }));
}

function computeDigest(
  symbol: string,
  newName: string,
  edits: readonly RenameEdit[],
  files: readonly string[],
  contents: Map<string, string>,
  root: string,
): string {
  const hash = crypto.createHash('sha256');
  hash.update(`${symbol}->${newName}\n`);
  for (const edit of edits) {
    hash.update(`${edit.path}:${edit.line}:${edit.column}:${edit.context}\n`);
  }
  // The pre-edit content of every touched file, which is what makes the
  // digest detect a concurrent write rather than only a changed plan.
  for (const file of files) {
    const content = contents.get(path.join(root, file));
    if (content !== undefined) hash.update(`${file}:${hashContent(content)}\n`);
  }
  return hash.digest('hex');
}

/**
 * Turn a preview into the edit set `writeFilesAtomically` consumes.
 *
 * Each edit carries the hash of the content it was computed against, so the
 * write refuses if anything moved underneath it.
 */
export async function previewToFileEdits(
  root: string,
  preview: RenamePreview,
): Promise<FileEdit[]> {
  const byFile = new Map<string, RenameEdit[]>();
  for (const edit of preview.edits) {
    const list = byFile.get(edit.path) ?? [];
    list.push(edit);
    byFile.set(edit.path, list);
  }

  const out: FileEdit[] = [];
  for (const [relative, edits] of byFile) {
    const absolute = path.join(root, relative);
    const content = await fs.readFile(absolute, 'utf8');
    out.push({
      path: absolute,
      content: applyEditsToContent(content, edits, preview.symbol, preview.newName),
      expectedHash: hashContent(content),
    });
  }
  return out;
}
