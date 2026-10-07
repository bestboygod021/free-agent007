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
import type { Platform } from './types';

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

// ── Embeddings management ────────────────────────────────────────────────────

/** One provider row of GET /api/embeddings. `isCustom` is always sent (true
 * for a custom embedding endpoint) — an older client interface marked it
 * optional and a second copy dropped it entirely. */
export const embeddingsProviderSchema = z.object({
  id: z.number(),
  platform: z.string(),
  modelId: z.string(),
  displayName: z.string(),
  priority: z.number(),
  enabled: z.boolean(),
  quotaLabel: z.string().nullable(),
  keyCount: z.number(),
  isCustom: z.boolean(),
});

/** One embedding family of GET /api/embeddings (failover routes across its
 * providers — same vector space). */
export const embeddingsFamilySchema = z.object({
  family: z.string(),
  dimensions: z.number(),
  maxInputTokens: z.number().nullable(),
  isDefault: z.boolean(),
  providers: z.array(embeddingsProviderSchema),
});

/** GET /api/embeddings envelope. */
export const embeddingsDataSchema = z.object({
  defaultFamily: z.string(),
  families: z.array(embeddingsFamilySchema),
});

/** GET /api/embeddings/usage. platform/quotaLabel describe the family's
 * highest-priority enabled provider (the legend row) and are always present,
 * null when no enabled provider is left; the two totals are always sent. */
export const embeddingsUsageSchema = z.object({
  families: z.array(
    z.object({
      family: z.string(),
      requestsToday: z.number(),
      tokensMonth: z.number(),
      platform: z.string().nullable(),
      quotaLabel: z.string().nullable(),
    })
  ),
  totalTokensMonth: z.number(),
  totalRequestsToday: z.number(),
});

// ── Agent kernel (ForgePilot page) ───────────────────────────────────────────

export const privacyLevelSchema = z.enum(['public', 'internal', 'private', 'confidential']);
export const providerClassSchema = z.enum(['local', 'cloud_free', 'cloud_paid']);

/** Per-task routing preference inside a mode profile — mirror of
 * agent/src/core/compute-mode.ts TaskRoutingRule. */
export const taskRoutingRuleSchema = z.object({
  taskType: z.string(),
  preferredLocality: z.enum(['local', 'cloud']),
  maxCost: z.number(),
  requiresToolCalling: z.boolean(),
  requiresStructuredOutput: z.boolean(),
  contextTokens: z.number(),
  maxLatencyMs: z.number(),
});

/** One resolved mode profile (GET /api/agent/modes[].profile) — mirror of
 * agent/src/core/compute-mode.ts ModeProfile. fallbackOrder/routing/
 * upgradeHintFa are server-owned lanes the dashboard does not render yet;
 * they are still pinned here so adding or dropping one is contract drift. */
export const agentModeProfileSchema = z.object({
  mode: z.enum(['free', 'paid', 'local']),
  labelFa: z.string(),
  summaryFa: z.string(),
  providerPolicy: z.object({
    allowLocal: z.boolean(),
    allowCloudFreeTier: z.boolean(),
    allowPaidCloud: z.boolean(),
    maxRelativeCost: z.number(),
    allowTrainOnInput: z.boolean(),
    maxCloudPrivacyLevel: privacyLevelSchema,
    requiresCloudConsent: z.boolean(),
    requiresByok: z.boolean(),
  }),
  fallbackOrder: z.array(providerClassSchema),
  routing: z.record(z.string(), taskRoutingRuleSchema),
  budget: z.object({
    perRunTokens: z.number(),
    perDayTokensPerUser: z.number(),
    hardStopTokens: z.number(),
    maxCostPerRun: z.number(),
  }),
  execution: z.object({
    maxRepairAttempts: z.number(),
    maxParallelTasks: z.number(),
    sandboxTimeoutSeconds: z.number(),
    qualityGates: z.array(z.string()),
    allowPreview: z.boolean(),
    allowBrowserAutomation: z.boolean(),
  }),
  disabledCapabilities: z.array(z.string()),
  warningsFa: z.array(z.string()),
  upgradeHintFa: z.string(),
});

/** GET /api/agent/modes envelope. */
export const agentModesResponseSchema = z.object({
  modes: z.array(
    z.object({
      mode: z.enum(['free', 'paid', 'local']),
      profile: agentModeProfileSchema,
      descriptionFa: z.string(),
    })
  ),
});

/** GET /api/agent/states initialContext — mirror of agent state-machine
 * RunContext. blockReason is set only when a transition was blocked. */
export const agentRunContextSchema = z.object({
  repairAttempts: z.number(),
  maxRepairAttempts: z.number(),
  planApproved: z.boolean(),
  deployApproved: z.boolean(),
  securityGatePassed: z.boolean(),
  verifyPassed: z.boolean(),
  blockReason: z.string().optional(),
});

/** GET /api/agent/states envelope — initialContext rides along even though
 * older client typings omitted it. */
export const agentStatesResponseSchema = z.object({
  states: z.array(z.string()),
  terminal: z.array(z.string()),
  initialState: z.string(),
  initialContext: agentRunContextSchema,
});

/** GET /api/agent/prompts envelope. meta is free-form front matter. */
export const agentPromptsResponseSchema = z.object({
  count: z.number(),
  prompts: z.array(
    z.object({
      file: z.string(),
      meta: z.record(z.unknown()),
    })
  ),
});

// ── Fusion SSE frame ─────────────────────────────────────────────────────────

/** One parsed frame of the fusion stream (server/src/routes/proxy.ts writes
 * `data: {json}` frames): an additive `_fusion` panel/judge event (no
 * `choices`, so standard OpenAI clients skip it), an `error` object, or an
 * OpenAI-shaped `choices` delta. Only the lanes the Playground parses are
 * modeled — base chunk fields (id/object/created/model, finish_reason, …) are
 * ignored on purpose. Exercised end-to-end by the SSE stream probe. */
export const fusionSseFrameSchema = z.object({
  _fusion: z
    .object({
      event: z.string().optional(),
      platform: z.string(),
      model: z.string(),
      status: z.enum(['ok', 'failed']).optional(),
      content: z.string().optional(),
      error: z.string().optional(),
    })
    .optional(),
  error: z.object({ message: z.string() }).optional(),
  choices: z
    .array(z.object({ delta: z.object({ content: z.string().optional() }).optional() }))
    .optional(),
});

