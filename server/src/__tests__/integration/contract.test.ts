import { describe, it, expect, beforeAll } from 'vitest';
import { z } from 'zod';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb, getDb } from '../../db/index.js';
import { mintDashboardToken } from '../helpers/auth.js';
import { PLATFORMS as SERVER_PLATFORMS } from '../../routes/keys.js';
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
  logsResponseSchema,
  licenseStatusSchema,
  premiumStatusSchema,
  healthDataSchema,
  degradationStatusSchema,
  backupListSchema,
  backupScheduleResponseSchema,
  backupCreateResponseSchema,
  backupTablesResponseSchema,
  chainSchema,
  routingDataSchema,
  tokenUsageDataSchema,
  rateLimitUsageDataSchema,
  conversationSummarySchema,
  conversationDetailSchema,
  playgroundChatMessageSchema,
  logEntrySchema,
  logCountsSchema,
  catalogSyncStateSchema,
  healthPlatformSchema,
  healthKeyRowSchema,
  backupMetaSchema,
  backupScheduleSchema,
  routingScoreRowSchema,
  tokenUsageModelSchema,
  rateLimitUsageRowSchema,
  errorResponseSchema,
  ollamaNativeErrorSchema,
  profileUpdateSchema,
  conversationPatchSchema,
  logQuerySchema,
  signupInputSchema,
  loginInputSchema,
  apiKeyPlatformSchema,
  addApiKeySchema,
  updateApiKeySchema,
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

