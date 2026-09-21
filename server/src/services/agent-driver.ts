import { getDb } from '../db/index.js';
import { getRun, step, type AgentRun, AgentRunError } from './agent-runtime.js';
import { recall, remember } from './agent-memory.js';
import { resolveMode } from '@freellmapi/agent/core/compute-mode.js';
import { redactSecrets } from '@freellmapi/agent/core/redaction.js';
import type { RunEvent } from '@freellmapi/agent/core/state-machine.js';
import type { ModelTaskType, RunState } from '@freellmapi/agent/core/types.js';

/**
 * The autonomous driver.
 *
 * `agent-runtime.ts` gave a run identity, durability, budgets and human gates,
 * but it only advanced when a caller reported what happened. This closes the
 * loop: it asks a model what happened, and feeds the answer back in.
 *
 * Three rules shape the whole design.
 *
 * **The model proposes; the kernel disposes.** A model never names a state or
 * picks a transition. It answers a bounded question for the phase the run is
 * already in, and this file maps that answer onto exactly one legal event. A
 * model that returns nonsense cannot move the run anywhere illegal, because
 * the runtime asks `transition()` either way.
 *
 * **One step per call.** `advance()` does a single phase. Looping is the
 * caller's decision (`advanceUntil` bounds it), so a runaway driver is capped
 * by the run's own step budget rather than by a `while (true)` in here.
 *
 * **Human gates are terminal for the driver.** When a run parks on an approval
 * it stops and says so. It will not approve its own plan — that is the point
 * of the gate.
 */

export class AgentDriverError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'AgentDriverError';
    this.status = status;
  }
}

/** A single question put to a model for one phase of a run. */
interface PhasePlan {
  taskType: ModelTaskType;
  /** The prompt-library file that defines the role for this phase. */
  promptFile: string;
  instruction: string;
  /** Legal outcomes for this phase, mapped to the event each one implies. */
  outcomes: Record<string, RunEvent>;
}

/**
 * What to ask at each state, and which events the answer may produce.
 *
 * Every outcome listed here is legal in its state per the kernel's transition
 * table — that is checked by a test, so this map cannot silently drift from
 * the state machine.
 */
const PHASES: Partial<Record<RunState, PhasePlan>> = {
  INTAKE: {
    taskType: 'intake',
    promptFile: '01-product-analyst.md',
    instruction:
      'Decide whether this goal is clear enough to specify. Answer "clear" if you can write a specification from it, or "unclear" if you must ask the user a question first.',
    outcomes: { clear: 'spec_ready', unclear: 'needs_clarification' },
  },
  CLARIFY: {
    taskType: 'clarification',
    promptFile: '02-requirements-clarifier.md',
    instruction:
      'The user has answered your question. Answer "answered" if you now have enough to write a specification, or "specified" if the answer is itself a complete specification.',
    // CLARIFY cannot loop back to itself: the kernel allows only forward moves
    // from here, so there is no "still unclear" outcome to offer.
    outcomes: { answered: 'clarification_answered', specified: 'spec_ready' },
  },
  SPECIFY: {
    taskType: 'specification',
    promptFile: '01-product-analyst.md',
    instruction:
      'Write the specification. Answer "ready" when the acceptance criteria are stated, or "unclear" if something essential is still missing.',
    outcomes: { ready: 'spec_ready', unclear: 'needs_clarification' },
  },
  PLAN: {
    taskType: 'planning',
    promptFile: '03-solution-architect.md',
    instruction:
      'Produce an implementation plan as an ordered task list. Answer "ready" when the plan is complete.',
    outcomes: { ready: 'plan_ready', unclear: 'needs_clarification' },
  },
  RECON: {
    taskType: 'code_review',
    promptFile: '04-repo-analyst.md',
    instruction:
      'Survey what the plan will touch and note the risks. Answer "complete" when the survey is done.',
    outcomes: { complete: 'recon_complete' },
  },
  IMPLEMENT: {
    taskType: 'code_generation',
    promptFile: '05-coding-agent.md',
    instruction:
      'Describe the change for the next task in the plan. Answer "done" when the batch is ready to test.',
    outcomes: { done: 'implementation_batch_done' },
  },
  TEST: {
    taskType: 'test_generation',
    promptFile: '06-qa-accessibility.md',
    instruction:
      'Judge whether the implemented change satisfies its acceptance criteria. Answer "pass" or "fail".',
    outcomes: { pass: 'tests_passed', fail: 'tests_failed' },
  },
  REPAIR: {
    taskType: 'repair',
    promptFile: '12-repair.md',
    instruction:
      'Diagnose the failure and describe the fix. Answer "fixed" when the repair is ready to retest.',
    outcomes: { fixed: 'repair_succeeded', fail: 'tests_failed' },
  },
  SECURITY_REVIEW: {
    taskType: 'security_review',
    promptFile: '07-security-reviewer.md',
    instruction:
      'Review the change for security problems. Answer "clear" if none block release, or "blocked" if one does.',
    outcomes: { clear: 'security_clear', blocked: 'security_blocked' },
  },
  PREVIEW: {
    taskType: 'documentation',
    promptFile: '08-devops-deploy.md',
    instruction:
      'Summarise what a reviewer should check in the preview. Answer "ready" when the summary is written.',
    outcomes: { ready: 'preview_ready' },
  },
  VERIFY: {
    taskType: 'code_review',
    promptFile: '06-qa-accessibility.md',
    instruction:
      'Confirm the deployment behaves as specified. Answer "verified" if it does, or "fail" if it does not.',
    outcomes: { verified: 'finalized', fail: 'tests_failed' },
  },
};

