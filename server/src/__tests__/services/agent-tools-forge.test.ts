import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { initDb } from '../../db/index.js';
import { invokeTool, clearTools, listTools } from '../../services/agent-tools.js';
import { registerGitTools } from '../../services/agent-tools-git.js';
import {
  registerForgeTools,
  setForgeFetchImplForTest,
  setForgePushImplForTest,
  gitWithCredential,
} from '../../services/agent-tools-forge.js';
import { unattendedTools } from '../../services/agent-evidence.js';
import { FORGE_TOKEN_ENV, FORGE_REPO_ENV } from '../../services/agent-forge.js';

const TOKEN = 'ghp_0123456789abcdefghijklmnop';
let workspace: string;

function git(args: string[], cwd = workspace): void {
  const res = spawnSync('git', args, {
    cwd,
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      GIT_AUTHOR_NAME: 'T',
      GIT_AUTHOR_EMAIL: 't@t.t',
      GIT_COMMITTER_NAME: 'T',
      GIT_COMMITTER_EMAIL: 't@t.t',
      GIT_CONFIG_NOSYSTEM: '1',
    },
  });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')}: ${res.stderr?.toString()}`);
}

const APPROVER = 'human@example.com';

/**
 * Invoke with the scope and approval the policy engine demands.
 *
 * `approverUserId` is part of the policy context, not the call: the agent may
 * not nominate its own approver. An `approvedBy` that does not match it is
 * refused, which is why both have to be supplied here.
 */
function call(tool: string, args: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return invokeTool({
    tool,
    args,
    organizationId: 'acme',
    projectId: 'web',
    workspaceRoot: workspace,
    grantedScopes: ['pull_request:write', 'repository:write'],
    approvedBy: APPROVER,
    policy: { approverUserId: APPROVER },
    ...overrides,
  } as never);
}

