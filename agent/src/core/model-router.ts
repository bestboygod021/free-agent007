import type {
  ModelProviderCapability,
  ModelRouteChoice,
  ModelRouteRequest,
  ModelRouteResult,
  ModelTaskType,
} from "./types.js";
import {
  modeAllowsProvider,
  resolveMode,
  routingForTask,
  type ComputeMode,
  type ModeProfile,
} from "./compute-mode.js";

/**
 * Model router.
 *
 * The agent never picks a provider directly. It describes the *job*; the router
 * decides where the job may physically run, given the compute mode, workspace
 * policy, privacy level, quota and capability. This is what makes providers
 * swappable and what keeps private code off free cloud tiers.
 *
 * Filter order (each step records why a candidate was dropped, so the UI can
 * show "why not Groq?" instead of silently falling back):
 *   0. compute mode gate          (see compute-mode.ts)
 *   1. enabled
 *   2. privacy ceiling + "may train on input"
 *   3. mode's cloud privacy ceiling
 *   4. capabilities (tool calling / structured output)
 *   5. context window
 *   6. cost ceiling
 *   7. latency ceiling
 *   8. rank by (mode locality preference, cost, latency)
 */

const PRIVACY_RANK: Record<string, number> = {
  public: 0,
  internal: 1,
  private: 2,
  confidential: 3,
};

const PRIVACY_ORDER = ["public", "internal", "private", "confidential"] as const;

export interface RouterOptions {
  providers: readonly ModelProviderCapability[];
  maxFallbacks?: number;
  /**
   * The compute mode the user selected. When set, it is applied as gate 0 and
   * its cloud privacy ceiling is enforced. Omitting it means "no mode
   * constraint", which only ever happens in tests of the raw filters.
   */
  mode?: ComputeMode | ModeProfile;
}

function profileOf(mode: RouterOptions["mode"]): ModeProfile | null {
  if (!mode) return null;
  return typeof mode === "string" ? resolveMode(mode) : mode;
}

export function rankPrivacy(level: string): number {
  return PRIVACY_RANK[level] ?? 0;
}

export function routeModel(
  req: ModelRouteRequest,
  opts: RouterOptions,
): ModelRouteResult {
  const rejected: ModelRouteResult["rejected"] = [];
  const maxFallbacks = opts.maxFallbacks ?? 2;
  const required = rankPrivacy(req.privacyLevel);
  const profile = profileOf(opts.mode);

  const candidates: Array<{ cap: ModelProviderCapability; score: number }> = [];

  for (const cap of opts.providers) {
    const label = `${cap.provider}/${cap.model}`;
    void label;

    // gate 0 — the compute mode the user chose
    if (profile) {
      const verdict = modeAllowsProvider(profile, cap);
      if (!verdict.allowed) {
        rejected.push({
          provider: cap.provider,
          model: cap.model,
          reason: verdict.reason ?? `not allowed in mode "${profile.mode}"`,
        });
        continue;
      }
    }

    if (!cap.enabled) {
      rejected.push({ provider: cap.provider, model: cap.model, reason: "provider disabled" });
      continue;
    }
    if (rankPrivacy(cap.maxPrivacyLevel) < required) {
      rejected.push({
        provider: cap.provider,
        model: cap.model,
        reason: `privacy ceiling ${cap.maxPrivacyLevel} < requested ${req.privacyLevel}`,
      });
      continue;
    }
    if (
      cap.mayTrainOnInput &&
      required >= rankPrivacy("private")
    ) {
      rejected.push({
        provider: cap.provider,
        model: cap.model,
        reason: "provider may train on inputs; blocked for private/confidential workspaces",
      });
      continue;
    }
    if (
      profile &&
      cap.locality === "cloud" &&
      rankPrivacy(cap.maxPrivacyLevel) >= required &&
      required > rankPrivacy(profile.providerPolicy.maxCloudPrivacyLevel)
    ) {
      rejected.push({
        provider: cap.provider,
        model: cap.model,
        reason: `mode "${profile.mode}" caps cloud privacy at ${profile.providerPolicy.maxCloudPrivacyLevel}; workspace is ${req.privacyLevel}`,
      });
      continue;
    }
    if (req.requiresToolCalling && !cap.supportsToolCalling) {
      rejected.push({
        provider: cap.provider,
        model: cap.model,
        reason: "no tool calling support",
      });
      continue;
    }
    if (req.requiresStructuredOutput && !cap.supportsStructuredOutput) {
      rejected.push({
        provider: cap.provider,
        model: cap.model,
        reason: "no structured output support",
      });
      continue;
    }
    if (cap.contextWindow < req.contextTokens) {
      rejected.push({
        provider: cap.provider,
        model: cap.model,
        reason: `context window ${cap.contextWindow} < required ${req.contextTokens}`,
      });
      continue;
    }
    if (cap.relativeCost > req.maxCost) {
      rejected.push({
        provider: cap.provider,
        model: cap.model,
        reason: `cost ${cap.relativeCost} > budget ${req.maxCost}`,
      });
      continue;
    }
    if (cap.relativeLatencyMs > req.maxLatencyMs) {
      rejected.push({
        provider: cap.provider,
        model: cap.model,
        reason: `latency ${cap.relativeLatencyMs}ms > budget ${req.maxLatencyMs}ms`,
      });
      continue;
    }

    // Prefer local execution for sensitive work; otherwise prefer cheap + fast.
    const privacyBonus =
      required >= rankPrivacy("private") && cap.locality === "local" ? -100 : 0;
    // the compute mode's per-task table expresses a locality preference
    const preferenceBonus =
      req.preferredLocality && req.preferredLocality === cap.locality ? -5 : 0;
    candidates.push({
      cap,
      score: privacyBonus + preferenceBonus + cap.relativeCost * 10 + cap.relativeLatencyMs / 1000,
    });
  }

  candidates.sort((a, b) => a.score - b.score || a.cap.model.localeCompare(b.cap.model));

  const toChoice = (c: { cap: ModelProviderCapability }): ModelRouteChoice => ({
    provider: c.cap.provider,
    model: c.cap.model,
    locality: c.cap.locality,
    reason:
      c.cap.locality === "local"
        ? "local execution: zero API cost, data never leaves the machine"
        : `cloud tier within budget (cost=${c.cap.relativeCost}, latency=${c.cap.relativeLatencyMs}ms)`,
  });

  const [best, ...rest] = candidates;

  if (!best) {
    return {
      primary: null,
      fallbacks: [],
      rejected,
      explanation:
        "هیچ مدلی با این سیاست پیدا نشد. یا سقف هزینه/تأخیر را افزایش دهید، یا یک مدل محلی فعال کنید، یا سطح محرمانگی پروژه را بازبینی کنید.",
    };
  }

  const fallbacks = rest.slice(0, maxFallbacks).map(toChoice);

  const explanationParts = [
    profile ? `حالت محاسباتی: ${profile.labelFa}.` : "",
    `مسیر اصلی: ${best.cap.provider}/${best.cap.model} (${best.cap.locality}).`,
    `سطح محرمانگی درخواست‌شده: ${req.privacyLevel}.`,
  ].filter((x) => x.length > 0);
  if (best.cap.mayTrainOnInput) {
    explanationParts.push("هشدار: این ارائه‌دهنده ممکن است ورودی را برای بهبود مدل نگه دارد.");
  }
  if (fallbacks.length > 0) {
    explanationParts.push(
      `جایگزین‌ها: ${fallbacks.map((f) => `${f.provider}/${f.model}`).join("، ")}.`,
    );
  } else {
    explanationParts.push("جایگزینی وجود ندارد؛ اگر سهمیه تمام شود اجرا متوقف می‌شود.");
  }

  return {
    primary: toChoice(best),
    fallbacks,
    rejected,
    explanation: explanationParts.join(" "),
  };
}

