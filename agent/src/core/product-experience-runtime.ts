/** M74 contracts for product UI states, client actions and accessibility evidence. */

export type ExperienceSurface = "web" | "mobile" | "desktop" | "cli";
export type ExperienceScreenState = "empty" | "loading" | "ready" | "error" | "degraded";
export type ExperienceTheme = "light" | "dark" | "system";
export type ExperienceActionMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface ExperienceScreenContract {
  organizationId: string;
  screenId: string;
  surface: ExperienceSurface;
  route: string;
  supportedStates: ExperienceScreenState[];
  defaultState: ExperienceScreenState;
  locale: string;
  theme: ExperienceTheme;
  rtlSupported: boolean;
  tenantScoped: boolean;
  labelsHash: string;
}

export interface ExperienceClientAction {
  organizationId: string;
  actorId: string;
  actionId: string;
  method: ExperienceActionMethod;
  route: string;
  targetOrganizationId: string;
  requiresApproval: boolean;
  approvalPresent: boolean;
  idempotencyKey?: string;
  localMode: boolean;
}

export interface ExperienceAccessibilityEvidence {
  organizationId: string;
  screenId: string;
  axeReportHash: string;
  keyboardNavigationPassed: boolean;
  contrastPassed: boolean;
  screenReaderPassed: boolean;
  rtlPassed: boolean;
  reducedMotionPassed: boolean;
  checkedAt: number;
}

export interface ExperienceReleaseRequest {
  organizationId: string;
  surface: ExperienceSurface;
  artifactHash: string;
  accessibilityEvidenceHash: string;
  errorStateEvidenceHash: string;
  approvalPresent: boolean;
  production: boolean;
}

export interface ProductExperienceDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class ProductExperienceContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductExperienceContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function nonEmpty(value: string, label: string, reasons: string[]): void {
  if (!value.trim()) reasons.push(`${label} is required`);
}

export function validateExperienceScreen(screen: ExperienceScreenContract): ProductExperienceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[screen.organizationId, "organizationId"], [screen.screenId, "screenId"], [screen.route, "route"], [screen.locale, "locale"], [screen.labelsHash, "labelsHash"]] as const) nonEmpty(value, label, reasons);
  if (!screen.route.startsWith("/")) reasons.push("screen route must be absolute within the application");
  if (screen.supportedStates.length === 0 || new Set(screen.supportedStates).size !== screen.supportedStates.length) reasons.push("screen states must be non-empty and unique");
  if (!screen.supportedStates.includes(screen.defaultState)) reasons.push("default screen state must be supported");
  if (!screen.tenantScoped) reasons.push("product screen must declare tenant scope");
  if (screen.locale === "fa-IR" && !screen.rtlSupported) reasons.push("fa-IR screen requires RTL support");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ screen, reasons })) };
}

export function decideExperienceClientAction(action: ExperienceClientAction): ProductExperienceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[action.organizationId, "organizationId"], [action.actorId, "actorId"], [action.actionId, "actionId"], [action.route, "route"], [action.targetOrganizationId, "targetOrganizationId"]] as const) nonEmpty(value, label, reasons);
  if (action.organizationId !== action.targetOrganizationId) reasons.push("client action crosses organization boundary");
  if (!action.route.startsWith("/api/")) reasons.push("client action must target a governed API route");
  if (["POST", "PATCH", "DELETE"].includes(action.method) && !action.approvalPresent && action.requiresApproval) reasons.push("sensitive client action requires approval");
  if (["POST", "PATCH", "DELETE"].includes(action.method) && !action.idempotencyKey) reasons.push("mutating client action requires idempotency key");
  if (action.localMode && action.method !== "GET") reasons.push("local mode cannot silently perform remote mutation");
  return { allowed: reasons.length === 0, reasons, requiresApproval: action.requiresApproval, auditHash: hash(JSON.stringify({ action, reasons })) };
}

export function validateExperienceAccessibilityEvidence(evidence: ExperienceAccessibilityEvidence): ProductExperienceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.screenId, "screenId"], [evidence.axeReportHash, "axeReportHash"]] as const) nonEmpty(value, label, reasons);
  if (!evidence.keyboardNavigationPassed) reasons.push("keyboard accessibility check failed");
  if (!evidence.contrastPassed) reasons.push("contrast check failed");
  if (!evidence.screenReaderPassed) reasons.push("screen reader check failed");
  if (!evidence.rtlPassed) reasons.push("RTL check failed");
  if (!evidence.reducedMotionPassed) reasons.push("reduced-motion check failed");
  if (!Number.isFinite(evidence.checkedAt)) reasons.push("accessibility timestamp is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function decideExperienceRelease(request: ExperienceReleaseRequest): ProductExperienceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.artifactHash, "artifactHash"], [request.accessibilityEvidenceHash, "accessibilityEvidenceHash"], [request.errorStateEvidenceHash, "errorStateEvidenceHash"]] as const) nonEmpty(value, label, reasons);
  if (request.production && !request.approvalPresent) reasons.push("production client release requires approval");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.production, auditHash: hash(JSON.stringify({ request, reasons })) };
}
