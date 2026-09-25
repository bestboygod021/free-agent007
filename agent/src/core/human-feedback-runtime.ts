/** M186 fail-closed contracts for human feedback and preference governance. */

export type M186FeedbackLabel = "approve" | "reject" | "edit" | "score";

export interface M186Feedback {
  organizationId: string;
  feedbackId: string;
  taskId: string;
  subjectHash: string;
  label: M186FeedbackLabel;
  score: number;
  rubricHash: string;
  sourceHash: string;
  consentPresent: boolean;
  redacted: boolean;
  tenantMatch: boolean;
}

export interface M186Aggregate {
  organizationId: string;
  aggregateId: string;
  taskFamily: string;
  sampleCount: number;
  positiveCount: number;
  negativeCount: number;
  meanScore: number;
  metricHash: string;
  privacyReviewed: boolean;
  biasReviewed: boolean;
  noDirectModelUpdate: boolean;
  approved: boolean;
  tenantMatch: boolean;
}

export interface M186PreferenceUpdate {
  organizationId: string;
  updateId: string;
  datasetHash: string;
  evaluationHash: string;
  canaryHash: string;
  rollbackHash: string;
  bounded: boolean;
  approvalPresent: boolean;
  regressionPassed: boolean;
  tenantMatch: boolean;
}

export interface M186FeedbackDisclosure {
  organizationId: string;
  disclosureId: string;
  purposeHash: string;
  retentionSeconds: number;
  userVisible: boolean;
  optOutAvailable: boolean;
  noTrainingByDefault: boolean;
  approved: boolean;
  tenantMatch: boolean;
}

export interface M186FeedbackDecision {
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

export function validateM186Feedback(feedback: M186Feedback): M186FeedbackDecision {
  const reasons: string[] = [];
  required([[feedback.organizationId, "organizationId"], [feedback.feedbackId, "feedbackId"], [feedback.taskId, "taskId"], [feedback.subjectHash, "subjectHash"], [feedback.rubricHash, "rubricHash"], [feedback.sourceHash, "sourceHash"]], reasons);
  if (!Number.isFinite(feedback.score) || feedback.score < 0 || feedback.score > 1 || !feedback.consentPresent || !feedback.redacted || !feedback.tenantMatch) reasons.push("feedback score, consent, redaction or tenant gate failed");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ feedback, reasons })) };
}

export function validateM186Aggregate(aggregate: M186Aggregate): M186FeedbackDecision {
  const reasons: string[] = [];
  required([[aggregate.organizationId, "organizationId"], [aggregate.aggregateId, "aggregateId"], [aggregate.taskFamily, "taskFamily"], [aggregate.metricHash, "metricHash"]], reasons);
  if (!Number.isInteger(aggregate.sampleCount) || aggregate.sampleCount < 1 || aggregate.positiveCount < 0 || aggregate.negativeCount < 0 || aggregate.positiveCount + aggregate.negativeCount > aggregate.sampleCount || !Number.isFinite(aggregate.meanScore) || aggregate.meanScore < 0 || aggregate.meanScore > 1 || !aggregate.privacyReviewed || !aggregate.biasReviewed || !aggregate.noDirectModelUpdate || !aggregate.approved || !aggregate.tenantMatch) reasons.push("aggregate needs bounded samples, privacy, bias, approval and no-direct-update proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ aggregate, reasons })) };
}

export function decideM186PreferenceUpdate(update: M186PreferenceUpdate): M186FeedbackDecision {
  const reasons: string[] = [];
  required([[update.organizationId, "organizationId"], [update.updateId, "updateId"], [update.datasetHash, "datasetHash"], [update.evaluationHash, "evaluationHash"], [update.canaryHash, "canaryHash"], [update.rollbackHash, "rollbackHash"]], reasons);
  if (!update.bounded || !update.approvalPresent || !update.regressionPassed || !update.tenantMatch) reasons.push("preference update needs bound, approval, regression and tenant evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ update, reasons })) };
}

export function decideM186Disclosure(disclosure: M186FeedbackDisclosure): M186FeedbackDecision {
  const reasons: string[] = [];
  required([[disclosure.organizationId, "organizationId"], [disclosure.disclosureId, "disclosureId"], [disclosure.purposeHash, "purposeHash"]], reasons);
  if (!Number.isInteger(disclosure.retentionSeconds) || disclosure.retentionSeconds < 1 || disclosure.retentionSeconds > 31_536_000 || !disclosure.userVisible || !disclosure.optOutAvailable || !disclosure.noTrainingByDefault || !disclosure.approved || !disclosure.tenantMatch) reasons.push("feedback disclosure needs bounded retention, visibility, opt-out and training safeguards");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ disclosure, reasons })) };
}
