/** M37 contracts for previews, artifacts, deployment approval and rollback. */

export type PreviewTarget = "local" | "self_host" | "cloud";
export type DeploymentTarget = "preview" | "staging" | "production";

export interface PreviewRequest {
  organizationId: string;
  projectId: string;
  runId: string;
  commitSha: string;
  target: PreviewTarget;
  requestedPort: number;
  expiresAt: number;
  networkAllowlist: string[];
  approvalPresent: boolean;
}

export interface ArtifactReference {
  organizationId: string;
  artifactId: string;
  digest: string;
  mediaType: string;
  createdAt: number;
  expiresAt: number;
  signed: boolean;
}

export interface ArtifactDecision {
  allowed: boolean;
  reasons: string[];
  referenceHash: string;
}

export interface RetentionPlanInput {
  organizationId: string;
  artifactId: string;
  class: "preview" | "release" | "audit";
  createdAt: number;
  retentionMs: number;
  legalHold: boolean;
}

export interface RetentionPlan extends RetentionPlanInput {
  deleteAfter: number | null;
  requiresReview: boolean;
  planHash: string;
}

export interface DeploymentRequest {
  organizationId: string;
  projectId: string;
  artifact: ArtifactReference;
  target: DeploymentTarget;
  branch: string;
  approvalPresent: boolean;
  verificationPassed: boolean;
  canaryPercent: number;
}

export interface DeploymentDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  decisionHash: string;
}

export interface RollbackRequest {
  organizationId: string;
  deploymentId: string;
  currentArtifactDigest: string;
  previousArtifactDigest: string;
  reasonHash: string;
  approvalPresent: boolean;
}

export class DeliveryPreviewContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryPreviewContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new DeliveryPreviewContractError(`${label} is required`);
}

function validDigest(value: string): boolean {
  return /^sha256:[a-f0-9]{8,}$/i.test(value);
}

export function validatePreviewRequest(request: PreviewRequest, now: number): DeploymentDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.projectId, "projectId"], [request.runId, "runId"], [request.commitSha, "commitSha"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(request.requestedPort) || request.requestedPort < 1024 || request.requestedPort > 65535) reasons.push("preview port is outside the unprivileged range");
  if (!Number.isFinite(now) || !Number.isFinite(request.expiresAt) || request.expiresAt <= now || request.expiresAt > now + 86_400_000) reasons.push("preview expiry must be within 24 hours");
  if (request.target === "cloud" && request.networkAllowlist.length === 0) reasons.push("cloud preview requires an explicit network allowlist");
  if (request.target === "cloud" && !request.approvalPresent) reasons.push("cloud preview requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.target === "cloud", decisionHash: hash(JSON.stringify({ request, now, reasons })) };
}

export function validateArtifactReference(artifact: ArtifactReference, now: number): ArtifactDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[artifact.organizationId, "organizationId"], [artifact.artifactId, "artifactId"], [artifact.mediaType, "mediaType"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!validDigest(artifact.digest)) reasons.push("artifact must use a content digest");
  if (!artifact.signed) reasons.push("artifact signature verification is required");
  if (!Number.isFinite(now) || artifact.expiresAt <= now || artifact.expiresAt <= artifact.createdAt) reasons.push("artifact reference is expired or invalid");
  return { allowed: reasons.length === 0, reasons, referenceHash: hash(JSON.stringify({ ...artifact, reasons })) };
}

export function planArtifactRetention(input: RetentionPlanInput): RetentionPlan {
  for (const [value, label] of [[input.organizationId, "organizationId"], [input.artifactId, "artifactId"]] as const) required(value, label);
  if (!Number.isFinite(input.createdAt) || !Number.isFinite(input.retentionMs) || input.retentionMs < 0) throw new DeliveryPreviewContractError("retention timestamps are invalid");
  const deleteAfter = input.legalHold ? null : input.createdAt + input.retentionMs;
  return { ...input, deleteAfter, requiresReview: input.class === "audit" || input.legalHold, planHash: hash(JSON.stringify({ input, deleteAfter })) };
}

export function decideDeployment(request: DeploymentRequest, now: number): DeploymentDecision {
  const reasons: string[] = [];
  if (!request.organizationId.trim() || !request.projectId.trim() || !request.branch.trim()) reasons.push("deployment identity is required");
  if (request.target === "production" && !request.approvalPresent) reasons.push("production deployment requires explicit approval");
  if (!request.verificationPassed) reasons.push("artifact and smoke verification must pass before deployment");
  if (request.target !== "preview" && request.branch === "main" && !request.approvalPresent) reasons.push("protected branch release requires approval");
  if (!Number.isInteger(request.canaryPercent) || request.canaryPercent < 0 || request.canaryPercent > 100) reasons.push("canary percentage is invalid");
  if (!validDigest(request.artifact.digest) || !request.artifact.signed || request.artifact.expiresAt <= now) reasons.push("deployment artifact is not verified and current");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.target === "production" || request.branch === "main", decisionHash: hash(JSON.stringify({ request, now, reasons })) };
}

export function planRollback(request: RollbackRequest): DeploymentDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.deploymentId, "deploymentId"], [request.currentArtifactDigest, "currentArtifactDigest"], [request.previousArtifactDigest, "previousArtifactDigest"], [request.reasonHash, "reasonHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.currentArtifactDigest === request.previousArtifactDigest) reasons.push("rollback target must differ from current artifact");
  if (!request.approvalPresent) reasons.push("rollback requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, decisionHash: hash(JSON.stringify({ request, reasons })) };
}