export interface AdvanceOptions {
  runId: string;
  /**
   * Called to obtain the model's answer for one phase. Injected rather than
   * imported so the driver can be tested without a live provider, and so the
   * caller chooses how the gateway is reached.
   */
  complete: CompletionFn;
  /** Attach recalled project memory to the prompt. Default true. */
  useMemory?: boolean;
  now?: number;
}

export interface CompletionRequest {
  runId: string;
  state: RunState;
  taskType: ModelTaskType;
  promptFile: string;
  /** The assembled prompt: role, goal, memory, history, question. */
  prompt: string;
  /** The words the answer must start with, in order of preference. */
  allowedOutcomes: string[];
  /** Model hint resolved from the run's compute mode. */
  maxCost: number;
  preferredLocality: 'local' | 'cloud';
}

export interface CompletionResponse {
  /** One of `allowedOutcomes`. Matched case-insensitively. */
  outcome: string;
  /** The model's reasoning, stored on the checkpoint. */
  detail?: string;
  tokensUsed?: number;
  costUsed?: number;
  /** Which model actually answered, for the audit trail. */
  model?: string;
}

export type CompletionFn = (request: CompletionRequest) => Promise<CompletionResponse>;

export interface AdvanceResult {
  ok: boolean;
  run: AgentRun;
  /** Why the driver stopped, when it did not advance. */
  stopped?: 'awaiting_human' | 'terminal' | 'no_phase' | 'refused';
  reason?: string;
  event?: RunEvent;
  outcome?: string;
  model?: string;
}

const MAX_DETAIL_CHARS = 8000;
const MAX_MEMORY_HITS = 5;
const MAX_HISTORY_STEPS = 12;

/** Recent history, so the model knows what has already happened. */
function recentHistory(runId: string, limit = MAX_HISTORY_STEPS): string {
  const rows = getDb()
    .prepare(
      `SELECT sequence, state, event, payload FROM agent_checkpoints
       WHERE run_id = ? ORDER BY sequence DESC LIMIT ?`,
    )
    .all(runId, limit) as { sequence: number; state: string; event: string | null; payload: string }[];

  return rows
    .reverse()
    .map((row) => {
      let note = '';
      try {
        const payload = JSON.parse(row.payload) as { detail?: unknown };
        if (typeof payload?.detail === 'string') note = ` — ${payload.detail.slice(0, 200)}`;
      } catch {
        /* a checkpoint with an unreadable payload still has a state worth showing */
      }
      return `${row.sequence}. ${row.event ?? 'created'} -> ${row.state}${note}`;
    })
    .join('\n');
}

