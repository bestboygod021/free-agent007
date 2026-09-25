import { createHash } from 'node:crypto';
import { getDb } from '../db/index.js';
import {
  RUN_STATES,
  TERMINAL_STATES,
  initialContext,
  transition,
  type RunContext,
  type RunEvent,
} from '@freellmapi/agent/core/state-machine.js';
import type { RunState } from '@freellmapi/agent/core/types.js';
import { resolveMode, isComputeMode, type ComputeMode } from '@freellmapi/agent/core/compute-mode.js';
import { CHECKPOINT_GENESIS } from '@freellmapi/agent/core/checkpoint-store.js';

/**
 * The agent execution loop.
 *
 * The kernel had every rule an agent needs — a 19-state machine with six
 * invariants, a repair budget, approval gates, compute-mode ceilings — and
 * nothing that drove them. A "run" was a `transition()` call you made by hand;
 * there was no object to inspect, resume, or stop.
 *
 * This is the missing driver. It owns four things the kernel deliberately does
 * not:
 *
 *   1. **Identity.** A run is a row with a state, a budget and a history.
 *   2. **Durability.** Every accepted step is checkpointed before it is
 *      acknowledged, so a crash resumes from the last committed step.
 *   3. **Budgets.** Steps, tokens, cost and wall-clock are counted and enforced
 *      per run, using ceilings copied from the compute mode at creation.
 *   4. **Control.** Pause, resume, cancel — and blocking on human approval.
 *
 * What it deliberately does NOT do: call a model. The loop advances a run when
 * something reports an outcome (`step`). That keeps every decision in the
 * kernel, where it is tested, and leaves model execution to the gateway. An
 * autonomous driver can sit on top of this without changing any of it.
 */

export class AgentRunError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'AgentRunError';
    this.status = status;
  }
}

/** States where the run is parked waiting for a person, not for work. */
const APPROVAL_STATES: Partial<Record<RunState, 'plan' | 'deploy'>> = {
  AWAITING_PLAN_APPROVAL: 'plan',
  AWAITING_DEPLOY_APPROVAL: 'deploy',
};

export interface CreateRunInput {
  organizationId: string;
  projectId: string;
  goal: string;
  mode: ComputeMode;
  privacyLevel?: string;
  /** Hard ceilings. Each is clamped to what the compute mode allows. */
  maxSteps?: number;
  maxTokens?: number;
  maxCost?: number;
  /** Wall-clock budget in milliseconds. */
  timeoutMs?: number;
  now?: number;
}

export interface StepInput {
  runId: string;
  event: RunEvent;
  /** Free-form detail recorded in the checkpoint (tool output, model summary). */
  payload?: unknown;
  tokensUsed?: number;
  costUsed?: number;
  now?: number;
}

