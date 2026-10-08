import { promises as fs } from 'node:fs';
import path from 'node:path';
import { registerTool, ToolError, type ToolInvocationContext } from './agent-tools.js';
import { isSensitivePath } from '@freellmapi/agent/core/redaction.js';
import { writeFilesAtomically, AtomicWriteError } from './atomic-write.js';
import { spawnIsolated, probeIsolation, describeIsolation } from './agent-sandbox.js';
import {
  attestSpawn,
  PROCESS_SAFETY_CLAIMS,
  type AttestationSet,
} from './agent-attestation.js';

/**
 * The built-in tool set: the smallest collection that lets a run actually do
 * something about a codebase.
 *
 * Everything here is confined to the run's workspace root. That confinement is
 * the whole security story for filesystem tools, so it is implemented once, in
 * `resolveInside`, and every tool goes through it.
 */

const MAX_READ_BYTES = 256 * 1024;
const MAX_WRITE_BYTES = 1024 * 1024;
const MAX_LIST_ENTRIES = 1000;
const MAX_SEARCH_HITS = 200;

/** Directories that are never worth walking and expensive when they are huge. */
export const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '__pycache__',
  '.venv',
]);

/**
 * Resolve `relative` inside `root`, or refuse.
 *
 * The check is done on the *resolved* path, so `../`, an absolute path, or a
 * symlink pointing outside are all caught by the same test. `fs.realpath` is
 * applied to the root so that a root which is itself a symlink (common on
 * macOS, where /tmp -> /private/tmp) does not produce false refusals.
 */
export async function resolveInside(root: string, relative: unknown): Promise<string> {
  if (typeof relative !== 'string' || relative.trim() === '') {
    throw new ToolError('path must be a non-empty string.');
  }
  if (relative.includes('\0')) {
    throw new ToolError('path must not contain null bytes.');
  }

  const realRoot = await fs.realpath(root).catch(() => path.resolve(root));
  const target = path.resolve(realRoot, relative);

  // Compare against root + separator so `/work-secrets` cannot pass as a child
  // of `/work`.
  if (target !== realRoot && !target.startsWith(realRoot + path.sep)) {
    throw new ToolError(`path "${relative}" escapes the workspace.`);
  }

  // A symlink inside the workspace may still point outside it. Resolve what
  // exists and re-check; a path that does not exist yet is fine (it is a write
  // target) because its parent has already been constrained above.
  const real = await fs.realpath(target).catch(() => null);
  if (real !== null && real !== realRoot && !real.startsWith(realRoot + path.sep)) {
    throw new ToolError(`path "${relative}" resolves outside the workspace.`);
  }
  return target;
}

/**
 * Refuse to open a file whose *name* says it holds credentials.
 *
 * `redactSecrets` already scrubs tool output, but it works on patterns it
 * recognises — `sk-...`, a JWT, an `AKIA` key. A `.env` is a file of
 * `NAME=value` lines where the value can be any string at all, so a bespoke
 * internal token, a database password or a webhook URL passes straight
 * through it and into the model's prompt. The filename is the reliable
 * signal here, not the content.
 *
 * The rule itself is `isSensitivePath` from the agent kernel — the same list
 * the redaction layer publishes. Importing it rather than restating it means
 * a name added there is honoured here without anyone remembering to.
 *
 * This is a read-side guard. Writing `.env` is a different question (an agent
 * scaffolding a project has a fair reason to) and is left to the policy
 * engine, which classifies writes by side effect.
 */
function assertReadable(relative: string): void {
  if (isSensitivePath(relative)) {
    throw new ToolError(
      `refusing to read "${relative}": file names of this kind hold credentials. ` +
        'Ask a human for the specific value if the task genuinely needs it.',
      403,
    );
  }
}

/**
 * Where tools are allowed to operate.
 *
 * Configuration, never a request field: if a caller could name the root, the
 * confinement checks would be decorative. Defaults to a dedicated directory
 * rather than the server's cwd, so a misconfigured deployment cannot hand an
 * agent the source tree of the gateway itself.
 */
export function agentWorkspaceRoot(): string {
  const configured = process.env.AGENT_WORKSPACE_ROOT?.trim();
  return configured && configured !== ''
    ? path.resolve(configured)
    : path.resolve(process.cwd(), 'data', 'agent-workspace');
}

/** Create the workspace root if it does not exist yet. */
export async function ensureWorkspaceRoot(): Promise<string> {
  const root = agentWorkspaceRoot();
  await fs.mkdir(root, { recursive: true });
  return root;
}