/**
 * Build the prompt for one phase.
 *
 * Secrets are stripped from everything that came from outside this function —
 * the goal, recalled memory and prior step details — because all three can
 * carry whatever a user or tool put there, and this text is about to leave the
 * machine.
 */
function buildPrompt(run: AgentRun, phase: PhasePlan, useMemory: boolean): string {
  const parts: string[] = [
    `# Role\n${phase.promptFile.replace(/^\d+-|\.md$/g, '').replace(/-/g, ' ')}`,
    `# Goal\n${redactSecrets(run.goal).text}`,
    `# Current phase\n${run.state}`,
  ];

  if (useMemory) {
    const hits = recall({
      organizationId: run.organizationId,
      projectId: run.projectId,
      query: run.goal,
      maxResults: MAX_MEMORY_HITS,
    });
    if (hits.length > 0) {
      parts.push(
        `# What we already know about this project\n${hits
          .map((h) => `- (${h.trust}) ${redactSecrets(h.content).text}`)
          .join('\n')}`,
      );
    }
  }

  const history = recentHistory(run.runId);
  if (history) parts.push(`# Steps so far\n${redactSecrets(history).text}`);

  parts.push(`# Your task\n${phase.instruction}`);
  parts.push(
    `# Answer format\nReply with one word on the first line — one of: ${Object.keys(phase.outcomes).join(', ')}.\nThen, on the following lines, explain your reasoning.`,
  );

  return parts.join('\n\n');
}

/**
 * Advance a run by one phase, using a model to decide the outcome.
 *
 * Returns without advancing — rather than throwing — when the run is terminal,
 * parked on a human, or in a state with no automatable phase. Those are normal
 * conditions a caller must handle, not errors.
 */
