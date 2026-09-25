import { describe, expect, it } from "vitest";

import {
  newPoolState,
  tryAcquire,
  commitUsage,
  recordFailure,
  recordSuccess,
  availableKeys,
  poolAllowsEndpoint,
  routeFromPool,
  unifiedGroups,
  resolveProfile,
  stickyChoice,
  pruneSessions,
  usageReport,
  staleTosReviews,
  endpointId,
  ROUTING_STRATEGIES,
  STICKY_TTL_MS,
  type FallbackChainProfile,
  type PoolEndpoint,
  type PoolRouteRequest,
  type StickySession,
} from "../src/core/free-provider-pool.js";
import { rankPrivacy } from "../src/core/model-router.js";

const T0 = Date.parse("2026-09-08T10:00:00.000Z");

function ep(over: Partial<PoolEndpoint> & Pick<PoolEndpoint, "provider" | "model">): PoolEndpoint {
  return {
    groupKey: over.model,
    locality: "cloud",
    maxPrivacyLevel: "confidential",
    contextWindow: 128_000,
    quota: { rpm: 20, rpd: 500, tpm: 100_000, tpd: 1_000_000, monthlyTokenBudget: 10_000_000 },
    supportsToolCalling: true,
    supportsStructuredOutput: true,
    supportsStreaming: true,
    scores: { speed: 0.7, capability: 0.7, reliability: 0.9 },
    tos: {
      commercialUseAllowed: true,
      trainingOnInput: false,
      requiresAttribution: false,
      reviewedOn: "2026-08-01",
      source: "provider ToS §free-tier",
    },
    keyIds: ["k1"],
    relativeCost: 0,
    enabled: true,
    ...over,
  };
}

const GROQ = ep({ provider: "groq", model: "fast-coder", groupKey: "fast-coder", keyIds: ["g1", "g2"] });
const CEREBRAS = ep({ provider: "cerebras", model: "fast-coder", groupKey: "fast-coder" });
const PAID = ep({ provider: "openai", model: "premium", relativeCost: 5, scores: { speed: 0.6, capability: 0.95, reliability: 0.95 } });
const LOCAL = ep({ provider: "ollama", model: "qwen-coder", locality: "local", keyIds: [] });
const TRAINS = ep({
  provider: "trainfree",
  model: "trains-on-input",
  tos: {
    commercialUseAllowed: true,
    trainingOnInput: true,
    requiresAttribution: false,
    reviewedOn: "2026-08-01",
    source: "provider ToS",
  },
});

const ALL = [GROQ, CEREBRAS, PAID, LOCAL, TRAINS];

function req(over: Partial<PoolRouteRequest> = {}): PoolRouteRequest {
  return {
    mode: "free",
    privacyLevel: "internal",
    taskType: "code_generation",
    estimateTokens: 1_000,
    requiresToolCalling: false,
    requiresStructuredOutput: false,
    contextTokens: 8_000,
    strategy: "cheapest",
    ...over,
  };
}

describe("token-aware quota", () => {
  it("blocks on the token cap even while the request cap is untouched", () => {
    const tight = ep({
      provider: "tight",
      model: "m",
      quota: { rpm: 1000, rpd: 1000, tpm: 100_000, tpd: 2_000, monthlyTokenBudget: 0 },
    });
    let state = newPoolState([tight]);

    const first = tryAcquire(state, tight, 1_500, T0);
    expect(first.decision.ok).toBe(true);
    state = first.state;

    const second = tryAcquire(state, tight, 1_000, T0);
    expect(second.decision.ok).toBe(false);
    if (!second.decision.ok) {
      expect(second.decision.block).toBe("tpd");
      expect(second.decision.retryAfterHint).toBe("day");
    }
  });

  it("blocks on the monthly budget last", () => {
    const monthly = ep({
      provider: "monthly",
      model: "m",
      quota: { rpm: 0, rpd: 0, tpm: 0, tpd: 0, monthlyTokenBudget: 5_000 },
    });
    let state = newPoolState([monthly]);
    const a = tryAcquire(state, monthly, 4_000, T0);
    expect(a.decision.ok).toBe(true);
    state = a.state;
    const b = tryAcquire(state, monthly, 2_000, T0);
    expect(b.decision.ok).toBe(false);
    if (!b.decision.ok) {
      expect(b.decision.block).toBe("monthly");
      expect(b.decision.retryAfterHint).toBe("month");
    }
  });

  it("treats 0 as unlimited", () => {
    const unlimited = ep({
      provider: "unlimited",
      model: "m",
      quota: { rpm: 0, rpd: 0, tpm: 0, tpd: 0, monthlyTokenBudget: 0 },
    });
    const state = newPoolState([unlimited]);
    const r = tryAcquire(state, unlimited, 9_000_000, T0);
    expect(r.decision.ok).toBe(true);
    if (r.decision.ok) expect(r.decision.remaining.tokensToday).toBe(-1);
  });

  it("resets minute, day and month windows independently", () => {
    const tight = ep({
      provider: "tight",
      model: "m",
      quota: { rpm: 1, rpd: 0, tpm: 0, tpd: 0, monthlyTokenBudget: 0 },
    });
    let state = newPoolState([tight]);
    const a = tryAcquire(state, tight, 10, T0);
    expect(a.decision.ok).toBe(true);
    state = a.state;
    expect(tryAcquire(state, tight, 10, T0).decision.ok).toBe(false);
    // one minute later the minute window rolls, the day counter does not
    expect(tryAcquire(state, tight, 10, T0 + 61_000).decision.ok).toBe(true);
  });

  it("reconciles the estimate with the provider's real token count", () => {
    let state = newPoolState([GROQ]);
    const a = tryAcquire(state, GROQ, 1_000, T0);
    expect(a.decision.ok).toBe(true);
    if (!a.decision.ok) throw new Error("unreachable");
    state = a.state;
    state = commitUsage(state, GROQ, a.decision.keyId, 3_000, 1_000, T0);
    const report = usageReport(state, [GROQ], T0)[0];
    expect(report?.tokensToday).toBe(3_000);
  });
});

