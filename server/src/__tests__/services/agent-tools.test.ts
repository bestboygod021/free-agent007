import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initDb } from '../../db/index.js';
import {
  registerTool,
  invokeTool,
  listTools,
  listToolCalls,
  clearTools,
  ToolError,
} from '../../services/agent-tools.js';
import { registerBuiltinTools } from '../../services/agent-tools-builtin.js';

/**
 * The tool registry is where an agent stops being advisory, so most of what is
 * worth testing is what it refuses to do.
 */

let workspace: string;

async function makeWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-tools-'));
  // realpath because macOS puts mkdtemp under a symlinked /tmp, and the
  // confinement check resolves symlinks.
  return fs.realpath(dir);
}

function call(overrides: Record<string, unknown> = {}) {
  return invokeTool({
    tool: 'fs.read_file',
    args: {},
    organizationId: 'acme',
    projectId: 'web',
    workspaceRoot: workspace,
    ...overrides,
  } as Parameters<typeof invokeTool>[0]);
}

describe('agent tool registry', () => {
  beforeEach(async () => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    clearTools();
    registerBuiltinTools();
    workspace = await makeWorkspace();
    await fs.writeFile(path.join(workspace, 'hello.txt'), 'hello world\nsecond line\n');
    await fs.mkdir(path.join(workspace, 'src'), { recursive: true });
    await fs.writeFile(path.join(workspace, 'src', 'app.ts'), 'export const port = 3001;\n');
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it('exposes a catalogue shaped for a tool-calling model', () => {
    const tools = listTools();
    expect(tools.map((t) => t.name)).toContain('fs.read_file');
    // The handler must never leak into what a model is shown.
    expect(Object.keys(tools[0]!)).toEqual(['name', 'description', 'parameters']);
  });

  it('rejects a tool name that is not dotted lowercase', () => {
    expect(() => registerTool({ name: 'BadName', description: '', schema: {}, handler: async () => null }))
      .toThrow(ToolError);
  });

  it('reads a file inside the workspace', async () => {
    const res = await call({ args: { path: 'hello.txt' } });
    expect(res.ok).toBe(true);
    expect((res.result as { content: string }).content).toContain('hello world');
  });

  it('refuses an unregistered tool', async () => {
    const res = await call({ tool: 'fs.nuke', args: { path: 'x' } });
    expect(res.outcome).toBe('denied');
    expect(res.reason).toContain('no tool named');
  });

  it('refuses arguments that do not match the schema', async () => {
    const res = await call({ args: { wrong: 1 } });
    expect(res.outcome).toBe('denied');
    expect(res.reason).toContain('invalid arguments');
  });

  // --- confinement ------------------------------------------------------

  it('refuses to escape the workspace with ..', async () => {
    const res = await call({ args: { path: '../../etc/passwd' } });
    expect(res.outcome).toBe('error');
    expect(res.reason).toContain('escapes the workspace');
  });

  it('refuses an absolute path outside the workspace', async () => {
    const res = await call({ args: { path: '/etc/passwd' } });
    expect(res.outcome).toBe('error');
    expect(res.reason).toContain('escapes the workspace');
  });

  it('refuses a sibling directory that merely shares a prefix', async () => {
    // /tmp/agent-tools-x must not be able to reach /tmp/agent-tools-xsecrets
    const sibling = `${workspace}-secrets`;
    await fs.mkdir(sibling, { recursive: true });
    await fs.writeFile(path.join(sibling, 'k.txt'), 'top secret');
    try {
      const res = await call({ args: { path: `../${path.basename(sibling)}/k.txt` } });
      expect(res.outcome).toBe('error');
      expect(res.reason).toContain('escapes the workspace');
    } finally {
      await fs.rm(sibling, { recursive: true, force: true });
    }
  });

  it('refuses a symlink that points outside the workspace', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-'));
    await fs.writeFile(path.join(outside, 'secret.txt'), 'leaked');
    await fs.symlink(path.join(outside, 'secret.txt'), path.join(workspace, 'link.txt'));
    try {
      const res = await call({ args: { path: 'link.txt' } });
      expect(res.outcome).toBe('error');
      expect(res.reason).toContain('outside the workspace');
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it('refuses a null byte in a path', async () => {
    const res = await call({ args: { path: 'hello.txt\0.png' } });
    expect(res.outcome).toBe('error');
  });

  // --- policy -----------------------------------------------------------

  it('applies the kernel policy engine to writes', async () => {
    // fs.file.write needs repository:write; without the scope it is refused.
    const res = await call({ tool: 'fs.file.write', args: { path: 'new.txt', content: 'hi' } });
    expect(res.outcome).toBe('denied');
    expect(await fs.stat(path.join(workspace, 'new.txt')).catch(() => null)).toBeNull();
  });

  it('allows a write once the scope is granted', async () => {
    const res = await call({
      tool: 'fs.file.write',
      args: { path: 'notes/new.txt', content: 'hi' },
      grantedScopes: ['repository:write'],
    });
    expect(res.ok).toBe(true);
    expect(await fs.readFile(path.join(workspace, 'notes/new.txt'), 'utf8')).toBe('hi');
  });

  it('refuses a high-risk call with no approval', async () => {
    registerTool({
      name: 'deploy.production',
      description: 'ship it',
      schema: { type: 'object', properties: {}, additionalProperties: false },
      handler: async () => 'shipped',
    });
    // Scope first: without deploy:write it never reaches the approval gate.
    const res = await call({
      tool: 'deploy.production',
      args: {},
      grantedScopes: ['deploy:write'],
    });
    expect(res.outcome).toBe('denied');
    expect(res.approvalRequired).toBe(true);
    expect(res.reason).toContain('requires human approval');
  });

  it('refuses an approval granted by anyone other than the approver', async () => {
    registerTool({
      name: 'deploy.production',
      description: 'ship it',
      schema: { type: 'object', properties: {}, additionalProperties: false },
      handler: async () => 'shipped',
    });
    // The agent cannot sign its own permission slip.
    const res = await call({
      tool: 'deploy.production',
      args: {},
      grantedScopes: ['deploy:write'],
      policy: { approverUserId: 'alice' },
      approvedBy: 'the-agent',
    });
    expect(res.outcome).toBe('denied');
    expect(res.reason).toContain('is not valid');
  });

  it('runs a high-risk call when the real approver approves', async () => {
    registerTool({
      name: 'deploy.production',
      description: 'ship it',
      schema: { type: 'object', properties: {}, additionalProperties: false },
      handler: async () => 'shipped',
    });
    const res = await call({
      tool: 'deploy.production',
      args: {},
      grantedScopes: ['deploy:write'],
      policy: { approverUserId: 'alice' },
      approvedBy: 'alice',
    });
    expect(res.ok).toBe(true);
    expect(res.result).toBe('shipped');
  });

  it('honours the hard deny list', async () => {
    registerTool({
      name: 'host.exec',
      description: 'run anything',
      schema: { type: 'object', properties: {}, additionalProperties: false },
      handler: async () => 'ran',
    });
    const res = await call({ tool: 'host.exec', args: {}, approvedBy: 'unknown' });
    expect(res.outcome).toBe('denied');
    expect(res.reason).toContain('hard deny');
  });

  // --- execution --------------------------------------------------------

  it('aborts a tool that hangs', async () => {
    let aborted = false;
    registerTool({
      name: 'slow.read',
      description: 'never returns on its own',
      schema: { type: 'object', properties: {}, additionalProperties: false },
      handler: (_args, ctx) =>
        new Promise((_resolve, reject) => {
          ctx.signal.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(new Error('aborted'));
            },
            { once: true },
          );
        }),
    });

    const res = await call({ tool: 'slow.read', args: {}, timeoutMs: 50 });

    expect(aborted).toBe(true);
    expect(res.outcome).toBe('error');
    expect(res.reason).toContain('timed out after 50ms');
    // A hung tool must not hold the run for its full default ceiling.
    expect(res.durationMs).toBeLessThan(2000);
  });

  it('kills a spawned process that overruns its timeout', async () => {
    const res = await call({
      tool: 'sandbox.test',
      args: { command: 'node -e setTimeout(()=>{},60000)' },
      timeoutMs: 300,
    });
    // The child is SIGKILLed, so the call returns rather than hanging.
    expect(res.durationMs).toBeLessThan(5000);
    const out = res.result as { timedOut: boolean } | undefined;
    if (res.ok) expect(out!.timedOut).toBe(true);
  });

  it('reports a throwing tool as an error, not a crash', async () => {
    registerTool({
      name: 'bad.read',
      description: 'throws',
      schema: { type: 'object', properties: {}, additionalProperties: false },
      handler: async () => {
        throw new Error('handler exploded');
      },
    });
    const res = await call({ tool: 'bad.read', args: {} });
    expect(res.outcome).toBe('error');
    expect(res.reason).toContain('handler exploded');
  });

  it('searches file contents', async () => {
    const res = await call({ tool: 'fs.search', args: { query: 'port', extensions: ['.ts'] } });
    const hits = (res.result as { hits: { path: string; line: number }[] }).hits;
    expect(hits.some((h) => h.path.endsWith('app.ts'))).toBe(true);
  });

  it('refuses to read a file whose name says it holds credentials', async () => {
    await fs.writeFile(path.join(workspace, '.env'), 'STRIPE_SECRET=sk_live_not_a_pattern\n');
    const res = await call({ args: { path: '.env' } });
    expect(res.outcome).toBe('error');
    expect(res.reason).toContain('refusing to read');
    // The point of the guard: the value never reaches the caller, and so never
    // reaches a model prompt.
    expect(JSON.stringify(res)).not.toContain('sk_live_not_a_pattern');
  });

  it('refuses a credential file in a subdirectory too', async () => {
    await fs.mkdir(path.join(workspace, 'apps'), { recursive: true });
    await fs.writeFile(path.join(workspace, 'apps', '.env.production'), 'DB_PASSWORD=hunter2\n');
    const res = await call({ args: { path: 'apps/.env.production' } });
    expect(res.outcome).toBe('error');
    expect(res.reason).toContain('refusing to read');
  });

  it('does not let fs.search read a refused file one line at a time', async () => {
    // The value is deliberately not a recognisable secret *pattern*: this is
    // exactly the case redactSecrets cannot catch, which is why the filename
    // rule has to exist.
    await fs.writeFile(path.join(workspace, '.env'), 'INTERNAL_TOKEN=plain_words_only\n');
    const res = await call({ tool: 'fs.search', args: { query: 'plain_words_only' } });
    expect(res.ok).toBe(true);
    const hits = (res.result as { hits: { path: string }[] }).hits;
    expect(hits).toEqual([]);
  });

  it('still reads ordinary files that merely sit next to a secret', async () => {
    await fs.writeFile(path.join(workspace, '.env'), 'SECRET=x\n');
    await fs.writeFile(path.join(workspace, 'env.ts'), 'export const useEnv = true;\n');
    const res = await call({ args: { path: 'env.ts' } });
    expect(res.ok).toBe(true);
    expect((res.result as { content: string }).content).toContain('useEnv');
  });

  it('runs a sandboxed process without a shell', async () => {
    const res = await call({ tool: 'sandbox.test', args: { command: 'node --version' } });
    expect(res.ok).toBe(true);
    expect((res.result as { stdout: string }).stdout).toMatch(/^v\d+/);
  });

  it('does not pass provider keys into a spawned process', async () => {
    process.env.OPENAI_API_KEY = 'sk-should-not-leak';
    const res = await call({
      tool: 'sandbox.test',
      args: { command: 'node -e console.log(process.env.OPENAI_API_KEY)' },
    });
    expect((res.result as { stdout: string }).stdout).toContain('undefined');
    delete process.env.OPENAI_API_KEY;
  });

  // --- audit ------------------------------------------------------------

  it('records a refusal, not just a success', async () => {
    await call({ args: { path: '../../etc/passwd' } });
    const rows = listToolCalls({ organizationId: 'acme' });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.outcome).toBe('error');
    expect(rows[0]!.reason).toContain('escapes the workspace');
  });

  it('links calls to the run that made them', async () => {
    await call({ args: { path: 'hello.txt' }, runId: 'run_1' });
    await call({ args: { path: 'hello.txt' }, runId: 'run_2' });
    expect(listToolCalls({ runId: 'run_1' })).toHaveLength(1);
  });

  it('keeps secrets out of the audit log', async () => {
    registerTool({
      name: 'echo.read',
      description: 'echo',
      schema: { type: 'object', properties: { token: { type: 'string' } }, additionalProperties: false },
      handler: async (args) => ({ saw: args.token }),
    });
    const secret = `sk-${'a'.repeat(32)}`;
    await call({ tool: 'echo.read', args: { token: secret } });

    const row = listToolCalls({ organizationId: 'acme' })[0]!;
    expect(JSON.stringify(row.args)).not.toContain(secret);
    expect(row.resultPreview ?? '').not.toContain(secret);
  });

  it('returns the real value to the caller even though the log is redacted', async () => {
    registerTool({
      name: 'echo.read',
      description: 'echo',
      schema: { type: 'object', properties: { token: { type: 'string' } }, additionalProperties: false },
      handler: async (args) => ({ saw: args.token }),
    });
    const secret = `sk-${'b'.repeat(32)}`;
    const res = await call({ tool: 'echo.read', args: { token: secret } });
    expect((res.result as { saw: string }).saw).toBe(secret);
  });
});