// ─── Turn 6: type-aliased response bodies now pinned by schema ───
describe('response contracts: logs/premium/health/backups/profiles/routing/conversations', () => {
  it('GET /api/logs: entries/nextId/counts envelope', async () => {
    const res = await req(app, 'GET', '/api/logs');
    expect(res.status).toBe(200);
    const body = logsResponseSchema.parse(res.body);
    expectConfigKeys(res.body, logsResponseSchema.shape);
    expectConfigKeys(body.counts, logCountsSchema.shape);
    // Optional lanes (provider/model/event/requestId/…) are omitted when unset;
    // expectConfigKeys accepts absent optionals but never unknown keys.
    for (const e of body.entries.slice(0, 3)) expectConfigKeys(e, logEntrySchema.shape);
  });

  it('GET /api/premium: license + catalog-sync envelope', async () => {
    const res = await req(app, 'GET', '/api/premium');
    expect(res.status).toBe(200);
    const body = premiumStatusSchema.parse(res.body);
    expectConfigKeys(res.body, premiumStatusSchema.shape);
    expectConfigKeys(body.catalog, catalogSyncStateSchema.shape);
    if (body.license !== null) licenseStatusSchema.parse(body.license);
  });

  it('GET /api/health: platforms/keys/quota states/degradation', async () => {
    const res = await req(app, 'GET', '/api/health');
    expect(res.status).toBe(200);
    const body = healthDataSchema.parse(res.body);
    expectConfigKeys(res.body, healthDataSchema.shape);
    expectConfigKeys(body.degradation, degradationStatusSchema.shape);
    if (body.platforms.length > 0) expectConfigKeys(body.platforms[0], healthPlatformSchema.shape);
    if (body.keys.length > 0) expectConfigKeys(body.keys[0], healthKeyRowSchema.shape);
  });

  it('GET /api/backups: list envelope with meta rows', async () => {
    const res = await req(app, 'GET', '/api/backups');
    expect(res.status).toBe(200);
    const body = backupListSchema.parse(res.body);
    expectConfigKeys(res.body, backupListSchema.shape);
    if (body.items.length > 0) expectConfigKeys(body.items[0], backupMetaSchema.shape);
  });

  it('POST /api/backups: created meta row', async () => {
    const res = await req(app, 'POST', '/api/backups', {});
    expect(res.status).toBe(201);
    const body = backupCreateResponseSchema.parse(res.body);
    expectConfigKeys(res.body, backupCreateResponseSchema.shape);
    expectConfigKeys(body.backup, backupMetaSchema.shape);
    expect(body.backup.filesize).toBeGreaterThan(0);
  });

  it('GET /api/backups/schedule + /tables: envelopes', async () => {
    const sched = await req(app, 'GET', '/api/backups/schedule');
    expect(sched.status).toBe(200);
    const schedBody = backupScheduleResponseSchema.parse(sched.body);
    expectConfigKeys(sched.body, backupScheduleResponseSchema.shape);
    expectConfigKeys(schedBody.schedule, backupScheduleSchema.shape);

    const tables = await req(app, 'GET', '/api/backups/tables');
    expect(tables.status).toBe(200);
    const tablesBody = backupTablesResponseSchema.parse(tables.body);
    expectConfigKeys(tables.body, backupTablesResponseSchema.shape);
    expect(tablesBody.tables.every(t => typeof t === 'string')).toBe(true);
  });

  it('GET /api/profiles: chain rows match the shared Chain contract', async () => {
    const res = await req(app, 'GET', '/api/profiles');
    expect(res.status).toBe(200);
    const rows = z.array(chainSchema).parse(res.body);
    const def = rows.find(r => r.type === 'default');
    expect(def).toBeDefined();
    expectConfigKeys(def!, chainSchema.shape);
  });

  it('GET /api/fallback/routing: strategy/weights/scores envelope', async () => {
    const res = await req(app, 'GET', '/api/fallback/routing');
    expect(res.status).toBe(200);
    const body = routingDataSchema.parse(res.body);
    expectConfigKeys(res.body, routingDataSchema.shape);
    if (body.scores.length > 0) expectConfigKeys(body.scores[0], routingScoreRowSchema.shape);
  });

  it('GET /api/fallback/token-usage: budget envelope + model rows', async () => {
    const res = await req(app, 'GET', '/api/fallback/token-usage');
    expect(res.status).toBe(200);
    const body = tokenUsageDataSchema.parse(res.body);
    expectConfigKeys(res.body, tokenUsageDataSchema.shape);
    // Rows only appear for platforms with enabled keys (seeded in beforeAll);
    // tolerate an empty list on a database where that seed is absent.
    if (body.models.length > 0) expectConfigKeys(body.models[0], tokenUsageModelSchema.shape);
  });

  it('GET /api/fallback/rate-limit-usage: window rows', async () => {
    const res = await req(app, 'GET', '/api/fallback/rate-limit-usage');
    expect(res.status).toBe(200);
    const body = rateLimitUsageDataSchema.parse(res.body);
    expectConfigKeys(res.body, rateLimitUsageDataSchema.shape);
    if (body.rows.length > 0) expectConfigKeys(body.rows[0], rateLimitUsageRowSchema.shape);
  });

  it('GET/POST /api/conversations: summaries and the detail transcript', async () => {
    const created = await req(app, 'POST', '/api/conversations', {
      title: 'contract-shape probe',
      messages: [{ role: 'user', content: 'ping' }],
    });
    expect([200, 201]).toContain(created.status);

    const list = await req(app, 'GET', '/api/conversations');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    const summaries = z.array(conversationSummarySchema).parse(list.body);
    for (const s of summaries) expectConfigKeys(s, conversationSummarySchema.shape);
    const probe = summaries.find(s => s.title === 'contract-shape probe');
    expect(probe).toBeDefined();

    const detail = await req(app, 'GET', `/api/conversations/${probe!.id}`);
    expect(detail.status).toBe(200);
    const conv = conversationDetailSchema.parse(detail.body);
    expectConfigKeys(detail.body, conversationDetailSchema.shape);
    expect(conv.messages.length).toBeGreaterThan(0);
    playgroundChatMessageSchema.parse(conv.messages[0]);
  });
});

