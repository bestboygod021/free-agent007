// Shared Zod contracts for the dashboard API surface.
//
// These schemas are the single source of truth for response shapes shared by
// the server and the client. The server's contract test parses real HTTP
// responses with them (server/src/__tests__/integration/contract.test.ts), so
// a backend change that drops or renames a field fails CI instead of quietly
// breaking the dashboard. The client only ever imports the *inferred types*
// through shared/type-only re-exports, so no zod runtime code is bundled for
// the browser.
import { z } from 'zod';

/** How the global outbound proxy URL is interpreted. Per-key proxies always
 * use the traditional forward-proxy transport. */
export const proxyModeSchema = z.enum(['forward', 'fetch-relay']);

/** GET /api/settings/proxy — also the response envelope of PUT /proxy.
 * `fetchRelayTokenConfigured` reports presence only; the token itself is
 * write-only. `active` reflects live proxy state, not the stored config. */
export const proxySettingsSchema = z.object({
  proxyUrl: z.string(),
  proxyMode: proxyModeSchema,
  fetchRelayTokenConfigured: z.boolean(),
  enabled: z.boolean(),
  bypassPlatforms: z.array(z.string()),
  active: z.boolean(),
});

/** GET /api/analytics/summary — latency percentiles and TTFT are null when
 * the raw window is empty (pruned or never-seen traffic). */
export const analyticsSummarySchema = z.object({
  totalRequests: z.number(),
  successRate: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  avgLatencyMs: z.number(),
  p50LatencyMs: z.number().nullable(),
  p95LatencyMs: z.number().nullable(),
  avgTtfbMs: z.number().nullable(),
  requestTypeCounts: z.object({
    chat: z.number(),
    embedding: z.number(),
  }),
  estimatedCostSavings: z.number(),
  pinnedRequests: z.number(),
  pinHonoredRequests: z.number(),
  firstRequestAt: z.string().nullable(),
  lifetimeTotalRequests: z.number(),
});

/** GET /api/auth/status — the login/setup bootstrap payload. `email` is null
 * until a valid session token accompanies the request. */
export const authStatusSchema = z.object({
  needsSetup: z.boolean(),
  authenticated: z.boolean(),
  email: z.string().nullable(),
});

export type ProxyMode = z.infer<typeof proxyModeSchema>;
export type ProxySettings = z.infer<typeof proxySettingsSchema>;
export type AnalyticsSummary = z.infer<typeof analyticsSummarySchema>;
export type AuthStatus = z.infer<typeof authStatusSchema>;

// ── Settings surfaces ────────────────────────────────────────────────────────

/** GET /api/settings/api-key (and the POST /api-key/regenerate envelope —
 * same single field). */
export const apiKeyResponseSchema = z.object({
  apiKey: z.string(),
});

// ── Fusion defaults ──────────────────────────────────────────────────────────

export const fusionModeSchema = z.enum(['auto', 'explicit']);
export const fusionStrategySchema = z.enum(['synthesize', 'best_of']);

/** The saved default fusion config — mirror of the server's
 * savedFusionConfigSchema (server/src/services/fusion.ts). `k` is a positive
 * integer bounded by the response's maxK, validated there not here. */
export const savedFusionConfigSchema = z.object({
  mode: fusionModeSchema,
  models: z.array(z.string().min(1)),
  judge: z.string().min(1).nullable(),
  k: z.number().int().positive(),
  strategy: fusionStrategySchema,
  expose_panel: z.boolean(),
});

/** GET /api/settings/fusion. PUT /fusion takes the BARE config as its body
 * and answers with this same envelope. */
export const fusionConfigResponseSchema = z.object({
  config: savedFusionConfigSchema,
  maxK: z.number(),
});

// ── Fallback chain ───────────────────────────────────────────────────────────

/** One row of GET /api/fallback — the full raw chain entry. Several dashboard
 * views read disjoint subsets of this (FusionPage, Playground, the models
 * table), so the shape lives here once and they all consume it. The unify
 * grouping fields (groupKey/canonicalId/groupLabel) are sent only for grouped
 * models (#889 era unification), hence optional; everything else is always
 * present. */
