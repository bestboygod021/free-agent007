/** M197 fail-closed contracts for notification delivery and preference governance. */

export type M197Sensitivity = "informational" | "operational" | "security" | "critical";
export type M197Channel = "in_app" | "email" | "webhook" | "sms";

export interface M197NotificationIntent {
  organizationId: string;
  notificationId: string;
  eventType: string;
  sensitivity: M197Sensitivity;
  contentHash: string;
  recipientHash: string;
  allowedChannels: M197Channel[];
  consentPresent: boolean;
  preferenceHash: string;
  dedupeKey: string;
  ttlSeconds: number;
  tenantBound: boolean;
}

export interface M197Preference {
  organizationId: string;
  preferenceId: string;
  recipientHash: string;
  enabledChannels: M197Channel[];
  optedIn: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
  criticalBypassesQuietHours: boolean;
  categoryVersion: string;
  approved: boolean;
  tenantMatch: boolean;
}

export interface M197DeliveryEvidence {
  organizationId: string;
  notificationId: string;
  deliveryId: string;
  channel: M197Channel;
  providerReference: string;
  status: "accepted" | "delivered" | "failed" | "suppressed";
  attempts: number;
  deliveredAt: number;
  redacted: boolean;
  consentChecked: boolean;
  tenantMatch: boolean;
}

export interface M197Escalation {
  organizationId: string;
  notificationId: string;
  escalationId: string;
  currentLevel: number;
  maximumLevel: number;
  nextDeadlineAt: number;
  humanApprovalPresent: boolean;
  noSpamProof: boolean;
  critical: boolean;
  tenantMatch: boolean;
}

export interface M197NotificationDecision {
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

export function validateM197Intent(intent: M197NotificationIntent): M197NotificationDecision {
  const reasons: string[] = [];
  required([[intent.organizationId, "organizationId"], [intent.notificationId, "notificationId"], [intent.eventType, "eventType"], [intent.contentHash, "contentHash"], [intent.recipientHash, "recipientHash"], [intent.preferenceHash, "preferenceHash"], [intent.dedupeKey, "dedupeKey"]], reasons);
  if (intent.allowedChannels.length === 0 || intent.allowedChannels.some((channel) => !channel) || !intent.consentPresent || !Number.isInteger(intent.ttlSeconds) || intent.ttlSeconds < 1 || intent.ttlSeconds > 2_592_000 || !intent.tenantBound) reasons.push("notification intent needs channel, consent, bounded TTL and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: intent.sensitivity === "security" || intent.sensitivity === "critical", auditHash: hash(JSON.stringify({ intent, reasons })) };
}

export function validateM197Preference(preference: M197Preference): M197NotificationDecision {
  const reasons: string[] = [];
  required([[preference.organizationId, "organizationId"], [preference.preferenceId, "preferenceId"], [preference.recipientHash, "recipientHash"], [preference.categoryVersion, "categoryVersion"]], reasons);
  if (!Number.isInteger(preference.quietHoursStart) || preference.quietHoursStart < 0 || preference.quietHoursStart > 23 || !Number.isInteger(preference.quietHoursEnd) || preference.quietHoursEnd < 0 || preference.quietHoursEnd > 23 || preference.enabledChannels.length === 0 || !preference.optedIn || !preference.approved || !preference.tenantMatch) reasons.push("notification preference needs bounded quiet hours, channel, opt-in, approval and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ preference, reasons })) };
}

export function validateM197Delivery(evidence: M197DeliveryEvidence): M197NotificationDecision {
  const reasons: string[] = [];
  required([[evidence.organizationId, "organizationId"], [evidence.notificationId, "notificationId"], [evidence.deliveryId, "deliveryId"], [evidence.providerReference, "providerReference"]], reasons);
  if (!Number.isInteger(evidence.attempts) || evidence.attempts < 1 || evidence.attempts > 10 || !Number.isFinite(evidence.deliveredAt) || !evidence.redacted || !evidence.consentChecked || !evidence.tenantMatch) reasons.push("delivery evidence needs bounded attempts, timestamp, redaction, consent and tenant proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ evidence, reasons })) };
}

export function decideM197Escalation(escalation: M197Escalation, now: number): M197NotificationDecision {
  const reasons: string[] = [];
  required([[escalation.organizationId, "organizationId"], [escalation.notificationId, "notificationId"], [escalation.escalationId, "escalationId"]], reasons);
  if (!Number.isInteger(escalation.currentLevel) || escalation.currentLevel < 1 || !Number.isInteger(escalation.maximumLevel) || escalation.maximumLevel < escalation.currentLevel || escalation.currentLevel > 5 || !Number.isFinite(escalation.nextDeadlineAt) || escalation.nextDeadlineAt <= now || !escalation.noSpamProof || !escalation.tenantMatch || escalation.critical && !escalation.humanApprovalPresent) reasons.push("escalation needs bounded levels, deadline, no-spam, tenant and critical approval proof");
  return { allowed: reasons.length === 0, reasons, requiresApproval: escalation.critical, auditHash: hash(JSON.stringify({ escalation, now, reasons })) };
}