describe("failover with cooldown and key rotation", () => {
  it("rotates to another key on the same provider before leaving it", () => {
    let state = newPoolState([GROQ]);
    const failed = recordFailure(state, GROQ, "g1", "rate_limited", T0);
    expect(failed.cooldownMs).toBe(60_000);
    expect(failed.rotatedTo).toBe("g2");
    state = failed.state;
    expect(availableKeys(state, GROQ, T0).map((k) => k.keyId)).toEqual(["g2"]);
  });

  it("grows the cooldown with consecutive failures and caps it", () => {
    let state = newPoolState([GROQ]);
    const c1 = recordFailure(state, GROQ, "g1", "rate_limited", T0);
    state = c1.state;
    const c2 = recordFailure(state, GROQ, "g1", "rate_limited", T0);
    expect(c2.cooldownMs).toBe(120_000);
    for (let i = 0; i < 10; i += 1) {
      state = recordFailure(state, GROQ, "g1", "rate_limited", T0).state;
    }
    const last = recordFailure(state, GROQ, "g1", "rate_limited", T0);
    expect(last.cooldownMs).toBe(480_000);
  });

  it("parks a malformed response only briefly", () => {
    const state = newPoolState([GROQ]);
    expect(recordFailure(state, GROQ, "g1", "invalid_response", T0).cooldownMs).toBe(2_000);
  });

  it("a success clears the failure streak", () => {
    let state = newPoolState([GROQ]);
    state = recordFailure(state, GROQ, "g1", "rate_limited", T0).state;
    state = recordSuccess(state, GROQ, "g1", T0 + 120_000);
    const keys = Object.values(state.endpoints[endpointId("groq", "fast-coder")]?.keys ?? {});
    expect(keys.find((k) => k.keyId === "g1")?.consecutiveFailures).toBe(0);
  });

  it("reports cooldown rather than silently failing when every key is parked", () => {
    let state = newPoolState([GROQ]);
    state = recordFailure(state, GROQ, "g1", "rate_limited", T0).state;
    state = recordFailure(state, GROQ, "g2", "rate_limited", T0).state;
    const r = tryAcquire(state, GROQ, 100, T0);
    expect(r.decision.ok).toBe(false);
    if (!r.decision.ok) {
      expect(r.decision.block).toBe("cooldown");
      expect(r.decision.retryAfterHint).toBe("cooldown");
    }
  });
});

