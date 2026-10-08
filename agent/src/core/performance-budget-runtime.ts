/** M181 fail-closed contracts for performance budgets and load shedding. */

export type M181SheddingAction = "admit" | "queue" | "degrade" | "shed";
export type M181WorkloadPriority = "interactive" | "normal" | "background";

export interface M181PerformanceBudget {
  organizationId: string;
  budgetId: string;
  workload: string;
  maxLatencyMs: number;
  maxQueueAgeMs: number;
  maxTokens: number;
  maxConcurrency: number;
  maxErrorRateBps: number;
  priority: M181WorkloadPriority;
  degradedModeAllowed: boolean;
  tenantBound: boolean;
  approved: boolean;
}

export interface M181AdmissionRequest {
  organizationId: string;
  budgetId: string;
  requestId: string;
  estimatedLatencyMs: number;
  estimatedTokens: number;
  queueAgeMs: number;
  currentConcurrency: number;
  deadlineAt: number;
  priority: M181WorkloadPriority;
  dataEgressApproved: boolean;
  idempotencyKey: string;
  tenantMatch: boolean;
}

export interface M181LoadEvidence {
  organizationId: string;
  budgetId: string;
  windowStart: number;
  windowEnd: number;
  sampleCount: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorRateBps: number;
  queueAgeMs: number;
  evidenceHash: string;
  withinBudget: boolean;
  redacted: boolean;
  tenantMatch: boolean;
}

export interface M181SheddingDecision {
  organizationId: string;
  budgetId: string;
  decisionId: string;
  action: M181SheddingAction;
  reasonHash: string;
  retryAfterMs: number;
  safeDegradation: boolean;
  noSilentProviderChange: boolean;
  bounded: boolean;
  operatorApproval: boolean;
  tenantMatch: boolean;
}

export interface M181PerformanceDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(values: Array<readonly [string, string]>, reasons: string[]): void {
  for (const [value, label] of values) if (!value.trim()) reasons.push(`${label} is required`);
}

export function validateM181Budget(budget: M181PerformanceBudget): M181PerformanceDecision {
  const reasons: string[] = [];
  required([[budget.organizationId, "organizationId"], [budget.budgetId, "budgetId"], [budget.workload, "workload"]], reasons);
  if (!Number.isInteger(budget.maxLatencyMs) || budget.maxLatencyMs < 1 || !Number.isInteger(budget.maxQueueAgeMs) || budget.maxQueueAgeMs < 0 || !Number.isInteger(budget.maxTokens) || budget.maxTokens < 1 || !Number.isInteger(budget.maxConcurrency) || budget.maxConcurrency < 1 || !Number.isInteger(budget.maxErrorRateBps) || budget.maxErrorRateBps < 0 || budget.maxErrorRateBps > 10_000) reasons.push("performance budget bounds are invalid");
  if (!budget.tenantBound || !budget.approved) reasons.push("budget needs tenant and approval gates");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ budget, reasons })) };
}

export function decideM181Admission(request: M181AdmissionRequest, now: number): M181PerformanceDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.budgetId, "budgetId"], [request.requestId, "requestId"], [request.idempotencyKey, "idempotencyKey"]], reasons);
  if (!Number.isFinite(request.estimatedLatencyMs) || request.estimatedLatencyMs < 0 || !Number.isFinite(request.estimatedTokens) || request.estimatedTokens < 0 || !Number.isFinite(request.queueAgeMs) || request.queueAgeMs < 0 || !Number.isInteger(request.currentConcurrency) || request.currentConcurrency < 0 || !Number.isFinite(request.deadlineAt) || request.deadlineAt <= now) reasons.push("admission estimates, concurrency or deadline are invalid");
  if (!request.dataEgressApproved || !request.tenantMatch) reasons.push("admission needs egress approval and tenant match");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.priority === "interactive", auditHash: hash(JSON.stringify({ request, now, reasons })) };
}

export function validateM181LoadEvidence(evidence: M181LoadEvidence): M181PerformanceDecision {
  const reasons: string[] = [];
  required([[evidence.organizationId, "organizationId"], [evidence.budgetId, "budgetId"], [evidence.evidenceHash, "evidenceHash"]], reasons);
  if (!Number.isFinite(evidence.windowStart) || !Number.isFinite(evidence.windowEnd) || evidence.windowEnd <= evidence.windowStart || !Number.isInteger(evidence.sampleCount) || evidence.sampleCount < 1 || !Number.isFinite(evidence.p95LatencyMs) || !Number.isFinite(evidence.p99LatencyMs) || evidence.p99LatencyMs < evidence.p95LatencyMs || !Number.isInteger(evidence.errorRateBps) || evidence.errorRateBps < 0 || evidence.errorRateBps > 10_000 || !evidence.withinBudget || !evidence.redacted || !evidence.tenantMatch) reasons.push("load evidence is incomplete or outside the budget");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function decideM181Shedding(decision: M181SheddingDecision): M181PerformanceDecision {
  const reasons: string[] = [];
  required([[decision.organizationId, "organizationId"], [decision.budgetId, "budgetId"], [decision.decisionId, "decisionId"], [decision.reasonHash, "reasonHash"]], reasons);
  if (!Number.isInteger(decision.retryAfterMs) || decision.retryAfterMs < 0 || decision.retryAfterMs > 900_000 || !decision.bounded || !decision.noSilentProviderChange || !decision.tenantMatch) reasons.push("shedding must be bounded, explicit and tenant-safe");
  if (decision.action === "degrade" && !decision.safeDegradation) reasons.push("degraded action needs an approved safe mode");
  if (decision.action === "shed" && !decision.operatorApproval) reasons.push("shed action needs operator approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: decision.action === "shed", auditHash: hash(JSON.stringify({ decision, reasons })) };
}
