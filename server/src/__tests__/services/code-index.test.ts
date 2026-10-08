import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  extractSymbols,
  buildCodeIndex,
  rankSymbols,
  summariseByFile,
  isIndexableFile,
} from '../../services/code-index.js';

/**
 * The scanner's job is to tell a definition from a mention. Most of what is
 * worth testing is therefore the false-positive side: a symbol it invents
 * sends an agent to a line that does not define anything, which is worse than
 * finding nothing at all.
 */

let workspace: string;

async function write(relative: string, content: string): Promise<void> {
  const full = path.join(workspace, relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

describe('code index: extracting declarations', () => {
  it('finds each declaration form with an exact line number', () => {
    const src = [
      'export function alpha() {}', // 1
      'class Beta {}', // 2
      'export interface Gamma { a: string }', // 3
      'export type Delta = string;', // 4
      'enum Epsilon { A }', // 5
      'export const zeta = (a: number) => a + 1;', // 6
    ].join('\n');

    const syms = extractSymbols('t.ts', src);
    expect(syms.map((s) => [s.name, s.kind, s.line])).toEqual([
      ['alpha', 'function', 1],
      ['Beta', 'class', 2],
      ['Gamma', 'interface', 3],
      ['Delta', 'type', 4],
      ['Epsilon', 'enum', 5],
      ['zeta', 'function', 6],
    ]);
  });

  it('records whether a declaration is exported', () => {
    const syms = extractSymbols('t.ts', 'export function pub() {}\nfunction priv() {}\n');
    expect(syms.find((s) => s.name === 'pub')!.exported).toBe(true);
    expect(syms.find((s) => s.name === 'priv')!.exported).toBe(false);
  });

  it('ignores a declaration that is commented out', () => {
    const src = [
      '// export function lineGhost() {}',
      '/* export function inlineGhost() {} */',
      '/*',
      'export function blockGhost() {}',
      '*/',
      'export function real() {}',
    ].join('\n');
    expect(extractSymbols('t.ts', src).map((s) => s.name)).toEqual(['real']);
  });

  it('ignores a declaration mentioned inside a jsdoc block', () => {
    const src = ['/**', ' * export function documented() {}', ' */', 'export class Real {}'].join(
      '\n',
    );
    expect(extractSymbols('t.ts', src).map((s) => s.name)).toEqual(['Real']);
  });

  it('does not treat a call site as a definition', () => {
    const src = 'resolveScope(a, b);\nfoo.bar();\nconst r = compute(1);\n';
    expect(extractSymbols('t.ts', src)).toEqual([]);
  });

  it('does not mistake control flow for a method', () => {
    const src = 'function outer() {\n  if (a) {\n  }\n  for (const x of y) {\n  }\n}\n';
    expect(extractSymbols('t.ts', src).map((s) => s.name)).toEqual(['outer']);
  });

  it('finds class methods with their own line numbers', () => {
    const src = [
      'export class Service {', // 1
      '  private cache = new Map();', // 2
      '  async fetchUser(id: string): Promise<User> {', // 3
      '    return this.cache.get(id);', // 4
      '  }', // 5
      '}', // 6
    ].join('\n');
    const syms = extractSymbols('s.ts', src);
    expect(syms.map((s) => [s.name, s.kind, s.line])).toEqual([
      ['Service', 'class', 1],
      ['fetchUser', 'method', 3],
    ]);
  });

  it('keeps a local const out of the index but an exported one in', () => {
    const syms = extractSymbols('t.ts', 'const localThing = 1;\nexport const publicThing = 2;\n');
    expect(syms.map((s) => s.name)).toEqual(['publicThing']);
  });

  it('does not index declaration files or credential files', () => {
    expect(isIndexableFile('types.d.ts')).toBe(false);
    expect(isIndexableFile('app.ts')).toBe(true);
    expect(isIndexableFile('README.md')).toBe(false);
    // `.env` is excluded by having no code extension at all, so it does not
    // test the credential rule. These two do: they carry an indexable
    // extension and are still refused by name.
    expect(isIndexableFile('credentials.js')).toBe(false);
    expect(isIndexableFile('.env.ts')).toBe(false);
  });
});

describe('code index: walking a workspace', () => {
  beforeEach(async () => {
    workspace = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'code-index-')));
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it('indexes nested files with workspace-relative paths', async () => {
    await write('src/services/user.ts', 'export function createUser() {}\n');
    await write('src/routes/api.ts', 'export function handler() {}\n');

    const index = await buildCodeIndex(workspace);
    expect(index.filesScanned).toBe(2);
    expect(index.symbols.map((s) => s.path).sort()).toEqual([
      'src/routes/api.ts',
      'src/services/user.ts',
    ]);
  });

  it('does not walk dependency or build directories', async () => {
    await write('src/app.ts', 'export function mine() {}\n');
    await write('node_modules/pkg/index.js', 'export function theirs() {}\n');
    await write('dist/app.js', 'export function built() {}\n');

    const names = (await buildCodeIndex(workspace)).symbols.map((s) => s.name);
    expect(names).toEqual(['mine']);
  });

  it('never indexes a credential file even when it parses as code', async () => {
    await write('src/app.ts', 'export function mine() {}\n');
    // A real .js file, so only the credential rule can keep it out.
    await write('src/credentials.js', 'export const dbPassword = "hunter2";\n');

    const index = await buildCodeIndex(workspace);
    expect(index.symbols.map((s) => s.name)).toEqual(['mine']);
    expect(JSON.stringify(index)).not.toContain('dbPassword');
  });

  it('reports truncation rather than silently returning a partial index', async () => {
    for (let i = 0; i < 12; i++) await write(`src/f${i}.ts`, `export function fn${i}() {}\n`);

    const full = await buildCodeIndex(workspace);
    expect(full.truncated).toBe(false);

    const capped = await buildCodeIndex(workspace, { maxFiles: 5 });
    expect(capped.truncated).toBe(true);
    expect(capped.filesScanned).toBe(5);
  });

  it('produces the same result for the same tree', async () => {
    await write('src/b.ts', 'export function b() {}\n');
    await write('src/a.ts', 'export function a() {}\n');

    const first = await buildCodeIndex(workspace);
    const second = await buildCodeIndex(workspace);
    expect(first.symbols).toEqual(second.symbols);
  });
});

describe('code index: ranking', () => {
  const symbols = [
    { name: 'user', kind: 'const', path: 'b.ts', line: 1, exported: false, signature: '' },
    { name: 'User', kind: 'interface', path: 'a.ts', line: 2, exported: true, signature: '' },
    { name: 'createUser', kind: 'function', path: 'c.ts', line: 3, exported: true, signature: '' },
    // Deliberately in the *later* path so that path order alone would put it
    // second: only the exported tie-break can lift it to the top. Without
    // that, this fixture would pass whether the rule existed or not.
    { name: 'user', kind: 'function', path: 'z.ts', line: 4, exported: true, signature: '' },
  ] as const;

  it('ranks exact match over case-insensitive over substring', () => {
    const ranked = rankSymbols([...symbols], 'user');
    expect(ranked.map((s) => `${s.name}@${s.path}`)).toEqual([
      // exact, exported first
      'user@z.ts',
      'user@b.ts',
      // same name different case
      'User@a.ts',
      // substring
      'createUser@c.ts',
    ]);
  });

  it('returns nothing for an empty query rather than everything', () => {
    expect(rankSymbols([...symbols], '   ')).toEqual([]);
  });

  it('summarises only the exported surface, grouped by file', () => {
    const summary = summariseByFile({
      symbols: [...symbols],
      filesScanned: 3,
      truncated: false,
    });
    expect(summary).toEqual([
      { path: 'a.ts', symbols: [{ name: 'User', kind: 'interface', line: 2 }] },
      { path: 'c.ts', symbols: [{ name: 'createUser', kind: 'function', line: 3 }] },
      { path: 'z.ts', symbols: [{ name: 'user', kind: 'function', line: 4 }] },
    ]);
  });
});
