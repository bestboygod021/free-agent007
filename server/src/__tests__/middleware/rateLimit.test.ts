import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  createProxyRateLimiter,
  createAdminRateLimiter,
  createKeyRateLimiter,
  getKeyRateLimitUsage,
  getRateLimitEvents,
  getRateLimitSpike,
  recordRateLimitEvent,
  clearRateLimitEventsForTests,
} from '../../middleware/rateLimit.js';

interface MockRes extends Partial<Response> {
  headers: Record<string, string>;
  statusCode: number;
  body: unknown;
  setHeader: (k: string, v: string) => void;
}

function mockRes(): MockRes {
  const res: MockRes = { headers: {}, statusCode: 200, body: undefined };
  res.setHeader = (k, v) => {
    res.headers[k] = v;
  };
  (res as any).status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  (res as any).json = (b: unknown) => {
    res.body = b;
    return res;
  };
  return res;
}

function mockReq(url = '/v1/chat/completions', method = 'POST', ip = '203.0.113.9'): Request {
  return { url, originalUrl: url, method, ip, socket: {} } as unknown as Request;
}

function run(middleware: (req: Request, res: Response, next: NextFunction) => void, req?: Request) {
  const res = mockRes();
  let nexted = false;
  middleware(req ?? mockReq(), res as Response, () => {
    nexted = true;
  });
  return { res, nexted };
}

