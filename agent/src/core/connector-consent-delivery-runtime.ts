/** M126 contracts for connector consent, signed webhook delivery and reconciliation. */

export type M126ConnectorMode = "local" | "free" | "byok" | "paid";
export type M126ActionRisk = "read" | "write" | "admin";

export interface M126ConsentGrant {
  organizationId: string;
  connectorId: string;
  grantId: string;
  subjectHash: string;
  provider: string;
  scopes: string[];
  purpose: string;
  mode: M126ConnectorMode;
  consentRecorded: boolean;
  termsReviewed: boolean;
  credentialReference: string;
  expiresAt: number;
  revoked: boolean;
}

export interface M126WebhookDelivery {
  organizationId: string;
  connectorId: string;
  deliveryId: string;
  eventType: string;
  payloadHash: string;
  signatureValid: boolean;
  observedAt: number;
  maxAgeSeconds: number;
  dedupeKey: string;
  outboxLinked: boolean;
  outputRedacted: boolean;
}

export interface M126ReconciliationRecord {
  organizationId: string;
  connectorId: string;
  reconciliationId: string;
  localCursor: number;
  remoteCursor: number;
  lastEventHash: string;
  missingEvents: number;
  duplicateEvents: number;
  conflicts: number;
  replaySafe: boolean;
  evidenceHash: string;
}

export interface M126ConnectorAction {
  organizationId: string;
  connectorId: string;
  actionId: string;
  actorHash: string;
  risk: M126ActionRisk;
  targetOrganizationId: string;
  scope: string;
  idempotencyKey: string;
  approvalPresent: boolean;
  mode: M126ConnectorMode;
  sandboxed: boolean;
  localFallbackAvailable: boolean;
}

export interface M126ConnectorDecision {
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

export function validateM126Consent(grant: M126ConsentGrant, now = Date.now()): M126ConnectorDecision {
  const reasons: string[] = [];
  required([[grant.organizationId, "organizationId"], [grant.connectorId, "connectorId"], [grant.grantId, "grantId"], [grant.subjectHash, "subjectHash"], [grant.provider, "provider"], [grant.purpose, "purpose"], [grant.credentialReference, "credentialReference"]], reasons);
  if (grant.scopes.length === 0 || new Set(grant.scopes).size !== grant.scopes.length) reasons.push("connector scopes must be non-empty and unique");
  if (!grant.consentRecorded || !grant.termsReviewed) reasons.push("connector consent and terms evidence is incomplete");
  if (!Number.isFinite(grant.expiresAt) || grant.expiresAt <= now) reasons.push("connector consent is expired");
  if (grant.revoked) reasons.push("connector consent is revoked");
  if (/password|secret|token|api[_-]?key/i.test(grant.credentialReference)) reasons.push("credential reference must be opaque");
  return { allowed: reasons.length === 0, reasons, requiresApproval: grant.mode === "paid", auditHash: hash(JSON.stringify({ grant, reasons })) };
}

export function decideM126Webhook(delivery: M126WebhookDelivery, now: number): M126ConnectorDecision {
  const reasons: string[] = [];
  required([[delivery.organizationId, "organizationId"], [delivery.connectorId, "connectorId"], [delivery.deliveryId, "deliveryId"], [delivery.eventType, "eventType"], [delivery.payloadHash, "payloadHash"], [delivery.dedupeKey, "dedupeKey"]], reasons);
  if (!delivery.signatureValid) reasons.push("webhook signature is invalid");
  if (!Number.isFinite(delivery.observedAt) || delivery.observedAt > now) reasons.push("webhook timestamp is invalid");
  if (!Number.isInteger(delivery.maxAgeSeconds) || delivery.maxAgeSeconds < 1 || now - delivery.observedAt > delivery.maxAgeSeconds) reasons.push("webhook is stale");
  if (!delivery.outboxLinked || !delivery.outputRedacted) reasons.push("webhook needs outbox linkage and redacted output");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ delivery, now, reasons })) };
}

export function validateM126Reconciliation(record: M126ReconciliationRecord): M126ConnectorDecision {
  const reasons: string[] = [];
  required([[record.organizationId, "organizationId"], [record.connectorId, "connectorId"], [record.reconciliationId, "reconciliationId"], [record.lastEventHash, "lastEventHash"], [record.evidenceHash, "evidenceHash"]], reasons);
  if (!Number.isInteger(record.localCursor) || record.localCursor < 0 || !Number.isInteger(record.remoteCursor) || record.remoteCursor < 0) reasons.push("connector cursors must be non-negative integers");
  if (![record.missingEvents, record.duplicateEvents, record.conflicts].every((value) => Number.isInteger(value) && value >= 0)) reasons.push("reconciliation counts must be non-negative integers");
  if (record.conflicts > 0 || !record.replaySafe) reasons.push("connector reconciliation needs conflict resolution and replay safety");
  return { allowed: reasons.length === 0, reasons, requiresApproval: record.missingEvents > 0 || record.conflicts > 0, auditHash: hash(JSON.stringify({ record, reasons })) };
}

export function decideM126Action(action: M126ConnectorAction): M126ConnectorDecision {
  const reasons: string[] = [];
  required([[action.organizationId, "organizationId"], [action.connectorId, "connectorId"], [action.actionId, "actionId"], [action.actorHash, "actorHash"], [action.targetOrganizationId, "targetOrganizationId"], [action.scope, "scope"], [action.idempotencyKey, "idempotencyKey"]], reasons);
  if (action.organizationId !== action.targetOrganizationId) reasons.push("connector action crosses organization boundary");
  if (action.risk !== "read" && !action.approvalPresent) reasons.push("connector mutation needs approval");
  if (action.risk !== "read" && !action.sandboxed) reasons.push("connector mutation must run in a sandbox");
  if (!action.localFallbackAvailable && action.mode === "local") reasons.push("local connector needs a safe fallback");
  return { allowed: reasons.length === 0, reasons, requiresApproval: action.risk !== "read", auditHash: hash(JSON.stringify({ action, reasons })) };
}
