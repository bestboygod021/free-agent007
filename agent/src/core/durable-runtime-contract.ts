/**
 * M29 contracts for durable runtime adapters.
 *
 * These decisions are intentionally storage-agnostic. They define the boundary
 * PostgreSQL/RLS, an outbox, idempotency storage and a durable queue must obey;
 * this file never opens a database or claims production persistence.
 */

export type DurableMutationKind = "insert" | "update" | "delete";

export interface TenantSession {
  organizationId: string;
  projectId?: string;
  actorId: string;
  actorRole: "owner" | "admin" | "developer" | "agent" | "viewer";
  transactionId: string;
}

export interface DurableMutation {
  mutationId: string;
  organizationId: string;
  resource: string;
  kind: DurableMutationKind;
  idempotencyKey: string;
  payloadHash: string;
  protectedResource: boolean;
}

export interface DurableDecision {
  allowed: boolean;
  reasons: string[];
  tenantContext: { organizationId: string; projectId?: string; transactionId: string };
  decisionHash: string;
}

export interface OutboxEvent {
  eventId: string;
  organizationId: string;
  aggregateId: string;
  sequence: number;
  type: string;
  payloadHash: string;
  occurredAt: number;
}

export interface OutboxDecision {
  allowed: boolean;
  reasons: string[];
  nextSequence: number;
  decisionHash: string;
}

export interface DurableJob {
  jobId: string;
  organizationId: string;
  type: string;
  idempotencyKey: string;
  payloadHash: string;
  maxAttempts: number;
  availableAt: number;
}

export interface DurableIdempotencyRecord {
  organizationId: string;
  idempotencyKey: string;
  requestHash: string;
  responseHash: string;
  expiresAt: number;
}

export type IdempotencyDecision =
  | { kind: "new"; reason: string }
  | { kind: "replay"; responseHash: string }
  | { kind: "conflict"; reason: string };

export class DurableRuntimeContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DurableRuntimeContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new DurableRuntimeContractError(`${label} is required`);
}

export function decideTenantMutation(mutation: DurableMutation, session: TenantSession): DurableDecision {
  for (const [value, label] of [[mutation.mutationId, "mutationId"], [mutation.organizationId, "organizationId"], [mutation.resource, "resource"], [mutation.idempotencyKey, "idempotencyKey"], [mutation.payloadHash, "payloadHash"], [session.organizationId, "session organizationId"], [session.actorId, "actorId"], [session.transactionId, "transactionId"]] as const) required(value, label);
  const reasons: string[] = [];
  if (mutation.organizationId !== session.organizationId) reasons.push("mutation tenant does not match transaction tenant");
  if (mutation.protectedResource && !["owner", "admin"].includes(session.actorRole)) reasons.push("protected resource requires owner or admin");
  if (mutation.kind === "delete" && session.actorRole === "agent") reasons.push("agent cannot delete durable resources");
  return { allowed: reasons.length === 0, reasons, tenantContext: { organizationId: session.organizationId, projectId: session.projectId, transactionId: session.transactionId }, decisionHash: hash(JSON.stringify({ mutation, session: { organizationId: session.organizationId, projectId: session.projectId, transactionId: session.transactionId }, reasons })) };
}

export function planOutboxAppend(existing: readonly OutboxEvent[], event: OutboxEvent): OutboxDecision {
  required(event.eventId, "eventId");
  required(event.organizationId, "organizationId");
  required(event.aggregateId, "aggregateId");
  required(event.type, "type");
  required(event.payloadHash, "payloadHash");
  const aggregate = existing.filter((item) => item.organizationId === event.organizationId && item.aggregateId === event.aggregateId);
  const duplicate = existing.find((item) => item.eventId === event.eventId);
  const expected = aggregate.length === 0 ? 1 : Math.max(...aggregate.map((item) => item.sequence)) + 1;
  const reasons: string[] = [];
  if (duplicate) reasons.push("event id already exists");
  if (event.sequence !== expected) reasons.push(`event sequence must be ${expected}`);
  return { allowed: reasons.length === 0, reasons, nextSequence: expected, decisionHash: hash(JSON.stringify({ event, expected, reasons })) };
}

export function planDurableJob(job: DurableJob, now: number): DurableDecision {
  const reasons: string[] = [];
  required(job.jobId, "jobId");
  required(job.organizationId, "organizationId");
  required(job.type, "type");
  required(job.idempotencyKey, "idempotencyKey");
  required(job.payloadHash, "payloadHash");
  if (!Number.isFinite(job.availableAt) || !Number.isFinite(now)) reasons.push("job and clock timestamps must be finite");
  if (!Number.isInteger(job.maxAttempts) || job.maxAttempts < 1 || job.maxAttempts > 20) reasons.push("maxAttempts must be between 1 and 20");
  if (!Number.isFinite(now) || job.availableAt < now - 86_400_000) reasons.push("job availability is outside the accepted window");
  return { allowed: reasons.length === 0, reasons, tenantContext: { organizationId: job.organizationId, transactionId: `job:${job.jobId}` }, decisionHash: hash(JSON.stringify({ job, reasons })) };
}

export function decideIdempotency(records: readonly DurableIdempotencyRecord[], organizationId: string, key: string, requestHash: string, now: number): IdempotencyDecision {
  required(organizationId, "organizationId");
  required(key, "idempotencyKey");
  required(requestHash, "requestHash");
  if (!Number.isFinite(now)) throw new DurableRuntimeContractError("clock timestamp must be finite");
  const record = records.find((item) => item.organizationId === organizationId && item.idempotencyKey === key && Number.isFinite(item.expiresAt) && item.expiresAt > now);
  if (!record) return { kind: "new", reason: "no unexpired record exists for this tenant and key" };
  if (record.requestHash !== requestHash) return { kind: "conflict", reason: "same idempotency key was used with a different request" };
  return { kind: "replay", responseHash: record.responseHash };
}
