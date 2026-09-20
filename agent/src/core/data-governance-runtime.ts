/** M83 contracts for analytics events, governed queries, legal acceptance and disclosure. */

export type GovernedDataClass = "public" | "internal" | "private" | "confidential";
export type AnalyticsRetention = "short" | "standard" | "audit";
export type LegalPolicyKind = "terms" | "privacy" | "output_rights" | "disclaimer";
export type VulnerabilitySeverity = "low" | "medium" | "high" | "critical";

export interface AnalyticsEventEnvelope {
  organizationId: string;
  eventId: string;
  runId?: string;
  eventType: string;
  actorHash: string;
  payloadHash: string;
  dataClass: GovernedDataClass;
  retention: AnalyticsRetention;
  sequence: number;
  piiRedacted: boolean;
  occurredAt: number;
}

export interface AnalyticsQueryRequest {
  organizationId: string;
  requesterId: string;
  dataset: "usage" | "quality" | "latency" | "cost" | "audit";
  from: number;
  to: number;
  aggregateOnly: boolean;
  exportRequested: boolean;
  approvalPresent: boolean;
  rowLimit: number;
}

export interface LegalPolicyAcceptance {
  organizationId: string;
  subjectHash: string;
  policyKind: LegalPolicyKind;
  policyVersion: string;
  locale: string;
  accepted: boolean;
  consentEvidenceHash: string;
  effectiveAt: number;
}

export interface VulnerabilityDisclosure {
  organizationId: string;
  disclosureId: string;
  reporterHash: string;
  affectedComponent: string;
  severity: VulnerabilitySeverity;
  reportHash: string;
  fixCommitHash?: string;
  publicDisclosureApproved: boolean;
  bountyDecision: "none" | "review" | "approved";
  disclosedAt?: number;
}

export interface DataGovernanceDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class DataGovernanceRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataGovernanceRuntimeError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new DataGovernanceRuntimeError(`${label} is required`);
}

export function validateAnalyticsEventEnvelope(event: AnalyticsEventEnvelope): DataGovernanceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[event.organizationId, "organizationId"], [event.eventId, "eventId"], [event.eventType, "eventType"], [event.actorHash, "actorHash"], [event.payloadHash, "payloadHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 0) reasons.push("event sequence is invalid");
  if (!Number.isFinite(event.occurredAt)) reasons.push("event timestamp is invalid");
  if (!event.piiRedacted) reasons.push("analytics event requires PII redaction");
  if (event.dataClass === "confidential" && event.retention !== "audit") reasons.push("confidential events require audit retention");
  return { allowed: reasons.length === 0, reasons, requiresApproval: event.retention === "audit", auditHash: hash(JSON.stringify({ event, reasons })) };
}

export function decideGovernedAnalyticsQuery(request: AnalyticsQueryRequest): DataGovernanceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.requesterId, "requesterId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(request.from) || !Number.isFinite(request.to) || request.to <= request.from) reasons.push("analytics time range is invalid");
  if (!Number.isSafeInteger(request.rowLimit) || request.rowLimit < 1 || request.rowLimit > 10_000) reasons.push("analytics row limit is outside bounds");
  if (request.dataset === "audit" && !request.aggregateOnly && !request.approvalPresent) reasons.push("raw audit query requires approval");
  if (request.exportRequested && !request.approvalPresent) reasons.push("analytics export requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.exportRequested || request.dataset === "audit", auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateLegalPolicyAcceptance(acceptance: LegalPolicyAcceptance): DataGovernanceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[acceptance.organizationId, "organizationId"], [acceptance.subjectHash, "subjectHash"], [acceptance.policyVersion, "policyVersion"], [acceptance.locale, "locale"], [acceptance.consentEvidenceHash, "consentEvidenceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!acceptance.accepted) reasons.push("policy acceptance is required");
  if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(acceptance.locale)) reasons.push("locale must be BCP-47-like");
  if (!Number.isFinite(acceptance.effectiveAt)) reasons.push("policy effective time is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ acceptance, reasons })) };
}

export function decideVulnerabilityDisclosure(disclosure: VulnerabilityDisclosure): DataGovernanceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[disclosure.organizationId, "organizationId"], [disclosure.disclosureId, "disclosureId"], [disclosure.reporterHash, "reporterHash"], [disclosure.affectedComponent, "affectedComponent"], [disclosure.reportHash, "reportHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (["high", "critical"].includes(disclosure.severity) && !disclosure.fixCommitHash) reasons.push("high severity disclosure needs a tracked fix");
  if (disclosure.publicDisclosureApproved && !disclosure.disclosedAt) reasons.push("public disclosure needs disclosure time");
  if (disclosure.bountyDecision === "approved" && disclosure.severity === "low") reasons.push("low severity report needs review before bounty approval");
  if (/password|secret|token|api[_-]?key/i.test(disclosure.reportHash)) reasons.push("report reference must not contain raw secret");
  return { allowed: reasons.length === 0, reasons, requiresApproval: disclosure.publicDisclosureApproved || disclosure.bountyDecision === "approved", auditHash: hash(JSON.stringify({ disclosure, reasons })) };
}
