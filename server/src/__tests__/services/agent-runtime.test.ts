import { describe, it, expect, beforeEach } from 'vitest';
import { initDb, getDb } from '../../db/index.js';
import {
  createRun,
  step,
  decide,
  cancelRun,
  getRun,
  listRuns,
  getCheckpoints,
  verifyChain,
  resumableRuns,
  AgentRunError,
} from '../../services/agent-runtime.js';

/**
 * The agent execution loop.
 *
 * The kernel's rules are already tested in the agent workspace, so these tests
 * cover what the driver adds: that a run is durable, that its budgets are
 * enforced before work counts, that the kernel's verdict is never overridden,
 * and that the history cannot be rewritten without detection.
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

/** Drive a run to AWAITING_PLAN_APPROVAL, the first human gate. */
function toPlanGate(runId: string) {
  step({ runId, event: 'spec_ready' });
  return step({ runId, event: 'plan_ready' });
}

describe('agent runtime', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
  });

  it('starts a run in INTAKE with a genesis checkpoint', () => {
    const run = start();
    expect(run.state).toBe('INTAKE');
    expect(run.terminal).toBe(false);
    expect(run.budget.stepsUsed).toBe(0);

    const history = getCheckpoints(run.runId);
    expect(history).toHaveLength(1);
    expect(history[0].sequence).toBe(0);
    expect(history[0].previousHash).toBe('0'.repeat(64));
  });

  it('takes the repair budget from the compute mode', () => {
    // free allows 2 repair attempts, paid allows 3 — the caller should not
    // have to know that.
    expect(start({ mode: 'free' }).context.maxRepairAttempts).toBe(2);
    expect(start({ mode: 'paid' }).context.maxRepairAttempts).toBe(3);
  });

  it('advances through the state machine and records each step', () => {
    const run = start();
    const first = step({ runId: run.runId, event: 'spec_ready' });

    expect(first.ok).toBe(true);
    expect(first.run.state).toBe('PLAN');
    expect(first.run.budget.stepsUsed).toBe(1);
    expect(first.checkpoint?.sequence).toBe(1);
    expect(first.checkpoint?.event).toBe('spec_ready');
  });

  it('refuses an illegal event without failing the run', () => {
    const run = start();
    // `deploy_approved` is meaningless in INTAKE. The kernel answers with the
    // specific guard that refused it, not a generic "illegal event".
    const result = step({ runId: run.runId, event: 'deploy_approved' });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('deploy approval is only valid');
    // The run is untouched: same state, no step consumed, no checkpoint.
    expect(result.run.state).toBe('INTAKE');
    expect(result.run.budget.stepsUsed).toBe(0);
    expect(getCheckpoints(run.runId)).toHaveLength(1);
  });

  it('parks on a human at the plan gate and reports what it awaits', () => {
    const run = start();
    const gated = toPlanGate(run.runId);

    expect(gated.run.state).toBe('AWAITING_PLAN_APPROVAL');
    expect(gated.run.awaiting).toBe('plan');
  });

  it('resolves an approval without the caller naming the event', () => {
    const run = start();
    toPlanGate(run.runId);

    const approved = decide(run.runId, true);
    expect(approved.ok).toBe(true);
    expect(approved.run.state).toBe('RECON');
    expect(approved.run.context.planApproved).toBe(true);
    expect(approved.run.awaiting).toBeNull();
  });

  it('sends a rejected plan back for rework rather than killing the run', () => {
    const run = start();
    toPlanGate(run.runId);

    const rejected = decide(run.runId, false);
    expect(rejected.run.state).toBe('PLAN');
    expect(rejected.run.context.planApproved).toBe(false);
  });

  it('refuses a decision when the run is not waiting for one', () => {
    const run = start();
    expect(() => decide(run.runId, true)).toThrow(/not awaiting a decision/);
  });

  it('enforces the kernel repair budget through the loop', () => {
    const run = start({ mode: 'paid' }); // 3 repair attempts
    toPlanGate(run.runId);
    decide(run.runId, true);
    step({ runId: run.runId, event: 'recon_complete' });
    step({ runId: run.runId, event: 'implementation_batch_done' }); // -> TEST

    // Burn the repair budget: each tests_failed increments the counter.
    for (let i = 0; i < 3; i += 1) {
      const failed = step({ runId: run.runId, event: 'tests_failed' });
      expect(failed.ok).toBe(true);
      step({ runId: run.runId, event: 'repair_succeeded' });
    }

    // The fourth attempt must be refused by the kernel, not by this service.
    const exhausted = step({ runId: run.runId, event: 'tests_failed' });
    expect(exhausted.ok).toBe(false);
    expect(exhausted.reason).toContain('repair budget exhausted');
  });

  it('fails a run that runs out of steps instead of letting it drift', () => {
    const run = start({ maxSteps: 2 });
    step({ runId: run.runId, event: 'spec_ready' });
    step({ runId: run.runId, event: 'plan_ready' });

    const over = step({ runId: run.runId, event: 'plan_approved' });
    expect(over.ok).toBe(false);
    expect(over.reason).toContain('step budget exhausted');
    expect(over.run.state).toBe('FAILED');
    expect(over.run.terminal).toBe(true);
  });

  it('fails a run that exceeds its token budget', () => {
    const run = start({ maxTokens: 100 });
    step({ runId: run.runId, event: 'spec_ready', tokensUsed: 150 });

    const over = step({ runId: run.runId, event: 'plan_ready' });
    expect(over.ok).toBe(false);
    expect(over.reason).toContain('token budget exhausted');
    expect(over.run.state).toBe('FAILED');
  });

  it('fails a run that exceeds its cost budget', () => {
    const run = start({ maxCost: 5 });
    step({ runId: run.runId, event: 'spec_ready', costUsed: 6 });

    const over = step({ runId: run.runId, event: 'plan_ready' });
    expect(over.ok).toBe(false);
    expect(over.reason).toContain('cost budget exhausted');
  });

  it('fails a run past its deadline', () => {
    const now = Date.now();
    const run = start({ timeoutMs: 1000, now });

    const over = step({ runId: run.runId, event: 'spec_ready', now: now + 5000 });
    expect(over.ok).toBe(false);
    expect(over.reason).toContain('time budget exhausted');
    expect(over.run.state).toBe('FAILED');
  });

  it('cannot be asked for more budget than the mode allows', () => {
    // free mode permits no paid spend at all, so a request for 999 is clamped.
    const run = start({ mode: 'free', maxCost: 999 });
    expect(run.budget.maxCost).toBe(0);
  });

  it('accepts nothing once terminal', () => {
    const run = start();
    cancelRun(run.runId);

    const after = step({ runId: run.runId, event: 'spec_ready' });
    expect(after.ok).toBe(false);
    expect(after.reason).toContain('terminal state CANCELLED');
    expect(after.reason).toContain('I6');
  });

  it('cancels a live run and refuses to cancel it twice', () => {
    const run = start();
    const cancelled = cancelRun(run.runId, 'operator stopped it');

    expect(cancelled.state).toBe('CANCELLED');
    expect(cancelled.stopReason).toBe('operator stopped it');
    expect(() => cancelRun(run.runId)).toThrow(/already CANCELLED/);
  });

  it('reaches DONE through the happy path', () => {
    const run = start();
    toPlanGate(run.runId);
    decide(run.runId, true);
    step({ runId: run.runId, event: 'recon_complete' });
    step({ runId: run.runId, event: 'implementation_batch_done' });
    step({ runId: run.runId, event: 'tests_passed' });
    step({ runId: run.runId, event: 'security_clear' });
    step({ runId: run.runId, event: 'preview_ready' });
    decide(run.runId, true); // deploy approval
    step({ runId: run.runId, event: 'deploy_verified' });
    const done = step({ runId: run.runId, event: 'finalized' });

    expect(done.run.state).toBe('DONE');
    expect(done.run.terminal).toBe(true);
    expect(done.run.stopReason).toBe('completed');
    expect(done.run.context.verifyPassed).toBe(true);
  });

  it('keeps a verifiable hash chain over the whole run', () => {
    const run = start();
    toPlanGate(run.runId);
    decide(run.runId, true);

    const chain = verifyChain(run.runId);
    expect(chain.valid).toBe(true);
    expect(chain.length).toBe(4); // genesis + 3 steps
    expect(chain.brokenAt).toBeNull();
  });

  it('detects a checkpoint edited in place', () => {
    const run = start();
    step({ runId: run.runId, event: 'spec_ready' });

    // Tamper: rewrite history without touching the hash.
    getDb()
      .prepare(`UPDATE agent_checkpoints SET payload = ? WHERE run_id = ? AND sequence = 1`)
      .run(JSON.stringify({ forged: true }), run.runId);

    const chain = verifyChain(run.runId);
    expect(chain.valid).toBe(false);
    expect(chain.brokenAt).toBe(1);
    expect(chain.reason).toContain('do not match its hash');
  });

  it('detects a checkpoint deleted from the middle', () => {
    const run = start();
    step({ runId: run.runId, event: 'spec_ready' });
    step({ runId: run.runId, event: 'plan_ready' });

    getDb().prepare('DELETE FROM agent_checkpoints WHERE run_id = ? AND sequence = 1').run(run.runId);

    const chain = verifyChain(run.runId);
    expect(chain.valid).toBe(false);
    expect(chain.reason).toContain('sequence gap');
  });

  it('survives a simulated crash: state and history stay consistent', () => {
    const run = start();
    step({ runId: run.runId, event: 'spec_ready' });
    step({ runId: run.runId, event: 'plan_ready' });

    // Reopening the row is what a restart does — nothing is held in memory.
    const reloaded = getRun(run.runId)!;
    expect(reloaded.state).toBe('AWAITING_PLAN_APPROVAL');
    expect(reloaded.budget.stepsUsed).toBe(2);

    // The last checkpoint agrees with the run's state: no half-applied step.
    const history = getCheckpoints(run.runId);
    expect(history.at(-1)!.state).toBe('AWAITING_PLAN_APPROVAL');
    expect(history.at(-1)!.sequence).toBe(reloaded.budget.stepsUsed);
    expect(verifyChain(run.runId).valid).toBe(true);

    // And it can simply carry on.
    expect(decide(run.runId, true).run.state).toBe('RECON');
  });

  it('lists runs that were mid-flight, excluding finished ones', () => {
    const live = start();
    const done = start({ goal: 'another goal' });
    cancelRun(done.runId);

    const ids = resumableRuns().map((r) => r.runId);
    expect(ids).toContain(live.runId);
    expect(ids).not.toContain(done.runId);
  });

  it('scopes listing to one project', () => {
    start();
    start({ organizationId: 'globex' });

    expect(listRuns('acme', 'web')).toHaveLength(1);
    expect(listRuns('globex', 'web')).toHaveLength(1);
    expect(listRuns('acme', 'mobile')).toHaveLength(0);
  });

  it('filters a listing by state', () => {
    const a = start();
    start({ goal: 'second' });
    cancelRun(a.runId);

    expect(listRuns('acme', 'web', { state: 'CANCELLED' })).toHaveLength(1);
    expect(listRuns('acme', 'web', { state: 'INTAKE' })).toHaveLength(1);
  });

  it('rejects malformed input', () => {
    expect(() => start({ goal: '   ' })).toThrow(/goal/);
    expect(() => start({ organizationId: '' })).toThrow(/organizationId/);
    expect(() => start({ mode: 'quantum' as never })).toThrow(/unknown compute mode/);
    expect(() => start({ maxSteps: 0 })).toThrow(/maxSteps/);
  });

  it('404s an unknown run', () => {
    expect(() => step({ runId: 'run_nope', event: 'spec_ready' })).toThrow(AgentRunError);
    try {
      step({ runId: 'run_nope', event: 'spec_ready' });
    } catch (err) {
      expect((err as AgentRunError).status).toBe(404);
    }
  });
});
