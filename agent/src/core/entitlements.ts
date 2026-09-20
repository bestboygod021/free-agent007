/** Mode-aware plans, quotas and entitlements. Hard gates; not billing-provider code. */

export type EntitlementMode = "free" | "paid" | "local";
export type PlanTier = "free" | "pro" | "org";

export interface EntitlementPlan {
  tier: PlanTier;
  mode: EntitlementMode;
  monthlyRuns: number;
  monthlyInputTokens: number;
  monthlyOutputTokens: number;
  maxConcurrentRuns: number;
  maxProjects: number;
  allowedFeatures: string[];
  maxCost: number;
  currency: string;
  paidProviderAllowed: boolean;
}

export interface EntitlementUsage {
  runs: number;
  inputTokens: number;
  outputTokens: number;
  concurrentRuns: number;
  projects: number;
  cost: number;
}

export interface EntitlementRequest {
  feature: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  projectsAfter: number;
  concurrentRunsAfter: number;
}

export interface EntitlementDecision {
  allowed: boolean;
  reasons: string[];
  remaining: Omit<EntitlementUsage, "concurrentRuns" | "projects"> & { concurrentSlots: number; projectSlots: number };
}

export class EntitlementContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntitlementContractError";
  }
}

function nonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new EntitlementContractError(`${label} must be non-negative`);
}

export function checkEntitlement(plan: EntitlementPlan, usage: EntitlementUsage, request: EntitlementRequest): EntitlementDecision {
  const usageValues: readonly [number, string][] = [
    [usage.runs, "runs"],
    [usage.inputTokens, "inputTokens"],
    [usage.outputTokens, "outputTokens"],
    [usage.concurrentRuns, "concurrentRuns"],
    [usage.projects, "projects"],
    [usage.cost, "cost"],
  ];
  for (const [value, label] of usageValues) nonNegative(value, label);
  const requestValues: readonly [number, string][] = [
    [request.inputTokens, "request.inputTokens"],
    [request.outputTokens, "request.outputTokens"],
    [request.cost, "request.cost"],
    [request.projectsAfter, "request.projectsAfter"],
    [request.concurrentRunsAfter, "request.concurrentRunsAfter"],
  ];
  for (const [value, label] of requestValues) nonNegative(value, label);
  if (plan.mode !== "paid" && plan.paidProviderAllowed) throw new EntitlementContractError("only paid mode may allow paid providers");
  const projected = {
    runs: usage.runs + 1,
    inputTokens: usage.inputTokens + request.inputTokens,
    outputTokens: usage.outputTokens + request.outputTokens,
    cost: usage.cost + request.cost,
  };
  const reasons: string[] = [];
  if (!plan.allowedFeatures.includes(request.feature)) reasons.push(`feature ${request.feature} is not entitled`);
  if (projected.runs > plan.monthlyRuns) reasons.push("monthly run quota exhausted");
  if (projected.inputTokens > plan.monthlyInputTokens) reasons.push("monthly input quota exhausted");
  if (projected.outputTokens > plan.monthlyOutputTokens) reasons.push("monthly output quota exhausted");
  if (request.concurrentRunsAfter > plan.maxConcurrentRuns) reasons.push("concurrency quota exhausted");
  if (request.projectsAfter > plan.maxProjects) reasons.push("project quota exhausted");
  if (projected.cost > plan.maxCost) reasons.push("cost ceiling exhausted");
  if (plan.mode === "free" && request.cost > 0) reasons.push("free mode cannot spend paid cost");
  if (plan.mode === "local" && request.cost > 0) reasons.push("local mode cannot use paid provider cost");
  return {
    allowed: reasons.length === 0,
    reasons,
    remaining: {
      runs: Math.max(0, plan.monthlyRuns - projected.runs),
      inputTokens: Math.max(0, plan.monthlyInputTokens - projected.inputTokens),
      outputTokens: Math.max(0, plan.monthlyOutputTokens - projected.outputTokens),
      cost: Math.max(0, plan.maxCost - projected.cost),
      concurrentSlots: Math.max(0, plan.maxConcurrentRuns - request.concurrentRunsAfter),
      projectSlots: Math.max(0, plan.maxProjects - request.projectsAfter),
    },
  };
}
