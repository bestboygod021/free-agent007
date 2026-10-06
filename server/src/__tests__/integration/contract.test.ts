import { describe, it, expect, beforeAll } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb, getDb } from '../../db/index.js';
import { mintDashboardToken } from '../helpers/auth.js';
import {
  proxySettingsSchema,
  analyticsSummarySchema,
  authStatusSchema,
  apiKeyResponseSchema,
  savedFusionConfigSchema,
  fusionConfigResponseSchema,
  fallbackEntrySchema,
  cacheStatsSchema,
  byPlatformRowSchema,
  byClientRowSchema,
  timelineBucketSchema,
  byModelRowSchema,
  byKeyRowSchema,
  errorDistributionSchema,
  recentErrorRowSchema,
  recentCallRowSchema,
  recentCallsResponseSchema,
  requestDetailSchema,
  requestAttemptSchema,
} from '@freellmapi/shared/schemas.js';

// Contract test: the shared Zod schemas (shared/schemas.ts) must parse the
// JSON the server ACTUALLY emits. A field that is renamed, dropped, retyped,
// or newly added on the backend fails here — before the dashboard (which
// types its queries from the same schemas) breaks in a browser.
//
// The exact-keys assertions go both ways: removals AND additions are drift,
// because the client interfaces are closed shapes and a silent new field
// means the contract evolved without updating both ends. Row shapes are
// checked against SEEDED rows (one success + one error call on a real API
// key) so the assertions exercise actual data instead of empty arrays; the
// grouping fields the fallback endpoint only sends for unified models stay
// optional in the schema and are therefore not part of exact-keys checks.

let dashToken = '';
let successRequestId = 0;

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

function expectExactKeys(value: object, shape: Record<string, unknown>) {
  expect(sortedKeys(value)).toEqual(Object.keys(shape).sort());
}

/** Row-shape check for array endpoints: parse row 0 and require its keys to
 *  match the schema exactly (no optional keys in row schemas). */
function expectRowContract(body: unknown, schema: { safeParse: (v: unknown) => { success: boolean; error?: { message: string } }; shape: Record<string, unknown> }, minRows: number) {
  expect(Array.isArray(body)).toBe(true);
  const rows = body as unknown[];
  expect(rows.length).toBeGreaterThanOrEqual(minRows);
  const parsed = schema.safeParse(rows[0]);
  if (!parsed.success) throw new Error(`row drifted: ${parsed.error?.message}`);
  expectExactKeys(rows[0] as object, schema.shape);
}

