/** M138 contracts for consented telemetry, privacy-preserving feedback and retention. */

export type M138Purpose = "reliability" | "quality" | "product_usage" | "security";
export type M138FeedbackCategory = "bug" | "quality" | "safety" | "accessibility" | "feature_request";
export type M138FeedbackState = "received" | "moderated" | "accepted" | "rejected";

export interface M138TelemetryConsent {
  organizationId: string;
  consentId: string;
  subjectReference: string;
  purposes: M138Purpose[];
  grantedAt: number;
  expiresAt: number;
  retentionDays: number;
  samplingRate: number;
  localOnly: boolean;
  exportAllowed: boolean;
  explicit: boolean;
  withdrawable: boolean;
}

export interface M138TelemetryEvent {
  organizationId: string;
  eventId: string;
  consentId: string;
  schemaVersion: string;
  eventType: string;
  payloadHash: string;
  dimensionsHash: string;
  piiRedacted: boolean;
  rawPayloadStored: false;
  sampled: boolean;
  capturedAt: number;
  sourceLocalOnly: boolean;
}

export interface M138FeedbackRecord {
  organizationId: string;
  feedbackId: string;
  category: M138FeedbackCategory;
  rating?: number;
  commentHash: string;
  sourceHash: string;
  consentId: string;
  state: M138FeedbackState;
  piiRedacted: boolean;
  secretFree: boolean;
  submittedAt: number;
}

export interface M138RetentionDecision {
  organizationId: string;
  consentId: string;
  deleteAfter: number;
  legalHold: boolean;
  anonymized: boolean;
  deletionJobReference: string;
  downstreamsNotified: boolean;
}

export interface M138TelemetryDecision {
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

export function validateM138Consent(consent: M138TelemetryConsent, now: number): M138TelemetryDecision {
  const reasons: string[] = [];
  required([[consent.organizationId, "organizationId"], [consent.consentId, "consentId"], [consent.subjectReference, "subjectReference"]], reasons);
  if (consent.purposes.length === 0) reasons.push("consent must declare purpose");
  if (!consent.explicit || !consent.withdrawable) reasons.push("consent must be explicit and withdrawable");
  if (!Number.isFinite(consent.grantedAt) || !Number.isFinite(consent.expiresAt) || consent.expiresAt <= consent.grantedAt || consent.expiresAt <= now) reasons.push("consent lifetime is invalid");
  if (!Number.isInteger(consent.retentionDays) || consent.retentionDays < 1 || consent.retentionDays > 3650) reasons.push("retention days must be between one and 3650");
  if (!Number.isFinite(consent.samplingRate) || consent.samplingRate <= 0 || consent.samplingRate > 1) reasons.push("sampling rate must be greater than zero and at most one");
  if (/email|password|secret|token|key/i.test(consent.subjectReference)) reasons.push("subject reference must be opaque");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ consent, now, reasons })) };
}

export function decideM138Telemetry(event: M138TelemetryEvent, consent: M138TelemetryConsent, now: number): M138TelemetryDecision {
  const reasons: string[] = [];
  const consentDecision = validateM138Consent(consent, now);
  reasons.push(...consentDecision.reasons);
  required([[event.organizationId, "organizationId"], [event.eventId, "eventId"], [event.consentId, "consentId"], [event.schemaVersion, "schemaVersion"], [event.eventType, "eventType"], [event.payloadHash, "payloadHash"], [event.dimensionsHash, "dimensionsHash"]], reasons);
  if (event.organizationId !== consent.organizationId || event.consentId !== consent.consentId) reasons.push("event and consent boundaries do not match");
  if (!event.piiRedacted || event.rawPayloadStored !== false || !event.sampled) reasons.push("telemetry needs redaction, no raw payload and sampling evidence");
  if (event.sourceLocalOnly !== consent.localOnly) reasons.push("local-only source must match consent");
  if (!Number.isFinite(event.capturedAt) || event.capturedAt > now) reasons.push("capturedAt is invalid");
  if (event.sourceLocalOnly === false && !consent.exportAllowed) reasons.push("cloud telemetry needs export permission");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ event, consentId: consent.consentId, now, reasons })) };
}

export function validateM138Feedback(feedback: M138FeedbackRecord): M138TelemetryDecision {
  const reasons: string[] = [];
  required([[feedback.organizationId, "organizationId"], [feedback.feedbackId, "feedbackId"], [feedback.commentHash, "commentHash"], [feedback.sourceHash, "sourceHash"], [feedback.consentId, "consentId"]], reasons);
  if (feedback.rating !== undefined && (!Number.isInteger(feedback.rating) || feedback.rating < 1 || feedback.rating > 5)) reasons.push("rating must be an integer between one and five");
  if (!feedback.piiRedacted || !feedback.secretFree) reasons.push("feedback must be PII-redacted and secret-free");
  if (!Number.isFinite(feedback.submittedAt)) reasons.push("submittedAt is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: feedback.state === "accepted", auditHash: hash(JSON.stringify({ feedback, reasons })) };
}

export function decideM138Retention(retention: M138RetentionDecision, now: number): M138TelemetryDecision {
  const reasons: string[] = [];
  required([[retention.organizationId, "organizationId"], [retention.consentId, "consentId"], [retention.deletionJobReference, "deletionJobReference"]], reasons);
  if (!Number.isFinite(retention.deleteAfter) || retention.deleteAfter <= now) reasons.push("retention deleteAfter must be in the future");
  if (retention.legalHold && retention.anonymized) reasons.push("legal hold cannot be combined with immediate anonymization");
  if (!retention.anonymized && !retention.legalHold) reasons.push("retention must anonymize or declare legal hold");
  if (!retention.downstreamsNotified) reasons.push("downstream deletion notification is required");
  return { allowed: reasons.length === 0, reasons, requiresApproval: retention.legalHold, auditHash: hash(JSON.stringify({ retention, now, reasons })) };
}
