/** M44 contracts for collaborative Runs, onboarding and trusted project templates. */

export type RunCollaborationRole = "owner" | "admin" | "developer" | "reviewer" | "viewer" | "agent";
export type OnboardingMode = "free" | "paid" | "local";

export interface RunCollaborationRequest {
  organizationId: string;
  runId: string;
  actorId: string;
  actorRole: RunCollaborationRole;
  action: "comment" | "handoff" | "assign" | "watch";
  targetUserId?: string;
  contentHash?: string;
  approvalId?: string;
}

export interface RunCollaborationDecision {
  allowed: boolean;
  reasons: string[];
  auditHash: string;
}

export interface OnboardingPlan {
  organizationId: string;
  userId: string;
  mode: OnboardingMode;
  steps: string[];
  completedSteps: string[];
  externalEgressConsent: boolean;
  approvalPresent: boolean;
}

export interface ProjectTemplateManifest {
  organizationId: string;
  templateId: string;
  source: "local" | "curated" | "uploaded" | "untrusted";
  version: string;
  contentHash: string;
  license: string;
  installScriptHash?: string;
  approved: boolean;
}

export class CollaborationOnboardingContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CollaborationOnboardingContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new CollaborationOnboardingContractError(`${label} is required`);
}

export function decideRunCollaboration(request: RunCollaborationRequest): RunCollaborationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.runId, "runId"], [request.actorId, "actorId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.action === "comment" && !request.contentHash) reasons.push("comment requires content hash");
  if (["handoff", "assign"].includes(request.action) && !request.targetUserId) reasons.push("handoff or assignment requires target user");
  if (request.action === "handoff" && !request.approvalId) reasons.push("approval handoff requires approval identity");
  if (request.action === "assign" && !["owner", "admin", "developer"].includes(request.actorRole)) reasons.push("only owner, admin or developer may assign work");
  if (request.actorRole === "agent" && ["handoff", "assign"].includes(request.action)) reasons.push("agent cannot reassign human approval or ownership");
  return { allowed: reasons.length === 0, reasons, auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function planOnboarding(plan: OnboardingPlan): RunCollaborationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[plan.organizationId, "organizationId"], [plan.userId, "userId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (plan.steps.length === 0 || new Set(plan.steps).size !== plan.steps.length) reasons.push("onboarding steps must be non-empty and unique");
  if (plan.completedSteps.some((step) => !plan.steps.includes(step))) reasons.push("completed onboarding step is not in the plan");
  if (plan.externalEgressConsent && !plan.approvalPresent) reasons.push("external egress consent requires approval context");
  if (plan.mode === "local" && plan.externalEgressConsent) reasons.push("local mode cannot consent to external egress");
  return { allowed: reasons.length === 0, reasons, auditHash: hash(JSON.stringify({ plan, reasons })) };
}

export function validateProjectTemplate(manifest: ProjectTemplateManifest): RunCollaborationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[manifest.organizationId, "organizationId"], [manifest.templateId, "templateId"], [manifest.version, "version"], [manifest.contentHash, "contentHash"], [manifest.license, "license"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (manifest.source === "untrusted") reasons.push("untrusted template cannot be installed");
  if (!manifest.approved) reasons.push("template requires curation or explicit approval");
  if (manifest.installScriptHash && !manifest.approved) reasons.push("install script requires approval");
  return { allowed: reasons.length === 0, reasons, auditHash: hash(JSON.stringify({ manifest, reasons })) };
}

export function validateCollaborationContent(organizationId: string, contentHash: string, containsSecret: boolean): RunCollaborationDecision {
  required(organizationId, "organizationId");
  required(contentHash, "contentHash");
  const reasons: string[] = [];
  if (containsSecret) reasons.push("collaboration content cannot contain a secret");
  return { allowed: reasons.length === 0, reasons, auditHash: hash(JSON.stringify({ organizationId, contentHash, containsSecret, reasons })) };
}

export function decideOfflineCollaboration(action: "comment" | "watch" | "approval", connected: boolean, idempotencyKey: string, approvalPresent: boolean): RunCollaborationDecision {
  required(idempotencyKey, "idempotencyKey");
  const reasons: string[] = [];
  if (!connected && action === "approval") reasons.push("approval cannot be completed while offline");
  if (action === "approval" && !approvalPresent) reasons.push("offline or online approval requires approval context");
  return { allowed: reasons.length === 0, reasons, auditHash: hash(JSON.stringify({ action, connected, idempotencyKey, approvalPresent, reasons })) };
}
