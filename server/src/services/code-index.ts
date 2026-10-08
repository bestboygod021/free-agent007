import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isSensitivePath } from '@freellmapi/agent/core/redaction.js';
import { SKIP_DIRS } from './agent-tools-builtin.js';

/**
 * A map of where things are defined, so an agent can navigate a codebase by
 * name instead of by guessing.
 *
 * The tools that existed before this could read a file you already knew the
 * name of, or grep for a literal string. Neither answers the question a coding
 * task actually starts with — "where is `resolveScope` defined?" — so a run
 * would grep, get forty hits from call sites and comments, and read whole
 * files to find the one line that mattered. That is slow, and it burns the
 * context window on text nobody needed.
 *
 * ## Why this parses instead of grepping
 *
 * Searching for `function foo` finds the definition and also every mention of
 * it in a comment or a string. Searching for `foo` finds every *use*. The
 * distinction between defining and mentioning is syntactic, so the extractor
 * has to do at least a little parsing to be worth anything.
 *
 * ## Why it does not use the TypeScript compiler
 *
 * `typescript` is in the lockfile, and `ts.createSourceFile` would give a real
 * AST for the TS and JS files here. It is a **devDependency**: a production
 * install (`npm ci --omit=dev`) does not have it, so importing it at runtime
 * would turn a working deployment into a crash at startup. A feature that only
 * works on developer machines is worse than one that works everywhere with
 * blunter rules, so this is a small hand-written scanner with no dependencies.
 *
 * What that costs is real and worth stating plainly: this recognises
 * *declaration forms*, not semantics. It will not resolve a re-export, will
 * not follow a type alias, and will miss a symbol built dynamically. What it
 * gets right is the common case — a named declaration at a readable position
 * in a file — which is what navigation needs.
 *
 * ## Why it is not stored in the database
 *
 * An index is a cache of the working tree, and a stale index is actively
 * misleading: it sends the agent to a line number that has moved. The tree is
 * the source of truth and is sitting right there, so the index is built on
 * demand, bounded, and thrown away. There is no invalidation problem because
 * there is nothing to invalidate.
 */

/** Kinds of definition the scanner recognises. */
export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'const'
  | 'method';

export interface CodeSymbol {
  name: string;
  kind: SymbolKind;
  /** Path relative to the workspace root, POSIX-separated. */
  path: string;
  /** 1-based line of the declaration. */
  line: number;
  /** Whether the declaration carries an `export` keyword. */
  exported: boolean;
  /** The declaration line itself, trimmed — enough to read the signature. */
  signature: string;
}

export interface IndexLimits {
  maxFiles?: number;
  maxFileBytes?: number;
  maxSymbols?: number;
}

export interface CodeIndex {
  symbols: CodeSymbol[];
  filesScanned: number;
  /** True when a limit stopped the scan early, so callers can say so. */
  truncated: boolean;
}

const DEFAULT_MAX_FILES = 2000;
const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
const DEFAULT_MAX_SYMBOLS = 5000;

/** Extensions the scanner understands. Anything else is not opened at all. */
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

export function isIndexableFile(name: string): boolean {
  if (isSensitivePath(name)) return false;
  if (name.endsWith('.d.ts')) return false;
  return CODE_EXTENSIONS.has(path.extname(name));
}

/**
 * Declaration patterns, tried in order against a single line.
 *
 * Anchored at the start (after optional `export`/`default`/`declare`) so a
 * *mention* of a name mid-line cannot register as a definition. `async`,
 * generators and generics are tolerated because they are common, not because
 * the scanner understands them.
 */
const PATTERNS: readonly { re: RegExp; kind: SymbolKind }[] = [
  { re: /^(export\s+)?(default\s+)?(declare\s+)?(async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/, kind: 'function' },
  { re: /^(export\s+)?(default\s+)?(declare\s+)?(abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, kind: 'class' },
  { re: /^(export\s+)?(declare\s+)?interface\s+([A-Za-z_$][\w$]*)/, kind: 'interface' },
  { re: /^(export\s+)?(declare\s+)?type\s+([A-Za-z_$][\w$]*)\s*[=<]/, kind: 'type' },
  { re: /^(export\s+)?(declare\s+)?(const\s+)?enum\s+([A-Za-z_$][\w$]*)/, kind: 'enum' },
  // `const foo = (a) => …` and `const foo = function …`: an arrow or function
  // expression bound to a name is a definition in every practical sense.
  {
    re: /^(export\s+)?(declare\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*(?::[^=]*)?=>|[A-Za-z_$][\w$]*\s*=>)/,
    kind: 'function',
  },
  // A plain exported constant. Only when exported: a local `const x = 1` is
  // noise, but an exported one is part of a module's surface.
  { re: /^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/, kind: 'const' },
];

/** Words that look like a method but are control flow. */
const NOT_METHODS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'constructor',
  'do', 'else', 'try', 'typeof', 'await', 'new', 'delete', 'yield', 'case',
]);

/**
 * A class method: `  foo(a: string): void {`.
 *
 * Indentation is required, which is what separates a method from a bare call
 * at the top level. This is the loosest rule here and the one most likely to
 * be wrong on unusual formatting; it earns its place because "where is this
 * method" is such a common question.
 */
