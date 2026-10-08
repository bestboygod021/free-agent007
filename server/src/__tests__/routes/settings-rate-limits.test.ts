import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb } from '../../db/index.js';
import { mintDashboardToken } from '../helpers/auth.js';
import { createAdminRateLimiter } from '../../middleware/rateLimit.js';
import { run } from '../helpers/limit-mock.js';

// GET/PUT /api/settings/rate-limits — the dashboard-editable caps. The key
// property is live effect: saving must change limiter behaviour on the NEXT
// request (the middleware resolves per request), and an explicit env always
// wins over the stored setting. Behavioural assertions ride the KEY limiter so
// the settings reads/writes here never throttle each other (they share the
// admin bucket).

const KEY = 'ENCRYPTION_KEY';

async function call(app: Express, method: string, path: string, body?: unknown, token?: string) {
  const server = app.listen(0, '127.0.0.1');
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const addr = server.address() as { port: number };
  const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => null);
  server.close();
  return { status: res.status, body: data as Record<string, unknown> };
}

describe('GET/PUT /api/settings/rate-limits', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    process.env[KEY] = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();
    token = mintDashboardToken();
  });

  afterAll(() => {
    delete process.env.KEY_RATE_LIMIT_RPM;
  });

  it('reports the shipped defaults with their source', async () => {
    const res = await call(app, 'GET', '/api/settings/rate-limits', undefined, token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      proxyRpm: 120,
      adminRpm: 600,
      keyRpm: 180,
      sources: { proxy: 'default', admin: 'default', key: 'default' },
    });
  });

  it('persists a cap and reports source=settings', async () => {
    const put = await call(app, 'PUT', '/api/settings/rate-limits', { keyRpm: 3 }, token);
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ keyRpm: 3, sources: { key: 'settings' } });

    const get = await call(app, 'GET', '/api/settings/rate-limits', undefined, token);
    expect(get.body.keyRpm).toBe(3);
  });

  it('rejects malformed bodies', async () => {
    for (const bad of [{}, { keyRpm: -1 }, { keyRpm: 60001 }, { keyRpm: 'fast' }, { nope: 1 }]) {
      const res = await call(app, 'PUT', '/api/settings/rate-limits', bad, token);
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
  });

  it('takes effect on the very next request — no restart', async () => {
    // Fresh app (own window maps), saved key cap of 3: the fourth request
    // presenting the same credential is rejected without any restart.
    const fresh = createApp();
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await call(fresh, 'GET', '/v1/models', undefined, 'sk-effect-test');
      codes.push(res.status);
    }
    expect(codes).toEqual([401, 401, 401, 429]);
  });

  it('an explicit env var outranks the stored setting', async () => {
    process.env.KEY_RATE_LIMIT_RPM = '400';
    const withEnv = await call(app, 'GET', '/api/settings/rate-limits', undefined, token);
    expect(withEnv.body).toMatchObject({ keyRpm: 400, sources: { key: 'env' } });

    // Saving while the env is pinned does not flip the effective value.
    await call(app, 'PUT', '/api/settings/rate-limits', { keyRpm: 5 }, token);
    const stillEnv = await call(app, 'GET', '/api/settings/rate-limits', undefined, token);
    expect(stillEnv.body).toMatchObject({ keyRpm: 400, sources: { key: 'env' } });

    delete process.env.KEY_RATE_LIMIT_RPM;
    const afterUnpin = await call(app, 'GET', '/api/settings/rate-limits', undefined, token);
    expect(afterUnpin.body).toMatchObject({ keyRpm: 5, sources: { key: 'settings' } });
  });

  it('a dedicated bucket (key export) ignores the dashboard admin cap', async () => {
    // Pin the broad admin knob, then prove a settingKind:null limiter keeps
    // its own explicit cap — the dashboard knob must never loosen the export gate.
    await call(app, 'PUT', '/api/settings/rate-limits', { adminRpm: 500 }, token);
    const dedicated = createAdminRateLimiter(2, { settingKind: null });
    const results = [run(dedicated), run(dedicated), run(dedicated)];
    expect(results.map(r => r.nexted)).toEqual([true, true, false]);
    expect(results[2].res.statusCode).toBe(429);
  });
});
