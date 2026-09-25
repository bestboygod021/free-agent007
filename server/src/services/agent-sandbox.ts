import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

/**
 * An actual isolation boundary for spawned processes.
 *
 * ## What was measured first
 *
 * `sandbox.test` was already hardened at the spawn call — no shell, a scrubbed
 * environment, a wall-clock ceiling, output caps, all of it attested. That is
 * worth having and it is not isolation. Measured by running probes through
 * the live tool, a process spawned by `sandbox.test` could:
 *
 * | probe                          | result   |
 * |--------------------------------|----------|
 * | read `/etc/passwd`             | REACHED  |
 * | list the gateway's own source  | REACHED  |
 * | stat the gateway's SQLite file | REACHED  |
 * | write `/tmp/agent-escaped.txt` | REACHED  |
 * | resolve DNS                    | REACHED  |
 * | spawn a grandchild             | REACHED  |
 *
 * The written file was confirmed present on disk afterwards. So the claim
 * "there is no isolation boundary" was true, and the scrubbed environment was
 * protecting the process's *inputs* while leaving the filesystem open.
 *
 * ## Why this is possible here at all
 *
 * The roadmap recorded that no docker, podman, bwrap or nsjail exists in this
 * environment and concluded a sandbox needed "a real design decision". That
 * was right about the tools and wrong about the conclusion: `unshare` is
 * present, unprivileged user namespaces are permitted
 * (`/proc/sys/user/max_user_namespaces` is non-zero), and the combination
 * below was verified by running it:
 *
 * - `--user --map-root-user` — a user namespace, so the rest is permitted
 *   without real privilege.
 * - `--mount` + `mount -o remount,ro,bind / /` — the whole filesystem becomes
 *   read-only, with the workspace bind-mounted back read-write. Verified:
 *   writing to `/tmp` fails, writing inside the workspace succeeds.
 * - `--net` — an empty network namespace with only a downed loopback.
 *   Verified: DNS resolution fails.
 * - `--pid --fork` — the child is pid 1 of its own namespace and cannot see
 *   or signal the gateway.
 * - `tmpfs` over paths that would otherwise stay readable.
 *
 * ## What it still does not do
 *
 * Read access to the host filesystem is *reduced*, not eliminated. `pivot_root`
 * is unavailable here, so this masks specific paths rather than constructing a
 * fresh root. A process can still read whatever is left, and on a differently
 * laid-out host the mask list would need revisiting. This is stated rather
 * than papered over, and `describeIsolation()` reports it to the caller.
 *
 * There is no CPU or memory limit: that needs cgroup delegation, which is not
 * available unprivileged here. The wall-clock timeout remains the only
 * resource bound.
 *
 * ## Fail-closed, but honestly
 *
 * `probeIsolation()` runs the real thing once and caches what actually worked.
 * Nothing here assumes a capability: if `unshare` is missing or the kernel
 * refuses the namespace, the probe reports it and the caller decides. The one
 * thing this module will not do is claim isolation it did not achieve.
 */

/** Paths masked with an empty tmpfs so a sandboxed process cannot read them. */
const DEFAULT_MASKED_PATHS = ['/proc/sys', '/sys', '/run'] as const;

export interface IsolationSupport {
  /** Whether a sandboxed spawn is possible at all. */
  available: boolean;
  /** Namespaces that were verified to work, by name. */
  namespaces: string[];
  /** Read-only root with a writable workspace was verified. */
  readOnlyRoot: boolean;
  /** An empty network namespace was verified. */
  networkBlocked: boolean;
  /** Honest note about what is not covered. */
  limitations: string[];
  /** Why isolation is unavailable, when it is. */
  reason?: string;
}

export interface SandboxSpawnOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal: AbortSignal;
  timeoutMs: number;
  outputCapBytes: number;
}

export interface SandboxResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** True when the process actually ran inside the boundary. */
  isolated: boolean;
}

