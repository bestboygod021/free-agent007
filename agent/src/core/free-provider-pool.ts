import type { ModelTaskType, PrivacyLevel } from "./types.js";
import { classifyProvider, type ComputeMode, type ProviderClass } from "./compute-mode.js";

/**
 * Free provider pool.
 *
 * Capabilities in this module are modelled on FreeLLMAPI
 * (github.com/tashfeenahmed/freellmapi, MIT), which aggregates the free tiers
 * of ~34 providers behind one OpenAI-compatible endpoint. The ideas worth
 * stealing are not the proxy itself but the four mechanisms that make a pile of
 * free tiers behave like one reliable provider:
 *
 *   1. token-aware quota — free tiers are capped in *tokens* per day, not just
 *      requests, so an RPM-only counter silently walks into a 429;
 *   2. failover with cooldown and key rotation — a rate-limited provider is
 *      parked, not hammered, and the next key on the same provider is tried
 *      before leaving the provider;
 *   3. unified model groups with named chains — the same model served by four
 *      providers is one entry to the caller, with in-group failover;
 *   4. sticky sessions — a conversation stays on one model, because switching
 *      mid-thread silently changes behaviour.
 *
 * This module is deterministic core: no network, no secrets, no I/O. It decides
 * *where* a call should go and *whether* it is still inside every cap. Provider
 * keys never enter this module — only opaque `keyId`s.
 *
 * The compute-mode wall is still authoritative: `poolAllowsEndpoint` rejects
 * anything the selected mode forbids, before any routing happens.
 */

/** Caps as a free tier actually expresses them. */
export interface FreeTierQuota {
  /** requests per minute; 0 = unlimited */
  rpm: number;
  /** requests per day; 0 = unlimited */
  rpd: number;
  /** tokens per minute; 0 = unlimited */
  tpm: number;
  /** tokens per day; 0 = unlimited */
  tpd: number;
  /** tokens per calendar month; 0 = unlimited */
  monthlyTokenBudget: number;
}

/** ToS facts, kept next to the endpoint so routing can refuse on principle. */
export interface ProviderTos {
  commercialUseAllowed: boolean;
  /** provider may train on prompts unless you pay or opt out */
  trainingOnInput: boolean;
  requiresAttribution: boolean;
  /** ISO date this row was reviewed; stale rows are a compliance risk */
  reviewedOn: string;
  /** free-text pointer to the clause that was read */
  source: string;
}

/** One provider/model/key-set triple, i.e. one "endpoint" in FreeLLMAPI terms. */
export interface PoolEndpoint {
  provider: string;
  model: string;
  /** unified model id: same value across providers serving the same model */
  groupKey: string;
  locality: "local" | "cloud";
  maxPrivacyLevel: PrivacyLevel;
  contextWindow: number;
  quota: FreeTierQuota;
  supportsToolCalling: boolean;
  supportsStructuredOutput: boolean;
  supportsStreaming: boolean;
  /** 0..1, higher is better — used by the scoring strategies */
  scores: { speed: number; capability: number; reliability: number };
  tos: ProviderTos;
  /** opaque key identifiers; never the secret itself */
  keyIds: readonly string[];
  /** lower is better; 0 = free */
  relativeCost: number;
  enabled: boolean;
  /** set when the catalog feed marked the endpoint as retired */
  retired?: boolean;
}

/** A named fallback chain, e.g. "coding" or "vision". */
export interface FallbackChainProfile {
  name: string;
  /** groupKeys or provider/model ids, most preferred first */
  members: readonly string[];
  labelFa: string;
}

export const endpointId = (provider: string, model: string) => `${provider}/${model}`;

/**
 * Local runtimes (Ollama, llama.cpp, vLLM) authenticate with nothing at all.
 * Rather than special-casing "no key" through every code path, an empty key set
 * becomes one virtual key, so quota, cooldown and rotation behave identically
 * for local and cloud endpoints.
 */
export const NO_KEY = "(no-key)";

// ── usage state ─────────────────────────────────────────────────────────────

