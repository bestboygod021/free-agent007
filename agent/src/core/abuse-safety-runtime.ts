/** M117 contracts for abuse prevention, DLP inspection and governed account activity. */

export type M117AbuseClass = "malware" | "spam" | "scraping" | "credential_abuse" | "harassment" | "unknown";
export type M117SafetyAction = "allow" | "limit" | "hold" | "deny" | "escalate";

export interface M117AbuseSignalContract {
  organizationId: string;
  signalId: string;
  actorHash: string;
  abuseClass: M117AbuseClass;
  score: number;
  source: "rule" | "model" | "report" | "rate_limit";
  evidenceHash: string;
  observedAt: number;
  repeatCount: number;
  humanReview: boolean;
}

export interface M117SafetyPolicyContract {
  organizationId: string;
  policyId: string;
  blockedClasses: readonly M117AbuseClass[];
  reviewThreshold: number;
  denyThreshold: number;
  maxBulkItems: number;
  scrapingRequiresApproval: boolean;
  malwareSandboxRequired: boolean;
  reviewed: boolean;
}

export interface M117DlpInspectionEvidence {
  organizationId: string;
  inspectionId: string;
  artifactHash: string;
  secretMatches: number;
  personalDataMatches: number;
  tenantMismatchMatches: number;
  patternsVersion: string;
  redacted: boolean;
  blocked: boolean;
  reviewerHash?: string;
}

export interface M117AccountActivityRequest {
  organizationId: string;
  actorHash: string;
  activityId: string;
  targetCount: number;
  uniqueTargets: number;
  intervalMs: number;
  captchaOrMfaBypassAttempt: boolean;
  bulkCreation: boolean;
  consentPresent: boolean;
  approvalPresent: boolean;
  idempotencyKey: string;
}

export interface M117SafetyDecision {
  allowed: boolean;
  reasons: string[];
  action: M117SafetyAction;
  requiresApproval: boolean;
  auditHash: string;
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function validateM117AbuseSignal(signal: M117AbuseSignalContract): M117SafetyDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[signal.organizationId, "organizationId"], [signal.signalId, "signalId"], [signal.actorHash, "actorHash"], [signal.evidenceHash, "evidenceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(signal.score) || signal.score < 0 || signal.score > 1) reasons.push("abuse score must be between zero and one");
  if (!Number.isFinite(signal.observedAt) || signal.repeatCount < 0 || !Number.isInteger(signal.repeatCount)) reasons.push("abuse timestamp/repeat count is invalid");
  if (signal.score >= 0.8 && !signal.humanReview) reasons.push("high-confidence abuse needs human review");
  return { allowed: reasons.length === 0, reasons, action: signal.score >= 0.8 ? "hold" : "limit", requiresApproval: signal.score >= 0.8, auditHash: hash(JSON.stringify({ signal, reasons })) };
}

export function decideM117SafetyAction(signal: M117AbuseSignalContract, policy: M117SafetyPolicyContract): M117SafetyDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[policy.organizationId, "policy.organizationId"], [policy.policyId, "policy.policyId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!policy.reviewed) reasons.push("abuse policy requires review");
  if (!Number.isFinite(policy.reviewThreshold) || !Number.isFinite(policy.denyThreshold) || policy.reviewThreshold < 0 || policy.denyThreshold > 1 || policy.reviewThreshold >= policy.denyThreshold) reasons.push("abuse thresholds are invalid");
  if (!Number.isInteger(policy.maxBulkItems) || policy.maxBulkItems < 1) reasons.push("bulk item limit must be positive");
  if (policy.blockedClasses.includes(signal.abuseClass)) reasons.push("abuse class is blocked by policy");
  if (signal.score >= policy.denyThreshold) reasons.push("abuse score exceeds deny threshold");
  if (signal.score >= policy.reviewThreshold && !signal.humanReview) reasons.push("abuse score requires human review");
  if (signal.abuseClass === "scraping" && policy.scrapingRequiresApproval && !signal.humanReview) reasons.push("scraping requires approval");
  if (signal.abuseClass === "malware" && policy.malwareSandboxRequired && !signal.humanReview) reasons.push("malware analysis needs sandboxed review");
  const action: M117SafetyAction = reasons.length > 0 && (signal.score >= policy.denyThreshold || policy.blockedClasses.includes(signal.abuseClass)) ? "deny" : signal.score >= policy.reviewThreshold ? "hold" : "allow";
  return { allowed: reasons.length === 0, reasons, action, requiresApproval: action === "hold", auditHash: hash(JSON.stringify({ signal, policy, reasons })) };
}

export function validateM117DlpInspection(evidence: M117DlpInspectionEvidence): M117SafetyDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.inspectionId, "inspectionId"], [evidence.artifactHash, "artifactHash"], [evidence.patternsVersion, "patternsVersion"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (evidence.secretMatches < 0 || evidence.personalDataMatches < 0 || evidence.tenantMismatchMatches < 0) reasons.push("DLP match counts cannot be negative");
  if ((evidence.secretMatches > 0 || evidence.personalDataMatches > 0 || evidence.tenantMismatchMatches > 0) && !evidence.redacted) reasons.push("DLP matches require redaction");
  if (evidence.tenantMismatchMatches > 0 && !evidence.blocked) reasons.push("tenant mismatch must block output");
  if (evidence.blocked && !evidence.reviewerHash) reasons.push("blocked DLP artifact needs reviewer evidence");
  return { allowed: reasons.length === 0, reasons, action: evidence.blocked ? "deny" : "allow", requiresApproval: evidence.blocked, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function decideM117AccountActivity(request: M117AccountActivityRequest, policy: M117SafetyPolicyContract): M117SafetyDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.actorHash, "actorHash"], [request.activityId, "activityId"], [request.idempotencyKey, "idempotencyKey"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (request.captchaOrMfaBypassAttempt) reasons.push("CAPTCHA/MFA bypass is prohibited");
  if (request.bulkCreation) reasons.push("bulk account creation is prohibited");
  if (!request.consentPresent || !request.approvalPresent) reasons.push("high-volume activity needs consent and approval");
  if (!Number.isInteger(request.targetCount) || request.targetCount < 1 || request.targetCount > policy.maxBulkItems) reasons.push("activity target count exceeds policy");
  if (!Number.isInteger(request.uniqueTargets) || request.uniqueTargets < 1 || request.uniqueTargets > request.targetCount) reasons.push("unique target count is invalid");
  if (!Number.isInteger(request.intervalMs) || request.intervalMs < 100) reasons.push("activity interval is too aggressive");
  return { allowed: reasons.length === 0, reasons, action: reasons.length === 0 ? "allow" : "deny", requiresApproval: true, auditHash: hash(JSON.stringify({ request, policy: policy.policyId, reasons })) };
}
