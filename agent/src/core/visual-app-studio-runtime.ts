/** M54 contracts for prompt-to-visual app design, UX flows and UI canvases. */

export type StudioDesignMode = "wireframe" | "prototype" | "visual_system" | "handoff_preview";
export type StudioNodeType = "screen" | "component" | "text" | "image" | "input" | "button" | "list" | "navigation" | "state";
export type StudioThemeMode = "light" | "dark" | "system";

export interface VisualDesignIntent {
  organizationId: string;
  projectId: string;
  sessionId: string;
  prompt: string;
  mode: StudioDesignMode;
  targetPlatforms: ("web" | "mobile" | "desktop")[];
  theme: StudioThemeMode;
  direction: "ltr" | "rtl" | "bidi";
  userApproved: boolean;
  containsRawCredential: false;
}

export interface VisualDesignNode {
  nodeId: string;
  type: StudioNodeType;
  label: string;
  parentId?: string;
  componentKey?: string;
  properties: Record<string, string | number | boolean>;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisualDesignCanvas {
  organizationId: string;
  projectId: string;
  canvasId: string;
  version: string;
  nodes: VisualDesignNode[];
  tokenSetId: string;
  previewHash: string;
  interactive: boolean;
  untrustedAssetRefs: string[];
}

export interface VisualStudioDecision {
  allowed: boolean;
  reasons: string[];
  requiresReview: boolean;
  auditHash: string;
}

export class VisualAppStudioContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisualAppStudioContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new VisualAppStudioContractError(`${label} is required`);
}

export function validateVisualDesignIntent(intent: VisualDesignIntent): VisualStudioDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[intent.organizationId, "organizationId"], [intent.projectId, "projectId"], [intent.sessionId, "sessionId"], [intent.prompt, "prompt"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (intent.prompt.trim().length < 12 || intent.prompt.length > 12000) reasons.push("design prompt length is outside bounds");
  if (intent.targetPlatforms.length === 0) reasons.push("at least one target platform is required");
  if (intent.containsRawCredential !== false) reasons.push("raw credentials are forbidden in design prompts");
  if (!intent.userApproved) reasons.push("visual design generation requires user approval");
  return { allowed: reasons.length === 0, reasons, requiresReview: true, auditHash: hash(JSON.stringify({ intent, reasons })) };
}

export function validateVisualDesignCanvas(canvas: VisualDesignCanvas): VisualStudioDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[canvas.organizationId, "organizationId"], [canvas.projectId, "projectId"], [canvas.canvasId, "canvasId"], [canvas.version, "version"], [canvas.tokenSetId, "tokenSetId"], [canvas.previewHash, "previewHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  const ids = canvas.nodes.map((node) => node.nodeId);
  if (canvas.nodes.length === 0 || new Set(ids).size !== ids.length) reasons.push("canvas nodes must be non-empty and unique");
  for (const node of canvas.nodes) {
    if (!node.label.trim()) reasons.push(`node label is required: ${node.nodeId}`);
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y) || !Number.isFinite(node.width) || !Number.isFinite(node.height) || node.width <= 0 || node.height <= 0) reasons.push(`node geometry is invalid: ${node.nodeId}`);
    if (node.parentId && !ids.includes(node.parentId)) reasons.push(`node parent is missing: ${node.nodeId}`);
  }
  if (canvas.untrustedAssetRefs.some((ref) => /javascript:|data:text\/html|password|secret|token/i.test(ref))) reasons.push("unsafe or secret-like asset reference is forbidden");
  return { allowed: reasons.length === 0, reasons, requiresReview: canvas.interactive, auditHash: hash(JSON.stringify({ canvas, reasons })) };
}

export function planVisualStudioSession(organizationId: string, projectId: string, mode: StudioDesignMode, generationBudget: number, networkAllowed: boolean, userApproved: boolean): VisualStudioDecision {
  required(organizationId, "organizationId");
  required(projectId, "projectId");
  const reasons: string[] = [];
  if (!Number.isInteger(generationBudget) || generationBudget < 1 || generationBudget > 100) reasons.push("visual generation budget is outside bounds");
  if (mode === "wireframe" && networkAllowed) reasons.push("wireframe mode does not need external network access");
  if (!userApproved) reasons.push("studio session requires user approval");
  return { allowed: reasons.length === 0, reasons, requiresReview: mode !== "wireframe", auditHash: hash(JSON.stringify({ organizationId, projectId, mode, generationBudget, networkAllowed, userApproved, reasons })) };
}
