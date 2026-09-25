/** M55 contracts for design-system handoff, UI generation and UX accessibility review. */

import type { StudioDesignMode, StudioNodeType } from "./visual-app-studio-runtime.js";

export type DesignCodeTarget = "react" | "vue" | "svelte" | "html" | "flutter";
export type DesignReviewFinding = "contrast" | "keyboard" | "focus" | "rtl" | "responsive" | "semantic" | "motion";

export interface DesignComponentMapping {
  nodeType: StudioNodeType;
  componentName: string;
  target: DesignCodeTarget;
  importPath?: string;
  allowedProps: string[];
  emitsEvents: string[];
}

export interface DesignCodeHandoff {
  organizationId: string;
  projectId: string;
  canvasId: string;
  designVersion: string;
  target: DesignCodeTarget;
  mode: StudioDesignMode;
  componentMappings: DesignComponentMapping[];
  allowedPaths: string[];
  sandboxed: boolean;
  approvalPresent: boolean;
  outputHash: string;
}

export interface AccessibilityReview {
  organizationId: string;
  projectId: string;
  canvasId: string;
  direction: "ltr" | "rtl" | "bidi";
  testedFindings: DesignReviewFinding[];
  blockingFindings: number;
  contrastRatioMinimum: number;
  keyboardPathVerified: boolean;
  reducedMotionSupported: boolean;
  reportHash: string;
}

export interface DesignCodeDecision {
  allowed: boolean;
  reasons: string[];
  requiresReview: boolean;
  auditHash: string;
}

export class DesignToCodeContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DesignToCodeContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new DesignToCodeContractError(`${label} is required`);
}

export function validateDesignCodeHandoff(handoff: DesignCodeHandoff): DesignCodeDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[handoff.organizationId, "organizationId"], [handoff.projectId, "projectId"], [handoff.canvasId, "canvasId"], [handoff.designVersion, "designVersion"], [handoff.outputHash, "outputHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (handoff.allowedPaths.length === 0 || handoff.allowedPaths.some((path) => path.startsWith("/") || path.includes(".."))) reasons.push("generated UI paths must be workspace-relative and allowlisted");
  if (!handoff.sandboxed) reasons.push("design-to-code generation must run in a sandbox");
  if (!handoff.approvalPresent) reasons.push("design-to-code handoff requires approval");
  if (handoff.componentMappings.length === 0) reasons.push("at least one component mapping is required");
  if (handoff.componentMappings.some((mapping) => !mapping.componentName.trim() || mapping.allowedProps.some((prop) => /children|dangerouslySetInnerHTML|eval/i.test(prop)))) reasons.push("component mapping contains unsafe or incomplete props");
  return { allowed: reasons.length === 0, reasons, requiresReview: true, auditHash: hash(JSON.stringify({ handoff, reasons })) };
}

export function decideDesignCodeGeneration(handoff: DesignCodeHandoff, changedFiles: string[], generatedFiles: string[]): DesignCodeDecision {
  const reasons: string[] = [];
  if (!handoff.approvalPresent) reasons.push("code generation requires approval");
  if (changedFiles.some((file) => !handoff.allowedPaths.some((allowed) => file === allowed || file.startsWith(`${allowed}/`)))) reasons.push("generated change exceeds allowed paths");
  if (generatedFiles.length === 0) reasons.push("design generation produced no files");
  if (generatedFiles.some((file) => /\.env|credentials|secrets?|\.pem$/i.test(file))) reasons.push("design generation cannot write credential files");
  return { allowed: reasons.length === 0, reasons, requiresReview: true, auditHash: hash(JSON.stringify({ handoff, changedFiles, generatedFiles, reasons })) };
}

export function validateAccessibilityReview(review: AccessibilityReview): DesignCodeDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[review.organizationId, "organizationId"], [review.projectId, "projectId"], [review.canvasId, "canvasId"], [review.reportHash, "reportHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (review.contrastRatioMinimum < 4.5) reasons.push("minimum contrast ratio is below the normal-text threshold");
  if (!review.keyboardPathVerified) reasons.push("keyboard path is not verified");
  if (review.direction !== "ltr" && !review.testedFindings.includes("rtl")) reasons.push("RTL/Bidi review is missing");
  if (!review.testedFindings.includes("semantic")) reasons.push("semantic accessibility review is missing");
  if (!review.reducedMotionSupported) reasons.push("reduced-motion behavior is missing");
  if (review.blockingFindings > 0) reasons.push("blocking accessibility findings remain");
  return { allowed: reasons.length === 0, reasons, requiresReview: true, auditHash: hash(JSON.stringify({ review, reasons })) };
}

export function validateDesignTokenHandoff(organizationId: string, tokenSetId: string, tokenNames: string[], cssVariablePrefix: string, rtlReady: boolean, darkModeReady: boolean): DesignCodeDecision {
  required(organizationId, "organizationId");
  required(tokenSetId, "tokenSetId");
  const reasons: string[] = [];
  if (tokenNames.length === 0 || new Set(tokenNames).size !== tokenNames.length) reasons.push("design tokens must be non-empty and unique");
  if (!/^--[a-z][a-z0-9-]*$/.test(cssVariablePrefix)) reasons.push("CSS variable prefix is invalid");
  if (!rtlReady) reasons.push("design token handoff is not RTL-ready");
  if (!darkModeReady) reasons.push("design token handoff is not dark-mode-ready");
  return { allowed: reasons.length === 0, reasons, requiresReview: true, auditHash: hash(JSON.stringify({ organizationId, tokenSetId, tokenNames, cssVariablePrefix, rtlReady, darkModeReady, reasons })) };
}
