/**
 * Deterministic job-queue domain contract.
 *
 * This is the reference implementation for the worker boundary, not a claim
 * that Redis/BullMQ is already deployed. A production adapter must make the
 * same operations atomic and durable. No arbitrary job handler runs here;
 * workers claim a signed/validated envelope and execute outside this module.
 */

import { hashRequest } from "./security-baseline.js";

export type QueueName = "run" | "model" | "tool" | "benchmark";
export type JobStatus = "queued" | "running" | "retry_wait" | "completed" | "dead_letter" | "cancelled";

export interface QueuePolicy {
  concurrency: number;
  maxAttempts: number;
  baseBackoffMs: number;
  maxBackoffMs: number;
  leaseMs: number;
}

export const DEFAULT_QUEUE_POLICIES: Readonly<Record<QueueName, QueuePolicy>> = {
  run: { concurrency: 2, maxAttempts: 3, baseBackoffMs: 1_000, maxBackoffMs: 60_000, leaseMs: 5 * 60_000 },
  model: { concurrency: 4, maxAttempts: 4, baseBackoffMs: 500, maxBackoffMs: 30_000, leaseMs: 2 * 60_000 },
  tool: { concurrency: 2, maxAttempts: 3, baseBackoffMs: 1_000, maxBackoffMs: 60_000, leaseMs: 5 * 60_000 },
  benchmark: { concurrency: 1, maxAttempts: 2, baseBackoffMs: 2_000, maxBackoffMs: 120_000, leaseMs: 15 * 60_000 },
};

export interface Job<T = unknown> {
  jobId: string;
  queue: QueueName;
  organizationId: string;
  runId?: string;
  idempotencyKey: string;
  payload: T;
  payloadHash: string;
  priority: number;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: number;
  createdAt: number;
  startedAt?: number;
  leaseExpiresAt?: number;
  completedAt?: number;
  workerId?: string;
  lastError?: string;
}

export interface EnqueueParams<T> {
  jobId: string;
  queue: QueueName;
  organizationId: string;
  runId?: string;
  idempotencyKey: string;
  payload: T;
  priority?: number;
  availableAt?: number;
  maxAttempts?: number;
}

export interface QueueStats {
  queue: QueueName;
  queued: number;
  running: number;
  retryWait: number;
  completed: number;
  deadLetter: number;
  cancelled: number;
}

export class JobQueueContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobQueueContractError";
  }
}

function positiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new JobQueueContractError(`${label} must be a positive integer`);
}

function nonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) throw new JobQueueContractError(`${label} must be a non-negative integer`);
}

