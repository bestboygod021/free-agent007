/** M123 contracts for capacity planning, circuit breaking and bounded failure experiments. */

export type M123FailureKind = "dependency_timeout" | "queue_backlog" | "worker_crash" | "storage_latency" | "quota_exhaustion";
export type M123CircuitState = "closed" | "open" | "half_open";

export interface M123CapacityPlanContract {
  organizationId: string;
  planId: string;
  service: string;
  expectedRps: number;
  peakRps: number;
  workerCapacity: number;
  queueCapacity: number;
  storageBudgetGb: number;
  headroomPercent: number;
  testedAt: number;
  loadEvidenceHash: string;
  reviewed: boolean;
}

export interface M123CircuitBreakerEvidence {
  organizationId: string;
  breakerId: string;
  dependency: string;
  state: M123CircuitState;
  failureCount: number;
  failureThreshold: number;
  openedAt?: number;
  cooldownMs: number;
  probePassed: boolean;
  fallbackAvailable: boolean;
}

export interface M123FailureExperiment {
  organizationId: string;
  experimentId: string;
  kind: M123FailureKind;
  blastRadius: "single_request" | "single_worker" | "staging";
  approvalPresent: boolean;
  sandboxed: boolean;
  steadyStateHash: string;
  recoveryHash: string;
  observedRecoveryMs: number;
  recoveryBudgetMs: number;
  noDataLoss: boolean;
  stoppedOnImpact: boolean;
}

export interface M123CapacityAlertEvidence {
  organizationId: string;
  alertId: string;
  metric: "rps" | "queue_age" | "storage" | "error_rate" | "latency";
  observed: number;
  threshold: number;
  action: "scale" | "throttle" | "fallback" | "page";
  actionEvidenceHash: string;
  customerImpactRedacted: boolean;
}

export interface M123ResilienceDecision {
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

export function validateM123CapacityPlan(plan: M123CapacityPlanContract): M123ResilienceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[plan.organizationId, "organizationId"], [plan.planId, "planId"], [plan.service, "service"], [plan.loadEvidenceHash, "loadEvidenceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(plan.expectedRps) || plan.expectedRps < 0 || !Number.isFinite(plan.peakRps) || plan.peakRps < plan.expectedRps) reasons.push("RPS capacity values are invalid");
  if (!Number.isInteger(plan.workerCapacity) || plan.workerCapacity < 1 || !Number.isInteger(plan.queueCapacity) || plan.queueCapacity < 1) reasons.push("worker/queue capacity must be positive");
  if (!Number.isFinite(plan.storageBudgetGb) || plan.storageBudgetGb <= 0 || !Number.isFinite(plan.headroomPercent) || plan.headroomPercent < 10) reasons.push("storage/headroom budget is insufficient");
  if (!Number.isFinite(plan.testedAt) || !plan.reviewed) reasons.push("capacity plan needs tested and reviewed evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ plan, reasons })) };
}

export function validateM123CircuitBreaker(evidence: M123CircuitBreakerEvidence, now = Date.now()): M123ResilienceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.breakerId, "breakerId"], [evidence.dependency, "dependency"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(evidence.failureCount) || evidence.failureCount < 0 || !Number.isInteger(evidence.failureThreshold) || evidence.failureThreshold < 1) reasons.push("circuit failure values are invalid");
  if (evidence.state === "open" && (!evidence.openedAt || evidence.openedAt > now)) reasons.push("open circuit needs a valid openedAt");
  if (!Number.isInteger(evidence.cooldownMs) || evidence.cooldownMs < 0) reasons.push("circuit cooldown is invalid");
  if (evidence.state !== "closed" && !evidence.fallbackAvailable) reasons.push("open/half-open circuit needs fallback");
  if (evidence.state === "half_open" && !evidence.probePassed) reasons.push("half-open circuit needs a passed probe");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function validateM123FailureExperiment(experiment: M123FailureExperiment): M123ResilienceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[experiment.organizationId, "organizationId"], [experiment.experimentId, "experimentId"], [experiment.steadyStateHash, "steadyStateHash"], [experiment.recoveryHash, "recoveryHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (experiment.blastRadius === "staging" && !experiment.approvalPresent) reasons.push("staging failure experiment needs approval");
  if (!experiment.sandboxed || !experiment.stoppedOnImpact) reasons.push("failure experiment needs sandbox and impact stop");
  if (!Number.isFinite(experiment.observedRecoveryMs) || experiment.observedRecoveryMs > experiment.recoveryBudgetMs) reasons.push("recovery exceeds budget");
  if (!experiment.noDataLoss) reasons.push("failure experiment reports data loss");
  return { allowed: reasons.length === 0, reasons, requiresApproval: experiment.blastRadius === "staging", auditHash: hash(JSON.stringify({ experiment, reasons })) };
}

export function validateM123CapacityAlert(evidence: M123CapacityAlertEvidence): M123ResilienceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.alertId, "alertId"], [evidence.actionEvidenceHash, "actionEvidenceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(evidence.observed) || !Number.isFinite(evidence.threshold) || evidence.threshold < 0) reasons.push("capacity alert values are invalid");
  if (evidence.observed <= evidence.threshold) reasons.push("alert observed value does not exceed threshold");
  if (!evidence.customerImpactRedacted) reasons.push("capacity alert customer impact must be redacted");
  return { allowed: reasons.length === 0, reasons, requiresApproval: evidence.action === "page", auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
