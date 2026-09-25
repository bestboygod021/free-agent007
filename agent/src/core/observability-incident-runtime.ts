/** M89 contracts for telemetry, SLO measurements, alert evaluation and incident command. */

export type ObservabilitySignalKind = "metric" | "trace" | "log" | "audit";
export type ObservabilitySeverity = "info" | "warning" | "high" | "critical";
export type IncidentActionKind = "acknowledge" | "degrade" | "failover" | "rollback" | "restore" | "human_review";

export interface ObservabilityTelemetryEnvelope {
  organizationId: string;
  signalId: string;
  kind: ObservabilitySignalKind;
  serviceId: string;
  traceId?: string;
  metricName: string;
  value: number;
  unit: string;
  labelsHash: string;
  payloadHash: string;
  redacted: boolean;
  occurredAt: number;
}

export interface ObservabilitySloMeasurement {
  organizationId: string;
  serviceId: string;
  window: "hour" | "day" | "month";
  availability: number;
  latencyP95Ms: number;
  errorRate: number;
  targetAvailability: number;
  targetLatencyP95Ms: number;
  measuredAt: number;
  evidenceHash: string;
}

export interface ObservabilityAlertEvaluation {
  organizationId: string;
  alertId: string;
  serviceId: string;
  severity: ObservabilitySeverity;
  threshold: number;
  observed: number;
  comparator: "gt" | "gte" | "lt" | "lte";
  notificationSuppressed: boolean;
  evaluatedAt: number;
  evidenceHash: string;
}

export interface IncidentRunbookAction {
  organizationId: string;
  incidentId: string;
  serviceId: string;
  severity: ObservabilitySeverity;
  runbookId: string;
  action: IncidentActionKind;
  operatorId: string;
  approvalPresent: boolean;
  commandHash: string;
  exitCode?: number;
  completedAt?: number;
}

export interface ObservabilityIncidentDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class ObservabilityIncidentContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObservabilityIncidentContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function validateObservabilityTelemetry(envelope: ObservabilityTelemetryEnvelope): ObservabilityIncidentDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[envelope.organizationId, "organizationId"], [envelope.signalId, "signalId"], [envelope.serviceId, "serviceId"], [envelope.metricName, "metricName"], [envelope.unit, "unit"], [envelope.labelsHash, "labelsHash"], [envelope.payloadHash, "payloadHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(envelope.value) || !Number.isFinite(envelope.occurredAt)) reasons.push("telemetry value or timestamp is invalid");
  if (!envelope.redacted) reasons.push("telemetry payload must be redacted");
  if (envelope.kind === "trace" && !envelope.traceId) reasons.push("trace telemetry requires trace id");
  return { allowed: reasons.length === 0, reasons, requiresApproval: envelope.kind === "audit", auditHash: hash(JSON.stringify({ envelope, reasons })) };
}

export function validateObservabilitySloMeasurement(measurement: ObservabilitySloMeasurement): ObservabilityIncidentDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[measurement.organizationId, "organizationId"], [measurement.serviceId, "serviceId"], [measurement.evidenceHash, "evidenceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (![measurement.availability, measurement.errorRate].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) reasons.push("SLO rates must be between zero and one");
  if (![measurement.latencyP95Ms, measurement.targetLatencyP95Ms].every((value) => Number.isFinite(value) && value >= 0)) reasons.push("latency values are invalid");
  if (!Number.isFinite(measurement.targetAvailability) || measurement.targetAvailability < 0 || measurement.targetAvailability > 1) reasons.push("availability target is invalid");
  if (!Number.isFinite(measurement.measuredAt)) reasons.push("measurement timestamp is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ measurement, reasons })) };
}

export function decideObservabilityAlert(alert: ObservabilityAlertEvaluation): ObservabilityIncidentDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[alert.organizationId, "organizationId"], [alert.alertId, "alertId"], [alert.serviceId, "serviceId"], [alert.evidenceHash, "evidenceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (![alert.threshold, alert.observed].every((value) => Number.isFinite(value))) reasons.push("alert values are invalid");
  if (!Number.isFinite(alert.evaluatedAt)) reasons.push("alert timestamp is invalid");
  if (alert.severity === "critical" && alert.notificationSuppressed) reasons.push("critical alert cannot be silently suppressed");
  return { allowed: reasons.length === 0, reasons, requiresApproval: alert.severity === "critical", auditHash: hash(JSON.stringify({ alert, reasons })) };
}

export function validateIncidentRunbookAction(action: IncidentRunbookAction): ObservabilityIncidentDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[action.organizationId, "organizationId"], [action.incidentId, "incidentId"], [action.serviceId, "serviceId"], [action.runbookId, "runbookId"], [action.operatorId, "operatorId"], [action.commandHash, "commandHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (["degrade", "failover", "rollback", "restore"].includes(action.action) && !action.approvalPresent) reasons.push("incident action requires approval");
  if (action.completedAt !== undefined && action.exitCode !== 0) reasons.push("completed incident action must have zero exit code");
  if (action.completedAt !== undefined && !Number.isFinite(action.completedAt)) reasons.push("incident completion timestamp is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: action.action !== "acknowledge", auditHash: hash(JSON.stringify({ action, reasons })) };
}
