import { spawn } from 'node:child_process';
import { registerTool, ToolError, type ToolInvocationContext } from './agent-tools.js';
import {
  forgeConfig,
  createPullRequest,
  authenticatedRemoteUrl,
  redactToken,
  ForgeError,
  type ForgeConfig,
} from './agent-forge.js';
import { currentBranch } from './agent-tools-git.js';

/**
 * Opening a pull request: the agent's only externally visible write.
 *
 * Every other tool in this codebase changes a file, a database row, or
 * nothing. This one makes something appear in a place other humans look, under
 * an identity, permanently. It is treated accordingly.
 *
 * **The name is doing real work.** `git.pull_request.create` matches the
 * kernel's existing `*.pull_request.create` rule, which means:
 *
 *     sideEffect: external_write, riskLevel: medium,
 *     requiredScopes: ['pull_request:write'], alwaysApprove: true
 *
 * Verified live before this file was written. Without `pull_request:write` in
 * `AGENT_GRANTED_SCOPES` the call is refused outright; with it, a human must
 * still approve every single invocation — `alwaysApprove` is not satisfiable
 * by configuration. The near-miss names I tried first (`git.pr.create`,
 * `forge.pr.create`) fall to the catch-all instead: superficially stricter
 * (`high` risk) but they carry **no required scope**, so an operator who never
 * configured scopes would have a tool that needs only an approval click rather
 * than a deliberate grant. Matching the existing rule is strictly better.
 *
 * **Why pushing lives here and not in the git tools.** `agent-tools-git.ts`
 * clears `GIT_ASKPASS` and sets `GIT_TERMINAL_PROMPT=0` precisely so an agent
 * cannot authenticate as the human who installed the gateway. That property is
 * preserved: those tools still cannot push. This module pushes using the
 * separate, operator-configured forge credential, passed on the command line
 * for one invocation rather than written into `.git/config`.
 */

const MAX_OUTPUT = 32 * 1024;

/**
 * Matches MAX_TIMEOUT_MS in agent-tools.ts, which clamps whatever a tool
 * declares. An earlier version asked for 180s and was silently cut to 120s,
 * so the declared ceiling described a timeout that could never happen. A push
 * plus a forge round-trip genuinely can be slow, so this takes the whole
 * budget the invoker allows rather than a number that reads generous and is
 * not.
 */
const PUSH_TIMEOUT_MS = 120_000;

/**
 * Run git for the push. Deliberately a second, narrower spawn helper rather
 * than reusing the one in `agent-tools-git.ts`: this is the only git
 * invocation in the codebase that is handed a credential, and keeping it
 * visibly separate means a future edit to the credential-free helper cannot
 * accidentally start leaking one.
 */
export function gitWithCredential(
  argv: string[],
  ctx: ToolInvocationContext,
  token: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', argv, {
      cwd: ctx.workspaceRoot,
      shell: false,
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        GIT_TERMINAL_PROMPT: '0',
        GIT_CONFIG_NOSYSTEM: '1',
        // Still empty. The credential is in the remote URL for this one
        // command; git must not be able to fall back to a helper and pick up
        // the operator's identity if that credential is rejected.
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
      reject(new ToolError(`could not run git: ${redactToken(err.message, token)}`));
    });
    child.on('close', (code) => {
      ctx.signal.removeEventListener('abort', onAbort);
      // git echoes the remote URL on failure, and the remote URL contains the
      // token. Redacting at the boundary means no later caller has to remember.
      resolve({
        code: code ?? -1,
        stdout: redactToken(stdout, token),
        stderr: redactToken(stderr, token),
      });
    });
  });
}

/** Test seam for the forge HTTP call. Module-level for the same reason as web tools. */
let forgeFetchImpl: typeof fetch | undefined;

export function setForgeFetchImplForTest(impl: typeof fetch | undefined): void {
  forgeFetchImpl = impl;
}

