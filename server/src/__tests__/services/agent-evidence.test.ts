import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initDb } from '../../db/index.js';
import { clearTools, registerTool, listToolCalls } from '../../services/agent-tools.js';
import { registerBuiltinTools } from '../../services/agent-tools-builtin.js';
import {
  gatherEvidence,
  unattendedTools,
  parseToolRequest,
} from '../../services/agent-evidence.js';
import { createRun } from '../../services/agent-runtime.js';
import { advance } from '../../services/agent-driver.js';

/**
 * Evidence gathering joins the two halves of the agent: the driver decides,
 * the tools act. The risk of joining them is that autonomy quietly acquires
 * authority, so most of this file is about what the loop refuses to do.
 */

let workspace: string;

async function makeWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-evidence-'));
  return fs.realpath(dir);
}

/** A model that replies with a scripted sequence, one entry per turn. */
function scripted(...replies: string[]) {
  let i = 0;
  const seen: string[] = [];
  const ask = async (prompt: string) => {
    seen.push(prompt);
    return replies[Math.min(i++, replies.length - 1)]!;
  };
  return { ask, seen, get calls() { return i; } };
}

describe('unattended tool selection', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    clearTools();
    registerBuiltinTools();
  });

  it('allows read-only tools', () => {
    const safe = unattendedTools();
    expect(safe).toContain('fs.read_file');
    expect(safe).toContain('fs.search');
    expect(safe).toContain('fs.list');
  });

  it('excludes anything that writes or needs approval', () => {
    const safe = unattendedTools();
    // fs.file.write needs a scope; sandbox.test has a local_write side effect.
    expect(safe).not.toContain('fs.file.write');
    expect(safe).not.toContain('sandbox.test');
  });

  it('excludes a dangerous tool added later, without being told about it', () => {
    // The set is derived from policy, so a new tool is covered automatically.
    registerTool({
      name: 'deploy.production',
      description: 'ship',
      schema: { type: 'object', properties: {}, additionalProperties: false },
      handler: async () => 'shipped',
    });
    expect(unattendedTools()).not.toContain('deploy.production');
  });
});

describe('tool request parsing', () => {
  it('reads a bare tool request', () => {
    expect(parseToolRequest('TOOL fs.list {"path":"."}')).toEqual({
      tool: 'fs.list',
      args: { path: '.' },
    });
  });

  it('accepts a request with no arguments', () => {
    expect(parseToolRequest('TOOL fs.list')).toEqual({ tool: 'fs.list', args: {} });
  });

  it('finds the request on its own line among prose', () => {
    const parsed = parseToolRequest('Let me check first.\nTOOL fs.read_file {"path":"a.ts"}');
    expect(parsed?.tool).toBe('fs.read_file');
  });

  it('treats a final answer as an answer, not a tool call', () => {
    expect(parseToolRequest('clear\nThe goal is specific enough.')).toBeNull();
  });

  it('treats malformed JSON as an answer so the loop cannot spin', () => {
    expect(parseToolRequest('TOOL fs.list {oops')).toBeNull();
  });

  it('rejects a non-object argument payload', () => {
    expect(parseToolRequest('TOOL fs.list ["a"]')).toBeNull();
  });
});

