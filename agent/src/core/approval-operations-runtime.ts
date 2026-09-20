/** M131 contracts for human approvals, review assignments, decisions and escalation. */

export type M131Risk = "low" | "medium" | "high" | "critical";
export type M131Decision = "approve" | "reject" | "request_changes" | "expire";
export type M131Queue = "security" | "privacy" | "release" | "billing" | "tool_action" | "deletion";

export interface M131ApprovalRequest {
  organizationId: string;
  requestId: string;
  subjectType: "tool_call" | "release" | "deletion" | "billing" | "connector";
  subjectHash: string;
  queue: M131Queue;
  risk: M131Risk;
  requestedByHash: string;
  evidenceHash: string;
  expiresAt: number;
  separationRequired: boolean;
  customerImpactRedacted: boolean;
}

export interface M131ReviewAssignment {
  organizationId: string;
  requestId: string;
  reviewerHash: string;
  reviewerRole: "owner" | "admin" | "security" | "privacy" | "finance" | "reviewer";
  assignedAt: number;
  selfReviewForbidden: boolean;
  secondReviewerRequired: boolean;
  secondReviewerPresent: boolean;
  unavailableAfter: number;
}

export interface M131DecisionRecord {
  organizationId: string;
  requestId: string;
  reviewerHash: string;
  decision: M131Decision;
  reasonHash: string;
  observedAt: number;
  evidenceReviewed: boolean;
  conflictOfInterest: boolean;
  signatureReference: string;
}

export interface M131Escalation {
  organizationId: string;
  requestId: string;
  fromLevel: number;
  toLevel: number;
  trigger: "timeout" | "critical_risk" | "reviewer_unavailable" | "policy_conflict";
  notifiedRole: string;
  approvalPresent: boolean;
  escalatedAt: number;
  customerImpactRedacted: boolean;
}

export interface M131ApprovalDecision {
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

export function validateM131Approval(request: M131ApprovalRequest, now: number): M131ApprovalDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.requestId, "requestId"], [request.subjectHash, "subjectHash"], [request.requestedByHash, "requestedByHash"], [request.evidenceHash, "evidenceHash"]], reasons);
  if (!Number.isFinite(request.expiresAt) || request.expiresAt <= now) reasons.push("approval request is expired");
  if (request.risk === "critical" && !request.separationRequired) reasons.push("critical approval needs separation of duties");
  if (!request.customerImpactRedacted) reasons.push("customer impact must be redacted");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ request, now, reasons })) };
}

export function decideM131Assignment(assignment: M131ReviewAssignment): M131ApprovalDecision {
  const reasons: string[] = [];
  required([[assignment.organizationId, "organizationId"], [assignment.requestId, "requestId"], [assignment.reviewerHash, "reviewerHash"]], reasons);
  if (!assignment.selfReviewForbidden) reasons.push("self-review must be forbidden");
  if (assignment.secondReviewerRequired && !assignment.secondReviewerPresent) reasons.push("second reviewer is required");
  if (!Number.isFinite(assignment.assignedAt) || !Number.isFinite(assignment.unavailableAfter) || assignment.unavailableAfter <= assignment.assignedAt) reasons.push("review assignment window is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ assignment, reasons })) };
}

export function validateM131DecisionRecord(decision: M131DecisionRecord): M131ApprovalDecision {
  const reasons: string[] = [];
  required([[decision.organizationId, "organizationId"], [decision.requestId, "requestId"], [decision.reviewerHash, "reviewerHash"], [decision.reasonHash, "reasonHash"], [decision.signatureReference, "signatureReference"]], reasons);
  if (!Number.isFinite(decision.observedAt)) reasons.push("decision timestamp is invalid");
  if (!decision.evidenceReviewed) reasons.push("reviewer must confirm evidence review");
  if (decision.conflictOfInterest) reasons.push("conflicted reviewer cannot decide");
  if (decision.decision === "approve" && !decision.signatureReference) reasons.push("approval needs signature reference");
  return { allowed: reasons.length === 0, reasons, requiresApproval: decision.decision === "approve", auditHash: hash(JSON.stringify({ decision, reasons })) };
}

export function decideM131Escalation(escalation: M131Escalation): M131ApprovalDecision {
  const reasons: string[] = [];
  required([[escalation.organizationId, "organizationId"], [escalation.requestId, "requestId"], [escalation.notifiedRole, "notifiedRole"]], reasons);
  if (!Number.isSafeInteger(escalation.fromLevel) || !Number.isSafeInteger(escalation.toLevel) || escalation.toLevel <= escalation.fromLevel) reasons.push("escalation level must increase");
  if (escalation.trigger === "critical_risk" && !escalation.approvalPresent) reasons.push("critical escalation needs approval evidence");
  if (!Number.isFinite(escalation.escalatedAt)) reasons.push("escalation timestamp is invalid");
  if (!escalation.customerImpactRedacted) reasons.push("escalation customer impact must be redacted");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ escalation, reasons })) };
}