describe("compute-mode wall", () => {
  it("local mode rejects every cloud endpoint", () => {
    for (const e of [GROQ, PAID]) {
      const v = poolAllowsEndpoint(e, "local", "internal", rankPrivacy);
      expect(v.allowed).toBe(false);
      expect(v.reason).toMatch(/local mode/);
    }
    expect(poolAllowsEndpoint(LOCAL, "local", "confidential", rankPrivacy).allowed).toBe(true);
  });

  it("free mode rejects paid cloud endpoints", () => {
    expect(poolAllowsEndpoint(PAID, "free", "internal", rankPrivacy).allowed).toBe(false);
    expect(poolAllowsEndpoint(GROQ, "free", "internal", rankPrivacy).allowed).toBe(true);
    expect(poolAllowsEndpoint(PAID, "paid", "internal", rankPrivacy).allowed).toBe(true);
  });

  it("refuses a train-on-input provider for non-public work", () => {
    expect(poolAllowsEndpoint(TRAINS, "free", "internal", rankPrivacy).allowed).toBe(false);
    expect(poolAllowsEndpoint(TRAINS, "free", "public", rankPrivacy).allowed).toBe(true);
  });

  it("no routing strategy can talk its way past the wall", () => {
    for (const strategy of ROUTING_STRATEGIES) {
      const r = routeFromPool({
        state: newPoolState(ALL),
        endpoints: ALL,
        request: req({ mode: "local", strategy }),
        privacyRank: rankPrivacy,
        now: T0,
      });
      expect(r.primary?.endpoint.locality, strategy).toBe("local");
    }
  });
});

describe("unified groups and named chains", () => {
  it("collapses the same model on several providers into one group", () => {
    const groups = unifiedGroups(ALL);
    expect(groups.get("fast-coder")?.map((e) => e.provider).sort()).toEqual(["cerebras", "groq"]);
  });

  it("fails over inside the winning group before leaving it", () => {
    const state = newPoolState(ALL);
    const r = routeFromPool({
      state,
      endpoints: ALL,
      request: req({ strategy: "most-reliable" }),
      privacyRank: rankPrivacy,
      now: T0,
    });
    expect(r.groupKey).toBe("fast-coder");
    const providers = [r.primary?.endpoint.provider, ...r.fallbacks.map((f) => f.endpoint.provider)];
    expect(providers.slice(0, 2).sort()).toEqual(["cerebras", "groq"]);
  });

  it("resolves auto:<name> to a named chain and rejects everything else", () => {
    const profiles: FallbackChainProfile[] = [
      { name: "coding", members: ["fast-coder"], labelFa: "زنجیره کدنویسی" },
      { name: "vision", members: ["openai/premium"], labelFa: "زنجیره بینایی" },
    ];
    expect(resolveProfile(profiles, "auto:coding")?.name).toBe("coding");
    expect(resolveProfile(profiles, "coding")?.name).toBe("coding");
    expect(resolveProfile(profiles, "nope")).toBeNull();

    const r = routeFromPool({
      state: newPoolState(ALL),
      endpoints: ALL,
      request: req({ profile: "auto:coding", strategy: "most-capable" }),
      profiles,
      privacyRank: rankPrivacy,
      now: T0,
    });
    expect(r.groupKey).toBe("fast-coder");
    expect(r.rejected.some((x) => x.reason.includes("not in chain"))).toBe(true);
  });

  it("exhausting every key in a group falls through to the next group", () => {
    const small = ep({
      provider: "tiny",
      model: "fast-coder",
      groupKey: "fast-coder",
      quota: { rpm: 1, rpd: 1, tpm: 0, tpd: 0, monthlyTokenBudget: 0 },
      scores: { speed: 0.99, capability: 0.99, reliability: 0.99 },
    });
    let state = newPoolState([small, CEREBRAS]);
    const first = routeFromPool({
      state,
      endpoints: [small, CEREBRAS],
      request: req({ strategy: "fastest" }),
      privacyRank: rankPrivacy,
      now: T0,
    });
    expect(first.primary?.endpoint.provider).toBe("tiny");
    state = first.state;
    const second = routeFromPool({
      state,
      endpoints: [small, CEREBRAS],
      request: req({ strategy: "fastest" }),
      privacyRank: rankPrivacy,
      now: T0,
    });
    expect(second.primary?.endpoint.provider).toBe("cerebras");
  });
});

describe("capability and context filters", () => {
  it("rejects endpoints without tool calling when it is required", () => {
    const noTools = ep({ provider: "notools", model: "m", supportsToolCalling: false });
    const r = routeFromPool({
      state: newPoolState([noTools]),
      endpoints: [noTools],
      request: req({ requiresToolCalling: true }),
      privacyRank: rankPrivacy,
      now: T0,
    });
    expect(r.primary).toBeNull();
    expect(r.rejected[0]?.reason).toBe("no tool calling");
  });

  it("rejects endpoints whose context window is too small", () => {
    const small = ep({ provider: "small", model: "m", contextWindow: 4_000 });
    const r = routeFromPool({
      state: newPoolState([small]),
      endpoints: [small],
      request: req({ contextTokens: 20_000 }),
      privacyRank: rankPrivacy,
      now: T0,
    });
    expect(r.primary).toBeNull();
    expect(r.rejected[0]?.reason).toMatch(/context window 4000 < 20000/);
  });

  it("returns a usable choice or an explanation, never silence", () => {
    const r = routeFromPool({
      state: newPoolState([]),
      endpoints: [],
      request: req(),
      privacyRank: rankPrivacy,
      now: T0,
    });
    expect(r.primary).toBeNull();
    expect(r.explanation).toMatch(/no endpoint available/);
  });
});

