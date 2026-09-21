import { getDb } from '../db/index.js';
import {
  DEFAULT_QUEUE_POLICIES,
  type JobStatus,
  type QueueName,
  type QueuePolicy,
} from '@freellmapi/agent/core/job-queue.js';

/**
 * Durable job queue — the scale half of the ForgePilot kernel.
 *
 * The kernel ships `InMemoryJobQueue`, which has the right *semantics*
 * (priority, concurrency caps, leases, exponential backoff, DLQ) but loses
 * every in-flight job when the process exits. This service keeps those
 * semantics and puts them on SQLite, which buys three things the in-memory
 * version cannot offer:
 *
 *   1. Jobs survive a restart.
 *   2. Several workers — threads, processes, or machines sharing the DB file —
 *      can claim from the same queue without double-processing, because the
 *      claim is a conditional UPDATE inside a transaction.
 *   3. A worker that dies mid-job does not strand it. The claim sets a lease;
 *      once it expires any worker may take the job over.
 *
 * Queue policies (concurrency, attempts, backoff, lease length) are imported
 * from the kernel rather than redefined here, so there is exactly one source of
 * truth for them.
 */

export { DEFAULT_QUEUE_POLICIES };
export type { QueueName, JobStatus, QueuePolicy };

export const QUEUE_NAMES = Object.keys(DEFAULT_QUEUE_POLICIES) as QueueName[];

export function isQueueName(value: unknown): value is QueueName {
  return typeof value === 'string' && (QUEUE_NAMES as string[]).includes(value);
}

export interface EnqueueInput {
  queue: QueueName;
  organizationId: string;
  idempotencyKey: string;
  payload: unknown;
  runId?: string;
  priority?: number;
  maxAttempts?: number;
  /** Delay the job until this epoch-ms timestamp. */
  availableAt?: number;
  now?: number;
}

export interface AgentJob {
  jobId: string;
  queue: QueueName;
  organizationId: string;
  runId: string | null;
  idempotencyKey: string;
  payload: unknown;
  payloadHash: string;
  priority: number;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: number;
  createdAt: number;
  workerId: string | null;
  leaseExpiresAt: number | null;
  lastError: string | null;
  completedAt: number | null;
}

interface JobRow {
  job_id: string;
  queue: string;
  organization_id: string;
  run_id: string | null;
  idempotency_key: string;
  payload: string;
  payload_hash: string;
  priority: number;
  status: string;
  attempts: number;
  max_attempts: number;
  available_at: number;
  created_at: number;
  worker_id: string | null;
  lease_expires_at: number | null;
  last_error: string | null;
  completed_at: number | null;
}

export class AgentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentJobError';
  }
}

/** FNV-1a, matching the kernel's payload hashing so dedupe agrees across both. */
function hashPayload(payload: unknown): string {
  const text = JSON.stringify(payload ?? null) ?? 'null';
  let result = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    result = Math.imul(result ^ text.charCodeAt(i), 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
}

function toJob(row: JobRow): AgentJob {
  let payload: unknown = null;
  try {
    payload = JSON.parse(row.payload);
  } catch {
    payload = null;
  }
  return {
    jobId: row.job_id,
    queue: row.queue as QueueName,
    organizationId: row.organization_id,
    runId: row.run_id,
    idempotencyKey: row.idempotency_key,
    payload,
    payloadHash: row.payload_hash,
    priority: row.priority,
    status: row.status as JobStatus,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    availableAt: row.available_at,
    createdAt: row.created_at,
    workerId: row.worker_id,
    leaseExpiresAt: row.lease_expires_at,
    lastError: row.last_error,
    completedAt: row.completed_at,
  };
}

/**
 * Add a job. Re-enqueuing the same (queue, org, idempotencyKey) returns the
 * existing job instead of creating a duplicate — and refuses outright if the
 * payload changed, because that means the key was reused for different work.
 */
export function enqueue(input: EnqueueInput): { job: AgentJob; created: boolean } {
  if (!input.organizationId?.trim()) throw new AgentJobError('organizationId must not be empty');
  if (!input.idempotencyKey?.trim()) throw new AgentJobError('idempotencyKey must not be empty');
  if (!isQueueName(input.queue)) throw new AgentJobError(`unknown queue "${String(input.queue)}"`);

  const policy = DEFAULT_QUEUE_POLICIES[input.queue];
  const maxAttempts = input.maxAttempts ?? policy.maxAttempts;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new AgentJobError('maxAttempts must be a positive integer');
  }
  if (maxAttempts > policy.maxAttempts) {
    throw new AgentJobError(
      `maxAttempts ${maxAttempts} exceeds the "${input.queue}" queue policy (${policy.maxAttempts})`,
    );
  }
  const priority = input.priority ?? 0;
  if (!Number.isInteger(priority) || priority < 0) {
    throw new AgentJobError('priority must be a non-negative integer');
  }

  const now = input.now ?? Date.now();
  const availableAt = input.availableAt ?? now;
  const payloadHash = hashPayload(input.payload);
  const db = getDb();

  const existing = db
    .prepare(
      `SELECT * FROM agent_jobs
       WHERE queue = ? AND organization_id = ? AND idempotency_key = ?`,
    )
    .get(input.queue, input.organizationId, input.idempotencyKey) as JobRow | undefined;

  if (existing) {
    if (existing.payload_hash !== payloadHash) {
      throw new AgentJobError('idempotency key reused with a different payload');
    }
    return { job: toJob(existing), created: false };
  }

  const jobId = `job_${now.toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  db.prepare(
    `INSERT INTO agent_jobs (
       job_id, queue, organization_id, run_id, idempotency_key, payload, payload_hash,
       priority, status, attempts, max_attempts, available_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
  ).run(
    jobId,
    input.queue,
    input.organizationId,
    input.runId ?? null,
    input.idempotencyKey,
    JSON.stringify(input.payload ?? null),
    payloadHash,
    priority,
    availableAt > now ? 'retry_wait' : 'queued',
    maxAttempts,
    availableAt,
    now,
  );

  const row = db.prepare('SELECT * FROM agent_jobs WHERE job_id = ?').get(jobId) as JobRow;
  return { job: toJob(row), created: true };
}