export type EmbeddingsProviderEntry = z.infer<typeof embeddingsProviderSchema>;
export type EmbeddingsFamily = z.infer<typeof embeddingsFamilySchema>;
export type EmbeddingsData = z.infer<typeof embeddingsDataSchema>;
export type EmbeddingsUsage = z.infer<typeof embeddingsUsageSchema>;
export type AgentModeProfile = z.infer<typeof agentModeProfileSchema>;
export type AgentModesResponse = z.infer<typeof agentModesResponseSchema>;
export type AgentStatesResponse = z.infer<typeof agentStatesResponseSchema>;
export type AgentPromptsResponse = z.infer<typeof agentPromptsResponseSchema>;
export type FusionSseFrame = z.infer<typeof fusionSseFrameSchema>;

// ── Settings: compression ────────────────────────────────────────────────────

export const compressionModeSchema = z.enum(['off', 'lossless', 'standard', 'aggressive']);

/** Per-engine config block (GET /api/settings/compression). Every engine at
 *  least carries `enabled`; the remaining keys are engine-private tuning
 *  (minBlockChars, intensity, …) the dashboard reads opaquely, hence catchall. */
export const compressionEngineConfigSchema = z
  .object({ enabled: z.boolean() })
  .catchall(z.unknown());

/** GET/PUT /api/settings/compression — mirror of server CompressionConfig.
 *  autoTriggerEstTokens/targetTokens are omitted when unset (and historically
 *  typed as nullable by the client), so they are optional-and-nullable. */
export const compressionConfigSchema = z.object({
  mode: compressionModeSchema,
  engines: z.record(compressionEngineConfigSchema),
  autoTriggerEstTokens: z.number().nullable().optional(),
  targetTokens: z.number().nullable().optional(),
  trustProjectFilters: z.boolean(),
  prefixFreeze: z.boolean(),
});

/** GET /api/compression/stats — the config snapshot plus the process-lifetime
 *  counters. `byMode`/`engines` are server-owned breakdown records; the
 *  dialog only reads the headline numbers, so their innards stay opaque. */
export const compressionStatsSchema = z.object({
  config: compressionConfigSchema,
  requests: z.number(),
  compressedRequests: z.number(),
  originalChars: z.number(),
  compressedChars: z.number(),
  estSavedTokens: z.number(),
  savingsPercent: z.number(),
  avgDurationMs: z.number(),
  byMode: z.record(z.unknown()),
  engines: z.record(z.unknown()),
});

// ── Settings: update ─────────────────────────────────────────────────────────

export const updateInstallationSchema = z.enum(['source', 'docker', 'desktop', 'unknown']);
/** `idle` exists only on /status (nothing checked yet); /check never returns it. */
export const updateStatusValueSchema = z.enum([
  'idle', 'current', 'available', 'ahead', 'diverged', 'unknown', 'unsupported', 'disabled',
]);
export const updateCheckedStatusSchema = z.enum([
  'current', 'available', 'ahead', 'diverged', 'unknown', 'unsupported', 'disabled',
]);

/** GET /api/update/status (UpdateStatusInfo). */
export const updateStatusSchema = z.object({
  status: updateStatusValueSchema,
  installation: updateInstallationSchema,
  localSha: z.string().nullable(),
  lastChecked: z.string().nullable(),
  version: z.string().nullable(),
});

/** GET /api/update/check (CheckResult) — remote* lanes appear only after a
 *  successful upstream comparison. */
export const updateCheckSchema = z.object({
  status: updateCheckedStatusSchema,
  installation: updateInstallationSchema,
  localSha: z.string().nullable(),
  checkedAt: z.string(),
  version: z.string().nullable(),
  remoteSha: z.string().optional(),
  remoteMessage: z.string().optional(),
  remoteDate: z.string().optional(),
  changes: z
    .array(z.object({ sha: z.string(), message: z.string(), date: z.string().optional() }))
    .optional(),
});

/** GET /api/update/release — the mapped release, or the opt-out envelope. */
export const latestReleaseSchema = z.object({
  tagName: z.string(),
  body: z.string().nullable(),
  htmlUrl: z.string(),
  publishedAt: z.string().nullable(),
});
export const updateReleaseSchema = z.union([
  latestReleaseSchema,
  z.object({ disabled: z.literal(true) }),
]);

// ── Penalty inspector ────────────────────────────────────────────────────────

export const inspectorReasonSchema = z.enum(['penalty', 'cooldown', 'recent_errors']);

/** Row of GET /api/fallback/penalty-inspector — mirror of the server's
 *  InspectorRow (services/penalty-inspector.ts). */
export const penaltyInspectorRowSchema = z.object({
  modelDbId: z.number().nullable(),
  platform: z.string(),
  modelId: z.string(),
  displayName: z.string(),
  enabled: z.boolean(),
  fallbackEnabled: z.boolean(),
  priority: z.number().nullable(),
  penalty: z.object({
    hits: z.number(),
    value: z.number(),
    rateLimitFactor: z.number(),
  }),
  cooldowns: z.array(
    z.object({
      keyId: z.number(),
      keyLabel: z.string().nullable(),
      keyStatus: z.string().nullable(),
      expiresAtMs: z.number(),
      expiresInMs: z.number(),
    })
  ),
  recentErrors: z.array(
    z.object({
      id: z.number(),
      keyId: z.number().nullable(),
      keyLabel: z.string().nullable(),
      error: z.string(),
      latencyMs: z.number(),
      createdAt: z.string(),
    })
  ),
  recentErrorCount: z.number(),
  reasons: z.array(inspectorReasonSchema),
});

/** GET /api/fallback/penalty-inspector envelope. */
export const penaltyInspectorSchema = z.object({
  generatedAtMs: z.number(),
  lookbackMinutes: z.number(),
  rows: z.array(penaltyInspectorRowSchema),
});

// ── Media management ─────────────────────────────────────────────────────────

export const mediaModalitySchema = z.enum(['image', 'video', 'audio', 'transcription']);

/** Row of GET /api/media — quotaLabel is NOT NULL in media_models. */
export const mediaModelSchema = z.object({
  id: z.number(),
  platform: z.string(),
  modelId: z.string(),
  displayName: z.string(),
  modality: mediaModalitySchema,
  enabled: z.boolean(),
  quotaLabel: z.string(),
  keyCount: z.number(),
  isCustom: z.boolean(),
});

/** GET /api/media envelope. */
export const mediaDataSchema = z.object({
  models: z.array(mediaModelSchema),
});

/** GET /api/media/usage?modality=… — per-model request counts (media is
 *  metered per request, never per token), with the family's quota label. */
