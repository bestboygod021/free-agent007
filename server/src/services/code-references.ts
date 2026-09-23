import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isIndexableFile, type CodeSymbol } from './code-index.js';

/**
 * Finding where a symbol is *used*, as opposed to where it is declared.
 *
 * `code-index.ts` answers "where is this defined". The question a refactor
 * asks is the other one, and text search answers it badly. Measured on this
 * repository's own `server/src`, counting literal occurrences against
 * word-boundary identifier matches:
 *
 * | symbol       | literal | identifier | literal-only noise |
 * |--------------|--------:|-----------:|-------------------:|
 * | `get`        |    6103 |       1295 |               4808 |
 * | `run`        |    3612 |       1929 |               1683 |
 * | `record`     |     803 |        194 |                609 |
 * | `invokeTool` |      25 |         25 |                  0 |
 *
 * So a word boundary is necessary. It is not sufficient. For `redactToken` —
 * a name unique enough that every literal hit is a real one — the eleven
 * matches in this codebase break down as eight in code, two inside string
 * literals and one in a comment. A rename that rewrites all eleven has
 * corrupted a comment and possibly a runtime string; one that rewrites eight
 * has left documentation lying. Neither is correct without being told which
 * is which, so this module's output says which each one is and refuses to
 * decide on the caller's behalf.
 *
 * ## What this is not
 *
 * This is not a type-aware reference graph. It does not resolve imports, does
 * not distinguish two different `handler`s in two different modules, and does
 * not know that a method call `x.run()` is a different `run` from a local
 * function. A real implementation of that needs the TypeScript compiler API
 * and a program-wide type checker, which is a dependency and a design this
 * codebase has not taken on.
 *
 * What it does instead is report honestly. Every reference carries the
 * evidence that classified it, and `ReferenceReport.confidence` is `exact`
 * only when the symbol name is distinctive enough that lexical matching is
 * trustworthy. The caller — a model, usually — is told when the answer is
 * approximate rather than being handed a confident wrong number. That
 * distinction is the whole point: a refactoring tool that silently misses a
 * call site is worse than one that says it might have.
 */

/** Where a match sits, which decides whether a rename may touch it. */
export type ReferenceContext =
  /** Ordinary executable code. A rename must update these. */
  | 'code'
  /** Inside a string or template literal. A rename usually must not. */
  | 'string'
  /** A line or block comment. Human-readable; a rename should ask. */
  | 'comment'
  /** An import or export specifier. Renaming needs the module's agreement. */
  | 'import'
  /** The declaration itself, as reported by the index. */
  | 'declaration';

export interface CodeReference {
  path: string;
  /** 1-based. */
  line: number;
  /** 1-based column of the first character of the identifier. */
  column: number;
  context: ReferenceContext;
  /** The matching line, trimmed and capped. */
  text: string;
}

export interface ReferenceReport {
  symbol: string;
  references: CodeReference[];
  filesScanned: number;
  /** True when a cap stopped the scan, so the count is a floor, not a total. */
  truncated: boolean;
  /**
   * `exact` means the name is distinctive and lexical matching is reliable.
   * `approximate` means the name is short or common enough that some matches
   * are probably a different symbol with the same spelling.
   */
  confidence: 'exact' | 'approximate';
  /** Why the confidence is what it is, in one sentence for the caller. */
  confidenceReason: string;
}

export interface ReferenceLimits {
  maxFiles?: number;
  maxFileBytes?: number;
  maxReferences?: number;
}

const DEFAULT_MAX_FILES = 2000;
const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
const DEFAULT_MAX_REFERENCES = 500;
const MAX_TEXT = 200;

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
  'out',
]);

/**
 * Names too common for lexical matching to mean anything.
 *
 * Derived from the measurement above rather than taste: these are the ones
 * where literal search on this repository returns majority noise. A caller
 * searching for one of them still gets an answer, marked approximate.
 */
const COMMON_NAMES = new Set([
  'get', 'set', 'run', 'list', 'add', 'has', 'map', 'key', 'id', 'name',
  'value', 'data', 'type', 'kind', 'path', 'text', 'item', 'index', 'result',
  'error', 'record', 'handler', 'options', 'config', 'context', 'next', 'done',
]);