export const fallbackEntrySchema = z.object({
  modelDbId: z.number(),
  groupKey: z.string().optional(),
  canonicalId: z.string().optional(),
  groupLabel: z.string().optional(),
  priority: z.number(),
  effectivePriority: z.number(),
  penalty: z.number(),
  rateLimitHits: z.number(),
  enabled: z.boolean(),
  platform: z.string(),
  modelId: z.string(),
  displayName: z.string(),
  intelligenceRank: z.number(),
  speedRank: z.number(),
  sizeLabel: z.string(),
  rpmLimit: z.number().nullable(),
  rpdLimit: z.number().nullable(),
  tpmLimit: z.number().nullable(),
  tpdLimit: z.number().nullable(),
  contextWindow: z.number().nullable(),
  monthlyTokenBudget: z.string(),
  monthlyTokenBudgetTokens: z.number(),
  supportsVision: z.boolean(),
  supportsTools: z.boolean(),
  source: z.enum(['catalog', 'custom']),
  keyId: z.number().nullable(),
  keyLabel: z.string().nullable(),
  endpointScope: z.string().nullable(),
  qualifiedModelId: z.string().nullable(),
  hasOverrides: z.boolean(),
  overrideFields: z.array(z.string()),
  retiredUpstream: z.boolean(),
  retiredReason: z.string().nullable(),
  keyCount: z.number(),
});

// ── Cache stats ──────────────────────────────────────────────────────────────

/** GET /api/cache/stats. Hits/lookup halves accumulate differently: totals
 * ride the entries currently held (restored from SQLite, shrink on eviction),
 * lookups count every process-lifetime probe. */
export const cacheStatsSchema = z.object({
  enabled: z.boolean(),
  ttlSeconds: z.number(),
  maxEntries: z.number(),
  maxTemperature: z.number(),
  entries: z.number(),
  totalHits: z.number(),
  estimatedRequestsSaved: z.number(),
  savedPromptTokens: z.number(),
  savedCompletionTokens: z.number(),
  lookupHits: z.number(),
  lookupMisses: z.number(),
  hitRate: z.number(),
  savedTokens: z.number(),
});

// ── Analytics rows ───────────────────────────────────────────────────────────

/** Row of GET /api/analytics/by-platform. `providerId` is the stable identity
 * (catalog: the platform slug; custom: `custom:<base_url>`) and `endpoint` the
 * operator-readable name (endpoint host for a relay) — both always strings,
 * both (#889) so several relays stay separately filterable/labelled. */
