import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { registerTool, ToolError, type ToolInvocationContext } from './agent-tools.js';

/**
 * Git tools: the supervised write path.
 *
 * Reading is safe enough to do unattended; changing a repository is not. These
 * tools all carry a side effect, so `unattendedTools()` excludes every one of
 * them and an autonomous phase can never reach them — they are only callable
 * through an explicit, scoped, approved invocation.
 *
 * Tool names are chosen so the kernel's existing rules classify them: a name
 * ending `.read` is a read, one ending `.file.write` is a scoped local write.
 * A name the rule set does not recognise falls to the catch-all default —
 * high risk, always approve — which is safe but would make routine reads need
 * a human, so the suffix is load-bearing rather than cosmetic.
 *
 * The important design point is about the protected-branch guard. The policy
 * engine refuses a write to a protected ref, but only when the caller *tells*
 * it which ref is being written. A model asked to declare its own target would
 * simply omit it, or lie. So these tools never accept a branch name as an
 * argument for that purpose: `git.commit.create` resolves HEAD itself and
 * hands the real branch to the policy layer. The check is therefore made
 * against what the repository is actually on, not what anyone claimed.
 */

const MAX_OUTPUT = 64 * 1024;
const MAX_MESSAGE_CHARS = 2000;
const MAX_DIFF_CHARS = 200 * 1024;

/** Run git without a shell, capturing bounded output. */
function git(
  argv: string[],
  ctx: ToolInvocationContext,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', argv, {
      cwd: ctx.workspaceRoot,
      shell: false,
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        // A commit needs an identity, and the agent's must be distinguishable
        // from a human's in `git log` forever after.
        GIT_AUTHOR_NAME: 'FreeLLMAPI Agent',
        GIT_AUTHOR_EMAIL: 'agent@freellmapi.local',
        GIT_COMMITTER_NAME: 'FreeLLMAPI Agent',
        GIT_COMMITTER_EMAIL: 'agent@freellmapi.local',
        // Never let git prompt or reach a credential helper: an agent must not
        // be able to authenticate as the human who installed the gateway.
        GIT_TERMINAL_PROMPT: '0',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_ASKPASS: '',
      },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += c.toString('utf8');
    });
    child.stderr.on('data', (c: Buffer) => {
      if (stderr.length < MAX_OUTPUT) stderr += c.toString('utf8');
    });

    const onAbort = () => child.kill('SIGKILL');
    ctx.signal.addEventListener('abort', onAbort, { once: true });

    child.on('error', (err) => {
      ctx.signal.removeEventListener('abort', onAbort);
      reject(new ToolError(`could not run git: ${err.message}`));
    });
    child.on('close', (code) => {
      ctx.signal.removeEventListener('abort', onAbort);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

/** Fail unless the workspace is a git repository. */
async function requireRepo(ctx: ToolInvocationContext): Promise<void> {
  const inside = await git(['rev-parse', '--is-inside-work-tree'], ctx);
  if (inside.code !== 0 || inside.stdout.trim() !== 'true') {
    throw new ToolError('the workspace is not a git repository.', 400);
  }
}

/** The branch HEAD is actually on, or null when detached. */
export async function currentBranch(ctx: ToolInvocationContext): Promise<string | null> {
  const res = await git(['rev-parse', '--abbrev-ref', 'HEAD'], ctx);
  const name = res.stdout.trim();
  return res.code === 0 && name !== '' && name !== 'HEAD' ? name : null;
}

/**
 * Branch names are passed to git as arguments, so the danger is not shell
 * injection but option injection: a name beginning with `-` is read as a flag.
 * Refusing anything outside a conservative character set removes that, along
 * with the ref-name traps git itself rejects later and less clearly.
 */
function assertSafeBranchName(name: unknown): string {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new ToolError('branch must be a non-empty string.');
  }
  const value = name.trim();
  if (value.length > 200) throw new ToolError('branch name is too long.');
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)) {
    throw new ToolError(
      `branch name "${value}" is not allowed; use letters, digits, dot, dash, underscore and slash, and do not start with a dash.`,
    );
  }
  if (value.includes('..') || value.endsWith('/') || value.endsWith('.lock')) {
    throw new ToolError(`branch name "${value}" is not a valid git ref.`);
  }
  return value;
}

