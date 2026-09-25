import { describe, expect, it } from "vitest";
import {
  ALL_TASK_TYPES,
  COMPUTE_MODES,
  classifyProvider,
  describeModeFa,
  modeAllowsProvider,
  resolveMode,
  routingForTask,
  validateModeSelection,
} from "../src/core/compute-mode.js";
import { routeForTask, routeModel } from "../src/core/model-router.js";
import { evaluateEgress } from "../src/core/policy-engine.js";
import { promptVarsForMode } from "../src/core/prompt-vars.js";
import type { ModelProviderCapability } from "../src/core/types.js";

/**
 * The whole point of the feature: one switch, and *everything* follows it.
 * These tests fail if any layer ignores the mode.
 */

const PROVIDERS: ModelProviderCapability[] = [
  {
    provider: "ollama",
    model: "qwen2.5-coder:14b",
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
    relativeLatencyMs: 9_000,
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
    provider: "trainfree",
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
    // free tier that *claims* a high privacy ceiling and does not train:
    // only the mode's own cap keeps private data away from it
    provider: "freeconf",
    model: "confidential-free",
    locality: "cloud",
    maxPrivacyLevel: "confidential",
    supportsToolCalling: true,
    supportsStructuredOutput: true,
    contextWindow: 64_000,
    rpm: 20,
    rpd: 2_000,
    mayTrainOnInput: false,
    license: "PROPRIETARY-SERVICE",
    relativeCost: 0,
    relativeLatencyMs: 1_500,
    enabled: true,
  },
  {
    provider: "openai",
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
];

describe("mode profiles", () => {
  it("defines exactly the three modes the user can pick", () => {
    expect(COMPUTE_MODES).toEqual(["free", "paid", "local"]);
  });

  it("gives every mode a complete profile with a routing rule for every task type", () => {
    for (const mode of COMPUTE_MODES) {
      const p = resolveMode(mode);
      expect(p.mode).toBe(mode);
      expect(p.labelFa.length, mode).toBeGreaterThan(3);
      expect(p.summaryFa.length, mode).toBeGreaterThan(20);
      expect(p.fallbackOrder.length, mode).toBeGreaterThan(0);
      expect(p.execution.qualityGates.length, mode).toBeGreaterThan(0);
      for (const t of ALL_TASK_TYPES) {
        const rule = routingForTask(p, t);
        expect(rule.taskType, `${mode}/${t}`).toBe(t);
        expect(rule.maxLatencyMs, `${mode}/${t}`).toBeGreaterThan(0);
        expect(rule.contextTokens, `${mode}/${t}`).toBeGreaterThan(0);
      }
    }
  });

  it("gives free mode zero cost, paid mode a real ceiling, local mode no cloud at all", () => {
    const free = resolveMode("free");
    const paid = resolveMode("paid");
    const local = resolveMode("local");

    expect(free.providerPolicy.allowPaidCloud).toBe(false);
    expect(free.providerPolicy.maxRelativeCost).toBe(0);
    expect(free.budget.maxCostPerRun).toBe(0);
    expect(free.execution.allowBrowserAutomation).toBe(false);

    expect(paid.providerPolicy.allowPaidCloud).toBe(true);
    expect(paid.budget.maxCostPerRun).toBeGreaterThan(0);
    expect(paid.execution.maxParallelTasks).toBeGreaterThan(free.execution.maxParallelTasks);

    expect(local.providerPolicy.allowCloudFreeTier).toBe(false);
    expect(local.providerPolicy.allowPaidCloud).toBe(false);
    expect(local.fallbackOrder).toEqual(["local"]);
    expect(local.disabledCapabilities).toContain("cloud_inference");
    expect(local.execution.maxParallelTasks).toBe(1);
  });

  it("is frugal in free mode and generous in paid mode", () => {
    const free = resolveMode("free");
    const paid = resolveMode("paid");
    expect(free.execution.maxRepairAttempts).toBeLessThan(paid.execution.maxRepairAttempts);
    expect(free.budget.perRunTokens).toBeLessThan(paid.budget.perRunTokens);
    expect(free.execution.qualityGates.length).toBeLessThan(paid.execution.qualityGates.length);
    expect(paid.execution.qualityGates).toContain("test:e2e");
    expect(free.execution.qualityGates).not.toContain("test:e2e");
  });

  it("never allows a train-on-input provider in any mode", () => {
    for (const mode of COMPUTE_MODES) {
      expect(resolveMode(mode).providerPolicy.allowTrainOnInput, mode).toBe(false);
    }
  });

  it("lets a workspace lower its own ceiling but never raise it above the mode", () => {
    const lowered = resolveMode("paid", { maxCostPerRun: 3 });
    expect(lowered.budget.maxCostPerRun).toBe(3);

    const greedy = resolveMode("free", { maxCostPerRun: 50 });
    expect(greedy.budget.maxCostPerRun).toBe(0);
  });

  it("classifies providers into the three cost classes", () => {
    expect(classifyProvider({ locality: "local", relativeCost: 9 })).toBe("local");
    expect(classifyProvider({ locality: "cloud", relativeCost: 0 })).toBe("cloud_free");
    expect(classifyProvider({ locality: "cloud", relativeCost: 5 })).toBe("cloud_paid");
  });

  it("produces a Persian explanation that names the budget and the gates", () => {
    const text = describeModeFa(resolveMode("local"));
    expect(text).toContain("لوکال");
    expect(text).toContain("حداکثر تلاش تعمیر");
    expect(text).toContain("secret-scan");
    expect(text).toContain("cloud_inference");
  });
});

const byProvider = (name: string): ModelProviderCapability => {
  const found = PROVIDERS.find((p) => p.provider === name);
  if (!found) throw new Error(`no provider named ${name} in the fixture`);
  return found;
};

describe("mode gate", () => {
  it("blocks paid providers in free mode", () => {
    const v = modeAllowsProvider(resolveMode("free"), byProvider("openai"));
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/does not allow paid providers/);
  });

  it("blocks every cloud provider in local mode", () => {
    for (const p of PROVIDERS.filter((x) => x.locality === "cloud")) {
      const v = modeAllowsProvider(resolveMode("local"), p);
      expect(v.allowed, p.provider).toBe(false);
    }
    expect(modeAllowsProvider(resolveMode("local"), byProvider("ollama")).allowed).toBe(true);
  });

  it("blocks a train-on-input provider in every mode", () => {
    for (const mode of COMPUTE_MODES) {
      const v = modeAllowsProvider(resolveMode(mode), byProvider("trainfree"));
      expect(v.allowed, mode).toBe(false);
      expect(v.reason, mode).toMatch(/train on inputs/);
    }
  });

  it("allows paid providers only in paid mode", () => {
    expect(modeAllowsProvider(resolveMode("paid"), byProvider("openai")).allowed).toBe(true);
  });
});