/** Test seam for the push, so tests do not need a real remote. */
let pushImpl: typeof gitWithCredential | undefined;

export function setForgePushImplForTest(impl: typeof gitWithCredential | undefined): void {
  pushImpl = impl;
}

async function pushBranch(
  config: ForgeConfig,
  branch: string,
  ctx: ToolInvocationContext,
): Promise<void> {
  const run = pushImpl ?? gitWithCredential;
  const result = await run(
    // `--` is not available for push; instead the refspec is built from a
    // branch name that assertSafeBranchName has already validated, and the
    // remote is a URL we constructed rather than anything the caller supplied.
    ['push', authenticatedRemoteUrl(config), `refs/heads/${branch}:refs/heads/${branch}`],
    ctx,
    config.token,
  );
  if (result.code !== 0) {
    // Redacted a second time, deliberately. gitWithCredential already redacts,
    // but this is the boundary where git output becomes a user-visible error,
    // and it must not depend on an upstream helper having remembered. Deleting
    // either layer leaves a test red.
    const detail = redactToken(
      result.stderr.trim() || result.stdout.trim() || 'git push failed',
      config.token,
    );
    throw new ToolError(`could not push "${branch}": ${detail}`, 502);
  }
}

export function registerForgeTools(): void {
  registerTool({
    name: 'git.pull_request.create',
    description:
      'Push the current branch to the configured repository and open a pull request against the base branch. ' +
      'Requires the pull_request:write scope and explicit human approval on every call.',
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, description: 'Pull request title.' },
        body: {
          type: 'string',
          description: 'Pull request description, in Markdown. Explain what changed and why.',
        },
        base: {
          type: 'string',
          description: 'Branch to merge into. Defaults to the repository default branch.',
        },
      },
      required: ['title', 'body'],
      additionalProperties: false,
    },
    timeoutMs: PUSH_TIMEOUT_MS,
    // The branch is resolved from HEAD, never taken as an argument: a model
    // asked to declare what it is about to push would simply not mention that
    // it is on a protected branch.
    resolveTargetRef: async (_args, workspaceRoot) => {
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
    },
    async handler(args, ctx) {
      const configured = forgeConfig();
      if (!configured.ok) throw new ToolError(configured.reason, 503);
      const config = configured.config;

      const branch = await currentBranch(ctx);
      if (branch === null) {
        throw new ToolError('HEAD is detached; switch to a branch before opening a pull request.');
      }

      const base = typeof args.base === 'string' && args.base.trim() !== ''
        ? args.base.trim()
        : 'main';

      if (branch === base) {
        throw new ToolError(
          `refusing to open a pull request from "${branch}" into itself; ` +
            'create a working branch first with git.branch.create.',
        );
      }

      // Nothing to propose is an outcome, not an error: an agent that reaches
      // this step with an empty branch should be told so, not handed a forge
      // error about an empty diff.
      const ahead = await gitWithCredential(
        ['rev-list', '--count', `${base}..HEAD`],
        ctx,
        config.token,
      );
      if (ahead.code === 0 && ahead.stdout.trim() === '0') {
        return {
          created: false,
          reason: `branch "${branch}" has no commits that "${base}" does not already have`,
          branch,
          base,
        };
      }

      await pushBranch(config, branch, ctx);

      try {
        const pr = await createPullRequest(
          config,
          {
            title: String(args.title ?? ''),
            body: String(args.body ?? ''),
            head: branch,
            base,
          },
          {
            signal: ctx.signal,
            ...(forgeFetchImpl ? { fetchImpl: forgeFetchImpl } : {}),
          },
        );
        return {
          created: true,
          number: pr.number,
          url: pr.url,
          state: pr.state,
          title: pr.title,
          branch,
          base,
          repository: `${config.owner}/${config.repo}`,
        };
      } catch (err) {
        if (err instanceof ForgeError) throw new ToolError(err.message, err.status);
        throw err;
      }
    },
  });
}
