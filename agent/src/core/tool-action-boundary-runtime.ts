/** M170 fail-closed contracts for tool-call approval and transactional action boundaries. */

export type M170ActionClass = "read" | "write" | "external" | "destructive";
export type M170ActionState = "planned" | "approved" | "executing" | "committed" | "rejected" | "rolled_back";

export interface M170ActionPlan {
  organizationId: string;
  actionId: string;
  runId: string;
  toolName: string;
  actionClass: M170ActionClass;
  targetReference: string;
  inputHash: string;
  expectedOutputHash: string;
  preconditionHash: string;
  rollbackPlanHash: string;
  state: M170ActionState;
  tenantBound: boolean;
  noMainMutation: boolean;
  approvalRequired: boolean;
}

export interface M170ToolCall {
  organizationId: string;
  callId: string;
  actionId: string;
  toolName: string;
  actionClass: M170ActionClass;
  targetReference: string;
  inputHash: string;
  idempotencyKey: string;
  state: M170ActionState;
  policyHash: string;
  timeoutMs: number;
  redacted: boolean;
  tenantMatch: boolean;
}

export interface M170Approval {
  organizationId: string;
  approvalId: string;
  actionId: string;
  reviewerReference: string;
  riskHash: string;
  approved: boolean;
  expiresAt: number;
  separatedDuties: boolean;
  reversible: boolean;
  secondReviewerRequired: boolean;
}

export interface M170Commit {
  organizationId: string;
  actionId: string;
  commitId: string;
  outputHash: string;
  evidenceHash: string;
  state: "committed" | "rolled_back";
  preconditionMatched: boolean;
  rollbackEvidenceHash?: string;
  noUnexpectedChanges: boolean;
  tenantMatch: boolean;
}

export interface M170ActionDecision {
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

export function validateM170Plan(plan: M170ActionPlan): M170ActionDecision {
  const reasons: string[] = [];
  required([[plan.organizationId, "organizationId"], [plan.actionId, "actionId"], [plan.runId, "runId"], [plan.toolName, "toolName"], [plan.targetReference, "targetReference"], [plan.inputHash, "inputHash"], [plan.expectedOutputHash, "expectedOutputHash"], [plan.preconditionHash, "preconditionHash"], [plan.rollbackPlanHash, "rollbackPlanHash"]], reasons);
  if (plan.state !== "planned" || !plan.tenantBound || !plan.noMainMutation) reasons.push("action plan needs planned state, tenant binding and protected main guard");
  if ((plan.actionClass === "write" || plan.actionClass === "external" || plan.actionClass === "destructive") && !plan.approvalRequired) reasons.push("mutating actions require approval");
  if (plan.actionClass === "destructive" && !plan.rollbackPlanHash) reasons.push("destructive action needs rollback plan");
  return { allowed: reasons.length === 0, reasons, requiresApproval: plan.approvalRequired, auditHash: hash(JSON.stringify({ plan, reasons })) };
}

export function decideM170ToolCall(call: M170ToolCall): M170ActionDecision {
  const reasons: string[] = [];
  required([[call.organizationId, "organizationId"], [call.callId, "callId"], [call.actionId, "actionId"], [call.toolName, "toolName"], [call.targetReference, "targetReference"], [call.inputHash, "inputHash"], [call.idempotencyKey, "idempotencyKey"], [call.policyHash, "policyHash"]], reasons);
  if (call.state !== "approved" && call.state !== "executing") reasons.push("tool call is not approved for execution");
  if (!Number.isInteger(call.timeoutMs) || call.timeoutMs < 100 || call.timeoutMs > 300_000) reasons.push("tool timeout is outside bounds");
  if (call.targetReference === "main") reasons.push("tool call cannot target main");
  if (!call.redacted || !call.tenantMatch) reasons.push("tool call needs redaction and tenant match");
  return { allowed: reasons.length === 0, reasons, requiresApproval: call.actionClass !== "read", auditHash: hash(JSON.stringify({ call, reasons })) };
}

export function validateM170Approval(approval: M170Approval, now: number): M170ActionDecision {
  const reasons: string[] = [];
  required([[approval.organizationId, "organizationId"], [approval.approvalId, "approvalId"], [approval.actionId, "actionId"], [approval.reviewerReference, "reviewerReference"], [approval.riskHash, "riskHash"]], reasons);
  if (!approval.approved || approval.expiresAt <= now || !approval.separatedDuties) reasons.push("approval needs acceptance, future expiry and separation of duties");
  if (approval.secondReviewerRequired && !approval.reversible) reasons.push("non-reversible high-risk action needs second reviewer and rollback boundary");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ approval, now, reasons })) };
}

export function decideM170Commit(commit: M170Commit): M170ActionDecision {
  const reasons: string[] = [];
  required([[commit.organizationId, "organizationId"], [commit.actionId, "actionId"], [commit.commitId, "commitId"], [commit.outputHash, "outputHash"], [commit.evidenceHash, "evidenceHash"]], reasons);
  if (!commit.preconditionMatched || !commit.noUnexpectedChanges || !commit.tenantMatch) reasons.push("commit precondition or change evidence failed");
  if (commit.state === "rolled_back" && !commit.rollbackEvidenceHash) reasons.push("rollback needs evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: commit.state === "committed", auditHash: hash(JSON.stringify({ commit, reasons })) };
}