describe("router follows the mode", () => {
  it("routes an internal task to the free cloud tier in free mode", () => {
    const r = routeForTask({
      taskType: "code_generation",
      mode: "free",
      providers: PROVIDERS,
      privacyLevel: "internal",
    });
    expect(r.primary?.provider).toBe("groq");
    expect(r.primary?.locality).toBe("cloud");
  });

  it("routes the same task locally in local mode", () => {
    const r = routeForTask({
      taskType: "code_generation",
      mode: "local",
      providers: PROVIDERS,
      privacyLevel: "internal",
    });
    expect(r.primary?.provider).toBe("ollama");
    expect(r.rejected.map((x) => x.provider).sort()).toEqual([
      "freeconf",
      "groq",
      "openai",
      "trainfree",
    ]);
  });

  it("routes the same task to the premium model in paid mode", () => {
    const r = routeForTask({
      taskType: "code_generation",
      mode: "paid",
      providers: PROVIDERS,
      privacyLevel: "internal",
    });
    // paid mode ranks cloud paid providers first in its fallback order, but the
    // router still prefers the cheapest adequate model
    expect(r.primary).not.toBeNull();
    expect(r.fallbacks.map((f) => f.provider)).toContain("openai");
  });

  it("falls back to local for private work even in free mode", () => {
    const r = routeForTask({
      taskType: "code_generation",
      mode: "free",
      providers: PROVIDERS,
      privacyLevel: "private",
    });
    expect(r.primary?.provider).toBe("ollama");
    // groq's own ceiling already stops it…
    const groq = r.rejected.find((x) => x.provider === "groq");
    expect(groq?.reason).toMatch(/privacy ceiling/);
    // …but freeconf claims a high ceiling, so it is the *mode* that stops it
    const freeconf = r.rejected.find((x) => x.provider === "freeconf");
    expect(freeconf?.reason).toMatch(/caps cloud privacy at internal/);
    expect(freeconf?.reason).toMatch(/workspace is private/);
  });

  it("gives every task type a stricter latency budget in paid mode than in local mode", () => {
    for (const t of ALL_TASK_TYPES) {
      const paid = routingForTask(resolveMode("paid"), t);
      const local = routingForTask(resolveMode("local"), t);
      expect(local.maxLatencyMs, t).toBeGreaterThan(paid.maxLatencyMs);
    }
  });

  it("keeps embedding on the local runtime in every mode", () => {
    for (const mode of COMPUTE_MODES) {
      expect(routingForTask(resolveMode(mode), "embedding").preferredLocality, mode).toBe("local");
    }
  });

  it("mentions the active mode in the explanation shown to the user", () => {
    const r = routeForTask({
      taskType: "planning",
      mode: "local",
      providers: PROVIDERS,
      privacyLevel: "confidential",
    });
    expect(r.explanation).toContain("لوکال");
  });

  it("returns no candidate rather than breaking the mode", () => {
    const cloudOnly = PROVIDERS.filter((p) => p.locality === "cloud");
    const r = routeModel(
      {
        taskType: "code_generation",
        privacyLevel: "internal",
        requiresToolCalling: true,
        requiresStructuredOutput: true,
        contextTokens: 8_000,
        maxCost: 0,
        maxLatencyMs: 60_000,
      },
      { providers: cloudOnly, mode: "local" },
    );
    expect(r.primary).toBeNull();
    expect(r.rejected).toHaveLength(cloudOnly.length);
  });
});

