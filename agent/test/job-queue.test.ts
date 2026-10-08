import { describe, expect, it } from "vitest";
import { InMemoryJobQueue } from "../src/core/job-queue.js";

describe("deterministic worker queue contract", () => {
  it("deduplicates the same tenant payload and rejects changed payloads", () => {
    const queue = new InMemoryJobQueue();
    const first = queue.enqueue({ jobId: "job-1", queue: "run", organizationId: "org-1", idempotencyKey: "run-1", payload: { runId: "r1" } }, 1_000);
    const replay = queue.enqueue({ jobId: "job-other", queue: "run", organizationId: "org-1", idempotencyKey: "run-1", payload: { runId: "r1" } }, 1_001);
    expect(replay.jobId).toBe(first.jobId);
    expect(() => queue.enqueue({ jobId: "job-2", queue: "run", organizationId: "org-1", idempotencyKey: "run-1", payload: { runId: "different" } }, 1_001)).toThrow("different payload");
    const otherTenant = queue.enqueue({ jobId: "job-3", queue: "run", organizationId: "org-2", idempotencyKey: "run-1", payload: { runId: "r1" } }, 1_001);
    expect(otherTenant.jobId).toBe("job-3");
  });

  it("claims by priority and enforces concurrency", () => {
    const queue = new InMemoryJobQueue({ run: { concurrency: 1, maxAttempts: 3, baseBackoffMs: 10, maxBackoffMs: 100, leaseMs: 100 } });
    queue.enqueue({ jobId: "low", queue: "run", organizationId: "org", idempotencyKey: "low-key", payload: {}, priority: 1 }, 1_000);
    queue.enqueue({ jobId: "high", queue: "run", organizationId: "org", idempotencyKey: "high-key", payload: {}, priority: 10 }, 1_000);
    expect(queue.claim("run", "worker-1", 1_000, 2).map((job) => job.jobId)).toEqual(["high"]);
    expect(queue.claim("run", "worker-2", 1_001)).toEqual([]);
  });

  it("retries with backoff and moves exhausted jobs to the DLQ", () => {
    const queue = new InMemoryJobQueue({ tool: { concurrency: 1, maxAttempts: 2, baseBackoffMs: 10, maxBackoffMs: 100, leaseMs: 100 } });
    queue.enqueue({ jobId: "tool-1", queue: "tool", organizationId: "org", idempotencyKey: "tool-key", payload: {} }, 1_000);
    const first = queue.claim("tool", "worker", 1_000)[0];
    if (!first) throw new Error("first claim missing");
    const retry = queue.fail(first.jobId, "worker", "provider timeout", 1_000);
    expect(retry).toMatchObject({ status: "retry_wait", attempts: 1, availableAt: 1_010 });
    expect(queue.claim("tool", "worker", 1_009)).toEqual([]);
    const second = queue.claim("tool", "worker", 1_010)[0];
    if (!second) throw new Error("second claim missing");
    const dead = queue.fail(second.jobId, "worker", "provider timeout again", 1_010);
    expect(dead.status).toBe("dead_letter");
    expect(queue.deadLetters("tool")).toHaveLength(1);
  });

  it("reclaims an expired lease and permits a different worker to retry", () => {
    const queue = new InMemoryJobQueue({ benchmark: { concurrency: 1, maxAttempts: 2, baseBackoffMs: 10, maxBackoffMs: 100, leaseMs: 50 } });
    queue.enqueue({ jobId: "bench-1", queue: "benchmark", organizationId: "org", idempotencyKey: "bench-key", payload: {} }, 1_000);
    expect(queue.claim("benchmark", "worker-a", 1_000)[0]?.leaseExpiresAt).toBe(1_050);
    expect(queue.reclaimExpired(1_050)[0]).toMatchObject({ status: "retry_wait", lastError: "worker lease expired" });
    expect(queue.claim("benchmark", "worker-b", 1_060)).toHaveLength(1);
  });

  it("requires the lease owner and makes running cancellation explicit", () => {
    const queue = new InMemoryJobQueue();
    queue.enqueue({ jobId: "job-1", queue: "run", organizationId: "org", idempotencyKey: "cancel-key", payload: {} }, 1_000);
    queue.claim("run", "worker-a", 1_000);
    expect(() => queue.complete("job-1", "worker-b", 1_001)).toThrow("does not own");
    expect(() => queue.cancel("job-1", 1_001)).toThrow("worker cancellation");
    queue.fail("job-1", "worker-a", "cancelled by worker", 1_001);
    expect(queue.cancel("job-1", 1_002).status).toBe("cancelled");
  });
});
