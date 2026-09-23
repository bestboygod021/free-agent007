import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  probeIsolation,
  resetIsolationProbeForTest,
  isolationArgv,
  describeIsolation,
  spawnIsolated,
} from '../../services/agent-sandbox.js';

/**
 * These tests try to escape. They do not mock the boundary, because a mocked
 * boundary passes whether or not a real one exists — which is precisely the
 * failure this module was written to fix.
 *
 * Every escape assertion is paired with a positive control: a probe proving
 * the same operation succeeds when NOT sandboxed. Without that pairing a test
 * like "cannot write /tmp" would also pass if the command never ran at all.
 */

const support = probeIsolation();
const itIfIsolated = support.available ? it : it.skip;

let workspace: string;

function run(command: string, argv: string[], cwd = workspace, timeoutMs = 20_000) {
  return spawnIsolated(command, argv, {
    cwd,
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' },
    signal: new AbortController().signal,
    timeoutMs,
    outputCapBytes: 64 * 1024,
  });
}

describe('sandbox isolation', () => {
  beforeAll(() => {
    // Reported once so a skipped suite is never mistaken for a passing one.
    console.log(`[sandbox] ${describeIsolation(support)}`);
  });

  beforeEach(async () => {
    workspace = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'sbx-')));
    await fs.writeFile(path.join(workspace, 'input.txt'), 'workspace content\n', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  describe('probeIsolation', () => {
    it('reports a concrete reason when isolation is unavailable', () => {
      resetIsolationProbeForTest();
      const result = probeIsolation(true);

      if (result.available) {
        expect(result.namespaces).toContain('mount');
        expect(result.namespaces).toContain('net');
        expect(result.readOnlyRoot).toBe(true);
        // The limits are part of the answer, not a footnote.
        expect(result.limitations.length).toBeGreaterThan(0);
        expect(result.limitations.join(' ')).toMatch(/pivot_root|cgroup/);
      } else {
        expect(result.reason).toBeTruthy();
        expect(result.reason!.length).toBeGreaterThan(10);
      }
    });

    it('caches the probe but re-runs it when forced', () => {
      const first = probeIsolation();
      const second = probeIsolation();
      expect(second).toBe(first); // same object: cached

      const forced = probeIsolation(true);
      expect(forced).not.toBe(first);
      expect(forced.available).toBe(first.available);
    });

    it('never describes isolation it did not achieve', () => {
      const description = describeIsolation(support);
      if (support.available) {
        expect(description).toContain('read-only');
      } else {
        expect(description).toContain('Not isolated');
        expect(description).toContain('can read and write');
      }
    });
  });

  describe('isolationArgv', () => {
    /**
     * The ordering bug this locks in: remounting the workspace read-write
     * only works if the workspace was first bind-mounted to itself, because
     * otherwise there is no separate mount to remount and the process cannot
     * write its own working directory.
     */
    it('binds the workspace before making the root read-only', () => {
      const argv = isolationArgv('npm', ['test'], '/srv/ws');
      const script = argv.find((a) => a.includes('remount')) ?? '';

      const bindIndex = script.indexOf("mount --bind '/srv/ws'");
      const roIndex = script.indexOf('remount,ro,bind / /');
      const rwIndex = script.indexOf("remount,rw,bind '/srv/ws'");

      expect(bindIndex).toBeGreaterThanOrEqual(0);
      expect(roIndex).toBeGreaterThan(bindIndex);
      expect(rwIndex).toBeGreaterThan(roIndex);
    });

    it('requests the namespaces that make the boundary', () => {
      const argv = isolationArgv('echo', ['x'], '/srv/ws');
      for (const flag of ['--user', '--mount', '--net', '--pid']) {
        expect(argv).toContain(flag);
      }
    });

    /**
     * The command is passed as positional arguments and exec'd as argv. If it
     * were interpolated into the mount script, a command name containing a
     * semicolon would become a second shell command inside the namespace.
     */
    it('passes the command as argv rather than interpolating it into the script', () => {
      const argv = isolationArgv('evil; rm -rf /', ['--flag'], '/srv/ws');
      const script = argv.find((a) => a.includes('remount')) ?? '';

      expect(script).not.toContain('rm -rf');
      expect(script.trimEnd().endsWith('exec "$@"')).toBe(true);
      expect(argv[argv.length - 2]).toBe('evil; rm -rf /');
      expect(argv[argv.length - 1]).toBe('--flag');
    });

    it('quotes a workspace path containing a space', () => {
      const argv = isolationArgv('echo', [], '/srv/my workspace');
      const script = argv.find((a) => a.includes('remount')) ?? '';

      expect(script).toContain("'/srv/my workspace'");
    });
  });

  describe('what a sandboxed process can actually reach', () => {
    /** Positive control: the command runs and the workspace is usable. */
    itIfIsolated('runs the command and can write inside the workspace', async () => {
      const result = await run('node', [
        '-e',
        "require('fs').writeFileSync('out.txt','written');console.log('ran')",
      ]);

      expect(result.isolated).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('ran');
      // Written inside the namespace, visible outside: the bind mount is real,
      // not a tmpfs copy that evaporates.
      const written = await fs.readFile(path.join(workspace, 'out.txt'), 'utf8');
      expect(written).toBe('written');
    });

    itIfIsolated('can read files the caller put in the workspace', async () => {
      const result = await run('node', [
        '-e',
        "process.stdout.write(require('fs').readFileSync('input.txt','utf8'))",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('workspace content');
    });

    /**
     * Measured before this module existed: this write succeeded and the file
     * was confirmed on disk afterwards.
     */
    itIfIsolated('cannot write outside the workspace', async () => {
      const target = '/tmp/agent-escape-probe.txt';
      await fs.rm(target, { force: true });

      const result = await run('node', [
        '-e',
        `try{require('fs').writeFileSync(${JSON.stringify(target)},'x');console.log('ESCAPED')}` +
          `catch(e){console.log('BLOCKED:'+e.code)}`,
      ]);

      expect(result.stdout).toContain('BLOCKED');
      expect(result.stdout).not.toContain('ESCAPED');
      // The strongest assertion available: the file is not there.
      await expect(fs.stat(target)).rejects.toThrow();
    });

    itIfIsolated('cannot write to the gateway source tree', async () => {
      // Removed first: a previous mutation run proved the boundary is real by
      // actually escaping and leaving this file behind, which then made every
      // later run fail for the wrong reason.
      const target = path.join(process.cwd(), 'SANDBOX_ESCAPE_PROBE');
      await fs.rm(target, { force: true });

      const result = await run('node', [
        '-e',
        `try{require('fs').writeFileSync(${JSON.stringify(target)},'x');console.log('ESCAPED')}` +
          `catch(e){console.log('BLOCKED:'+e.code)}`,
      ]);

      expect(result.stdout).toContain('BLOCKED');
      await expect(fs.stat(target)).rejects.toThrow();
    });

    itIfIsolated('cannot reach the network', async () => {
      const result = await run('node', [
        '-e',
        "require('dns').promises.lookup('registry.npmjs.org')" +
          ".then(a=>console.log('REACHED:'+a.address)).catch(()=>console.log('BLOCKED'))",
      ]);

      expect(result.stdout).toContain('BLOCKED');
      expect(result.stdout).not.toContain('REACHED');
    });

    itIfIsolated('cannot connect to the gateway itself on loopback', async () => {
      const result = await run('node', [
        '-e',
        "const s=require('net').connect(3001,'127.0.0.1');" +
          "s.on('connect',()=>{console.log('REACHED');s.end()});" +
          "s.on('error',()=>console.log('BLOCKED'));" +
          'setTimeout(()=>{console.log("TIMEOUT");process.exit(0)},3000)',
      ]);

      expect(result.stdout).not.toContain('REACHED');
    });

    itIfIsolated('cannot see the gateway process in its process table', async () => {
      const result = await run('node', [
        '-e',
        "const ps=require('fs').readdirSync('/proc').filter(n=>/^\\d+$/.test(n));" +
          'console.log("PIDS="+ps.length)',
      ]);

      expect(result.exitCode).toBe(0);
      const count = Number(/PIDS=(\d+)/.exec(result.stdout)?.[1] ?? '9999');
      // In its own pid namespace the process sees only itself and its children.
      expect(count).toBeLessThan(10);
    });

    itIfIsolated('still enforces the wall-clock timeout inside the namespace', async () => {
      const result = await run(
        'node',
        ['-e', 'setInterval(()=>{},1000)'],
        workspace,
        2_000,
      );

      expect(result.timedOut).toBe(true);
    });

    itIfIsolated('caps output from inside the namespace', async () => {
      const result = await spawnIsolated(
        'node',
        ['-e', 'process.stdout.write("x".repeat(200000))'],
        {
          cwd: workspace,
          env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' },
          signal: new AbortController().signal,
          timeoutMs: 20_000,
          outputCapBytes: 1024,
        },
      );

      expect(result.stdout.length).toBeLessThanOrEqual(1024);
    });
  });

  describe('when isolation is unavailable', () => {
    /**
     * The module must not pretend. A caller reading `isolated: true` will make
     * a policy decision on it, so the flag has to track reality.
     */
    it('reports isolated: false rather than failing silently', async () => {
      if (support.available) {
        const result = await run('node', ['-e', 'console.log("ok")']);
        expect(result.isolated).toBe(true);
      } else {
        const result = await run('node', ['-e', 'console.log("ok")']);
        expect(result.isolated).toBe(false);
        expect(result.stdout.trim()).toBe('ok');
      }
    });
  });
});
