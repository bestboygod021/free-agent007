import { describe, it, expect, beforeEach } from 'vitest';
import { initDb } from '../../db/index.js';
import { createRun, getRun, cancelRun, step, getCheckpoints } from '../../services/agent-runtime.js';
import {
  advance,
  advanceUntil,
  rememberOutcome,
  DRIVER_PHASES,
  type CompletionFn,
  type CompletionRequest,
} from '../../services/agent-driver.js';
import { parseOutcome } from '../../services/agent-completion.js';
import { remember, recall } from '../../services/agent-memory.js';
import { transition, initialContext } from '@freellmapi/agent/core/state-machine.js';
import type { RunState } from '@freellmapi/agent/core/types.js';

/**
 * The autonomous driver.
 *
 * The point of these tests is that a model can never move a run somewhere the
 * kernel would not allow, however badly it answers. The completion function is
 * injected, so each test states exactly what the "model" said.
 */

function start(overrides: Partial<Parameters<typeof createRun>[0]> = {}) {
  return createRun({
    organizationId: 'acme',
    projectId: 'web',
    goal: 'Add rate limiting to the public API',
    mode: 'paid',
    ...overrides,
  });
}

/** A model that always answers with the given word. */
function says(outcome: string, extra: Partial<Awaited<ReturnType<CompletionFn>>> = {}): CompletionFn {
  return async () => ({ outcome, detail: `chose ${outcome}`, ...extra });
}

/** A model that walks a script, one answer per call. */
function scripted(...outcomes: string[]): CompletionFn {
  let i = 0;
  return async () => ({ outcome: outcomes[Math.min(i++, outcomes.length - 1)], detail: 'scripted' });
}

