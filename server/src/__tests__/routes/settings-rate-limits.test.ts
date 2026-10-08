import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb } from '../../db/index.js';
import { mintDashboardToken } from '../helpers/auth.js';
import { createAdminRateLimiter, createKeyRateLimiter, getKeyRateLimitUsage, getRateLimitEvents, clearRateLimitEventsForTests } from '../../middleware/rateLimit.js';
import { run, mockReq } from '../helpers/limit-mock.js';
import { regenerateUnifiedKey, getUnifiedApiKey } from '../../db/index.js';
import { queryLogs } from '../../lib/server-logs.js';
import { createHash } from 'node:crypto';

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
      unifiedRpm: 180,
      sources: { proxy: 'default', admin: 'default', key: 'default', unified: 'default' },
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
  it('persists and reports the unified-key cap like the others', async () => {
    const put = await call(app, 'PUT', '/api/settings/rate-limits', { unifiedRpm: 42 }, token);
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ unifiedRpm: 42, sources: { unified: 'settings' } });

    const get = await call(app, 'GET', '/api/settings/rate-limits', undefined, token);
    expect(get.body.unifiedRpm).toBe(42);

    // The at-least-one rule now includes unifiedRpm — still nothing to save.
    const empty = await call(app, 'PUT', '/api/settings/rate-limits', {}, token);
    expect(empty.status).toBe(400);
  });

  it('splits the unified key into its own bucket with its own cap', async () => {
    clearRateLimitEventsForTests();
    const unified = regenerateUnifiedKey();
    await call(app, 'PUT', '/api/settings/rate-limits', { unifiedRpm: 2, keyRpm: 180 }, token);

    const mkReq = (tok: string) => ({ ...mockReq('/v1/models', 'POST'), headers: { authorization: `Bearer ${tok}` } });
    const limiter = createKeyRateLimiter();

    // Unified bucket: 2 pass, the third rejects under the unified cap…
    expect(run(limiter, mkReq(unified)).nexted).toBe(true);
    expect(run(limiter, mkReq(unified)).nexted).toBe(true);
    const third = run(limiter, mkReq(unified));
    expect(third.nexted).toBe(false);
    expect(third.res.statusCode).toBe(429);

    // …while an ordinary presented key keeps counting in a separate bucket.
    for (let i = 0; i < 3; i++) expect(run(limiter, mkReq('sk-plain-key')).nexted).toBe(true);

    const usage = getKeyRateLimitUsage();
    const unifiedRow = usage.find(u => u.subject.startsWith('unified:'));
    expect(unifiedRow).toMatchObject({ label: null, limit: 2, percent: 100 });
    const plainRow = usage.find(u => u.subject.startsWith('key:'));
    expect(plainRow).toMatchObject({ limit: 180, percent: 2 });

    const event = getRateLimitEvents().find(e => e.subject?.startsWith('unified:'));
    expect(event).toMatchObject({ scope: 'key', limit: 2 });
    // The raw unified credential must never appear in the trail.
    expect(JSON.stringify(getRateLimitEvents())).not.toContain(unified);
    expect(getUnifiedApiKey()).toBe(unified);
  });

  it('warns once at 80% of a key cap, before any rejection', async () => {
    clearRateLimitEventsForTests();
    await call(app, 'PUT', '/api/settings/rate-limits', { keyRpm: 5, unifiedRpm: 42 }, token);

    const limiter = createKeyRateLimiter();
    const req = () => ({ ...mockReq('/v1/models', 'POST'), headers: { authorization: 'Bearer sk-approach-test' } });
    for (let i = 0; i < 4; i++) expect(run(limiter, req()).nexted).toBe(true); // 4/5 = 80%

    const fp = `key:${createHash('sha256').update('sk-approach-test').digest('hex').slice(0, 8)}`;
    const warns = () =>
      queryLogs({ levels: ['warn'] }).filter(e => e.event === 'approaching' && e.message.includes(fp));
    expect(warns()).toHaveLength(1);
    expect(warns()[0].message).toContain('80%');

    // The 5th pass is over the threshold but not a rejection — no repeat.
    expect(run(limiter, req()).nexted).toBe(true);
    expect(warns()).toHaveLength(1);

    // The 6th is the actual 429 — still no second warning (same window).
    expect(run(limiter, req()).nexted).toBe(false);
    expect(warns()).toHaveLength(1);
  });

});
