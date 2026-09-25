/** M202 fail-closed contracts for human approval integrity and decision expiry. */

export type M202ApprovalOutcome = "approve" | "deny" | "request_changes";

export interface M202ApprovalRequest {
  organizationId: string;
  requestId: string;
  actionType: string;
  targetReferenceHash: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  evidenceHash: string;
  policyHash: string;
  requestedAt: number;
  expiresAt: number;
  requesterHash: string;
  selfApprovalForbidden: boolean;
  tenantBound: boolean;
}

export interface M202ApprovalDecision {
  organizationId: string;
  requestId: string;
  decisionId: string;
  outcome: M202ApprovalOutcome;
  decisionHash: string;
  approverHash: string;
  signed: boolean;
  requestMatch: boolean;
  policyMatch: boolean;
  decidedAt: number;
  expiresAt: number;
  humanPresent: boolean;
  tenantMatch: boolean;
}

export interface M202DecisionRevocation {
  organizationId: string;
  requestId: string;
  revocationId: string;
  decisionHash: string;
  reasonHash: string;
  revokedAt: number;
  propagated: boolean;
  blocked: boolean;
  tenantMatch: boolean;
}

export interface M202Escalation {
  organizationId: string;
  requestId: string;
  escalationId: string;
  fromRisk: "low" | "medium" | "high" | "critical";
  toRisk: "low" | "medium" | "high" | "critical";
  reasonHash: string;
  secondReviewerRequired: boolean;
  secondReviewerPresent: boolean;
  approvalPresent: boolean;
  tenantMatch: boolean;
}

export interface M202ApprovalGateDecision {
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

export function validateM202Request(request: M202ApprovalRequest, now: number): M202ApprovalGateDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.requestId, "requestId"], [request.actionType, "actionType"], [request.targetReferenceHash, "targetReferenceHash"], [request.evidenceHash, "evidenceHash"], [request.policyHash, "policyHash"], [request.requesterHash, "requesterHash"]], reasons);
  if (!Number.isFinite(request.requestedAt) || !Number.isFinite(request.expiresAt) || request.expiresAt <= request.requestedAt || request.expiresAt <= now || !request.selfApprovalForbidden || !request.tenantBound) reasons.push("approval request needs bounded expiry, no-self-approval and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ request, now, reasons })) };
}

export function decideM202Approval(decision: M202ApprovalDecision, now: number): M202ApprovalGateDecision {
  const reasons: string[] = [];
  required([[decision.organizationId, "organizationId"], [decision.requestId, "requestId"], [decision.decisionId, "decisionId"], [decision.decisionHash, "decisionHash"], [decision.approverHash, "approverHash"]], reasons);
  if (!decision.signed || !decision.requestMatch || !decision.policyMatch || !Number.isFinite(decision.decidedAt) || !Number.isFinite(decision.expiresAt) || decision.expiresAt <= decision.decidedAt || decision.expiresAt <= now || !decision.humanPresent || !decision.tenantMatch) reasons.push("approval decision needs signature, request/policy match, freshness, human and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ decision, now, reasons })) };
}

export function decideM202Revocation(revocation: M202DecisionRevocation): M202ApprovalGateDecision {
  const reasons: string[] = [];
  required([[revocation.organizationId, "organizationId"], [revocation.requestId, "requestId"], [revocation.revocationId, "revocationId"], [revocation.decisionHash, "decisionHash"], [revocation.reasonHash, "reasonHash"]], reasons);
  if (!Number.isFinite(revocation.revokedAt) || !revocation.propagated || !revocation.blocked || !revocation.tenantMatch) reasons.push("approval revocation needs timestamp, propagation, block and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ revocation, reasons })) };
}

export function validateM202Escalation(escalation: M202Escalation): M202ApprovalGateDecision {
  const reasons: string[] = [];
  required([[escalation.organizationId, "organizationId"], [escalation.requestId, "requestId"], [escalation.escalationId, "escalationId"], [escalation.reasonHash, "reasonHash"]], reasons);
  if (escalation.secondReviewerRequired && !escalation.secondReviewerPresent || !escalation.approvalPresent || !escalation.tenantMatch) reasons.push("escalation needs required second reviewer, approval and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ escalation, reasons })) };
}
