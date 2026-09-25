/** M97 contracts for locale catalogs, RTL accessibility and offline/degraded clients. */

export type ClientSurfaceKind = "web" | "pwa" | "desktop" | "cli";
export type ClientDegradedMode = "offline" | "read_only" | "local_only" | "queued";

export interface LocaleCatalogContract {
  organizationId: string;
  catalogId: string;
  locale: string;
  fallbackLocale: string;
  messageCount: number;
  translatedCount: number;
  pluralRulesVersion: string;
  dateNumberFormatVersion: string;
  rtlSupported: boolean;
  reviewed: boolean;
}

export interface DegradedClientPolicy {
  organizationId: string;
  clientId: string;
  surface: ClientSurfaceKind;
  mode: ClientDegradedMode;
  lastKnownStateHash: string;
  queueMutation: boolean;
  mutationIdempotencyRequired: boolean;
  externalEgressAllowed: boolean;
  userNoticePresent: boolean;
}

export interface LocalizedAccessibilityEvidence {
  organizationId: string;
  evidenceId: string;
  screenId: string;
  locale: string;
  keyboardPassed: boolean;
  screenReaderPassed: boolean;
  contrastPassed: boolean;
  rtlPassed: boolean;
  pluralDateNumberPassed: boolean;
  reducedMotionPassed: boolean;
  reportHash: string;
}

export interface OfflineMutationRequest {
  organizationId: string;
  clientId: string;
  mutationId: string;
  operation: "create" | "update" | "comment" | "approval_request";
  payloadHash: string;
  idempotencyKey: string;
  queuedAt: number;
  conflictVersion?: number;
  userNoticePresent: boolean;
}

export interface LocalizationClientDecision {
  allowed: boolean;
  reasons: string[];
  requiresApproval: boolean;
  auditHash: string;
}

export class LocalizationClientContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalizationClientContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function validateLocaleCatalog(catalog: LocaleCatalogContract): LocalizationClientDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[catalog.organizationId, "organizationId"], [catalog.catalogId, "catalogId"], [catalog.locale, "locale"], [catalog.fallbackLocale, "fallbackLocale"], [catalog.pluralRulesVersion, "pluralRulesVersion"], [catalog.dateNumberFormatVersion, "dateNumberFormatVersion"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(catalog.locale) || !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(catalog.fallbackLocale)) reasons.push("locale must be BCP-47-like");
  if (!Number.isSafeInteger(catalog.messageCount) || !Number.isSafeInteger(catalog.translatedCount) || catalog.messageCount < 1 || catalog.translatedCount < 0 || catalog.translatedCount > catalog.messageCount) reasons.push("locale message counts are invalid");
  if (!catalog.rtlSupported && ["fa-IR", "ar-SA", "he-IL"].includes(catalog.locale)) reasons.push("RTL locale requires RTL support");
  if (!catalog.reviewed) reasons.push("locale catalog requires review");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ catalog, reasons })) };
}

export function decideDegradedClientPolicy(policy: DegradedClientPolicy): LocalizationClientDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[policy.organizationId, "organizationId"], [policy.clientId, "clientId"], [policy.lastKnownStateHash, "lastKnownStateHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (policy.mode === "offline" && policy.externalEgressAllowed) reasons.push("offline mode cannot use external egress");
  if (policy.queueMutation && !policy.mutationIdempotencyRequired) reasons.push("queued mutation requires idempotency");
  if (!policy.userNoticePresent) reasons.push("degraded mode needs a user notice");
  if (policy.surface === "cli" && policy.mode === "offline" && policy.queueMutation) reasons.push("offline CLI queue requires explicit replay command");
  return { allowed: reasons.length === 0, reasons, requiresApproval: policy.queueMutation, auditHash: hash(JSON.stringify({ policy, reasons })) };
}

export function validateLocalizedAccessibilityEvidence(evidence: LocalizedAccessibilityEvidence): LocalizationClientDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[evidence.organizationId, "organizationId"], [evidence.evidenceId, "evidenceId"], [evidence.screenId, "screenId"], [evidence.locale, "locale"], [evidence.reportHash, "reportHash"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!evidence.keyboardPassed || !evidence.screenReaderPassed || !evidence.contrastPassed || !evidence.rtlPassed || !evidence.pluralDateNumberPassed || !evidence.reducedMotionPassed) reasons.push("localized accessibility evidence is incomplete");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function validateOfflineMutation(request: OfflineMutationRequest): LocalizationClientDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.clientId, "clientId"], [request.mutationId, "mutationId"], [request.payloadHash, "payloadHash"], [request.idempotencyKey, "idempotencyKey"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isFinite(request.queuedAt)) reasons.push("offline queue timestamp is invalid");
  if (!request.userNoticePresent) reasons.push("offline mutation needs user notice");
  if (request.operation === "approval_request" && request.conflictVersion === undefined) reasons.push("offline approval request needs conflict version");
  return { allowed: reasons.length === 0, reasons, requiresApproval: request.operation === "approval_request", auditHash: hash(JSON.stringify({ request, reasons })) };
}