export const mediaUsageSchema = z.object({
  modality: mediaModalitySchema,
  models: z.array(
    z.object({
      id: z.number(),
      platform: z.string(),
      modelId: z.string(),
      displayName: z.string(),
      quotaLabel: z.string().nullable(),
      requestsToday: z.number(),
      requestsMonth: z.number(),
    })
  ),
  totalRequestsToday: z.number(),
  totalRequestsMonth: z.number(),
});

// ── Custom endpoint discovery ────────────────────────────────────────────────

export const discoveredModelKindSchema = z.enum([
  'embedding', 'image', 'audio', 'transcription', 'video',
]);

/** Row of POST /api/keys/custom/discover-models — the upstream model plus the
 *  route's `registered` verdict (models already bound to THIS endpoint). The
 *  optional lanes exist only when the upstream advertises them (#685/#1051). */
export const discoveredModelSchema = z.object({
  id: z.string(),
  ownedBy: z.string().nullable(),
  registered: z.boolean(),
  contextWindow: z.number().optional(),
  priceNote: z.string().optional(),
  isFree: z.boolean().optional(),
  vision: z.boolean().optional(),
  kind: discoveredModelKindSchema.optional(),
});

/** Discovery envelope: which endpoint was probed plus what came back. */
export const discoverResponseSchema = z.object({
  baseUrl: z.string(),
  keyId: z.number().nullable(),
  models: z.array(discoveredModelSchema),
  total: z.number(),
  registeredCount: z.number(),
});

export type CompressionMode = z.infer<typeof compressionModeSchema>;
export type CompressionEngineConfig = z.infer<typeof compressionEngineConfigSchema>;
export type CompressionConfig = z.infer<typeof compressionConfigSchema>;
export type CompressionStats = z.infer<typeof compressionStatsSchema>;
export type Installation = z.infer<typeof updateInstallationSchema>;
export type UpdateStatus = z.infer<typeof updateStatusValueSchema>;
export type CheckedUpdateStatus = z.infer<typeof updateCheckedStatusSchema>;
export type UpdateStatusInfo = z.infer<typeof updateStatusSchema>;
export type UpdateCheckInfo = z.infer<typeof updateCheckSchema>;
export type LatestRelease = z.infer<typeof latestReleaseSchema>;
export type UpdateRelease = z.infer<typeof updateReleaseSchema>;
export type InspectorReason = z.infer<typeof inspectorReasonSchema>;
export type PenaltyInspectorRow = z.infer<typeof penaltyInspectorRowSchema>;
export type PenaltyInspectorData = z.infer<typeof penaltyInspectorSchema>;
export type MediaModality = z.infer<typeof mediaModalitySchema>;
export type MediaModel = z.infer<typeof mediaModelSchema>;
export type MediaData = z.infer<typeof mediaDataSchema>;
export type MediaUsage = z.infer<typeof mediaUsageSchema>;
export type DiscoveredModel = z.infer<typeof discoveredModelSchema>;
export type DiscoverResponse = z.infer<typeof discoverResponseSchema>;

// ─── Logs viewer: one row as served by GET /api/logs, ring-wide counts, envelope ───
export const logLevelSchema = z.enum(['trace', 'debug', 'info', 'warn', 'error']);

/** One row as served by GET /api/logs. The optional lanes are omitted entirely when unset. */
export const logEntrySchema = z.object({
  id: z.number(),
  /** ISO-8601 timestamp. */
  ts: z.string(),
  level: logLevelSchema,
  source: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  event: z.string().optional(),
  requestId: z.string().optional(),
  message: z.string(),
});

/** Ring-wide totals per level — NOT filtered by the current query. */
export const logCountsSchema = z.object({
  debug: z.number(),
  info: z.number(),
  warn: z.number(),
  error: z.number(),
});

export const logsResponseSchema = z.object({
  entries: z.array(logEntrySchema),
  /** Highest id the ring holds — the cursor for the next poll, even when empty. */
  nextId: z.number(),
  counts: logCountsSchema,
});

// ─── Premium status (license + catalog sync), GET /api/premium ───
export const licenseStatusSchema = z.object({
  valid: z.boolean(),
  plan: z.enum(['annual', 'lifetime']).nullable(),
  status: z.string().nullable(),
  expiresAt: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean().optional(),
  reason: z.string().optional(),
  checkedAtMs: z.number(),
});

export const catalogSyncStateSchema = z.object({
  baseUrl: z.string(),
  appliedVersion: z.string().nullable(),
  appliedTier: z.string().nullable(),
  lastSyncMs: z.number().nullable(),
  lastError: z.string().nullable(),
});

export const premiumStatusSchema = z.object({
  hasKey: z.boolean(),
  maskedKey: z.string().nullable(),
  license: licenseStatusSchema.nullable(),
  catalog: catalogSyncStateSchema,
  siteUrl: z.string(),
});

// ─── Key health, GET /api/health ───
/** A per-key quota window the gateway is currently tracking. */
export const providerQuotaStateSchema = z.object({
  platform: z.custom<Platform>(v => typeof v === 'string'),
  keyId: z.number(),
  /** The key's operator-facing label, when the row still names a live key. */
  keyLabel: z.string().nullable().optional(),
  quotaPoolKey: z.string(),
  metric: z.enum(['requests', 'tokens', 'credits', 'neurons']),
  limit: z.number().nullable(),
  remaining: z.number().nullable(),
  resetAt: z.string().nullable(),
  resetStrategy: z.enum(['fixed_calendar', 'rolling_window', 'token_bucket', 'provider_reported', 'unknown']),
  source: z.enum(['header', 'quota_api', 'error_body', 'local_usage', 'documentation', 'probe']),
  confidence: z.number(),
  notes: z.string().nullable(),
  observedAt: z.string(),
  updatedAt: z.string(),
});

export const healthPlatformSchema = z.object({
  platform: z.string(),
  hasProvider: z.boolean(),
  totalKeys: z.number(),
  healthyKeys: z.number(),
  rateLimitedKeys: z.number(),
  invalidKeys: z.number(),
  errorKeys: z.number(),
  unknownKeys: z.number(),
  enabledKeys: z.number(),
});

export const healthKeyRowSchema = z.object({
  id: z.number(),
  platform: z.string(),
  label: z.string(),
  status: z.string(),
  enabled: z.boolean(),
  /** api_keys.created_at — SQLite datetime('now') TEXT. */
  createdAt: z.string(),
  lastCheckedAt: z.string().nullable(),
  lastHealthError: z.string().nullable(),
});

