import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  classifyReferences,
  findReferences,
  summariseReferences,
  referencedFiles,
  isValidSymbolName,
} from '../../services/code-references.js';
import { extractSymbols } from '../../services/code-index.js';

describe('classifyReferences', () => {
  it('separates code from comment on the same line', () => {
    // The reason this module scans character by character instead of
    // classifying whole lines: this line is both.
    const refs = classifyReferences('a.ts', 'redactToken(x); // call redactToken again\n', 'redactToken');

    expect(refs.map((r) => r.context)).toEqual(['code', 'comment']);
    expect(refs[0]!.column).toBe(1);
    expect(refs[1]!.column).toBeGreaterThan(refs[0]!.column);
  });

  it('separates code from a string literal on the same line', () => {
    const refs = classifyReferences('a.ts', "log('redactToken failed'); redactToken();\n", 'redactToken');

    expect(refs.map((r) => r.context)).toEqual(['string', 'code']);
  });

  it('tracks block comments across lines', () => {
    const src = ['/*', ' * redactToken explained', ' */', 'redactToken();'].join('\n');
    const refs = classifyReferences('a.ts', src, 'redactToken');

    expect(refs.map((r) => r.context)).toEqual(['comment', 'code']);
  });

  it('does not let a block comment swallow the rest of the file', () => {
    const src = ['/* redactToken */ redactToken();', 'redactToken();'].join('\n');
    const refs = classifyReferences('a.ts', src, 'redactToken');

    expect(refs.map((r) => r.context)).toEqual(['comment', 'code', 'code']);
  });

  /**
   * Found by running this module over the repository that contains it. An
   * earlier version judged the whole line and matched `import` anywhere in
   * it, so a test fixture holding an import statement as a string was
   * reported as a real module specifier. Both halves of the fix are load
   * bearing -- looking only at the text before the opening quote, and
   * anchoring the keyword to the start of it.
   */
  it('does not mistake a string containing an import for an import', () => {
    const src = 'const sample = "import { widgetise } from \'./widgetise.js\';";\n';
    const refs = classifyReferences('a.ts', src, 'widgetise');

    expect(refs.every((r) => r.context === 'string')).toBe(true);
    expect(refs.map((r) => r.context)).not.toContain('import');
  });

  it('classifies an import specifier as import, not string', () => {
    const src = "import { redactToken } from './redactToken.js';\n";
    const refs = classifyReferences('a.ts', src, 'redactToken');

    // The braces one is real code; the quoted one is a module path.
    expect(refs.map((r) => r.context)).toEqual(['code', 'import']);
  });

  it('marks the declaration line as a declaration', () => {
    const src = 'export function redactToken(s: string) {\n  return redactToken(s);\n}\n';
    const decls = extractSymbols('a.ts', src);
    const refs = classifyReferences('a.ts', src, 'redactToken', decls);

    expect(refs[0]!.context).toBe('declaration');
    expect(refs[1]!.context).toBe('code');
  });

  it('requires a whole-identifier match', () => {
    const src = 'redactTokenList(); myRedactToken(); redactToken_2(); redactToken();\n';
    const refs = classifyReferences('a.ts', src, 'redactToken');

    // Only the last one is the symbol itself.
    expect(refs).toHaveLength(1);
    expect(refs[0]!.column).toBe(src.indexOf('redactToken();') + 1);
  });

  it('handles an escaped quote without losing sync', () => {
    const src = "const s = 'it\\'s redactToken'; redactToken();\n";
    const refs = classifyReferences('a.ts', src, 'redactToken');

    expect(refs.map((r) => r.context)).toEqual(['string', 'code']);
  });

  it('reports a property access as code because it cannot prove otherwise', () => {
    const refs = classifyReferences('a.ts', 'obj.redactToken();\n', 'redactToken');

    expect(refs.map((r) => r.context)).toEqual(['code']);
  });

  /**
   * A caller-supplied name becomes part of a scan. If `.*` were accepted, a
   * "reference search" would report every line in the repository as a hit.
   */
  it('refuses a symbol name that is not an identifier', () => {
    expect(isValidSymbolName('.*')).toBe(false);
    expect(isValidSymbolName('foo bar')).toBe(false);
    expect(isValidSymbolName('foo')).toBe(true);
    expect(classifyReferences('a.ts', 'anything at all\n', '.*')).toEqual([]);
  });
});

describe('findReferences', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'refs-')));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function write(rel: string, content: string): Promise<void> {
    const full = path.join(root, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf8');
  }

  it('finds references across files and reports each context', async () => {
    await write('src/a.ts', 'export function widgetise(x: number) {\n  return x;\n}\n');
    // The module specifier is './widgetise.js', so the name appears both as an
    // imported binding (code) and inside the path (import). A rename of the
    // symbol must rewrite the first and not the second.
    await write(
      'src/b.ts',
      "import { widgetise } from './widgetise.js';\nwidgetise(1); // widgetise twice\n",
    );
    await write('src/c.ts', "const label = 'widgetise';\n");

    const decls = extractSymbols(
      'src/a.ts',
      'export function widgetise(x: number) {\n  return x;\n}\n',
    );
    const report = await findReferences(root, 'widgetise', decls);

    expect(summariseReferences(report.references)).toEqual({
      declaration: 1,
      code: 2,
      import: 1,
      comment: 1,
      string: 1,
    });
    expect(referencedFiles(report.references)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    expect(report.filesScanned).toBe(3);
  });

  it('does not descend into node_modules or dist', async () => {
    await write('src/a.ts', 'widgetise();\n');
    await write('node_modules/pkg/index.ts', 'widgetise();\n');
    await write('dist/a.js', 'widgetise();\n');

    const report = await findReferences(root, 'widgetise');

    expect(referencedFiles(report.references)).toEqual(['src/a.ts']);
  });

  /**
   * A refactoring tool that silently reports fewer call sites than exist is
   * worse than one that admits it stopped, because the caller acts on the
   * number either way.
   */
  it('reports truncation rather than a short count', async () => {
    for (let i = 0; i < 12; i++) await write(`src/f${i}.ts`, 'widgetise();\n');

    const report = await findReferences(root, 'widgetise', [], { maxReferences: 5 });

    expect(report.truncated).toBe(true);
    expect(report.references.length).toBeLessThanOrEqual(5);
  });

  it('marks a common name as approximate', async () => {
    await write('src/a.ts', 'get();\n');

    const report = await findReferences(root, 'get');

    expect(report.confidence).toBe('approximate');
    expect(report.confidenceReason).toContain('common');
  });

  it('marks a short name as approximate', async () => {
    await write('src/a.ts', 'ab();\n');

    const report = await findReferences(root, 'ab');

    expect(report.confidence).toBe('approximate');
  });

  it('marks a distinctive name as exact', async () => {
    await write('src/a.ts', 'widgetise();\n');

    const report = await findReferences(root, 'widgetise');

    expect(report.confidence).toBe('exact');
    expect(report.confidenceReason).toContain('code');
  });

  it('returns nothing for an invalid identifier instead of scanning', async () => {
    await write('src/a.ts', 'anything\n');

    const report = await findReferences(root, '.*');

    expect(report.references).toEqual([]);
    expect(report.filesScanned).toBe(0);
  });

  it('skips files larger than the byte cap', async () => {
    await write('src/big.ts', `// ${'x'.repeat(2000)}\nwidgetise();\n`);
    await write('src/small.ts', 'widgetise();\n');

    const report = await findReferences(root, 'widgetise', [], { maxFileBytes: 500 });

    expect(referencedFiles(report.references)).toEqual(['src/small.ts']);
  });
});