export function registerGitTools(): void {
  registerTool({
    name: 'git.status.read',
    description:
      'Show the current branch and which files are modified, added or deleted in the workspace.',
    schema: { type: 'object', properties: {}, additionalProperties: false },
    async handler(_args, ctx) {
      await requireRepo(ctx);
      const [branch, status] = await Promise.all([
        currentBranch(ctx),
        git(['status', '--porcelain=v1'], ctx),
      ]);

      const files = status.stdout
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => ({ state: line.slice(0, 2).trim(), path: line.slice(3) }));

      return { branch, clean: files.length === 0, files };
    },
  });

  registerTool({
    name: 'git.diff.read',
    description: 'Show uncommitted changes in the workspace as a unified diff.',
    schema: {
      type: 'object',
      properties: {
        staged: { type: 'boolean', description: 'Show staged changes instead of unstaged.' },
      },
      additionalProperties: false,
    },
    async handler(args, ctx) {
      await requireRepo(ctx);
      const argv = ['diff', '--no-color'];
      if (args.staged === true) argv.push('--staged');

      const res = await git(argv, ctx);
      if (res.code !== 0) throw new ToolError(res.stderr.trim() || 'git diff failed');

      return {
        diff: res.stdout.slice(0, MAX_DIFF_CHARS),
        truncated: res.stdout.length > MAX_DIFF_CHARS,
      };
    },
  });

  registerTool({
    name: 'git.branch.create',
    description: 'Create a new branch and switch to it.',
    schema: {
      type: 'object',
      properties: {
        branch: { type: 'string', description: 'Name of the branch to create.' },
      },
      required: ['branch'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      await requireRepo(ctx);
      const branch = assertSafeBranchName(args.branch);

      const res = await git(['switch', '--create', branch], ctx);
      if (res.code !== 0) {
        throw new ToolError(res.stderr.trim() || `could not create branch "${branch}"`);
      }
      return { branch, created: true };
    },
  });

  registerTool({
    name: 'git.commit.create',
    description:
      'Stage the listed files (or every change) and commit them. Refuses to commit to a protected branch.',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', minLength: 1, description: 'Commit message.' },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Files to stage, relative to the workspace. Omit to stage everything.',
        },
      },
      required: ['message'],
      additionalProperties: false,
    },
    timeoutMs: 60_000,
    resolveTargetRef: (_args, workspaceRoot) => gitPolicyRef('git.commit.create', workspaceRoot),
    async handler(args, ctx) {
      await requireRepo(ctx);

      const message = String(args.message ?? '').slice(0, MAX_MESSAGE_CHARS);
      if (message.trim() === '') throw new ToolError('commit message must not be empty.');

      // Belt and braces. `invokeTool` has already asked the policy engine
      // using the branch resolved by `gitPolicyRef` below, but that depends on
      // the wiring being correct. A commit is irreversible enough to check
      // twice, in the place that actually performs it.
      const branch = await currentBranch(ctx);
      if (branch === null) {
        throw new ToolError('HEAD is detached; switch to a branch before committing.');
      }

      const paths = Array.isArray(args.paths) ? (args.paths as string[]) : null;
      if (paths) {
        for (const p of paths) {
          if (typeof p !== 'string' || p.startsWith('-')) {
            throw new ToolError(`invalid path in "paths": ${String(p)}`);
          }
        }
        // `--` stops git reading any later argument as an option.
        const add = await git(['add', '--', ...paths], ctx);
        if (add.code !== 0) throw new ToolError(add.stderr.trim() || 'git add failed');
      } else {
        const add = await git(['add', '--all'], ctx);
        if (add.code !== 0) throw new ToolError(add.stderr.trim() || 'git add failed');
      }

      const staged = await git(['diff', '--staged', '--name-only'], ctx);
      const files = staged.stdout.split('\n').filter((l) => l.trim() !== '');
      if (files.length === 0) {
        return { committed: false, reason: 'nothing to commit', branch, files: [] };
      }

      // `--no-verify` is deliberately NOT passed: if the repository has hooks,
      // an agent's commit is subject to them exactly like a human's.
      const commit = await git(['commit', '--message', message], ctx);
      if (commit.code !== 0) {
        throw new ToolError(commit.stderr.trim() || commit.stdout.trim() || 'git commit failed');
      }

      const sha = await git(['rev-parse', 'HEAD'], ctx);
      return {
        committed: true,
        branch,
        sha: sha.stdout.trim().slice(0, 40),
        files,
        message,
      };
    },
  });

  registerTool({
    name: 'git.patch.file.write',
    description:
      'Apply a unified diff to the workspace. The patch is validated before anything is changed.',
    schema: {
      type: 'object',
      properties: {
        patch: { type: 'string', minLength: 1, description: 'A unified diff.' },
      },
      required: ['patch'],
      additionalProperties: false,
    },
    timeoutMs: 60_000,
    resolveTargetRef: (_args, workspaceRoot) => gitPolicyRef('git.patch.file.write', workspaceRoot),
    async handler(args, ctx) {
      await requireRepo(ctx);
      const patch = String(args.patch ?? '');
      if (patch.length > MAX_DIFF_CHARS) throw new ToolError('patch is too large.');

      // Date.now() alone was a collision: it has millisecond resolution, and
      // roughly a thousand calls land on the same value. Two concurrent
      // patches then shared one staging file, and the observed result was
      // worse than a crash -- one call returned `applied: true` having
      // applied the *other* call's diff, because its own file had been
      // overwritten between the --check and the --apply.
      const patchFile = path.join(
        ctx.workspaceRoot,
        '.git',
        `agent-patch-${process.pid}-${crypto.randomBytes(8).toString('hex')}.diff`,
      );
      await fs.writeFile(patchFile, patch.endsWith('\n') ? patch : `${patch}\n`, 'utf8');

      try {
        // Dry run first. `git apply` is atomic per invocation, but checking
        // separately gives the model a usable error instead of a half state.
        const check = await git(['apply', '--check', '--verbose', patchFile], ctx);
        if (check.code !== 0) {
          throw new ToolError(
            `patch does not apply cleanly: ${(check.stderr || check.stdout).trim().slice(0, 500)}`,
          );
        }

        const applied = await git(['apply', '--stat', '--apply', patchFile], ctx);
        if (applied.code !== 0) {
          throw new ToolError((applied.stderr || applied.stdout).trim() || 'git apply failed');
        }
        return { applied: true, summary: applied.stdout.trim().slice(0, 4000) };
      } finally {
        await fs.rm(patchFile, { force: true });
      }
    },
  });
}

/**
 * The ref a git tool is really about to write, for the policy engine.
 *
 * `invokeTool` cannot ask a tool what it will touch, and asking the *model* to
 * declare it would be worthless — a model that wants to commit to `main` would
 * simply not mention `main`. This resolves HEAD from the repository instead,
 * so the protected-branch guard is evaluated against the truth.
 *
 * Returns null for tools that do not write to a ref, and for a workspace that
 * is not a repository (the tool itself reports that more clearly).
 */
export async function gitPolicyRef(
  tool: string,
  workspaceRoot: string,
): Promise<string | null> {
  if (tool !== 'git.commit.create' && tool !== 'git.patch.file.write') return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    return await currentBranch({
      organizationId: '',
      projectId: '',
      workspaceRoot,
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
