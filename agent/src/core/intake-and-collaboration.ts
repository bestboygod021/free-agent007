/**
 * M24 deterministic contracts for intent, requirements, decomposition,
 * capability discovery, governed plugins and multi-user collaboration.
 *
 * This module never calls a model, executes a plugin, writes a repository, or
 * grants an approval. It produces reviewable decisions for those adapters.
 */

export type IntentKind = "bug_fix" | "feature" | "refactor" | "security" | "docs" | "unknown";
export type RequirementConstraintKind = "privacy" | "budget" | "branch" | "approval" | "integration" | "other";
export type CollaborationActionKind = "comment" | "handoff" | "delegate" | "approve";

export interface IntentInput {
  text: string;
  locale: string;
  source: "user" | "untrusted";
}

export interface IntentClassification {
  intent: IntentKind;
  confidence: number;
  needsClarification: boolean;
  signals: string[];
  inputHash: string;
}

export interface RequirementConstraint {
  id: string;
  kind: RequirementConstraintKind;
  value: string;
  source: "user" | "system" | "untrusted";
}

export interface StructuredRequirement {
  requirementId: string;
  organizationId: string;
  goal: string;
  constraints: RequirementConstraint[];
  acceptanceCriteria: string[];
  risk: "low" | "medium" | "high";
  sourceHash: string;
}

export interface RequirementDecision {
  accepted: boolean;
  reasons: string[];
  requirementHash: string;
}

export interface DecompositionTask {
  taskId: string;
  dependsOn: string[];
  owner: string;
  output: string;
  acceptanceCriteria: string[];
}

export interface DecompositionDecision {
  allowed: boolean;
  cycle: string[];
  missingDependencies: string[];
  reasons: string[];
  planHash: string;
}

export interface CapabilityNode {
  nodeId: string;
  organizationId: string;
  kind: "model" | "tool" | "language" | "framework";
  capabilities: string[];
  enabled: boolean;
}

export interface CapabilityQuery {
  organizationId: string;
  required: string[];
  allowKinds: CapabilityNode["kind"][];
}

export interface PluginManifestContract {
  pluginId: string;
  version: string;
  organizationId: string;
  packageDigest: string;
  signature: string;
  capabilities: string[];
  requestedScopes: string[];
  runtime: "sandbox" | "microvm";
}

export interface PluginAdmissionPolicy {
  organizationId: string;
  allowedCapabilities: string[];
  deniedCapabilities: string[];
  allowedScopes: string[];
  allowedRuntimes: PluginManifestContract["runtime"][];
  requireSignature: boolean;
}

export interface CollaborationAction {
  actionId: string;
  organizationId: string;
  runId: string;
  actorId: string;
  actorKind: "human" | "agent";
  kind: CollaborationActionKind;
  targetUserId?: string;
  bodyHash?: string;
  approvalReference?: string;
}

export interface CollaborationDecision {
  allowed: boolean;
  requiresHuman: boolean;
  reasons: string[];
  auditHash: string;
}

export class IntakeContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntakeContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new IntakeContractError(`${label} is required`);
}

const INTENT_SIGNALS: Array<[IntentKind, string[]]> = [
  ["security", ["security", "vulnerability", "secret", "امنیت", "آسیب"]],
  ["bug_fix", ["bug", "fix", "broken", "error", "باگ", "خراب"]],
  ["feature", ["add", "feature", "support", "افزودن", "قابلیت"]],
  ["refactor", ["refactor", "cleanup", "simplify", "بازنویسی", "رفکتور"]],
  ["docs", ["docs", "document", "readme", "مستند", "راهنما"]],
];

/** A deliberately conservative classifier; low confidence must lead to clarification. */
export function classifyIntent(input: IntentInput): IntentClassification {
  required(input.text, "intent text");
  required(input.locale, "locale");
  const text = input.text.toLocaleLowerCase();
  const scored = INTENT_SIGNALS.map(([intent, words]) => ({
    intent,
    signals: words.filter((word) => text.includes(word)),
  })).sort((a, b) => b.signals.length - a.signals.length);
  const best = scored[0]!;
  const tied = scored.filter((entry) => entry.signals.length === best.signals.length && entry.signals.length > 0).length;
  const confidence = best.signals.length === 0 ? 0 : Math.min(0.98, 0.48 + best.signals.length * 0.18 - (tied > 1 ? 0.2 : 0));
  return {
    intent: best.signals.length === 0 || tied > 1 ? "unknown" : best.intent,
    confidence,
    needsClarification: best.signals.length === 0 || tied > 1 || confidence < 0.7,
    signals: best.signals,
    inputHash: hash(input.text),
  };
}

export function validateRequirement(requirement: StructuredRequirement): RequirementDecision {
  required(requirement.requirementId, "requirementId");
  required(requirement.organizationId, "organizationId");
  required(requirement.goal, "goal");
  const reasons: string[] = [];
  if (requirement.acceptanceCriteria.length === 0) reasons.push("at least one acceptance criterion is required");
  const ids = new Set<string>();
  for (const constraint of requirement.constraints) {
    if (!constraint.id.trim() || !constraint.value.trim()) reasons.push("constraint id and value are required");
    if (ids.has(constraint.id)) reasons.push(`duplicate constraint: ${constraint.id}`);
    ids.add(constraint.id);
    if (constraint.source === "untrusted" && ["privacy", "budget", "approval", "branch"].includes(constraint.kind)) {
      reasons.push(`untrusted content cannot define ${constraint.kind} policy`);
    }
  }
  return { accepted: reasons.length === 0, reasons, requirementHash: hash(JSON.stringify(requirement)) };
}

