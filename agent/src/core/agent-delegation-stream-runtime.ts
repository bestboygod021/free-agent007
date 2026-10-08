/** M99 contracts for delegated agents, structured streaming and tool-target safety. */

export type DelegationMode = "parallel" | "serial" | "review";
export type AgentStreamEvent = "delta" | "tool_call" | "checkpoint" | "completed" | "failed";
export type DelegatedToolTargetKind = "file" | "api" | "command" | "connector";

export interface AgentDelegationContract {
  organizationId: string;
  delegationId: string;
  parentTaskId: string;
  childTaskId: string;
  issuerHash: string;
  recipientHash: string;
  mode: DelegationMode;
  inputSchemaHash: string;
  outputSchemaHash: string;
  allowedTools: string[];
  allowedPaths: string[];
  tokenBudget: number;
  expiresAt: number;
  approvalPresent: boolean;
  nonce: string;
}

export interface StructuredOutputRecoveryEvidence {
  organizationId: string;
  taskId: string;
  schemaHash: string;
  outputHash: string;
  valid: boolean;
  repairAttempts: number;
  refusalDetected: boolean;
  repairEvidenceHash?: string;
  humanReview: boolean;
}

export interface AgentStreamResumeRequest {
  organizationId: string;
  streamId: string;
  taskId: string;
  lastEventId: string;
  requestedAt: number;
  eventsRedacted: boolean;
  terminalEventSeen: boolean;
  tenantMatch: boolean;
}

export interface AgentToolTargetRequest {
  organizationId: string;
  taskId: string;
  targetId: string;
  kind: DelegatedToolTargetKind;
  target: string;
  allowed: boolean;
  approvalPresent: boolean;
  untrustedInputSeparated: boolean;
  pathRelative: boolean;
  endpointHttps: boolean;
  idempotencyKey: string;
}

export interface AgentInteractionDecision {
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

export function validateAgentDelegation(contract: AgentDelegationContract, now = Date.now()): AgentInteractionDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[contract.organizationId, "organizationId"], [contract.delegationId, "delegationId"], [contract.parentTaskId, "parentTaskId"], [contract.childTaskId, "childTaskId"], [contract.issuerHash, "issuerHash"], [contract.recipientHash, "recipientHash"], [contract.inputSchemaHash, "inputSchemaHash"], [contract.outputSchemaHash, "outputSchemaHash"], [contract.nonce, "nonce"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (contract.issuerHash === contract.recipientHash) reasons.push("delegation issuer and recipient must differ");
  if (contract.allowedTools.length === 0) reasons.push("delegation needs an explicit tool allowlist");
  if (contract.allowedPaths.some((path) => path.startsWith("/") || path.includes(".."))) reasons.push("delegation paths must be workspace-relative");
  if (!Number.isInteger(contract.tokenBudget) || contract.tokenBudget <= 0) reasons.push("delegation token budget must be positive");
  if (!Number.isFinite(contract.expiresAt) || contract.expiresAt <= now) reasons.push("delegation has expired");
  if (contract.mode !== "parallel" && !contract.approvalPresent) reasons.push("serial/review delegation requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: contract.mode !== "parallel", auditHash: hash(JSON.stringify({ contract, reasons })) };
}

export function decideStructuredOutputRecovery(evidence: StructuredOutputRecoveryEvidence): AgentInteractionDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.taskId, "taskId"], [evidence.schemaHash, "schemaHash"], [evidence.outputHash, "outputHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (evidence.repairAttempts < 0 || evidence.repairAttempts > 2) reasons.push("structured output repair is bounded to two attempts");
  if (!evidence.valid && !evidence.refusalDetected && !evidence.repairEvidenceHash) reasons.push("invalid output needs repair evidence or an explicit refusal");
  if (evidence.repairAttempts > 0 && !evidence.repairEvidenceHash) reasons.push("repair attempts require evidence");
  if (!evidence.valid && evidence.repairAttempts >= 2 && !evidence.humanReview) reasons.push("unresolved output requires human review");
  return { allowed: reasons.length === 0, reasons, requiresApproval: !evidence.valid, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function validateAgentStreamResume(request: AgentStreamResumeRequest): AgentInteractionDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.streamId, "streamId"], [request.taskId, "taskId"], [request.lastEventId, "lastEventId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(request.requestedAt)) reasons.push("stream resume timestamp is invalid");
  if (!request.tenantMatch) reasons.push("stream resume crosses tenant boundary");
  if (!request.eventsRedacted) reasons.push("stream events must be redacted before replay");
  if (request.terminalEventSeen) reasons.push("terminal streams cannot be resumed");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function decideAgentToolTarget(request: AgentToolTargetRequest): AgentInteractionDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.taskId, "taskId"], [request.targetId, "targetId"], [request.target, "target"], [request.idempotencyKey, "idempotencyKey"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!request.allowed) reasons.push("tool target is not allowlisted");
  if (!request.untrustedInputSeparated) reasons.push("untrusted input must remain separate from tool instructions");
  if ((request.kind === "file" || request.kind === "command") && !request.pathRelative) reasons.push("file/command target must be relative to the sandbox workspace");
  if ((request.kind === "api" || request.kind === "connector") && !request.endpointHttps) reasons.push("API/connector target must use HTTPS");
  if (!request.approvalPresent && request.kind !== "file") reasons.push("non-file tool target requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.kind !== "file", auditHash: hash(JSON.stringify({ request, reasons })) };
}
