import type { ModelTaskType, PrivacyLevel } from "./types.js";

/**
 * Compute mode — the single switch the user flips.
 *
 * The requirement is that choosing a mode reconfigures *everything*, not just
 * which model answers. So a mode resolves into a complete `ModeProfile` that
 * drives, in one place:
 *
 *   - which providers may be used at all            (router)
 *   - how much each task type may cost / how slow it may be
 *   - whether data may leave the machine            (policy engine)
 *   - the repair budget, task parallelism, sandbox timeout
 *   - which quality gates run
 *   - which capabilities are switched off
 *   - the token budget and hard stop
 *   - what the agent is *told* (prompt variables)
 *   - what the UI shows and warns about
 *
 * Nothing downstream is allowed to guess the mode; everything reads it from the
 * resolved profile.
 */

export type ComputeMode = "free" | "paid" | "local";

export const COMPUTE_MODES: readonly ComputeMode[] = ["free", "paid", "local"];

/** Where a provider's compute comes from, as far as the mode is concerned. */
export type ProviderClass = "local" | "cloud_free" | "cloud_paid";

export interface TaskRoutingRule {
  taskType: ModelTaskType;
  /** soft preference; the mode's provider policy is the hard constraint */
  preferredLocality: "local" | "cloud";
  maxCost: number;
  requiresToolCalling: boolean;
  requiresStructuredOutput: boolean;
  contextTokens: number;
  maxLatencyMs: number;
}

export interface ModeProfile {
  mode: ComputeMode;
  labelFa: string;
  summaryFa: string;

  providerPolicy: {
    allowLocal: boolean;
    allowCloudFreeTier: boolean;
    allowPaidCloud: boolean;
    /** hard ceiling on a provider's relative cost */
    maxRelativeCost: number;
    /** never true for private/confidential work, whatever the mode says */
    allowTrainOnInput: boolean;
    /** highest workspace privacy that may use a *cloud* provider in this mode */
    maxCloudPrivacyLevel: PrivacyLevel;
    requiresCloudConsent: boolean;
    requiresByok: boolean;
  };

  fallbackOrder: readonly ProviderClass[];

  routing: Record<ModelTaskType, TaskRoutingRule>;

  budget: {
    perRunTokens: number;
    perDayTokensPerUser: number;
    hardStopTokens: number;
    maxCostPerRun: number;
  };

  execution: {
    maxRepairAttempts: number;
    maxParallelTasks: number;
    sandboxTimeoutSeconds: number;
    qualityGates: readonly string[];
    allowPreview: boolean;
    allowBrowserAutomation: boolean;
  };

  disabledCapabilities: readonly string[];
  warningsFa: readonly string[];
  upgradeHintFa: string;
}

const ALL_TASK_TYPES: readonly ModelTaskType[] = [
  "intake",
  "clarification",
  "specification",
  "planning",
  "code_generation",
  "code_edit",
  "code_review",
  "test_generation",
  "repair",
  "security_review",
  "documentation",
  "summarization",
  "embedding",
];

interface BaseRule {
  preferredLocality: "local" | "cloud";
  requiresToolCalling: boolean;
  requiresStructuredOutput: boolean;
  contextTokens: number;
}

/**
 * One table, three tunings. The *shape* of the work never changes with the
 * mode — only the budget, the latency tolerance and where it prefers to run.
 */
