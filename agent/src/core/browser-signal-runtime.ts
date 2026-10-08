/** M46 contracts for browser handover and untrusted external signal intake. */

export type BrowserSignalSource = "webpage" | "forum" | "social" | "issue";
export type BrowserAction = "navigate" | "read" | "download" | "submit";

export interface BrowserSessionRequest {
  organizationId: string;
  sessionId: string;
  domain: string;
  allowlisted: boolean;
  recordingEnabled: boolean;
  persistCookies: boolean;
  containsRawCredential: boolean;
}

export interface BrowserDecision {
  allowed: boolean;
  reasons: string[];
  requiresHumanHandover: boolean;
  evidenceHash: string;
}

export interface BrowserNavigationRequest {
  organizationId: string;
  domain: string;
  action: BrowserAction;
  urlHash: string;
  allowlisted: boolean;
  hasCaptcha: boolean;
  requiresMfa: boolean;
  approvalPresent: boolean;
}

export interface HumanHandoverPlan {
  organizationId: string;
  sessionId: string;
  reason: "captcha" | "mfa" | "payment" | "ambiguous_consent" | "high_risk_submit";
  redactedContextHash: string;
  expiresAt: number;
}

export interface ExternalSignal {
  organizationId: string;
  source: BrowserSignalSource;
  sourceUrlHash: string;
  contentHash: string;
  fetchedAt: number;
  containsInstruction: boolean;
  trust: "untrusted";
}

export interface HarvesterRequest {
  organizationId: string;
  domain: string;
  queryHash: string;
  maxPages: number;
  rateLimitPerMinute: number;
  robotsPolicyChecked: boolean;
  bulkAccountCreation: false;
}

export class BrowserSignalContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserSignalContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new BrowserSignalContractError(`${label} is required`);
}

export function validateBrowserSession(request: BrowserSessionRequest): BrowserDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.sessionId, "sessionId"], [request.domain, "domain"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!request.allowlisted) reasons.push("browser domain is not allowlisted");
  if (request.persistCookies) reasons.push("browser session cannot persist cookies by default");
  if (request.containsRawCredential) reasons.push("raw credentials are forbidden in browser session");
  return { allowed: reasons.length === 0, reasons, requiresHumanHandover: false, evidenceHash: hash(JSON.stringify({ request, reasons })) };
}

export function decideBrowserNavigation(request: BrowserNavigationRequest, now: number): BrowserDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.domain, "domain"], [request.urlHash, "urlHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!request.allowlisted) reasons.push("navigation domain is not allowlisted");
  if (request.hasCaptcha || request.requiresMfa) reasons.push("browser automation must stop for CAPTCHA or MFA handover");
  if (request.action === "submit" && !request.approvalPresent) reasons.push("browser submit requires approval");
  if (!Number.isFinite(now)) reasons.push("browser clock must be finite");
  return { allowed: reasons.length === 0, reasons, requiresHumanHandover: request.hasCaptcha || request.requiresMfa, evidenceHash: hash(JSON.stringify({ request, now, reasons })) };
}

export function planHumanHandover(plan: HumanHandoverPlan, now: number): BrowserDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[plan.organizationId, "organizationId"], [plan.sessionId, "sessionId"], [plan.redactedContextHash, "redactedContextHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(now) || plan.expiresAt <= now || plan.expiresAt > now + 30 * 60_000) reasons.push("handover expiry must be within 30 minutes");
  return { allowed: reasons.length === 0, reasons, requiresHumanHandover: true, evidenceHash: hash(JSON.stringify({ plan, now, reasons })) };
}

export function classifyExternalSignal(signal: ExternalSignal): BrowserDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[signal.organizationId, "organizationId"], [signal.sourceUrlHash, "sourceUrlHash"], [signal.contentHash, "contentHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (signal.trust !== "untrusted") reasons.push("external signal must remain untrusted");
  if (!Number.isFinite(signal.fetchedAt)) reasons.push("signal timestamp must be finite");
  if (signal.containsInstruction) reasons.push("external instructions cannot authorize actions");
  return { allowed: reasons.length === 0, reasons, requiresHumanHandover: signal.containsInstruction, evidenceHash: hash(JSON.stringify({ signal, reasons })) };
}

export function validateHarvesterRequest(request: HarvesterRequest): BrowserDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.domain, "domain"], [request.queryHash, "queryHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(request.maxPages) || request.maxPages < 1 || request.maxPages > 100) reasons.push("harvester page bound is invalid");
  if (!Number.isInteger(request.rateLimitPerMinute) || request.rateLimitPerMinute < 1) reasons.push("harvester rate limit is invalid");
  if (!request.robotsPolicyChecked) reasons.push("robots/terms policy must be checked before harvesting");
  return { allowed: reasons.length === 0, reasons, requiresHumanHandover: false, evidenceHash: hash(JSON.stringify({ request, reasons })) };
}