/**
 * Claim up to `limit` jobs for a worker.
 *
 * Runs inside a transaction so two workers racing on the same row cannot both
 * win: the row is re-checked and updated atomically. Before selecting, any
 * lease that has expired is released — that is the crash-recovery path.
 */
export function claim(
  queue: QueueName,
  workerId: string,
  options: { limit?: number; now?: number } = {},
): AgentJob[] {
  if (!workerId.trim()) throw new AgentJobError('workerId must not be empty');
  if (!isQueueName(queue)) throw new AgentJobError(`unknown queue "${String(queue)}"`);
  const limit = options.limit ?? 1;
  if (!Number.isInteger(limit) || limit < 1) throw new AgentJobError('limit must be a positive integer');

  const now = options.now ?? Date.now();
  const policy = DEFAULT_QUEUE_POLICIES[queue];
  const db = getDb();

  return db.transaction(() => {
    reclaimExpiredLeases(now);

    // Delayed jobs whose time has come become claimable.
    db.prepare(
      `UPDATE agent_jobs SET status = 'queued'
       WHERE queue = ? AND status = 'retry_wait' AND available_at <= ?`,
    ).run(queue, now);

    const running = (
      db
        .prepare(`SELECT COUNT(*) AS n FROM agent_jobs WHERE queue = ? AND status = 'running'`)
        .get(queue) as { n: number }
    ).n;

    const capacity = Math.min(limit, policy.concurrency - running);
    if (capacity <= 0) return [];

    const candidates = db
      .prepare(
        `SELECT * FROM agent_jobs
         WHERE queue = ? AND status = 'queued' AND available_at <= ?
         ORDER BY priority DESC, created_at ASC
         LIMIT ?`,
      )
      .all(queue, now, capacity) as JobRow[];

    const claimed: AgentJob[] = [];
    for (const row of candidates) {
      // Conditional update — if another worker took it between SELECT and here,
      // changes === 0 and we skip it rather than double-processing.
      const result = db
        .prepare(
          `UPDATE agent_jobs
           SET status = 'running', worker_id = ?, lease_expires_at = ?, attempts = attempts + 1
           WHERE job_id = ? AND status = 'queued'`,
        )
        .run(workerId, now + policy.leaseMs, row.job_id);
      if (result.changes === 0) continue;

      const fresh = db.prepare('SELECT * FROM agent_jobs WHERE job_id = ?').get(row.job_id) as JobRow;
      claimed.push(toJob(fresh));
    }
    return claimed;
  })();
}

/** Mark a claimed job finished. Only its lease holder may complete it. */
export function complete(jobId: string, workerId: string, now = Date.now()): AgentJob {
  const db = getDb();
  const result = db
    .prepare(
      `UPDATE agent_jobs
       SET status = 'completed', completed_at = ?, worker_id = NULL, lease_expires_at = NULL, last_error = NULL
       WHERE job_id = ? AND status = 'running' AND worker_id = ?`,
    )
    .run(now, jobId, workerId);

  if (result.changes === 0) {
    throw new AgentJobError(
      `job ${jobId} is not currently leased by worker ${workerId} (it may have expired or been completed)`,
    );
  }
  return toJob(db.prepare('SELECT * FROM agent_jobs WHERE job_id = ?').get(jobId) as JobRow);
}

/**
 * Report a failure. Retries with exponential backoff until the attempt budget
 * is spent, then moves the job to the dead-letter state rather than looping
 * forever — the same rule the kernel's repair budget enforces for runs.
 */