describe('agent driver', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
  });

  it('every phase outcome is a legal transition in its own state', () => {
    // This is the test that keeps the driver honest: if someone adds an
    // outcome the state machine would refuse, it fails here rather than at
    // runtime against a user's run.
    for (const [state, phase] of Object.entries(DRIVER_PHASES)) {
      for (const [outcome, event] of Object.entries(phase!.outcomes)) {
        const ctx = initialContext(3);
        // Approval flags the guards require before these events are reachable.
        ctx.planApproved = true;
        ctx.securityGatePassed = true;
        ctx.deployApproved = true;
        // VERIFY is only reachable after a verified deploy, so the guard for
        // `finalized` (invariant I3) expects this to already be true.
        ctx.verifyPassed = true;
        const result = transition(state as RunState, event, ctx);
        expect(
          result.ok,
          `${state} --${outcome}/${event}--> was refused: ${result.reason}`,
        ).toBe(true);
      }
    }
  });

  it('advances one phase using the model answer', async () => {
    const run = start();
    const result = await advance({ runId: run.runId, complete: says('clear') });

    expect(result.ok).toBe(true);
    expect(result.outcome).toBe('clear');
    expect(result.event).toBe('spec_ready');
    expect(result.run.state).toBe('PLAN');
  });

  it('records the model reasoning on the checkpoint', async () => {
    const run = start();
    await advance({
      runId: run.runId,
      complete: says('clear', { detail: 'the goal names a concrete endpoint', model: 'test-model' }),
    });

    const last = getCheckpoints(run.runId).at(-1)!;
    expect(last.payload).toMatchObject({
      outcome: 'clear',
      detail: 'the goal names a concrete endpoint',
      model: 'test-model',
      driver: 'auto',
    });
  });

  it('refuses to move the run when the model answers nonsense', async () => {
    const run = start();
    const result = await advance({ runId: run.runId, complete: says('banana') });

    expect(result.ok).toBe(false);
    expect(result.stopped).toBe('refused');
    expect(result.reason).toContain('expected one of');
    // Untouched: no state change, no step consumed, no checkpoint.
    expect(getRun(run.runId)!.state).toBe('INTAKE');
    expect(getRun(run.runId)!.budget.stepsUsed).toBe(0);
    expect(getCheckpoints(run.runId)).toHaveLength(1);
  });

  it('refuses an outcome that is legal in another state but not this one', async () => {
    const run = start();
    // "pass" belongs to TEST, not INTAKE.
    const result = await advance({ runId: run.runId, complete: says('pass') });

    expect(result.ok).toBe(false);
    expect(getRun(run.runId)!.state).toBe('INTAKE');
  });

  it('stops at a human gate instead of approving itself', async () => {
    const run = start();
    const driven = await advanceUntil({ runId: run.runId, complete: scripted('clear', 'ready') });

    expect(driven.stopped).toBe('awaiting_human');
    expect(driven.run.state).toBe('AWAITING_PLAN_APPROVAL');
    expect(driven.run.awaiting).toBe('plan');
    // It got there on its own: INTAKE -> PLAN -> AWAITING_PLAN_APPROVAL.
    expect(driven.steps).toHaveLength(2);
  });

  it('will not advance a run that is parked on a human', async () => {
    const run = start();
    await advanceUntil({ runId: run.runId, complete: scripted('clear', 'ready') });

    const again = await advance({ runId: run.runId, complete: says('ready') });
    expect(again.ok).toBe(false);
    expect(again.stopped).toBe('awaiting_human');
  });

  it('resumes after the human approves and runs to completion', async () => {
    const run = start();
    await advanceUntil({ runId: run.runId, complete: scripted('clear', 'ready') });
    step({ runId: run.runId, event: 'plan_approved' }); // the human decides

    const driven = await advanceUntil({
      runId: run.runId,
      // RECON -> IMPLEMENT -> TEST -> SECURITY_REVIEW -> PREVIEW -> gate
      complete: scripted('complete', 'done', 'pass', 'clear', 'ready'),
    });

    expect(driven.run.state).toBe('AWAITING_DEPLOY_APPROVAL');
    expect(driven.stopped).toBe('awaiting_human');
  });

  it('routes a test failure into repair and back', async () => {
    const run = start();
    await advanceUntil({ runId: run.runId, complete: scripted('clear', 'ready') });
    step({ runId: run.runId, event: 'plan_approved' });
    await advanceUntil({ runId: run.runId, complete: scripted('complete', 'done'), maxSteps: 2 });
    expect(getRun(run.runId)!.state).toBe('TEST');

    const failed = await advance({ runId: run.runId, complete: says('fail') });
    expect(failed.run.state).toBe('REPAIR');

    const fixed = await advance({ runId: run.runId, complete: says('fixed') });
    expect(fixed.run.state).toBe('TEST');
  });

  it('cannot exceed the repair budget however many times the model fails', async () => {
    const run = start({ mode: 'free' }); // 2 repair attempts
    await advanceUntil({ runId: run.runId, complete: scripted('clear', 'ready') });
    step({ runId: run.runId, event: 'plan_approved' });
    await advanceUntil({ runId: run.runId, complete: scripted('complete', 'done'), maxSteps: 2 });

    // A model stuck in a failure loop: fail, fixed, fail, fixed, ...
    const driven = await advanceUntil({
      runId: run.runId,
      complete: scripted('fail', 'fixed', 'fail', 'fixed', 'fail', 'fixed', 'fail'),
      maxSteps: 20,
    });

    expect(driven.stopped).toBe('refused');
    expect(driven.reason).toContain('repair budget exhausted');
  });

  it('is bounded by the run step budget, not just its own cap', async () => {
    // Budget of 3: INTAKE->PLAN, PLAN->gate, then the human's approval is the
    // third step. The driver's next move is the one that runs out of budget,
    // so a generous driver cap cannot outlast the run's own ceiling.
    const run = start({ maxSteps: 3 });
    await advanceUntil({ runId: run.runId, complete: scripted('clear', 'ready') });
    step({ runId: run.runId, event: 'plan_approved' });

    const driven = await advanceUntil({
      runId: run.runId,
      complete: scripted('complete', 'done', 'pass'),
      maxSteps: 50,
    });

    expect(driven.run.state).toBe('FAILED');
    expect(driven.reason).toContain('step budget exhausted');
  });

  it('respects its own iteration cap', async () => {
    const run = start();
    const driven = await advanceUntil({
      runId: run.runId,
      complete: scripted('clear'),
      maxSteps: 1,
    });

    expect(driven.stopped).toBe('max_steps');
    expect(driven.steps).toHaveLength(1);
  });

  it('rejects an out-of-range cap', async () => {
    const run = start();
    await expect(
      advanceUntil({ runId: run.runId, complete: says('clear'), maxSteps: 0 }),
    ).rejects.toThrow(/maxSteps/);
  });

  it('will not touch a terminal run', async () => {
    const run = start();
    cancelRun(run.runId);

    const result = await advance({ runId: run.runId, complete: says('clear') });
    expect(result.ok).toBe(false);
    expect(result.stopped).toBe('terminal');
  });

  it('404s an unknown run', async () => {
    await expect(advance({ runId: 'run_nope', complete: says('clear') })).rejects.toThrow(/no such run/);
  });

  it('gives the model the goal, the phase and its permitted answers', async () => {
    const run = start();
    let seen: CompletionRequest | null = null;

    await advance({
      runId: run.runId,
      complete: async (request) => {
        seen = request;
        return { outcome: 'clear' };
      },
    });

    expect(seen!.state).toBe('INTAKE');
    expect(seen!.taskType).toBe('intake');
    expect(seen!.allowedOutcomes).toEqual(['clear', 'unclear']);
    expect(seen!.prompt).toContain('Add rate limiting');
    expect(seen!.prompt).toContain('INTAKE');
  });

  it('feeds recalled project memory into the prompt', async () => {
    remember({
      organizationId: 'acme',
      projectId: 'web',
      kind: 'project_fact',
      content: 'Rate limiting must use the existing Redis instance',
      trust: 'verified',
      source: { sourceType: 'user', sourceId: 'adr:7', evidenceHash: 'h1' },
    });
    const run = start();
    let prompt = '';

    await advance({
      runId: run.runId,
      complete: async (request) => {
        prompt = request.prompt;
        return { outcome: 'clear' };
      },
    });

    expect(prompt).toContain('Redis');
  });

  it('omits memory when asked to', async () => {
    remember({
      organizationId: 'acme',
      projectId: 'web',
      kind: 'project_fact',
      content: 'Rate limiting must use the existing Redis instance',
      trust: 'verified',
      source: { sourceType: 'user', sourceId: 'adr:7', evidenceHash: 'h1' },
    });
    const run = start();
    let prompt = '';

    await advance({
      runId: run.runId,
      useMemory: false,
      complete: async (request) => {
        prompt = request.prompt;
        return { outcome: 'clear' };
      },
    });

    expect(prompt).not.toContain('Redis');
  });

  it('strips secrets from the goal before it reaches a model', async () => {
    const run = start({ goal: `deploy the service, api_key= ${'x'.repeat(24)}` });
    let prompt = '';

    await advance({
      runId: run.runId,
      complete: async (request) => {
        prompt = request.prompt;
        return { outcome: 'clear' };
      },
    });

    expect(prompt).not.toContain('x'.repeat(24));
    expect(prompt).toContain('[REDACTED');
  });

  it('remembers a completed run so the next one starts informed', async () => {
    const run = start();
    for (const event of [
      'spec_ready',
      'plan_ready',
      'plan_approved',
      'recon_complete',
      'implementation_batch_done',
      'tests_passed',
      'security_clear',
      'preview_ready',
      'deploy_approved',
      'deploy_verified',
      'finalized',
    ] as const) {
      step({ runId: run.runId, event });
    }
    expect(getRun(run.runId)!.state).toBe('DONE');

    expect(rememberOutcome(run.runId).stored).toBe(true);
    const hits = recall({ organizationId: 'acme', projectId: 'web', query: 'rate limiting' });
    expect(hits.some((h) => h.content.includes('Completed'))).toBe(true);
  });

  it('does not remember a run that failed', () => {
    const run = start();
    cancelRun(run.runId);

    const result = rememberOutcome(run.runId);
    expect(result.stored).toBe(false);
    expect(result.reason).toContain('only DONE runs');
  });
});

describe('gateway outcome parsing', () => {
  const allowed = ['pass', 'fail'];

  it('reads a bare decision word', () => {
    expect(parseOutcome('pass', allowed)?.outcome).toBe('pass');
  });

  it('reads the decision from the first line and keeps the rest as detail', () => {
    const parsed = parseOutcome('fail\nThe rate limiter allows a burst of 11.', allowed);
    expect(parsed?.outcome).toBe('fail');
    expect(parsed?.detail).toContain('burst of 11');
  });

  it('tolerates punctuation and case', () => {
    expect(parseOutcome('**PASS** — all assertions hold', allowed)?.outcome).toBe('pass');
  });

  it('finds a single decision buried in prose', () => {
    expect(parseOutcome('After review I would pass this change.', allowed)?.outcome).toBe('pass');
  });

  it('refuses to guess when the answer mentions both outcomes', () => {
    // "it could pass or fail" must not be read as a decision.
    expect(parseOutcome('This could pass or fail depending on load.', allowed)).toBeNull();
  });

  it('refuses an empty or unrelated answer', () => {
    expect(parseOutcome('', allowed)).toBeNull();
    expect(parseOutcome('I am not sure what you mean.', allowed)).toBeNull();
  });
});
