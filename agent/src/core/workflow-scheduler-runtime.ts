/** M141 contracts for scheduled workflows, event triggers, leases and concurrency. */

export type M141MisfirePolicy = "skip" | "run_once" | "catch_up_bounded";
export type M141TriggerKind = "cron" | "event" | "manual" | "webhook";

export interface M141Schedule {
  organizationId: string;
  scheduleId: string;
  workflowId: string;
  timezone: string;
  expression: string;
  nextRunAt: number;
  enabled: boolean;
  maxConcurrent: number;
  misfirePolicy: M141MisfirePolicy;
  ownerReference: string;
  approvalPresent: boolean;
  tenantBound: boolean;
}

export interface M141Trigger {
  organizationId: string;
  triggerId: string;
  kind: M141TriggerKind;
  eventType: string;
  eventHash: string;
  dedupeKey: string;
  occurredAt: number;
  tenantMatch: boolean;
  authorized: boolean;
  redacted: boolean;
}

export interface M141RunLease {
  organizationId: string;
  runId: string;
  scheduleId: string;
  attempt: number;
  leaseIssuedAt: number;
  leaseExpiresAt: number;
  workerReference: string;
  idempotencyKey: string;
  maxAttempts: number;
  concurrencySlot: number;
  revoked: boolean;
}

export interface M141ConcurrencyDecisionInput {
  organizationId: string;
  scheduleId: string;
  activeRuns: number;
  maxConcurrent: number;
  queuedRuns: number;
  tenantMatch: boolean;
  quotaAvailable: boolean;
  duplicateTrigger: boolean;
}

export interface M141SchedulerDecision {
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

export function validateM141Schedule(schedule: M141Schedule, now: number): M141SchedulerDecision {
  const reasons: string[] = [];
  required([[schedule.organizationId, "organizationId"], [schedule.scheduleId, "scheduleId"], [schedule.workflowId, "workflowId"], [schedule.timezone, "timezone"], [schedule.expression, "expression"], [schedule.ownerReference, "ownerReference"]], reasons);
  if (!Number.isFinite(schedule.nextRunAt) || schedule.nextRunAt <= now) reasons.push("next run must be in the future");
  if (!Number.isInteger(schedule.maxConcurrent) || schedule.maxConcurrent < 1 || schedule.maxConcurrent > 100) reasons.push("max concurrency must be between one and one hundred");
  if (!schedule.enabled || !schedule.tenantBound || !schedule.approvalPresent) reasons.push("enabled schedule needs tenant scope and approval");
  if (schedule.expression.length > 200) reasons.push("schedule expression is too long");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ schedule, now, reasons })) };
}

export function decideM141Trigger(trigger: M141Trigger, now: number): M141SchedulerDecision {
  const reasons: string[] = [];
  required([[trigger.organizationId, "organizationId"], [trigger.triggerId, "triggerId"], [trigger.eventType, "eventType"], [trigger.eventHash, "eventHash"], [trigger.dedupeKey, "dedupeKey"]], reasons);
  if (!Number.isFinite(trigger.occurredAt) || trigger.occurredAt > now) reasons.push("trigger time is invalid");
  if (!trigger.tenantMatch || !trigger.authorized || !trigger.redacted) reasons.push("trigger needs tenant, authorization and redaction evidence");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ trigger, now, reasons })) };
}

export function validateM141RunLease(lease: M141RunLease, now: number): M141SchedulerDecision {
  const reasons: string[] = [];
  required([[lease.organizationId, "organizationId"], [lease.runId, "runId"], [lease.scheduleId, "scheduleId"], [lease.workerReference, "workerReference"], [lease.idempotencyKey, "idempotencyKey"]], reasons);
  if (!Number.isInteger(lease.attempt) || lease.attempt < 1 || lease.attempt > lease.maxAttempts) reasons.push("attempt must be within max attempts");
  if (!Number.isInteger(lease.maxAttempts) || lease.maxAttempts < 1 || lease.maxAttempts > 20) reasons.push("max attempts must be between one and twenty");
  if (!Number.isFinite(lease.leaseIssuedAt) || !Number.isFinite(lease.leaseExpiresAt) || lease.leaseExpiresAt <= lease.leaseIssuedAt || lease.leaseExpiresAt <= now) reasons.push("lease lifetime is invalid");
  if (!Number.isInteger(lease.concurrencySlot) || lease.concurrencySlot < 0) reasons.push("concurrency slot is invalid");
  if (lease.revoked) reasons.push("lease is revoked");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ lease, now, reasons })) };
}

export function decideM141Concurrency(input: M141ConcurrencyDecisionInput): M141SchedulerDecision {
  const reasons: string[] = [];
  required([[input.organizationId, "organizationId"], [input.scheduleId, "scheduleId"]], reasons);
  if (![input.activeRuns, input.maxConcurrent, input.queuedRuns].every((value) => Number.isInteger(value) && value >= 0)) reasons.push("concurrency counts must be non-negative integers");
  if (input.activeRuns >= input.maxConcurrent) reasons.push("schedule concurrency limit is reached");
  if (input.queuedRuns > 1000) reasons.push("queue bound is exceeded");
  if (!input.tenantMatch || !input.quotaAvailable || input.duplicateTrigger) reasons.push("tenant, quota or dedupe gate blocks run");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ input, reasons })) };
}