export function fail(
  jobId: string,
  workerId: string,
  error: string,
  now = Date.now(),
): AgentJob {
  const db = getDb();

  return db.transaction(() => {
    const row = db.prepare('SELECT * FROM agent_jobs WHERE job_id = ?').get(jobId) as
      | JobRow
      | undefined;
    if (!row) throw new AgentJobError(`job ${jobId} does not exist`);
    if (row.status !== 'running' || row.worker_id !== workerId) {
      throw new AgentJobError(`job ${jobId} is not currently leased by worker ${workerId}`);
    }

    const policy = DEFAULT_QUEUE_POLICIES[row.queue as QueueName];
    const message = error.slice(0, 2000);

    if (row.attempts >= row.max_attempts) {
      db.prepare(
        `UPDATE agent_jobs
         SET status = 'dead_letter', worker_id = NULL, lease_expires_at = NULL, last_error = ?
         WHERE job_id = ?`,
      ).run(message, jobId);
    } else {
      const backoff = Math.min(
        policy.baseBackoffMs * 2 ** (row.attempts - 1),
        policy.maxBackoffMs,
      );
      db.prepare(
        `UPDATE agent_jobs
         SET status = 'retry_wait', worker_id = NULL, lease_expires_at = NULL,
             available_at = ?, last_error = ?
         WHERE job_id = ?`,
      ).run(now + backoff, message, jobId);
    }

    return toJob(db.prepare('SELECT * FROM agent_jobs WHERE job_id = ?').get(jobId) as JobRow);
  })();
}

/** Cancel a job that has not finished yet. */
export function cancel(jobId: string, now = Date.now()): AgentJob {
  const db = getDb();
  const result = db
    .prepare(
      `UPDATE agent_jobs
       SET status = 'cancelled', worker_id = NULL, lease_expires_at = NULL, completed_at = ?
       WHERE job_id = ? AND status IN ('queued', 'retry_wait', 'running')`,
    )
    .run(now, jobId);

  if (result.changes === 0) {
    const exists = db.prepare('SELECT status FROM agent_jobs WHERE job_id = ?').get(jobId) as
      | { status: string }
      | undefined;
    throw new AgentJobError(
      exists
        ? `job ${jobId} is already ${exists.status} and cannot be cancelled`
        : `job ${jobId} does not exist`,
    );
  }
  return toJob(db.prepare('SELECT * FROM agent_jobs WHERE job_id = ?').get(jobId) as JobRow);
}

/**
 * Release leases that outlived their worker. Returns how many were recovered.
 * A job past its attempt budget goes straight to the dead letter queue.
 */
export function reclaimExpiredLeases(now = Date.now()): number {
  const db = getDb();
  const expired = db
    .prepare(
      `SELECT job_id, attempts, max_attempts FROM agent_jobs
       WHERE status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?`,
    )
    .all(now) as { job_id: string; attempts: number; max_attempts: number }[];

  for (const job of expired) {
    const exhausted = job.attempts >= job.max_attempts;
    db.prepare(
      `UPDATE agent_jobs
       SET status = ?, worker_id = NULL, lease_expires_at = NULL, available_at = ?,
           last_error = ?
       WHERE job_id = ?`,
    ).run(
      exhausted ? 'dead_letter' : 'queued',
      now,
      'worker lease expired before the job reported back',
      job.job_id,
    );
  }
  return expired.length;
}

export function getJob(jobId: string): AgentJob | null {
  const row = getDb().prepare('SELECT * FROM agent_jobs WHERE job_id = ?').get(jobId) as
    | JobRow
    | undefined;
  return row ? toJob(row) : null;
}

export interface QueueStats {
  queue: QueueName;
  concurrency: number;
  queued: number;
  running: number;
  retryWait: number;
  completed: number;
  deadLetter: number;
  cancelled: number;
}

export function queueStats(now = Date.now()): QueueStats[] {
  const db = getDb();
  reclaimExpiredLeases(now);

  const counts = db
    .prepare('SELECT queue, status, COUNT(*) AS n FROM agent_jobs GROUP BY queue, status')
    .all() as { queue: string; status: string; n: number }[];

  return QUEUE_NAMES.map((queue) => {
    const pick = (status: JobStatus): number =>
      counts.find((c) => c.queue === queue && c.status === status)?.n ?? 0;
    return {
      queue,
      concurrency: DEFAULT_QUEUE_POLICIES[queue].concurrency,
      queued: pick('queued'),
      running: pick('running'),
      retryWait: pick('retry_wait'),
      completed: pick('completed'),
      deadLetter: pick('dead_letter'),
      cancelled: pick('cancelled'),
    };
  });
}

/** Remove finished jobs older than the cutoff so the table stays bounded. */
export function pruneFinished(olderThanMs: number, now = Date.now()): number {
  return getDb()
    .prepare(
      `DELETE FROM agent_jobs
       WHERE status IN ('completed', 'cancelled') AND completed_at IS NOT NULL AND completed_at <= ?`,
    )
    .run(now - olderThanMs).changes;
}