/**
 * Route one task under the selected compute mode.
 *
 * This is the single call site every agent uses. The task type is looked up in
 * the mode's routing table, so switching mode changes the constraints of *every*
 * agent in the pipeline at once — planner, coder, reviewer, QA, docs — without
 * any of them knowing which mode is active.
 */
export function routeForTask(params: {
  taskType: ModelTaskType;
  mode: ComputeMode | ModeProfile;
  providers: readonly ModelProviderCapability[];
  privacyLevel: ModelRouteRequest["privacyLevel"];
  contextTokens?: number;
  maxFallbacks?: number;
}): ModelRouteResult {
  const profile = profileOf(params.mode) ?? resolveMode("free");
  const rule = routingForTask(profile, params.taskType);
  return routeModel(
    {
      taskType: params.taskType,
      privacyLevel: params.privacyLevel,
      requiresToolCalling: rule.requiresToolCalling,
      requiresStructuredOutput: rule.requiresStructuredOutput,
      contextTokens: params.contextTokens ?? rule.contextTokens,
      maxCost: rule.maxCost,
      maxLatencyMs: rule.maxLatencyMs,
      preferredLocality: rule.preferredLocality,
    },
    {
      providers: params.providers,
      mode: profile,
      maxFallbacks: params.maxFallbacks ?? profile.fallbackOrder.length,
    },
  );
}

/**
 * Quota accounting per provider. Free tiers are the fragile part of this
 * product, so the platform must be able to answer "why did we stop?" with a
 * number rather than a 429 from the vendor.
 */
export interface QuotaState {
  provider: string;
  minuteCount: number;
  dayCount: number;
}

export function newQuotaState(provider: string): QuotaState {
  return { provider, minuteCount: 0, dayCount: 0 };
}

export type QuotaDecision =
  | { ok: true; remainingMinute: number; remainingDay: number }
  | { ok: false; reason: "rpm" | "rpd"; retryAfterHint: "minute" | "day" };

export function tryConsumeQuota(
  state: QuotaState,
  cap: Pick<ModelProviderCapability, "rpm" | "rpd">,
  now = Date.now(),
  lastResetMinute = 0,
  lastResetDay = 0,
): { decision: QuotaDecision; state: QuotaState } {
  const s = { ...state };
  const minuteWindow = Math.floor(now / 60_000);
  const dayWindow = Math.floor(now / 86_400_000);
  if (minuteWindow !== lastResetMinute) {
    s.minuteCount = 0;
  }
  if (dayWindow !== lastResetDay) {
    s.dayCount = 0;
  }

  if (s.dayCount >= cap.rpd) {
    return {
      decision: { ok: false, reason: "rpd", retryAfterHint: "day" },
      state: s,
    };
  }
  if (s.minuteCount >= cap.rpm) {
    return {
      decision: { ok: false, reason: "rpm", retryAfterHint: "minute" },
      state: s,
    };
  }

  s.minuteCount += 1;
  s.dayCount += 1;
  return {
    decision: {
      ok: true,
      remainingMinute: cap.rpm - s.minuteCount,
      remainingDay: cap.rpd - s.dayCount,
    },
    state: s,
  };
}

/** Ordered privacy labels, useful for UI dropdowns and docs. */
export const PRIVACY_LEVELS = PRIVACY_ORDER;