describe("sticky sessions", () => {
  it("keeps a thread on one model while it is available", () => {
    const sessions = new Map<string, StickySession>();
    const first = routeFromPool({
      state: newPoolState(ALL),
      endpoints: ALL,
      request: req({ strategy: "most-reliable" }),
      privacyRank: rankPrivacy,
      now: T0,
    });
    const a = stickyChoice({ sessions, sessionId: "s1", result: first, now: T0 });
    expect(a.switched).toBe(false);

    // A different strategy would prefer another endpoint, but the pin wins.
    const second = routeFromPool({
      state: first.state,
      endpoints: ALL,
      request: req({ strategy: "cheapest" }),
      privacyRank: rankPrivacy,
      now: T0 + 60_000,
    });
    const b = stickyChoice({ sessions, sessionId: "s1", result: second, now: T0 + 60_000 });
    expect(b.switched).toBe(false);
    expect(b.session.endpointId).toBe(a.session.endpointId);
  });

  it("signals a handoff when the pinned model disappears", () => {
    const sessions = new Map<string, StickySession>();
    sessions.set("s1", {
      sessionId: "s1",
      endpointId: "groq/fast-coder",
      groupKey: "fast-coder",
      pinnedAt: T0,
    });
    const r = routeFromPool({
      state: newPoolState([PAID]),
      endpoints: [PAID],
      request: req({ mode: "paid", strategy: "most-capable" }),
      privacyRank: rankPrivacy,
      now: T0 + 1_000,
    });
    const d = stickyChoice({ sessions, sessionId: "s1", result: r, now: T0 + 1_000 });
    expect(d.switched).toBe(true);
    expect(d.handoffRequired).toBe(true);
    expect(d.session.handoffNote).toMatch(/unavailable/);
  });

  it("expires the pin after the TTL and prunes stale sessions", () => {
    const sessions = new Map<string, StickySession>();
    sessions.set("old", { sessionId: "old", endpointId: "groq/fast-coder", groupKey: "g", pinnedAt: T0 });
    const pruned = pruneSessions(sessions, T0 + STICKY_TTL_MS + 1);
    expect(pruned.size).toBe(0);
    expect(pruneSessions(sessions, T0 + STICKY_TTL_MS - 1).size).toBe(1);
  });
});

describe("reporting and compliance", () => {
  it("reports per-endpoint consumption for the cost dashboard", () => {
    let state = newPoolState([GROQ]);
    const a = tryAcquire(state, GROQ, 2_000, T0);
    if (!a.decision.ok) throw new Error("expected ok");
    state = a.state;
    const report = usageReport(state, [GROQ], T0)[0];
    expect(report?.tokensToday).toBe(2_000);
    expect(report?.monthlyShare).toBeCloseTo(2_000 / 10_000_000);
    expect(report?.keys).toBe(2);
  });

  it("flags ToS reviews older than the window", () => {
    const stale = ep({
      provider: "stale",
      model: "m",
      tos: {
        commercialUseAllowed: true,
        trainingOnInput: false,
        requiresAttribution: false,
        reviewedOn: "2025-01-01",
        source: "old review",
      },
    });
    const fresh = ep({ provider: "fresh", model: "m", tos: { ...GROQ.tos, reviewedOn: "2026-09-01" } });
    const flagged = staleTosReviews([stale, fresh], T0, 90).map((e) => e.provider);
    expect(flagged).toEqual(["stale"]);
  });

  it("flags an unparseable review date rather than trusting it", () => {
    const bad = ep({
      provider: "bad",
      model: "m",
      tos: { ...GROQ.tos, reviewedOn: "not-a-date" },
    });
    expect(staleTosReviews([bad], T0, 90)).toHaveLength(1);
  });
});

describe("immutability", () => {
  it("never mutates the state it was given", () => {
    const state = newPoolState([GROQ]);
    const before = JSON.stringify(state);
    tryAcquire(state, GROQ, 1_000, T0);
    recordFailure(state, GROQ, "g1", "rate_limited", T0);
    recordSuccess(state, GROQ, "g1", T0);
    expect(JSON.stringify(state)).toBe(before);
  });
});
