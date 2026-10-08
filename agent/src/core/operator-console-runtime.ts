/** M143 contracts for redacted operator views, live Run events and safe console actions. */

export type M143ViewRole = "owner" | "operator" | "reviewer" | "viewer";
export type M143Action = "pause" | "resume" | "cancel" | "retry" | "open_approval";
export type M143EventKind = "status" | "agent" | "tool" | "approval" | "error";

export interface M143RunView {
  organizationId: string;
  runId: string;
  viewId: string;
  role: M143ViewRole;
  fieldsAllowed: string[];
  timelineHash: string;
  liveAllowed: boolean;
  tenantMatch: boolean;
  redacted: boolean;
  expiresAt: number;
}

export interface M143LiveEvent {
  organizationId: string;
  runId: string;
  eventId: string;
  sequence: number;
  kind: M143EventKind;
  payloadHash: string;
  piiRedacted: boolean;
  tenantMatch: boolean;
  replayable: boolean;
  emittedAt: number;
}

export interface M143ActionRequest {
  organizationId: string;
  runId: string;
  actionId: string;
  action: M143Action;
  roleAllowed: boolean;
  reversible: boolean;
  approvalPresent: boolean;
  confirmationHash: string;
  tenantMatch: boolean;
  idempotencyKey: string;
  requestedAt: number;
}

export interface M143UiEvidence {
  organizationId: string;
  screenId: string;
  route: string;
  state: "loading" | "empty" | "ready" | "error";
  rtlSupported: boolean;
  keyboardNavigable: boolean;
  focusVisible: boolean;
  errorRecoveryDocumented: boolean;
  redacted: boolean;
  evidenceHash: string;
}

export interface M143ConsoleDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(values: Array<readonly [string, string]>, reasons: string[]): void {
  for (const [value, label] of values) if (!value.trim()) reasons.push(`${label} is required`);
}

export function validateM143RunView(view: M143RunView, now: number): M143ConsoleDecision {
  const reasons: string[] = [];
  required([[view.organizationId, "organizationId"], [view.runId, "runId"], [view.viewId, "viewId"], [view.timelineHash, "timelineHash"]], reasons);
  if (view.fieldsAllowed.length === 0) reasons.push("view must declare allowed fields");
  if (!view.tenantMatch || !view.redacted) reasons.push("view must be tenant-matched and redacted");
  if (!Number.isFinite(view.expiresAt) || view.expiresAt <= now) reasons.push("view has expired");
  if (view.role === "viewer" && view.liveAllowed) reasons.push("viewer cannot receive live operational stream");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ view, now, reasons })) };
}

export function decideM143LiveEvent(event: M143LiveEvent): M143ConsoleDecision {
  const reasons: string[] = [];
  required([[event.organizationId, "organizationId"], [event.runId, "runId"], [event.eventId, "eventId"], [event.payloadHash, "payloadHash"]], reasons);
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 1) reasons.push("event sequence must be positive");
  if (!event.piiRedacted || !event.tenantMatch || !event.replayable) reasons.push("live event needs redaction, tenant and replay evidence");
  if (!Number.isFinite(event.emittedAt)) reasons.push("emittedAt is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: event.kind === "tool", auditHash: hash(JSON.stringify({ event, reasons })) };
}

export function decideM143Action(request: M143ActionRequest): M143ConsoleDecision {
  const reasons: string[] = [];
  required([[request.organizationId, "organizationId"], [request.runId, "runId"], [request.actionId, "actionId"], [request.confirmationHash, "confirmationHash"], [request.idempotencyKey, "idempotencyKey"]], reasons);
  if (!request.roleAllowed || !request.tenantMatch) reasons.push("action needs role and tenant authorization");
  if (!request.reversible && request.action !== "open_approval") reasons.push("console action must be reversible or enter approval");
  if (["cancel", "retry", "resume"].includes(request.action) && !request.approvalPresent) reasons.push("mutating action needs approval");
  if (!Number.isFinite(request.requestedAt)) reasons.push("requestedAt is invalid");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.action !== "pause", auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateM143UiEvidence(evidence: M143UiEvidence): M143ConsoleDecision {
  const reasons: string[] = [];
  required([[evidence.organizationId, "organizationId"], [evidence.screenId, "screenId"], [evidence.route, "route"], [evidence.evidenceHash, "evidenceHash"]], reasons);
  if (!evidence.rtlSupported || !evidence.keyboardNavigable || !evidence.focusVisible || !evidence.errorRecoveryDocumented || !evidence.redacted) reasons.push("UI evidence needs RTL, keyboard, focus, recovery and redaction proof");
  if (!evidence.route.startsWith("/")) reasons.push("route must be absolute");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}
