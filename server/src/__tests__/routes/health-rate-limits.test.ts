import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb } from '../../db/index.js';
import { mintDashboardToken } from '../helpers/auth.js';
import { clearRateLimitEventsForTests } from '../../middleware/rateLimit.js';
import { getDb } from '../../db/index.js';

// GET /api/health/rate-limits — the admin view over the limiter's rejection
// trail (middleware/rateLimit.ts). The endpoint itself sits behind requireAuth
// AND the broad admin limiter, so the flow is: tighten the cap, trip it on
// /api/ping, then read the trail back through a fresh app with the default
// (generous) cap so the read itself isn't throttled.

const KEY = 'ENCRYPTION_KEY';

async function call(app: Express, path: string, token?: string) {
  const server = app.listen(0, '127.0.0.1');
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const addr = server.address() as { port: number };
  const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => null);
  server.close();
  return { status: res.status, body: data, retryAfter: res.headers.get('Retry-After') };
}

describe('GET /api/health/rate-limits', () => {
  let token: string;

  beforeAll(() => {
    process.env[KEY] = '0'.repeat(64);
    initDb(':memory:');
    clearRateLimitEventsForTests();
    token = mintDashboardToken();
    // App #1: cap the dashboard surface at 2 rpm so three pings trip it.
    process.env.ADMIN_RATE_LIMIT_RPM = '2';
  });

  afterAll(() => {
    delete process.env.ADMIN_RATE_LIMIT_RPM;
  });

  it('trips the admin limiter on /api/ping and records the event', async () => {
    const tightApp = createApp();
    const first = await call(tightApp, '/api/ping');
    const second = await call(tightApp, '/api/ping');
    const third = await call(tightApp, '/api/ping');
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(third.status).toBe(429);
    expect(third.retryAfter).toBeTruthy();
    const envelope = third.body as { error: { type: string } };
    expect(envelope.error.type).toBe('rate_limit_error');
  });

  it('requires a dashboard session', async () => {
    delete process.env.ADMIN_RATE_LIMIT_RPM; // default cap for the read-back app
    const app = createApp();
    const anon = await call(app, '/api/health/rate-limits');
    expect(anon.status).toBe(401);
  });

  it('returns the recorded rejection with path, scope, and window facts', async () => {
    const app = createApp();
    const res = await call(app, '/api/health/rate-limits', token);
    expect(res.status).toBe(200);
    const body = res.body as { events: unknown[]; keyUsage: unknown[] };
    expect(Array.isArray(body.events)).toBe(true);
    expect(Array.isArray(body.keyUsage)).toBe(true);
    const ping = (body.events as Array<Record<string, unknown>>).find(e => e.path === '/api/ping');
    expect(ping).toMatchObject({
      scope: 'admin',
      method: 'GET',
      limit: 2,
      ip: expect.any(String),
    });
    expect(ping!.ts as number).toBeGreaterThan(0);
    expect(ping!.retryAfter as number).toBeGreaterThanOrEqual(1);
  });

  it('mirrors every rejection into the durable rate_limit_events table', () => {
    // The endpoint reads DB-first; the INSERT itself is what survives a
    // restart, so assert on the table, not the read path.
    const row = getDb()
      .prepare(`SELECT COUNT(*) AS c FROM rate_limit_events WHERE scope = 'admin' AND path = '/api/ping'`)
      .get() as { c: number };
    expect(row.c).toBeGreaterThanOrEqual(1);
    const withBadIp = getDb()
      .prepare(`SELECT COUNT(*) AS c FROM rate_limit_events WHERE ip IS NOT NULL AND ip LIKE '%::ffff:%'`)
      .get() as { c: number };
    // Events must store the SAME normalized IP request-analytics stores —
    // a raw ::ffff: form would break the caller-history pivot.
    expect(withBadIp.c).toBe(0);
  });

  it('serves hourly stats for the trend strip', async () => {
    const app = createApp();
    const res = await call(app, '/api/health/rate-limits/stats', token);
    expect(res.status).toBe(200);
    const body = res.body as {
      windowHours: number;
      buckets: Array<{ hour: string; count: number }>;
      byPath: Array<{ path: string; scope: string; count: number }>;
    };
    expect(body.windowHours).toBe(24);
    const total = body.buckets.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBeGreaterThanOrEqual(1);
    expect(body.buckets[0].hour).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}$/);
    expect(body.byPath.some(p => p.path === '/api/ping' && p.scope === 'admin')).toBe(true);
  });
});