const BASE_RULES: Record<ModelTaskType, BaseRule> = {
  intake: { preferredLocality: "cloud", requiresToolCalling: false, requiresStructuredOutput: true, contextTokens: 8_000 },
  clarification: { preferredLocality: "cloud", requiresToolCalling: false, requiresStructuredOutput: true, contextTokens: 8_000 },
  specification: { preferredLocality: "cloud", requiresToolCalling: false, requiresStructuredOutput: true, contextTokens: 24_000 },
  planning: { preferredLocality: "cloud", requiresToolCalling: true, requiresStructuredOutput: true, contextTokens: 32_000 },
  code_generation: { preferredLocality: "cloud", requiresToolCalling: true, requiresStructuredOutput: true, contextTokens: 32_000 },
  code_edit: { preferredLocality: "cloud", requiresToolCalling: true, requiresStructuredOutput: true, contextTokens: 24_000 },
  code_review: { preferredLocality: "cloud", requiresToolCalling: false, requiresStructuredOutput: true, contextTokens: 32_000 },
  test_generation: { preferredLocality: "cloud", requiresToolCalling: true, requiresStructuredOutput: true, contextTokens: 24_000 },
  repair: { preferredLocality: "cloud", requiresToolCalling: true, requiresStructuredOutput: true, contextTokens: 24_000 },
  security_review: { preferredLocality: "cloud", requiresToolCalling: false, requiresStructuredOutput: true, contextTokens: 32_000 },
  documentation: { preferredLocality: "cloud", requiresToolCalling: false, requiresStructuredOutput: false, contextTokens: 16_000 },
  summarization: { preferredLocality: "cloud", requiresToolCalling: false, requiresStructuredOutput: false, contextTokens: 16_000 },
  embedding: { preferredLocality: "local", requiresToolCalling: false, requiresStructuredOutput: false, contextTokens: 8_000 },
};

const FULL_GATES: readonly string[] = [
  "lint",
  "typecheck",
  "build",
  "test:unit",
  "test:integration",
  "test:e2e",
  "accessibility",
  "secret-scan",
  "dependency-scan",
];

/**
 * Free mode spends other people's quota, so it is tuned to be frugal: cheaper
 * gates, fewer repair attempts, no browser automation, tighter token budget.
 */
const FREE_GATES: readonly string[] = [
  "lint",
  "typecheck",
  "build",
  "test:unit",
  "secret-scan",
  "dependency-scan",
];

/**
 * Local mode spends the user's own CPU/GPU, so tokens are free but wall-clock
 * is precious: serial execution, generous timeouts, no network dependency.
 */
const LOCAL_GATES: readonly string[] = [
  "lint",
  "typecheck",
  "build",
  "test:unit",
  "test:integration",
  "test:e2e",
  "accessibility",
  "secret-scan",
];

interface ModeTuning {
  maxCost: number;
  maxLatencyMs: number;
  latencyScale: number;
  forceLocal: boolean;
}

const TUNING: Record<ComputeMode, ModeTuning> = {
  free: { maxCost: 0, maxLatencyMs: 60_000, latencyScale: 1.5, forceLocal: false },
  paid: { maxCost: 1_000, maxLatencyMs: 20_000, latencyScale: 1, forceLocal: false },
  local: { maxCost: 0, maxLatencyMs: 180_000, latencyScale: 3, forceLocal: true },
};

function buildRouting(mode: ComputeMode): Record<ModelTaskType, TaskRoutingRule> {
  const t = TUNING[mode];
  const out = {} as Record<ModelTaskType, TaskRoutingRule>;
  for (const taskType of ALL_TASK_TYPES) {
    const base = BASE_RULES[taskType];
    // embeddings always run locally when a local runtime exists: they are
    // called constantly and are cheap to host
    const forceLocal = t.forceLocal || taskType === "embedding";
    out[taskType] = {
      taskType,
      preferredLocality: forceLocal ? "local" : base.preferredLocality,
      maxCost: t.maxCost,
      requiresToolCalling: base.requiresToolCalling,
      requiresStructuredOutput: base.requiresStructuredOutput,
      contextTokens: base.contextTokens,
      maxLatencyMs: Math.round(t.maxLatencyMs * (taskType === "embedding" ? 0.25 : 1) * (t.latencyScale === 1 ? 1 : 1)),
    };
  }
  // local inference is slower per call; give it room instead of failing
  if (t.forceLocal) {
    for (const taskType of ALL_TASK_TYPES) {
      out[taskType]!.maxLatencyMs = t.maxLatencyMs;
    }
  }
  return out;
}

