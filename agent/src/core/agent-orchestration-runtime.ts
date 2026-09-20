/** M84 contracts for agent workflow orchestration, scheduling, checkpoints and tool approvals. */

export type AgentNodeKind = "model" | "tool" | "approval" | "transform";
export type AgentRunMode = "local" | "byok" | "free_api";
export type AgentRunState = "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";

export interface AgentWorkflowNode {
  nodeId: string;
  kind: AgentNodeKind;
  capability: string;
  sideEffect: boolean;
}

export interface AgentWorkflowGraph {
  organizationId: string;
  workflowId: string;
  version: string;
  nodes: AgentWorkflowNode[];
  edges: Array<{ from: string; to: string }>;
  entryNodeId: string;
  graphHash: string;
  acyclic: boolean;
  approved: boolean;
}

export interface AgentRunSchedule {
  organizationId: string;
  runId: string;
  workflowId: string;
  requestedBy: string;
  mode: AgentRunMode;
  maxSteps: number;
  maxRuntimeMs: number;
  idempotencyKey: string;
  approvalPresent: boolean;
  state: AgentRunState;
}

export interface AgentCheckpointEnvelope {
  organizationId: string;
  runId: string;
  checkpointId: string;
  sequence: number;
  stateHash: string;
  inputHash: string;
  outputHash: string;
  toolCallCount: number;
  durable: boolean;
  encrypted: boolean;
  createdAt: number;
}

export interface AgentToolCallApproval {
  organizationId: string;
  runId: string;
  toolCallId: string;
  toolName: string;
  operation: "read" | "write" | "execute" | "egress";
  targetOrganizationId: string;
  risk: "low" | "medium" | "high";
  approvalPresent: boolean;
  idempotencyKey: string;
}

export interface AgentOrchestrationDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  decisionHash: string;
}

export class AgentOrchestrationContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentOrchestrationContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function hasCycle(graph: AgentWorkflowGraph): boolean {
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) adjacency.set(node.nodeId, []);
  for (const edge of graph.edges) adjacency.get(edge.from)?.push(edge.to);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) if (visit(next)) return true;
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };
  return [...adjacency.keys()].some(visit);
}

export function validateAgentWorkflowGraph(graph: AgentWorkflowGraph): AgentOrchestrationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[graph.organizationId, "organizationId"], [graph.workflowId, "workflowId"], [graph.version, "version"], [graph.entryNodeId, "entryNodeId"], [graph.graphHash, "graphHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  const ids = new Set(graph.nodes.map((node) => node.nodeId));
  if (graph.nodes.length === 0 || ids.size !== graph.nodes.length) reasons.push("workflow nodes must be non-empty and unique");
  if (!ids.has(graph.entryNodeId)) reasons.push("workflow entry node is not declared");
  if (graph.edges.some((edge) => !ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to)) reasons.push("workflow edge references an invalid node");
  if (hasCycle(graph) || !graph.acyclic) reasons.push("workflow graph must be acyclic");
  if (graph.nodes.some((node) => node.sideEffect && node.kind === "model")) reasons.push("model nodes cannot directly declare side effects");
  if (!graph.approved) reasons.push("workflow graph requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, decisionHash: hash(JSON.stringify({ graph, reasons })) };
}

export function decideAgentRunScheduling(schedule: AgentRunSchedule, graph: AgentWorkflowGraph): AgentOrchestrationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[schedule.organizationId, "organizationId"], [schedule.runId, "runId"], [schedule.workflowId, "workflowId"], [schedule.requestedBy, "requestedBy"], [schedule.idempotencyKey, "idempotencyKey"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (schedule.organizationId !== graph.organizationId || schedule.workflowId !== graph.workflowId) reasons.push("run schedule crosses workflow organization boundary");
  if (!Number.isInteger(schedule.maxSteps) || schedule.maxSteps < 1 || schedule.maxSteps > 10_000) reasons.push("maxSteps is outside bounds");
  if (!Number.isInteger(schedule.maxRuntimeMs) || schedule.maxRuntimeMs < 1_000 || schedule.maxRuntimeMs > 24 * 60 * 60 * 1000) reasons.push("maxRuntimeMs is outside bounds");
  if (schedule.state === "running" && !schedule.approvalPresent && schedule.mode !== "local") reasons.push("external run scheduling requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: schedule.mode !== "local", decisionHash: hash(JSON.stringify({ schedule, graph: graph.workflowId, reasons })) };
}

export function validateAgentCheckpointEnvelope(checkpoint: AgentCheckpointEnvelope, now: number): AgentOrchestrationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[checkpoint.organizationId, "organizationId"], [checkpoint.runId, "runId"], [checkpoint.checkpointId, "checkpointId"], [checkpoint.stateHash, "stateHash"], [checkpoint.inputHash, "inputHash"], [checkpoint.outputHash, "outputHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isSafeInteger(checkpoint.sequence) || checkpoint.sequence < 0) reasons.push("checkpoint sequence is invalid");
  if (!Number.isSafeInteger(checkpoint.toolCallCount) || checkpoint.toolCallCount < 0) reasons.push("tool call count is invalid");
  if (!checkpoint.durable || !checkpoint.encrypted) reasons.push("checkpoint must be durable and encrypted");
  if (!Number.isFinite(checkpoint.createdAt) || checkpoint.createdAt > now) reasons.push("checkpoint timestamp is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, decisionHash: hash(JSON.stringify({ checkpoint, now, reasons })) };
}

export function decideAgentToolCall(approval: AgentToolCallApproval): AgentOrchestrationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[approval.organizationId, "organizationId"], [approval.runId, "runId"], [approval.toolCallId, "toolCallId"], [approval.toolName, "toolName"], [approval.targetOrganizationId, "targetOrganizationId"], [approval.idempotencyKey, "idempotencyKey"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (approval.organizationId !== approval.targetOrganizationId) reasons.push("tool call crosses organization boundary");
  if (["write", "execute", "egress"].includes(approval.operation) && !approval.approvalPresent) reasons.push("side-effect tool call requires approval");
  if (approval.risk === "high" && !approval.approvalPresent) reasons.push("high-risk tool call requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: approval.operation !== "read" || approval.risk !== "low", decisionHash: hash(JSON.stringify({ approval, reasons })) };
}
