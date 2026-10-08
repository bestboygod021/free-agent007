import crypto from 'crypto';
import { timingSafeStringEqual } from '../lib/system-prompt.js';

/**
 * Worker identity for the job queue.
 *
 * The queue has two kinds of caller and they need different authorisation:
 *
 *   - **Tenant callers** enqueue, inspect and cancel jobs belonging to their
 *     own organisation. They authenticate with a dashboard session and are
 *     checked by `authorizeRecord` in the route layer.
 *   - **Workers** lease jobs across organisations, run them, and report the
 *     outcome. A worker legitimately sees every tenant's payload, because it
 *     is the thing doing the work. That is exactly why it cannot be *any*
 *     authenticated user.
 *
 * Before this existed, `POST /jobs/claim` asked for a `workerId` in the body
 * and believed it. Any dashboard session could claim another organisation's
 * job, read its payload out of the claim response, and then call `/fail`
 * repeatedly to burn the attempt budget until the job dead-lettered. The
 * per-job lease check on `complete`/`fail` did not help: it verifies that the
 * caller is the *lease holder*, and the attacker had made itself the lease
 * holder one call earlier.
 *
 * The identity therefore comes from a shared secret in server configuration,
 * not from the session and not from the body — the same rule the rest of the
 * agent applies to authority-bearing fields (see `agent-policy-context.ts`:
 * "a control that the subject of the control can edit is not a control").
 *
 * Fail-closed: with no token configured, the claim surface is disabled rather
 * than open. An operator who has not thought about workers gets a queue that
 * nothing can drain, which is visible and safe; the alternative is a queue
 * anyone can drain, which is invisible and not.
 */

export const WORKER_TOKEN_ENV = 'AGENT_WORKER_TOKENS';

/** Minimum entropy we will accept. Short tokens are guessable online. */
export const MIN_WORKER_TOKEN_LENGTH = 24;

export interface WorkerIdentity {
  /** Stable name for this worker, used for leases and audit. */
  workerId: string;
}

export type WorkerAuthResult =
  | { ok: true; worker: WorkerIdentity }
  | { ok: false; reason: 'not_configured' | 'missing' | 'invalid' };

interface ConfiguredWorker {
  workerId: string;
  token: string;
}

/**
 * Parse `AGENT_WORKER_TOKENS`.
 *
 * Format: `workerId:token` pairs separated by commas, e.g.
 *   AGENT_WORKER_TOKENS=runner-a:s3cret...,runner-b:0th3r...
 *
 * The workerId is part of the configuration rather than the request so a
 * compromised worker cannot impersonate another worker's lease by renaming
 * itself, and so the audit trail records an identity the operator chose.
 *
 * Malformed or under-length entries are dropped rather than throwing: one
 * fat-fingered entry should not take the whole queue offline, and the entry
 * that was dropped simply cannot authenticate.
 */
function configuredWorkers(): ConfiguredWorker[] {
  const raw = process.env[WORKER_TOKEN_ENV]?.trim();
  if (!raw) return [];

  const seen = new Set<string>();
  const workers: ConfiguredWorker[] = [];
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (trimmed === '') continue;
    // Split on the FIRST colon only: tokens may contain colons.
    const idx = trimmed.indexOf(':');
    if (idx <= 0) continue;
    const workerId = trimmed.slice(0, idx).trim();
    const token = trimmed.slice(idx + 1).trim();
    if (workerId === '' || token.length < MIN_WORKER_TOKEN_LENGTH) continue;
    if (seen.has(workerId)) continue;
    seen.add(workerId);
    workers.push({ workerId, token });
  }
  return workers;
}

/** True when at least one usable worker credential is configured. */
export function workerAuthConfigured(): boolean {
  return configuredWorkers().length > 0;
}

/**
 * Resolve a bearer token to a worker identity.
 *
 * Every configured token is compared, with no early exit, so the time taken
 * does not reveal how many workers are configured or which prefix matched.
 * `timingSafeStringEqual` HMACs both sides to a fixed length first, so the
 * comparison is also independent of token length.
 */
export function authenticateWorker(presented: string | undefined): WorkerAuthResult {
  const workers = configuredWorkers();
  if (workers.length === 0) return { ok: false, reason: 'not_configured' };

  const token = presented?.trim();
  if (!token) return { ok: false, reason: 'missing' };

  let matched: ConfiguredWorker | null = null;
  for (const worker of workers) {
    if (timingSafeStringEqual(token, worker.token) && matched === null) {
      matched = worker;
    }
  }
  if (matched === null) return { ok: false, reason: 'invalid' };
  return { ok: true, worker: { workerId: matched.workerId } };
}

/** Generate a credential of acceptable strength, for docs and setup tooling. */
export function mintWorkerToken(): string {
  return crypto.randomBytes(24).toString('hex');
}