/** Degraded-routing machine state: ms-since-epoch entry time, null while normal. */
export const degradationStatusSchema = z.object({
  healthyProviders: z.number(),
  totalProviders: z.number(),
  ratio: z.number(),
  state: z.enum(['normal', 'degraded']),
  degradedAt: z.number().nullable(),
});

export const healthDataSchema = z.object({
  platforms: z.array(healthPlatformSchema),
  keys: z.array(healthKeyRowSchema),
  quotaStates: z.array(providerQuotaStateSchema),
  degradation: degradationStatusSchema,
});

// ─── Backups ───
export const backupMetaSchema = z.object({
  id: z.number(),
  filename: z.string(),
  filesize: z.number(),
  isFull: z.boolean(),
  source: z.enum(['manual', 'scheduled', 'pre-restore']),
  createdAt: z.string(),
  tables: z.array(z.string()),
});

export const backupScheduleSchema = z.object({
  enabled: z.boolean(),
  time: z.string(),
  intervalDays: z.number(),
  backupPath: z.string(),
});

export const backupListSchema = z.object({
  items: z.array(backupMetaSchema),
  total: z.number(),
});

export const backupScheduleResponseSchema = z.object({ schedule: backupScheduleSchema });
export const backupCreateResponseSchema = z.object({ backup: backupMetaSchema });
export const backupTablesResponseSchema = z.object({ tables: z.array(z.string()) });

// ─── Chains (profiles), GET /api/profiles ───
export const chainSchema = z.object({
  id: z.number(),
  name: z.string(),
  emoji: z.string(),
  color: z.string(),
  type: z.enum(['default', 'builtin', 'custom']),
  is_favorite: z.number(),
  sort_order: z.number(),
  auto_sort: z.string().nullable(),
  layout_config: z.string().nullable(),
  auto_include_new_models: z.number(),
  created_at: z.string(),
});

// ─── Fallback routing, GET /api/fallback/routing ───
export const routingStrategySchema = z.enum(['priority', 'balanced', 'smartest', 'fastest', 'reliable', 'custom']);
export const keySelectionStrategySchema = z.enum(['auto', 'least-remaining']);
export const routingWeightsSchema = z.object({
  reliability: z.number(),
  speed: z.number(),
  intelligence: z.number(),
});

export const routingScoreSchema = z.object({
  modelDbId: z.number(),
  reliability: z.number(),
  speed: z.number(),
  intelligence: z.number(),
  headroom: z.number(),
  rateLimit: z.number(),
  score: z.number(),
  totalRequests: z.number(),
});

/** The scores lane carries the model's identity alongside its bandit numbers. */
export const routingScoreRowSchema = routingScoreSchema.extend({
  platform: z.string(),
  modelId: z.string(),
  displayName: z.string(),
  enabled: z.boolean(),
});

export const routingDataSchema = z.object({
  strategy: routingStrategySchema,
  /** The stored preset weights; null before the first custom save. */
  weights: routingWeightsSchema.nullable(),
  customWeights: routingWeightsSchema,
  /** Exploration toggle (#685): unmeasured models get a guaranteed chance. */
  exploreEnabled: z.boolean(),
  /** Peak-hours adjustment (#760): opt-in, off by default. */
  peakHoursAdjust: z.boolean(),
  peakStartHour: z.number(),
  peakEndHour: z.number(),
  /** IANA timezone the peak window is read in (default 'UTC'). */
  peakTimezone: z.string(),
  /** Whether `weights` is the raw preset or a peak-hours variant. */
  peakAdjusted: z.boolean(),
  /** Key-selection policy (#919). */
  keySelectionStrategy: keySelectionStrategySchema,
  /** Ceiling on the router's cooldown guesses in ms (#952); null = no cap. */
  cooldownCeilingMs: z.number().nullable(),
  scores: z.array(routingScoreRowSchema),
});

// ─── Monthly budget bar, GET /api/fallback/token-usage ───
export const tokenUsageModelSchema = z.object({
  modelDbId: z.number(),
  displayName: z.string(),
  platform: z.string(),
  modelId: z.string(),
  intelligenceRank: z.number(),
  budget: z.number(),
  used: z.number(),
  enabled: z.boolean(),
  rpmLimit: z.number().nullable(),
  rpdLimit: z.number().nullable(),
  tpmLimit: z.number().nullable(),
  tpdLimit: z.number().nullable(),
});

export const tokenUsageDataSchema = z.object({
  totalBudget: z.number(),
  totalUsed: z.number(),
  models: z.array(tokenUsageModelSchema),
});

// ─── Rate-limit pressure, GET /api/fallback/rate-limit-usage ───
export const rateLimitWindowSchema = z.object({ used: z.number(), limit: z.number() });

export const rateLimitUsageRowSchema = z.object({
  modelDbId: z.number(),
  platform: z.string(),
  modelId: z.string(),
  rpm: rateLimitWindowSchema.nullable(),
  rpd: rateLimitWindowSchema.nullable(),
  tpm: rateLimitWindowSchema.nullable(),
});

export const rateLimitUsageDataSchema = z.object({
  generatedAtMs: z.number(),
  rows: z.array(rateLimitUsageRowSchema),
});

// ─── Playground conversations, GET/POST /api/conversations ───
export const fusionPanelEntrySchema = z.object({
  platform: z.string(),
  model: z.string(),
  status: z.enum(['ok', 'failed']).optional(),
  content: z.string().optional(),
  error: z.string().optional(),
});

export const playgroundChatMetaSchema = z.object({
  platform: z.string().optional(),
  model: z.string().optional(),
  latency: z.number().optional(),
  fallbackAttempts: z.number().optional(),
  /** Fusion trace: panel answers and the synthesizing judge (null = single survivor). */
  fusionPanel: z.array(fusionPanelEntrySchema).optional(),
  fusionJudge: z.object({ platform: z.string(), model: z.string() }).nullable().optional(),
  fusionStreaming: z.boolean().optional(),
});

/** One transcript bubble, persisted verbatim (minus `streaming`). */
export const playgroundChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  images: z.array(z.string()).optional(),
  isError: z.boolean().optional(),
  reasoning: z.string().optional(),
  streaming: z.boolean().optional(),
  meta: playgroundChatMetaSchema.optional(),
});

