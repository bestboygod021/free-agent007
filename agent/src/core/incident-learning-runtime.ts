/** M173 fail-closed contracts for incident learning, runbook actions and postmortems. */

export type M173IncidentSeverity = "low" | "medium" | "high" | "critical";
export type M173CaseState = "open" | "contained" | "resolved" | "closed";

export interface M173IncidentSignal {
  organizationId: string;
  signalId: string;
  sourceReference: string;
  category: string;
  severity: M173IncidentSeverity;
  observedAt: number;
  fingerprint: string;
  evidenceHash: string;
  tenantBound: boolean;
  redacted: boolean;
  dedupeKey: string;
}

export interface M173IncidentCase {
  organizationId: string;
  caseId: string;
  signalIds: string[];
  severity: M173IncidentSeverity;
  state: M173CaseState;
  commanderReference: string;
  customerImpactHash: string;
  containmentPlanHash: string;
  createdAt: number;
  resolvedAt?: number;
  approvalPresent: boolean;
  tenantMatch: boolean;
}

export interface M173RunbookStep {
  organizationId: string;
  caseId: string;
  stepId: string;
  order: number;
  action: "inspect" | "contain" | "rollback" | "notify" | "restore";
  commandHash: string;
  reversible: boolean;
  approvalRequired: boolean;
  approved: boolean;
  evidenceHash: string;
  noRawSecrets: boolean;
}

export interface M173LearningRecord {
  organizationId: string;
  caseId: string;
  learningId: string;
  rootCauseHash: string;
  contributingFactorsHash: string;
  correctiveActionHash: string;
  regressionTestHash: string;
  ownerReference: string;
  dueAt: number;
  privacyReviewed: boolean;
  approved: boolean;
}

export interface M173IncidentDecision {
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

export function validateM173Signal(signal: M173IncidentSignal): M173IncidentDecision {
  const reasons: string[] = [];
  required([[signal.organizationId, "organizationId"], [signal.signalId, "signalId"], [signal.sourceReference, "sourceReference"], [signal.category, "category"], [signal.fingerprint, "fingerprint"], [signal.evidenceHash, "evidenceHash"], [signal.dedupeKey, "dedupeKey"]], reasons);
  if (!Number.isFinite(signal.observedAt) || !signal.tenantBound || !signal.redacted) reasons.push("signal needs time, tenant binding and redaction");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ signal, reasons })) };
}

export function decideM173Case(incident: M173IncidentCase): M173IncidentDecision {
  const reasons: string[] = [];
  required([[incident.organizationId, "organizationId"], [incident.caseId, "caseId"], [incident.commanderReference, "commanderReference"], [incident.customerImpactHash, "customerImpactHash"], [incident.containmentPlanHash, "containmentPlanHash"]], reasons);
  if (incident.signalIds.length === 0 || !Number.isFinite(incident.createdAt) || !incident.tenantMatch || !incident.approvalPresent) reasons.push("case needs signal, time, tenant and approval evidence");
  if (incident.state === "resolved" || incident.state === "closed") if (incident.resolvedAt === undefined || incident.resolvedAt < incident.createdAt) reasons.push("resolved case needs valid resolution time");
  return { allowed: reasons.length === 0, reasons, requiresApproval: incident.severity === "critical", auditHash: hash(JSON.stringify({ incident, reasons })) };
}

export function validateM173RunbookStep(step: M173RunbookStep): M173IncidentDecision {
  const reasons: string[] = [];
  required([[step.organizationId, "organizationId"], [step.caseId, "caseId"], [step.stepId, "stepId"], [step.commandHash, "commandHash"], [step.evidenceHash, "evidenceHash"]], reasons);
  if (!Number.isInteger(step.order) || step.order < 1) reasons.push("runbook order is invalid");
  if (step.approvalRequired && !step.approved) reasons.push("runbook step needs approval");
  if (!step.reversible && step.action !== "inspect" && !step.approved) reasons.push("irreversible step needs approval");
  if (!step.noRawSecrets) reasons.push("runbook step cannot expose raw secrets");
  return { allowed: reasons.length === 0, reasons, requiresApproval: step.approvalRequired, auditHash: hash(JSON.stringify({ step, reasons })) };
}

export function decideM173Learning(record: M173LearningRecord, now: number): M173IncidentDecision {
  const reasons: string[] = [];
  required([[record.organizationId, "organizationId"], [record.caseId, "caseId"], [record.learningId, "learningId"], [record.rootCauseHash, "rootCauseHash"], [record.contributingFactorsHash, "contributingFactorsHash"], [record.correctiveActionHash, "correctiveActionHash"], [record.regressionTestHash, "regressionTestHash"], [record.ownerReference, "ownerReference"]], reasons);
  if (!Number.isFinite(record.dueAt) || record.dueAt < now || !record.privacyReviewed || !record.approved) reasons.push("learning record needs future due date, privacy review and approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ record, now, reasons })) };
}
