/** M96 contracts for browser automation, external signals and signed webhook delivery. */

export type ExternalBrowserAction = "navigate" | "read" | "download" | "submit";
export type SignalHarvestSource = "web" | "forum" | "social" | "feed";
export type SignalTrust = "unverified" | "corroborated" | "reviewed";

export interface ExternalBrowserSession {
  organizationId: string;
  sessionId: string;
  allowedDomains: string[];
  action: ExternalBrowserAction;
  targetUrl: string;
  recordingHash: string;
  humanHandoverRequired: boolean;
  humanHandoverPresent: boolean;
  egressApprovalPresent: boolean;
  secretInjectionAllowed: false;
}

export interface ExternalSignalHarvest {
  organizationId: string;
  harvestId: string;
  source: SignalHarvestSource;
  queryHash: string;
  resultHash: string;
  observedAt: number;
  boundedResultCount: number;
  sourceProvenanceHash: string;
  trust: SignalTrust;
  userConsent: boolean;
}

export interface SignedWebhookDelivery {
  organizationId: string;
  deliveryId: string;
  endpointReference: string;
  eventType: string;
  payloadHash: string;
  signatureReference: string;
  timestamp: number;
  attempt: number;
  dedupeKey: string;
  responseCode?: number;
  responseBodyRedacted: boolean;
}

export interface WebhookReplayGuard {
  organizationId: string;
  deliveryId: string;
  dedupeKey: string;
  receivedAt: number;
  originalTimestamp: number;
  maxAgeSeconds: number;
  signatureValid: boolean;
  alreadyProcessed: boolean;
}

export interface BrowserSignalDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class BrowserSignalDeliveryContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserSignalDeliveryContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function validateExternalBrowserSession(session: ExternalBrowserSession): BrowserSignalDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[session.organizationId, "organizationId"], [session.sessionId, "sessionId"], [session.targetUrl, "targetUrl"], [session.recordingHash, "recordingHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!session.targetUrl.startsWith("https://")) reasons.push("browser target must use HTTPS");
  if (session.allowedDomains.length === 0 || session.allowedDomains.some((domain) => domain.startsWith("*") || !domain.includes("."))) reasons.push("browser session needs explicit domain allowlist");
  if (session.humanHandoverRequired && !session.humanHandoverPresent) reasons.push("browser action requires human handover");
  if (!session.egressApprovalPresent) reasons.push("browser egress requires approval");
  if (session.secretInjectionAllowed) reasons.push("browser secret injection is forbidden");
  if (session.action === "submit" && !session.humanHandoverPresent) reasons.push("form submission requires human confirmation");
  return { allowed: reasons.length === 0, reasons, requiresApproval: session.action === "submit", auditHash: hash(JSON.stringify({ session, reasons })) };
}

export function decideExternalSignalHarvest(harvest: ExternalSignalHarvest): BrowserSignalDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[harvest.organizationId, "organizationId"], [harvest.harvestId, "harvestId"], [harvest.queryHash, "queryHash"], [harvest.resultHash, "resultHash"], [harvest.sourceProvenanceHash, "sourceProvenanceHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isSafeInteger(harvest.boundedResultCount) || harvest.boundedResultCount < 0 || harvest.boundedResultCount > 1000) reasons.push("harvest result bound is invalid");
  if (!Number.isFinite(harvest.observedAt)) reasons.push("harvest timestamp is invalid");
  if (!harvest.userConsent) reasons.push("external signal harvesting requires consent");
  if (harvest.trust === "unverified") reasons.push("unverified signal cannot become product authority");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ harvest, reasons })) };
}

export function validateSignedWebhookDelivery(delivery: SignedWebhookDelivery): BrowserSignalDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[delivery.organizationId, "organizationId"], [delivery.deliveryId, "deliveryId"], [delivery.endpointReference, "endpointReference"], [delivery.eventType, "eventType"], [delivery.payloadHash, "payloadHash"], [delivery.signatureReference, "signatureReference"], [delivery.dedupeKey, "dedupeKey"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!delivery.endpointReference.startsWith("https://")) reasons.push("webhook endpoint must use HTTPS");
  if (!Number.isFinite(delivery.timestamp) || !Number.isSafeInteger(delivery.attempt) || delivery.attempt < 1) reasons.push("webhook timestamp/attempt is invalid");
  if (!delivery.responseBodyRedacted) reasons.push("webhook response must be redacted");
  if (/password|secret|token|api[_-]?key/i.test(delivery.signatureReference)) reasons.push("signature reference must be opaque");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ delivery, reasons })) };
}

export function decideWebhookReplayGuard(guard: WebhookReplayGuard): BrowserSignalDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[guard.organizationId, "organizationId"], [guard.deliveryId, "deliveryId"], [guard.dedupeKey, "dedupeKey"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(guard.receivedAt) || !Number.isFinite(guard.originalTimestamp) || !Number.isSafeInteger(guard.maxAgeSeconds) || guard.maxAgeSeconds < 1) reasons.push("replay timestamps/bounds are invalid");
  if (guard.receivedAt - guard.originalTimestamp > guard.maxAgeSeconds) reasons.push("webhook is outside replay window");
  if (!guard.signatureValid) reasons.push("webhook signature is invalid");
  if (guard.alreadyProcessed) reasons.push("duplicate webhook delivery");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ guard, reasons })) };
}
