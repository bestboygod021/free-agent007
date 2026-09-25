/** M33 contracts for Web/API surface, SSE resume, approval inbox and clients. */

export type ScreenStatus = "empty" | "loading" | "ready" | "blocked" | "error";
export type ApprovalRisk = "low" | "medium" | "high" | "critical";

export interface ScreenModel {
  organizationId: string;
  route: "projects" | "run" | "approval" | "audit" | "settings";
  status: ScreenStatus;
  revision: number;
  title: string;
  bodyHash?: string;
  errorCode?: string;
  containsSecret: false;
}

export interface SseResumeRequest {
  organizationId: string;
  runId: string;
  lastEventId?: number;
  currentRevision: number;
}

export interface SseResumeDecision {
  allowed: boolean;
  fromEventId: number;
  requiresSnapshot: boolean;
  reasons: string[];
}

export interface ApprovalInboxItem {
  approvalId: string;
  organizationId: string;
  runId: string;
  requestedBy: string;
  risk: ApprovalRisk;
  expiresAt: number;
  diffHash: string;
  costEstimate: number;
  reversible: boolean;
  status: "pending" | "approved" | "rejected" | "expired";
}

export interface ApprovalViewDecision {
  allowed: boolean;
  reasons: string[];
  requiresMfa: boolean;
  decisionHash: string;
}

export interface ClientCommand {
  name: "run.start" | "run.cancel" | "approval.list" | "approval.approve" | "diff.show";
  organizationId: string;
  arguments: Record<string, string>;
  apiBase: string;
  containsRawCredential: boolean;
}

export interface ClientCommandDecision {
  allowed: boolean;
  reasons: string[];
  usesRelativeOrConfiguredApi: boolean;
}

export interface AccessibilitySummary {
  page: string;
  locale: "fa-IR" | "en-US";
  keyboardReachable: boolean;
  focusVisible: boolean;
  criticalFindings: number;
  rtlChecked: boolean;
}

export class ProductSurfaceContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductSurfaceContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new ProductSurfaceContractError(`${label} is required`);
}

export function validateScreenModel(model: ScreenModel): ClientCommandDecision {
  const reasons: string[] = [];
  required(model.organizationId, "organizationId");
  required(model.title, "title");
  if (model.revision < 0 || !Number.isInteger(model.revision)) reasons.push("screen revision must be a non-negative integer");
  if (model.status === "ready" && !model.bodyHash) reasons.push("ready screen requires a body hash");
  if (model.containsSecret) reasons.push("screen cannot contain a secret");
  return { allowed: reasons.length === 0, reasons, usesRelativeOrConfiguredApi: true };
}

export function planSseResume(request: SseResumeRequest, oldestEventId: number, newestEventId: number): SseResumeDecision {
  required(request.organizationId, "organizationId");
  required(request.runId, "runId");
  const last = request.lastEventId ?? 0;
  const reasons: string[] = [];
  if (last < 0 || newestEventId < oldestEventId) reasons.push("event cursor is invalid");
  const requiresSnapshot = last > 0 && last < oldestEventId;
  if (requiresSnapshot) reasons.push("cursor predates retained events; snapshot is required");
  return { allowed: reasons.length === 0 || requiresSnapshot, fromEventId: Math.max(last + 1, oldestEventId), requiresSnapshot, reasons };
}

export function decideApprovalView(item: ApprovalInboxItem, now: number, approverId: string, freshMfa: boolean): ApprovalViewDecision {
  const reasons: string[] = [];
  if (!item.organizationId.trim() || !item.approvalId.trim() || !item.diffHash.trim()) reasons.push("approval identity and diff are required");
  if (item.status !== "pending") reasons.push("approval is no longer pending");
  if (now >= item.expiresAt) reasons.push("approval has expired");
  if (approverId === item.requestedBy) reasons.push("requester cannot approve their own action");
  if (!freshMfa) reasons.push("fresh MFA is required");
  if (!item.reversible && item.risk === "critical") reasons.push("critical irreversible action needs a stronger approval flow");
  return { allowed: reasons.length === 0, reasons, requiresMfa: true, decisionHash: hash(JSON.stringify({ item, approverId, freshMfa, reasons })) };
}

export function validateClientCommand(command: ClientCommand): ClientCommandDecision {
  const reasons: string[] = [];
  required(command.organizationId, "organizationId");
  if (!command.apiBase.trim() || /localhost|127\.0\.0\.1/.test(command.apiBase)) reasons.push("client must use a configured or relative API base, not browser localhost");
  if (command.containsRawCredential) reasons.push("raw credentials are forbidden in client commands");
  if (["run.cancel", "approval.approve"].includes(command.name) && !command.arguments.runId) reasons.push("mutation command requires runId");
  return { allowed: reasons.length === 0, reasons, usesRelativeOrConfiguredApi: reasons.every((reason) => !reason.includes("API base")) };
}

export function evaluateAccessibilitySummary(summary: AccessibilitySummary): ClientCommandDecision {
  const reasons: string[] = [];
  if (!summary.page.trim()) reasons.push("page is required");
  if (!summary.keyboardReachable) reasons.push("page is not keyboard reachable");
  if (!summary.focusVisible) reasons.push("focus is not visible");
  if (summary.criticalFindings > 0) reasons.push("critical accessibility findings remain");
  if (summary.locale === "fa-IR" && !summary.rtlChecked) reasons.push("fa-IR page requires RTL verification");
  return { allowed: reasons.length === 0, reasons, usesRelativeOrConfiguredApi: true };
}
