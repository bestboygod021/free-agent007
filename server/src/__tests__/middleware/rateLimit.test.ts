import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  createProxyRateLimiter,
  createAdminRateLimiter,
  getRateLimitEvents,
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
});