describe('evidence gathering', () => {
  beforeEach(async () => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    clearTools();
    registerBuiltinTools();
    workspace = await makeWorkspace();
    await fs.writeFile(path.join(workspace, 'app.ts'), 'export const port = 3001;\n');
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  function gather(replies: string[], overrides: Record<string, unknown> = {}) {
    const model = scripted(...replies);
    return {
      model,
      result: gatherEvidence({
        runId: 'run_1',
        organizationId: 'acme',
        projectId: 'web',
        workspaceRoot: workspace,
        allowedTools: ['fs.read_file', 'fs.list', 'fs.search'],
        basePrompt: 'Decide whether the goal is clear.',
        ask: model.ask,
        ...overrides,
      }),
    };
  }

  it('answers directly when the model does not ask for a tool', async () => {
    const { model, result } = gather(['clear\nGood enough.']);
    const out = await result;

    expect(out.evidence).toHaveLength(0);
    expect(out.finalAnswer).toContain('clear');
    expect(model.calls).toBe(1);
  });

  it('runs a requested tool and feeds the result back', async () => {
    const { result } = gather(['TOOL fs.read_file {"path":"app.ts"}', 'clear\nI read the file.']);
    const out = await result;

    expect(out.evidence).toHaveLength(1);
    expect(out.evidence[0]!.ok).toBe(true);
    expect(out.evidence[0]!.summary).toContain('port = 3001');
    expect(out.finalAnswer).toContain('clear');
  });

  it('shows the model what it already found', async () => {
    const { model, result } = gather([
      'TOOL fs.read_file {"path":"app.ts"}',
      'clear\nDone.',
    ]);
    await result;

    // The second prompt must carry the first result forward.
    expect(model.seen[1]).toContain('What you have found so far');
    expect(model.seen[1]).toContain('port = 3001');
  });

  it('stops asking once the model answers', async () => {
    const { model, result } = gather(['TOOL fs.list {"path":"."}', 'clear\nSeen enough.'], {
      maxCalls: 5,
    });
    await result;
    expect(model.calls).toBe(2);
  });

  it('forces a decision when the model will not stop asking', async () => {
    // A model stuck in a loop: it always wants one more look.
    const { result } = gather(['TOOL fs.list {"path":"."}'], { maxCalls: 3 });
    const out = await result;

    expect(out.budgetExhausted).toBe(true);
    expect(out.evidence).toHaveLength(3);
  });

  it('refuses a tool outside the phase allowance and tells the model why', async () => {
    const { result } = gather([
      'TOOL fs.file.write {"path":"x.txt","content":"hi"}',
      'clear\nFine.',
    ]);
    const out = await result;

    expect(out.evidence[0]!.ok).toBe(false);
    expect(out.evidence[0]!.summary).toContain('not available in this phase');
    // The write must not have happened.
    expect(await fs.stat(path.join(workspace, 'x.txt')).catch(() => null)).toBeNull();
  });

  it('never offers a write tool, even when the phase asks for one', async () => {
    // The phase's list is intersected with what is safe unattended, so naming
    // a write tool here must not make it available. Asserting on the
    // *catalogue* rather than the failed write is what distinguishes this
    // layer from invokeTool's own scope check further down.
    const { model, result } = gather(
      ['TOOL fs.file.write {"path":"y.txt","content":"hi"}', 'clear'],
      { allowedTools: ['fs.read_file', 'fs.file.write'] },
    );
    const out = await result;

    // Not advertised to the model at all.
    expect(model.seen[0]).toContain('fs.read_file');
    expect(model.seen[0]).not.toContain('fs.file.write');

    // And if the model names it anyway, it is rejected by the allowance check
    // before any handler runs -- so there is no audit row for an attempted write.
    expect(out.evidence[0]!.ok).toBe(false);
    expect(out.evidence[0]!.summary).toContain('not available in this phase');
    expect(listToolCalls({ runId: 'run_1' })).toHaveLength(0);
    expect(await fs.stat(path.join(workspace, 'y.txt')).catch(() => null)).toBeNull();
  });

  it('cannot escape the workspace', async () => {
    const { result } = gather([
      'TOOL fs.read_file {"path":"../../etc/passwd"}',
      'clear\nBlocked.',
    ]);
    const out = await result;

    expect(out.evidence[0]!.ok).toBe(false);
    expect(out.evidence[0]!.summary).toContain('escapes the workspace');
  });

  it('records every tool call in the audit trail', async () => {
    const { result } = gather(['TOOL fs.list {"path":"."}', 'clear']);
    await result;

    const rows = listToolCalls({ runId: 'run_1' });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tool).toBe('fs.list');
  });

  it('redacts a secret that appears in an ordinary file', async () => {
    // Deliberately NOT a credential filename: this exercises the redaction
    // layer, which only runs on files the tool agrees to open. A secret can
    // appear anywhere — a test fixture, a stray log — and that is the case
    // pattern-based redaction exists for.
    await fs.writeFile(path.join(workspace, 'notes.txt'), `OPENAI_API_KEY=sk-${'a'.repeat(32)}\n`);
    const { model, result } = gather(['TOOL fs.read_file {"path":"notes.txt"}', 'clear']);
    await result;

    const secondPrompt = model.seen[1]!;
    expect(secondPrompt).not.toContain('a'.repeat(32));
    expect(secondPrompt).toContain('REDACTED');
  });

  it('never opens a credential file in the first place', async () => {
    // The stronger guarantee, and the reason the test above had to move off
    // `.env`: redaction catches secrets shaped like known patterns, but a
    // `.env` holds arbitrary values. Refusing by filename covers what the
    // pattern matcher cannot.
    await fs.writeFile(path.join(workspace, '.env'), 'INTERNAL_TOKEN=plain_words_no_pattern\n');
    const { model, result } = gather(['TOOL fs.read_file {"path":".env"}', 'clear']);
    await result;

    const secondPrompt = model.seen[1]!;
    expect(secondPrompt).not.toContain('plain_words_no_pattern');
    expect(secondPrompt).toContain('refusing to read');
  });

  it('skips the loop entirely when no tools are available', async () => {
    const { model, result } = gather(['clear'], { allowedTools: [] });
    const out = await result;

    expect(out.evidence).toHaveLength(0);
    expect(model.calls).toBe(1);
  });
});

