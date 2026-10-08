/**
 * M39 contracts for model output repair, streaming and tool-target guardrails.
 *
 * The kernel only handles hashes, cursors and policy metadata. It never treats
 * model output, README text or an imagined path/API as authority.
 */

export type StructuredOutputStatus = "valid" | "invalid_json" | "schema_error" | "refusal";
export type StreamFrameKind = "delta" | "checkpoint" | "terminal" | "error";
export type ToolTargetKind = "file" | "api";

export interface StructuredOutputAttempt {
  organizationId: string;
  runId: string;
  attempt: number;
  schemaHash: string;
  outputHash: string;
  status: StructuredOutputStatus;
  containsSecret: false;
}

export interface InteractionDecision {
  allowed: boolean;
  reasons: string[];
  auditHash: string;
}

export interface StructuredRepairPlan {
  organizationId: string;
  runId: string;
  failedAttempt: number;
  maxAttempts: number;
  strategy: "grammar_retry" | "schema_repair" | "model_fallback" | "human_review";
  preserveOriginalHash: string;
  requiresApproval: boolean;
  planHash: string;
}

export interface ModelStreamRequest {
  organizationId: string;
  runId: string;
  streamId: string;
  schemaHash: string;
  maxFrames: number;
  maxBytes: number;
  resumable: boolean;
}

export interface StreamFrame {
  streamId: string;
  sequence: number;
  kind: StreamFrameKind;
  contentHash: string;
  byteLength: number;
}

export interface StreamState {
  streamId: string;
  lastSequence: number;
  bytes: number;
  terminal: boolean;
  stateHash: string;
}

export interface ToolTarget {
  organizationId: string;
  kind: ToolTargetKind;
  path?: string;
  host?: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  allowedPaths: string[];
  allowedHosts: string[];
  sideEffect: boolean;
  approvalPresent: boolean;
}

export class AgentInteractionContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentInteractionContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new AgentInteractionContractError(`${label} is required`);
}

function unsafeRelativePath(value: string): boolean {
  return value.startsWith("/") || value.includes("\\") || value.split("/").some((part) => part === ".." || part === "");
}

export function validateStructuredOutputAttempt(attempt: StructuredOutputAttempt): InteractionDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[attempt.organizationId, "organizationId"], [attempt.runId, "runId"], [attempt.schemaHash, "schemaHash"], [attempt.outputHash, "outputHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(attempt.attempt) || attempt.attempt < 1 || attempt.attempt > 10) reasons.push("attempt is outside the bounded repair range");
  if (attempt.status === "valid" && attempt.containsSecret) reasons.push("valid output cannot contain a secret");
  return { allowed: reasons.length === 0, reasons, auditHash: hash(JSON.stringify({ attempt, reasons })) };
}

export function planStructuredOutputRepair(attempt: StructuredOutputAttempt, maxAttempts = 3): StructuredRepairPlan {
  required(attempt.organizationId, "organizationId");
  required(attempt.runId, "runId");
  required(attempt.outputHash, "outputHash");
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) throw new AgentInteractionContractError("maxAttempts is invalid");
  const failed = attempt.status !== "valid";
  const strategy = attempt.status === "invalid_json" ? "grammar_retry" : attempt.status === "schema_error" ? "schema_repair" : attempt.status === "refusal" ? "model_fallback" : "human_review";
  const requiresApproval = attempt.status === "refusal";
  return { organizationId: attempt.organizationId, runId: attempt.runId, failedAttempt: attempt.attempt, maxAttempts, strategy, preserveOriginalHash: attempt.outputHash, requiresApproval, planHash: hash(JSON.stringify({ attempt, maxAttempts, failed })) };
}

export function planModelOutputStream(request: ModelStreamRequest): InteractionDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.runId, "runId"], [request.streamId, "streamId"], [request.schemaHash, "schemaHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(request.maxFrames) || request.maxFrames < 1 || request.maxFrames > 100_000) reasons.push("maxFrames is invalid");
  if (!Number.isInteger(request.maxBytes) || request.maxBytes < 1) reasons.push("maxBytes is invalid");
  if (!request.resumable) reasons.push("model output stream must be resumable");
  return { allowed: reasons.length === 0, reasons, auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function reduceStreamFrame(state: StreamState, frame: StreamFrame): StreamState {
  required(state.streamId, "state.streamId");
  required(frame.streamId, "frame.streamId");
  required(frame.contentHash, "contentHash");
  if (frame.streamId !== state.streamId) throw new AgentInteractionContractError("stream identity mismatch");
  if (!Number.isSafeInteger(frame.sequence) || frame.sequence !== state.lastSequence + 1) throw new AgentInteractionContractError("stream sequence is not contiguous");
  if (!Number.isInteger(frame.byteLength) || frame.byteLength < 0) throw new AgentInteractionContractError("frame byte length is invalid");
  if (state.terminal) throw new AgentInteractionContractError("terminal stream cannot accept another frame");
  return { streamId: state.streamId, lastSequence: frame.sequence, bytes: state.bytes + frame.byteLength, terminal: frame.kind === "terminal" || frame.kind === "error", stateHash: hash(JSON.stringify({ state, frame })) };
}

export function guardToolTarget(target: ToolTarget): InteractionDecision {
  const reasons: string[] = [];
  required(target.organizationId, "organizationId");
  if (target.kind === "file") {
    const path = target.path;
    if (!path || unsafeRelativePath(path)) reasons.push("file target must be a normalized relative path");
    if (!path || !target.allowedPaths.some((allowed) => path === allowed || path.startsWith(`${allowed}/`))) reasons.push("file target is outside allowed paths");
  }
  if (target.kind === "api") {
    if (!target.host || target.host === "localhost" || target.host === "127.0.0.1") reasons.push("API target must not use browser localhost");
    if (!target.host || !target.allowedHosts.includes(target.host)) reasons.push("API host is not allowlisted");
    if (!target.method) reasons.push("API method is required");
  }
  if (target.sideEffect && !target.approvalPresent) reasons.push("tool side effect requires approval");
  return { allowed: reasons.length === 0, reasons, auditHash: hash(JSON.stringify({ target, reasons })) };
}