export const byPlatformRowSchema = z.object({
  platform: z.string(),
  providerId: z.string(),
  endpoint: z.string(),
  requests: z.number(),
  successRate: z.number(),
  avgLatencyMs: z.number(),
  p95LatencyMs: z.number().nullable(),
  avgTtfbMs: z.number().nullable(),
  errorCount: z.number(),
  avgTokensPerSecond: z.number().nullable(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
});

/** Row of GET /api/analytics/by-client (also what AgentsPage reads). Nulls
 * are coalesced server-side (`COALESCE(client_agent, 'unknown')`), and
 * `lastSeenAt` is the ISO MAX of the window. */
export const byClientRowSchema = z.object({
  clientAgent: z.string(),
  requests: z.number(),
  successRate: z.number(),
  avgLatencyMs: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  lastSeenAt: z.string().nullable(),
});

/** Row of GET /api/analytics/timeline (hour buckets from request_hourly). */
export const timelineBucketSchema = z.object({
  timestamp: z.string(),
  requests: z.number(),
  successCount: z.number(),
  failureCount: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
});

/** Row of GET /api/analytics/by-model. Same id/name pair /by-platform returns
 * for that endpoint; successRate is rounded to one decimal (and 0 when every
 * row in the group was canceled). */
export const byModelRowSchema = z.object({
  platform: z.string(),
  providerId: z.string(),
  endpoint: z.string(),
  modelId: z.string(),
  displayName: z.string(),
  requests: z.number(),
  successRate: z.number(),
  avgLatencyMs: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  pinnedRequests: z.number(),
  estimatedCost: z.number(),
});

/** Row of GET /api/analytics/by-key. label/platform are null when the key
 * row was deleted (LEFT JOIN); keyId is always a number. */
export const byKeyRowSchema = z.object({
  keyId: z.number(),
  label: z.string().nullable(),
  platform: z.string().nullable(),
  requests: z.number(),
  successRate: z.number(),
  avgLatencyMs: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
});

/** GET /api/analytics/error-distribution. `byPlatform` is endpoint-scoped
 * (#889): one entry per custom relay, not one pooled `custom` bucket. */
export const errorDistributionSchema = z.object({
  byCategory: z.array(z.object({ category: z.string(), count: z.number() })),
  byPlatform: z.array(
    z.object({
      platform: z.string(),
      providerId: z.string(),
      endpoint: z.string(),
      count: z.number(),
    })
  ),
  detailed: z.array(
    z.object({
      platform: z.string(),
      model_id: z.string(),
      error_category: z.string(),
      count: z.number(),
    })
  ),
});

/** Row of GET /api/analytics/errors — `endpoint` names which relay produced
 * the failure so a multi-relay operator doesn't have to guess (#889). */
export const recentErrorRowSchema = z.object({
  id: z.number(),
  platform: z.string(),
  providerId: z.string(),
  endpoint: z.string(),
  modelId: z.string(),
  error: z.string(),
  latencyMs: z.number(),
  createdAt: z.string(),
});

/** Row of GET /api/analytics/requests. keyLabel: since #785 custom endpoints
 * all share the `custom` platform id, so the user's key label ("Ollama box")
 * names the real provider — null when the key was deleted or unlabelled.
 * attemptCount is the failover-ladder length: attempts hang off the TERMINAL
 * row of a proxied request, so mid-ladder failure rows report 0. */
export const recentCallRowSchema = z.object({
  id: z.number(),
  platform: z.string(),
  modelId: z.string(),
  requestedModel: z.string().nullable(),
  requestType: z.string(),
  status: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  latencyMs: z.number(),
  error: z.string().nullable(),
  clientIp: z.string().nullable(),
  clientUserAgent: z.string().nullable(),
  clientAgent: z.string().nullable(),
  createdAt: z.string(),
  keyLabel: z.string().nullable(),
  attemptCount: z.number(),
});

/** GET /api/analytics/requests envelope. */
export const recentCallsResponseSchema = z.object({
  total: z.number(),
  rows: z.array(recentCallRowSchema),
});

/** One hop of the failover ladder, from GET /api/analytics/requests/:id.
 * keyLabel is the operator-facing key label captured at attempt time (#869);
 * errorSummary is the short redacted per-hop text (null for successful hops
 * and rows written before the error_summary migration). */
export const requestAttemptSchema = z.object({
  ordinal: z.number(),
  platform: z.string(),
  modelId: z.string(),
  keyOrdinal: z.number(),
  keyLabel: z.string().nullable(),
  outcome: z.string(),
  startOffsetMs: z.number(),
  durationMs: z.number(),
  errorSummary: z.string().nullable(),
});

/** GET /api/analytics/requests/:id — the terminal-row fields (no attemptCount
 * or keyLabel: those ride the LIST row) plus the served-model drift guard
 * (#534), the client agent, TTFB, and the per-attempt ladder. */
export const requestDetailSchema = recentCallRowSchema
  .omit({ attemptCount: true, keyLabel: true })
  .extend({
    servedModel: z.string().nullable(),
    ttfbMs: z.number().nullable(),
    attempts: z.array(requestAttemptSchema),
  });

// ── Inferred type surface (re-exported through shared/types.ts) ──────────────

export type ApiKeyResponse = z.infer<typeof apiKeyResponseSchema>;
export type FusionMode = z.infer<typeof fusionModeSchema>;
export type FusionStrategy = z.infer<typeof fusionStrategySchema>;
export type SavedFusionConfig = z.infer<typeof savedFusionConfigSchema>;
export type FusionConfigResponse = z.infer<typeof fusionConfigResponseSchema>;
export type FallbackEntry = z.infer<typeof fallbackEntrySchema>;
export type CacheStatsResponse = z.infer<typeof cacheStatsSchema>;
export type ByPlatformRow = z.infer<typeof byPlatformRowSchema>;
export type ByClientRow = z.infer<typeof byClientRowSchema>;
export type TimelineBucket = z.infer<typeof timelineBucketSchema>;
export type ByModelRow = z.infer<typeof byModelRowSchema>;
export type ByKeyRow = z.infer<typeof byKeyRowSchema>;
export type ErrorDistribution = z.infer<typeof errorDistributionSchema>;
export type RecentErrorRow = z.infer<typeof recentErrorRowSchema>;
export type RecentCallRow = z.infer<typeof recentCallRowSchema>;
export type RecentCallsResponse = z.infer<typeof recentCallsResponseSchema>;
export type RequestAttempt = z.infer<typeof requestAttemptSchema>;
export type RequestDetail = z.infer<typeof requestDetailSchema>;