/** Sidebar row: enough to list a conversation, never its transcript. */
export const conversationSummarySchema = z.object({
  id: z.number(),
  title: z.string(),
  model: z.string().nullable(),
  messageCount: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

/** A conversation with its transcript, as returned by GET /api/conversations/:id. */
export const conversationDetailSchema = z.object({
  id: z.number(),
  title: z.string(),
  messages: z.array(playgroundChatMessageSchema),
  model: z.string().nullable(),
  systemPrompt: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type LogLevel = z.infer<typeof logLevelSchema>;
export type LogEntry = z.infer<typeof logEntrySchema>;
export type LogCounts = z.infer<typeof logCountsSchema>;
export type LogsResponse = z.infer<typeof logsResponseSchema>;
export type LicenseStatus = z.infer<typeof licenseStatusSchema>;
export type CatalogSyncState = z.infer<typeof catalogSyncStateSchema>;
export type PremiumStatus = z.infer<typeof premiumStatusSchema>;
export type ProviderQuotaState = z.infer<typeof providerQuotaStateSchema>;
export type HealthPlatform = z.infer<typeof healthPlatformSchema>;
export type HealthKeyRow = z.infer<typeof healthKeyRowSchema>;
export type DegradationStatus = z.infer<typeof degradationStatusSchema>;
export type HealthData = z.infer<typeof healthDataSchema>;
export type BackupMeta = z.infer<typeof backupMetaSchema>;
export type BackupSchedule = z.infer<typeof backupScheduleSchema>;
export type BackupListResponse = z.infer<typeof backupListSchema>;
export type BackupScheduleResponse = z.infer<typeof backupScheduleResponseSchema>;
export type BackupCreateResponse = z.infer<typeof backupCreateResponseSchema>;
export type BackupTablesResponse = z.infer<typeof backupTablesResponseSchema>;
export type Chain = z.infer<typeof chainSchema>;
export type RoutingStrategy = z.infer<typeof routingStrategySchema>;
export type KeySelectionStrategy = z.infer<typeof keySelectionStrategySchema>;
export type RoutingWeights = z.infer<typeof routingWeightsSchema>;
export type RoutingScore = z.infer<typeof routingScoreSchema>;
export type RoutingScoreRow = z.infer<typeof routingScoreRowSchema>;
export type RoutingData = z.infer<typeof routingDataSchema>;
export type TokenUsageModel = z.infer<typeof tokenUsageModelSchema>;
export type TokenUsageData = z.infer<typeof tokenUsageDataSchema>;
export type RateLimitWindow = z.infer<typeof rateLimitWindowSchema>;
export type RateLimitUsageRow = z.infer<typeof rateLimitUsageRowSchema>;
export type RateLimitUsageData = z.infer<typeof rateLimitUsageDataSchema>;
export type PlaygroundChatMessage = z.infer<typeof playgroundChatMessageSchema>;
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

// ─── Error envelopes ───
/** The nested error body every dashboard/OAI-shaped surface emits: route 4xx,
 *  the global errorHandler (500/413), the 429 limiter, and requireAuth. */
export const errorResponseSchema = z.object({
  error: z.object({
    message: z.string(),
    /** Machine-readable class, e.g. 'authentication_error', 'rate_limit_error',
     *  'invalid_request_error', 'route_not_found'. Absent on plain 4xx. */
    type: z.string().optional(),
    /** Narrower sub-code where a handler has one (e.g. 'request_too_large'). */
    code: z.string().optional(),
  }),
});

/** Native Ollama-protocol errors from the emulation surface: that protocol
 *  uses a plain string, deliberately NOT the nested OpenAI shape. */
export const ollamaNativeErrorSchema = z.object({ error: z.string() });

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type OllamaNativeError = z.infer<typeof ollamaNativeErrorSchema>;

// ─── Input bodies & query strings ───
// The canonical shapes CLIENTS send. The server's route-level validators are
// kept in their route modules (this package is imported type-only at runtime),
// and the contract tests parse the same samples with BOTH — a drift between
// the two fails CI instead of silently changing what a400 means.

/** Profile names: short, URL/filename-safe, and never one of the built-in
 *  presets the router treats as magic words. */
const RESERVED_PROFILE_NAMES = [
  'auto', 'smart', 'fast', 'cheap', 'budget',
  'intelligence', 'speed', 'active', 'default',
];

export const profileNameSchema = z
  .string()
  .min(1, 'Profile name cannot be empty')
  .max(20, 'Profile name must not exceed 20 characters')
  .regex(/^[a-zA-Z0-9-_]+$/, 'Only Latin letters, digits, hyphens (-) and underscores (_) are allowed')
  .refine(
    (name) => !RESERVED_PROFILE_NAMES.includes(name.toLowerCase()),
    'This name is reserved by the system',
  );

/** PUT /api/profiles/:id body. Booleans cross the wire as booleans; the route
 *  converts is_favorite/auto_include_new_models to 0/1 on the way into SQLite. */
export const profileUpdateSchema = z.object({
  name: profileNameSchema.optional(),
  emoji: z.string().max(4).optional(),
  color: z.string().optional(),
  is_favorite: z.boolean().optional(),
  sort_order: z.number().optional(),
  auto_sort: z.enum(['intelligence', 'speed', 'budget']).nullable().optional(),
  layout_config: z.string().nullable().optional(),
  auto_include_new_models: z.boolean().optional(),
});

/** A stored transcript bubble: the client's ChatMessage minus the in-flight
 *  lanes (`streaming`, `meta.fusionStreaming`) that must never persist — a
 *  saved message is finished by definition. */
export const conversationStoredMessageSchema = playgroundChatMessageSchema
  .omit({ streaming: true })
  .extend({ meta: playgroundChatMetaSchema.omit({ fusionStreaming: true }).optional() });

export const conversationTitleSchema = z.string().max(200);
export const conversationModelIdSchema = z.string().max(200).nullable();
export const conversationSystemPromptSchema = z.string().max(32_000).nullable();

/** PUT /api/conversations/:id body — strict: an unknown lane is a client bug
 *  (the PATCH mirror is ConversationPatch in the Playground helpers). */
export const conversationPatchSchema = z
  .object({
    title: conversationTitleSchema.optional(),
    messages: z.array(conversationStoredMessageSchema).optional(),
    model: conversationModelIdSchema.optional(),
    systemPrompt: conversationSystemPromptSchema.optional(),
  })
  .strict();

// ─── GET /api/logs query string ───
const firstQueryParam = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : Array.isArray(value) && typeof value[0] === 'string' ? value[0] : undefined;

const nonEmptyQueryParam = (value: unknown): string | undefined => {
  const s = firstQueryParam(value);
  return s !== undefined && s.trim() !== '' ? s : undefined;
};

/** Repeated params take the first value. Unknown levels and bad cursors are
 *  hard errors (silently dropping one would show a filtered view that does not
 *  match the filter asked for); `limit` stays a preference — non-numbers fall
 *  through to the store's default clamp. The 400 messages are part of the
 *  contract: tests assert both this schema and the route emit them. */
export const logQuerySchema = z.object({
  levels: z.preprocess(
    nonEmptyQueryParam,
    z
      .string()
      .superRefine((value, ctx) => {
        const unknown = value
          .split(',')
          .map(part => part.trim())
          .filter(part => part !== '')
          .find(part => !(logLevelSchema.options as readonly string[]).includes(part));
        if (unknown !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unknown log level '${unknown}'. Known levels: ${logLevelSchema.options.join(', ')}`,
          });
        }
      })
      .transform(value => value.split(',').map(part => part.trim()).filter(part => part !== ''))
      .optional(),
  ),
  sinceId: z.preprocess(
    nonEmptyQueryParam,
    z
      .string()
      .transform(value => Number(value))
      .refine(number => Number.isInteger(number) && number >= 0, {
        message: 'sinceId must be a non-negative integer',
      })
      .optional(),
  ),
  limit: z.preprocess(nonEmptyQueryParam, z.string().transform(value => Number(value)).optional()),
  q: z.preprocess(firstQueryParam, z.string().optional()),
  provider: z.preprocess(firstQueryParam, z.string().optional()),
});

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
export type ConversationPatch = z.infer<typeof conversationPatchSchema>;
export type LogQueryParams = z.infer<typeof logQuerySchema>;


// ═════════════════════ Auth bodies (POST /api/auth/setup|login) ═════════════════════
// The password floor every auth form shares (setup/change/reset on the server
// repeat the literal 8 — the server keeps its own copy of these schemas; the
// dual-sample contract tests pin the two together).
export const PASSWORD_MIN_LENGTH = 8;

// Registration validates a real address and the floor above. Messages are the
// contract — the dual-sample tests below pin them on both sides.
export const signupInputSchema = z.object({
  email: z.string().email('A valid email is required'),
  password: z.string().min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`),
});

// Login is a LOOKUP, not a registration: the address is matched rather than
// format-validated (the seeded desktop@localhost account must keep signing in —
// #807), so only presence is enforced here. Format checks would reject accounts
// that predate them.
export const loginInputSchema = z.object({
  email: z.string().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
});

// ═════════════════════ API-key bodies (POST /api/keys, PATCH /api/keys/:id) ═════════════════════
// The platform enum mirrors routes/keys.ts PLATFORMS exactly — a contract test
// asserts the two lists are identical, so a new platform cannot land on one
// side only.
export const apiKeyPlatformSchema = z.enum([
  'google', 'groq', 'cerebras', 'sail', 'electronhub', 'experiential', 'router9', 'septor', 'clod', 'speechify', 'blaze', 'lucidity', 'airforce', 'dreamprompting', 'waterfall', 'logfare', 'bai', 'radeon', 'nvidia', 'mistral',
  'openrouter', 'github', 'cohere', 'cloudflare', 'zhipu', 'ollama',
  'kilo', 'pollinations', 'llm7', 'huggingface', 'opencode', 'ovh', 'agnes', 'reka', 'siliconflow',
  'routeway', 'bazaarlink', 'ainative', 'aion', 'anyapi', 'requesty', 'navy', 'nara', 'sealion', 'orcarouter', 'unorouter', 'xkiro', 'modelscope',
  'qianfan', 'volcengine', 'longcat', 'xfyun', 'aihorde', 'custom',
]);

const KEY_PROXY_SCHEMES = ['http:', 'https:', 'socks4:', 'socks4a:', 'socks5:', 'socks5h:'];
// Mirrors lib/key-proxy.ts (message, cap, and accept/reject rules) — '' clears
// the override, otherwise a dispatchable scheme on a real host.
export const keyProxyUrlSchema = z
  .string()
  .max(2048)
  .refine(url => {
    const trimmed = url.trim();
    if (!trimmed) return true;
    if (trimmed.length > 2048) return false;
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return false;
    }
    if (!KEY_PROXY_SCHEMES.includes(parsed.protocol)) return false;
    return parsed.hostname !== '';
  }, {
    message: "proxyUrl must be a valid proxy URL using http, https, socks4, socks4a, socks5 or socks5h (e.g. socks5://user:pass@host:1080), or '' to clear it",
  });

// `key` stays optional so keyless providers (Kilo's anonymous gateway) can be
// added without one; a non-keyless platform with no key is rejected by the
// handler, not the schema — that split is pinned by the dual-sample tests.
export const addApiKeySchema = z.object({
  platform: apiKeyPlatformSchema,
  key: z.string().optional(),
  label: z.string().optional(),
  proxyUrl: keyProxyUrlSchema.optional(),
});

export const updateApiKeySchema = z.object({
  enabled: z.boolean().optional(),
  label: z.string().optional(),
  modelScope: z.array(z.string().trim().min(1).max(200)).max(100).nullable().optional(),
  proxyUrl: keyProxyUrlSchema.optional(),
  monthlyRequestCap: z.number().int().min(0).max(1_000_000_000).optional(),
  monthlyTokenCap: z.number().int().min(0).max(1_000_000_000_000).optional(),
  key: z.string().trim().min(1).optional(),
}).refine(data => data.enabled !== undefined || data.label !== undefined || data.modelScope !== undefined || data.proxyUrl !== undefined || data.key !== undefined || data.monthlyRequestCap !== undefined || data.monthlyTokenCap !== undefined, {
  message: 'At least one of enabled, label, modelScope, proxyUrl, key, monthlyRequestCap or monthlyTokenCap must be provided',
});

export type SignupInput = z.infer<typeof signupInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type AddApiKeyInput = z.infer<typeof addApiKeySchema>;
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;

// ═════════════════════ Import body (POST /api/keys/import-selected) ═════════════════════
// Mirrors routes/keys.ts: the route wraps `importKeySchema` in a max-100 array.
// `keyValue` is a presence floor only — the endpoint deals in already-decided
// credentials, not in shaping them.
export const importApiKeySchema = z.object({
  keyName: z.string().optional(),
  keyValue: z.string().min(1),
  platform: apiKeyPlatformSchema,
  baseUrl: z.string().optional(),
  models: z.array(z.object({
    id: z.string().min(1),
    supportsTools: z.boolean().optional(),
    supportsVision: z.boolean().optional(),
  })).max(200).optional(),
});

export const importKeysRequestSchema = z.object({
  keys: z.array(importApiKeySchema).max(100),
});

// ═════════════════════ Credential bodies (change/reset password, change email) ═════════════════════
export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`),
});

export const changeEmailInputSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newEmail: z.string().email('A valid email is required'),
});

export const resetPasswordInputSchema = z.object({
  resetCode: z.string().min(1, 'Reset code is required'),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`),
});

export type ImportApiKeyInput = z.infer<typeof importApiKeySchema>;
export type ImportKeysRequest = z.infer<typeof importKeysRequestSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailInputSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

// ── Dashboard input contracts (request bodies) ─────────────────────────────────
// The single source of truth for what the server ACCEPTS, mirroring the
// response contracts above. Server routes import these instead of keeping
// private copies; helpers that validation depends on (isValidTimezone,
// cooldown ceilings) live here too so the bounds can never drift from the
// schema that enforces them.
export function isValidTimezone(timezone: unknown): timezone is string {
  if (typeof timezone !== 'string' || !timezone.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}


export const MIN_COOLDOWN_CEILING_MS = 60000;


export const MAX_COOLDOWN_CEILING_MS = 86400000;


export const unifyOverridesSchema = z.object({
  // Coalesce several grouping tokens into one group keyed by `into`. Each key is
  // a normalized display-name OR an exact "platform:model_id" member id.
  merges: z.array(z.object({
    into: z.string().min(1),
    keys: z.array(z.string().min(1)).min(1),
  })).default([]),
  // Force a specific "platform:model_id" row out of its computed group into a
  // singleton (or into an explicit groupKey).
  splits: z.array(z.object({
    member: z.string().min(1),
    groupKey: z.string().optional(),
  })).default([]),
}).default({ merges: [], splits: [] });


// ── Backups ──  POST /api/backups · PUT /api/backups/schedule

export const backupCreateSchema = z.object({
  tables: z.array(z.string().trim().min(1).max(200)).max(500).optional(),
}).strict();

export const backupScheduleInputSchema = z.object({
  enabled: z.boolean(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be HH:mm'),
  intervalDays: z.number().int().min(1).max(365),
  backupPath: z.string().max(2000),
}).strict();


// ── Client profiles ──  POST /api/client-profiles · PUT /api/client-profiles/:id

export const clientProfileCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  systemPrompt: z.string().max(32_000).nullish(),
});

export const clientProfileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  // null clears the prompt (the profile key then authenticates without
  // injecting anything); absent leaves it untouched.
  systemPrompt: z.string().max(32_000).nullable().optional(),
  enabled: z.boolean().optional(),
});


// ── Embeddings management ──  POST /api/embeddings/custom · PUT /api/embeddings

export const customEmbeddingSchema = z.object({
  baseUrl: z.string().url('baseUrl must be a valid URL'),
  model: z.string().min(1),
  displayName: z.string().optional(),
  family: z.string().optional(),
  apiKey: z.string().optional(),
  label: z.string().optional(),
  quotaLabel: z.string().optional(),
  maxInputTokens: z.number().int().positive().optional(),
});

export const embeddingsUpdateSchema = z.object({
  defaultFamily: z.string().optional(),
  providers: z.array(z.object({
    id: z.number(),
    priority: z.number(),
    enabled: z.boolean(),
  })).optional(),
});


// ── Fallback chain ──  PUT /api/fallback/routing · PUT /api/fallback

export const routingSchema = z.object({
  strategy: z.enum(['priority', 'balanced', 'smartest', 'fastest', 'reliable', 'custom']),
  // Only meaningful with strategy 'custom': the user's weight vector. Any
  // non-negative vector is accepted; setCustomWeights renormalizes to sum 1.
  weights: z.object({
    reliability: z.number().nonnegative(),
    speed: z.number().nonnegative(),
    intelligence: z.number().nonnegative(),
  }).optional(),
  // Exploration toggle: give unmeasured models a guaranteed chance to be tried.
  exploreEnabled: z.boolean().optional(),
  // Peak-hours adjustment (#760), off by default. Hours are whole numbers in
  // 0-23 and are read in `peakTimezone`, never the server's local clock, so the
  // window means the same thing on a UTC container as on the operator's laptop.
  peakHoursAdjust: z.boolean().optional(),
  peakStartHour: z.number().int().min(0).max(23, { message: 'peakStartHour must be an integer between 0 and 23' }).optional(),
  peakEndHour: z.number().int().min(0).max(23, { message: 'peakEndHour must be an integer between 0 and 23' }).optional(),
  peakTimezone: z.string().refine(isValidTimezone, { message: 'peakTimezone must be a valid IANA timezone name' }).optional(),
  // How to pick between several keys of one platform (#919). Independent of
  // `strategy`, which ranks MODELS — the two are set from the same form, so
  // they round-trip through the same request.
  keySelectionStrategy: z.enum(['auto', 'least-remaining']).optional(),
  // Ceiling on automatic cooldowns (#952): 1 min .. 24 h in ms, null = no cap
  // (the escalation ladder keeps its 24h top step and 402/403 bench a day).
  cooldownCeilingMs: z.number().int()
    .min(MIN_COOLDOWN_CEILING_MS, { message: `cooldownCeilingMs must be at least ${MIN_COOLDOWN_CEILING_MS} (1 minute)` })
    .max(MAX_COOLDOWN_CEILING_MS, { message: `cooldownCeilingMs must be at most ${MAX_COOLDOWN_CEILING_MS} (24 hours)` })
    .nullable().optional(),
});

export const fallbackChainUpdateSchema = z.array(z.object({
  modelDbId: z.number(),
  priority: z.number(),
  enabled: z.boolean(),
}));


// ── Gemini passthrough ──  POST /gemini/models/*:generateContent

export const geminiPartSchema = z.object({}).passthrough();

export const geminiContentSchema = z.object({
  role: z.enum(['user', 'model']).optional(),
  parts: z.array(geminiPartSchema).optional(),
}).passthrough();

export const geminiGenerateSchema = z.object({
  contents: z.array(geminiContentSchema).min(1),
  systemInstruction: z.object({ parts: z.array(geminiPartSchema).optional() }).passthrough().optional(),
  tools: z.array(z.object({}).passthrough()).optional(),
  toolConfig: z.object({}).passthrough().optional(),
  generationConfig: z.object({}).passthrough().optional(),
}).passthrough();


// ── Media models ──  POST /api/media/custom · PUT /api/media/:id

export const customMediaSchema = z.object({
  baseUrl: z.string().url('baseUrl must be a valid URL'),
  model: z.string().min(1),
  displayName: z.string().optional(),
  // 'transcription' registers a custom OpenAI-compatible STT endpoint. The
  // media_models table, GET /api/media/usage, the /v1/audio/transcriptions
  // handler and the media service's 'custom' adapter all accept it.
  modality: z.enum(['image', 'audio', 'transcription']),
  apiKey: z.string().optional(),
  label: z.string().optional(),
  quotaLabel: z.string().optional(),
});

export const mediaUpdateSchema = z.object({ enabled: z.boolean() });


// ── Compression preview ──  POST /api/compression/preview

export const compressionPreviewMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.union([
    z.string(),
    z.null(),
    z.array(z.union([z.string(), z.record(z.string(), z.unknown())])),
  ]),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
  tool_calls: z.array(z.object({
    id: z.string(),
    type: z.literal('function'),
    function: z.object({ name: z.string(), arguments: z.string() }),
  }).passthrough()).optional(),
}).passthrough();


