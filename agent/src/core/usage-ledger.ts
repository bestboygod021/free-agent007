/**
 * Measured usage and budget preflight.
 *
 * The ledger is intentionally append-only at the domain boundary. A database
 * adapter can persist these entries later; the policy and arithmetic stay in
 * this deterministic module so every adapter applies the same ceiling.
 */

export interface UsageEntry {
  entryId: string;
  organizationId: string;
  projectId: string;
  runId: string;
  taskId?: string;
  provider: string;
  model: string;
  locality: "local" | "cloud";
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  durationMs: number;
  cost: number;
  currency: string;
  measuredAt: number;
}

export interface UsageFilter {
  organizationId?: string;
  projectId?: string;
  runId?: string;
  provider?: string;
  since?: number;
  until?: number;
}

export interface UsageTotals {
  entries: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  durationMs: number;
  cost: number;
  currency: string;
}

export interface BudgetPolicy {
  maxCost: number;
  currency: string;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  /** hard ceiling, regardless of whether the provider reports a lower price */
  maxDurationMs?: number;
}

export interface BudgetProjection {
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  cost: number;
  currency: string;
}

export interface BudgetDecision {
  allowed: boolean;
  reasons: string[];
  current: UsageTotals;
  projected: UsageTotals;
}

export class UsageContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageContractError";
  }
}

function nonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) throw new UsageContractError(`${label} must be a non-negative integer`);
}

function nonNegativeNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new UsageContractError(`${label} must be a finite non-negative number`);
}

export function validateUsageEntry(entry: UsageEntry): void {
  for (const [value, label] of [
    [entry.inputTokens, "inputTokens"],
    [entry.outputTokens, "outputTokens"],
    [entry.cachedInputTokens, "cachedInputTokens"],
  ] as const) nonNegativeInteger(value, label);
  for (const [value, label] of [
    [entry.durationMs, "durationMs"],
    [entry.cost, "cost"],
  ] as const) nonNegativeNumber(value, label);
  for (const [value, label] of [
    [entry.entryId, "entryId"],
    [entry.organizationId, "organizationId"],
    [entry.projectId, "projectId"],
    [entry.runId, "runId"],
    [entry.provider, "provider"],
    [entry.model, "model"],
    [entry.currency, "currency"],
  ] as const) {
    if (!value.trim()) throw new UsageContractError(`${label} must not be empty`);
  }
  if (!Number.isFinite(entry.measuredAt) || entry.measuredAt <= 0) {
    throw new UsageContractError("measuredAt must be a positive timestamp");
  }
}

export function emptyUsageTotals(currency = "USD"): UsageTotals {
  return {
    entries: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    durationMs: 0,
    cost: 0,
    currency,
  };
}

export function sumUsage(entries: readonly UsageEntry[], currency = entries[0]?.currency ?? "USD"): UsageTotals {
  const totals = emptyUsageTotals(currency);
  for (const entry of entries) {
    validateUsageEntry(entry);
    if (entry.currency !== currency) throw new UsageContractError("mixed currencies require separate ledgers");
    totals.entries += 1;
    totals.inputTokens += entry.inputTokens;
    totals.outputTokens += entry.outputTokens;
    totals.cachedInputTokens += entry.cachedInputTokens;
    totals.durationMs += entry.durationMs;
    totals.cost = round6(totals.cost + entry.cost);
  }
  return totals;
}

function matches(entry: UsageEntry, filter: UsageFilter): boolean {
  if (filter.organizationId && entry.organizationId !== filter.organizationId) return false;
  if (filter.projectId && entry.projectId !== filter.projectId) return false;
  if (filter.runId && entry.runId !== filter.runId) return false;
  if (filter.provider && entry.provider !== filter.provider) return false;
  if (filter.since !== undefined && entry.measuredAt < filter.since) return false;
  if (filter.until !== undefined && entry.measuredAt > filter.until) return false;
  return true;
}

export class InMemoryUsageLedger {
  private readonly rows: UsageEntry[] = [];

  append(entry: UsageEntry): void {
    validateUsageEntry(entry);
    if (this.rows.some((row) => row.entryId === entry.entryId)) {
      throw new UsageContractError(`duplicate usage entry: ${entry.entryId}`);
    }
    this.rows.push(structuredClone(entry));
  }

  list(filter: UsageFilter = {}): UsageEntry[] {
    return this.rows.filter((entry) => matches(entry, filter)).map((entry) => structuredClone(entry));
  }

  totals(filter: UsageFilter = {}, currency = this.rows[0]?.currency ?? "USD"): UsageTotals {
    return sumUsage(this.list(filter), currency);
  }

  get size(): number {
    return this.rows.length;
  }
}

function addProjection(current: UsageTotals, projection: BudgetProjection): UsageTotals {
  if (projection.currency !== current.currency) {
    throw new UsageContractError("projection currency differs from current usage currency");
  }
  return {
    entries: current.entries + 1,
    inputTokens: current.inputTokens + projection.inputTokens,
    outputTokens: current.outputTokens + projection.outputTokens,
    cachedInputTokens: current.cachedInputTokens,
    durationMs: current.durationMs + projection.durationMs,
    cost: round6(current.cost + projection.cost),
    currency: current.currency,
  };
}

/** Decide before a provider call; this is a hard gate, not a warning. */
export function checkBudget(
  current: UsageTotals,
  projection: BudgetProjection,
  policy: BudgetPolicy,
): BudgetDecision {
  if (policy.currency !== current.currency || policy.currency !== projection.currency) {
    throw new UsageContractError("budget, current usage and projection must use one currency");
  }
  nonNegativeNumber(policy.maxCost, "policy.maxCost");
  const projected = addProjection(current, projection);
  const reasons: string[] = [];
  if (projected.cost > policy.maxCost) reasons.push(`cost ${projected.cost} exceeds ${policy.maxCost}`);
  if (policy.maxInputTokens !== undefined && projected.inputTokens > policy.maxInputTokens) {
    reasons.push(`input tokens ${projected.inputTokens} exceed ${policy.maxInputTokens}`);
  }
  if (policy.maxOutputTokens !== undefined && projected.outputTokens > policy.maxOutputTokens) {
    reasons.push(`output tokens ${projected.outputTokens} exceed ${policy.maxOutputTokens}`);
  }
  if (policy.maxDurationMs !== undefined && projected.durationMs > policy.maxDurationMs) {
    reasons.push(`duration ${projected.durationMs} exceeds ${policy.maxDurationMs}`);
  }
  return { allowed: reasons.length === 0, reasons, current, projected };
}

export function assertBudget(
  current: UsageTotals,
  projection: BudgetProjection,
  policy: BudgetPolicy,
): void {
  const decision = checkBudget(current, projection, policy);
  if (!decision.allowed) throw new UsageContractError(`budget denied: ${decision.reasons.join(", ")}`);
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
