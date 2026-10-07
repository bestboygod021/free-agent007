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