// ─── Turn 7: the shared error envelope, across every failure class ───
describe('error envelope: { error: { message, type?, code? } }', () => {
  /** Same as `req` but WITHOUT the Authorization header, for 401 probes. */
  async function reqNoAuth(app: Express, path: string) {
    const server = app.listen(0, '127.0.0.1');
    if (!server.listening) await new Promise<void>(resolve => server.once('listening', () => resolve()));
    const addr = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${addr.port}${path}`);
    const data = await res.text();
    server.close();
    let json: unknown = null;
    try { json = JSON.parse(data); } catch { /* non-JSON surfaces in assertions below */ }
    return { status: res.status, body: json };
  }

  it('401 without a token: nested envelope with authentication_error', async () => {
    const res = await reqNoAuth(app, '/api/logs');
    expect(res.status).toBe(401);
    const body = errorResponseSchema.parse(res.body);
    expectConfigKeys(res.body as object, errorResponseSchema.shape);
    expect(body.error.type).toBe('authentication_error');
    expect(body.error.message).toContain('Authentication');
  });

  it("400 invalid query: analytics status filter", async () => {
    const res = await req(app, 'GET', '/api/analytics/requests?status=bogus');
    expect(res.status).toBe(400);
    errorResponseSchema.parse(res.body);
    expectConfigKeys(res.body as object, errorResponseSchema.shape);
  });

  it('400 invalid path param + 404 missing row: key cooldowns', async () => {
    const bad = await req(app, 'DELETE', '/api/keys/abc/cooldowns');
    expect(bad.status).toBe(400);
    const badBody = errorResponseSchema.parse(bad.body);
    expectConfigKeys(bad.body as object, errorResponseSchema.shape);
    expect(badBody.error.message).toContain('Invalid key id');

    const missing = await req(app, 'DELETE', '/api/keys/999999/cooldowns');
    expect(missing.status).toBe(404);
    const missingBody = errorResponseSchema.parse(missing.body);
    expectConfigKeys(missing.body as object, errorResponseSchema.shape);
    expect(missingBody.error.message).toContain('not found');
  });

  it('400 invalid body: premium key activation', async () => {
    const res = await req(app, 'POST', '/api/premium/key', { key: 'short' });
    expect(res.status).toBe(400);
    errorResponseSchema.parse(res.body);
    expectConfigKeys(res.body as object, errorResponseSchema.shape);
  });

  it('409 conflict: duplicate profile name', async () => {
    const first = await req(app, 'POST', '/api/profiles', { name: 'conflict-probe' });
    expect(first.status).toBe(201);

    const res = await req(app, 'POST', '/api/profiles', { name: 'conflict-probe' });
    expect(res.status).toBe(409);
    const body = errorResponseSchema.parse(res.body);
    expectConfigKeys(res.body as object, errorResponseSchema.shape);
    expect(body.error.message).toContain('already exists');
  });

  it('404 unknown /api path: JSON catch-all, not Express HTML', async () => {
    const res = await req(app, 'GET', '/api/__no_such_route__');
    expect(res.status).toBe(404);
    const body = errorResponseSchema.parse(res.body);
    expectConfigKeys(res.body as object, errorResponseSchema.shape);
    expect(body.error.type).toBe('route_not_found');
    expect(body.error.message).toContain('GET /api/__no_such_route__');
  });

  it('Ollama native surface keeps the protocol string error', async () => {
    const res = await req(app, 'GET', '/api/tags');
    expect(res.status).toBe(404); // emulation defaults to off in a fresh DB
    const body = ollamaNativeErrorSchema.parse(res.body);
    expectConfigKeys(res.body as object, ollamaNativeErrorSchema.shape);
    expect(body.error).toContain('emulation');
  });
});

// ─── Turn 9: input contracts — shared schemas and the routes must agree ───
// The server validates with its route-local zod copies (shared/ is imported
// type-only at runtime); every sample below is pushed through BOTH the HTTP
// route and the shared schema, so a drift on either side fails here.
describe('input contracts: profiles PUT, conversation PATCH, logs query', () => {
  it('PUT /api/profiles/:id rejects bad names — HTTP and shared schema agree', async () => {
    const samples = [
      { name: 'bad name!' },
      { name: 'default' },        // reserved preset name
      { name: 'x'.repeat(21) },   // over the 20-char cap
      { name: '' },               // empty
    ];
    for (const body of samples) {
      const res = await req(app, 'PUT', '/api/profiles/1', body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      errorResponseSchema.parse(res.body);
      expect(profileUpdateSchema.safeParse(body).success).toBe(false);
    }
  });

  it('PUT /api/profiles/:id: booleans in, 0/1 out; wrong types rejected on both sides', async () => {
    expect(profileUpdateSchema.safeParse({ is_favorite: true }).success).toBe(true);
    const res = await req(app, 'PUT', '/api/profiles/1', { is_favorite: true });
    expect(res.status).toBe(200);
    const row = chainSchema.parse(res.body);
    expect(row.is_favorite).toBe(1); // converted for SQLite on the way in

    const bad = await req(app, 'PUT', '/api/profiles/1', { is_favorite: 'yes' });
    expect(bad.status).toBe(400);
    errorResponseSchema.parse(bad.body);
    expect(profileUpdateSchema.safeParse({ is_favorite: 'yes' }).success).toBe(false);
  });

  it('PUT /api/conversations/:id: strict patch, both sides', async () => {
    for (const body of [{ title: 'x'.repeat(201) }, { nope: 1 }]) {
      const res = await req(app, 'PUT', '/api/conversations/999999', body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      const body_ = errorResponseSchema.parse(res.body);
      expect(body_.error.message).toContain('Invalid conversation update');
      expect(conversationPatchSchema.safeParse(body).success).toBe(false);
    }
    // A valid body clears validation and fails only on the missing row (404
    // after validation proves the order: schema first, lookup second).
    const ok = await req(app, 'PUT', '/api/conversations/999999', { title: 'renamed' });
    expect(ok.status).toBe(404);
    expect(conversationPatchSchema.safeParse({ title: 'renamed' }).success).toBe(true);
  });

  it('GET /api/logs: unknown level and bad cursor are hard 400s', async () => {
    const bad = await req(app, 'GET', '/api/logs?levels=bogus');
    expect(bad.status).toBe(400);
    const parsed = errorResponseSchema.parse(bad.body);
    expect(parsed.error.message).toContain("Unknown log level 'bogus'");
    expect(logQuerySchema.safeParse({ levels: 'bogus' }).success).toBe(false);

    const cursor = await req(app, 'GET', '/api/logs?sinceId=-1');
    expect(cursor.status).toBe(400);
    expect(errorResponseSchema.parse(cursor.body).error.message).toContain('sinceId must be');
    expect(logQuerySchema.safeParse({ sinceId: '-1' }).success).toBe(false);
  });

  it('GET /api/logs: valid filters parse on both sides; limit stays lenient', async () => {
    const good = await req(app, 'GET', '/api/logs?levels=info,warn&sinceId=0&q=boot');
    expect(good.status).toBe(200);
    logsResponseSchema.parse(good.body);
    const shared = logQuerySchema.safeParse({ levels: 'info,warn', sinceId: '0', q: 'boot' });
    expect(shared.success).toBe(true);
    if (shared.success) expect(shared.data).toMatchObject({ levels: ['info', 'warn'], sinceId: 0, q: 'boot' });

    // Non-numeric limits are a preference, not an error: the store clamps.
    const lenient = await req(app, 'GET', '/api/logs?limit=abc');
    expect(lenient.status).toBe(200);
    expect(logQuerySchema.safeParse({ limit: 'abc' }).success).toBe(true);
  });
});

  // ═════════════════════ Turn 10: auth and key body contracts ═════════════════════
  // Ordering: the key/login samples run against the seeded database (session,
  // key id 1); the setup samples unclaim it first, because mintDashboardToken
  // already created a user and setup is a 409 while anyone exists.
  describe('input contracts: auth and key bodies', () => {
    it('login: presence-only lookup contract (#807), both sides', async () => {
      const emptyEmail = { email: '', password: 'x' };
      const s1 = await req(app, 'POST', '/api/auth/login', emptyEmail);
      expect(s1.status).toBe(400);
      expect(errorResponseSchema.parse(s1.body).error.message).toContain('Email is required');
      expect(loginInputSchema.safeParse(emptyEmail).success).toBe(false);

      const emptyPw = { email: 'someone@local.dev', password: '' };
      const s2 = await req(app, 'POST', '/api/auth/login', emptyPw);
      expect(s2.status).toBe(400);
      expect(errorResponseSchema.parse(s2.body).error.message).toContain('Password is required');
      expect(loginInputSchema.safeParse(emptyPw).success).toBe(false);

      // Well-formed address + password passes the schema (login never
      // validates format) and fails only at credentials → 401, not 400.
      const unknown = { email: 'nobody-ten@local.dev', password: 'whatever1' };
      expect(loginInputSchema.safeParse(unknown).success).toBe(true);
      const s3 = await req(app, 'POST', '/api/auth/login', unknown);
      expect(s3.status).toBe(401);
    });

    it('POST /api/keys: platform list parity plus schema/handler split, both sides', async () => {
      // Drift-proofing: the shared enum and the server PLATFORMS are the same
      // set — a platform added on one side only fails right here.
      expect(new Set(SERVER_PLATFORMS)).toEqual(new Set(apiKeyPlatformSchema.options));

      const bad = { platform: 'not-a-platform', key: 'x' };
      const s1 = await req(app, 'POST', '/api/keys', bad);
      expect(s1.status).toBe(400);
      expect(errorResponseSchema.parse(s1.body).error.message).toContain('Invalid enum value');
      expect(addApiKeySchema.safeParse(bad).success).toBe(false);

      // Schema-level `key` is optional (keyless providers), so a missing key
      // for a keyed platform clears validation and is caught by the handler —
      // the two-layer split, sampled on both sides.
      const missingKey = { platform: 'groq' };
      expect(addApiKeySchema.safeParse(missingKey).success).toBe(true);
      const s2 = await req(app, 'POST', '/api/keys', missingKey);
      expect(s2.status).toBe(400);
      expect(errorResponseSchema.parse(s2.body).error.message).toContain('key is required');

      const valid = { platform: 'groq', key: 'gsk_contract_key_ten', label: 'Contract v10' };
      expect(addApiKeySchema.safeParse(valid).success).toBe(true);
      const s3 = await req(app, 'POST', '/api/keys', valid);
      expect(s3.status).toBe(201);
    });

    it('add key proxyUrl: same accept/reject rules on both sides', async () => {
      const bad = { platform: 'groq', key: 'gsk_x', proxyUrl: 'javascript://host' };
      const s1 = await req(app, 'POST', '/api/keys', bad);
      expect(s1.status).toBe(400);
      expect(errorResponseSchema.parse(s1.body).error.message).toContain('proxyUrl must be a valid proxy URL');
      expect(addApiKeySchema.safeParse(bad).success).toBe(false);

      // '' clears, and a dispatchable scheme on a real host passes — shared
      // side only here; the HTTP accept path lives in keys.test.ts.
      expect(addApiKeySchema.safeParse({ platform: 'groq', key: 'k', proxyUrl: '' }).success).toBe(true);
      expect(addApiKeySchema.safeParse({ platform: 'groq', key: 'k', proxyUrl: 'socks5://user:pass@host:1080' }).success).toBe(true);
    });

    it('PATCH /api/keys/:id: at-least-one rule, both sides', async () => {
      const empty = {};
      const s1 = await req(app, 'PATCH', '/api/keys/1', empty);
      expect(s1.status).toBe(400);
      expect(errorResponseSchema.parse(s1.body).error.message).toContain('At least one of enabled, label, modelScope, proxyUrl, key, monthlyRequestCap or monthlyTokenCap must be provided');
      expect(updateApiKeySchema.safeParse(empty).success).toBe(false);

      const ok = { label: 'Renamed by contract' };
      expect(updateApiKeySchema.safeParse(ok).success).toBe(true);
      const s2 = await req(app, 'PATCH', '/api/keys/1', ok);
      expect(s2.status).toBe(200);
    });

    it('setup/signup: email format and 8-char floor, both sides', async () => {
      // Unclaim the dashboard first: setup 409s while any user exists, which
      // would outrank body validation. Everything authenticated ran above.
      getDb().prepare('DELETE FROM sessions').run();
      getDb().prepare('DELETE FROM users').run();

      const badEmail = { email: 'not-an-email', password: 'longenough1' };
      const s1 = await req(app, 'POST', '/api/auth/setup', badEmail);
      expect(s1.status).toBe(400);
      expect(errorResponseSchema.parse(s1.body).error.message).toContain('A valid email is required');
      expect(signupInputSchema.safeParse(badEmail).success).toBe(false);

      const shortPw = { email: 'contract-ten@local.dev', password: 'short' };
      const s2 = await req(app, 'POST', '/api/auth/setup', shortPw);
      expect(s2.status).toBe(400);
      expect(errorResponseSchema.parse(s2.body).error.message).toContain('Password must be at least 8 characters');
      expect(signupInputSchema.safeParse(shortPw).success).toBe(false);

      // A valid body reaches the handler and claims the dashboard — this
      // sample runs LAST: setup can only complete once per database.
      const valid = { email: 'contract-ten@local.dev', password: 'longenough1' };
      expect(signupInputSchema.safeParse(valid).success).toBe(true);
      const s3 = await req(app, 'POST', '/api/auth/setup', valid);
      expect(s3.status).toBe(201);
    });
  });

});