// ── Catalog models ──  POST /api/models · PUT /api/models/:id

export const modelUpdateSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  intelligenceRank: z.number().int().min(1).max(1000).optional(),
  speedRank: z.number().int().min(1).max(1000).optional(),
  // '' is a legal value: size_label is TEXT NOT NULL DEFAULT '' and the empty
  // string is the canonical "unscored" tier (scores 0 on the intelligence
  // axis), so the dashboard's "None" option must be able to send it.
  sizeLabel: z.string().max(40).optional(),
  rpmLimit: z.number().int().positive().nullable().optional(),
  rpdLimit: z.number().int().positive().nullable().optional(),
  tpmLimit: z.number().int().positive().nullable().optional(),
  tpdLimit: z.number().int().positive().nullable().optional(),
  monthlyTokenBudget: z.string().max(80).optional(),
  contextWindow: z.number().int().positive().nullable().optional(),
  enabled: z.boolean().optional(),
  supportsVision: z.boolean().optional(),
  supportsTools: z.boolean().optional(),
  fallbackEnabled: z.boolean().optional(),
}).strict();

export const createModelSchema = z.object({
  platform: z.string().min(1).max(50),
  modelId: z.string().min(1).max(200),
  displayName: z.string().min(1).max(200).optional(),
  contextWindow: z.number().int().positive().nullable().optional(),
  rpmLimit: z.number().int().positive().nullable().optional(),
  rpdLimit: z.number().int().positive().nullable().optional(),
  tpmLimit: z.number().int().positive().nullable().optional(),
  tpdLimit: z.number().int().positive().nullable().optional(),
  supportsVision: z.boolean().optional(),
  supportsTools: z.boolean().optional(),
  keyId: z.number().int().positive().nullable().optional(),
  endpointScope: z.string().nullable().optional(),
}).strict();


