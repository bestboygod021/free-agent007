/** M113 contracts for seeds, append-only events, governed search and analytics reports. */

export type M113EventKind = "run" | "tool" | "approval" | "usage" | "audit";
export type M113SearchScope = "project" | "run" | "event";

export interface M113SeedFixtureContract {
  organizationId: string;
  fixtureId: string;
  version: string;
  schemaHash: string;
  fixtureHash: string;
  records: number;
  piiRedacted: boolean;
  deterministic: boolean;
  idempotencyKey: string;
  approved: boolean;
}

export interface M113AppendOnlyEvent {
  organizationId: string;
  eventId: string;
  aggregateId: string;
  kind: M113EventKind;
  sequence: number;
  payloadHash: string;
  previousEventHash: string;
  eventHash: string;
  occurredAt: number;
  redacted: boolean;
  immutable: boolean;
}

export interface M113GovernedSearchRequest {
  organizationId: string;
  queryId: string;
  scope: M113SearchScope;
  queryHash: string;
  projectId?: string;
  runId?: string;
  limit: number;
  offset: number;
  aclSubjectHash: string;
  tenantFilterApplied: boolean;
  piiSafe: boolean;
}

export interface M113AnalyticsReportEvidence {
  organizationId: string;
  reportId: string;
  periodStart: number;
  periodEnd: number;
  eventCount: number;
  uniqueRuns: number;
  dimensions: string[];
  aggregationHash: string;
  costRedacted: boolean;
  tenantScoped: boolean;
  sourceWatermark: string;
}

export interface M113DataPlaneDecision {
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

export function validateM113SeedFixture(fixture: M113SeedFixtureContract): M113DataPlaneDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[fixture.organizationId, "organizationId"], [fixture.fixtureId, "fixtureId"], [fixture.version, "version"], [fixture.schemaHash, "schemaHash"], [fixture.fixtureHash, "fixtureHash"], [fixture.idempotencyKey, "idempotencyKey"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(fixture.records) || fixture.records < 0) reasons.push("fixture record count is invalid");
  if (!fixture.piiRedacted || !fixture.deterministic || !fixture.approved) reasons.push("seed fixture privacy, determinism and approval evidence is incomplete");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ fixture, reasons })) };
}

export function validateM113AppendOnlyEvent(event: M113AppendOnlyEvent): M113DataPlaneDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[event.organizationId, "organizationId"], [event.eventId, "eventId"], [event.aggregateId, "aggregateId"], [event.payloadHash, "payloadHash"], [event.previousEventHash, "previousEventHash"], [event.eventHash, "eventHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(event.sequence) || event.sequence < 0) reasons.push("event sequence must be non-negative");
  if (!Number.isFinite(event.occurredAt)) reasons.push("event occurredAt is invalid");
  if (!event.redacted || !event.immutable) reasons.push("append-only event must be redacted and immutable");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ event, reasons })) };
}

export function decideM113GovernedSearch(request: M113GovernedSearchRequest): M113DataPlaneDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.queryId, "queryId"], [request.queryHash, "queryHash"], [request.aclSubjectHash, "aclSubjectHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.scope === "project" && !request.projectId) reasons.push("project search needs projectId");
  if (request.scope === "run" && !request.runId) reasons.push("run search needs runId");
  if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 200) reasons.push("search limit must be between one and two hundred");
  if (!Number.isInteger(request.offset) || request.offset < 0) reasons.push("search offset must be non-negative");
  if (!request.tenantFilterApplied || !request.piiSafe) reasons.push("search requires tenant filter and PII safety");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateM113AnalyticsReport(report: M113AnalyticsReportEvidence): M113DataPlaneDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[report.organizationId, "organizationId"], [report.reportId, "reportId"], [report.aggregationHash, "aggregationHash"], [report.sourceWatermark, "sourceWatermark"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(report.periodStart) || !Number.isFinite(report.periodEnd) || report.periodEnd <= report.periodStart) reasons.push("analytics period is invalid");
  if (!Number.isInteger(report.eventCount) || report.eventCount < 0 || !Number.isInteger(report.uniqueRuns) || report.uniqueRuns < 0 || report.uniqueRuns > report.eventCount) reasons.push("analytics counts are invalid");
  if (report.dimensions.length === 0 || !report.costRedacted || !report.tenantScoped) reasons.push("analytics report needs dimensions, cost redaction and tenant scope");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ report, reasons })) };
}
