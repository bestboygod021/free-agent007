import { describeModeFa, resolveMode, type ComputeMode } from "./compute-mode.js";
import type { PromptVars } from "./prompt-library.js";
import type { PrivacyLevel } from "./types.js";

/**
 * Bridge between the compute mode and the prompt library.
 *
 * One call turns the user's selection into the exact set of values every agent
 * prompt is rendered with. This is what makes the switch *global*: the planner,
 * the coder, the QA agent and the docs agent all read the same numbers from the
 * same resolved profile, so they cannot disagree about the budget, the repair
 * limit or whether data may leave the machine.
 */
export function promptVarsForMode(
  mode: ComputeMode,
  opts: { privacyLevel?: PrivacyLevel; budgetOverride?: { maxCostPerRun?: number } } = {},
): PromptVars {
  const profile = resolveMode(
    mode,
    opts.budgetOverride?.maxCostPerRun !== undefined
      ? { maxCostPerRun: opts.budgetOverride.maxCostPerRun }
      : {},
  );
  const policy = profile.providerPolicy;

  return {
    computeMode: profile.mode,
    computeModeLabelFa: profile.labelFa,
    computeModeSummaryFa: describeModeFa(profile),
    modelLocality:
      policy.allowCloudFreeTier || policy.allowPaidCloud ? "local یا cloud" : "فقط local",
    allowCloudEgress: policy.allowCloudFreeTier || policy.allowPaidCloud ? "true" : "false",
    maxCostPerRun: String(profile.budget.maxCostPerRun),
    perRunTokenBudget: String(profile.budget.perRunTokens),
    hardStopTokens: String(profile.budget.hardStopTokens),
    maxRepairAttempts: String(profile.execution.maxRepairAttempts),
    maxParallelTasks: String(profile.execution.maxParallelTasks),
    qualityGates: profile.execution.qualityGates.join(", "),
    disabledCapabilities:
      profile.disabledCapabilities.length > 0
        ? profile.disabledCapabilities.join(", ")
        : "هیچ",
    warningsFa: profile.warningsFa.join(" "),
    privacyLevel: opts.privacyLevel ?? "private",
  };
}
