import {
  type InMemoryJobQueue,
  type Job,
  type QueueName,
  type JobStatus,
} from "./job-queue.js";

/**
 * Worker-side execution boundary.
 *
 * `InMemoryJobQueue` owns envelopes, leases and state transitions. It never
 * receives a handler. Only this worker boundary is allowed to invoke the
 * injected handler, and the production replacement must keep this same shape
 * around a durable Redis/BullMQ claim.
 */
export interface WorkerExecutionContext<T> {
  readonly job: Job<T>;
  /** Extend the lease only for the worker that owns this job. */
  heartbeat(now?: number): Job<T>;
}

export type WorkerHandler<T> = (
  context: WorkerExecutionContext<T>,
) => Promise<void>;

export interface WorkerPollResult<T> {
  kind: "idle" | "completed" | "retry_scheduled" | "dead_letter";
  job?: Job<T>;
  error?: string;
}

export interface QueueWorkerOptions<T> {
  queue: QueueName;
  workerId: string;
  handler: WorkerHandler<T>;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "worker handler failed";
}

/**
 * One-poll worker. A process supervisor can call `pollOnce` repeatedly and can
 * replace the in-memory queue with a durable adapter without moving handler
 * execution into the Queue Domain.
 */
export class QueueWorker<T = unknown> {
  private stopped = false;

  constructor(
    private readonly queue: InMemoryJobQueue<T>,
    private readonly options: QueueWorkerOptions<T>,
  ) {
    if (!options.workerId.trim()) throw new Error("workerId must not be empty");
  }

  stop(): void {
    this.stopped = true;
  }

  start(): void {
    this.stopped = false;
  }

  async pollOnce(now = Date.now()): Promise<WorkerPollResult<T>> {
    if (this.stopped) return { kind: "idle" };
    const claimed = this.queue.claim(
      this.options.queue,
      this.options.workerId,
      now,
      1,
    );
    if (claimed.length === 0) return { kind: "idle" };

    // The reference worker processes one envelope per poll. A supervisor can
    // run several workers for parallelism; one handler cannot accidentally
    // exceed the queue's per-queue concurrency.
    const job = claimed[0];
    if (!job) return { kind: "idle" };
    const context: WorkerExecutionContext<T> = {
      job,
      heartbeat: (heartbeatNow = Date.now()) =>
        this.queue.renewLease(job.jobId, this.options.workerId, heartbeatNow),
    };

    try {
      await this.options.handler(context);
      return { kind: "completed", job: this.queue.complete(job.jobId, this.options.workerId, now) };
    } catch (error) {
      const failed = this.queue.fail(job.jobId, this.options.workerId, errorMessage(error), now);
      const kind: Extract<WorkerPollResult<T>["kind"], "retry_scheduled" | "dead_letter"> =
        failed.status === "dead_letter" ? "dead_letter" : "retry_scheduled";
      return { kind, job: failed, error: failed.lastError };
    }
  }

  /**
   * Exposed for supervisors that want a status probe without granting handler
   * access to queue internals.
   */
  static isTerminal(status: JobStatus): boolean {
    return status === "completed" || status === "dead_letter" || status === "cancelled";
  }
}