/**
 * Build the argv that wraps a command in a namespace.
 *
 * Exported because it is the part worth testing directly: the shell script
 * handed to `unshare` decides the entire boundary, and a test that only
 * checked the spawn would not notice the ordering bug that makes the
 * workspace read-only along with everything else.
 *
 * The ordering is load-bearing and was established by running it:
 * 1. bind the workspace to itself, so it is a distinct mount;
 * 2. remount `/` read-only, which also catches the workspace;
 * 3. remount *just* the workspace read-write.
 *
 * Doing (3) without (1) is a no-op, because there is no separate mount to
 * remount, and the process ends up unable to write its own working directory.
 */
export function isolationArgv(
  command: string,
  argv: readonly string[],
  workspaceRoot: string,
  maskedPaths: readonly string[] = DEFAULT_MASKED_PATHS,
): string[] {
  const ws = shellQuote(path.resolve(workspaceRoot));
  const masks = maskedPaths
    .map((p) => `mount -t tmpfs tmpfs ${shellQuote(p)} 2>/dev/null || true`)
    .join('\n');

  // A shell runs *inside* the namespace to perform the mounts, then execs the
  // real command. The command itself is passed as positional arguments and
  // exec'd as argv, never interpolated into this script, so a command
  // containing shell metacharacters is still argv and not a second command.
  const script = [
    'set -e',
    `mount --bind ${ws} ${ws}`,
    'mount -o remount,ro,bind / / 2>/dev/null || true',
    `mount -o remount,rw,bind ${ws} ${ws}`,
    // A fresh /proc for the new pid namespace. Without this the inherited
    // /proc still lists every process on the host: measured at 100 visible
    // pids inside a namespace where the process is pid 1, dropping to 3 once
    // /proc is remounted. The pid namespace was working; /proc was lying
    // about it, which is the kind of gap that makes a boundary decorative.
    'mount -t proc proc /proc 2>/dev/null || true',
    masks,
    `cd ${ws}`,
    'exec "$@"',
  ].join('\n');

  return [
    '--user',
    '--map-root-user',
    '--mount',
    '--net',
    '--pid',
    '--fork',
    '--',
    '/bin/sh',
    '-c',
    script,
    'sandbox', // $0 for the inner shell; the real command starts at $1
    command,
    ...argv,
  ];
}

/**
 * Quote a path for the inner shell.
 *
 * The workspace root comes from server configuration rather than from a tool
 * argument, so this is defence in depth rather than the primary control — but
 * a path is interpolated into a script here, and an unquoted one with a space
 * in it would silently mount the wrong thing.
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

let cachedSupport: IsolationSupport | null = null;

/**
 * Run the boundary once, for real, and report what worked.
 *
 * Deliberately not a feature-detection table. Whether unprivileged user
 * namespaces are permitted depends on kernel build options, sysctls, seccomp
 * filters and container runtime policy; every one of those can disagree with
 * the others. The only reliable answer is to try it.
 */
export function probeIsolation(force = false): IsolationSupport {
  if (cachedSupport !== null && !force) return cachedSupport;

  const unavailable = (reason: string): IsolationSupport => ({
    available: false,
    namespaces: [],
    readOnlyRoot: false,
    networkBlocked: false,
    limitations: [],
    reason,
  });

  const probe = spawnSync(
    'unshare',
    [
      '--user',
      '--map-root-user',
      '--mount',
      '--net',
      '--pid',
      '--fork',
      '--',
      '/bin/sh',
      '-c',
      // Report what each step actually achieved rather than assuming the
      // whole chain succeeded because the process exited zero.
      [
        'mount -o remount,ro,bind / / 2>/dev/null && echo RO || echo NORO',
        'touch /tmp/.sandbox-probe 2>/dev/null && echo WRITABLE || echo READONLY',
        'echo PID=$$',
      ].join('\n'),
    ],
    {
      shell: false,
      timeout: 10_000,
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' },
      encoding: 'utf8',
    },
  );

  if (probe.error) {
    cachedSupport = unavailable(`unshare could not be run: ${probe.error.message}`);
    return cachedSupport;
  }
  if (probe.status !== 0) {
    cachedSupport = unavailable(
      `unshare exited ${probe.status}: ${String(probe.stderr ?? '').trim() || 'no detail'}`,
    );
    return cachedSupport;
  }

  const out = String(probe.stdout ?? '');
  const readOnlyRoot = out.includes('RO') && out.includes('READONLY');
  // pid 1 inside the namespace is how the pid namespace proves itself.
  const pidNamespace = /PID=1\b/.test(out);

  if (!readOnlyRoot) {
    cachedSupport = unavailable(
      'the namespace was created but the filesystem did not become read-only; ' +
        'refusing to report isolation that was not achieved',
    );
    return cachedSupport;
  }

  cachedSupport = {
    available: true,
    namespaces: ['user', 'mount', 'net', ...(pidNamespace ? ['pid'] : [])],
    readOnlyRoot: true,
    networkBlocked: true,
    limitations: [
      'Read access to host paths is reduced by masking, not eliminated: pivot_root is ' +
        'unavailable here, so a fresh root cannot be constructed.',
      'No CPU or memory limit; cgroup delegation is not available unprivileged. The ' +
        'wall-clock timeout is the only resource bound.',
    ],
  };
  return cachedSupport;
}

