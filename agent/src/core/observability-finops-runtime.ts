/** M107 contracts for telemetry, SLO/error budgets, incidents and cost reconciliation. */

export type TelemetryKind = "metric" | "trace" | "log";
export type SloIndicator = "availability" | "latency" | "queue_age" | "error_rate";
export type IncidentSeverity = "sev1" | "sev2" | "sev3";

export interface TelemetryEnvelope {
  organizationId: string;
  runId: string;
  eventId: string;
  kind: TelemetryKind;
  name: string;
  value: number;
  unit: string;
  traceId: string;
  sampled: boolean;
  redacted: boolean;
  occurredAt: number;
}

export interface SloPolicyContract {
  organizationId: string;
  policyId: string;
  indicator: SloIndicator;
  target: number;
  windowDays: number;
  budgetRemaining: number;
  alertThreshold: number;
  burnRate: number;
  reviewed: boolean;
}

export interface IncidentCommandRecord {
  organizationId: string;
  incidentId: string;
  severity: IncidentSeverity;
  startedAt: number;
  commanderHash: string;
  affectedService: string;
  runbookId: string;
  customerImpactRedacted: boolean;
  containmentAction: string;
  postmortemDueAt: number;
  resolved: boolean;
}

export interface M107CostReconciliationEvidence {
  organizationId: string;
  reportId: string;
  periodStart: number;
  periodEnd: number;
  provider: string;
  usageUnits: number;
  recordedCost: number;
  providerCost: number;
  currency: string;
  budgetLimit: number;
  varianceAllowed: number;
  reconciled: boolean;
  sourceHash: string;
}

export interface ObservabilityFinopsDecision {
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

export function validateM107Telemetry(envelope: TelemetryEnvelope): ObservabilityFinopsDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[envelope.organizationId, "organizationId"], [envelope.runId, "runId"], [envelope.eventId, "eventId"], [envelope.name, "name"], [envelope.unit, "unit"], [envelope.traceId, "traceId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(envelope.value) || !Number.isFinite(envelope.occurredAt)) reasons.push("telemetry value/timestamp must be finite");
  if (!envelope.redacted) reasons.push("telemetry must be redacted before export");
  if (envelope.kind === "trace" && !envelope.sampled) reasons.push("trace evidence must declare sampling");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ envelope, reasons })) };
}

export function decideM107Slo(policy: SloPolicyContract): ObservabilityFinopsDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[policy.organizationId, "organizationId"], [policy.policyId, "policyId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(policy.target) || policy.target <= 0 || policy.target > 1) reasons.push("SLO target must be between zero and one");
  if (!Number.isInteger(policy.windowDays) || policy.windowDays < 1) reasons.push("SLO window must be positive");
  if (!Number.isFinite(policy.budgetRemaining) || policy.budgetRemaining < 0) reasons.push("error budget cannot be negative");
  if (!Number.isFinite(policy.alertThreshold) || policy.alertThreshold < 0 || policy.alertThreshold > 1) reasons.push("alert threshold is invalid");
  if (!Number.isFinite(policy.burnRate) || policy.burnRate < 0) reasons.push("burn rate cannot be negative");
  if (!policy.reviewed) reasons.push("SLO policy requires review");
  if (policy.burnRate > 1 && policy.budgetRemaining <= policy.alertThreshold) reasons.push("error budget burn requires an operational hold");
  return { allowed: reasons.length === 0, reasons, requiresApproval: policy.burnRate > 1, auditHash: hash(JSON.stringify({ policy, reasons })) };
}

export function validateM107Incident(record: IncidentCommandRecord, now = Date.now()): ObservabilityFinopsDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[record.organizationId, "organizationId"], [record.incidentId, "incidentId"], [record.commanderHash, "commanderHash"], [record.affectedService, "affectedService"], [record.runbookId, "runbookId"], [record.containmentAction, "containmentAction"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(record.startedAt) || record.startedAt > now) reasons.push("incident start time is invalid");
  if (!Number.isFinite(record.postmortemDueAt) || record.postmortemDueAt < record.startedAt) reasons.push("postmortem due time is invalid");
  if (!record.customerImpactRedacted) reasons.push("incident customer impact must be redacted");
  if (record.severity === "sev1" && record.resolved) reasons.push("sev1 incident needs an explicit post-incident review");
  return { allowed: reasons.length === 0, reasons, requiresApproval: record.severity === "sev1", auditHash: hash(JSON.stringify({ record, reasons })) };
}

export function validateM107CostReport(report: M107CostReconciliationEvidence): ObservabilityFinopsDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[report.organizationId, "organizationId"], [report.reportId, "reportId"], [report.provider, "provider"], [report.currency, "currency"], [report.sourceHash, "sourceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(report.periodStart) || !Number.isFinite(report.periodEnd) || report.periodEnd <= report.periodStart) reasons.push("cost report period is invalid");
  if (!Number.isFinite(report.usageUnits) || report.usageUnits < 0 || !Number.isFinite(report.recordedCost) || report.recordedCost < 0 || !Number.isFinite(report.providerCost) || report.providerCost < 0) reasons.push("cost values are invalid");
  if (!Number.isFinite(report.budgetLimit) || report.budgetLimit < 0 || !Number.isFinite(report.varianceAllowed) || report.varianceAllowed < 0) reasons.push("budget or variance is invalid");
  if (Math.abs(report.recordedCost - report.providerCost) > report.varianceAllowed) reasons.push("recorded/provider cost variance exceeds allowance");
  if (report.recordedCost > report.budgetLimit) reasons.push("recorded cost exceeds budget");
  if (!report.reconciled) reasons.push("cost report is not reconciled");
  return { allowed: reasons.length === 0, reasons, requiresApproval: report.recordedCost > report.budgetLimit, auditHash: hash(JSON.stringify({ report, reasons })) };
}