export interface KeyUsage {
  keyId: string;
  minuteRequests: number;
  dayRequests: number;
  minuteTokens: number;
  dayTokens: number;
  monthTokens: number;
  /** epoch ms until which this key must not be used */
  cooldownUntil: number;
  /** consecutive failures; drives backoff */
  consecutiveFailures: number;
  /** round-robin cursor */
  lastUsedAt: number;
}

export interface EndpointUsage {
  id: string;
  keys: Record<string, KeyUsage>;
}

export interface PoolState {
  endpoints: Record<string, EndpointUsage>;
  windowMinute: number;
  windowDay: number;
  windowMonth: string;
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

function monthOf(now: number): string {
  return new Date(now).toISOString().slice(0, 7);
}

function newKeyUsage(keyId: string): KeyUsage {
  return {
    keyId,
    minuteRequests: 0,
    dayRequests: 0,
    minuteTokens: 0,
    dayTokens: 0,
    monthTokens: 0,
    cooldownUntil: 0,
    consecutiveFailures: 0,
    lastUsedAt: 0,
  };
}

export function newPoolState(endpoints: readonly PoolEndpoint[]): PoolState {
  const state: PoolState = { endpoints: {}, windowMinute: 0, windowDay: 0, windowMonth: "" };
  for (const e of endpoints) {
    const keys: Record<string, KeyUsage> = {};
    const ids = e.keyIds.length > 0 ? e.keyIds : [NO_KEY];
    for (const keyId of ids) keys[keyId] = newKeyUsage(keyId);
    state.endpoints[endpointId(e.provider, e.model)] = {
      id: endpointId(e.provider, e.model),
      keys,
    };
  }
  return state;
}

/** Roll window counters forward. Called implicitly by every mutation. */
function rollWindows(state: PoolState, now: number): PoolState {
  const next: PoolState = {
    endpoints: {},
    windowMinute: Math.floor(now / MINUTE_MS),
    windowDay: Math.floor(now / DAY_MS),
    windowMonth: monthOf(now),
  };
  const minuteChanged = state.windowMinute !== next.windowMinute;
  const dayChanged = state.windowDay !== next.windowDay;
  const monthChanged = state.windowMonth !== next.windowMonth;

  for (const [id, usage] of Object.entries(state.endpoints)) {
    const keys: Record<string, KeyUsage> = {};
    for (const [keyId, k] of Object.entries(usage.keys)) {
      keys[keyId] = {
        ...k,
        minuteRequests: minuteChanged ? 0 : k.minuteRequests,
        minuteTokens: minuteChanged ? 0 : k.minuteTokens,
        dayRequests: dayChanged ? 0 : k.dayRequests,
        dayTokens: dayChanged ? 0 : k.dayTokens,
        monthTokens: monthChanged ? 0 : k.monthTokens,
      };
    }
    next.endpoints[id] = { id, keys };
  }
  return next;
}

export type QuotaBlock =
  | "rpm"
  | "rpd"
  | "tpm"
  | "tpd"
  | "monthly"
  | "cooldown"
  | "no_key"
  | "unknown_endpoint"
  | "disabled"
  | "retired";

export type AcquireDecision =
  | { ok: true; keyId: string; remaining: RemainingBudget }
  | { ok: false; block: QuotaBlock; retryAfterHint: "minute" | "day" | "month" | "cooldown" | "never"; detail: string };

export interface RemainingBudget {
  requestsThisMinute: number;
  requestsToday: number;
  tokensThisMinute: number;
  tokensToday: number;
  tokensThisMonth: number;
}

/** Keys that are usable right now, least-recently-used first. */
export function availableKeys(
  state: PoolState,
  endpoint: PoolEndpoint,
  now: number,
): KeyUsage[] {
  const usage = state.endpoints[endpointId(endpoint.provider, endpoint.model)];
  if (!usage) return [];
  return Object.values(usage.keys)
    .filter((k) => k.cooldownUntil <= now)
    .sort((a, b) => a.lastUsedAt - b.lastUsedAt || a.keyId.localeCompare(b.keyId));
}

/**
 * Decide whether a call of `estimateTokens` can go to this endpoint, and with
 * which key. Token caps are checked against the estimate; `commitUsage`
 * reconciles with the real count afterwards.
 */
export function tryAcquire(
  state: PoolState,
  endpoint: PoolEndpoint,
  estimateTokens: number,
  now = Date.now(),
): { state: PoolState; decision: AcquireDecision } {
  const rolled = rollWindows(state, now);
  const id = endpointId(endpoint.provider, endpoint.model);
  const usage = rolled.endpoints[id];
  if (!usage) {
    return {
      state: rolled,
      decision: {
        ok: false,
        block: "unknown_endpoint",
        retryAfterHint: "never",
        detail: `${id} is not in the pool`,
      },
    };
  }
  if (endpoint.retired) {
    return {
      state: rolled,
      decision: { ok: false, block: "retired", retryAfterHint: "never", detail: `${id} is retired` },
    };
  }
  if (!endpoint.enabled) {
    return {
      state: rolled,
      decision: { ok: false, block: "disabled", retryAfterHint: "never", detail: `${id} is disabled` },
    };
  }

  const keys = availableKeys(rolled, endpoint, now);
  if (keys.length === 0) {
    const anyKey = Object.values(usage.keys)[0];
    const until = anyKey ? anyKey.cooldownUntil : 0;
    return {
      state: rolled,
      decision: {
        ok: false,
        block: keys.length === 0 && Object.keys(usage.keys).length === 0 ? "no_key" : "cooldown",
        retryAfterHint: until > now ? "cooldown" : "never",
        detail:
          Object.keys(usage.keys).length === 0
            ? `${id} has no keys configured`
            : `every key for ${id} is cooling down until ${new Date(until).toISOString()}`,
      },
    };
  }

  const q = endpoint.quota;
  for (const k of keys) {
    if (q.rpm > 0 && k.minuteRequests + 1 > q.rpm) continue;
    if (q.rpd > 0 && k.dayRequests + 1 > q.rpd) continue;
    if (q.tpm > 0 && k.minuteTokens + estimateTokens > q.tpm) continue;
    if (q.tpd > 0 && k.dayTokens + estimateTokens > q.tpd) continue;
    if (q.monthlyTokenBudget > 0 && k.monthTokens + estimateTokens > q.monthlyTokenBudget) continue;

    const next = {
      ...rolled,
      endpoints: {
        ...rolled.endpoints,
        [id]: {
          ...usage,
          keys: {
            ...usage.keys,
            [k.keyId]: {
              ...k,
              minuteRequests: k.minuteRequests + 1,
              dayRequests: k.dayRequests + 1,
              minuteTokens: k.minuteTokens + estimateTokens,
              dayTokens: k.dayTokens + estimateTokens,
              monthTokens: k.monthTokens + estimateTokens,
              lastUsedAt: now,
            },
          },
        },
      },
    };
    const used = next.endpoints[id]?.keys[k.keyId];
    return {
      state: next,
      decision: {
        ok: true,
        keyId: k.keyId,
        remaining: {
          requestsThisMinute: q.rpm > 0 && used ? q.rpm - used.minuteRequests : -1,
          requestsToday: q.rpd > 0 && used ? q.rpd - used.dayRequests : -1,
          tokensThisMinute: q.tpm > 0 && used ? q.tpm - used.minuteTokens : -1,
          tokensToday: q.tpd > 0 && used ? q.tpd - used.dayTokens : -1,
          tokensThisMonth:
            q.monthlyTokenBudget > 0 && used ? q.monthlyTokenBudget - used.monthTokens : -1,
        },
      },
    };
  }

  // Every key failed some cap. Name the binding one so the caller can back off
  // correctly instead of retrying instantly.
  const first = keys[0];
  if (!first) {
    return {
      state: rolled,
      decision: { ok: false, block: "no_key", retryAfterHint: "never", detail: `${id} has no keys` },
    };
  }
  const block: QuotaBlock =
    q.rpm > 0 && first.minuteRequests + 1 > q.rpm
      ? "rpm"
      : q.rpd > 0 && first.dayRequests + 1 > q.rpd
        ? "rpd"
        : q.tpm > 0 && first.minuteTokens + estimateTokens > q.tpm
          ? "tpm"
          : q.tpd > 0 && first.dayTokens + estimateTokens > q.tpd
            ? "tpd"
            : q.monthlyTokenBudget > 0 && first.monthTokens + estimateTokens > q.monthlyTokenBudget
              ? "monthly"
              : "tpd";
  const hint: "minute" | "day" | "month" =
    block === "rpm" || block === "tpm" ? "minute" : block === "monthly" ? "month" : "day";
  return {
    state: rolled,
    decision: {
      ok: false,
      block,
      retryAfterHint: hint,
      detail: `${id} key ${first.keyId} is at its ${block} ceiling`,
    },
  };
}

/** Reconcile the estimate with what the provider actually billed. */
export function commitUsage(
  state: PoolState,
  endpoint: PoolEndpoint,
  keyId: string,
  actualTokens: number,
  estimatedTokens: number,
  now = Date.now(),
): PoolState {
  const rolled = rollWindows(state, now);
  const id = endpointId(endpoint.provider, endpoint.model);
  const usage = rolled.endpoints[id];
  const key = usage?.keys[keyId];
  if (!usage || !key) return rolled;
  const delta = actualTokens - estimatedTokens;
  if (delta === 0) return rolled;
  return {
    ...rolled,
    endpoints: {
      ...rolled.endpoints,
      [id]: {
        ...usage,
        keys: {
          ...usage.keys,
          [keyId]: {
            ...key,
            minuteTokens: Math.max(0, key.minuteTokens + delta),
            dayTokens: Math.max(0, key.dayTokens + delta),
            monthTokens: Math.max(0, key.monthTokens + delta),
          },
        },
      },
    },
  };
}

export type FailureKind = "rate_limited" | "server_error" | "timeout" | "invalid_response";

/**
 * Park the failing key and rotate. Cooldown grows with consecutive failures so
 * a flapping provider is not retried every second.
 */
export function recordFailure(
  state: PoolState,
  endpoint: PoolEndpoint,
  keyId: string,
  kind: FailureKind,
  now = Date.now(),
): { state: PoolState; cooldownMs: number; rotatedTo: string | null } {
  const rolled = rollWindows(state, now);
  const id = endpointId(endpoint.provider, endpoint.model);
  const usage = rolled.endpoints[id];
  const key = usage?.keys[keyId];
  if (!usage || !key) return { state: rolled, cooldownMs: 0, rotatedTo: null };

  const failures = key.consecutiveFailures + 1;
  // 429 gets a real backoff; a malformed response is the model's fault, not the
  // provider's, so it gets a short park only.
  const base = kind === "rate_limited" ? 60_000 : kind === "server_error" ? 20_000 : kind === "timeout" ? 10_000 : 2_000;
  const cooldownMs = base * Math.min(failures, 8);

  const next: PoolState = {
    ...rolled,
    endpoints: {
      ...rolled.endpoints,
      [id]: {
        ...usage,
        keys: {
          ...usage.keys,
          [keyId]: { ...key, cooldownUntil: now + cooldownMs, consecutiveFailures: failures },
        },
      },
    },
  };

  const rotated = availableKeys(next, endpoint, now)[0];
  return {
    state: next,
    cooldownMs,
    rotatedTo: rotated && rotated.keyId !== keyId ? rotated.keyId : null,
  };
}

export function recordSuccess(
  state: PoolState,
  endpoint: PoolEndpoint,
  keyId: string,
  now = Date.now(),
): PoolState {
  const rolled = rollWindows(state, now);
  const id = endpointId(endpoint.provider, endpoint.model);
  const usage = rolled.endpoints[id];
  const key = usage?.keys[keyId];
  if (!usage || !key) return rolled;
  return {
    ...rolled,
    endpoints: {
      ...rolled.endpoints,
      [id]: {
        ...usage,
        keys: { ...usage.keys, [keyId]: { ...key, consecutiveFailures: 0, cooldownUntil: 0 } },
      },
    },
  };
}

// ── routing ─────────────────────────────────────────────────────────────────

export type RoutingStrategy =
  | "cheapest"
  | "fastest"
  | "most-capable"
  | "most-reliable"
  | "round-robin"
  | "least-used";

export const ROUTING_STRATEGIES: readonly RoutingStrategy[] = [
  "cheapest",
  "fastest",
  "most-capable",
  "most-reliable",
  "round-robin",
  "least-used",
];

/**
 * The compute-mode wall, applied to the pool. This runs before scoring so no
 * strategy can talk its way past the selected mode.
 */
export function poolAllowsEndpoint(
  endpoint: PoolEndpoint,
  mode: ComputeMode,
  privacy: PrivacyLevel,
  privacyRank: (level: PrivacyLevel) => number,
): { allowed: boolean; reason: string } {
  const cls: ProviderClass = classifyProvider({
    locality: endpoint.locality,
    relativeCost: endpoint.relativeCost,
  });
  if (mode === "local" && cls !== "local") {
    return { allowed: false, reason: "local mode: cloud endpoints are forbidden" };
  }
  if (mode === "free" && cls === "cloud_paid") {
    return { allowed: false, reason: "free mode: paid cloud endpoints are forbidden" };
  }
  if (cls === "cloud_free" || cls === "cloud_paid") {
    if (privacyRank(privacy) > privacyRank("public") && endpoint.tos.trainingOnInput) {
      return { allowed: false, reason: "provider trains on input; not allowed for this privacy level" };
    }
  }
  if (endpoint.retired) return { allowed: false, reason: "endpoint retired" };
  if (!endpoint.enabled) return { allowed: false, reason: "endpoint disabled" };
  return { allowed: true, reason: "ok" };
}

export interface PoolRouteRequest {
  mode: ComputeMode;
  privacyLevel: PrivacyLevel;
  taskType: ModelTaskType;
  estimateTokens: number;
  requiresToolCalling: boolean;
  requiresStructuredOutput: boolean;
  /** required context window in tokens */
  contextTokens: number;
  strategy: RoutingStrategy;
  /** optional named chain; "auto:<name>" selects a profile */
  profile?: string;
  /** pin to a session so the conversation stays on one model */
  sessionId?: string;
}

export interface PoolRouteChoice {
  endpoint: PoolEndpoint;
  keyId: string;
  reason: string;
}

export interface PoolRouteResult {
  primary: PoolRouteChoice | null;
  fallbacks: PoolRouteChoice[];
  rejected: Array<{ id: string; reason: string }>;
  /** unified group chosen, when the caller asked for one */
  groupKey: string | null;
  explanation: string;
  state: PoolState;
}

function scoreOf(endpoint: PoolEndpoint, strategy: RoutingStrategy, state: PoolState, now: number): number {
  const id = endpointId(endpoint.provider, endpoint.model);
  const usage = state.endpoints[id];
  const usedTokens = usage ? Object.values(usage.keys).reduce((s, k) => s + k.dayTokens, 0) : 0;
  switch (strategy) {
    case "cheapest":
      return -endpoint.relativeCost;
    case "fastest":
      return endpoint.scores.speed;
    case "most-capable":
      return endpoint.scores.capability;
    case "most-reliable":
      return endpoint.scores.reliability - endpoint.scores.speed * 0;
    case "least-used":
      return -usedTokens;
    case "round-robin": {
      const last = usage
        ? Math.max(0, ...Object.values(usage.keys).map((k) => k.lastUsedAt))
        : 0;
      return -(last || now);
    }
  }
}

/** Group endpoints by unified model id. */
export function unifiedGroups(
  endpoints: readonly PoolEndpoint[],
): Map<string, PoolEndpoint[]> {
  const groups = new Map<string, PoolEndpoint[]>();
  for (const e of endpoints) {
    const list = groups.get(e.groupKey) ?? [];
    list.push(e);
    groups.set(e.groupKey, list);
  }
  return groups;
}

export function resolveProfile(
  profiles: readonly FallbackChainProfile[],
  selector: string | undefined,
): FallbackChainProfile | null {
  if (!selector) return null;
  const name = selector.startsWith("auto:") ? selector.slice(5) : selector;
  return profiles.find((p) => p.name === name) ?? null;
}

/**
 * Choose an endpoint and a key, honouring: the mode wall, capability needs,
 * context window, every quota cap, the routing strategy, unified groups and
 * named chains.
 */
export function routeFromPool(params: {
  state: PoolState;
  endpoints: readonly PoolEndpoint[];
  request: PoolRouteRequest;
  profiles?: readonly FallbackChainProfile[];
  privacyRank: (level: PrivacyLevel) => number;
  now?: number;
}): PoolRouteResult {
  const { state, endpoints, request, profiles = [] } = params;
  const now = params.now ?? Date.now();
  let working = state;
  const rejected: Array<{ id: string; reason: string }> = [];

  const profile = resolveProfile(profiles, request.profile);
  const inProfile = (e: PoolEndpoint) => {
    if (!profile) return true;
    return profile.members.includes(e.groupKey) || profile.members.includes(endpointId(e.provider, e.model));
  };

  const eligible = endpoints.filter((e) => {
    const id = endpointId(e.provider, e.model);
    if (!inProfile(e)) {
      rejected.push({ id, reason: `not in chain "${profile?.name ?? ""}"` });
      return false;
    }
    const wall = poolAllowsEndpoint(e, request.mode, request.privacyLevel, params.privacyRank);
    if (!wall.allowed) {
      rejected.push({ id, reason: wall.reason });
      return false;
    }
    if (params.privacyRank(request.privacyLevel) > params.privacyRank(e.maxPrivacyLevel)) {
      rejected.push({ id, reason: `privacy ceiling is ${e.maxPrivacyLevel}` });
      return false;
    }
    if (request.requiresToolCalling && !e.supportsToolCalling) {
      rejected.push({ id, reason: "no tool calling" });
      return false;
    }
    if (request.requiresStructuredOutput && !e.supportsStructuredOutput) {
      rejected.push({ id, reason: "no structured output" });
      return false;
    }
    if (e.contextWindow < request.contextTokens) {
      rejected.push({ id, reason: `context window ${e.contextWindow} < ${request.contextTokens}` });
      return false;
    }
    return true;
  });

  // Unified groups: rank groups, then fail over strictly inside the winning
  // group before moving to the next one. That keeps behaviour stable when the
  // same model is served by several providers.
  const groups = unifiedGroups(eligible);
  const rankedGroups = [...groups.entries()].sort((a, b) => {
    const best = (list: PoolEndpoint[]) => Math.max(...list.map((e) => scoreOf(e, request.strategy, working, now)));
    return best(b[1]) - best(a[1]);
  });

  const choices: PoolRouteChoice[] = [];
  for (const [groupKey, list] of rankedGroups) {
    const ranked = [...list].sort(
      (a, b) => scoreOf(b, request.strategy, working, now) - scoreOf(a, request.strategy, working, now),
    );
    for (const endpoint of ranked) {
      const acquired = tryAcquire(working, endpoint, request.estimateTokens, now);
      working = acquired.state;
      if (!acquired.decision.ok) {
        rejected.push({
          id: endpointId(endpoint.provider, endpoint.model),
          reason: `quota: ${acquired.decision.block} (${acquired.decision.detail})`,
        });
        continue;
      }
      choices.push({
        endpoint,
        keyId: acquired.decision.keyId,
        reason: `${request.strategy} · group ${groupKey} · key ${acquired.decision.keyId}`,
      });
    }
  }

  const primary = choices[0] ?? null;
  return {
    primary,
    fallbacks: choices.slice(1),
    rejected,
    groupKey: primary ? primary.endpoint.groupKey : null,
    explanation: primary
      ? `${request.strategy}: ${endpointId(primary.endpoint.provider, primary.endpoint.model)} ` +
        `(${choices.length - 1} fallback(s), ${rejected.length} rejected)`
      : `no endpoint available (${rejected.length} rejected)`,
    state: working,
  };
}

// ── sticky sessions ─────────────────────────────────────────────────────────

export const STICKY_TTL_MS = 30 * 60_000;

export interface StickySession {
  sessionId: string;
  endpointId: string;
  groupKey: string;
  pinnedAt: number;
  /** compact note handed to the new model when a switch is unavoidable */
  handoffNote?: string;
}

export interface StickyDecision {
  session: StickySession;
  switched: boolean;
  /** present when the pinned model was abandoned mid-thread */
  handoffRequired: boolean;
  reason: string;
}

/**
 * Keep a conversation on one model. When the pinned endpoint is no longer
 * usable the caller gets an explicit handoff signal rather than a silent
 * behaviour change.
 */
export function stickyChoice(params: {
  sessions: Map<string, StickySession>;
  sessionId: string;
  result: PoolRouteResult;
  now?: number;
  ttlMs?: number;
}): StickyDecision {
  const now = params.now ?? Date.now();
  const ttl = params.ttlMs ?? STICKY_TTL_MS;
  const existing = params.sessions.get(params.sessionId);

  const primaryId = params.result.primary
    ? endpointId(params.result.primary.endpoint.provider, params.result.primary.endpoint.model)
    : null;

  if (existing && now - existing.pinnedAt <= ttl) {
    const stillAvailable =
      primaryId === existing.endpointId ||
      params.result.fallbacks.some(
        (f) => endpointId(f.endpoint.provider, f.endpoint.model) === existing.endpointId,
      );
    if (stillAvailable) {
      return {
        session: existing,
        switched: false,
        handoffRequired: false,
        reason: `pinned to ${existing.endpointId}`,
      };
    }
  }

  if (!params.result.primary) {
    return {
      session: existing ?? {
        sessionId: params.sessionId,
        endpointId: "",
        groupKey: "",
        pinnedAt: now,
      },
      switched: false,
      handoffRequired: Boolean(existing),
      reason: "no endpoint available; thread cannot continue",
    };
  }

  const next: StickySession = {
    sessionId: params.sessionId,
    endpointId: primaryId as string,
    groupKey: params.result.groupKey ?? params.result.primary.endpoint.groupKey,
    pinnedAt: now,
    handoffNote: existing
      ? `Previous model ${existing.endpointId} became unavailable; continue this thread without repeating earlier answers.`
      : undefined,
  };
  params.sessions.set(params.sessionId, next);
  return {
    session: next,
    switched: existing ? existing.endpointId !== next.endpointId : false,
    handoffRequired: existing ? existing.endpointId !== next.endpointId : false,
    reason: existing
      ? `switched from ${existing.endpointId} to ${next.endpointId}`
      : `pinned to ${next.endpointId}`,
  };
}

/** Drop sessions that have outlived the TTL. */
export function pruneSessions(
  sessions: Map<string, StickySession>,
  now = Date.now(),
  ttlMs = STICKY_TTL_MS,
): Map<string, StickySession> {
  const next = new Map<string, StickySession>();
  for (const [id, s] of sessions) {
    if (now - s.pinnedAt <= ttlMs) next.set(id, s);
  }
  return next;
}

// ── reporting ───────────────────────────────────────────────────────────────

export interface PoolUsageReport {
  endpointId: string;
  provider: string;
  model: string;
  keys: number;
  tokensToday: number;
  tokensThisMonth: number;
  coolingDown: number;
  monthlyBudget: number;
  /** 0..1 of the monthly budget consumed; -1 when unlimited */
  monthlyShare: number;
}

/** Per-endpoint consumption, for the cost dashboard. */
export function usageReport(
  state: PoolState,
  endpoints: readonly PoolEndpoint[],
  now = Date.now(),
): PoolUsageReport[] {
  const rolled = rollWindows(state, now);
  return endpoints.map((e) => {
    const id = endpointId(e.provider, e.model);
    const usage = rolled.endpoints[id];
    const keys = usage ? Object.values(usage.keys) : [];
    const tokensToday = keys.reduce((s, k) => s + k.dayTokens, 0);
    const tokensThisMonth = keys.reduce((s, k) => s + k.monthTokens, 0);
    const budget = e.quota.monthlyTokenBudget;
    return {
      endpointId: id,
      provider: e.provider,
      model: e.model,
      keys: keys.length,
      tokensToday,
      tokensThisMonth,
      coolingDown: keys.filter((k) => k.cooldownUntil > now).length,
      monthlyBudget: budget,
      monthlyShare: budget > 0 ? tokensThisMonth / budget : -1,
    };
  });
}

/** Endpoints whose ToS review is older than `maxAgeDays`. */
export function staleTosReviews(
  endpoints: readonly PoolEndpoint[],
  now = Date.now(),
  maxAgeDays = 90,
): PoolEndpoint[] {
  const cutoff = now - maxAgeDays * DAY_MS;
  return endpoints.filter((e) => {
    const reviewed = Date.parse(e.tos.reviewedOn);
    return Number.isNaN(reviewed) || reviewed < cutoff;
  });
}