export async function advance(options: AdvanceOptions): Promise<AdvanceResult> {
  const run = getRun(options.runId);
  if (!run) throw new AgentDriverError(`no such run: ${options.runId}`, 404);

  if (run.terminal) {
    return { ok: false, run, stopped: 'terminal', reason: `run is ${run.state}` };
  }
  if (run.awaiting) {
    // The driver must never approve its own plan; that is what the gate is for.
    return {
      ok: false,
      run,
      stopped: 'awaiting_human',
      reason: `run is waiting for ${run.awaiting} approval`,
    };
  }

  const phase = PHASES[run.state];
  if (!phase) {
    return {
      ok: false,
      run,
      stopped: 'no_phase',
      reason: `state ${run.state} has no automatable phase; advance it explicitly`,
    };
  }

  const profile = resolveMode(run.mode);
  const rule = profile.routing[phase.taskType];
  const allowed = Object.keys(phase.outcomes);

  const answer = await options.complete({
    runId: run.runId,
    state: run.state,
    taskType: phase.taskType,
    promptFile: phase.promptFile,
    prompt: buildPrompt(run, phase, options.useMemory !== false),
    allowedOutcomes: allowed,
    maxCost: rule?.maxCost ?? profile.budget.maxCostPerRun,
    preferredLocality: rule?.preferredLocality ?? 'cloud',
  });

  const outcome = String(answer.outcome ?? '').trim().toLowerCase();
  const event = phase.outcomes[outcome];
  if (!event) {
    // An unusable answer must not become a state change. The run stays where
    // it is and the caller can retry or take over.
    return {
      ok: false,
      run,
      stopped: 'refused',
      reason: `model answered "${answer.outcome}"; expected one of: ${allowed.join(', ')}`,
    };
  }

  const detail = typeof answer.detail === 'string' ? answer.detail.slice(0, MAX_DETAIL_CHARS) : undefined;
  const result = step({
    runId: run.runId,
    event,
    payload: {
      outcome,
      ...(detail === undefined ? {} : { detail: redactSecrets(detail).text }),
      ...(answer.model === undefined ? {} : { model: answer.model }),
      driver: 'auto',
    },
    ...(answer.tokensUsed === undefined ? {} : { tokensUsed: answer.tokensUsed }),
    ...(answer.costUsed === undefined ? {} : { costUsed: answer.costUsed }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });

  return {
    ok: result.ok,
    run: result.run,
    event,
    outcome,
    ...(answer.model === undefined ? {} : { model: answer.model }),
    ...(result.ok ? {} : { stopped: 'refused' as const, reason: result.reason }),
  };
}

export interface AdvanceUntilOptions extends AdvanceOptions {
  /** Hard cap on driver iterations, independent of the run's step budget. */
  maxSteps?: number;
}

export interface AdvanceUntilResult {
  run: AgentRun;
  steps: AdvanceResult[];
  /** Why the loop ended. */
  stopped: 'awaiting_human' | 'terminal' | 'no_phase' | 'refused' | 'max_steps';
  reason?: string;
}

/**
 * Drive a run until it needs a human, finishes, or hits a cap.
 *
 * Two independent ceilings apply: `maxSteps` here, and the run's own budgets
 * inside `step()`. The run's budget is authoritative — this one exists so a
 * single HTTP request cannot block indefinitely.
 */
export async function advanceUntil(options: AdvanceUntilOptions): Promise<AdvanceUntilResult> {
  const cap = options.maxSteps ?? 25;
  if (!Number.isInteger(cap) || cap < 1 || cap > 100) {
    throw new AgentDriverError('maxSteps must be an integer between 1 and 100');
  }

  const steps: AdvanceResult[] = [];
  let last: AdvanceResult | null = null;

  for (let i = 0; i < cap; i += 1) {
    const result = await advance(options);
    steps.push(result);
    last = result;
    if (!result.ok) {
      return {
        run: result.run,
        steps,
        stopped: result.stopped ?? 'refused',
        ...(result.reason === undefined ? {} : { reason: result.reason }),
      };
    }
    if (result.run.terminal) {
      return { run: result.run, steps, stopped: 'terminal', reason: `run is ${result.run.state}` };
    }
    if (result.run.awaiting) {
      return {
        run: result.run,
        steps,
        stopped: 'awaiting_human',
        reason: `run is waiting for ${result.run.awaiting} approval`,
      };
    }
  }

  return {
    run: last!.run,
    steps,
    stopped: 'max_steps',
    reason: `driver stopped after ${cap} steps`,
  };
}

/**
 * Record what a finished run concluded, so the next run starts informed.
 *
 * Only successful runs are remembered: a failed or cancelled run's notes are
 * as likely to mislead as to help.
 */
export function rememberOutcome(runId: string): { stored: boolean; reason?: string } {
  const run = getRun(runId);
  if (!run) throw new AgentDriverError(`no such run: ${runId}`, 404);
  if (run.state !== 'DONE') {
    return { stored: false, reason: `run is ${run.state}; only DONE runs are remembered` };
  }

  try {
    const { created } = remember({
      organizationId: run.organizationId,
      projectId: run.projectId,
      kind: 'run_summary',
      content: `Completed: ${run.goal}`,
      trust: 'observed',
      source: { sourceType: 'model', sourceId: run.runId, evidenceHash: run.runId },
      tags: ['run', run.mode],
    });
    return { stored: created };
  } catch (err) {
    // Memory refuses secret-like content; a run whose goal looks like a
    // credential simply is not remembered.
    return { stored: false, reason: err instanceof Error ? err.message : 'memory refused the summary' };
  }
}

/** Exposed for the test that keeps this map honest against the kernel. */
export const DRIVER_PHASES = PHASES;
export { AgentRunError };