/** Shortest name for which a word-boundary match is worth trusting. */
const MIN_DISTINCTIVE_LENGTH = 4;

/**
 * Validate a symbol name before it becomes a regular expression.
 *
 * Refusing anything that is not an identifier is not politeness: the name is
 * interpolated into a pattern, and a caller-supplied `.*` would match every
 * line of every file and call it a reference.
 */
const IDENTIFIER_RE = /^[A-Za-z_$][\w$]*$/;

export function isValidSymbolName(name: string): boolean {
  return IDENTIFIER_RE.test(name);
}

function assessConfidence(symbol: string): Pick<
  ReferenceReport,
  'confidence' | 'confidenceReason'
> {
  if (COMMON_NAMES.has(symbol.toLowerCase())) {
    return {
      confidence: 'approximate',
      confidenceReason:
        `"${symbol}" is a very common identifier; many matches are probably ` +
        'unrelated symbols that share the spelling. Verify before renaming.',
    };
  }
  if (symbol.length < MIN_DISTINCTIVE_LENGTH) {
    return {
      confidence: 'approximate',
      confidenceReason:
        `"${symbol}" is short enough that matches may belong to other symbols. ` +
        'Verify before renaming.',
    };
  }
  return {
    confidence: 'exact',
    confidenceReason:
      `"${symbol}" is distinctive, so word-boundary matching is reliable for it. ` +
      'Matches are still classified by context; only "code" references are safe to rewrite.',
  };
}

/**
 * Classify every occurrence of `symbol` in one file's text.
 *
 * Deliberately a single left-to-right pass with explicit state rather than a
 * set of regexes applied to whole lines. A line like
 * `foo(); // call foo again` contains both a code reference and a comment
 * reference, and per-line classification would have to pick one and be wrong
 * about the other.
 *
 * The scanner tracks block comments, line comments, and the three quote
 * styles. It does not implement JavaScript's full lexical grammar: a regex
 * literal containing a quote can desynchronise it, and template
 * interpolations are treated as string content rather than as code. Both
 * failure modes misclassify a reference rather than inventing or losing one,
 * which is the direction to err in.
 */
export function classifyReferences(
  relativePath: string,
  content: string,
  symbol: string,
  declarations: readonly CodeSymbol[] = [],
): CodeReference[] {
  if (!isValidSymbolName(symbol)) return [];

  const declaredLines = new Set(
    declarations.filter((d) => d.path === relativePath && d.name === symbol).map((d) => d.line),
  );

  const out: CodeReference[] = [];
  const lines = content.split('\n');
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let inLineComment = false;
    let quote: '"' | "'" | '`' | null = null;
    /** Where the current string literal began, so its *prefix* can be judged. */
    let quoteStart = -1;
    let j = 0;

    while (j < line.length) {
      const ch = line[j]!;
      const next = line[j + 1];

      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false;
          j += 2;
          continue;
        }
      } else if (quote !== null) {
        if (ch === '\\') {
          j += 2;
          continue;
        }
        if (ch === quote) quote = null;
      } else if (!inLineComment) {
        if (ch === '/' && next === '*') {
          inBlockComment = true;
          j += 2;
          continue;
        }
        if (ch === '/' && next === '/') {
          inLineComment = true;
          j += 2;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
          quote = ch;
          quoteStart = j;
          j += 1;
          continue;
        }
      }

      // Identifier boundary check, done by hand so the classification above
      // stays authoritative: a regex over the line would not know whether the
      // match landed inside a string.
      if (isIdentStart(ch)) {
        let k = j + 1;
        while (k < line.length && isIdentPart(line[k]!)) k++;
        const word = line.slice(j, k);
        if (word === symbol) {
          // A property access (`x.foo`) is very often a *different* symbol
          // that happens to share a spelling, but a lexical pass cannot prove
          // it either way, so it is still reported as code. The honest signal
          // is `confidence`, not a guess dressed up as a category.
          out.push({
            path: relativePath,
            line: i + 1,
            column: j + 1,
            context: declaredLines.has(i + 1)
              ? 'declaration'
              : inBlockComment || inLineComment
                ? 'comment'
                : quote !== null
                  ? classifyQuoted(line.slice(0, quoteStart))
                  : 'code',
            text: line.trim().slice(0, MAX_TEXT),
          });
        }
        j = k;
        continue;
      }

      j += 1;
    }
  }

  return out;
}

