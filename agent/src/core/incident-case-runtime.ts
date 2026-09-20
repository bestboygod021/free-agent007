/** M137 contracts for incident intake, bounded containment and postmortem evidence. */

export type M137Severity = "low" | "medium" | "high" | "critical";
export type M137State = "open" | "contained" | "monitoring" | "resolved";
export type M137ActionKind = "pause_run" | "revoke_session" | "disable_connector" | "isolate_worker" | "read_only";

export interface M137IncidentSignal {
  organizationId: string;
  signalId: string;
  source: "alert" | "user_report" | "audit_replay" | "drill";
  severity: M137Severity;
  category: string;
  dedupeKey: string;
  evidenceHash: string;
  detectedAt: number;
  tenantBound: boolean;
  redacted: boolean;
}

export interface M137IncidentCase {
  organizationId: string;
  caseId: string;
  signalId: string;
  severity: M137Severity;
  state: M137State;
  ownerReference: string;
  impactSummaryHash: string;
  evidenceHashes: string[];
  openedAt: number;
  customerImpactRedacted: boolean;
  tenantBound: boolean;
  approvalPresent: boolean;
}

export interface M137ContainmentAction {
  organizationId: string;
  caseId: string;
  actionId: string;
  kind: M137ActionKind;
  blastRadius: "single_run" | "single_connector" | "single_worker" | "tenant_read_only";
  reversible: boolean;
  sandboxed: boolean;
  approvalPresent: boolean;
  noDataDeletion: boolean;
  operatorReference: string;
  executedAt: number;
}

export interface M137Postmortem {
  organizationId: string;
  caseId: string;
  timelineHash: string;
  rootCauseHash: string;
  contributingFactorsHash: string;
  actionItemsHash: string;
  customerImpactRedacted: boolean;
  reviewed: boolean;
  followUpDueAt: number;
  evidenceComplete: boolean;
}

export interface M137IncidentDecision {
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

export function validateM137Signal(signal: M137IncidentSignal): M137IncidentDecision {
  const reasons: string[] = [];
  required([[signal.organizationId, "organizationId"], [signal.signalId, "signalId"], [signal.category, "category"], [signal.dedupeKey, "dedupeKey"], [signal.evidenceHash, "evidenceHash"]], reasons);
  if (!Number.isFinite(signal.detectedAt)) reasons.push("detectedAt is invalid");
  if (!signal.tenantBound || !signal.redacted) reasons.push("incident signal must be tenant-bound and redacted");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ signal, reasons })) };
}

export function decideM137Case(incident: M137IncidentCase): M137IncidentDecision {
  const reasons: string[] = [];
  required([[incident.organizationId, "organizationId"], [incident.caseId, "caseId"], [incident.signalId, "signalId"], [incident.ownerReference, "ownerReference"], [incident.impactSummaryHash, "impactSummaryHash"]], reasons);
  if (incident.evidenceHashes.length === 0) reasons.push("incident case needs evidence references");
  if (!incident.tenantBound || !incident.customerImpactRedacted) reasons.push("case must be tenant-bound and redact customer impact");
  if (!Number.isFinite(incident.openedAt)) reasons.push("openedAt is invalid");
  if (incident.severity === "critical" && !incident.approvalPresent) reasons.push("critical case needs approval for operational ownership");
  return { allowed: reasons.length === 0, reasons, requiresApproval: incident.severity === "critical", auditHash: hash(JSON.stringify({ incident, reasons })) };
}

export function decideM137Containment(action: M137ContainmentAction): M137IncidentDecision {
  const reasons: string[] = [];
  required([[action.organizationId, "organizationId"], [action.caseId, "caseId"], [action.actionId, "actionId"], [action.operatorReference, "operatorReference"]], reasons);
  if (!action.reversible || !action.sandboxed || !action.noDataDeletion) reasons.push("containment must be reversible, sandboxed and non-destructive");
  if (!action.approvalPresent) reasons.push("containment needs approval");
  if (!Number.isFinite(action.executedAt)) reasons.push("executedAt is invalid");
  if (action.blastRadius === "tenant_read_only" && action.kind !== "read_only") reasons.push("tenant-wide containment must be read_only");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ action, reasons })) };
}

export function validateM137Postmortem(postmortem: M137Postmortem): M137IncidentDecision {
  const reasons: string[] = [];
  required([[postmortem.organizationId, "organizationId"], [postmortem.caseId, "caseId"], [postmortem.timelineHash, "timelineHash"], [postmortem.rootCauseHash, "rootCauseHash"], [postmortem.contributingFactorsHash, "contributingFactorsHash"], [postmortem.actionItemsHash, "actionItemsHash"]], reasons);
  if (!postmortem.customerImpactRedacted || !postmortem.reviewed || !postmortem.evidenceComplete) reasons.push("postmortem needs redaction, review and complete evidence");
  if (!Number.isFinite(postmortem.followUpDueAt)) reasons.push("follow-up due time is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ postmortem, reasons })) };
}
