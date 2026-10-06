import { describe, it, expect, beforeAll } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb } from '../../db/index.js';
import { mintDashboardToken } from '../helpers/auth.js';
import {
  proxySettingsSchema,
  analyticsSummarySchema,
  authStatusSchema,
} from '@freellmapi/shared/schemas.js';

// Contract test: the shared Zod schemas (shared/schemas.ts) must parse the
// JSON the server ACTUALLY emits. A field that is renamed, dropped, retyped,
// or newly added on the backend fails here — before the dashboard (which
// types its queries from the same schemas) breaks in a browser.
//
// The exact-keys assertions go both ways: removals AND additions are drift,
// because the client interfaces are closed shapes and a silent new field
// means the contract evolved without updating both ends.

let dashToken = '';

async function req(app: Express, method: string, path: string, body?: unknown) {
  const server = app.listen(0, '127.0.0.1');
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const addr = server.address() as { port: number };
  const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${dashToken}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.text();
  server.close();

  let json: unknown = null;
  try { json = JSON.parse(data); } catch { /* non-JSON surfaces in assertions below */ }
  return { status: res.status, body: json, raw: data };
}

const sortedKeys = (o: object) => Object.keys(o).sort();

describe('Shared API contracts (zod schemas vs live responses)', () => {
  let app: Express;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();
    dashToken = mintDashboardToken();
  });

  it('GET /api/settings/proxy matches proxySettingsSchema exactly', async () => {
    const { status, body } = await req(app, 'GET', '/api/settings/proxy');
    expect(status).toBe(200);
    expect(body).toBeTypeOf('object');
    const parsed = proxySettingsSchema.safeParse(body);
    if (!parsed.success) throw new Error(`proxy settings drifted: ${parsed.error.message}`);
    expect(sortedKeys(body as object)).toEqual(Object.keys(proxySettingsSchema.shape).sort());
  });

  it('PUT /api/settings/proxy round-trips through the schema', async () => {
    const patch = {
      proxyUrl: 'http://127.0.0.1:9999',
      enabled: false,
      bypassPlatforms: ['openai', 'groq'],
    };
    const put = await req(app, 'PUT', '/api/settings/proxy', patch);
    expect(put.status).toBe(200);
    if (!proxySettingsSchema.safeParse(put.body).success) {
      throw new Error(`PUT envelope drifted: ${JSON.stringify(put.body)}`);
    }

    const { status, body } = await req(app, 'GET', '/api/settings/proxy');
    expect(status).toBe(200);
    const parsed = proxySettingsSchema.parse(body);
    expect(parsed.proxyUrl).toBe(patch.proxyUrl);
    expect(parsed.enabled).toBe(patch.enabled);
    expect(parsed.bypassPlatforms).toEqual(patch.bypassPlatforms);
  });

  it.each(['7d', '30d'] as const)(
    'GET /api/analytics/summary?range=%s matches analyticsSummarySchema exactly',
    async range => {
      const { status, body } = await req(app, 'GET', `/api/analytics/summary?range=${range}`);
      expect(status).toBe(200);
      const parsed = analyticsSummarySchema.safeParse(body);
      if (!parsed.success) throw new Error(`analytics summary drifted: ${parsed.error.message}`);
      expect(sortedKeys(body as object)).toEqual(Object.keys(analyticsSummarySchema.shape).sort());
      // Nullable lanes of the contract: null when the raw window is empty.
      expect(parsed.data.p50LatencyMs === null || typeof parsed.data.p50LatencyMs === 'number').toBe(true);
      expect(parsed.data.firstRequestAt === null || typeof parsed.data.firstRequestAt === 'string').toBe(true);
      expect(Object.keys(parsed.data.requestTypeCounts).sort()).toEqual(['chat', 'embedding']);
    }
  );

  it('GET /api/auth/status matches authStatusSchema', async () => {
    const { status, body } = await req(app, 'GET', '/api/auth/status');
    expect(status).toBe(200);
    const parsed = authStatusSchema.safeParse(body);
    if (!parsed.success) throw new Error(`auth status drifted: ${parsed.error.message}`);
    expect(sortedKeys(body as object)).toEqual(Object.keys(authStatusSchema.shape).sort());
    expect(parsed.data.authenticated).toBe(true);
    expect(parsed.data.email).toBe('test@example.com');
    expect(parsed.data.needsSetup).toBe(false);
  });
});
