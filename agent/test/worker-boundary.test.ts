import { describe, expect, it } from "vitest";

import { InMemoryJobQueue } from "../src/core/job-queue.js";
import { QueueWorker } from "../src/core/worker-boundary.js";

function queue() {
  return new InMemoryJobQueue<{ value: number }>({
    run: { concurrency: 1, maxAttempts: 2, baseBackoffMs: 10, maxBackoffMs: 100, leaseMs: 50 },
  });
}

describe("worker execution boundary", () => {
  it("executes a claimed envelope only in the worker and completes it", async () => {
    const jobs = queue();
    jobs.enqueue({ jobId: "job-1", queue: "run", organizationId: "org-a", idempotencyKey: "one", payload: { value: 1 } }, 100);
    const seen: number[] = [];
    const worker = new QueueWorker(jobs, {
      queue: "run",
      workerId: "worker-a",
      handler: async ({ job }) => { seen.push(job.payload.value); },
    });

    const result = await worker.pollOnce(100);
    expect(result.kind).toBe("completed");
    expect(seen).toEqual([1]);
    expect(result.job?.status).toBe("completed");
  });

  it("schedules a retry after a handler failure without hiding the error", async () => {
    const jobs = queue();
    jobs.enqueue({ jobId: "job-2", queue: "run", organizationId: "org-a", idempotencyKey: "two", payload: { value: 2 } }, 100);
    const worker = new QueueWorker(jobs, {
      queue: "run",
      workerId: "worker-a",
      handler: async () => { throw new Error("provider timeout"); },
    });

    const result = await worker.pollOnce(100);
    expect(result.kind).toBe("retry_scheduled");
    expect(result.job?.status).toBe("retry_wait");
    expect(result.error).toBe("provider timeout");
  });

  it("moves the job to the DLQ after the retry ceiling", async () => {
    const jobs = queue();
    jobs.enqueue({ jobId: "job-3", queue: "run", organizationId: "org-a", idempotencyKey: "three", payload: { value: 3 } }, 100);
    const worker = new QueueWorker(jobs, {
      queue: "run",
      workerId: "worker-a",
      handler: async () => { throw new Error("permanent failure"); },
    });

    await worker.pollOnce(100);
    const result = await worker.pollOnce(110);
    expect(result.kind).toBe("dead_letter");
    expect(jobs.deadLetters("run")).toHaveLength(1);
  });

  it("allows only the owning worker to heartbeat the lease", async () => {
    const jobs = queue();
    jobs.enqueue({ jobId: "job-4", queue: "run", organizationId: "org-a", idempotencyKey: "four", payload: { value: 4 } }, 100);
    let heartbeatAt = 0;
    const worker = new QueueWorker(jobs, {
      queue: "run",
      workerId: "worker-a",
      handler: async ({ job, heartbeat }) => {
        heartbeatAt = heartbeat(140).leaseExpiresAt ?? 0;
        expect(() => jobs.renewLease(job.jobId, "worker-b", 150)).toThrow("worker does not own");
      },
    });
    const result = await worker.pollOnce(100);
    expect(result.kind).toBe("completed");
    expect(heartbeatAt).toBe(190);
  });

  it("does not claim work after the supervisor stops the worker", async () => {
    const jobs = queue();
    jobs.enqueue({ jobId: "job-5", queue: "run", organizationId: "org-a", idempotencyKey: "five", payload: { value: 5 } }, 100);
    const worker = new QueueWorker(jobs, { queue: "run", workerId: "worker-a", handler: async () => {} });
    worker.stop();
    expect((await worker.pollOnce(100)).kind).toBe("idle");
    expect(jobs.get("job-5")?.status).toBe("queued");
    worker.start();
    expect((await worker.pollOnce(100)).kind).toBe("completed");
  });
});