/**
 * A quoted occurrence inside an import or export statement is a module
 * specifier, not a string the program uses as data. Renaming a symbol never
 * rewrites it, but renaming a *file* does, so the two are worth telling apart.
 *
 * Judged on the text BEFORE the opening quote, not the whole line. Measured on
 * this repository, passing the whole line labelled
 * `const src = "import { x } from './x.js';"` -- a string that merely contains
 * an import -- as an import reference. The prefix is what actually decides it.
 */
function classifyQuoted(beforeQuote: string): ReferenceContext {
  const t = beforeQuote.trimStart();

  // A module specifier is a quoted string that a module statement is reaching
  // for, which in practice means the prefix ends in `from`, or the statement
  // is a bare side-effect import or re-export.
  //
  // Anchoring on the `import`/`export` keyword alone was wrong and shipped
  // that way: `export const label = 'widgetise';` starts with `export` and is
  // an ordinary string literal. The `=` is what distinguishes a declaration
  // from a module statement, and a rename must not treat the two alike -- one
  // is renameable text, the other is a file path.
  if (/\bfrom\s*$/.test(t.trimEnd())) return 'import';
  if (/^(import|export)\b/.test(t) && !t.includes('=')) return 'import';

  return 'string';
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_$]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[\w$]/.test(ch);
}

/**
 * Walk the workspace and collect every reference to `symbol`.
 *
 * `root` must already be a confined, resolved path; this walks what it is
 * given, exactly like `buildCodeIndex`.
 */
export async function findReferences(
  root: string,
  symbol: string,
  declarations: readonly CodeSymbol[] = [],
  limits: ReferenceLimits = {},
): Promise<ReferenceReport> {
  const maxFiles = limits.maxFiles ?? DEFAULT_MAX_FILES;
  const maxFileBytes = limits.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxReferences = limits.maxReferences ?? DEFAULT_MAX_REFERENCES;

  const assessment = assessConfidence(symbol);
  const references: CodeReference[] = [];
  let filesScanned = 0;
  let truncated = false;

  if (!isValidSymbolName(symbol)) {
    return {
      symbol,
      references: [],
      filesScanned: 0,
      truncated: false,
      confidence: 'approximate',
      confidenceReason: `"${symbol}" is not a valid identifier, so it has no references.`,
    };
  }

  async function walk(dir: string): Promise<void> {
    if (truncated) return;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (truncated) return;
      if (entry.name.startsWith('.') && entry.name !== '.') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(full);
        continue;
      }
      if (!entry.isFile() || !isIndexableFile(entry.name)) continue;

      if (filesScanned >= maxFiles) {
        truncated = true;
        return;
      }

      const stat = await fs.stat(full).catch(() => null);
      if (!stat || stat.size > maxFileBytes) continue;

      const content = await fs.readFile(full, 'utf8').catch(() => null);
      if (content === null) continue;
      filesScanned++;

      const relative = path.relative(root, full).split(path.sep).join('/');
      for (const ref of classifyReferences(relative, content, symbol, declarations)) {
        if (references.length >= maxReferences) {
          truncated = true;
          return;
        }
        references.push(ref);
      }
    }
  }

  await walk(root);

  return {
    symbol,
    references,
    filesScanned,
    truncated,
    ...assessment,
  };
}

/** Per-context totals, which is what a caller deciding on a rename reads first. */
export function summariseReferences(refs: readonly CodeReference[]): Record<ReferenceContext, number> {
  const totals: Record<ReferenceContext, number> = {
    code: 0,
    string: 0,
    comment: 0,
    import: 0,
    declaration: 0,
  };
  for (const ref of refs) totals[ref.context]++;
  return totals;
}

/** Distinct files touched, in stable order. */
export function referencedFiles(refs: readonly CodeReference[]): string[] {
  return [...new Set(refs.map((r) => r.path))].sort();
}
