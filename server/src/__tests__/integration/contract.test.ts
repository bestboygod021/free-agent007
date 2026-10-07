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
  embeddingsDataSchema,
  embeddingsUsageSchema,
  agentModesResponseSchema,
  agentModeProfileSchema,
  agentStatesResponseSchema,
  agentRunContextSchema,
  agentPromptsResponseSchema,
  compressionConfigSchema,
  compressionStatsSchema,
  updateStatusSchema,
  updateReleaseSchema,
  penaltyInspectorSchema,
  mediaDataSchema,
  mediaUsageSchema,
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

/** For envelopes with optional lanes: no unknown keys, no missing required
 *  keys — absent optionals (compression's autoTriggerEstTokens/targetTokens)
 *  are legitimate, extra ones are not. */
function expectConfigKeys(value: object, shape: Record<string, { isOptional?: () => boolean }>) {
  const all = Object.keys(shape);
  const required = all.filter(k => !shape[k].isOptional?.());
  const keys = Object.keys(value);
  expect(keys.filter(k => !all.includes(k))).toEqual([]);
  expect(required.filter(k => !keys.includes(k))).toEqual([]);
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
    // A media model so /api/media and /api/media/usage return row shapes,
    // not just empty arrays (the fresh catalog ships no media rows).
    getDb().prepare(`
      INSERT INTO media_models (platform, model_id, display_name, modality)
      VALUES ('groq', 'contract-media', 'Contract Media', 'image')
    `).run();
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

  it('GET /api/embeddings matches embeddingsDataSchema exactly', async () => {
    const { status, body } = await req(app, 'GET', '/api/embeddings');
    expect(status).toBe(200);
    const parsed = embeddingsDataSchema.safeParse(body);
    if (!parsed.success) throw new Error(`embeddings data drifted: ${parsed.error.message}`);
    expectExactKeys(body as object, embeddingsDataSchema.shape);
    expect(parsed.data.families.length).toBeGreaterThanOrEqual(1);
    const family = parsed.data.families[0];
    expectExactKeys(family as object, embeddingsDataSchema.shape.families.element.shape);
    expect(family.providers.length).toBeGreaterThanOrEqual(1);
    // isCustom must be PRESENT (the two page-local copies disagreed: one
    // optional, one absent) — exact keys fail if the server ever drops it.
    expectExactKeys(family.providers[0], embeddingsDataSchema.shape.families.element.shape.providers.element.shape);
  });

  it('GET /api/embeddings/usage matches embeddingsUsageSchema exactly', async () => {
    const { status, body } = await req(app, 'GET', '/api/embeddings/usage');
    expect(status).toBe(200);
    const parsed = embeddingsUsageSchema.safeParse(body);
    if (!parsed.success) throw new Error(`embeddings usage drifted: ${parsed.error.message}`);
    expectExactKeys(body as object, embeddingsUsageSchema.shape);
    expect(parsed.data.families.length).toBeGreaterThanOrEqual(1);
    const row = parsed.data.families[0];
    expectExactKeys(row as object, embeddingsUsageSchema.shape.families.element.shape);
    // platform/quotaLabel are always present (nullable), not optional as the
    // old client interface claimed.
    expect(row.platform === null || typeof row.platform === 'string').toBe(true);
  });

  it('GET /api/agent/modes matches agentModesResponseSchema exactly', async () => {
    const { status, body } = await req(app, 'GET', '/api/agent/modes');
    expect(status).toBe(200);
    const parsed = agentModesResponseSchema.safeParse(body);
    if (!parsed.success) throw new Error(`agent modes drifted: ${parsed.error.message}`);
    expectExactKeys(body as object, agentModesResponseSchema.shape);
    expect(parsed.data.modes.length).toBeGreaterThanOrEqual(1);
    const entry = parsed.data.modes[0];
    expectExactKeys(entry as object, agentModesResponseSchema.shape.modes.element.shape);
    // Deep profile contract: fallbackOrder / routing / upgradeHintFa exist
    // server-side even though the page's old local type omitted them.
    expectExactKeys(entry.profile, agentModeProfileSchema.shape);
    expectExactKeys(entry.profile.providerPolicy, agentModeProfileSchema.shape.providerPolicy.shape);
    expectExactKeys(entry.profile.budget, agentModeProfileSchema.shape.budget.shape);
    expectExactKeys(entry.profile.execution, agentModeProfileSchema.shape.execution.shape);
    expect(entry.profile.fallbackOrder.length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(entry.profile.routing).length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/agent/states matches agentStatesResponseSchema exactly', async () => {
    const { status, body } = await req(app, 'GET', '/api/agent/states');
    expect(status).toBe(200);
    const parsed = agentStatesResponseSchema.safeParse(body);
    if (!parsed.success) throw new Error(`agent states drifted: ${parsed.error.message}`);
    // initialContext is part of the contract even though older client
    // typings omitted it entirely.
    expectExactKeys(body as object, agentStatesResponseSchema.shape);
    expect(parsed.data.states.length).toBeGreaterThanOrEqual(1);
    expect(parsed.data.terminal.length).toBeGreaterThanOrEqual(1);
    // blockReason is optional (unset until a transition blocks) — no
    // exact-keys on the context object, presence of the lane is enough.
    agentRunContextSchema.parse(parsed.data.initialContext);
  });

  it('GET /api/agent/prompts matches agentPromptsResponseSchema exactly', async () => {
    const { status, body } = await req(app, 'GET', '/api/agent/prompts');
    expect(status).toBe(200);
    const parsed = agentPromptsResponseSchema.safeParse(body);
    if (!parsed.success) throw new Error(`agent prompts drifted: ${parsed.error.message}`);
    expectExactKeys(body as object, agentPromptsResponseSchema.shape);
    expect(parsed.data.count).toBe(parsed.data.prompts.length);
    if (parsed.data.prompts.length > 0) {
      expectExactKeys(parsed.data.prompts[0], agentPromptsResponseSchema.shape.prompts.element.shape);
    }
  });

  it('GET /api/settings/compression matches compressionConfigSchema keys', async () => {
    const { status, body } = await req(app, 'GET', '/api/settings/compression');
    expect(status).toBe(200);
    const parsed = compressionConfigSchema.safeParse(body);
    if (!parsed.success) throw new Error(`compression config drifted: ${parsed.error.message}`);
    expectConfigKeys(body as object, compressionConfigSchema.shape);
    expect(Object.keys(parsed.data.engines).length).toBeGreaterThanOrEqual(1);
    // Every engine block at least carries `enabled` (catchall keeps the
    // engine-private tuning keys opaque but present-tolerant).
    for (const engine of Object.values(parsed.data.engines)) {
      expect(typeof engine.enabled).toBe('boolean');
    }
  });

  it('GET /api/compression/stats matches compressionStatsSchema exactly', async () => {
    const { status, body } = await req(app, 'GET', '/api/compression/stats');
    expect(status).toBe(200);
    const parsed = compressionStatsSchema.safeParse(body);
    if (!parsed.success) throw new Error(`compression stats drifted: ${parsed.error.message}`);
    expectExactKeys(body as object, compressionStatsSchema.shape);
    // The stats envelope embeds the config snapshot — same sub-contract.
    expectConfigKeys(parsed.data.config as object, compressionConfigSchema.shape);
  });

  it('GET /api/update/status matches updateStatusSchema exactly', async () => {
    const { status, body } = await req(app, 'GET', '/api/update/status');
    expect(status).toBe(200);
    const parsed = updateStatusSchema.safeParse(body);
    if (!parsed.success) throw new Error(`update status drifted: ${parsed.error.message}`);
    expectExactKeys(body as object, updateStatusSchema.shape);
  });

  it('GET /api/update/release matches updateReleaseSchema', async () => {
    const { status, body } = await req(app, 'GET', '/api/update/release');
    expect(status).toBe(200);
    // Union contract: either the mapped release or the { disabled: true }
    // opt-out envelope. (Upstream-dependent /check is deliberately not
    // asserted here — the sandbox and CI cannot reach the release feed.)
    const parsed = updateReleaseSchema.safeParse(body);
    if (!parsed.success) throw new Error(`update release drifted: ${parsed.error.message}`);
    if ('disabled' in parsed.data) expect(parsed.data.disabled).toBe(true);
    else expect(parsed.data.tagName.length).toBeGreaterThan(0);
  });

  it('GET /api/fallback/penalty-inspector matches penaltyInspectorSchema exactly', async () => {
    const { status, body } = await req(app, 'GET', '/api/fallback/penalty-inspector');
    expect(status).toBe(200);
    const parsed = penaltyInspectorSchema.safeParse(body);
    if (!parsed.success) throw new Error(`penalty inspector drifted: ${parsed.error.message}`);
    expectExactKeys(body as object, penaltyInspectorSchema.shape);
    // Fresh installs have no penalties/cooldowns, so rows is legitimately
    // empty; the row schema mirrors the server's InspectorRow field-for-field
    // (source-verified) and is exercised whenever a penalty exists.
    expect(Array.isArray(parsed.data.rows)).toBe(true);
  });

  it('GET /api/media matches mediaDataSchema exactly (seeded row)', async () => {
    const { status, body } = await req(app, 'GET', '/api/media');
    expect(status).toBe(200);
    const parsed = mediaDataSchema.safeParse(body);
    if (!parsed.success) throw new Error(`media data drifted: ${parsed.error.message}`);
    expectExactKeys(body as object, mediaDataSchema.shape);
    expect(parsed.data.models.length).toBeGreaterThanOrEqual(1);
    expectExactKeys(parsed.data.models[0], mediaDataSchema.shape.models.element.shape);
  });

  it('GET /api/media/usage matches mediaUsageSchema exactly (seeded row)', async () => {
    const { status, body } = await req(app, 'GET', '/api/media/usage?modality=image');
    expect(status).toBe(200);
    const parsed = mediaUsageSchema.safeParse(body);
    if (!parsed.success) throw new Error(`media usage drifted: ${parsed.error.message}`);
    expectExactKeys(body as object, mediaUsageSchema.shape);
    expect(parsed.data.models.length).toBeGreaterThanOrEqual(1);
    expectExactKeys(parsed.data.models[0], mediaUsageSchema.shape.models.element.shape);
    expect(parsed.data.modality).toBe('image');
  });
});
