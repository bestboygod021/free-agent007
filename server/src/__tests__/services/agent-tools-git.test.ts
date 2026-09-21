import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { initDb } from '../../db/index.js';
import { clearTools, invokeTool, listToolCalls } from '../../services/agent-tools.js';
import { registerBuiltinTools } from '../../services/agent-tools-builtin.js';
import { registerGitTools } from '../../services/agent-tools-git.js';
import { unattendedTools } from '../../services/agent-evidence.js';

/**
 * Git tools are the supervised write path. The tests that matter most are the
 * ones showing an agent cannot reach them on its own, and cannot commit to a
 * protected branch by keeping quiet about which branch it is on.
 */

let repo: string;

function run(argv: string[], cwd: string): string {
  return execFileSync('git', argv, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 't@example.com',
    },
  });
}

async function makeRepo(): Promise<string> {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agent-git-')));
  run(['init', '--initial-branch=main'], dir);
  await fs.writeFile(path.join(dir, 'app.ts'), 'export const port = 3001;\n');
  run(['add', '.'], dir);
  run(['commit', '-m', 'initial'], dir);
  return dir;
}

function call(tool: string, args: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return invokeTool({
    tool,
    args,
    organizationId: 'acme',
    projectId: 'web',
    workspaceRoot: repo,
    grantedScopes: ['repository:write'],
    ...overrides,
  } as Parameters<typeof invokeTool>[0]);
}

describe('git tools', () => {
  beforeEach(async () => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    clearTools();
    registerBuiltinTools();
    registerGitTools();
    repo = await makeRepo();
  });

  afterEach(async () => {
    await fs.rm(repo, { recursive: true, force: true });
  });

  // --- the boundary that matters ---------------------------------------

  it('is never offered to an unattended phase', () => {
    // Every git tool has a side effect, so the derived safe set excludes them.
    const safe = unattendedTools();
    expect(safe).not.toContain('git.commit.create');
    expect(safe).not.toContain('git.branch.create');
    expect(safe).not.toContain('git.patch.file.write');
    // Read-only git tools are fine to expose.
    expect(safe).toContain('git.status.read');
    expect(safe).toContain('git.diff.read');
  });

  it('refuses to commit to a protected branch even though nobody declared it', async () => {
    // The repo is on `main`. The model says nothing about branches; the tool
    // resolves HEAD itself, so the guard still fires.
    await fs.writeFile(path.join(repo, 'app.ts'), 'export const port = 4000;\n');
    const res = await call('git.commit.create', { message: 'change the port' });

    expect(res.outcome).toBe('denied');
    expect(res.reason).toContain('protected ref "main"');
    expect(run(['log', '--oneline'], repo).trim().split('\n')).toHaveLength(1);
  });

  it('commits happily on a working branch', async () => {
    run(['switch', '--create', 'agent/work'], repo);
    await fs.writeFile(path.join(repo, 'app.ts'), 'export const port = 4000;\n');

    const res = await call('git.commit.create', { message: 'change the port' });
    expect(res.ok).toBe(true);
    const result = res.result as { committed: boolean; branch: string; files: string[] };
    expect(result.committed).toBe(true);
    expect(result.branch).toBe('agent/work');
    expect(result.files).toContain('app.ts');
  });

  it('records the agent as the author, not the human', async () => {
    run(['switch', '--create', 'agent/work'], repo);
    await fs.writeFile(path.join(repo, 'app.ts'), 'x\n');
    await call('git.commit.create', { message: 'agent change' });

    expect(run(['log', '-1', '--format=%an <%ae>'], repo).trim()).toBe(
      'FreeLLMAPI Agent <agent@freellmapi.local>',
    );
  });

  it('needs the repository:write scope', async () => {
    run(['switch', '--create', 'agent/work'], repo);
    await fs.writeFile(path.join(repo, 'app.ts'), 'x\n');

    const res = await call('git.commit.create', { message: 'no scope' }, { grantedScopes: [] });
    expect(res.outcome).toBe('denied');
    expect(res.reason).toContain('scope');
  });

  // --- argument handling ------------------------------------------------

  it('refuses a branch name that would be read as an option', async () => {
    const res = await call('git.branch.create', { branch: '--upload-pack=touch /tmp/x' });
    expect(res.outcome).toBe('error');
    expect(res.reason).toContain('not allowed');
  });

  it('refuses a branch name git would reject anyway', async () => {
    const res = await call('git.branch.create', { branch: 'feature/..slip' });
    expect(res.outcome).toBe('error');
  });

  it('creates and switches to a branch', async () => {
    const res = await call('git.branch.create', { branch: 'agent/feature-1' });
    expect(res.ok).toBe(true);
    expect(run(['rev-parse', '--abbrev-ref', 'HEAD'], repo).trim()).toBe('agent/feature-1');
  });

  it('refuses a path that would be read as an option', async () => {
    run(['switch', '--create', 'agent/work'], repo);
    await fs.writeFile(path.join(repo, 'app.ts'), 'x\n');

    const res = await call('git.commit.create', {
      message: 'sneaky',
      paths: ['--all', 'app.ts'],
    });
    expect(res.outcome).toBe('error');
    expect(res.reason).toContain('invalid path');
  });

  // --- status, diff, patch ---------------------------------------------

  it('reports status and the current branch', async () => {
    await fs.writeFile(path.join(repo, 'new.ts'), 'export const x = 1;\n');
    const res = await call('git.status.read', {});

    const result = res.result as { branch: string; clean: boolean; files: { path: string }[] };
    expect(result.branch).toBe('main');
    expect(result.clean).toBe(false);
    expect(result.files.some((f) => f.path === 'new.ts')).toBe(true);
  });

  it('shows a diff of uncommitted work', async () => {
    await fs.writeFile(path.join(repo, 'app.ts'), 'export const port = 9999;\n');
    const res = await call('git.diff.read', {});
    expect((res.result as { diff: string }).diff).toContain('9999');
  });

  it('applies a valid patch', async () => {
    run(['switch', '--create', 'agent/work'], repo);
    const patch = [
      'diff --git a/app.ts b/app.ts',
      'index 0000000..1111111 100644',
      '--- a/app.ts',
      '+++ b/app.ts',
      '@@ -1 +1 @@',
      '-export const port = 3001;',
      '+export const port = 8080;',
      '',
    ].join('\n');

    const res = await call('git.patch.file.write', { patch });
    expect(res.ok).toBe(true);
    expect(await fs.readFile(path.join(repo, 'app.ts'), 'utf8')).toContain('8080');
  });

  it('refuses a patch that does not apply, leaving the tree untouched', async () => {
    run(['switch', '--create', 'agent/work'], repo);
    const before = await fs.readFile(path.join(repo, 'app.ts'), 'utf8');
    const patch = [
      'diff --git a/app.ts b/app.ts',
      '--- a/app.ts',
      '+++ b/app.ts',
      '@@ -1 +1 @@',
      '-export const port = 1234;',
      '+export const port = 8080;',
      '',
    ].join('\n');

    const res = await call('git.patch.file.write', { patch });
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('does not apply cleanly');
    expect(await fs.readFile(path.join(repo, 'app.ts'), 'utf8')).toBe(before);
  });

  it('applies a patch only on a non-protected branch', async () => {
    // Still on main: the same guard covers patching, not just committing.
    const patch = [
      'diff --git a/app.ts b/app.ts',
      '--- a/app.ts',
      '+++ b/app.ts',
      '@@ -1 +1 @@',
      '-export const port = 3001;',
      '+export const port = 8080;',
      '',
    ].join('\n');

    const res = await call('git.patch.file.write', { patch });
    expect(res.outcome).toBe('denied');
    expect(res.reason).toContain('protected ref "main"');
  });

  it('leaves no patch file behind', async () => {
    run(['switch', '--create', 'agent/work'], repo);
    await call('git.patch.file.write', { patch: 'not a real patch\n' });

    const leftovers = (await fs.readdir(path.join(repo, '.git'))).filter((f) =>
      f.startsWith('agent-patch-'),
    );
    expect(leftovers).toEqual([]);
  });

  it('reports a non-repository clearly', async () => {
    const plain = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'not-a-repo-')));
    try {
      const res = await call('git.status.read', {}, { workspaceRoot: plain });
      expect(res.outcome).toBe('error');
      expect(res.reason).toContain('not a git repository');
    } finally {
      await fs.rm(plain, { recursive: true, force: true });
    }
  });

  it('says nothing to commit rather than failing', async () => {
    run(['switch', '--create', 'agent/work'], repo);
    const res = await call('git.commit.create', { message: 'empty' });
    expect(res.ok).toBe(true);
    expect((res.result as { committed: boolean }).committed).toBe(false);
  });

  it('audits every git call against the run', async () => {
    await call('git.status.read', {}, { runId: 'run_g' });
    const rows = listToolCalls({ runId: 'run_g' });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tool).toBe('git.status.read');
  });
});

