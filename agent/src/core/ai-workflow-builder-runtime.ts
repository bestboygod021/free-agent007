/** M62 contracts for user-authored AI workflows, model nodes and connector actions. */

export type AiWorkflowNodeKind = "input" | "model" | "tool" | "condition" | "transform" | "human_approval" | "output";
export type AiWorkflowRunMode = "preview" | "local" | "production_candidate";

export interface AiWorkflowNode {
  nodeId: string;
  kind: AiWorkflowNodeKind;
  label: string;
  modelId?: string;
  connectorId?: string;
  inputNodeIds: string[];
  outputSchemaHash?: string;
  requiresApproval: boolean;
  allowed: boolean;
}

export interface AiWorkflowDefinition {
  organizationId: string;
  projectId: string;
  workflowId: string;
  version: string;
  nodes: AiWorkflowNode[];
  entryNodeId: string;
  outputNodeId: string;
  mode: AiWorkflowRunMode;
  userApproved: boolean;
  containsRawCredential: false;
}

export interface AiWorkflowExecutionRequest {
  organizationId: string;
  workflowId: string;
  version: string;
  runId: string;
  mode: AiWorkflowRunMode;
  inputHash: string;
  egressConsent: boolean;
  approvalPresent: boolean;
  budgetAllowed: boolean;
}

export interface AiWorkflowDecision {
  allowed: boolean;
  reasons: string[];
  requiresHumanApproval: boolean;
  auditHash: string;
}

export class AiWorkflowBuilderContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiWorkflowBuilderContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new AiWorkflowBuilderContractError(`${label} is required`);
}

export function validateAiWorkflow(definition: AiWorkflowDefinition): AiWorkflowDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[definition.organizationId, "organizationId"], [definition.projectId, "projectId"], [definition.workflowId, "workflowId"], [definition.version, "version"], [definition.entryNodeId, "entryNodeId"], [definition.outputNodeId, "outputNodeId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  const ids = definition.nodes.map((node) => node.nodeId);
  if (definition.nodes.length < 2 || new Set(ids).size !== ids.length) reasons.push("workflow needs at least two unique nodes");
  if (!ids.includes(definition.entryNodeId) || !ids.includes(definition.outputNodeId)) reasons.push("workflow entry/output node is missing");
  for (const node of definition.nodes) {
    if (!node.label.trim()) reasons.push(`workflow node label is required: ${node.nodeId}`);
    if (node.inputNodeIds.some((input) => !ids.includes(input))) reasons.push(`workflow input node is missing: ${node.nodeId}`);
    if (node.kind === "model" && !node.modelId) reasons.push(`model node needs modelId: ${node.nodeId}`);
    if (node.kind === "tool" && !node.connectorId) reasons.push(`tool node needs connectorId: ${node.nodeId}`);
    if ((node.kind === "tool" || node.kind === "model") && !node.outputSchemaHash) reasons.push(`execution node needs output schema: ${node.nodeId}`);
  }
  if (definition.mode === "production_candidate" && !definition.userApproved) reasons.push("production candidate workflow requires approval");
  if (definition.containsRawCredential !== false) reasons.push("workflow cannot contain raw credentials");
  return { allowed: reasons.length === 0, reasons, requiresHumanApproval: definition.nodes.some((node) => node.requiresApproval), auditHash: hash(JSON.stringify({ definition, reasons })) };
}

export function decideAiWorkflowExecution(request: AiWorkflowExecutionRequest, definition: AiWorkflowDefinition): AiWorkflowDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.workflowId, "workflowId"], [request.version, "version"], [request.runId, "runId"], [request.inputHash, "inputHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (definition.workflowId !== request.workflowId || definition.version !== request.version) reasons.push("workflow version does not match execution request");
  if (!request.budgetAllowed) reasons.push("workflow execution budget is denied");
  if (!request.egressConsent && definition.nodes.some((node) => node.kind === "tool")) reasons.push("tool workflow requires egress consent");
  if (definition.nodes.some((node) => node.requiresApproval) && !request.approvalPresent) reasons.push("workflow contains an approval-gated node");
  if (request.mode === "production_candidate" && !definition.userApproved) reasons.push("production candidate workflow is not approved");
  return { allowed: reasons.length === 0, reasons, requiresHumanApproval: definition.nodes.some((node) => node.requiresApproval), auditHash: hash(JSON.stringify({ request, definition, reasons })) };
}

export function validateWorkflowGraph(definition: AiWorkflowDefinition): AiWorkflowDecision {
  const reasons: string[] = [];
  const byId = new Map(definition.nodes.map((node) => [node.nodeId, node]));
  for (const node of definition.nodes) if (node.inputNodeIds.includes(node.nodeId)) reasons.push(`workflow node cannot reference itself: ${node.nodeId}`);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) { reasons.push("workflow graph contains a cycle"); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const input of byId.get(id)?.inputNodeIds ?? []) visit(input);
    visiting.delete(id);
    visited.add(id);
  };
  visit(definition.outputNodeId);
  if (!visited.has(definition.entryNodeId)) reasons.push("workflow output is not reachable from entry");
  return { allowed: reasons.length === 0, reasons, requiresHumanApproval: false, auditHash: hash(JSON.stringify({ definition, reasons })) };
}

export function planWorkflowHandoff(organizationId: string, workflowId: string, version: string, target: "local" | "sandbox" | "project", artifactHash: string, approvalPresent: boolean): AiWorkflowDecision {
  required(organizationId, "organizationId");
  required(workflowId, "workflowId");
  required(version, "version");
  required(artifactHash, "artifactHash");
  const reasons: string[] = [];
  if (!approvalPresent) reasons.push("workflow handoff requires approval");
  if (target === "project" && !approvalPresent) reasons.push("project handoff requires approval");
  return { allowed: reasons.length === 0, reasons, requiresHumanApproval: true, auditHash: hash(JSON.stringify({ organizationId, workflowId, version, target, artifactHash, approvalPresent, reasons })) };
}
