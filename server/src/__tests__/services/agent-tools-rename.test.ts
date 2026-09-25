import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initDb } from '../../db/index.js';
import { invokeTool, clearTools, listTools } from '../../services/agent-tools.js';
import { registerBuiltinTools } from '../../services/agent-tools-builtin.js';
import { registerRenameTools } from '../../services/agent-tools-rename.js';
import { unattendedTools } from '../../services/agent-evidence.js';

let workspace: string;

const APPROVER = 'human@example.com';

async function write(relative: string, content: string): Promise<void> {
  const full = path.join(workspace, relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

async function read(relative: string): Promise<string> {
  return fs.readFile(path.join(workspace, relative), 'utf8');
}

function call(tool: string, args: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return invokeTool({
    tool,
    args,
    organizationId: 'acme',
    projectId: 'web',
    workspaceRoot: workspace,
    grantedScopes: ['repository:write'],
    approvedBy: APPROVER,
    policy: { approverUserId: APPROVER },
    ...overrides,
  } as never);
}

async function preview(args: Record<string, unknown>) {
  const res = await call('code.rename.preview.read', args);
  expect(res.outcome).toBe('ok');
  return res.result as {
    digest: string;
    totalEdits: number;
    files: string[];
    excluded: { context: string; count: number }[];
    confidence: string;
    refusal?: string;
    edits: { context: string; before: string; after: string }[];
  };
}

describe('rename tools', () => {
  beforeEach(async () => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    clearTools();
    registerBuiltinTools();
    registerRenameTools();
    workspace = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'rename-')));

    await write(
      'src/widget.ts',
      [
        'export function widgetise(value: number): number {',
        '  return value * 2;',
        '}',
      ].join('\n'),
    );
    await write(
      'src/consumer.ts',
      [
        "import { widgetise } from './widget.js';",
        '',
        '// widgetise doubles a number',
        'export const doubled = widgetise(21);',
        "export const label = 'widgetise';",
      ].join('\n'),
    );
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it('registers both tools', () => {
    const names = listTools().map((t) => t.name);
    expect(names).toContain('code.rename.preview.read');
    expect(names).toContain('code.rename.apply');
  });

  /**
   * The preview is a read and must stay one: a model exploring a refactor
   * should not need approval to look. The apply must never be autonomous.
   */
  it('classifies the preview as read-only and the apply as not', () => {
    const safe = unattendedTools();
    expect(safe).toContain('code.rename.preview.read');
    expect(safe).not.toContain('code.rename.apply');
  });

  describe('preview', () => {
    it('reports code and declaration edits, excluding strings and comments', async () => {
      const out = await preview({ name: 'widgetise', newName: 'doubleIt' });

      // declaration + import binding + call site
      expect(out.totalEdits).toBe(3);
      expect(out.files).toEqual(['src/consumer.ts', 'src/widget.ts']);

      const excluded = Object.fromEntries(out.excluded.map((e) => [e.context, e.count]));
      expect(excluded.string).toBe(1);
      expect(excluded.comment).toBe(1);
      // No import-context reference: the module specifier is './widget.js',
      // which does not contain the symbol name. The imported *binding* on
      // that same line is a code reference and is renamed.
      expect(excluded.import).toBeUndefined();
    });

    it('shows the before and after of each line', async () => {
      const out = await preview({ name: 'widgetise', newName: 'doubleIt' });
      const declaration = out.edits.find((e) => e.context === 'declaration');

      expect(declaration!.before).toContain('widgetise');
      expect(declaration!.after).toContain('doubleIt');
      expect(declaration!.after).not.toContain('widgetise');
    });

    it('can be asked to include comments and strings', async () => {
      const out = await preview({
        name: 'widgetise',
        newName: 'doubleIt',
        include: ['code', 'declaration', 'comment', 'string'],
      });

      expect(out.totalEdits).toBe(5);
    });

    it('changes nothing on disk', async () => {
      const before = await read('src/widget.ts');
      await preview({ name: 'widgetise', newName: 'doubleIt' });

      expect(await read('src/widget.ts')).toBe(before);
    });

    it('refuses a name that is not an identifier', async () => {
      const out = await preview({ name: 'widget.*', newName: 'doubleIt' });
      expect(out.refusal).toContain('not a valid identifier');
    });

    it('refuses when the new name already exists in a touched file', async () => {
      await write(
        'src/widget.ts',
        [
          'export function widgetise(value: number): number {',
          '  return value * 2;',
          '}',
          'export function doubleIt(value: number): number {',
          '  return value + value;',
          '}',
        ].join('\n'),
      );

      const out = await preview({ name: 'widgetise', newName: 'doubleIt' });
      expect(out.refusal).toContain('already declared');
    });

    it('refuses a rename that would change nothing', async () => {
      const out = await preview({ name: 'nonExistentSymbol', newName: 'other' });
      expect(out.refusal).toContain('Renaming nothing');
    });
  });

  describe('apply', () => {
    it('is refused without the repository:write scope', async () => {
      const out = await preview({ name: 'widgetise', newName: 'doubleIt' });
      const res = await call(
        'code.rename.apply',
        { name: 'widgetise', newName: 'doubleIt', digest: out.digest },
        { grantedScopes: [] },
      );

      expect(res.outcome).toBe('denied');
      expect(String(res.reason)).toContain('repository:write');
      expect(await read('src/widget.ts')).toContain('widgetise');
    });

    it('is refused without human approval', async () => {
      const out = await preview({ name: 'widgetise', newName: 'doubleIt' });
      const res = await call(
        'code.rename.apply',
        { name: 'widgetise', newName: 'doubleIt', digest: out.digest },
        { approvedBy: undefined },
      );

      expect(res.outcome).toBe('denied');
      expect(await read('src/widget.ts')).toContain('widgetise');
    });

    it('rewrites code references across files and leaves strings alone', async () => {
      const out = await preview({ name: 'widgetise', newName: 'doubleIt' });
      const res = await call('code.rename.apply', {
        name: 'widgetise',
        newName: 'doubleIt',
        digest: out.digest,
      });

      expect(res.outcome).toBe('ok');
      expect(res.result).toMatchObject({ renamed: true, editsApplied: 3 });

      expect(await read('src/widget.ts')).toContain('export function doubleIt');
      const consumer = await read('src/consumer.ts');
      expect(consumer).toContain('export const doubled = doubleIt(21);');
      expect(consumer).toContain('import { doubleIt }');
      // The module path, the comment and the string literal are untouched.
      expect(consumer).toContain("from './widget.js'");
      expect(consumer).toContain('// widgetise doubles a number');
      expect(consumer).toContain("const label = 'widgetise'");
    });

    /**
     * The guard the digest exists for. Anything can rewrite a file between
     * the preview a human approved and the apply that acts on it.
     */
    it('refuses when a file changed since the preview', async () => {
      const out = await preview({ name: 'widgetise', newName: 'doubleIt' });
      await write('src/consumer.ts', 'export const nothing = 1;\n');

      const res = await call('code.rename.apply', {
        name: 'widgetise',
        newName: 'doubleIt',
        digest: out.digest,
      });

      expect(res.outcome).toBe('error');
      expect(String(res.reason)).toMatch(/changed since/);
      expect(await read('src/widget.ts')).toContain('widgetise');
    });

    it('refuses a digest from a different rename', async () => {
      const other = await preview({ name: 'widgetise', newName: 'somethingElse' });

      const res = await call('code.rename.apply', {
        name: 'widgetise',
        newName: 'doubleIt',
        digest: other.digest,
      });

      expect(res.outcome).toBe('error');
      expect(String(res.reason)).toMatch(/changed since|previewed/);
    });

    /**
     * A lexical rename of a common name is a bad idea, and the tool should
     * not be the thing that gets talked into it.
     */
    it('refuses an approximate rename unless it is acknowledged', async () => {
      await write('src/common.ts', 'export function get() { return 1; }\nget();\n');

      const out = await preview({ name: 'get', newName: 'fetchIt' });
      expect(out.confidence).toBe('approximate');

      const refused = await call('code.rename.apply', {
        name: 'get',
        newName: 'fetchIt',
        digest: out.digest,
      });
      expect(refused.outcome).toBe('error');
      expect(String(refused.reason)).toContain('acknowledgeApproximate');

      const allowed = await call('code.rename.apply', {
        name: 'get',
        newName: 'fetchIt',
        digest: out.digest,
        acknowledgeApproximate: true,
      });
      expect(allowed.outcome).toBe('ok');
      expect(allowed.result).toMatchObject({ acknowledgedApproximate: true });
    });

    it('handles two occurrences of the symbol on one line', async () => {
      await write('src/twice.ts', 'export const pair = widgetise(widgetise(1));\n');

      const out = await preview({ name: 'widgetise', newName: 'doubleIt' });
      const res = await call('code.rename.apply', {
        name: 'widgetise',
        newName: 'doubleIt',
        digest: out.digest,
      });

      expect(res.outcome).toBe('ok');
      // Left-to-right replacement corrupts the second occurrence; this is the
      // regression test for doing it right-to-left.
      expect(await read('src/twice.ts')).toBe('export const pair = doubleIt(doubleIt(1));\n');
    });

    it('refuses to rename a symbol into itself', async () => {
      const out = await preview({ name: 'widgetise', newName: 'widgetise' });
      expect(out.refusal).toContain('same as the old one');
    });
  });
});
