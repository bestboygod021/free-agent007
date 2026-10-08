/** M41 contracts for retention, analytics events, metering and search. */

export type LifecycleDataClass = "run" | "artifact" | "audit" | "account";
export type AnalyticsVisibility = "organization" | "project" | "run";
export type AnalyticsEntitlementMode = "free" | "paid" | "local";

export interface LifecycleSweepRequest {
  organizationId: string;
  dataClass: LifecycleDataClass;
  before: number;
  legalHoldIds: string[];
  candidateIds: string[];
  requestedBy: string;
  approvalPresent: boolean;
}

export interface LifecycleDecision {
  allowed: boolean;
  reasons: string[];
  selectedIds: string[];
  evidenceHash: string;
}

export interface AnalyticsEvent {
  organizationId: string;
  projectId: string;
  runId?: string;
  eventId: string;
  name: "run_started" | "run_finished" | "approval" | "provider_call" | "cost_reconciled";
  occurredAt: number;
  payloadHash: string;
  sequence: number;
}

export interface AnalyticsQuery {
  organizationId: string;
  visibility: AnalyticsVisibility;
  projectId?: string;
  runId?: string;
  from: number;
  to: number;
  metric: "runs" | "latency" | "cost" | "approvals";
}

export interface UsageEntitlementRequest {
  organizationId: string;
  mode: AnalyticsEntitlementMode;
  includedUnits: number;
  consumedUnits: number;
  requestedUnits: number;
  budgetAllowed: boolean;
  localOnly: boolean;
}

export interface FullTextQuery {
  organizationId: string;
  scope: "project" | "run" | "artifact";
  queryHash: string;
  projectId?: string;
  maxResults: number;
  includeDeleted: boolean;
}

export class DataLifecycleAnalyticsContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataLifecycleAnalyticsContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new DataLifecycleAnalyticsContractError(`${label} is required`);
}

export function planLifecycleSweep(request: LifecycleSweepRequest): LifecycleDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.requestedBy, "requestedBy"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(request.before)) reasons.push("retention cutoff must be finite");
  if (!request.approvalPresent) reasons.push("retention deletion requires approval");
  const selectedIds = request.candidateIds.filter((id) => id.trim() && !request.legalHoldIds.includes(id));
  if (selectedIds.length === 0) reasons.push("no deletable candidate remains after legal hold filtering");
  return { allowed: reasons.length === 0, reasons, selectedIds, evidenceHash: hash(JSON.stringify({ request, selectedIds, reasons })) };
}

export function validateAnalyticsEvent(event: AnalyticsEvent): LifecycleDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[event.organizationId, "organizationId"], [event.projectId, "projectId"], [event.eventId, "eventId"], [event.payloadHash, "payloadHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(event.occurredAt) || !Number.isInteger(event.sequence) || event.sequence < 1) reasons.push("event timestamp or sequence is invalid");
  if (event.name === "provider_call" && !event.runId) reasons.push("provider call analytics event requires runId");
  return { allowed: reasons.length === 0, reasons, selectedIds: [], evidenceHash: hash(JSON.stringify({ event, reasons })) };
}

export function decideAnalyticsQuery(query: AnalyticsQuery): LifecycleDecision {
  const reasons: string[] = [];
  required(query.organizationId, "organizationId");
  if (!Number.isFinite(query.from) || !Number.isFinite(query.to) || query.to <= query.from) reasons.push("analytics time window is invalid");
  if (query.visibility === "project" && !query.projectId) reasons.push("project visibility requires projectId");
  if (query.visibility === "run" && !query.runId) reasons.push("run visibility requires runId");
  return { allowed: reasons.length === 0, reasons, selectedIds: [], evidenceHash: hash(JSON.stringify({ query, reasons })) };
}

export function decideUsageEntitlement(request: UsageEntitlementRequest): LifecycleDecision {
  const reasons: string[] = [];
  required(request.organizationId, "organizationId");
  if (!["free", "paid", "local"].includes(request.mode)) reasons.push("unsupported entitlement mode");
  if (request.includedUnits < 0 || request.consumedUnits < 0 || request.requestedUnits < 0) reasons.push("usage units must be non-negative");
  if (!request.budgetAllowed) reasons.push("budget gate denied requested usage");
  if (request.mode === "local" && !request.localOnly) reasons.push("local mode must remain local-only");
  if (request.mode !== "paid" && request.consumedUnits + request.requestedUnits > request.includedUnits) reasons.push("free/local entitlement would be exceeded");
  return { allowed: reasons.length === 0, reasons, selectedIds: [], evidenceHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateFullTextQuery(query: FullTextQuery): LifecycleDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[query.organizationId, "organizationId"], [query.queryHash, "queryHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(query.maxResults) || query.maxResults < 1 || query.maxResults > 1000) reasons.push("search result limit is invalid");
  if (query.scope === "project" && !query.projectId) reasons.push("project search requires projectId");
  if (query.includeDeleted) reasons.push("deleted records are not searchable through the default surface");
  return { allowed: reasons.length === 0, reasons, selectedIds: [], evidenceHash: hash(JSON.stringify({ query, reasons })) };
}
