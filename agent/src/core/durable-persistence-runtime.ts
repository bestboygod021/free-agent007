/** M65 contracts for durable transactions, RLS context, outbox and job leases. */

export type PersistenceIsolation = "read_committed" | "repeatable_read" | "serializable";
export type DurableJobState = "queued" | "leased" | "completed" | "failed" | "dead_letter";

export interface DurableTransactionRequest {
  organizationId: string;
  transactionId: string;
  operation: "create" | "update" | "delete" | "append_event";
  entityType: string;
  entityId: string;
  isolation: PersistenceIsolation;
  rlsTenantSet: boolean;
  idempotencyKey: string;
  expectedVersion?: number;
  approvalPresent: boolean;
}

export interface DurableOutboxEvent {
  organizationId: string;
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payloadHash: string;
  transactionId: string;
  sequence: number;
  published: boolean;
  attempts: number;
}

export interface DurableJobLease {
  organizationId: string;
  jobId: string;
  workerId: string;
  state: DurableJobState;
  leaseVersion: number;
  leasedAt: number;
  leaseExpiresAt: number;
  maxAttempts: number;
  attempts: number;
  payloadHash: string;
}

export interface PersistenceDecision {
  allowed: boolean;
  reasons: string[];
  retryable: boolean;
  auditHash: string;
}

export class DurablePersistenceContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DurablePersistenceContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new DurablePersistenceContractError(`${label} is required`);
}

export function validateDurableTransaction(request: DurableTransactionRequest): PersistenceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[request.organizationId, "organizationId"], [request.transactionId, "transactionId"], [request.entityType, "entityType"], [request.entityId, "entityId"], [request.idempotencyKey, "idempotencyKey"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!request.rlsTenantSet) reasons.push("transaction must set tenant RLS context");
  if (request.operation === "delete" && !request.approvalPresent) reasons.push("delete transaction requires approval");
  if (request.expectedVersion !== undefined && (!Number.isInteger(request.expectedVersion) || request.expectedVersion < 0)) reasons.push("expected version is invalid");
  if (/password|secret|token|api[_-]?key/i.test(request.idempotencyKey)) reasons.push("idempotency key must not contain a secret");
  return { allowed: reasons.length === 0, reasons, retryable: request.operation !== "delete", auditHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateDurableOutboxEvent(event: DurableOutboxEvent): PersistenceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[event.organizationId, "organizationId"], [event.eventId, "eventId"], [event.aggregateType, "aggregateType"], [event.aggregateId, "aggregateId"], [event.eventType, "eventType"], [event.payloadHash, "payloadHash"], [event.transactionId, "transactionId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (!Number.isInteger(event.sequence) || event.sequence < 0) reasons.push("outbox sequence is invalid");
  if (!Number.isInteger(event.attempts) || event.attempts < 0 || event.attempts > 8) reasons.push("outbox attempts are outside bounds");
  if (event.published && event.attempts === 0) reasons.push("published outbox event needs at least one attempt");
  return { allowed: reasons.length === 0, reasons, retryable: !event.published, auditHash: hash(JSON.stringify({ event, reasons })) };
}

export function decideDurableJobLease(lease: DurableJobLease, now: number, workerId: string): PersistenceDecision {
  const reasons: string[] = [];
  for (const [value, label] of [[lease.organizationId, "organizationId"], [lease.jobId, "jobId"], [lease.workerId, "workerId"], [lease.payloadHash, "payloadHash"], [workerId, "workerId"]] as const) if (!value.trim()) reasons.push(`${label} is required`);
  if (lease.workerId !== workerId) reasons.push("lease worker does not match requester");
  if (!Number.isInteger(lease.leaseVersion) || lease.leaseVersion < 0) reasons.push("lease version is invalid");
  if (!Number.isInteger(lease.attempts) || lease.attempts < 0 || lease.attempts > lease.maxAttempts) reasons.push("job attempts are invalid");
  if (!Number.isInteger(lease.maxAttempts) || lease.maxAttempts < 1 || lease.maxAttempts > 8) reasons.push("max attempts are outside bounds");
  if (!Number.isFinite(now) || lease.leaseExpiresAt <= lease.leasedAt) reasons.push("lease timestamps are invalid");
  if (lease.state === "leased" && lease.leaseExpiresAt <= now) reasons.push("job lease has expired");
  return { allowed: reasons.length === 0, reasons, retryable: lease.state === "queued" || lease.state === "leased", auditHash: hash(JSON.stringify({ lease, now, workerId, reasons })) };
}

export function advanceOutboxSequence(previous: DurableOutboxEvent, next: DurableOutboxEvent): PersistenceDecision {
  const reasons: string[] = [];
  if (previous.organizationId !== next.organizationId || previous.aggregateId !== next.aggregateId) reasons.push("outbox sequence scope cannot change");
  if (next.sequence !== previous.sequence + 1) reasons.push("outbox sequence must advance by one");
  if (next.transactionId === previous.transactionId && next.eventId === previous.eventId) reasons.push("outbox event cannot be duplicated");
  return { allowed: reasons.length === 0, reasons, retryable: true, auditHash: hash(JSON.stringify({ previous, next, reasons })) };
}
