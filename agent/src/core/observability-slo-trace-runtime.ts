/** M139 contracts for SLOs, distributed Run traces and deduplicated alerts. */

export type M139Window = "rolling_1h" | "rolling_24h" | "calendar_week";
export type M139SpanKind = "agent_call" | "tool_call" | "queue" | "connector" | "storage";
export type M139AlertSeverity = "warning" | "high" | "critical";

export interface M139SloPolicy {
  organizationId: string;
  sloId: string;
  serviceName: string;
  window: M139Window;
  targetPercent: number;
  errorBudgetPercent: number;
  alertAfterMinutes: number;
  queryHash: string;
  routeReference: string;
  tenantScoped: boolean;
  approvalPresent: boolean;
}

export interface M139TraceSpan {
  organizationId: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operation: string;
  kind: M139SpanKind;
  startedAt: number;
  endedAt: number;
  status: "ok" | "error" | "cancelled";
  attributesHash: string;
  tenantBound: boolean;
  redacted: boolean;
}

export interface M139RunTrace {
  organizationId: string;
  runId: string;
  traceId: string;
  rootSpanId: string;
  spanCount: number;
  toolCallCount: number;
  samplingRate: number;
  complete: boolean;
  orphanSpanCount: number;
  traceRootHash: string;
  tenantBound: boolean;
}

export interface M139AlertDecisionInput {
  organizationId: string;
  alertId: string;
  sloId: string;
  severity: M139AlertSeverity;
  signalHash: string;
  routeReference: string;
  dedupeKey: string;
  observedAt: number;
  redacted: boolean;
  tenantBound: boolean;
  actionReference?: string;
}

export interface M139ObservabilityDecision {
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

export function validateM139SloPolicy(policy: M139SloPolicy): M139ObservabilityDecision {
  const reasons: string[] = [];
  required([[policy.organizationId, "organizationId"], [policy.sloId, "sloId"], [policy.serviceName, "serviceName"], [policy.queryHash, "queryHash"], [policy.routeReference, "routeReference"]], reasons);
  if (!Number.isFinite(policy.targetPercent) || policy.targetPercent <= 0 || policy.targetPercent > 100) reasons.push("target percent must be between zero and one hundred");
  if (!Number.isFinite(policy.errorBudgetPercent) || policy.errorBudgetPercent < 0 || policy.errorBudgetPercent >= 100) reasons.push("error budget percent must be non-negative and below one hundred");
  if (!Number.isInteger(policy.alertAfterMinutes) || policy.alertAfterMinutes < 1) reasons.push("alert threshold must be a positive minute count");
  if (!policy.tenantScoped || !policy.approvalPresent) reasons.push("SLO policy needs tenant scope and approval");
  if (policy.targetPercent + policy.errorBudgetPercent > 100) reasons.push("target plus error budget cannot exceed one hundred");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ policy, reasons })) };
}

export function validateM139TraceSpan(span: M139TraceSpan): M139ObservabilityDecision {
  const reasons: string[] = [];
  required([[span.organizationId, "organizationId"], [span.traceId, "traceId"], [span.spanId, "spanId"], [span.operation, "operation"], [span.attributesHash, "attributesHash"]], reasons);
  if (!Number.isFinite(span.startedAt) || !Number.isFinite(span.endedAt) || span.endedAt < span.startedAt) reasons.push("span timing is invalid");
  if (!span.tenantBound || !span.redacted) reasons.push("span must be tenant-bound and redacted");
  if (span.parentSpanId === span.spanId) reasons.push("span cannot parent itself");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ span, reasons })) };
}

export function validateM139RunTrace(trace: M139RunTrace): M139ObservabilityDecision {
  const reasons: string[] = [];
  required([[trace.organizationId, "organizationId"], [trace.runId, "runId"], [trace.traceId, "traceId"], [trace.rootSpanId, "rootSpanId"], [trace.traceRootHash, "traceRootHash"]], reasons);
  if (![trace.spanCount, trace.toolCallCount, trace.orphanSpanCount].every((value) => Number.isInteger(value) && value >= 0)) reasons.push("trace counts must be non-negative integers");
  if (trace.toolCallCount > trace.spanCount) reasons.push("tool call count cannot exceed span count");
  if (!Number.isFinite(trace.samplingRate) || trace.samplingRate <= 0 || trace.samplingRate > 1) reasons.push("sampling rate must be greater than zero and at most one");
  if (!trace.complete || trace.orphanSpanCount > 0 || !trace.tenantBound) reasons.push("trace must be complete, connected and tenant-bound");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ trace, reasons })) };
}

export function decideM139Alert(input: M139AlertDecisionInput): M139ObservabilityDecision {
  const reasons: string[] = [];
  required([[input.organizationId, "organizationId"], [input.alertId, "alertId"], [input.sloId, "sloId"], [input.signalHash, "signalHash"], [input.routeReference, "routeReference"], [input.dedupeKey, "dedupeKey"]], reasons);
  if (!Number.isFinite(input.observedAt)) reasons.push("observedAt is invalid");
  if (!input.redacted || !input.tenantBound) reasons.push("alert must be redacted and tenant-bound");
  if (input.severity === "critical" && !input.actionReference) reasons.push("critical alert needs an action reference");
  return { allowed: reasons.length === 0, reasons, requiresApproval: input.severity === "critical", auditHash: hash(JSON.stringify({ input, reasons })) };
}