const PROFILES: Record<ComputeMode, ModeProfile> = {
  free: {
    mode: "free",
    labelFa: "رایگان (سهمیه ابری + مدل محلی)",
    summaryFa:
      "از سهمیه رایگان ارائه‌دهندگان ابری و مدل محلی استفاده می‌کند. هزینه API صفر است، اما سهمیه محدود و متغیر است و وقتی تمام شود اجرا متوقف می‌شود.",
    providerPolicy: {
      allowLocal: true,
      allowCloudFreeTier: true,
      allowPaidCloud: false,
      maxRelativeCost: 0,
      allowTrainOnInput: false,
      maxCloudPrivacyLevel: "internal",
      requiresCloudConsent: true,
      requiresByok: false,
    },
    fallbackOrder: ["cloud_free", "local"],
    routing: buildRouting("free"),
    budget: {
      perRunTokens: 400_000,
      perDayTokensPerUser: 1_000_000,
      hardStopTokens: 600_000,
      maxCostPerRun: 0,
    },
    execution: {
      maxRepairAttempts: 2,
      maxParallelTasks: 2,
      sandboxTimeoutSeconds: 600,
      qualityGates: FREE_GATES,
      allowPreview: true,
      allowBrowserAutomation: false,
    },
    disabledCapabilities: ["paid_models", "browser_automation", "parallel_agents_4x"],
    warningsFa: [
      "سهمیه ارائه‌دهندگان رایگان بدون اطلاع قبلی تغییر می‌کند.",
      "برخی ارائه‌دهندگان رایگان ممکن است ورودی را برای بهبود مدل نگه دارند؛ برای داده private فقط مدل محلی استفاده می‌شود.",
      "با اتمام سهمیه، اجرا متوقف می‌شود و دلیل آن به شما نشان داده می‌شود.",
    ],
    upgradeHintFa:
      "برای سهمیه بیشتر، مدل‌های قوی‌تر و اجرای موازی، حالت پولی را انتخاب کنید یا کلید ارائه‌دهنده خودتان را وارد کنید (BYOK).",
  },

  paid: {
    mode: "paid",
    labelFa: "پولی (کلید شما یا اعتبار پلتفرم)",
    summaryFa:
      "از مدل‌های پولی با کیفیت و سرعت بالاتر استفاده می‌کند. سقف هزینه را شما تعیین می‌کنید و مصرف هر Run گزارش می‌شود.",
    providerPolicy: {
      allowLocal: true,
      allowCloudFreeTier: true,
      allowPaidCloud: true,
      maxRelativeCost: 1_000,
      allowTrainOnInput: false,
      maxCloudPrivacyLevel: "confidential",
      requiresCloudConsent: true,
      requiresByok: false,
    },
    fallbackOrder: ["cloud_paid", "cloud_free", "local"],
    routing: buildRouting("paid"),
    budget: {
      perRunTokens: 4_000_000,
      perDayTokensPerUser: 20_000_000,
      hardStopTokens: 8_000_000,
      maxCostPerRun: 1_000,
    },
    execution: {
      maxRepairAttempts: 3,
      maxParallelTasks: 4,
      sandboxTimeoutSeconds: 1_800,
      qualityGates: FULL_GATES,
      allowPreview: true,
      allowBrowserAutomation: true,
    },
    disabledCapabilities: [],
    warningsFa: [
      "هزینه بر اساس مصرف واقعی محاسبه می‌شود؛ سقف هر Run در تنظیمات Workspace تعیین می‌شود.",
      "وقتی سقف هزینه برسید، اجرا متوقف می‌شود — نه اینکه ساکت ادامه دهد.",
    ],
    upgradeHintFa: "برای حذف کامل خروج داده از دستگاه، حالت لوکال را انتخاب کنید.",
  },

  local: {
    mode: "local",
    labelFa: "لوکال (اجرا روی دستگاه شما)",
    summaryFa:
      "همه استنتاج روی دستگاه خودتان انجام می‌شود. هیچ کدی از دستگاه خارج نمی‌شود و هزینه API صفر است؛ در عوض سرعت و کیفیت به سخت‌افزار شما وابسته است.",
    providerPolicy: {
      allowLocal: true,
      allowCloudFreeTier: false,
      allowPaidCloud: false,
      maxRelativeCost: 0,
      allowTrainOnInput: false,
      maxCloudPrivacyLevel: "public",
      requiresCloudConsent: false,
      requiresByok: false,
    },
    fallbackOrder: ["local"],
    routing: buildRouting("local"),
    budget: {
      perRunTokens: 2_000_000,
      perDayTokensPerUser: 20_000_000,
      hardStopTokens: 3_000_000,
      maxCostPerRun: 0,
    },
    execution: {
      maxRepairAttempts: 3,
      // one machine, one GPU: running agents in parallel only thrashes it
      maxParallelTasks: 1,
      sandboxTimeoutSeconds: 3_600,
      qualityGates: LOCAL_GATES,
      allowPreview: true,
      allowBrowserAutomation: true,
    },
    disabledCapabilities: ["cloud_inference", "managed_embedding", "hosted_preview_cdn"],
    warningsFa: [
      "سرعت و کیفیت خروجی به RAM و GPU دستگاه شما وابسته است.",
      "هیچ fallback ابری وجود ندارد؛ اگر مدل محلی در دسترس نباشد، اجرا متوقف می‌شود.",
      "اجرای موازی برای جلوگیری از اشباع منابع دستگاه غیرفعال است.",
    ],
    upgradeHintFa:
      "برای سرعت بیشتر بدون خروج کد از دستگاه، یک مدل محلی بزرگ‌تر یا GPU قوی‌تر استفاده کنید.",
  },
};