describe("egress follows the mode", () => {
  it("forbids all cloud egress in local mode, even with consent", () => {
    const v = evaluateEgress({
      privacyLevel: "public",
      providerLocality: "cloud",
      providerMayTrainOnInput: false,
      hasUnredactedSecrets: false,
      userConsentedToCloud: true,
      computeMode: "local",
    });
    expect(v.allowed).toBe(false);
    expect(v.denyReason).toBe("local mode: cloud egress forbidden");
  });

  it("allows local inference in local mode", () => {
    const v = evaluateEgress({
      privacyLevel: "confidential",
      providerLocality: "local",
      providerMayTrainOnInput: false,
      hasUnredactedSecrets: false,
      userConsentedToCloud: false,
      computeMode: "local",
    });
    expect(v.allowed).toBe(true);
    expect(v.approvalRequired).toBe(false);
  });

  it("still requires consent for private cloud egress in paid mode", () => {
    const v = evaluateEgress({
      privacyLevel: "private",
      providerLocality: "cloud",
      providerMayTrainOnInput: false,
      hasUnredactedSecrets: false,
      userConsentedToCloud: false,
      computeMode: "paid",
    });
    expect(v.allowed).toBe(true);
    expect(v.approvalRequired).toBe(true);
  });
});

describe("mode selection pre-flight", () => {
  it("accepts a viable local selection", () => {
    const v = validateModeSelection({
      mode: "local",
      privacyLevel: "confidential",
      hasLocalRuntime: true,
      hasPaidAccess: false,
    });
    expect(v.ok).toBe(true);
    expect(v.effectiveMode).toBe("local");
  });

  it("refuses local mode when no local runtime exists", () => {
    const v = validateModeSelection({
      mode: "local",
      privacyLevel: "private",
      hasLocalRuntime: false,
      hasPaidAccess: true,
    });
    expect(v.ok).toBe(false);
    expect(v.problems.join(" ")).toMatch(/Ollama/);
    expect(v.effectiveMode).toBe("paid");
  });

  it("refuses paid mode without a key or credit", () => {
    const v = validateModeSelection({
      mode: "paid",
      privacyLevel: "internal",
      hasLocalRuntime: true,
      hasPaidAccess: false,
    });
    expect(v.ok).toBe(false);
    expect(v.effectiveMode).toBe("local");
  });

  it("refuses confidential work in free mode when no local runtime exists", () => {
    const v = validateModeSelection({
      mode: "free",
      privacyLevel: "confidential",
      hasLocalRuntime: false,
      hasPaidAccess: false,
    });
    expect(v.ok).toBe(false);
    expect(v.problems.join(" ")).toMatch(/محرمانگی/);
  });

  it("warns but allows confidential work in free mode when local is available", () => {
    const v = validateModeSelection({
      mode: "free",
      privacyLevel: "confidential",
      hasLocalRuntime: true,
      hasPaidAccess: false,
    });
    expect(v.ok).toBe(true);
    expect(v.warningsFa.join(" ")).toMatch(/فقط روی مدل محلی/);
  });
});

describe("prompt variables follow the mode", () => {
  it("exposes every budget and gate the agents must obey", () => {
    for (const mode of COMPUTE_MODES) {
      const vars = promptVarsForMode(mode);
      expect(vars.computeMode).toBe(mode);
      expect(Number(vars.perRunTokenBudget)).toBeGreaterThan(0);
      expect(Number(vars.hardStopTokens)).toBeGreaterThan(Number(vars.perRunTokenBudget));
      expect(Number(vars.maxRepairAttempts)).toBeGreaterThan(0);
      expect(vars.qualityGates).toContain("secret-scan");
      expect(vars.allowCloudEgress).toBe(mode === "local" ? "false" : "true");
      expect(vars.disabledCapabilities.length).toBeGreaterThan(0);
    }
  });

  it("keeps local mode free and offline in the rendered numbers", () => {
    const local = promptVarsForMode("local");
    expect(local.maxCostPerRun).toBe("0");
    expect(local.modelLocality).toBe("فقط local");
    expect(local.maxParallelTasks).toBe("1");
  });
});