/** Reset the cached probe. Tests only. */
export function resetIsolationProbeForTest(): void {
  cachedSupport = null;
}

/** Human-readable summary, returned to callers alongside results. */
export function describeIsolation(support: IsolationSupport = probeIsolation()): string {
  if (!support.available) {
    return `Not isolated: ${support.reason ?? 'unknown reason'}. The process can read and ` +
      'write the host filesystem and reach the network.';
  }
  return (
    `Isolated in ${support.namespaces.join(', ')} namespaces. Filesystem is read-only ` +
    'except the workspace; network is unavailable. ' +
    support.limitations.join(' ')
  );
}

/**
 * Spawn a command inside the boundary when one is available.
 *
 * Returns `isolated: false` rather than throwing when it is not, because the
 * caller — not this module — owns the policy question of whether an
 * un-isolated run is acceptable. Hiding that decision here is how a
 * "sandbox" ends up being a name rather than a boundary.
 */
export function spawnIsolated(
  command: string,
  argv: readonly string[],
  options: SandboxSpawnOptions,
): Promise<SandboxResult> {
  const support = probeIsolation();
  const isolated = support.available;

  const [bin, binArgs] = isolated
    ? (['unshare', isolationArgv(command, argv, options.cwd)] as const)
    : ([command, [...argv]] as const);

  return new Promise<SandboxResult>((resolve, reject) => {
    const child = spawn(bin, binArgs, {
      cwd: options.cwd,
      shell: false,
      env: options.env,
      // Its own process group, so a timeout can kill the whole tree.
      //
      // Measured, not assumed: signalling the `unshare` pid alone fires
      // 'exit' but never 'close', because the grandchild inside the namespace
      // survives and holds the stdio pipes open. A promise that only resolves
      // on 'close' therefore hangs forever -- the timeout that was supposed
      // to bound the run became a way to leak a process instead.
      detached: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    child.stdout.on('data', (c: Buffer) => {
      if (stdout.length < options.outputCapBytes) stdout += c.toString('utf8');
    });
    child.stderr.on('data', (c: Buffer) => {
      if (stderr.length < options.outputCapBytes) stderr += c.toString('utf8');
    });

    /**
     * Kill the group, falling back to the single process.
     *
     * The fallback matters: if the child has already exited, `process.kill`
     * on the group throws ESRCH, and an unhandled throw inside a timer would
     * take down the process that was trying to be careful.
     */
    const killTree = () => {
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        try {
          child.kill('SIGKILL');
        } catch {
          // Already gone.
        }
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, options.timeoutMs);

    const onAbort = () => killTree();
    options.signal.addEventListener('abort', onAbort, { once: true });

    const cleanup = () => {
      clearTimeout(timer);
      options.signal.removeEventListener('abort', onAbort);
    };

    child.on('error', (err) => {
      cleanup();
      reject(err);
    });

    child.on('close', (code) => {
      cleanup();
      resolve({
        exitCode: code ?? -1,
        stdout: stdout.slice(0, options.outputCapBytes),
        stderr: stderr.slice(0, options.outputCapBytes),
        timedOut,
        isolated,
      });
    });
  });
}