/**
 * Resolve the mode into the complete configuration the rest of the system uses.
 * `overrides` lets a workspace tighten a profile but never loosen the provider
 * policy beyond what the mode allows.
 */
export function resolveMode(
  mode: ComputeMode,
  overrides: Partial<ModeProfile["budget"]> = {},
): ModeProfile {
  const base = PROFILES[mode];
  if (Object.keys(overrides).length === 0) return base;
  return {
    ...base,
    budget: {
      ...base.budget,
      ...overrides,
      // a user may lower the ceiling, never raise it above the mode's own
      maxCostPerRun: Math.min(
        overrides.maxCostPerRun ?? base.budget.maxCostPerRun,
        base.budget.maxCostPerRun,
      ),
    },
  };
}

export function isComputeMode(value: unknown): value is ComputeMode {
  return typeof value === "string" && (COMPUTE_MODES as readonly string[]).includes(value);
}

export function classifyProvider(p: {
  locality: "local" | "cloud";
  relativeCost: number;
}): ProviderClass {
  if (p.locality === "local") return "local";
  return p.relativeCost > 0 ? "cloud_paid" : "cloud_free";
}

/**
 * Mode gate — runs *before* every other router filter. A provider the mode does
 * not allow is not a candidate, whatever its price or capability.
 */
export function modeAllowsProvider(
  profile: ModeProfile,
  p: { locality: "local" | "cloud"; relativeCost: number; mayTrainOnInput: boolean },
): { allowed: boolean; reason?: string } {
  const cls = classifyProvider(p);
  const policy = profile.providerPolicy;

  // Checked first on purpose: this one is absolute in every mode, and telling
  // the user "this provider may train on your code" is more useful than
  // telling them the mode was wrong.
  if (p.mayTrainOnInput && !policy.allowTrainOnInput) {
    return {
      allowed: false,
      reason: `mode "${profile.mode}" never routes to a provider that may train on inputs`,
    };
  }

  if (cls === "local" && !policy.allowLocal) {
    return { allowed: false, reason: `mode "${profile.mode}" does not allow local providers` };
  }
  if (cls === "cloud_free" && !policy.allowCloudFreeTier) {
    return {
      allowed: false,
      reason: `mode "${profile.mode}" does not allow free cloud tiers`,
    };
  }
  if (cls === "cloud_paid" && !policy.allowPaidCloud) {
    return {
      allowed: false,
      reason: `mode "${profile.mode}" does not allow paid providers`,
    };
  }
  if (p.relativeCost > policy.maxRelativeCost) {
    return {
      allowed: false,
      reason: `cost ${p.relativeCost} exceeds the "${profile.mode}" mode ceiling ${policy.maxRelativeCost}`,
    };
  }
  return { allowed: true };
}