function validatePolicy(policy: QueuePolicy): void {
  positiveInteger(policy.concurrency, "concurrency");
  positiveInteger(policy.maxAttempts, "maxAttempts");
  positiveInteger(policy.baseBackoffMs, "baseBackoffMs");
  positiveInteger(policy.maxBackoffMs, "maxBackoffMs");
  positiveInteger(policy.leaseMs, "leaseMs");
  if (policy.maxBackoffMs < policy.baseBackoffMs) throw new JobQueueContractError("maxBackoffMs cannot be below baseBackoffMs");
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function dedupeKey(queue: QueueName, organizationId: string, idempotencyKey: string): string {
  return `${queue}|${organizationId}|${idempotencyKey}`;
}

/**
 * In-memory queue with priority, concurrency, retry, DLQ and worker leases.
 * It is intentionally deterministic when callers provide `now`.
 */
export class InMemoryJobQueue<T = unknown> {
  private readonly jobs = new Map<string, Job<T>>();
  private readonly dedupe = new Map<string, string>();
  private readonly active = new Map<QueueName, number>();
  private readonly policies: Record<QueueName, QueuePolicy>;

  constructor(policies: Partial<Record<QueueName, QueuePolicy>> = {}) {
    this.policies = { ...DEFAULT_QUEUE_POLICIES, ...policies };
    for (const policy of Object.values(this.policies)) validatePolicy(policy);
    for (const queue of Object.keys(DEFAULT_QUEUE_POLICIES) as QueueName[]) this.active.set(queue, 0);
  }

  enqueue(params: EnqueueParams<T>, now = Date.now()): Job<T> {
    if (!params.jobId.trim()) throw new JobQueueContractError("jobId must not be empty");
    if (!params.organizationId.trim()) throw new JobQueueContractError("organizationId must not be empty");
    if (!params.idempotencyKey.trim()) throw new JobQueueContractError("idempotencyKey must not be empty");
    nonNegativeInteger(params.priority ?? 0, "priority");
    const policy = this.policies[params.queue];
    const maxAttempts = params.maxAttempts ?? policy.maxAttempts;
    positiveInteger(maxAttempts, "maxAttempts");
    if (maxAttempts > policy.maxAttempts) throw new JobQueueContractError("job maxAttempts cannot exceed queue policy");
    const payloadHash = hashRequest(params.payload);
    const key = dedupeKey(params.queue, params.organizationId, params.idempotencyKey);
    const existingId = this.dedupe.get(key);
    if (existingId) {
      const existing = this.jobs.get(existingId);
      if (!existing) throw new JobQueueContractError("dedupe index points to a missing job");
      if (existing.payloadHash !== payloadHash) throw new JobQueueContractError("idempotency key reused with a different payload");
      return clone(existing);
    }
    const availableAt = params.availableAt ?? now;
    if (!Number.isFinite(availableAt) || availableAt < 0) throw new JobQueueContractError("availableAt must be a timestamp");
    const job: Job<T> = {
      jobId: params.jobId,
      queue: params.queue,
      organizationId: params.organizationId,
      ...(params.runId ? { runId: params.runId } : {}),
      idempotencyKey: params.idempotencyKey,
      payload: clone(params.payload),
      payloadHash,
      priority: params.priority ?? 0,
      status: availableAt > now ? "retry_wait" : "queued",
      attempts: 0,
      maxAttempts,
      availableAt,
      createdAt: now,
    };
    this.jobs.set(job.jobId, job);
    this.dedupe.set(key, job.jobId);
    return clone(job);
  }

  /** Move due retry jobs back to the claimable state. */
  requeueDue(now = Date.now()): Job<T>[] {
    const moved: Job<T>[] = [];
    for (const job of this.jobs.values()) {
      if (job.status === "retry_wait" && job.availableAt <= now) {
        job.status = "queued";
        job.lastError = undefined;
        moved.push(clone(job));
      }
    }
    return moved;
  }

  /** Claim the highest-priority available jobs without exceeding concurrency. */
  claim(queue: QueueName, workerId: string, now = Date.now(), limit = 1): Job<T>[] {
    if (!workerId.trim()) throw new JobQueueContractError("workerId must not be empty");
    positiveInteger(limit, "limit");
    this.requeueDue(now);
    const policy = this.policies[queue];
    const capacity = Math.min(limit, policy.concurrency - (this.active.get(queue) ?? 0));
    if (capacity <= 0) return [];
    const candidates = [...this.jobs.values()]
      .filter((job) => job.queue === queue && job.status === "queued" && job.availableAt <= now)
      .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt || a.jobId.localeCompare(b.jobId));
    const claimed: Job<T>[] = [];
    for (const job of candidates.slice(0, capacity)) {
      job.status = "running";
      job.attempts += 1;
      job.startedAt = now;
      job.leaseExpiresAt = now + policy.leaseMs;
      job.workerId = workerId;
      this.active.set(queue, (this.active.get(queue) ?? 0) + 1);
      claimed.push(clone(job));
    }
    return claimed;
  }

  /** Extend an owned lease while the worker is still executing the job. */
  renewLease(jobId: string, workerId: string, now = Date.now()): Job<T> {
    const job = this.requireRunning(jobId, workerId);
    job.leaseExpiresAt = now + this.policies[job.queue].leaseMs;
    return clone(job);
  }

  complete(jobId: string, workerId: string, now = Date.now()): Job<T> {
    const job = this.requireRunning(jobId, workerId);
    job.status = "completed";
    job.completedAt = now;
    job.leaseExpiresAt = undefined;
    this.release(job);
    return clone(job);
  }

  fail(jobId: string, workerId: string, error: string, now = Date.now()): Job<T> {
    const job = this.requireRunning(jobId, workerId);
    if (!error.trim()) throw new JobQueueContractError("error must not be empty");
    const policy = this.policies[job.queue];
    job.lastError = error.slice(0, 2_000);
    this.release(job);
    if (job.attempts < job.maxAttempts) {
      const delay = Math.min(policy.maxBackoffMs, policy.baseBackoffMs * 2 ** Math.max(0, job.attempts - 1));
      job.status = "retry_wait";
      job.availableAt = now + delay;
      job.workerId = undefined;
      job.leaseExpiresAt = undefined;
    } else {
      job.status = "dead_letter";
      job.completedAt = now;
      job.workerId = undefined;
      job.leaseExpiresAt = undefined;
    }
    return clone(job);
  }

  /** Reclaim jobs whose worker disappeared; the job becomes retryable or DLQ. */
  reclaimExpired(now = Date.now()): Job<T>[] {
    const reclaimed: Job<T>[] = [];
    for (const job of this.jobs.values()) {
      if (job.status !== "running" || job.leaseExpiresAt === undefined || job.leaseExpiresAt > now) continue;
      const workerId = job.workerId;
      if (!workerId) continue;
      reclaimed.push(this.fail(job.jobId, workerId, "worker lease expired", now));
    }
    return reclaimed;
  }

  cancel(jobId: string, now = Date.now()): Job<T> {
    const job = this.require(jobId);
    if (job.status === "running") throw new JobQueueContractError("running jobs require worker cancellation and compensation");
    if (job.status === "completed" || job.status === "dead_letter") return clone(job);
    job.status = "cancelled";
    job.completedAt = now;
    return clone(job);
  }

  get(jobId: string): Job<T> | undefined {
    const job = this.jobs.get(jobId);
    return job ? clone(job) : undefined;
  }

  deadLetters(queue?: QueueName): Job<T>[] {
    return [...this.jobs.values()]
      .filter((job) => job.status === "dead_letter" && (queue === undefined || job.queue === queue))
      .map(clone);
  }

  stats(queue: QueueName): QueueStats {
    const jobs = [...this.jobs.values()].filter((job) => job.queue === queue);
    return {
      queue,
      queued: jobs.filter((job) => job.status === "queued").length,
      running: jobs.filter((job) => job.status === "running").length,
      retryWait: jobs.filter((job) => job.status === "retry_wait").length,
      completed: jobs.filter((job) => job.status === "completed").length,
      deadLetter: jobs.filter((job) => job.status === "dead_letter").length,
      cancelled: jobs.filter((job) => job.status === "cancelled").length,
    };
  }

  private require(jobId: string): Job<T> {
    const job = this.jobs.get(jobId);
    if (!job) throw new JobQueueContractError(`unknown job: ${jobId}`);
    return job;
  }

  private requireRunning(jobId: string, workerId: string): Job<T> {
    const job = this.require(jobId);
    if (job.status !== "running") throw new JobQueueContractError("job is not running");
    if (job.workerId !== workerId) throw new JobQueueContractError("worker does not own the job lease");
    return job;
  }

  private release(job: Job<T>): void {
    this.active.set(job.queue, Math.max(0, (this.active.get(job.queue) ?? 0) - 1));
  }
}
