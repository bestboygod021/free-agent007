import { describe, it, expect, afterEach } from 'vitest';
import {
  authenticateWorker,
  workerAuthConfigured,
  mintWorkerToken,
  MIN_WORKER_TOKEN_LENGTH,
  WORKER_TOKEN_ENV,
} from '../../services/agent-worker-auth.js';

const GOOD = 'a'.repeat(32);
const OTHER = 'b'.repeat(32);

function configure(value: string | undefined): void {
  if (value === undefined) delete process.env[WORKER_TOKEN_ENV];
  else process.env[WORKER_TOKEN_ENV] = value;
}

describe('agent worker auth', () => {
  afterEach(() => configure(undefined));

  describe('fail-closed by default', () => {
    it('reports not_configured when the env var is absent', () => {
      configure(undefined);
      expect(workerAuthConfigured()).toBe(false);
      expect(authenticateWorker(GOOD)).toEqual({ ok: false, reason: 'not_configured' });
    });

    it('reports not_configured for an empty or whitespace value', () => {
      configure('   ');
      expect(workerAuthConfigured()).toBe(false);
      // Crucially this is not_configured rather than a successful match on the
      // empty string: an unset credential must never authenticate anyone.
      expect(authenticateWorker('')).toEqual({ ok: false, reason: 'not_configured' });
    });

    it('does not authenticate when every configured entry was rejected', () => {
      // Too short to be safe, so it is dropped -- and dropping every entry must
      // leave the surface disabled, not open.
      configure('runner:short');
      expect(workerAuthConfigured()).toBe(false);
      expect(authenticateWorker('short')).toEqual({ ok: false, reason: 'not_configured' });
    });
  });

  describe('matching', () => {
    it('resolves a valid token to its configured workerId', () => {
      configure(`runner-a:${GOOD}`);
      expect(authenticateWorker(GOOD)).toEqual({ ok: true, worker: { workerId: 'runner-a' } });
    });

    it('picks the right identity out of several configured workers', () => {
      configure(`runner-a:${GOOD},runner-b:${OTHER}`);
      expect(authenticateWorker(OTHER)).toEqual({ ok: true, worker: { workerId: 'runner-b' } });
    });

    it('rejects an unknown token as invalid, not as a different worker', () => {
      configure(`runner-a:${GOOD}`);
      expect(authenticateWorker('c'.repeat(32))).toEqual({ ok: false, reason: 'invalid' });
    });

    it('distinguishes a missing token from a wrong one', () => {
      configure(`runner-a:${GOOD}`);
      expect(authenticateWorker(undefined)).toEqual({ ok: false, reason: 'missing' });
      expect(authenticateWorker('')).toEqual({ ok: false, reason: 'missing' });
    });

    it('rejects a token that is a prefix of a valid one', () => {
      configure(`runner-a:${GOOD}`);
      expect(authenticateWorker(GOOD.slice(0, 31))).toEqual({ ok: false, reason: 'invalid' });
    });

    it('rejects a valid token with trailing junk', () => {
      configure(`runner-a:${GOOD}`);
      expect(authenticateWorker(`${GOOD}x`)).toEqual({ ok: false, reason: 'invalid' });
    });

    it('tolerates surrounding whitespace on the presented token', () => {
      configure(`runner-a:${GOOD}`);
      expect(authenticateWorker(`  ${GOOD}  `)).toEqual({
        ok: true,
        worker: { workerId: 'runner-a' },
      });
    });
  });

  describe('parsing', () => {
    it('tolerates whitespace around entries', () => {
      configure(`  runner-a : ${GOOD} ,  runner-b:${OTHER}  `);
      expect(authenticateWorker(GOOD)).toEqual({ ok: true, worker: { workerId: 'runner-a' } });
      expect(authenticateWorker(OTHER)).toEqual({ ok: true, worker: { workerId: 'runner-b' } });
    });

    it('allows colons inside the token by splitting on the first one only', () => {
      const withColons = `${'x'.repeat(20)}:tail:more`;
      configure(`runner-a:${withColons}`);
      expect(authenticateWorker(withColons)).toEqual({
        ok: true,
        worker: { workerId: 'runner-a' },
      });
    });

    it('drops an entry with no colon without disabling the rest', () => {
      configure(`garbage,runner-b:${OTHER}`);
      expect(authenticateWorker(OTHER)).toEqual({ ok: true, worker: { workerId: 'runner-b' } });
    });

    it('drops an entry with an empty workerId', () => {
      configure(`:${GOOD},runner-b:${OTHER}`);
      expect(authenticateWorker(GOOD)).toEqual({ ok: false, reason: 'invalid' });
      expect(authenticateWorker(OTHER)).toEqual({ ok: true, worker: { workerId: 'runner-b' } });
    });

    it(`drops tokens shorter than ${MIN_WORKER_TOKEN_LENGTH} characters`, () => {
      const weak = 'z'.repeat(MIN_WORKER_TOKEN_LENGTH - 1);
      configure(`weak:${weak},runner-b:${OTHER}`);
      // A short token is guessable online, so it is not merely warned about.
      expect(authenticateWorker(weak)).toEqual({ ok: false, reason: 'invalid' });
      expect(authenticateWorker(OTHER)).toEqual({ ok: true, worker: { workerId: 'runner-b' } });
    });

    it(`accepts a token of exactly ${MIN_WORKER_TOKEN_LENGTH} characters`, () => {
      const edge = 'e'.repeat(MIN_WORKER_TOKEN_LENGTH);
      configure(`runner-edge:${edge}`);
      expect(authenticateWorker(edge)).toEqual({ ok: true, worker: { workerId: 'runner-edge' } });
    });

    it('keeps the first entry when a workerId is duplicated', () => {
      configure(`dup:${GOOD},dup:${OTHER}`);
      expect(authenticateWorker(GOOD)).toEqual({ ok: true, worker: { workerId: 'dup' } });
      // The shadowed second credential must not silently also work, or rotating
      // a token by appending a new entry would leave the old one live.
      expect(authenticateWorker(OTHER)).toEqual({ ok: false, reason: 'invalid' });
    });

    it('ignores empty entries from trailing or doubled commas', () => {
      configure(`runner-a:${GOOD},,`);
      expect(authenticateWorker(GOOD)).toEqual({ ok: true, worker: { workerId: 'runner-a' } });
    });

    it('re-reads configuration on each call rather than caching it', () => {
      configure(`runner-a:${GOOD}`);
      expect(authenticateWorker(GOOD).ok).toBe(true);
      configure(`runner-a:${OTHER}`);
      // Rotation must take effect without a restart, and the retired token must
      // stop working immediately.
      expect(authenticateWorker(GOOD)).toEqual({ ok: false, reason: 'invalid' });
      expect(authenticateWorker(OTHER).ok).toBe(true);
    });
  });

  describe('mintWorkerToken', () => {
    it('produces a token long enough to be accepted', () => {
      const token = mintWorkerToken();
      expect(token.length).toBeGreaterThanOrEqual(MIN_WORKER_TOKEN_LENGTH);
      configure(`minted:${token}`);
      expect(authenticateWorker(token)).toEqual({ ok: true, worker: { workerId: 'minted' } });
    });

    it('does not repeat itself', () => {
      const tokens = new Set(Array.from({ length: 50 }, () => mintWorkerToken()));
      expect(tokens.size).toBe(50);
    });
  });
});
