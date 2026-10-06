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
