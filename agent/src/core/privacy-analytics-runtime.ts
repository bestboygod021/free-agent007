/** M203 fail-closed contracts for privacy-preserving analytics and aggregation. */

export interface M203AnalyticsEvent {
  organizationId: string;
  eventId: string;
  metricName: string;
  dimensionsHash: string;
  subjectHash: string;
  consentPresent: boolean;
  samplingRateBps: number;
  redacted: boolean;
  privacyBudgetEpsilon: number;
  tenantBound: boolean;
}

export interface M203Aggregate {
  organizationId: string;
  aggregateId: string;
  metricName: string;
  windowStart: number;
  windowEnd: number;
  sampleCount: number;
  cohortCount: number;
  epsilon: number;
  noiseHash: string;
  minCohortSize: number;
  kAnonymitySatisfied: boolean;
  approved: boolean;
  redacted: boolean;
  tenantBound: boolean;
}

export interface M203ExportDisclosure {
  organizationId: string;
  exportId: string;
  aggregateId: string;
  purposeHash: string;
  recipientHash: string;
  fields: string[];
  userVisible: boolean;
  consentPresent: boolean;
  noRawSubjectData: boolean;
  expiryAt: number;
  tenantMatch: boolean;
}

export interface M203DeletionPropagation {
  organizationId: string;
  subjectHash: string;
  deletionId: string;
  stores: string[];
  derivedAggregates: string[];
  propagationEvidenceHash: string;
  completedAt: number;
  residualSubjectData: boolean;
  tenantMatch: boolean;
}

export interface M203AnalyticsDecision {
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

export function validateM203Event(event: M203AnalyticsEvent): M203AnalyticsDecision {
  const reasons: string[] = [];
  required([[event.organizationId, "organizationId"], [event.eventId, "eventId"], [event.metricName, "metricName"], [event.dimensionsHash, "dimensionsHash"], [event.subjectHash, "subjectHash"]], reasons);
  if (!event.consentPresent || !Number.isInteger(event.samplingRateBps) || event.samplingRateBps < 1 || event.samplingRateBps > 10_000 || !event.redacted || !Number.isFinite(event.privacyBudgetEpsilon) || event.privacyBudgetEpsilon <= 0 || event.privacyBudgetEpsilon > 10 || !event.tenantBound) reasons.push("analytics event needs consent, bounded sampling/privacy budget, redaction and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ event, reasons })) };
}

export function validateM203Aggregate(aggregate: M203Aggregate): M203AnalyticsDecision {
  const reasons: string[] = [];
  required([[aggregate.organizationId, "organizationId"], [aggregate.aggregateId, "aggregateId"], [aggregate.metricName, "metricName"], [aggregate.noiseHash, "noiseHash"]], reasons);
  if (!Number.isFinite(aggregate.windowStart) || !Number.isFinite(aggregate.windowEnd) || aggregate.windowEnd <= aggregate.windowStart || !Number.isInteger(aggregate.sampleCount) || aggregate.sampleCount < 1 || !Number.isInteger(aggregate.cohortCount) || aggregate.cohortCount < 1 || !Number.isFinite(aggregate.epsilon) || aggregate.epsilon <= 0 || !Number.isInteger(aggregate.minCohortSize) || aggregate.minCohortSize < 2 || aggregate.cohortCount < aggregate.minCohortSize || !aggregate.kAnonymitySatisfied || !aggregate.approved || !aggregate.redacted || !aggregate.tenantBound) reasons.push("aggregate needs bounded window/sample/cohort, noise, k-anonymity, approval, redaction and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ aggregate, reasons })) };
}

export function decideM203Export(disclosure: M203ExportDisclosure, now: number): M203AnalyticsDecision {
  const reasons: string[] = [];
  required([[disclosure.organizationId, "organizationId"], [disclosure.exportId, "exportId"], [disclosure.aggregateId, "aggregateId"], [disclosure.purposeHash, "purposeHash"], [disclosure.recipientHash, "recipientHash"]], reasons);
  if (disclosure.fields.length === 0 || disclosure.fields.some((field) => !field.trim()) || !disclosure.userVisible || !disclosure.consentPresent || !disclosure.noRawSubjectData || !Number.isFinite(disclosure.expiryAt) || disclosure.expiryAt <= now || !disclosure.tenantMatch) reasons.push("analytics export needs bounded fields, visibility, consent, no-raw-data, expiry and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ disclosure, now, reasons })) };
}

export function validateM203Deletion(propagation: M203DeletionPropagation): M203AnalyticsDecision {
  const reasons: string[] = [];
  required([[propagation.organizationId, "organizationId"], [propagation.subjectHash, "subjectHash"], [propagation.deletionId, "deletionId"], [propagation.propagationEvidenceHash, "propagationEvidenceHash"]], reasons);
  if (propagation.stores.length === 0 || propagation.stores.some((store) => !store.trim()) || propagation.derivedAggregates.some((aggregate) => !aggregate.trim()) || !Number.isFinite(propagation.completedAt) || propagation.residualSubjectData || !propagation.tenantMatch) reasons.push("analytics deletion needs store/derived propagation, completion, no residual data and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ propagation, reasons })) };
}