export function registerBuiltinTools(): void {
  registerTool({
    name: 'fs.read_file',
    description:
      'Read a UTF-8 text file from the workspace. Returns the content and whether it was truncated.',
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the workspace root.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      assertReadable(String(args.path));
      const file = await resolveInside(ctx.workspaceRoot, args.path);
      const stat = await fs.stat(file).catch(() => null);
      if (!stat) throw new ToolError(`no such file: ${String(args.path)}`, 404);
      if (stat.isDirectory()) throw new ToolError(`${String(args.path)} is a directory.`);

      const handle = await fs.open(file, 'r');
      try {
        const buffer = Buffer.alloc(Math.min(stat.size, MAX_READ_BYTES));
        await handle.read(buffer, 0, buffer.length, 0);
        return {
          path: args.path,
          content: buffer.toString('utf8'),
          bytes: stat.size,
          truncated: stat.size > MAX_READ_BYTES,
        };
      } finally {
        await handle.close();
      }
    },
  });

  registerTool({
    name: 'fs.list',
    description: 'List the entries of a directory in the workspace.',
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory relative to the workspace root.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const dir = await resolveInside(ctx.workspaceRoot, args.path);
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => null);
      if (!entries) throw new ToolError(`no such directory: ${String(args.path)}`, 404);

      return {
        path: args.path,
        entries: entries.slice(0, MAX_LIST_ENTRIES).map((e) => ({
          name: e.name,
          type: e.isDirectory() ? 'directory' : e.isSymbolicLink() ? 'symlink' : 'file',
        })),
        truncated: entries.length > MAX_LIST_ENTRIES,
      };
    },
  });

  registerTool({
    name: 'fs.search',
    description:
      'Search workspace file contents for a literal string. Returns matching files with line numbers.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, description: 'Literal text to find.' },
        path: { type: 'string', description: 'Subdirectory to search. Defaults to the root.' },
        extensions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Limit to these file extensions, e.g. [".ts", ".md"].',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const base = await resolveInside(ctx.workspaceRoot, (args.path as string) ?? '.');
      const query = args.query as string;
      const exts = Array.isArray(args.extensions) ? (args.extensions as string[]) : null;
      const hits: { path: string; line: number; text: string }[] = [];

      async function walk(dir: string): Promise<void> {
        if (hits.length >= MAX_SEARCH_HITS || ctx.signal.aborted) return;
        const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
          if (hits.length >= MAX_SEARCH_HITS || ctx.signal.aborted) return;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            await walk(full);
            continue;
          }
          if (!entry.isFile()) continue;
          if (exts && !exts.some((e) => entry.name.endsWith(e))) continue;
          // Same rule as fs.read_file. Without this, `fs.search` is a way to
          // read a refused file one matching line at a time.
          if (isSensitivePath(entry.name)) continue;

          const stat = await fs.stat(full).catch(() => null);
          if (!stat || stat.size > MAX_READ_BYTES) continue;

          const content = await fs.readFile(full, 'utf8').catch(() => null);
          if (content === null || !content.includes(query)) continue;

          const lines = content.split('\n');
          for (let i = 0; i < lines.length && hits.length < MAX_SEARCH_HITS; i++) {
            if (lines[i]!.includes(query)) {
              hits.push({
                path: path.relative(ctx.workspaceRoot, full),
                line: i + 1,
                text: lines[i]!.slice(0, 300),
              });
            }
          }
        }
      }

      await walk(base);
      return { query, hits, truncated: hits.length >= MAX_SEARCH_HITS };
    },
  });

  registerTool({
    name: 'fs.file.write',
    description:
      'Write a UTF-8 text file in the workspace, creating parent directories as needed.',
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the workspace root.' },
        content: { type: 'string', description: 'Full file content.' },
        expectedHash: {
          type: 'string',
          description:
            'Optional SHA-256 of the content this write was computed against. ' +
            'When given, the write refuses if the file changed since it was read.',
        },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const content = args.content as string;
      const expectedHash = typeof args.expectedHash === 'string' ? args.expectedHash : undefined;
      if (Buffer.byteLength(content, 'utf8') > MAX_WRITE_BYTES) {
        throw new ToolError(`content exceeds ${MAX_WRITE_BYTES} bytes.`);
      }
      const file = await resolveInside(ctx.workspaceRoot, args.path);
      await fs.mkdir(path.dirname(file), { recursive: true });

      // Goes through the atomic path rather than `fs.writeFile`, so a failed
      // write leaves the previous file intact instead of a truncated one. A
      // plain `writeFile` opens with O_TRUNC: if it fails after truncating,
      // the old content is gone and the new content never arrived.
      try {
        const result = await writeFilesAtomically(
          ctx.workspaceRoot,
          [{ path: file, content, ...(expectedHash ? { expectedHash } : {}) }],
          { allowCreate: true },
        );
        return {
          path: args.path,
          bytes: result.bytesWritten,
          created: result.created.length > 0,
        };
      } catch (err) {
        if (err instanceof AtomicWriteError) {
          throw new ToolError(
            err.rolledBack
              ? err.message
              : `${err.message}; UNRESTORED: ${err.unrestored.join(', ')}`,
          );
        }
        throw err;
      }
    },
  });

  registerTool({
    name: 'sandbox.test',
    description:
      'Run the project test command in the workspace and return its exit code and output.',
    schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Test command to run. Defaults to "npm test".',
        },
      },
      additionalProperties: false,
    },
    timeoutMs: 120_000,
    async handler(args, ctx) {
      // Argv form, never a shell string: there is no shell here, so a command
      // containing `; rm -rf /` is an argument, not a second command.
      const raw = typeof args.command === 'string' && args.command.trim() ? args.command : 'npm test';
      const parts = raw.trim().split(/\s+/);
      const bin = parts[0]!;

      if (!/^[\w.@/-]+$/.test(bin)) {
        throw new ToolError(`refusing to run "${bin}": not a plain executable name.`);
      }
      return runProcess(bin, parts.slice(1), ctx);
    },
  });
}