function keyReq(token?: string, ip = '203.0.113.50'): Request {
  return {
    url: '/v1/chat/completions',
    originalUrl: '/v1/chat/completions',
    method: 'POST',
    ip,
    socket: {},
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as unknown as Request;
}

describe('dashboard/proxy rate limiters', () => {
  beforeEach(() => {
    clearRateLimitEventsForTests();
  });

  it('passes traffic under the cap and advertises the window in headers', () => {
    const limiter = createProxyRateLimiter(3);
    for (let i = 0; i < 3; i++) {
      const { res, nexted } = run(limiter);
      expect(nexted).toBe(true);
      expect(res.headers['X-RateLimit-Limit']).toBe('3');
      expect(res.headers['X-RateLimit-Remaining']).toBe(String(2 - i));
      expect(res.headers['X-RateLimit-Reset']).toBeTruthy();
    }
  });

  it('rejects over the cap with a 429, an honest Retry-After, and the standard envelope', () => {
    const limiter = createProxyRateLimiter(2);
    run(limiter);
    run(limiter);
    const { res, nexted } = run(limiter);
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(429);
    // Fresh window just opened (fixed window starts at the FIRST request), so
    // Retry-After is ~the full minute — never 0, never negative.
    const retryAfter = Number(res.headers['Retry-After']);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
    const body = res.body as { error: { message: string; type: string } };
    expect(body.error.type).toBe('rate_limit_error');
    expect(body.error.message).toContain('Rate limit exceeded');
  });

  it('makes Retry-After track the real window end', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const start = Date.now();
      vi.setSystemTime(start);
      const limiter = createProxyRateLimiter(1);
      run(limiter); // opens the window at `start`
      vi.setSystemTime(start + 10_000); // 10s into the 60s window
      const { res } = run(limiter);
      expect(Number(res.headers['Retry-After'])).toBe(50);
    } finally {
      vi.useRealTimers();
    }
  });

  it('records every rejection for the admin dashboard, newest first', () => {
    const limiter = createProxyRateLimiter(1);
    run(limiter, mockReq('/v1/chat/completions'));
    run(limiter, mockReq('/v1/embeddings'));
    const events = getRateLimitEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      scope: 'proxy',
      method: 'POST',
      path: '/v1/embeddings',
      ip: '203.0.113.9',
      limit: 1,
    });
    expect(events[0].ts).toBeGreaterThan(0);
    expect(events[0].retryAfter).toBeGreaterThanOrEqual(1);
  });

  it('tags dashboard-surface rejections as admin', () => {
    const limiter = createAdminRateLimiter(0); // 0 = unlimited… must not reject
    const { nexted } = run(limiter, mockReq('/api/keys', 'GET', '127.0.0.1'));
    expect(nexted).toBe(true);
    expect(getRateLimitEvents()).toHaveLength(0);

    const tight = createAdminRateLimiter(1);
    run(tight, mockReq('/api/keys', 'GET', '127.0.0.1'));
    run(tight, mockReq('/api/keys', 'GET', '127.0.0.1'));
    const events = getRateLimitEvents();
    expect(events).toHaveLength(1);
    expect(events[0].scope).toBe('admin');
  });

  it('a limit of 0 turns the limiter off entirely', () => {
    const limiter = createProxyRateLimiter(0);
    for (let i = 0; i < 50; i++) {
      const { nexted } = run(limiter);
      expect(nexted).toBe(true);
    }
    expect(getRateLimitEvents()).toHaveLength(0);
  });
  describe('per-API-key burst bucket', () => {
    it('passes requests with no API credential (the IP bucket owns those)', () => {
      const limiter = createKeyRateLimiter(2);
      for (let i = 0; i < 10; i++) {
        const { nexted } = run(limiter, keyReq(undefined));
        expect(nexted).toBe(true);
      }
      expect(getRateLimitEvents()).toHaveLength(0);
    });

    it('counts one presented key across addresses and rejects over its cap', () => {
      const limiter = createKeyRateLimiter(2);
      expect(run(limiter, keyReq('sk-live-aaa', '198.51.100.1')).nexted).toBe(true);
      expect(run(limiter, keyReq('sk-live-aaa', '203.0.113.9')).nexted).toBe(true);
      const third = run(limiter, keyReq('sk-live-aaa', '192.0.2.7'));
      expect(third.nexted).toBe(false);
      expect(third.res.statusCode).toBe(429);
      expect(third.res.headers['Retry-After']).toBeTruthy();
      const event = getRateLimitEvents()[0];
      expect(event).toMatchObject({ scope: 'key', limit: 2 });
      expect(event.ip).toBe('192.0.2.7');
      expect(event.subject).toMatch(/^key:[0-9a-f]{8}$/);
      // The raw credential must never land in the trail or the usage view.
      const serialized = JSON.stringify([getRateLimitEvents(), getKeyRateLimitUsage()]);
      expect(serialized).not.toContain('sk-live-aaa');
    });

    it('gives a different presented key its own bucket', () => {
      const limiter = createKeyRateLimiter(1);
      expect(run(limiter, keyReq('sk-live-aaa')).nexted).toBe(true);
      expect(run(limiter, keyReq('sk-live-bbb')).nexted).toBe(true);
      expect(run(limiter, keyReq('sk-live-aaa')).nexted).toBe(false);
      expect(run(limiter, keyReq('sk-live-bbb')).nexted).toBe(false);
    });

    it('exposes live usage counters and forgets them when cleared', () => {
      const limiter = createKeyRateLimiter(5);
      run(limiter, keyReq('sk-live-ccc'));
      run(limiter, keyReq('sk-live-ccc'));
      const usage = getKeyRateLimitUsage();
      const mine = usage.find(u => u.subject.startsWith('key:'));
      expect(mine).toMatchObject({ count: 2, limit: 5 });
      expect(mine!.resetAt).toBeGreaterThan(Date.now());
      clearRateLimitEventsForTests();
      expect(getKeyRateLimitUsage()).toHaveLength(0);
    });

    it('a limit of 0 turns the key bucket off', () => {
      const limiter = createKeyRateLimiter(0);
      for (let i = 0; i < 20; i++) expect(run(limiter, keyReq('sk-live-ddd')).nexted).toBe(true);
      expect(getRateLimitEvents()).toHaveLength(0);
    });
  });

  it('opens a fresh window at exactly resetAt — the boundary millisecond counts', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const t0 = Date.now();
      vi.setSystemTime(t0);
      const limiter = createProxyRateLimiter(1);
      expect(run(limiter).nexted).toBe(true); // window born: [t0, t0+60_000)
      const resetAt = t0 + 60_000;

      vi.setSystemTime(resetAt - 1); // last millisecond of the old window
      expect(run(limiter).nexted).toBe(false);

      vi.setSystemTime(resetAt); // exactly at resetAt: `now >= resetAt` rolls over
      const fresh = run(limiter);
      expect(fresh.nexted).toBe(true);
      expect(fresh.res.headers['X-RateLimit-Remaining']).toBe('0');

      vi.setSystemTime(resetAt); // still the new window's first slot — over cap again
      expect(run(limiter).nexted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fires one spike alert per cooldown and drops it after ten minutes', () => {
    process.env.RATE_LIMIT_ALERT_THRESHOLD = '3';
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const t0 = Date.now();
      const event = (ts: number) => ({
        ts,
        scope: 'proxy' as const,
        method: 'GET',
        path: '/v1/models',
        ip: null,
        subject: null,
        limit: 1,
        retryAfter: 60,
      });
      for (let i = 0; i < 3; i++) recordRateLimitEvent(event(t0));
      expect(getRateLimitSpike()).toMatchObject({ at: t0, count: 3 });

      // Two more bursts well inside the cooldown: alert must not re-fire, so
      // the stored spike keeps its original stamp and count.
      vi.setSystemTime(t0 + 60_000);
      for (let i = 0; i < 3; i++) recordRateLimitEvent(event(t0 + 60_000));
      expect(getRateLimitSpike()).toMatchObject({ at: t0, count: 3 });

      // Ten minutes after the alert the spike ages out…
      vi.setSystemTime(t0 + 600_000);
      expect(getRateLimitSpike()).toBeNull();

      // …and with the cooldown elapsed, a fresh burst alerts again.
      for (let i = 0; i < 3; i++) recordRateLimitEvent(event(t0 + 600_000));
      expect(getRateLimitSpike()).toMatchObject({ at: t0 + 600_000, count: 3 });
    } finally {
      vi.useRealTimers();
      delete process.env.RATE_LIMIT_ALERT_THRESHOLD;
    }
  });
});