const METHOD_RE =
  /^[ \t]+(?:(?:public|private|protected|static|readonly|async|override)\s+)*\*?\s*([A-Za-z_$][\w$]*)\s*(?:<[^>(]*>)?\s*\([^)]*\)\s*(?::\s*[^{;]+)?\s*\{/;

/**
 * Extract declarations from one file's text.
 *
 * Line-oriented on purpose: a declaration's *name* is nearly always on the
 * same line as its keyword, and working line by line means a file that fails
 * to parse under any grammar still yields its readable parts.
 */
export function extractSymbols(relativePath: string, content: string): CodeSymbol[] {
  const out: CodeSymbol[] = [];
  const lines = content.split('\n');
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const trimmed = raw.trim();

    // Comment tracking, so a commented-out function is not indexed as real
    // code. Cheap and approximate: a `/*` inside a string literal will fool
    // it, and the cost of that is a missed symbol, not a wrong one.
    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlockComment = true;
      continue;
    }
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

    let matched = false;
    for (const { re, kind } of PATTERNS) {
      const m = re.exec(trimmed);
      if (!m) continue;
      // The name is the last captured group that is defined.
      const name = m.slice(1).filter((g) => g !== undefined).pop();
      if (!name || NOT_METHODS.has(name)) continue;
      out.push({
        name,
        kind,
        path: relativePath,
        line: i + 1,
        exported: trimmed.startsWith('export'),
        signature: trimmed.slice(0, 200),
      });
      matched = true;
      break;
    }
    if (matched) continue;

    const method = METHOD_RE.exec(raw);
    if (method) {
      const name = method[1]!;
      if (NOT_METHODS.has(name)) continue;
      out.push({
        name,
        kind: 'method',
        path: relativePath,
        line: i + 1,
        exported: false,
        signature: trimmed.slice(0, 200),
      });
    }
  }

  return out;
}

/**
 * Walk the workspace and index every code file under it.
 *
 * `root` must already be a confined, resolved path — this walks what it is
 * given. Directories in `SKIP_DIRS` are not entered, which is both a
 * performance rule and a correctness one: `node_modules` would swamp the
 * result with symbols nobody asked about.
 */
export async function buildCodeIndex(
  root: string,
  limits: IndexLimits = {},
): Promise<CodeIndex> {
  const maxFiles = limits.maxFiles ?? DEFAULT_MAX_FILES;
  const maxFileBytes = limits.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxSymbols = limits.maxSymbols ?? DEFAULT_MAX_SYMBOLS;

  const symbols: CodeSymbol[] = [];
  let filesScanned = 0;
  let truncated = false;

  async function walk(dir: string): Promise<void> {
    if (truncated) return;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    // Stable order so the same tree always produces the same index; a result
    // that reshuffles between calls is miserable to debug.
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (truncated) return;
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        await walk(full);
        continue;
      }
      // Symlinks are not followed: the target may be outside the workspace,
      // and the confinement guarantee is easier to keep by not chasing them.
      if (!entry.isFile()) continue;
      if (!isIndexableFile(entry.name)) continue;

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
      for (const sym of extractSymbols(relative, content)) {
        if (symbols.length >= maxSymbols) {
          truncated = true;
          return;
        }
        symbols.push(sym);
      }
    }
  }

  await walk(root);
  return { symbols, filesScanned, truncated };
}

/**
 * Rank symbols against a query name.
 *
 * Exact match first, then case-insensitive, then substring — and an exported
 * symbol outranks a local one at the same tier, because the thing you can
 * import is usually the thing you meant. Ties break on path so the order is
 * deterministic.
 */
export function rankSymbols(symbols: CodeSymbol[], query: string): CodeSymbol[] {
  const q = query.trim();
  if (q === '') return [];
  const lower = q.toLowerCase();

  const scored: { sym: CodeSymbol; tier: number }[] = [];
  for (const sym of symbols) {
    const name = sym.name;
    let tier: number;
    if (name === q) tier = 0;
    else if (name.toLowerCase() === lower) tier = 1;
    else if (name.toLowerCase().includes(lower)) tier = 2;
    else continue;
    scored.push({ sym, tier });
  }

  scored.sort(
    (a, b) =>
      a.tier - b.tier ||
      Number(b.sym.exported) - Number(a.sym.exported) ||
      a.sym.path.localeCompare(b.sym.path) ||
      a.sym.line - b.sym.line,
  );
  return scored.map((s) => s.sym);
}

/**
 * A compact per-file outline: what a module contains, without its bodies.
 *
 * This is the shape that makes a repository legible to a model in a few
 * hundred tokens rather than a few hundred thousand.
 */
export function summariseByFile(
  index: CodeIndex,
): { path: string; symbols: { name: string; kind: SymbolKind; line: number }[] }[] {
  const byFile = new Map<string, { name: string; kind: SymbolKind; line: number }[]>();
  for (const sym of index.symbols) {
    // Only the module surface belongs in an outline; methods and locals are
    // detail you ask for once you know which file to open.
    if (!sym.exported) continue;
    const list = byFile.get(sym.path) ?? [];
    list.push({ name: sym.name, kind: sym.kind, line: sym.line });
    byFile.set(sym.path, list);
  }
  return [...byFile.entries()]
    .map(([p, syms]) => ({ path: p, symbols: syms }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