describe('Shared API contracts (zod schemas vs live responses)', () => {
  let app: Express;

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();
    dashToken = mintDashboardToken();

    // ── Fixtures: a real API key + one success and one error call, so the
    // analytics row contracts parse actual data instead of empty arrays.
    const keyRes = await req(app, 'POST', '/api/keys', {
      platform: 'groq',
      key: 'gsk_contract_test_key',
      label: 'Contract Test',
    });
    expect(keyRes.status).toBe(201);
    const keyId = (getDb().prepare('SELECT id FROM api_keys').get() as { id: number }).id;

    const when = new Date(Date.now() - 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    const insert = getDb().prepare(`
      INSERT INTO requests (platform, model_id, key_id, status, input_tokens, output_tokens,
                            latency_ms, error, ttfb_ms, requested_model, served_model,
                            client_ip, client_user_agent, client_agent, created_at)
      VALUES ('groq', 'contract-model', ?, ?, 120, 40, 900, ?, 250, 'contract-model', 'contract-model',
              '127.0.0.1', 'vitest/1.0', 'vitest', ?)
    `);
    successRequestId = Number(insert.run(keyId, 'success', null, when).lastInsertRowid);
    insert.run(keyId, 'error', '429 rate limit exceeded', when);
    getDb().prepare(`
      INSERT INTO request_attempts (request_id, ordinal, platform, model_id, key_ordinal,
                                    key_label, outcome, start_offset_ms, duration_ms, error_summary)
      VALUES (?, 0, 'groq', 'contract-model', 0, 'Contract Test', 'error', 0, 250, '429 rate limit exceeded')
    `).run(successRequestId);
  });

  it('GET /api/settings/proxy matches proxySettingsSchema exactly', async () => {
    const { status, body } = await req(app, 'GET', '/api/settings/proxy');
    expect(status).toBe(200);
    expect(body).toBeTypeOf('object');
    const parsed = proxySettingsSchema.safeParse(body);
    if (!parsed.success) throw new Error(`proxy settings drifted: ${parsed.error.message}`);
    expectExactKeys(body as object, proxySettingsSchema.shape);
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
      expectExactKeys(body as object, analyticsSummarySchema.shape);
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
    expectExactKeys(body as object, authStatusSchema.shape);
    expect(parsed.data.authenticated).toBe(true);
    expect(parsed.data.email).toBe('test@example.com');
    expect(parsed.data.needsSetup).toBe(false);
  });

  it('GET /api/settings/api-key matches apiKeyResponseSchema exactly', async () => {
    const { status, body } = await req(app, 'GET', '/api/settings/api-key');
    expect(status).toBe(200);
    const parsed = apiKeyResponseSchema.safeParse(body);
    if (!parsed.success) throw new Error(`api-key envelope drifted: ${parsed.error.message}`);
    expectExactKeys(body as object, apiKeyResponseSchema.shape);
    expect(parsed.data.apiKey.length).toBeGreaterThan(0);
  });

  it('GET /api/settings/fusion matches fusionConfigResponseSchema exactly', async () => {
    const { status, body } = await req(app, 'GET', '/api/settings/fusion');
    expect(status).toBe(200);
    const parsed = fusionConfigResponseSchema.safeParse(body);
    if (!parsed.success) throw new Error(`fusion envelope drifted: ${parsed.error.message}`);
    expectExactKeys(body as object, fusionConfigResponseSchema.shape);
    // The nested config is a closed 6-field object, so it gets exact keys too.
    expectExactKeys(parsed.data.config as object, savedFusionConfigSchema.shape);
  });

  it('PUT /api/settings/fusion round-trips the bare config', async () => {
    const config = {
      mode: 'explicit' as const,
      models: ['groq/contract-model'],
      judge: null,
      k: 2,
      strategy: 'best_of' as const,
      expose_panel: false,
    };
    const put = await req(app, 'PUT', '/api/settings/fusion', config);
    expect(put.status).toBe(200);
    const parsed = fusionConfigResponseSchema.parse(put.body);
    expect(parsed.config).toEqual(config);

    const again = await req(app, 'GET', '/api/settings/fusion');
    expect(fusionConfigResponseSchema.parse(again.body).config).toEqual(config);
  });

  it('GET /api/fallback rows match fallbackEntrySchema', async () => {
    const { status, body } = await req(app, 'GET', '/api/fallback');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    const rows = body as unknown[];
    // The catalog seeds the chain, so the endpoint must be non-empty; parse
    // every row (grouping fields are optional and only sent when unify
    // groups exist, which is why this endpoint skips exact-keys).
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const row of rows) {
      const parsed = fallbackEntrySchema.safeParse(row);
      if (!parsed.success) throw new Error(`fallback entry drifted: ${parsed.error.message}`);
    }
  });

  it('GET /api/cache/stats matches cacheStatsSchema exactly', async () => {
    const { status, body } = await req(app, 'GET', '/api/cache/stats');
    expect(status).toBe(200);
    const parsed = cacheStatsSchema.safeParse(body);
    if (!parsed.success) throw new Error(`cache stats drifted: ${parsed.error.message}`);
    expectExactKeys(body as object, cacheStatsSchema.shape);
  });

  it('GET /api/analytics/by-platform rows match byPlatformRowSchema', async () => {
    const { status, body } = await req(app, 'GET', '/api/analytics/by-platform?range=7d');
    expect(status).toBe(200);
    expectRowContract(body, byPlatformRowSchema, 1);
  });

  it('GET /api/analytics/by-client rows match byClientRowSchema', async () => {
    const { status, body } = await req(app, 'GET', '/api/analytics/by-client?range=7d');
    expect(status).toBe(200);
    expectRowContract(body, byClientRowSchema, 1);
  });

  it('GET /api/analytics/timeline matches timelineBucketSchema', async () => {
    const { status, body } = await req(app, 'GET', '/api/analytics/timeline?range=7d');
    expect(status).toBe(200);
    // Rows come from the request_hourly aggregate, which a raw-row seed does
    // not populate — an empty array is a valid answer, a non-array is not.
    expect(Array.isArray(body)).toBe(true);
    for (const row of body as unknown[]) {
      const parsed = timelineBucketSchema.safeParse(row);
      if (!parsed.success) throw new Error(`timeline bucket drifted: ${parsed.error.message}`);
    }
  });

  it('GET /api/analytics/by-model rows match byModelRowSchema', async () => {
    const { status, body } = await req(app, 'GET', '/api/analytics/by-model?range=7d');
    expect(status).toBe(200);
    expectRowContract(body, byModelRowSchema, 1);
  });

  it('GET /api/analytics/by-key rows match byKeyRowSchema', async () => {
    const { status, body } = await req(app, 'GET', '/api/analytics/by-key?range=7d');
    expect(status).toBe(200);
    expectRowContract(body, byKeyRowSchema, 1);
  });

  it('GET /api/analytics/errors rows match recentErrorRowSchema', async () => {
    const { status, body } = await req(app, 'GET', '/api/analytics/errors?range=7d');
    expect(status).toBe(200);
    expectRowContract(body, recentErrorRowSchema, 1);
  });

  it('GET /api/analytics/error-distribution matches errorDistributionSchema exactly', async () => {
    const { status, body } = await req(app, 'GET', '/api/analytics/error-distribution?range=7d');
    expect(status).toBe(200);
    const parsed = errorDistributionSchema.safeParse(body);
    if (!parsed.success) throw new Error(`error distribution drifted: ${parsed.error.message}`);
    expectExactKeys(body as object, errorDistributionSchema.shape);
    // The seeded error row fills all three lanes; nested row shapes matter
    // (the byPlatform lane is endpoint-scoped per #889).
    expect(parsed.data.byCategory.length).toBeGreaterThanOrEqual(1);
    expect(parsed.data.byPlatform.length).toBeGreaterThanOrEqual(1);
    expect(parsed.data.detailed.length).toBeGreaterThanOrEqual(1);
    expectExactKeys(parsed.data.byPlatform[0], errorDistributionSchema.shape.byPlatform.element.shape);
    expectExactKeys(parsed.data.detailed[0], errorDistributionSchema.shape.detailed.element.shape);
  });

  it('GET /api/analytics/requests matches recentCallsResponseSchema exactly', async () => {
    const { status, body } = await req(app, 'GET', '/api/analytics/requests?range=7d');
    expect(status).toBe(200);
    const parsed = recentCallsResponseSchema.safeParse(body);
    if (!parsed.success) throw new Error(`recent calls envelope drifted: ${parsed.error.message}`);
    expectExactKeys(body as object, recentCallsResponseSchema.shape);
    expect(parsed.data.rows.length).toBeGreaterThanOrEqual(2);
    // Row-level: the seeded success call must parse with its exact keys.
    const seeded = parsed.data.rows.find(r => r.id === successRequestId);
    expect(seeded).toBeDefined();
    expectExactKeys(seeded as object, recentCallRowSchema.shape);
  });

  it('GET /api/analytics/requests/:id matches requestDetailSchema exactly', async () => {
    const { status, body } = await req(app, 'GET', `/api/analytics/requests/${successRequestId}`);
    expect(status).toBe(200);
    const parsed = requestDetailSchema.safeParse(body);
    if (!parsed.success) throw new Error(`request detail drifted: ${parsed.error.message}`);
    expectExactKeys(body as object, requestDetailSchema.shape);
    expect(parsed.data.attempts.length).toBeGreaterThanOrEqual(1);
    expectExactKeys(parsed.data.attempts[0], requestAttemptSchema.shape);
  });
});