// ── Profiles ──  POST /api/profiles · PUT /api/profiles/:id/reorder

export const profileCreateSchema = z.object({
  name: profileNameSchema,
  emoji: z.string().max(4).default(''),
  color: z.string().default('#6366f1'),
  sourceProfileId: z.number().optional(),
  // Start the chain with nothing in it instead of a copy of the whole catalog
  // (#895). The point of a named chain is usually "these three models, in this
  // order" — starting from 200 rows means deleting 197 of them by hand. An
  // empty chain also opts out of the catalog-sync backfill, so it stays as
  // small as the user built it.
  empty: z.boolean().default(false),
});

export const profileReorderSchema = z.array(z.object({
  modelDbId: z.number(),
  priority: z.number(),
  enabled: z.boolean(),
}));


// ── Custom endpoints (Keys page) ──  POST /api/keys/custom · /discover-models · /probe

export const modelEntrySchema = z.union([
  z.string().min(1),
  z.object({
    model: z.string().min(1),
    displayName: z.string().optional(),
    supportsTools: z.boolean().optional(),
    supportsVision: z.boolean().optional(),
  }),
]);

export const customProviderSchema = z.object({
  baseUrl: z.string().url('baseUrl must be a valid URL').optional(),
  keyId: z.number().int().positive().optional(),
  model: z.string().optional(),
  models: z.array(modelEntrySchema).optional(),
  displayName: z.string().optional(),
  apiKey: z.string().optional(),
  label: z.string().optional(),
  // Top-level defaults applied to every model in this submit; a per-entry flag
  // (object form) overrides them for that one model.
  supportsTools: z.boolean().optional(),
  supportsVision: z.boolean().optional(),
}).refine(
  d => d.baseUrl !== undefined || d.keyId !== undefined,
  { message: 'baseUrl or keyId is required' },
);

