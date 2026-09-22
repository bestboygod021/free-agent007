import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initDb } from '../../db/index.js';
import { invokeTool, clearTools } from '../../services/agent-tools.js';
import { registerBuiltinTools } from '../../services/agent-tools-builtin.js';
import { registerCodeTools } from '../../services/agent-tools-code.js';
import { unattendedTools } from '../../services/agent-evidence.js';

/**
 * The code navigation tools, checked at the layer a run actually uses: through
 * `invokeTool`, so the policy engine and the audit log are in the picture.
 */

let workspace: string;

async function write(relative: string, content: string): Promise<void> {
  const full = path.join(workspace, relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

function call(tool: string, args: Record<string, unknown>) {
  return invokeTool({
    tool,
    args,
    organizationId: 'acme',
    projectId: 'web',
    workspaceRoot: workspace,
  });
}

describe('code navigation tools', () => {
  beforeEach(async () => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    clearTools();
    registerBuiltinTools();
    registerCodeTools();
    workspace = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'code-tools-')));

    await write(
      'src/services/tenancy.ts',
      [
        'import { db } from "../db.js";',
        '',
        'export function resolveScope(userId: string) {',
        '  return db.lookup(userId);',
        '}',
        '',
        'function helper() { return 1; }',
      ].join('\n'),
    );
    await write(
      'src/routes/api.ts',
      ['import { resolveScope } from "../services/tenancy.js";', '', 'resolveScope("u1");'].join(
        '\n',
      ),
    );
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  /**
   * The regression this locks in: these tools were first named
   * `code.symbol.find` and `code.outline`, which match no rule in the policy
   * engine's read vocabulary. They were therefore classified as high-risk
   * external writes and filtered out of every phase — registered, but never
   * offered to a model. Renaming them back would reintroduce that silently,
   * so the classification is asserted rather than assumed.
   */
  it('is classified as read-only, so a phase is actually allowed to use it', () => {
    const safe = unattendedTools();
    expect(safe).toContain('code.symbol.search');
    expect(safe).toContain('code.outline.read');
    expect(safe).toContain('code.file.outline.read');
  });

  it('finds a definition and not its call sites', async () => {
    const res = await call('code.symbol.search', { name: 'resolveScope' });
    expect(res.ok).toBe(true);

    const { matches } = res.result as { matches: { path: string; line: number }[] };
    expect(matches).toHaveLength(1);
    expect(matches[0]!.path).toBe('src/services/tenancy.ts');
    // The declaration, not the import in api.ts and not the call below it.
    expect(matches[0]!.line).toBe(3);
  });

  it('returns the source of a definition when asked, so the caller can verify it', async () => {
    const res = await call('code.symbol.search', { name: 'resolveScope', includeSource: true });
    const { matches } = res.result as { matches: { source: string }[] };
    expect(matches[0]!.source).toContain('export function resolveScope');
  });

  it('reports no match without inventing one', async () => {
    const res = await call('code.symbol.search', { name: 'noSuchSymbolAnywhere' });
    const result = res.result as { matches: unknown[]; totalMatches: number };
    expect(result.matches).toEqual([]);
    expect(result.totalMatches).toBe(0);
  });

  it('outlines the exported surface of a codebase', async () => {
    const res = await call('code.outline.read', {});
    const { files } = res.result as { files: { path: string; symbols: { name: string }[] }[] };

    const tenancy = files.find((f) => f.path === 'src/services/tenancy.ts');
    expect(tenancy!.symbols.map((s) => s.name)).toEqual(['resolveScope']);
    // api.ts exports nothing, so it contributes nothing to the map.
    expect(files.find((f) => f.path === 'src/routes/api.ts')).toBeUndefined();
  });

  it('outlines one file including its non-exported symbols', async () => {
    const res = await call('code.file.outline.read', { path: 'src/services/tenancy.ts' });
    const { symbols } = res.result as { symbols: { name: string; exported: boolean }[] };
    expect(symbols.map((s) => s.name)).toEqual(['resolveScope', 'helper']);
    expect(symbols.find((s) => s.name === 'helper')!.exported).toBe(false);
  });

  it('refuses to escape the workspace', async () => {
    const res = await call('code.file.outline.read', { path: '../../etc/passwd' });
    expect(res.outcome).toBe('error');
    expect(res.reason).toContain('escapes the workspace');
  });

  it('will not outline a credential file that is itself valid code', async () => {
    // A `.js` file: the extension filter would let this through, so only the
    // credential-name rule keeps its contents out of the model's view.
    await write('src/credentials.js', 'export const API_KEY = "live_value_here";\n');
    const res = await call('code.outline.read', {});
    expect(JSON.stringify(res.result)).not.toContain('API_KEY');
  });

  it('scopes a search to a subdirectory when asked', async () => {
    const res = await call('code.symbol.search', { name: 'resolveScope', path: 'src/routes' });
    const { matches } = res.result as { matches: unknown[] };
    expect(matches).toEqual([]);
  });
});