function prResponse(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('git.pull_request.create', () => {
  beforeEach(async () => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    process.env[FORGE_TOKEN_ENV] = TOKEN;
    process.env[FORGE_REPO_ENV] = 'acme/widgets';
    initDb(':memory:');
    clearTools();
    registerGitTools();
    registerForgeTools();

    workspace = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'forge-')));
    git(['init', '--initial-branch=main']);
    await fs.writeFile(path.join(workspace, 'README.md'), 'base\n', 'utf8');
    git(['add', '.']);
    git(['commit', '-m', 'base']);

    // A push that succeeds without a network, so the tool's own logic is what
    // is under test rather than git's transport.
    setForgePushImplForTest(async () => ({ code: 0, stdout: '', stderr: '' }));
  });

  afterEach(async () => {
    setForgeFetchImplForTest(undefined);
    setForgePushImplForTest(undefined);
    delete process.env[FORGE_TOKEN_ENV];
    delete process.env[FORGE_REPO_ENV];
    await fs.rm(workspace, { recursive: true, force: true });
  });

  async function workBranchWithCommit(): Promise<void> {
    git(['switch', '--create', 'agent/work']);
    await fs.writeFile(path.join(workspace, 'feature.txt'), 'new\n', 'utf8');
    git(['add', '.']);
    git(['commit', '-m', 'add feature']);
  }

  it('is registered', () => {
    expect(listTools().map((t) => t.name)).toContain('git.pull_request.create');
  });

  /**
   * invokeTool clamps a tool's declared timeout to MAX_TIMEOUT_MS. A tool that
   * declares more than the ceiling is not granted more time -- it just
   * documents a timeout that cannot occur, which is how this tool shipped its
   * first draft (180s declared, 120s enforced). Asserted for every registered
   * tool so the next one cannot repeat it.
   */
  it('declares no timeout above the ceiling the invoker enforces', () => {
    const MAX_TIMEOUT_MS = 120_000;
    const overCeiling = listTools()
      .map((t) => [t.name, (t as { timeoutMs?: number }).timeoutMs] as const)
      .filter(([, ms]) => ms !== undefined && ms > MAX_TIMEOUT_MS);

    expect(overCeiling).toEqual([]);
  });

  /**
   * The name matches the kernel's `*.pull_request.create` rule, which carries
   * requiredScopes and alwaysApprove. A near-miss name would fall to the
   * catch-all, which is higher risk but carries NO required scope.
   */
  it('is never available to an unattended phase', () => {
    expect(unattendedTools()).not.toContain('git.pull_request.create');
  });

  it('is refused without the pull_request:write scope', async () => {
    await workBranchWithCommit();
    const fetchImpl = vi.fn();
    setForgeFetchImplForTest(fetchImpl as unknown as typeof fetch);

    const result = await call('git.pull_request.create', { title: 't', body: 'b' }, {
      grantedScopes: [],
    });

    expect(result.outcome).toBe('denied');
    expect(String(result.reason)).toContain('pull_request:write');
    // Denied before anything left the machine.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('is refused without human approval even when scoped', async () => {
    await workBranchWithCommit();
    const fetchImpl = vi.fn();
    setForgeFetchImplForTest(fetchImpl as unknown as typeof fetch);

    const result = await call('git.pull_request.create', { title: 't', body: 'b' }, {
      approvedBy: undefined,
    });

    expect(result.outcome).toBe('denied');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('opens a pull request from the current branch', async () => {
    await workBranchWithCommit();
    const fetchImpl = vi.fn(async () =>
      prResponse({
        number: 7,
        html_url: 'https://github.com/acme/widgets/pull/7',
        state: 'open',
        title: 'Add feature',
      }),
    );
    setForgeFetchImplForTest(fetchImpl as unknown as typeof fetch);

    const result = await call('git.pull_request.create', {
      title: 'Add feature',
      body: 'Adds the thing.',
    });

    expect(result.outcome).toBe('ok');
    expect(result.result).toMatchObject({
      created: true,
      number: 7,
      branch: 'agent/work',
      base: 'main',
      repository: 'acme/widgets',
    });

    // The branch came from HEAD, not from an argument.
    const sent = JSON.parse(String((fetchImpl.mock.calls[0]?.[1] as RequestInit).body)) as {
      head: string;
    };
    expect(sent.head).toBe('agent/work');
  });

  it('is stopped by the protected-branch guard while HEAD is on main', async () => {
    // Still on main. This is refused one layer earlier than the tool's own
    // same-branch check: resolveTargetRef reports "main" to the policy engine,
    // which refuses a write to a protected ref before the handler runs.
    const fetchImpl = vi.fn();
    setForgeFetchImplForTest(fetchImpl as unknown as typeof fetch);

    const result = await call('git.pull_request.create', { title: 't', body: 'b' });

    expect(result.outcome).toBe('denied');
    expect(String(result.reason)).toMatch(/protected/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('still refuses head === base when the branch is not protected', async () => {
    // The tool's own check, reached when policy does not intervene: a pull
    // request from a branch into itself is meaningless.
    git(['switch', '--create', 'agent/work']);
    await fs.writeFile(path.join(workspace, 'f.txt'), 'x\n', 'utf8');
    git(['add', '.']);
    git(['commit', '-m', 'work']);

    const fetchImpl = vi.fn();
    setForgeFetchImplForTest(fetchImpl as unknown as typeof fetch);

    const result = await call('git.pull_request.create', {
      title: 't',
      body: 'b',
      base: 'agent/work',
    });

    expect(result.outcome).toBe('error');
    expect(String(result.reason)).toContain('itself');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports having nothing to propose rather than calling the forge', async () => {
    // A branch with no commits ahead of main.
    git(['switch', '--create', 'agent/empty']);
    const fetchImpl = vi.fn();
    setForgeFetchImplForTest(fetchImpl as unknown as typeof fetch);

    const result = await call('git.pull_request.create', { title: 't', body: 'b' });

    expect(result.outcome).toBe('ok');
    expect(result.result).toMatchObject({ created: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('is disabled with a 503 when no forge credential is configured', async () => {
    delete process.env[FORGE_TOKEN_ENV];
    delete process.env[FORGE_REPO_ENV];
    await workBranchWithCommit();

    const result = await call('git.pull_request.create', { title: 't', body: 'b' });

    expect(result.outcome).toBe('error');
    expect(String(result.reason)).toContain('not configured');
  });

  /**
   * The generic redactor in agent-tools.ts recognises credentials by SHAPE:
   * URL userinfo, GitHub-style prefixes, long high-entropy runs. Measured
   * against it directly, it catches every one of those. What it cannot catch
   * is a short, unremarkable credential printed as prose -- a self-hosted
   * forge token, for instance. redactToken is value-based and closes exactly
   * that gap, so it is tested with a credential the shape rules miss.
   */
  it('redacts a token the shape-based redactor would not recognise', async () => {
    // Long enough to pass the configuration guard, but no recognisable
    // prefix, no URL context, and not one unbroken high-entropy run.
    const opaque = 'forge-cred-for-internal-host';
    process.env[FORGE_TOKEN_ENV] = opaque;
    await workBranchWithCommit();

    setForgePushImplForTest(async () => ({
      code: 128,
      stdout: '',
      stderr: `remote: authentication failed with credential ${opaque} at git.internal.example`,
    }));

    const result = await call('git.pull_request.create', { title: 't', body: 'b' });

    expect(result.outcome).toBe('error');
    expect(JSON.stringify(result)).not.toContain(opaque);
    expect(String(result.reason)).toContain('***');
  });

  it('redacts the remote URL git echoes back when the push fails', async () => {
    await workBranchWithCommit();
    setForgePushImplForTest(async () => ({
      code: 128,
      stdout: '',
      stderr:
        'remote: Permission denied\n' +
        `fatal: unable to access 'https://x-access-token:${TOKEN}@github.com/acme/widgets.git/'`,
    }));

    const result = await call('git.pull_request.create', { title: 't', body: 'b' });

    expect(result.outcome).toBe('error');
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it('does not leak the token when a real git push fails', async () => {
    await workBranchWithCommit();
    // No stub at all: git actually runs and fails against a remote it cannot
    // reach. Slower and less precise than the test above, but it is the only
    // one that proves the assembled command line is credential-safe.
    setForgePushImplForTest(undefined);

    const result = await call('git.pull_request.create', { title: 't', body: 'b' });

    expect(result.outcome).toBe('error');
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it('does not leak the token when the forge rejects the request', async () => {
    await workBranchWithCommit();
    setForgeFetchImplForTest(
      vi.fn(async () => prResponse({ message: 'Bad credentials' }, 401)) as unknown as typeof fetch,
    );

    const result = await call('git.pull_request.create', { title: 't', body: 'b' });

    expect(result.outcome).toBe('error');
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it('records the call in the audit trail without the token', async () => {
    await workBranchWithCommit();
    setForgeFetchImplForTest(
      vi.fn(async () =>
        prResponse({ number: 9, html_url: 'https://github.com/acme/widgets/pull/9', state: 'open' }),
      ) as unknown as typeof fetch,
    );

    const result = await call('git.pull_request.create', { title: 'T', body: 'B' });
    expect(result.outcome).toBe('ok');
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it('honours an explicit base branch', async () => {
    git(['switch', '--create', 'develop']);
    git(['switch', 'main']);
    await workBranchWithCommit();

    const fetchImpl = vi.fn(async () =>
      prResponse({ number: 3, html_url: 'https://github.com/acme/widgets/pull/3', state: 'open' }),
    );
    setForgeFetchImplForTest(fetchImpl as unknown as typeof fetch);

    const result = await call('git.pull_request.create', {
      title: 't',
      body: 'b',
      base: 'develop',
    });

    expect(result.outcome).toBe('ok');
    const sent = JSON.parse(String((fetchImpl.mock.calls[0]?.[1] as RequestInit).body)) as {
      base: string;
    };
    expect(sent.base).toBe('develop');
  });

  it('rejects unknown arguments at the schema boundary', async () => {
    await workBranchWithCommit();
    const result = await call('git.pull_request.create', {
      title: 't',
      body: 'b',
      repository: 'evil/elsewhere',
    });
    // The repository is configuration, not an argument; asking for one is a
    // schema violation rather than a silently ignored field.
    expect(result.outcome).not.toBe('ok');
  });


  /**
   * The helper is tested directly because the tool-level tests cannot reach
   * its redaction: a real git run scrubs URL userinfo before printing, and a
   * stubbed push replaces the helper outright. Deleting the redaction inside
   * the helper therefore left every tool-level test green. This is the test
   * that kills that mutant.
   */
  describe('gitWithCredential', () => {
    it('redacts the token out of git output before returning it', async () => {
      const opaque = 'forge-cred-for-internal-host';
      // `git config --get` echoes back a value we plant, which is the
      // simplest way to make git itself print the credential verbatim.
      git(['config', 'agent.forgeProbe', opaque]);

      const res = await gitWithCredential(
        ['config', '--get', 'agent.forgeProbe'],
        {
          organizationId: 'acme',
          projectId: 'web',
          workspaceRoot: workspace,
          signal: new AbortController().signal,
        } as never,
        opaque,
      );

      expect(res.code).toBe(0);
      expect(res.stdout).not.toContain(opaque);
      expect(res.stdout).toContain('***');
    });

    it('never places the credential in the child process environment', async () => {
      const opaque = 'forge-cred-for-internal-host';
      // A `!`-prefixed git alias runs through a shell, which is the one way to
      // make git print its own environment back to us. If the token were
      // passed as an env var -- the obvious shortcut for authenticating a
      // push -- it would appear here.
      const res = await gitWithCredential(
        ['-c', 'alias.dumpenv=!env', 'dumpenv'],
        {
          organizationId: 'acme',
          projectId: 'web',
          workspaceRoot: workspace,
          signal: new AbortController().signal,
        } as never,
        opaque,
      );

      expect(res.code).toBe(0);
      expect(res.stdout).toContain('GIT_'); // the probe really did run
      expect(res.stdout).not.toContain(opaque);
      // And the provider keys the server holds do not ride along either.
      expect(res.stdout).not.toContain('ENCRYPTION_KEY');
      // An interactive prompt in a headless agent is a hang, not a login.
      expect(res.stdout).toMatch(/^GIT_TERMINAL_PROMPT=0$/m);
      // System git config could otherwise reintroduce a credential helper.
      expect(res.stdout).toMatch(/^GIT_CONFIG_NOSYSTEM=1$/m);
    });

    /**
     * GIT_ASKPASS is how git asks something else for a credential. If the
     * server process has one configured -- for the human who deployed it --
     * the agent must not inherit it, or the agent authenticates as that human
     * using a credential nobody granted it. The helper pins it to empty; this
     * proves the pin survives a hostile ambient environment.
     */
    it('does not inherit an askpass helper from the server process', async () => {
      const previous = process.env.GIT_ASKPASS;
      process.env.GIT_ASKPASS = '/usr/local/bin/human-credential-helper';
      try {
        const res = await gitWithCredential(
          ['-c', 'alias.dumpenv=!env', 'dumpenv'],
          {
            organizationId: 'acme',
            projectId: 'web',
            workspaceRoot: workspace,
            signal: new AbortController().signal,
          } as never,
          'forge-cred-for-internal-host',
        );

        expect(res.code).toBe(0);
        expect(res.stdout).not.toContain('human-credential-helper');
        expect(res.stdout).toMatch(/^GIT_ASKPASS=$/m);
      } finally {
        if (previous === undefined) delete process.env.GIT_ASKPASS;
        else process.env.GIT_ASKPASS = previous;
      }
    });
  });
});
