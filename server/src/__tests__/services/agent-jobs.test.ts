import { describe, it, expect, beforeEach } from 'vitest';
import { initDb } from '../../db/index.js';
import {
  enqueue,
  claim,
  complete,
  fail,
  cancel,
  getJob,
  queueStats,
  reclaimExpiredLeases,
  pruneFinished,
  DEFAULT_QUEUE_POLICIES,
} from '../../services/agent-jobs.js';

/**
 * Durable job queue — the scale layer.
 *
 * The kernel's InMemoryJobQueue already models priority, leases and retries;
 * what these tests pin down is the behaviour that only a persistent queue can
 * offer: two workers cannot take the same job, a crashed worker's job comes
 * back instead of vanishing, and a job that keeps failing eventually stops
 * being retried rather than looping forever.
 */

function add(key: string, overrides: Partial<Parameters<typeof enqueue>[0]> = {}) {
  return enqueue({
    queue: 'run',
    organizationId: 'acme',
    idempotencyKey: key,
    payload: { task: key },
    ...overrides,
  });
}

describe('agent job queue service', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
  });

  it('enqueues a job as queued and claimable', () => {
    const { job, created } = add('a');
    expect(created).toBe(true);
    expect(job.status).toBe('queued');
    expect(job.attempts).toBe(0);
    expect(job.maxAttempts).toBe(DEFAULT_QUEUE_POLICIES.run.maxAttempts);
  });

  it('treats a repeated idempotency key as the same job', () => {
    const first = add('same');
    const second = add('same');

    expect(second.created).toBe(false);
    expect(second.job.jobId).toBe(first.job.jobId);
  });

  it('refuses to reuse an idempotency key for different work', () => {
    add('key');
    expect(() => add('key', { payload: { task: 'something else' } })).toThrow(/different payload/);
  });

  it('scopes idempotency per organization', () => {
    const a = add('shared');
    const b = add('shared', { organizationId: 'globex', payload: { task: 'shared' } });
    expect(b.created).toBe(true);
    expect(b.job.jobId).not.toBe(a.job.jobId);
  });

  it('hands out the highest priority job first', () => {
    add('low', { priority: 1 });
    add('high', { priority: 9 });
    add('mid', { priority: 5 });

    const [first] = claim('run', 'worker-A', { limit: 1 });
    expect(first.payload).toEqual({ task: 'high' });
  });

  it('breaks priority ties by age, oldest first', () => {
    const now = Date.now();
    add('older', { priority: 3, now });
    add('newer', { priority: 3, now: now + 1000 });

    const [first] = claim('run', 'worker-A', { limit: 1 });
    expect(first.payload).toEqual({ task: 'older' });
  });

  it('never exceeds the queue concurrency, however many are requested', () => {
    for (let i = 0; i < 10; i += 1) add(`job-${i}`);

    const claimed = claim('run', 'worker-A', { limit: 10 });
    expect(claimed).toHaveLength(DEFAULT_QUEUE_POLICIES.run.concurrency);
  });

  it('gives a second worker nothing while the queue is saturated', () => {
    for (let i = 0; i < 5; i += 1) add(`job-${i}`);

    claim('run', 'worker-A', { limit: DEFAULT_QUEUE_POLICIES.run.concurrency });
    expect(claim('run', 'worker-B', { limit: 5 })).toEqual([]);
  });

  it('does not hand the same job to two workers', () => {
    add('only-one');

    const a = claim('run', 'worker-A', { limit: 1 });
    const b = claim('run', 'worker-B', { limit: 1 });

    expect(a).toHaveLength(1);
    expect(b.map((j) => j.jobId)).not.toContain(a[0].jobId);
  });

  it('counts an attempt when the job is claimed', () => {
    add('a');
    const [job] = claim('run', 'worker-A', { limit: 1 });
    expect(job.attempts).toBe(1);
    expect(job.workerId).toBe('worker-A');
    expect(job.leaseExpiresAt).not.toBeNull();
  });

  it('only lets the lease holder complete the job', () => {
    add('a');
    const [job] = claim('run', 'worker-A', { limit: 1 });

    expect(() => complete(job.jobId, 'worker-B')).toThrow(/not currently leased/);
    const done = complete(job.jobId, 'worker-A');
    expect(done.status).toBe('completed');
    expect(done.completedAt).not.toBeNull();
  });

  it('retries a failure with backoff before the budget runs out', () => {
    add('flaky');
    const [job] = claim('run', 'worker-A', { limit: 1 });
    const now = Date.now();

    const retried = fail(job.jobId, 'worker-A', 'upstream 502', now);
    expect(retried.status).toBe('retry_wait');
    expect(retried.availableAt).toBeGreaterThan(now);
    expect(retried.lastError).toBe('upstream 502');
    // Released, so it is not occupying a concurrency slot while it waits.
    expect(retried.workerId).toBeNull();
  });

  it('does not hand back a retrying job until its backoff elapses', () => {
    add('flaky');
    const [job] = claim('run', 'worker-A', { limit: 1 });
    const now = Date.now();
    fail(job.jobId, 'worker-A', 'boom', now);

    expect(claim('run', 'worker-A', { now: now + 10 })).toEqual([]);
    const later = claim('run', 'worker-A', { now: now + DEFAULT_QUEUE_POLICIES.run.maxBackoffMs });
    expect(later).toHaveLength(1);
  });

  it('dead-letters a job that exhausts its attempts instead of retrying forever', () => {
    add('doomed');
    let now = Date.now();
    let last: ReturnType<typeof fail> | undefined;

    for (let attempt = 1; attempt <= DEFAULT_QUEUE_POLICIES.run.maxAttempts; attempt += 1) {
      const [job] = claim('run', 'worker-A', { limit: 1, now });
      expect(job).toBeDefined();
      last = fail(job.jobId, 'worker-A', `failure ${attempt}`, now);
      now += DEFAULT_QUEUE_POLICIES.run.maxBackoffMs;
    }

    expect(last!.status).toBe('dead_letter');
    expect(last!.attempts).toBe(DEFAULT_QUEUE_POLICIES.run.maxAttempts);
    // A dead-lettered job must never be handed out again.
    expect(claim('run', 'worker-A', { now: now + 1_000_000 })).toEqual([]);
  });

  it('recovers a job whose worker died mid-flight', () => {
    add('orphan');
    const now = Date.now();
    const [job] = claim('run', 'worker-C', { limit: 1, now });
    expect(job.status).toBe('running');

    // Worker-C never reports back; its lease lapses.
    const afterLease = now + DEFAULT_QUEUE_POLICIES.run.leaseMs + 1;
    expect(reclaimExpiredLeases(afterLease)).toBe(1);

    const [recovered] = claim('run', 'worker-D', { limit: 1, now: afterLease });
    expect(recovered.jobId).toBe(job.jobId);
    expect(recovered.workerId).toBe('worker-D');
  });

  it('keeps a live lease safe from other workers', () => {
    add('busy');
    const now = Date.now();
    claim('run', 'worker-C', { limit: 1, now });

    // Well inside the lease window: nothing to reclaim.
    expect(reclaimExpiredLeases(now + 1000)).toBe(0);
  });

  it('dead-letters an expired lease that has no attempts left', () => {
    add('doomed', { maxAttempts: 1 });
    const now = Date.now();
    const [job] = claim('run', 'worker-C', { limit: 1, now });

    reclaimExpiredLeases(now + DEFAULT_QUEUE_POLICIES.run.leaseMs + 1);
    expect(getJob(job.jobId)!.status).toBe('dead_letter');
  });

  it('cancels an unfinished job and refuses to cancel a finished one', () => {
    add('a');
    const [job] = claim('run', 'worker-A', { limit: 1 });

    expect(cancel(job.jobId).status).toBe('cancelled');
    expect(() => cancel(job.jobId)).toThrow(/already cancelled/);
  });

  it('holds a delayed job until its time comes', () => {
    const now = Date.now();
    add('later', { availableAt: now + 60_000, now });

    expect(claim('run', 'worker-A', { now })).toEqual([]);
    expect(claim('run', 'worker-A', { now: now + 61_000 })).toHaveLength(1);
  });

  it('rejects an attempt budget above the queue policy', () => {
    expect(() => add('a', { maxAttempts: 99 })).toThrow(/exceeds/);
  });

  it('rejects an unknown queue and empty identifiers', () => {
    expect(() => add('a', { queue: 'nope' as never })).toThrow(/unknown queue/);
    expect(() => add('')).toThrow(/idempotencyKey/);
    expect(() => add('a', { organizationId: '  ' })).toThrow(/organizationId/);
  });

  it('reports depth per queue', () => {
    add('a');
    add('b');
    claim('run', 'worker-A', { limit: 1 });

    const run = queueStats().find((q) => q.queue === 'run')!;
    expect(run.queued).toBe(1);
    expect(run.running).toBe(1);
    expect(run.concurrency).toBe(DEFAULT_QUEUE_POLICIES.run.concurrency);
  });

  it('prunes finished jobs but keeps live ones', () => {
    add('done');
    add('pending');
    const now = Date.now();
    const [job] = claim('run', 'worker-A', { limit: 1, now });
    complete(job.jobId, 'worker-A', now);

    expect(pruneFinished(1000, now + 5000)).toBe(1);
    expect(queueStats(now + 5000).find((q) => q.queue === 'run')!.queued).toBe(1);
  });
});