/** Wall-clock and output ceilings, named so they can be attested rather than assumed. */
const PROCESS_OUTPUT_CAP = 64 * 1024;
const PROCESS_TIMEOUT_MS = 120_000;

/**
 * Spawn without a shell, capture bounded output, and honour the abort signal.
 *
 * Before spawning, the options are turned into attestations and checked. This
 * looks redundant — the options are right there, a few lines above — and that
 * is exactly the point. The kernel's contract modules ask for `sandboxed:
 * boolean`, and anything that *asserts* that boolean is trusting itself. Here
 * the claim is derived from the spawn options themselves, so the guard cannot
 * drift away from what the spawn actually does: change `shell: false` to
 * `shell: true` and the attestation flips and the spawn is refused.
 *
 * It is a cheap invariant on the one call in this codebase that starts a
 * process.
 */
function runProcess(
  bin: string,
  argv: string[],
  ctx: ToolInvocationContext,
): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  attestations: ReturnType<AttestationSet['all']>;
  isolated: boolean;
  isolation: string;
}> {
  const spawnOptions = {
    cwd: ctx.workspaceRoot,
    shell: false as const,
    // A tool inherits no ambient credentials: the parent's environment is
    // full of provider API keys and none of them belong in a test run.
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      NODE_ENV: 'test',
      CI: '1',
    },
  };

  const attested = attestSpawn({
    shell: spawnOptions.shell,
    env: spawnOptions.env,
    cwd: spawnOptions.cwd,
    timeoutMs: PROCESS_TIMEOUT_MS,
    outputCapBytes: PROCESS_OUTPUT_CAP,
    workspaceRoot: ctx.workspaceRoot,
  });

  const verdict = attested.requireAll(PROCESS_SAFETY_CLAIMS);
  if (!verdict.ok) {
    const detail = [...verdict.missing.map((c) => `${c} (never established)`), ...verdict.failed]
      .join(', ');
    return Promise.reject(
      new ToolError(`refusing to spawn "${bin}": process safety not established — ${detail}`, 403),
    );
  }

  // The spawn itself now goes through the namespace boundary when the kernel
  // allows one. `spawnIsolated` reports whether it achieved isolation rather
  // than assuming it, and that answer is passed through to the caller: a run
  // that was not isolated must not look like one that was.
  return spawnIsolated(bin, argv, {
    cwd: spawnOptions.cwd,
    env: spawnOptions.env,
    signal: ctx.signal,
    timeoutMs: PROCESS_TIMEOUT_MS,
    outputCapBytes: PROCESS_OUTPUT_CAP,
  }).then(
    (result) => ({
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      timedOut: result.timedOut || ctx.signal.aborted,
      // Returned so the caller can see what was established, not just that
      // something was. An audit trail of "it was fine" is worth little.
      attestations: attested.all(),
      isolated: result.isolated,
      isolation: describeIsolation(probeIsolation()),
    }),
    (err: unknown) => {
      throw new ToolError(
        `could not run "${bin}": ${err instanceof Error ? err.message : 'spawn failed'}`,
      );
    },
  );
}
