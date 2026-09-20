/** M149 contracts for durable worker queues, retry leases and dead-letter operations. */

export type M149JobStatus = "queued" | "running" | "retry" | "dead";
export type M149Priority = "low" | "normal" | "high" | "critical";

export interface M149JobEnvelope {
  organizationId: string;
  jobId: string;
  queueName: string;
  jobType: string;
  payloadHash: string;
  idempotencyKey: string;
  attempt: number;
  maxAttempts: number;
  priority: M149Priority;
  notBeforeAt: number;
  tenantBound: boolean;
  redacted: boolean;
  status: M149JobStatus;
}

export interface M149QueuePolicy {
  organizationId: string;
  queueName: string;
  maxConcurrency: number;
  maxQueueDepth: number;
  retryableErrors: string[];
  backoffSeconds: number;
  maxAttempts: number;
  dlqEnabled: boolean;
  approvalPresent: boolean;
  tenantScoped: boolean;
}

export interface M149WorkerLease {
  organizationId: string;
  jobId: string;
  leaseId: string;
  workerReference: string;
  issuedAt: number;
  expiresAt: number;
  heartbeatAt: number;
  attempt: number;
  revoked: boolean;
  idempotencyKey: string;
}

export interface M149DlqRecord {
  organizationId: string;
  dlqId: string;
  jobId: string;
  reasonHash: string;
  attempts: number;
  createdAt: number;
  replayAllowed: boolean;
  evidenceHash: string;
  operatorReference?: string;
}

export interface M149QueueDecision {
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

export function validateM149Job(job: M149JobEnvelope, now: number): M149QueueDecision {
  const reasons: string[] = [];
  required([[job.organizationId, "organizationId"], [job.jobId, "jobId"], [job.queueName, "queueName"], [job.jobType, "jobType"], [job.payloadHash, "payloadHash"], [job.idempotencyKey, "idempotencyKey"]], reasons);
  if (!Number.isInteger(job.attempt) || job.attempt < 1 || job.attempt > job.maxAttempts) reasons.push("attempt must be within max attempts");
  if (!Number.isInteger(job.maxAttempts) || job.maxAttempts < 1 || job.maxAttempts > 100) reasons.push("max attempts must be between one and one hundred");
  if (!Number.isFinite(job.notBeforeAt) || job.notBeforeAt < now) reasons.push("notBeforeAt is in the past");
  if (!job.tenantBound || !job.redacted) reasons.push("job must be tenant-bound and redacted");
  if (job.status === "dead" && job.attempt < job.maxAttempts) reasons.push("job cannot be dead before max attempts");
  return { allowed: reasons.length === 0, reasons, requiresApproval: job.status === "dead", auditHash: hash(JSON.stringify({ job, now, reasons })) };
}

export function validateM149Policy(policy: M149QueuePolicy): M149QueueDecision {
  const reasons: string[] = [];
  required([[policy.organizationId, "organizationId"], [policy.queueName, "queueName"]], reasons);
  if (!Number.isInteger(policy.maxConcurrency) || policy.maxConcurrency < 1 || policy.maxConcurrency > 1000) reasons.push("max concurrency is outside bounds");
  if (!Number.isInteger(policy.maxQueueDepth) || policy.maxQueueDepth < 1 || policy.maxQueueDepth > 1_000_000) reasons.push("max queue depth is outside bounds");
  if (!Number.isInteger(policy.backoffSeconds) || policy.backoffSeconds < 1) reasons.push("backoff must be positive");
  if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1 || policy.maxAttempts > 100) reasons.push("policy max attempts is invalid");
  if (!policy.dlqEnabled || !policy.approvalPresent || !policy.tenantScoped) reasons.push("queue needs DLQ, approval and tenant scope");
  return { allowed: reasons.length === 0, reasons, requiresApproval: true, auditHash: hash(JSON.stringify({ policy, reasons })) };
}

export function decideM149Lease(lease: M149WorkerLease, now: number): M149QueueDecision {
  const reasons: string[] = [];
  required([[lease.organizationId, "organizationId"], [lease.jobId, "jobId"], [lease.leaseId, "leaseId"], [lease.workerReference, "workerReference"], [lease.idempotencyKey, "idempotencyKey"]], reasons);
  if (!Number.isInteger(lease.attempt) || lease.attempt < 1) reasons.push("lease attempt must be positive");
  if (!Number.isFinite(lease.issuedAt) || !Number.isFinite(lease.expiresAt) || lease.expiresAt <= lease.issuedAt || lease.expiresAt <= now) reasons.push("lease lifetime is invalid");
  if (!Number.isFinite(lease.heartbeatAt) || lease.heartbeatAt < lease.issuedAt || lease.heartbeatAt > now) reasons.push("heartbeat is invalid");
  if (lease.revoked) reasons.push("lease is revoked");
  return { allowed: reasons.length === 0, reasons, requiresApproval: false, auditHash: hash(JSON.stringify({ lease, now, reasons })) };
}

export function decideM149Dlq(record: M149DlqRecord): M149QueueDecision {
  const reasons: string[] = [];
  required([[record.organizationId, "organizationId"], [record.dlqId, "dlqId"], [record.jobId, "jobId"], [record.reasonHash, "reasonHash"], [record.evidenceHash, "evidenceHash"]], reasons);
  if (!Number.isInteger(record.attempts) || record.attempts < 1) reasons.push("DLQ attempts must be positive");
  if (!Number.isFinite(record.createdAt)) reasons.push("createdAt is invalid");
  if (record.replayAllowed && !record.operatorReference) reasons.push("DLQ replay needs operator reference");
  return { allowed: reasons.length === 0, reasons, requiresApproval: record.replayAllowed, auditHash: hash(JSON.stringify({ record, reasons })) };
}
