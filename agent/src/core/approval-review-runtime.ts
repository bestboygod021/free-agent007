/** M92 contracts for human review, approval queues, decisions and escalation. */

export type HumanApprovalRisk = "low" | "medium" | "high" | "critical";
export type ApprovalDecision = "approve" | "reject" | "request_changes" | "expire";
export type ReviewQueue = "security" | "privacy" | "release" | "billing" | "tool_action";

export interface ApprovalRequestEnvelope {
  organizationId: string;
  requestId: string;
  subjectType: "tool_call" | "release" | "deletion" | "billing" | "connector";
  subjectHash: string;
  queue: ReviewQueue;
  risk: HumanApprovalRisk;
  requestedBy: string;
  expiresAt: number;
  evidenceHash: string;
  separationRequired: boolean;
}

export interface ReviewAssignment {
  organizationId: string;
  requestId: string;
  reviewerId: string;
  reviewerRole: "owner" | "admin" | "security" | "privacy" | "finance" | "reviewer";
  assignedAt: number;
  selfReviewForbidden: boolean;
  secondReviewerRequired: boolean;
  secondReviewerPresent: boolean;
}

export interface HumanDecisionRecord {
  organizationId: string;
  requestId: string;
  reviewerId: string;
  decision: ApprovalDecision;
  reasonHash: string;
  observedAt: number;
  evidenceReviewed: boolean;
  conflictOfInterest: boolean;
  signatureReference: string;
}

export interface ApprovalEscalation {
  organizationId: string;
  requestId: string;
  fromLevel: number;
  toLevel: number;
  trigger: "timeout" | "critical_risk" | "reviewer_unavailable" | "policy_conflict";
  notifiedRole: string;
  approvalPresent: boolean;
  escalatedAt: number;
}

export interface ApprovalReviewDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class ApprovalReviewContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalReviewContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function validateApprovalRequestEnvelope(request: ApprovalRequestEnvelope, now: number): ApprovalReviewDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.requestId, "requestId"], [request.subjectHash, "subjectHash"], [request.requestedBy, "requestedBy"], [request.evidenceHash, "evidenceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(request.expiresAt) || request.expiresAt <= now) reasons.push("approval request is expired");
  if (request.risk === "critical" && !request.separationRequired) reasons.push("critical request needs separation of duties");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ request, now, reasons })) };
}

export function decideReviewAssignment(assignment: ReviewAssignment): ApprovalReviewDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[assignment.organizationId, "organizationId"], [assignment.requestId, "requestId"], [assignment.reviewerId, "reviewerId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!assignment.selfReviewForbidden) reasons.push("self-review must be forbidden");
  if (assignment.secondReviewerRequired && !assignment.secondReviewerPresent) reasons.push("second reviewer is required");
  if (assignment.reviewerRole === "reviewer" && !["tool_action", "release"].includes("tool_action")) reasons.push("reviewer role cannot review this queue");
  if (!Number.isFinite(assignment.assignedAt)) reasons.push("assignment timestamp is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ assignment, reasons })) };
}

export function validateHumanDecisionRecord(decision: HumanDecisionRecord): ApprovalReviewDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[decision.organizationId, "organizationId"], [decision.requestId, "requestId"], [decision.reviewerId, "reviewerId"], [decision.reasonHash, "reasonHash"], [decision.signatureReference, "signatureReference"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(decision.observedAt)) reasons.push("decision timestamp is invalid");
  if (!decision.evidenceReviewed) reasons.push("reviewer must confirm evidence review");
  if (decision.conflictOfInterest) reasons.push("conflicted reviewer cannot decide");
  if (decision.decision === "approve" && !decision.signatureReference) reasons.push("approval needs signature reference");
  return { allowed: reasons.length === 0, reasons, requiresApproval: decision.decision === "approve", auditHash: hash(JSON.stringify({ decision, reasons })) };
}

export function decideApprovalEscalation(escalation: ApprovalEscalation): ApprovalReviewDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[escalation.organizationId, "organizationId"], [escalation.requestId, "requestId"], [escalation.notifiedRole, "notifiedRole"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isSafeInteger(escalation.fromLevel) || !Number.isSafeInteger(escalation.toLevel) || escalation.toLevel <= escalation.fromLevel) reasons.push("escalation levels must increase");
  if (escalation.trigger === "critical_risk" && !escalation.approvalPresent) reasons.push("critical escalation needs approval evidence");
  if (!Number.isFinite(escalation.escalatedAt)) reasons.push("escalation timestamp is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ escalation, reasons })) };
}
