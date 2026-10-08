import { describe, expect, it } from "vitest";
import {
  newQuotaState,
  routeModel,
  tryConsumeQuota,
} from "../src/core/model-router.js";
import type { ModelProviderCapability, ModelRouteRequest } from "../src/core/types.js";

const PROVIDERS: ModelProviderCapability[] = [
  {
    provider: "ollama",
    model: "local-coder",
    locality: "local",
    maxPrivacyLevel: "confidential",
    supportsToolCalling: true,
    supportsStructuredOutput: true,
    contextWindow: 32_000,
    rpm: 10_000,
    rpd: 1_000_000,
    mayTrainOnInput: false,
    license: "Apache-2.0",
    relativeCost: 0,
    relativeLatencyMs: 4_000,
    enabled: true,
  },
  {
    provider: "groq",
    model: "fast-coder",
    locality: "cloud",
    maxPrivacyLevel: "internal",
    supportsToolCalling: true,
    supportsStructuredOutput: true,
    contextWindow: 128_000,
    rpm: 30,
    rpd: 14_400,
    mayTrainOnInput: false,
    license: "PROPRIETARY-SERVICE",
    relativeCost: 0,
    relativeLatencyMs: 900,
    enabled: true,
  },
  {
    provider: "freecloud",
    model: "train-on-input",
    locality: "cloud",
    maxPrivacyLevel: "confidential",
    supportsToolCalling: true,
    supportsStructuredOutput: true,
    contextWindow: 128_000,
    rpm: 10,
    rpd: 100,
    mayTrainOnInput: true,
    license: "PROPRIETARY-SERVICE",
    relativeCost: 0,
    relativeLatencyMs: 1_200,
    enabled: true,
  },
  {
    provider: "paid",
    model: "premium-coder",
    locality: "cloud",
    maxPrivacyLevel: "confidential",
    supportsToolCalling: true,
    supportsStructuredOutput: true,
    contextWindow: 200_000,
    rpm: 600,
    rpd: 100_000,
    mayTrainOnInput: false,
    license: "PROPRIETARY-SERVICE",
    relativeCost: 5,
    relativeLatencyMs: 2_000,
    enabled: true,
  },
  {
    provider: "disabled",
    model: "whatever",
    locality: "cloud",
    maxPrivacyLevel: "confidential",
    supportsToolCalling: true,
    supportsStructuredOutput: true,
    contextWindow: 32_000,
    rpm: 10,
    rpd: 10,
    mayTrainOnInput: false,
    license: "MIT",
    relativeCost: 0,
    relativeLatencyMs: 100,
    enabled: false,
  },
];

const base: ModelRouteRequest = {
  taskType: "code_generation",
  privacyLevel: "private",
  requiresToolCalling: true,
  requiresStructuredOutput: true,
  contextTokens: 24_000,
  maxCost: 0,
  maxLatencyMs: 30_000,
};

describe("model router", () => {
  it("routes private work to the local model and never to a training provider", () => {
    const r = routeModel(base, { providers: PROVIDERS });
    expect(r.primary?.provider).toBe("ollama");
    expect(r.primary?.locality).toBe("local");

    const rejectedTraining = r.rejected.find((x) => x.provider === "freecloud");
    expect(rejectedTraining?.reason).toMatch(/may train on inputs/);

    const rejectedPrivacy = r.rejected.find((x) => x.provider === "groq");
    expect(rejectedPrivacy?.reason).toMatch(/privacy ceiling/);
  });

  it("prefers the cheapest cloud tier when the workspace is internal", () => {
    const r = routeModel({ ...base, privacyLevel: "internal" }, { providers: PROVIDERS });
    expect(r.primary?.provider).toBe("groq");
    expect(r.fallbacks.length).toBeGreaterThan(0);
  });

  it("drops providers that cannot do tool calling", () => {
    const noTools = PROVIDERS.map((p) =>
      p.provider === "groq" ? { ...p, supportsToolCalling: false } : p,
    );
    const r = routeModel({ ...base, privacyLevel: "internal" }, { providers: noTools });
    expect(r.rejected.some((x) => x.provider === "groq" && /tool calling/.test(x.reason))).toBe(true);
  });

  it("drops providers whose context window is too small and says so", () => {
    const r = routeModel({ ...base, contextTokens: 500_000 }, { providers: PROVIDERS });
    expect(r.primary).toBeNull();
    expect(r.fallbacks).toEqual([]);
    expect(r.rejected).toHaveLength(PROVIDERS.length);
    expect(r.rejected.filter((x) => /context window/.test(x.reason)).map((x) => x.provider)).toEqual([
      "ollama",
      "paid",
    ]);
    expect(r.explanation).toContain("هیچ مدلی");
  });

  it("respects a zero-cost budget", () => {
    const r = routeModel({ ...base, privacyLevel: "internal", maxCost: 0 }, { providers: PROVIDERS });
    expect(r.rejected.some((x) => x.provider === "paid" && /budget/.test(x.reason))).toBe(true);
  });

  it("explains the choice in Persian for the UI", () => {
    const r = routeModel(base, { providers: PROVIDERS });
    expect(r.explanation).toContain("ollama/local-coder");
    expect(r.explanation).toContain("private");
  });

  it("never returns a disabled provider", () => {
    const r = routeModel(base, { providers: PROVIDERS });
    expect(r.primary?.provider).not.toBe("disabled");
    expect(r.rejected.some((x) => x.provider === "disabled" && /disabled/.test(x.reason))).toBe(true);
  });
});

describe("quota accounting", () => {
  it("enforces requests-per-minute and then reports why it stopped", () => {
    const cap = { rpm: 3, rpd: 100 };
    let state = newQuotaState("groq");
    const t0 = 0;
    for (let i = 0; i < 3; i++) {
      const r = tryConsumeQuota(state, cap, t0, 0, 0);
      expect(r.decision.ok).toBe(true);
      state = r.state;
    }
    const blocked = tryConsumeQuota(state, cap, t0, 0, 0);
    expect(blocked.decision.ok).toBe(false);
    if (!blocked.decision.ok) {
      expect(blocked.decision.reason).toBe("rpm");
      expect(blocked.decision.retryAfterHint).toBe("minute");
    }
  });

  it("resets the minute window but keeps the daily counter", () => {
    const cap = { rpm: 1, rpd: 2 };
    let state = newQuotaState("groq");
    let r = tryConsumeQuota(state, cap, 0, 0, 0);
    state = r.state;
    r = tryConsumeQuota(state, cap, 60_000, 0, 0);
    expect(r.decision.ok).toBe(true);
    state = r.state;
    r = tryConsumeQuota(state, cap, 120_000, 0, 0);
    expect(r.decision.ok).toBe(false);
    if (!r.decision.ok) expect(r.decision.reason).toBe("rpd");
  });
});