function findCycle(tasks: readonly DecompositionTask[]): string[] {
  const byId = new Map(tasks.map((task) => [task.taskId, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];
  const visit = (id: string): string[] => {
    if (visiting.has(id)) return [...path.slice(path.indexOf(id)), id];
    if (visited.has(id)) return [];
    visiting.add(id);
    path.push(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) {
      const cycle = visit(dependency);
      if (cycle.length > 0) return cycle;
    }
    path.pop();
    visiting.delete(id);
    visited.add(id);
    return [];
  };
  for (const task of tasks) {
    const cycle = visit(task.taskId);
    if (cycle.length > 0) return cycle;
  }
  return [];
}

export function planDecomposition(requirement: StructuredRequirement, tasks: readonly DecompositionTask[]): DecompositionDecision {
  const reasons: string[] = [];
  const ids = new Set<string>();
  for (const task of tasks) {
    if (!task.taskId.trim() || !task.owner.trim() || !task.output.trim()) reasons.push("task identity, owner and output are required");
    if (ids.has(task.taskId)) reasons.push(`duplicate task: ${task.taskId}`);
    ids.add(task.taskId);
    if (task.acceptanceCriteria.length === 0) reasons.push(`task ${task.taskId} has no acceptance criteria`);
  }
  const missingDependencies = tasks.flatMap((task) => task.dependsOn.filter((dependency) => !ids.has(dependency)));
  if (missingDependencies.length > 0) reasons.push("dependency references an unknown task");
  const cycle = findCycle(tasks);
  if (cycle.length > 0) reasons.push("task graph contains a cycle");
  const requirementDecision = validateRequirement(requirement);
  if (!requirementDecision.accepted) reasons.push(...requirementDecision.reasons);
  return { allowed: reasons.length === 0, cycle, missingDependencies, reasons, planHash: hash(JSON.stringify({ requirement: requirementDecision.requirementHash, tasks })) };
}

export function queryCapabilityGraph(nodes: readonly CapabilityNode[], query: CapabilityQuery): CapabilityNode[] {
  required(query.organizationId, "organizationId");
  const requiredSet = new Set(query.required);
  return nodes
    .filter((node) => node.organizationId === query.organizationId && node.enabled && query.allowKinds.includes(node.kind))
    .filter((node) => query.required.every((capability) => node.capabilities.includes(capability)))
    .sort((a, b) => a.nodeId.localeCompare(b.nodeId))
    .map((node) => ({ ...node, capabilities: node.capabilities.filter((capability) => requiredSet.has(capability)) }));
}

export function decidePluginAdmission(manifest: PluginManifestContract, policy: PluginAdmissionPolicy): CollaborationDecision {
  const reasons: string[] = [];
  required(manifest.pluginId, "pluginId");
  if (manifest.organizationId !== policy.organizationId) reasons.push("plugin tenant mismatch");
  if (policy.requireSignature && !manifest.signature.trim()) reasons.push("signature is required");
  if (!manifest.packageDigest.trim()) reasons.push("package digest is required");
  if (!policy.allowedRuntimes.includes(manifest.runtime)) reasons.push("runtime is not allowed");
  if (manifest.capabilities.some((capability) => policy.deniedCapabilities.includes(capability) || !policy.allowedCapabilities.includes(capability))) reasons.push("plugin requests a denied capability");
  if (manifest.requestedScopes.some((scope) => !policy.allowedScopes.includes(scope))) reasons.push("plugin requests a denied scope");
  return { allowed: reasons.length === 0, requiresHuman: reasons.length > 0, reasons, auditHash: hash(JSON.stringify({ manifest, reasons })) };
}

export function decideCollaborationAction(action: CollaborationAction): CollaborationDecision {
  required(action.actionId, "actionId");
  required(action.organizationId, "organizationId");
  required(action.runId, "runId");
  required(action.actorId, "actorId");
  const reasons: string[] = [];
  if (action.kind === "comment" && !action.bodyHash?.trim()) reasons.push("comment requires a body hash");
  if (["handoff", "delegate"].includes(action.kind) && !action.targetUserId?.trim()) reasons.push(`${action.kind} requires a target user`);
  if (action.targetUserId === action.actorId && ["handoff", "delegate", "approve"].includes(action.kind)) reasons.push("self delegation or approval is forbidden");
  if (action.kind === "approve" && action.actorKind !== "human") reasons.push("only a human may approve");
  if (action.kind === "approve" && !action.approvalReference?.trim()) reasons.push("approval reference is required");
  return { allowed: reasons.length === 0, requiresHuman: action.kind === "approve" || action.kind === "delegate", reasons, auditHash: hash(JSON.stringify(action)) };
}