export interface ModeSelectionInput {
  mode: ComputeMode;
  privacyLevel: PrivacyLevel;
  /** is a local runtime (Ollama) reachable? */
  hasLocalRuntime: boolean;
  /** does the workspace have a usable key or billing for paid providers? */
  hasPaidAccess: boolean;
}

export interface ModeSelectionVerdict {
  ok: boolean;
  problems: string[];
  /** what the system will actually run if the selection is not viable */
  effectiveMode: ComputeMode;
  warningsFa: string[];
}

const PRIVACY_RANK: Record<PrivacyLevel, number> = {
  public: 0,
  internal: 1,
  private: 2,
  confidential: 3,
};

/**
 * Pre-flight check shown in the UI *before* a run starts, so the user learns
 * "free mode cannot handle a confidential workspace" at selection time rather
 * than ten minutes into a run.
 */
export function validateModeSelection(input: ModeSelectionInput): ModeSelectionVerdict {
  const profile = resolveMode(input.mode);
  const problems: string[] = [];
  const warnings = [...profile.warningsFa];
  let effectiveMode: ComputeMode = input.mode;

  if (input.mode === "local" && !input.hasLocalRuntime) {
    problems.push(
      "حالت لوکال انتخاب شده اما هیچ مدل محلی در دسترس نیست. Ollama را نصب و یک مدل کدنویسی دانلود کنید.",
    );
    effectiveMode = input.hasPaidAccess ? "paid" : "free";
  }

  if (input.mode === "paid" && !input.hasPaidAccess) {
    problems.push(
      "حالت پولی انتخاب شده اما نه کلید ارائه‌دهنده (BYOK) ثبت شده و نه اعتباری وجود دارد.",
    );
    effectiveMode = input.hasLocalRuntime ? "local" : "free";
  }

  const cloudCeiling = PRIVACY_RANK[profile.providerPolicy.maxCloudPrivacyLevel];
  const required = PRIVACY_RANK[input.privacyLevel];
  if (input.mode !== "local" && required > cloudCeiling) {
    warnings.push(
      `سطح محرمانگی "${input.privacyLevel}" بالاتر از سقف ابری این حالت است؛ بخش‌های حساس فقط روی مدل محلی اجرا می‌شوند.`,
    );
    if (!input.hasLocalRuntime) {
      problems.push(
        `سطح محرمانگی "${input.privacyLevel}" با نبود مدل محلی در این حالت قابل اجرا نیست. یا حالت لوکال را فعال کنید یا سطح محرمانگی را کاهش دهید.`,
      );
    }
  }

  return {
    ok: problems.length === 0,
    problems,
    effectiveMode,
    warningsFa: warnings,
  };
}

/** Human-readable one-paragraph explanation, safe to render in the UI. */
export function describeModeFa(profile: ModeProfile): string {
  const gates = profile.execution.qualityGates.join("، ");
  return [
    `حالت: ${profile.labelFa}.`,
    profile.summaryFa,
    `بودجه هر اجرا: ${profile.budget.perRunTokens.toLocaleString("fa-IR")} توکن، توقف سخت در ${profile.budget.hardStopTokens.toLocaleString("fa-IR")}.`,
    `حداکثر تلاش تعمیر: ${profile.execution.maxRepairAttempts}؛ حداکثر تسک موازی: ${profile.execution.maxParallelTasks}.`,
    `دروازه‌های کیفیت: ${gates}.`,
    profile.disabledCapabilities.length > 0
      ? `غیرفعال در این حالت: ${profile.disabledCapabilities.join("، ")}.`
      : "هیچ قابلیتی در این حالت غیرفعال نیست.",
  ].join(" ");
}

/**
 * Turn a task type into the exact routing constraints this mode imposes. This
 * is the function that makes "everything follows the mode" true for every
 * agent call, not just the first one.
 */
export function routingForTask(profile: ModeProfile, taskType: ModelTaskType): TaskRoutingRule {
  return profile.routing[taskType];
}

export { ALL_TASK_TYPES };
