/** M98 contracts for project templates, workspace bootstrap and collaboration handoff. */

export type WorkspaceTemplateKind = "web" | "api" | "worker" | "agent" | "self_host";
export type WorkspaceHandoffMode = "review" | "pair" | "handoff" | "archive";

export interface ProjectTemplateContract {
  organizationId: string;
  templateId: string;
  kind: WorkspaceTemplateKind;
  version: string;
  filesHash: string;
  setupCommandHash: string;
  allowedPaths: string[];
  dependenciesReviewed: boolean;
  licenseReviewed: boolean;
  starterDataRedacted: boolean;
  approved: boolean;
}

export interface WorkspaceBootstrapRequest {
  organizationId: string;
  projectId: string;
  workspaceId: string;
  templateId: string;
  targetPath: string;
  mode: "local" | "remote";
  noClobber: boolean;
  existingConfigBackedUp: boolean;
  approvalPresent: boolean;
  idempotencyKey: string;
}

export interface WorkspaceHandoffEvidence {
  organizationId: string;
  workspaceId: string;
  handoffId: string;
  fromUserHash: string;
  toUserHash: string;
  mode: WorkspaceHandoffMode;
  contextPackHash: string;
  diffHash: string;
  testEvidenceHash: string;
  secretsRedacted: boolean;
  accepted: boolean;
}

export interface WorkspaceCollaborationComment {
  organizationId: string;
  workspaceId: string;
  commentId: string;
  authorHash: string;
  bodyHash: string;
  referencedPath?: string;
  resolved: boolean;
  createdAt: number;
  piiRedacted: boolean;
}

export interface WorkspaceBootstrapDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class WorkspaceBootstrapContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceBootstrapContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function validateWorkspaceProjectTemplate(template: ProjectTemplateContract): WorkspaceBootstrapDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[template.organizationId, "organizationId"], [template.templateId, "templateId"], [template.version, "version"], [template.filesHash, "filesHash"], [template.setupCommandHash, "setupCommandHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (template.allowedPaths.length === 0 || template.allowedPaths.some((path) => path.startsWith("/") || path.includes(".."))) reasons.push("template allowed paths must be workspace-relative");
  if (!template.dependenciesReviewed || !template.licenseReviewed || !template.starterDataRedacted) reasons.push("template supply-chain/data evidence is incomplete");
  if (!template.approved) reasons.push("project template requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ template, reasons })) };
}

export function decideWorkspaceBootstrap(request: WorkspaceBootstrapRequest, template: ProjectTemplateContract): WorkspaceBootstrapDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.projectId, "projectId"], [request.workspaceId, "workspaceId"], [request.templateId, "templateId"], [request.targetPath, "targetPath"], [request.idempotencyKey, "idempotencyKey"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.organizationId !== template.organizationId || request.templateId !== template.templateId) reasons.push("workspace bootstrap crosses template organization boundary");
  if (request.targetPath.startsWith("/") || request.targetPath.includes("..")) reasons.push("workspace target path must be relative");
  if (!request.noClobber || !request.existingConfigBackedUp) reasons.push("bootstrap must backup and never clobber existing config");
  if (request.mode === "remote" && !request.approvalPresent) reasons.push("remote workspace bootstrap requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.mode === "remote", auditHash: hash(JSON.stringify({ request, template: template.templateId, reasons })) };
}

export function validateWorkspaceHandoffEvidence(evidence: WorkspaceHandoffEvidence): WorkspaceBootstrapDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.workspaceId, "workspaceId"], [evidence.handoffId, "handoffId"], [evidence.fromUserHash, "fromUserHash"], [evidence.toUserHash, "toUserHash"], [evidence.contextPackHash, "contextPackHash"], [evidence.diffHash, "diffHash"], [evidence.testEvidenceHash, "testEvidenceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (evidence.fromUserHash === evidence.toUserHash) reasons.push("handoff users must differ");
  if (!evidence.secretsRedacted) reasons.push("handoff evidence must be redacted");
  if (!evidence.accepted) reasons.push("handoff requires recipient acceptance");
  return { allowed: reasons.length === 0, reasons, requiresApproval: evidence.mode !== "review", auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function validateWorkspaceComment(comment: WorkspaceCollaborationComment): WorkspaceBootstrapDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[comment.organizationId, "organizationId"], [comment.workspaceId, "workspaceId"], [comment.commentId, "commentId"], [comment.authorHash, "authorHash"], [comment.bodyHash, "bodyHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(comment.createdAt)) reasons.push("comment timestamp is invalid");
  if (!comment.piiRedacted) reasons.push("workspace comment requires PII redaction");
  if (comment.referencedPath && (comment.referencedPath.startsWith("/") || comment.referencedPath.includes(".."))) reasons.push("comment path must be workspace-relative");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ comment, reasons })) };
}
