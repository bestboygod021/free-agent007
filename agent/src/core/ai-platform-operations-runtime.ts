/** M63 contracts for model health, quotas, cost and operational governance. */

export type ModelOperationalStatus = "healthy" | "degraded" | "rate_limited" | "unreachable" | "retired";
export type ModelOperationalIncident = "provider_outage" | "quota_exhausted" | "quality_regression" | "safety_regression" | "cost_anomaly";
export type ModelOperationalAction = "retry" | "cooldown" | "fallback" | "disable" | "human_review";

export interface ModelOperationalHealth {
  organizationId: string;
  providerId: string;
  modelId: string;
  status: ModelOperationalStatus;
  checkedAt: number;
  latencyP95Ms: number;
  errorRate: number;
  availability: number;
  capabilityProbeHash: string;
  evidenceHash: string;
}

export interface ModelQuotaBudget {
  organizationId: string;
  providerId: string;
  modelId: string;
  period: "minute" | "day" | "month";
  requestLimit: number;
  tokenLimit: number;
  costLimit: number;
  requestsUsed: number;
  tokensUsed: number;
  costUsed: number;
  hardStop: boolean;
}

export interface ModelOperationalIncidentRecord {
  organizationId: string;
  incidentId: string;
  providerId: string;
  modelId: string;
  kind: ModelOperationalIncident;
  severity: "low" | "medium" | "high" | "critical";
  observedAt: number;
  evidenceHash: string;
  acknowledged: boolean;
  selectedAction: ModelOperationalAction;
}

export interface ModelOperationsDecision {
  allowed: boolean;
  reasons: string[];
  selectedAction: ModelOperationalAction;
  auditHash: string;
}

export class AiPlatformOperationsContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiPlatformOperationsContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new AiPlatformOperationsContractError(`${label} is required`);
}

export function validateModelOperationalHealth(health: ModelOperationalHealth, now: number): ModelOperationsDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[health.organizationId, "organizationId"], [health.providerId, "providerId"], [health.modelId, "modelId"], [health.capabilityProbeHash, "capabilityProbeHash"], [health.evidenceHash, "evidenceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(now) || !Number.isFinite(health.checkedAt) || health.checkedAt > now) reasons.push("health timestamp is invalid");
  if (!Number.isFinite(health.latencyP95Ms) || health.latencyP95Ms < 0 || !Number.isFinite(health.errorRate) || health.errorRate < 0 || health.errorRate > 1 || !Number.isFinite(health.availability) || health.availability < 0 || health.availability > 1) reasons.push("health metrics are invalid");
  if (health.status === "healthy" && (health.errorRate > 0.05 || health.availability < 0.99)) reasons.push("healthy status contradicts observed health metrics");
  const selectedAction: ModelOperationalAction = health.status === "healthy" ? "retry" : health.status === "rate_limited" ? "cooldown" : health.status === "retired" ? "disable" : "fallback";
  return { allowed: reasons.length === 0, reasons, selectedAction, auditHash: hash(JSON.stringify({ health, now, reasons })) };
}

export function decideModelQuotaBudget(budget: ModelQuotaBudget): ModelOperationsDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[budget.organizationId, "organizationId"], [budget.providerId, "providerId"], [budget.modelId, "modelId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  for (const [value, label] of [[budget.requestLimit, "requestLimit"], [budget.tokenLimit, "tokenLimit"], [budget.costLimit, "costLimit"], [budget.requestsUsed, "requestsUsed"], [budget.tokensUsed, "tokensUsed"], [budget.costUsed, "costUsed"]] as const) if (!Number.isFinite(value) || value < 0) reasons.push(`${label} is invalid`);
  const exhausted = budget.requestsUsed >= budget.requestLimit || budget.tokensUsed >= budget.tokenLimit || budget.costUsed >= budget.costLimit;
  if (exhausted && budget.hardStop) reasons.push("model quota or cost hard stop is exhausted");
  return { allowed: reasons.length === 0 && !(exhausted && budget.hardStop), reasons, selectedAction: exhausted ? "fallback" : "retry", auditHash: hash(JSON.stringify({ budget, exhausted, reasons })) };
}

export function decideModelIncidentResponse(incident: ModelOperationalIncidentRecord): ModelOperationsDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[incident.organizationId, "organizationId"], [incident.incidentId, "incidentId"], [incident.providerId, "providerId"], [incident.modelId, "modelId"], [incident.evidenceHash, "evidenceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(incident.observedAt)) reasons.push("incident timestamp is invalid");
  if (incident.severity === "critical" && !["disable", "human_review"].includes(incident.selectedAction)) reasons.push("critical incident needs disable or human review");
  if (incident.kind === "safety_regression" && incident.selectedAction !== "disable" && incident.selectedAction !== "human_review") reasons.push("safety regression cannot only retry");
  if (incident.kind === "cost_anomaly" && incident.selectedAction === "retry") reasons.push("cost anomaly cannot be handled by blind retry");
  return { allowed: reasons.length === 0, reasons, selectedAction: incident.selectedAction, auditHash: hash(JSON.stringify({ incident, reasons })) };
}

export function validateModelOperationsDashboard(organizationId: string, modelIds: string[], metricNames: string[], windowStart: number, windowEnd: number, tenantScoped: boolean): ModelOperationsDecision {
  required(organizationId, "organizationId");
  const reasons: string[] = [];
  if (modelIds.length === 0 || modelIds.some((id) => !id.trim())) reasons.push("operations dashboard needs model ids");
  if (metricNames.length === 0 || metricNames.some((name) => !name.trim())) reasons.push("operations dashboard needs metrics");
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || windowEnd <= windowStart) reasons.push("operations window is invalid");
  if (!tenantScoped) reasons.push("operations dashboard must be tenant-scoped");
  return { allowed: reasons.length === 0, reasons, selectedAction: "human_review", auditHash: hash(JSON.stringify({ organizationId, modelIds, metricNames, windowStart, windowEnd, tenantScoped, reasons })) };
}
