/** M112 contracts for onboarding, notifications, approval surfaces and collaborative runs. */

export type M112OnboardingState = "new" | "connected" | "first_run" | "completed" | "blocked";
export type M112NotificationKind = "approval" | "failure" | "quota" | "handoff";
export type M112ApprovalAction = "approve" | "reject" | "request_changes";

export interface M112OnboardingContract {
  organizationId: string;
  userHash: string;
  projectId: string;
  state: M112OnboardingState;
  computeMode: "free" | "local" | "byok" | "paid";
  consentRecorded: boolean;
  connectionChecked: boolean;
  firstRunEvidenceHash?: string;
  dismissedSafetyNotice: boolean;
  locale: string;
  externalEgressAllowed: boolean;
}

export interface M112NotificationContract {
  organizationId: string;
  notificationId: string;
  recipientHash: string;
  kind: M112NotificationKind;
  titleHash: string;
  bodyHash: string;
  sourceRunId?: string;
  dedupeKey: string;
  channel: "in_app" | "email" | "webhook";
  secretRedacted: boolean;
  actionable: boolean;
  acknowledged: boolean;
}

export interface M112ApprovalSurfaceRequest {
  organizationId: string;
  approvalId: string;
  runId: string;
  actorHash: string;
  action: M112ApprovalAction;
  riskSummaryHash: string;
  diffHash: string;
  reversible: boolean;
  expiresAt: number;
  humanDecision: boolean;
  separationOfDuties: boolean;
}

export interface M112CollaborativeRunContract {
  organizationId: string;
  runId: string;
  ownerHash: string;
  participantHashes: string[];
  handoffId?: string;
  commentCount: number;
  activeReviewerHash?: string;
  localMode: boolean;
  externalEgressAllowed: boolean;
  auditTrailHash: string;
}

export interface M112ProductCollaborationDecision {
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

export function validateM112Onboarding(onboarding: M112OnboardingContract): M112ProductCollaborationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[onboarding.organizationId, "organizationId"], [onboarding.userHash, "userHash"], [onboarding.projectId, "projectId"], [onboarding.locale, "locale"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!onboarding.consentRecorded || !onboarding.connectionChecked) reasons.push("onboarding consent and connection evidence are required");
  if (onboarding.state === "completed" && !onboarding.firstRunEvidenceHash) reasons.push("completed onboarding needs first-run evidence");
  if (onboarding.computeMode === "paid" && !onboarding.dismissedSafetyNotice) reasons.push("paid mode needs an explicit safety notice acknowledgement");
  if (onboarding.computeMode === "local" && onboarding.externalEgressAllowed) reasons.push("local mode cannot allow external egress");
  return { allowed: reasons.length === 0, reasons, requiresApproval: onboarding.computeMode === "paid", auditHash: hash(JSON.stringify({ onboarding, reasons })) };
}

export function validateM112Notification(notification: M112NotificationContract): M112ProductCollaborationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[notification.organizationId, "organizationId"], [notification.notificationId, "notificationId"], [notification.recipientHash, "recipientHash"], [notification.titleHash, "titleHash"], [notification.bodyHash, "bodyHash"], [notification.dedupeKey, "dedupeKey"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!notification.secretRedacted) reasons.push("notification must be secret-redacted");
  if (notification.kind === "approval" && !notification.actionable) reasons.push("approval notification must be actionable");
  if (notification.channel === "webhook" && !notification.sourceRunId) reasons.push("webhook notification needs a source run");
  return { allowed: reasons.length === 0, reasons, requiresApproval: notification.kind === "approval", auditHash: hash(JSON.stringify({ notification, reasons })) };
}

export function decideM112ApprovalSurface(request: M112ApprovalSurfaceRequest, now = Date.now()): M112ProductCollaborationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.approvalId, "approvalId"], [request.runId, "runId"], [request.actorHash, "actorHash"], [request.riskSummaryHash, "riskSummaryHash"], [request.diffHash, "diffHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!request.humanDecision || !request.separationOfDuties) reasons.push("approval needs a human decision and separation of duties");
  if (!Number.isFinite(request.expiresAt) || request.expiresAt <= now) reasons.push("approval request has expired");
  if (!request.reversible && request.action === "approve") reasons.push("irreversible approval needs an explicit higher-risk flow");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateM112CollaborativeRun(run: M112CollaborativeRunContract): M112ProductCollaborationDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[run.organizationId, "organizationId"], [run.runId, "runId"], [run.ownerHash, "ownerHash"], [run.auditTrailHash, "auditTrailHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (run.participantHashes.length === 0) reasons.push("collaborative run needs a participant");
  if (run.participantHashes.includes(run.ownerHash)) reasons.push("owner must be represented separately from participants");
  if (!Number.isInteger(run.commentCount) || run.commentCount < 0) reasons.push("comment count is invalid");
  if (run.localMode && run.externalEgressAllowed) reasons.push("local collaborative run cannot egress");
  return { allowed: reasons.length === 0, reasons, requiresApproval: Boolean(run.handoffId), auditHash: hash(JSON.stringify({ run, reasons })) };
}