export const discoverModelsSchema = z.object({
  baseUrl: z.string().url('baseUrl must be a valid URL').optional(),
  keyId: z.number().int().positive().optional(),
  // Lets the Keys page fetch a list for an endpoint the user is still typing in,
  // before it has been saved. Falls back to the endpoint's stored credential.
  apiKey: z.string().optional(),
}).refine(
  d => d.baseUrl !== undefined || d.keyId !== undefined,
  { message: 'baseUrl or keyId is required' },
);


// ── Settings PUT bodies ──  /api/settings/{update-check,unify,enable-mcp,agent-compatibility,…}

// POST /api/settings/url-tokens — the optional label on a freshly minted token.
export const urlTokenCreateSchema = z.object({ label: z.string().max(120).optional() });

export const settingsUpdateCheckSchema = z.object({ enabled: z.boolean() }).strict();

export const settingsUnifyPutSchema = z.object({
  enabled: z.boolean().optional(),
  overrides: unifyOverridesSchema.optional(),
});

export const settingsEnableMcpSchema = z.object({ enabled: z.boolean() });

export const settingsCompatibilitySchema = z.object({
  ollamaEmulation: z.enum(['off', 'open-loopback', 'key-required']).optional(),
  exposeClaudeDiscoveryAliases: z.boolean().optional(),
}).strict();

export const settingsOutputLimitSchema = z.object({
  mode: z.union([
    z.literal('off'),
    z.literal('auto'),
    z.number().int().min(1),
  ]),
});

export const settingsGuardrailsSchema = z.object({
  requestMaxTokensBudget: z.number().int().min(0).optional(),
  maxConsecutiveUpstreamFails: z.number().int().min(0).optional(),
});

export const settingsHeadroomSchema = z.object({
  rampStart: z.number().min(0).max(1).nullable().optional(),
  floor: z.number().min(0).max(1).nullable().optional(),
});

export const settingsTaskWeightShareSchema = z.object({
  share: z.number().min(0).max(1).nullable().optional(),
});

