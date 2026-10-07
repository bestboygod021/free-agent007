import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb } from '../../db/index.js';
import { mintDashboardToken } from '../helpers/auth.js';
import { clearRateLimitEventsForTests } from '../../middleware/rateLimit.js';

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
    const events = (res.body as { events: unknown[] }).events;
    expect(Array.isArray(events)).toBe(true);
    const ping = (events as Array<Record<string, unknown>>).find(e => e.path === '/api/ping');
    expect(ping).toMatchObject({
      scope: 'admin',
      method: 'GET',
      limit: 2,
      ip: expect.any(String),
    });
    expect(ping!.ts as number).toBeGreaterThan(0);
    expect(ping!.retryAfter as number).toBeGreaterThanOrEqual(1);
  });
});