describe('git tools and the autonomous driver', () => {
  beforeEach(async () => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    clearTools();
    registerBuiltinTools();
    registerGitTools();
    repo = await makeRepo();
  });

  afterEach(async () => {
    await fs.rm(repo, { recursive: true, force: true });
  });

  it('offers read-only git tools to a phase but never a write tool', async () => {
    const { advance } = await import('../../services/agent-driver.js');
    const { createRun } = await import('../../services/agent-runtime.js');
    const run = createRun({
      organizationId: 'acme',
      projectId: 'web',
      goal: 'inspect the repository',
      mode: 'paid',
    });

    let firstPrompt = '';
    let turn = 0;
    await advance({
      runId: run.runId,
      workspaceRoot: repo,
      complete: async (request) => {
        turn++;
        if (turn === 1) {
          firstPrompt = request.prompt;
          return { outcome: '', detail: 'TOOL git.status.read {}' };
        }
        return { outcome: 'clear', detail: 'Checked the repo state.' };
      },
    });

    expect(firstPrompt).toContain('git.status.read');
    expect(firstPrompt).not.toContain('git.commit.create');
    expect(firstPrompt).not.toContain('git.patch.file.write');
  });

  it('lets a phase read git state as evidence', async () => {
    const { advance } = await import('../../services/agent-driver.js');
    const { createRun } = await import('../../services/agent-runtime.js');
    await fs.writeFile(path.join(repo, 'app.ts'), 'export const port = 9999;\n');
    const run = createRun({
      organizationId: 'acme',
      projectId: 'web',
      goal: 'inspect the repository',
      mode: 'paid',
    });

    let turn = 0;
    const result = await advance({
      runId: run.runId,
      workspaceRoot: repo,
      complete: async () => {
        turn++;
        return turn === 1
          ? { outcome: '', detail: 'TOOL git.diff.read {}' }
          : { outcome: 'clear', detail: 'Saw the uncommitted change.' };
      },
    });

    expect(result.ok).toBe(true);
    expect(result.evidence![0]!.tool).toBe('git.diff.read');
    expect(result.evidence![0]!.summary).toContain('9999');
  });
});
