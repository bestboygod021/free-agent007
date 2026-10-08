/** Bounded event/schedule workflow planning. It never executes tools or external triggers. */

export type WorkflowTrigger = "manual" | "schedule" | "webhook" | "system_event";
export type WorkflowStepKind = "model" | "tool" | "approval" | "notification";

export interface WorkflowStep {
  stepId: string;
  kind: WorkflowStepKind;
  capability?: string;
  requiresApproval: boolean;
  inputHash: string;
  protectedBranchWrite?: boolean;
}

export interface WorkflowDefinition {
  workflowId: string;
  organizationId: string;
  version: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  enabled: boolean;
  schedule?: string;
  signedDefinitionHash: string;
}

export interface WorkflowRunRequest {
  organizationId: string;
  eventId: string;
  eventSignature?: string;
  now: number;
  mode: "free" | "paid" | "local";
  policyHash: string;
}

export interface WorkflowPolicy {
  allowedTriggers: WorkflowTrigger[];
  allowedStepKinds: WorkflowStepKind[];
  maxSteps: number;
  requireApprovalFor: WorkflowStepKind[];
  deniedCapabilities: string[];
  allowProtectedBranchWrite: boolean;
  cooldownMs: number;
}

export interface WorkflowRunPlan {
  allowed: boolean;
  workflowId: string;
  idempotencyKey: string;
  requiredApprovals: string[];
  deniedReasons: string[];
  stepOrder: string[];
  planHash: string;
}

export class WorkflowAutomationContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowAutomationContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new WorkflowAutomationContractError(`${label} is required`);
}

export function validateWorkflowDefinition(definition: WorkflowDefinition, policy: WorkflowPolicy): void {
  required(definition.workflowId, "workflowId");
  required(definition.organizationId, "organizationId");
  required(definition.version, "version");
  required(definition.signedDefinitionHash, "signedDefinitionHash");
  if (!definition.enabled) throw new WorkflowAutomationContractError("workflow is disabled");
  if (definition.steps.length === 0 || definition.steps.length > policy.maxSteps) throw new WorkflowAutomationContractError("workflow step count exceeds policy");
  if (!policy.allowedTriggers.includes(definition.trigger)) throw new WorkflowAutomationContractError("workflow trigger is not allowed");
  if (definition.trigger === "schedule" && !definition.schedule?.trim()) throw new WorkflowAutomationContractError("schedule trigger requires a schedule");
  const ids = new Set<string>();
  for (const step of definition.steps) {
    required(step.stepId, "stepId");
    required(step.inputHash, "step.inputHash");
    if (ids.has(step.stepId)) throw new WorkflowAutomationContractError(`duplicate workflow step: ${step.stepId}`);
    ids.add(step.stepId);
    if (!policy.allowedStepKinds.includes(step.kind)) throw new WorkflowAutomationContractError(`step kind is not allowed: ${step.kind}`);
    if (step.kind === "tool" && !step.capability?.trim()) throw new WorkflowAutomationContractError("tool step requires a capability");
    if (step.protectedBranchWrite && !policy.allowProtectedBranchWrite) throw new WorkflowAutomationContractError("protected branch writes are denied");
  }
}

export function planWorkflowRun(definition: WorkflowDefinition, request: WorkflowRunRequest, policy: WorkflowPolicy): WorkflowRunPlan {
  const deniedReasons: string[] = [];
  try { validateWorkflowDefinition(definition, policy); } catch (error) {
    deniedReasons.push(error instanceof Error ? error.message : "invalid workflow definition");
  }
  if (definition.organizationId !== request.organizationId) deniedReasons.push("workflow and request tenant mismatch");
  required(request.eventId, "eventId");
  required(request.policyHash, "policyHash");
  if (!Number.isFinite(request.now) || request.now < 0) throw new WorkflowAutomationContractError("now must be non-negative");
  if ((definition.trigger === "webhook" || definition.trigger === "system_event") && !request.eventSignature) deniedReasons.push("signed external/system event is required");
  for (const step of definition.steps) {
    if (step.capability && policy.deniedCapabilities.includes(step.capability)) deniedReasons.push(`capability denied: ${step.capability}`);
    if (policy.requireApprovalFor.includes(step.kind) || step.requiresApproval) deniedReasons.push(`approval required: ${step.stepId}`);
  }
  const idempotencyKey = `workflow:${definition.organizationId}:${definition.workflowId}:${definition.version}:${request.eventId}`;
  const requiredApprovals = definition.steps.filter((step) => policy.requireApprovalFor.includes(step.kind) || step.requiresApproval).map((step) => step.stepId);
  const body = { definitionHash: definition.signedDefinitionHash, idempotencyKey, policyHash: request.policyHash, deniedReasons, requiredApprovals };
  return { allowed: deniedReasons.length === 0, workflowId: definition.workflowId, idempotencyKey, requiredApprovals, deniedReasons, stepOrder: definition.steps.map((step) => step.stepId), planHash: hash(JSON.stringify(body)) };
}
