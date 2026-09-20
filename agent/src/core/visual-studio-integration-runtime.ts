/** M59 contracts for turning visual design sessions into reviewable app previews. */

import type { DesignCodeHandoff } from "./design-to-code-runtime.js";
import type { VisualDesignCanvas } from "./visual-app-studio-runtime.js";

export type StudioPreviewEnvironment = "local" | "sandbox" | "staging";
export type StudioPublishTarget = "preview" | "project_branch" | "handoff_only";
export type StudioCollaborationEventKind = "comment" | "annotation" | "version" | "approval";

export interface StudioRuntimeSurface {
  organizationId: string;
  projectId: string;
  sessionId: string;
  canvas: VisualDesignCanvas;
  handoff?: DesignCodeHandoff;
  previewEnvironment: StudioPreviewEnvironment;
  previewUrl?: string;
  sandboxed: boolean;
  networkEgressAllowed: boolean;
  userApproved: boolean;
}

export interface StudioPreviewArtifact {
  artifactId: string;
  projectId: string;
  environment: StudioPreviewEnvironment;
  artifactHash: string;
  screenshotHashes: string[];
  browserReportHash?: string;
  exitCode: number;
  generatedAt: number;
}

export interface StudioCollaborationEvent {
  organizationId: string;
  projectId: string;
  sessionId: string;
  eventId: string;
  actorId: string;
  kind: StudioCollaborationEventKind;
  targetVersion: string;
  bodyHash: string;
  containsSecret: false;
  idempotencyKey: string;
}

export interface StudioRuntimeDecision {
  allowed: boolean;
  reasons: string[];
  requiresReview: boolean;
  auditHash: string;
}

export class VisualStudioIntegrationContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisualStudioIntegrationContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new VisualStudioIntegrationContractError(`${label} is required`);
}

export function validateStudioRuntimeSurface(surface: StudioRuntimeSurface): StudioRuntimeDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[surface.organizationId, "organizationId"], [surface.projectId, "projectId"], [surface.sessionId, "sessionId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!surface.sandboxed) reasons.push("studio preview must run in a sandbox");
  if (!surface.userApproved) reasons.push("studio preview requires user approval");
  if (surface.previewEnvironment === "local" && surface.networkEgressAllowed) reasons.push("local preview cannot silently use network egress");
  if (surface.previewEnvironment !== "local" && !surface.previewUrl) reasons.push("non-local preview needs a preview URL");
  if (surface.canvas.projectId !== surface.projectId || surface.canvas.organizationId !== surface.organizationId) reasons.push("canvas scope does not match studio surface");
  return { allowed: reasons.length === 0, reasons, requiresReview: true, auditHash: hash(JSON.stringify({ surface, reasons })) };
}

export function validateStudioPreviewArtifact(artifact: StudioPreviewArtifact, now: number): StudioRuntimeDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[artifact.artifactId, "artifactId"], [artifact.projectId, "projectId"], [artifact.artifactHash, "artifactHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (artifact.screenshotHashes.length === 0) reasons.push("preview needs at least one screenshot artifact");
  if (!Number.isInteger(artifact.exitCode) || artifact.exitCode !== 0) reasons.push("preview command did not pass");
  if (!Number.isFinite(artifact.generatedAt) || artifact.generatedAt > now) reasons.push("preview timestamp is invalid");
  if (artifact.environment !== "local" && !artifact.browserReportHash) reasons.push("remote preview needs browser report evidence");
  return { allowed: reasons.length === 0, reasons, requiresReview: true, auditHash: hash(JSON.stringify({ artifact, now, reasons })) };
}

export function decideStudioPublish(surface: StudioRuntimeSurface, target: StudioPublishTarget, preview: StudioPreviewArtifact | undefined, reviewerApproved: boolean): StudioRuntimeDecision {
  const reasons: string[] = [];
  if (!surface.userApproved) reasons.push("publish requires user approval");
  if (target === "project_branch" && !surface.handoff) reasons.push("project branch publish requires design-to-code handoff");
  if (target !== "handoff_only" && !preview) reasons.push("publish requires preview artifact");
  if (preview && preview.exitCode !== 0) reasons.push("failed preview cannot be published");
  if (!reviewerApproved) reasons.push("publish requires reviewer approval");
  return { allowed: reasons.length === 0, reasons, requiresReview: true, auditHash: hash(JSON.stringify({ surface, target, preview, reviewerApproved, reasons })) };
}

export function validateStudioCollaborationEvent(event: StudioCollaborationEvent): StudioRuntimeDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[event.organizationId, "organizationId"], [event.projectId, "projectId"], [event.sessionId, "sessionId"], [event.eventId, "eventId"], [event.actorId, "actorId"], [event.targetVersion, "targetVersion"], [event.bodyHash, "bodyHash"], [event.idempotencyKey, "idempotencyKey"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (event.containsSecret !== false) reasons.push("studio collaboration event cannot contain a secret");
  return { allowed: reasons.length === 0, reasons, requiresReview: event.kind === "approval", auditHash: hash(JSON.stringify({ event, reasons })) };
}
