/** M180 fail-closed contracts for agent graph orchestration and durable checkpoints. */

export type M180GraphState = "draft" | "approved" | "running" | "paused" | "completed" | "failed";
export type M180TaskState = "queued" | "leased" | "running" | "succeeded" | "failed" | "cancelled";
export type M180Transition = "start" | "succeed" | "fail" | "cancel" | "pause" | "resume";

export interface M180Graph {
  organizationId: string;
  graphId: string;
  version: number;
  nodeIds: string[];
  edges: Array<readonly [string, string]>;
  inputSchemaHash: string;
  stateSchemaHash: string;
  policyHash: string;
  maxNodes: number;
  maxParallel: number;
  state: M180GraphState;
  deterministic: boolean;
  sandboxed: boolean;
  tenantBound: boolean;
}

export interface M180Task {
  organizationId: string;
  graphId: string;
  taskId: string;
  nodeId: string;
  dependencyIds: string[];
  inputHash: string;
  outputHash: string;
  idempotencyKey: string;
  state: M180TaskState;
  timeoutMs: number;
  leaseExpiry: number;
  sandboxed: boolean;
  tenantMatch: boolean;
}

export interface M180Checkpoint {
  organizationId: string;
  graphId: string;
  checkpointId: string;
  sequence: number;
  graphVersion: number;
  stateHash: string;
  resumeProofHash: string;
  durable: boolean;
  redacted: boolean;
  tenantMatch: boolean;
}

export interface M180TransitionRequest {
  organizationId: string;
  graphId: string;
  taskId: string;
  transitionId: string;
  transition: M180Transition;
  fromState: M180TaskState;
  toState: M180TaskState;
  preconditionsMatched: boolean;
  evidenceHash: string;
  idempotencyKey: string;
  tenantMatch: boolean;
}

export interface M180GraphDecision {
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

function cyclic(nodeIds: string[], edges: Array<readonly [string, string]>): boolean {
  const next = new Map<string, string[]>();
  for (const node of nodeIds) next.set(node, []);
  for (const [from, to] of edges) next.get(from)?.push(to);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const child of next.get(node) ?? []) if (visit(child)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  return nodeIds.some(visit);
}

export function validateM180Graph(graph: M180Graph): M180GraphDecision {
  const reasons: string[] = [];
  required([[graph.organizationId, "organizationId"], [graph.graphId, "graphId"], [graph.inputSchemaHash, "inputSchemaHash"], [graph.stateSchemaHash, "stateSchemaHash"], [graph.policyHash, "policyHash"]], reasons);
  if (graph.nodeIds.length === 0 || new Set(graph.nodeIds).size !== graph.nodeIds.length || graph.nodeIds.some((node) => !node.trim())) reasons.push("graph nodes must be unique and non-empty");
  if (graph.edges.some(([from, to]) => from === to || !graph.nodeIds.includes(from) || !graph.nodeIds.includes(to))) reasons.push("graph edges must reference distinct known nodes");
  if (cyclic(graph.nodeIds, graph.edges)) reasons.push("graph cycles are denied");
  if (!Number.isInteger(graph.version) || graph.version < 1 || !Number.isInteger(graph.maxNodes) || graph.maxNodes < 1 || graph.nodeIds.length > graph.maxNodes || !Number.isInteger(graph.maxParallel) || graph.maxParallel < 1 || graph.maxParallel > graph.maxNodes) reasons.push("graph bounds are invalid");
  if (!graph.deterministic || !graph.sandboxed || !graph.tenantBound) reasons.push("graph needs deterministic, sandbox and tenant gates");
  return { allowed: reasons.length === 0, reasons, requiresApproval: graph.state === "approved" || graph.state === "running", auditHash: hash(JSON.stringify({ graph, reasons })) };
}

export function decideM180Task(task: M180Task, now: number): M180GraphDecision {
  const reasons: string[] = [];
  required([[task.organizationId, "organizationId"], [task.graphId, "graphId"], [task.taskId, "taskId"], [task.nodeId, "nodeId"], [task.inputHash, "inputHash"], [task.outputHash, "outputHash"], [task.idempotencyKey, "idempotencyKey"]], reasons);
  if (!Number.isInteger(task.timeoutMs) || task.timeoutMs < 1 || task.timeoutMs > 900_000 || !Number.isFinite(task.leaseExpiry) || task.leaseExpiry <= now) reasons.push("task timeout or lease is invalid");
  if (!task.sandboxed || !task.tenantMatch) reasons.push("task needs sandbox and tenant evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: task.state === "running", auditHash: hash(JSON.stringify({ task, now, reasons })) };
}

export function validateM180Checkpoint(checkpoint: M180Checkpoint): M180GraphDecision {
  const reasons: string[] = [];
  required([[checkpoint.organizationId, "organizationId"], [checkpoint.graphId, "graphId"], [checkpoint.checkpointId, "checkpointId"], [checkpoint.stateHash, "stateHash"], [checkpoint.resumeProofHash, "resumeProofHash"]], reasons);
  if (!Number.isInteger(checkpoint.sequence) || checkpoint.sequence < 0 || !Number.isInteger(checkpoint.graphVersion) || checkpoint.graphVersion < 1 || !checkpoint.durable || !checkpoint.redacted || !checkpoint.tenantMatch) reasons.push("checkpoint durability, version, redaction or tenant evidence failed");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ checkpoint, reasons })) };
}

export function decideM180Transition(request: M180TransitionRequest): M180GraphDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.graphId, "graphId"], [request.taskId, "taskId"], [request.transitionId, "transitionId"], [request.evidenceHash, "evidenceHash"], [request.idempotencyKey, "idempotencyKey"]], reasons);
  const valid = request.transition === "start" && request.fromState === "queued" && (request.toState === "leased" || request.toState === "running") || request.transition === "succeed" && request.toState === "succeeded" || request.transition === "fail" && request.toState === "failed" || request.transition === "cancel" && request.toState === "cancelled" || request.transition === "pause" && request.toState === "queued" || request.transition === "resume" && request.toState === "running";
  if (!valid || !request.preconditionsMatched || !request.tenantMatch) reasons.push("task transition or precondition is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.transition === "cancel", auditHash: hash(JSON.stringify({ request, reasons })) };
}
