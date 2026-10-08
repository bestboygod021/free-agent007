/** Circuit, SLO, budget, quota and restore planning. It does not call providers or restore storage. */

export type CircuitState = "closed" | "open" | "half_open";

export interface ProviderCircuit {
  providerId: string;
  state: CircuitState;
  failures: number;
  openedAt?: number;
  cooldownMs: number;
}

export interface RunBudget {
  maxCost: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  projectedCost: number;
  projectedInputTokens: number;
  projectedOutputTokens: number;
}

export interface QuotaEndpoint {
  endpointId: string;
  providerId: string;
  remainingRequests: number;
  remainingTokens: number;
  cooldownUntil?: number;
  healthy: boolean;
}

export interface SloWindow {
  targetAvailability: number;
  observedAvailability: number;
  targetLatencyMs: number;
  observedP95LatencyMs: number;
  errorBudgetRemaining: number;
}

export interface RestorePlan {
  backupId: string;
  targetEnvironment: "isolated" | "staging" | "production";
  tenantScope: string;
  expectedRpoMs: number;
  expectedRtoMs: number;
  requiresApproval: true;
  steps: string[];
  planHash: string;
}

export interface OperationsDecision {
  allowed: boolean;
  reasons: string[];
  decisionHash: string;
}

export class ResilienceOperationsContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResilienceOperationsContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function decidePreRunBudget(budget: RunBudget): OperationsDecision {
  const reasons: string[] = [];
  if ([budget.maxCost, budget.maxInputTokens, budget.maxOutputTokens, budget.projectedCost, budget.projectedInputTokens, budget.projectedOutputTokens].some((value) => !Number.isFinite(value) || value < 0)) throw new ResilienceOperationsContractError("budget values must be non-negative");
  if (budget.projectedCost > budget.maxCost) reasons.push("projected cost exceeds budget");
  if (budget.projectedInputTokens > budget.maxInputTokens) reasons.push("projected input tokens exceed budget");
  if (budget.projectedOutputTokens > budget.maxOutputTokens) reasons.push("projected output tokens exceed budget");
  return { allowed: reasons.length === 0, reasons, decisionHash: hash(JSON.stringify({ budget, reasons })) };
}

export function transitionCircuit(circuit: ProviderCircuit, now: number, success: boolean): ProviderCircuit {
  if (!Number.isFinite(now) || now < 0 || circuit.cooldownMs < 0) throw new ResilienceOperationsContractError("invalid circuit time");
  if (success) return { ...circuit, state: "closed", failures: 0, openedAt: undefined };
  if (circuit.state === "open" && circuit.openedAt !== undefined && now - circuit.openedAt < circuit.cooldownMs) return structuredClone(circuit);
  return { ...circuit, state: "open", failures: circuit.failures + 1, openedAt: now };
}

export function chooseQuotaEndpoint(endpoints: readonly QuotaEndpoint[], now: number): string | undefined {
  return [...endpoints]
    .filter((endpoint) => endpoint.healthy && endpoint.remainingRequests > 0 && endpoint.remainingTokens > 0 && (endpoint.cooldownUntil === undefined || now >= endpoint.cooldownUntil))
    .sort((a, b) => b.remainingTokens - a.remainingTokens || a.endpointId.localeCompare(b.endpointId))[0]?.endpointId;
}

export function evaluateSlo(window: SloWindow): OperationsDecision {
  const reasons: string[] = [];
  if (window.observedAvailability < window.targetAvailability) reasons.push("availability SLO is violated");
  if (window.observedP95LatencyMs > window.targetLatencyMs) reasons.push("latency SLO is violated");
  if (window.errorBudgetRemaining < 0) reasons.push("error budget is exhausted");
  return { allowed: reasons.length === 0, reasons, decisionHash: hash(JSON.stringify({ window, reasons })) };
}

export function planRestore(input: Omit<RestorePlan, "planHash" | "requiresApproval">): RestorePlan {
  if (!input.backupId.trim() || !input.tenantScope.trim()) throw new ResilienceOperationsContractError("backup and tenant scope are required");
  if (input.expectedRpoMs < 0 || input.expectedRtoMs < 0 || !Number.isFinite(input.expectedRpoMs) || !Number.isFinite(input.expectedRtoMs)) throw new ResilienceOperationsContractError("RPO/RTO must be non-negative");
  if (input.targetEnvironment === "production" && !input.steps.includes("human approval")) throw new ResilienceOperationsContractError("production restore requires human approval");
  const body = { ...input, requiresApproval: true };
  return { ...body, requiresApproval: true, planHash: hash(JSON.stringify(body)) };
}