describe('driver with evidence', () => {
  beforeEach(async () => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    clearTools();
    registerBuiltinTools();
    workspace = await makeWorkspace();
    await fs.writeFile(path.join(workspace, 'app.ts'), 'export const port = 3001;\n');
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  function start() {
    return createRun({
      organizationId: 'acme',
      projectId: 'web',
      goal: 'Add rate limiting to the public API',
      mode: 'paid',
    });
  }

  it('lets a phase read the repository before it decides', async () => {
    const run = start();
    let turn = 0;
    const result = await advance({
      runId: run.runId,
      workspaceRoot: workspace,
      complete: async () => {
        turn++;
        return turn === 1
          ? { outcome: '', detail: 'TOOL fs.read_file {"path":"app.ts"}' }
          : { outcome: 'clear', detail: 'The port is defined in app.ts.' };
      },
    });

    expect(result.ok).toBe(true);
    expect(result.run.state).toBe('PLAN');
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence![0]!.tool).toBe('fs.read_file');
  });

  it('records on the checkpoint what the decision was based on', async () => {
    const run = start();
    let turn = 0;
    await advance({
      runId: run.runId,
      workspaceRoot: workspace,
      complete: async () => {
        turn++;
        return turn === 1
          ? { outcome: '', detail: 'TOOL fs.list {"path":"."}' }
          : { outcome: 'clear', detail: 'Looked at the tree.' };
      },
    });

    const rows = listToolCalls({ runId: run.runId });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tool).toBe('fs.list');
  });

  it('behaves exactly as before when no workspace is supplied', async () => {
    const run = start();
    let calls = 0;
    const result = await advance({
      runId: run.runId,
      complete: async () => {
        calls++;
        return { outcome: 'clear' };
      },
    });

    expect(calls).toBe(1);
    expect(result.evidence).toBeUndefined();
    expect(result.run.state).toBe('PLAN');
  });

  it('still refuses an illegal outcome after gathering evidence', async () => {
    const run = start();
    let turn = 0;
    const result = await advance({
      runId: run.runId,
      workspaceRoot: workspace,
      complete: async () => {
        turn++;
        return turn === 1
          ? { outcome: '', detail: 'TOOL fs.list {"path":"."}' }
          : { outcome: 'deploy_approved', detail: 'Ship it.' };
      },
    });

    // Evidence changes what the model knows, never what it may say.
    expect(result.ok).toBe(false);
    expect(result.stopped).toBe('refused');
    expect(result.run.state).toBe('INTAKE');
  });
});

describe('gateway completion feeds evidence gathering', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    clearTools();
    registerBuiltinTools();
  });

  it('passes a long tool request through untruncated', async () => {
    // Regression: the driver builds the evidence-layer text from
    // `outcome + detail`. `outcome` is clipped to 40 characters, so `detail`
    // must carry the whole reply or a TOOL line loses the end of its JSON.
    const line = 'TOOL fs.read_file {"path":"src/server.ts","encoding":"utf8"}';
    const response = { outcome: line.slice(0, 40), detail: line };

    const text = `${response.outcome}\n${response.detail}`;
    expect(parseToolRequest(text)).toEqual({
      tool: 'fs.read_file',
      args: { path: 'src/server.ts', encoding: 'utf8' },
    });
  });
});