export interface AgentRun {
  runId: string;
  organizationId: string;
  projectId: string;
  goal: string;
  mode: ComputeMode;
  privacyLevel: string;
  state: RunState;
  context: RunContext;
  budget: {
    maxSteps: number;
    maxTokens: number;
    maxCost: number;
    deadlineAt: number | null;
    stepsUsed: number;
    tokensUsed: number;
    costUsed: number;
  };
  stopReason: string | null;
  /** 'plan' | 'deploy' when parked on a human, else null. */
  awaiting: string | null;
  terminal: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Checkpoint {
  checkpointId: string;
  runId: string;
  sequence: number;
  state: RunState;
  event: RunEvent | null;
  payload: unknown;
  previousHash: string;
  hash: string;
  createdAt: number;
}

export interface StepResult {
  ok: boolean;
  run: AgentRun;
  /** Why the step was refused — the kernel's own words. */
  reason?: string;
  checkpoint?: Checkpoint;
}

interface RunRow {
  run_id: string;
  organization_id: string;
  project_id: string;
  goal: string;
  mode: string;
  privacy_level: string;
  state: string;
  context: string;
  max_steps: number;
  max_tokens: number;
  max_cost: number;
  deadline_at: number | null;
  steps_used: number;
  tokens_used: number;
  cost_used: number;
  stop_reason: string | null;
  awaiting: string | null;
  created_at: number;
  updated_at: number;
}

interface CheckpointRow {
  checkpoint_id: string;
  run_id: string;
  sequence: number;
  state: string;
  event: string | null;
  payload: string;
  previous_hash: string;
  hash: string;
  created_at: number;
}

const MAX_GOAL_CHARS = 4 * 1024;
const MAX_PAYLOAD_CHARS = 64 * 1024;
/** A run that has taken this many steps is looping, whatever its mode says. */
const ABSOLUTE_MAX_STEPS = 10_000;

function parseContext(raw: string): RunContext {
  const parsed = JSON.parse(raw) as RunContext;
  return parsed;
}

function toRun(row: RunRow): AgentRun {
  const state = row.state as RunState;
  return {
    runId: row.run_id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    goal: row.goal,
    mode: row.mode as ComputeMode,
    privacyLevel: row.privacy_level,
    state,
    context: parseContext(row.context),
    budget: {
      maxSteps: row.max_steps,
      maxTokens: row.max_tokens,
      maxCost: row.max_cost,
      deadlineAt: row.deadline_at,
      stepsUsed: row.steps_used,
      tokensUsed: row.tokens_used,
      costUsed: row.cost_used,
    },
    stopReason: row.stop_reason,
    awaiting: row.awaiting,
    terminal: TERMINAL_STATES.has(state),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toCheckpoint(row: CheckpointRow): Checkpoint {
  let payload: unknown = null;
  try {
    payload = JSON.parse(row.payload);
  } catch {
    payload = null;
  }
  return {
    checkpointId: row.checkpoint_id,
    runId: row.run_id,
    sequence: row.sequence,
    state: row.state as RunState,
    event: row.event as RunEvent | null,
    payload,
    previousHash: row.previous_hash,
    hash: row.hash,
    createdAt: row.created_at,
  };
}

/** Same canonical form and digest the kernel's checkpoint store uses. */
function checkpointHash(input: {
  checkpointId: string;
  runId: string;
  sequence: number;
  state: string;
  payload: unknown;
  createdAt: number;
  previousHash: string;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        checkpointId: input.checkpointId,
        runId: input.runId,
        sequence: input.sequence,
        state: input.state,
        payload: input.payload,
        createdAt: input.createdAt,
        previousHash: input.previousHash,
      }),
    )
    .digest('hex');
}

function appendCheckpoint(
  runId: string,
  sequence: number,
  state: RunState,
  event: RunEvent | null,
  payload: unknown,
  now: number,
): Checkpoint {
  const db = getDb();
  const previous = db
    .prepare('SELECT hash FROM agent_checkpoints WHERE run_id = ? ORDER BY sequence DESC LIMIT 1')
    .get(runId) as { hash: string } | undefined;

  const checkpointId = `ckpt_${runId}_${sequence}`;
  const previousHash = previous?.hash ?? CHECKPOINT_GENESIS;
  const hash = checkpointHash({
    checkpointId,
    runId,
    sequence,
    state,
    payload,
    createdAt: now,
    previousHash,
  });

  db.prepare(
    `INSERT INTO agent_checkpoints (
       checkpoint_id, run_id, sequence, state, event, payload, previous_hash, hash, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    checkpointId,
    runId,
    sequence,
    state,
    event,
    JSON.stringify(payload ?? null),
    previousHash,
    hash,
    now,
  );

  return {
    checkpointId,
    runId,
    sequence,
    state,
    event,
    payload: payload ?? null,
    previousHash,
    hash,
    createdAt: now,
  };
}

function loadRow(runId: string): RunRow {
  const row = getDb().prepare('SELECT * FROM agent_runs WHERE run_id = ?').get(runId) as
    | RunRow
    | undefined;
  if (!row) throw new AgentRunError(`no such run: ${runId}`, 404);
  return row;
}

/**
 * Start a run.
 *
 * Budget ceilings are resolved from the compute mode and copied onto the row.
 * Copying rather than referencing is deliberate: editing a mode profile later
 * must not retroactively widen the budget of a run already in flight.
 */
export function createRun(input: CreateRunInput): AgentRun {
  if (!input.organizationId?.trim()) throw new AgentRunError('organizationId must not be empty');
  if (!input.projectId?.trim()) throw new AgentRunError('projectId must not be empty');
  if (!input.goal?.trim()) throw new AgentRunError('goal must not be empty');
  if (input.goal.length > MAX_GOAL_CHARS) {
    throw new AgentRunError(`goal must be at most ${MAX_GOAL_CHARS} characters`);
  }
  if (!isComputeMode(input.mode)) throw new AgentRunError(`unknown compute mode "${String(input.mode)}"`);

  const profile = resolveMode(input.mode);
  const now = input.now ?? Date.now();

  // Every ceiling is min(requested, allowed) — a caller can ask for less than
  // the mode permits but never for more.
  const maxSteps = Math.min(input.maxSteps ?? 100, ABSOLUTE_MAX_STEPS);
  if (!Number.isInteger(maxSteps) || maxSteps < 1) {
    throw new AgentRunError('maxSteps must be a positive integer');
  }
  // A floor as well as a ceiling. `exhaustedBudget` treats a non-positive
  // ceiling as "no ceiling" (`row.max_tokens > 0 && ...`), which is right for
  // a mode that genuinely has no token budget but catastrophic as a value a
  // caller can send: `maxTokens: -5` asked for *less* and got unlimited. A
  // run created that way never stopped, while the default stopped after two
  // steps. Asking for less than the mode allows is legitimate; asking for
  // zero or less is not a budget.
  if (input.maxTokens !== undefined && (!Number.isFinite(input.maxTokens) || input.maxTokens < 1)) {
    throw new AgentRunError('maxTokens must be a positive number');
  }
  if (input.maxCost !== undefined && (!Number.isFinite(input.maxCost) || input.maxCost < 0)) {
    throw new AgentRunError('maxCost must be a non-negative number');
  }
  const maxTokens = Math.min(input.maxTokens ?? profile.budget.perRunTokens, profile.budget.hardStopTokens);
  const maxCost = Math.min(input.maxCost ?? profile.budget.maxCostPerRun, profile.budget.maxCostPerRun);
  if (input.timeoutMs !== undefined && (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 1)) {
    throw new AgentRunError('timeoutMs must be a positive integer');
  }
  const deadlineAt = input.timeoutMs === undefined ? null : now + input.timeoutMs;

  // The repair budget comes from the mode, so "free" really does get fewer
  // repair attempts than "paid" without the caller having to know that.
  const context = initialContext(profile.execution.maxRepairAttempts);
  const runId = `run_${now.toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  const db = getDb();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO agent_runs (
         run_id, organization_id, project_id, goal, mode, privacy_level, state, context,
         max_steps, max_tokens, max_cost, deadline_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'INTAKE', ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      runId,
      input.organizationId,
      input.projectId,
      input.goal,
      input.mode,
      input.privacyLevel ?? 'internal',
      JSON.stringify(context),
      maxSteps,
      maxTokens,
      maxCost,
      deadlineAt,
      now,
      now,
    );
    // Sequence 0 records the run's birth, so the chain covers its whole life.
    appendCheckpoint(runId, 0, 'INTAKE', null, { goal: input.goal, mode: input.mode }, now);
  })();

  return toRun(loadRow(runId));
}

/**
 * Which budget, if any, this run has exhausted.
 *
 * Checked before every step. Returning the reason rather than a boolean means
 * the stop reason that lands in the database is the one a human reads.
 */
function exhaustedBudget(row: RunRow, now: number): string | null {
  if (row.steps_used >= row.max_steps) {
    return `step budget exhausted (${row.steps_used}/${row.max_steps})`;
  }
  if (row.max_tokens > 0 && row.tokens_used >= row.max_tokens) {
    return `token budget exhausted (${row.tokens_used}/${row.max_tokens})`;
  }
  if (row.max_cost > 0 && row.cost_used >= row.max_cost) {
    return `cost budget exhausted (${row.cost_used}/${row.max_cost})`;
  }
  if (row.deadline_at !== null && now >= row.deadline_at) {
    return `time budget exhausted (deadline passed)`;
  }
  return null;
}

/**
 * Advance a run by one event.
 *
 * Order matters and is the whole point:
 *
 *   1. terminal runs accept nothing (invariant I6)
 *   2. budgets are checked *before* the work counts, and exhausting one FAILS
 *      the run rather than letting it drift past its ceiling
 *   3. the kernel decides whether the transition is legal — this function
 *      never second-guesses it
 *   4. the checkpoint is written in the same transaction as the state change,
 *      so a crash can never leave a state with no history or vice versa
 */
export function step(input: StepInput): StepResult {
  const now = input.now ?? Date.now();
  const tokens = input.tokensUsed ?? 0;
  const cost = input.costUsed ?? 0;
  if (!Number.isFinite(tokens) || tokens < 0) throw new AgentRunError('tokensUsed must be >= 0');
  if (!Number.isFinite(cost) || cost < 0) throw new AgentRunError('costUsed must be >= 0');
  if (input.payload !== undefined && JSON.stringify(input.payload ?? null).length > MAX_PAYLOAD_CHARS) {
    throw new AgentRunError(`payload must serialise to at most ${MAX_PAYLOAD_CHARS} characters`);
  }

  const db = getDb();
  return db.transaction(() => {
    const row = loadRow(input.runId);
    const state = row.state as RunState;

    if (TERMINAL_STATES.has(state)) {
      return {
        ok: false,
        run: toRun(row),
        reason: `run is in terminal state ${state}; no further events accepted (invariant I6)`,
      };
    }

    // A run that has run out of budget is failed, not merely refused. Leaving
    // it open would let a caller keep poking at it forever.
    const exhausted = exhaustedBudget(row, now);
    if (exhausted) {
      return { ...stopRun(row, 'FAILED', exhausted, now), ok: false, reason: exhausted };
    }

    const context = parseContext(row.context);
    // `transition` mutates the context it is given (repair counter, approval
    // flags); that is its contract, and we persist whatever it produces.
    const result = transition(state, input.event, context);

    if (!result.ok) {
      // A refusal is not a failure: the run stays where it is, and the reason
      // is the kernel's own. Nothing is checkpointed, because nothing happened.
      return { ok: false, run: toRun(row), reason: result.reason };
    }

    const sequence = row.steps_used + 1;
    const checkpoint = appendCheckpoint(
      input.runId,
      sequence,
      result.to,
      input.event,
      input.payload ?? null,
      now,
    );

    const awaiting = APPROVAL_STATES[result.to] ?? null;
    // Reaching a terminal state through the state machine is a legitimate end,
    // so record why rather than leaving stop_reason null.
    const stopReason = TERMINAL_STATES.has(result.to)
      ? result.to === 'DONE'
        ? 'completed'
        : `ended in ${result.to}`
      : null;

    db.prepare(
      `UPDATE agent_runs
       SET state = ?, context = ?, steps_used = ?, tokens_used = tokens_used + ?,
           cost_used = cost_used + ?, awaiting = ?, stop_reason = ?, updated_at = ?
       WHERE run_id = ?`,
    ).run(
      result.to,
      JSON.stringify(context),
      sequence,
      tokens,
      cost,
      awaiting,
      stopReason,
      now,
      input.runId,
    );

    return { ok: true, run: toRun(loadRow(input.runId)), checkpoint };
  })();
}

/** Force a run into a terminal state, recording why. */
function stopRun(row: RunRow, to: RunState, reason: string, now: number): StepResult {
  const db = getDb();
  const sequence = row.steps_used + 1;
  const checkpoint = appendCheckpoint(row.run_id, sequence, to, null, { reason }, now);
  db.prepare(
    `UPDATE agent_runs
     SET state = ?, steps_used = ?, stop_reason = ?, awaiting = NULL, updated_at = ?
     WHERE run_id = ?`,
  ).run(to, sequence, reason, now, row.run_id);
  return { ok: true, run: toRun(loadRow(row.run_id)), checkpoint };
}

/** Cancel a run. Safe to call on an already-cancelled run's behalf? No — explicit. */
export function cancelRun(runId: string, reason = 'cancelled by operator', now = Date.now()): AgentRun {
  const db = getDb();
  return db.transaction(() => {
    const row = loadRow(runId);
    if (TERMINAL_STATES.has(row.state as RunState)) {
      throw new AgentRunError(`run is already ${row.state} and cannot be cancelled`);
    }
    return stopRun(row, 'CANCELLED', reason, now).run;
  })();
}

/**
 * Approve or reject whatever the run is parked on.
 *
 * This exists so a caller does not have to know that plan approval is the
 * event `plan_approved` while deploy approval is `deploy_approved` — it asks
 * the run what it is waiting for.
 */
export function decide(
  runId: string,
  approved: boolean,
  now = Date.now(),
): StepResult {
  const row = loadRow(runId);
  const gate = APPROVAL_STATES[row.state as RunState];
  if (!gate) {
    throw new AgentRunError(`run is in ${row.state} and is not awaiting a decision`);
  }
  const event: RunEvent =
    gate === 'plan'
      ? approved
        ? 'plan_approved'
        : 'plan_rejected'
      : approved
        ? 'deploy_approved'
        : 'deploy_rejected';
  return step({ runId, event, payload: { decision: approved ? 'approved' : 'rejected' }, now });
}

export function getRun(runId: string): AgentRun | null {
  const row = getDb().prepare('SELECT * FROM agent_runs WHERE run_id = ?').get(runId) as
    | RunRow
    | undefined;
  return row ? toRun(row) : null;
}

export function listRuns(
  organizationId: string,
  projectId: string,
  options: { limit?: number; state?: RunState } = {},
): AgentRun[] {
  const limit = Math.min(options.limit ?? 50, 200);
  const params: unknown[] = [organizationId, projectId];
  let sql = `SELECT * FROM agent_runs WHERE organization_id = ? AND project_id = ?`;
  if (options.state) {
    sql += ' AND state = ?';
    params.push(options.state);
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  return (getDb().prepare(sql).all(...params) as RunRow[]).map(toRun);
}

export function getCheckpoints(runId: string, limit = 500): Checkpoint[] {
  return (
    getDb()
      .prepare('SELECT * FROM agent_checkpoints WHERE run_id = ? ORDER BY sequence ASC LIMIT ?')
      .all(runId, Math.min(limit, 2000)) as CheckpointRow[]
  ).map(toCheckpoint);
}

export interface ChainVerification {
  valid: boolean;
  length: number;
  /** Sequence number of the first checkpoint that does not verify. */
  brokenAt: number | null;
  reason: string | null;
}

/**
 * Re-derive every hash in a run's history and confirm the chain links.
 *
 * This is what makes the audit trail worth having: a row edited in place
 * changes its own hash, which breaks every link after it. Tampering cannot be
 * quiet.
 */
export function verifyChain(runId: string): ChainVerification {
  const rows = getCheckpoints(runId, 2000);
  let previousHash = CHECKPOINT_GENESIS;

  for (const [index, cp] of rows.entries()) {
    if (cp.sequence !== index) {
      return {
        valid: false,
        length: rows.length,
        brokenAt: cp.sequence,
        reason: `sequence gap: expected ${index}, found ${cp.sequence}`,
      };
    }
    if (cp.previousHash !== previousHash) {
      return {
        valid: false,
        length: rows.length,
        brokenAt: cp.sequence,
        reason: 'previousHash does not match the preceding checkpoint',
      };
    }
    const expected = checkpointHash({
      checkpointId: cp.checkpointId,
      runId: cp.runId,
      sequence: cp.sequence,
      state: cp.state,
      payload: cp.payload,
      createdAt: cp.createdAt,
      previousHash: cp.previousHash,
    });
    if (expected !== cp.hash) {
      return {
        valid: false,
        length: rows.length,
        brokenAt: cp.sequence,
        reason: 'checkpoint contents do not match its hash',
      };
    }
    previousHash = cp.hash;
  }

  return { valid: true, length: rows.length, brokenAt: null, reason: null };
}

/**
 * Runs that were mid-flight when the process died.
 *
 * Because state and checkpoint are written in one transaction, every run here
 * is already consistent — resuming is just continuing to send it events. This
 * function exists so an operator can find them.
 */
export function resumableRuns(limit = 100): AgentRun[] {
  const placeholders = RUN_STATES.filter((s) => !TERMINAL_STATES.has(s))
    .map(() => '?')
    .join(',');
  const params = RUN_STATES.filter((s) => !TERMINAL_STATES.has(s)) as unknown[];
  return (
    getDb()
      .prepare(
        `SELECT * FROM agent_runs WHERE state IN (${placeholders})
         ORDER BY updated_at ASC LIMIT ?`,
      )
      .all(...params, Math.min(limit, 500)) as RunRow[]
  ).map(toRun);
}
