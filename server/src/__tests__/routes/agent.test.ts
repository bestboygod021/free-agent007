import { describe, it, expect, beforeAll } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb } from '../../db/index.js';
import { mintDashboardToken } from '../helpers/auth.js';
import { clearTools } from '../../services/agent-tools.js';
import { registerBuiltinTools } from '../../services/agent-tools-builtin.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { registerTool } from '../../services/agent-tools.js';
import { registerGitTools } from '../../services/agent-tools-git.js';

/**
 * /api/agent — the ForgePilot deterministic kernel surface.
 *
 * These tests assert the two things the merge has to get right: the kernel is
 * actually reachable through the existing Express app (module resolution,
 * JSON schema imports and prompt files all survive the workspace move), and
 * the route keeps the kernel's fail-closed behaviour instead of softening it.
 */

async function call(
  app: Express,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  token?: string,
  body?: unknown,
) {
  const server = app.listen(0, '127.0.0.1');
  if (!server.listening) {
    await new Promise<void>(resolve => server.once('listening', () => resolve()));
  }
  const addr = server.address() as { port: number };
  const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  server.close();

  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body stays null */
  }
  return { status: res.status, body: json };
}

describe('/api/agent kernel surface', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();
    token = mintDashboardToken('agent-route@example.com');
  });

  it('requires dashboard auth like every other /api surface', async () => {
    const res = await call(app, 'GET', '/api/agent/modes');
    expect(res.status).toBe(401);
  });

  it('serves the three compute modes with full profiles', async () => {
    const res = await call(app, 'GET', '/api/agent/modes', token);
    expect(res.status).toBe(200);
    expect(res.body.modes.map((m: any) => m.mode)).toEqual(['free', 'paid', 'local']);

    const free = res.body.modes.find((m: any) => m.mode === 'free');
    expect(free.profile.providerPolicy.allowPaidCloud).toBe(false);
    expect(free.profile.budget.maxCostPerRun).toBe(0);
    expect(typeof free.descriptionFa).toBe('string');
  });

  it('rejects an unknown compute mode', async () => {
    const res = await call(app, 'GET', '/api/agent/modes/quantum', token);
    expect(res.status).toBe(400);
  });

  it('refuses local mode when no local runtime exists', async () => {
    const res = await call(app, 'POST', '/api/agent/modes/validate', token, {
      mode: 'local',
      privacyLevel: 'confidential',
      hasLocalRuntime: false,
      hasPaidAccess: false,
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.effectiveMode).toBe('free');
    expect(res.body.problems.length).toBeGreaterThan(0);
  });

  it('routes to a free provider and explains every rejection', async () => {
    const providers = [
      {
        provider: 'groq',
        model: 'llama-3.3-70b',
        locality: 'cloud',
        maxPrivacyLevel: 'internal',
        supportsToolCalling: true,
        supportsStructuredOutput: true,
        contextWindow: 128000,
        rpm: 30,
        rpd: 1000,
        mayTrainOnInput: false,
        license: 'llama-3.3',
        relativeCost: 0,
        relativeLatencyMs: 400,
        enabled: true,
      },
      {
        provider: 'openai',
        model: 'gpt-4o',
        locality: 'cloud',
        maxPrivacyLevel: 'confidential',
        supportsToolCalling: true,
        supportsStructuredOutput: true,
        contextWindow: 128000,
        rpm: 500,
        rpd: 10000,
        mayTrainOnInput: false,
        license: 'proprietary',
        relativeCost: 25,
        relativeLatencyMs: 700,
        enabled: true,
      },
    ];

    const res = await call(app, 'POST', '/api/agent/route', token, {
      mode: 'free',
      request: {
        taskType: 'code_generation',
        privacyLevel: 'internal',
        requiresToolCalling: true,
        requiresStructuredOutput: true,
        contextTokens: 32000,
        maxCost: 0,
        maxLatencyMs: 30000,
      },
      providers,
    });

    expect(res.status).toBe(200);
    expect(res.body.primary.provider).toBe('groq');
    // the paid model must be dropped *with a stated reason*, not silently
    const paid = res.body.rejected.find((r: any) => r.provider === 'openai');
    expect(paid).toBeDefined();
    expect(typeof paid.reason).toBe('string');
  });

  it('denies a push to a protected branch', async () => {
    const res = await call(app, 'POST', '/api/agent/policy/tool-call', token, {
      call: { tool: 'git.push', grantedScopes: ['repo:write'], targetRef: 'main' },
      context: {
        autonomy: 'supervised',
        privacyLevel: 'internal',
        workingBranch: 'agent/work',
        protectedBranches: ['main'],
        approverUserId: 'user-1',
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
    expect(res.body.reasons.length).toBeGreaterThan(0);
  });

  it('forbids cloud egress in local mode regardless of consent', async () => {
    const res = await call(app, 'POST', '/api/agent/policy/egress', token, {
      privacyLevel: 'internal',
      providerLocality: 'cloud',
      providerMayTrainOnInput: false,
      hasUnredactedSecrets: false,
      userConsentedToCloud: true,
      computeMode: 'local',
    });
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
  });

  it('refuses an illegal state transition', async () => {
    const legal = await call(app, 'POST', '/api/agent/states/transition', token, {
      state: 'INTAKE',
      event: 'needs_clarification',
    });
    expect(legal.status).toBe(200);
    expect(legal.body.ok).toBe(true);
    expect(legal.body.to).toBe('CLARIFY');

    const illegal = await call(app, 'POST', '/api/agent/states/transition', token, {
      state: 'INTAKE',
      event: 'plan_approved',
    });
    expect(illegal.status).toBe(200);
    expect(illegal.body.ok).toBe(false);
    expect(typeof illegal.body.reason).toBe('string');
  });

  it('detects a dependency cycle and plans waves otherwise', async () => {
    const task = (taskId: string, dependencies: string[], allowedPaths: string[]) => ({
      taskId,
      title: taskId,
      type: 'backend',
      objective: `objective for ${taskId}`,
      acceptanceCriteria: ['criterion'],
      allowedPaths,
      forbiddenActions: [],
      dependencies,
      riskLevel: 'low',
      approvalRequired: false,
    });

    const cyclic = await call(app, 'POST', '/api/agent/dag/validate', token, {
      tasks: [task('a', ['b'], ['src/a.ts']), task('b', ['a'], ['src/b.ts'])],
    });
    expect(cyclic.status).toBe(200);
    expect(cyclic.body.validation.ok).toBe(false);
    expect(cyclic.body.waves).toBeNull();

    const acyclic = await call(app, 'POST', '/api/agent/dag/validate', token, {
      tasks: [task('a', [], ['src/a.ts']), task('b', ['a'], ['src/b.ts'])],
    });
    expect(acyclic.status).toBe(200);
    expect(acyclic.body.validation.ok).toBe(true);
    expect(acyclic.body.waves).toEqual([['a'], ['b']]);
  });

  it('redacts secrets out of text', async () => {
    const res = await call(app, 'POST', '/api/agent/redact', token, {
      text: 'export OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz1234567890',
    });
    expect(res.status).toBe(200);
    expect(res.body.text).not.toContain('sk-proj-abcdefghijklmnopqrstuvwxyz1234567890');
  });

  it('rejects a completion claim that has no passing evidence', async () => {
    const res = await call(app, 'POST', '/api/agent/evidence/audit', token, {
      claim: {
        taskStatus: 'completed',
        summary: 'implemented the endpoint',
        acceptanceCriteria: ['returns 200'],
        filesChanged: ['src/a.ts'],
        commandsExecuted: [],
        tests: [],
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(false);
  });

  it('exposes the output contracts and validates against them', async () => {
    const list = await call(app, 'GET', '/api/agent/schemas', token);
    expect(list.status).toBe(200);
    expect(list.body.count).toBeGreaterThan(0);

    const bad = await call(app, 'POST', '/api/agent/schemas/validate', token, {
      schemaId: list.body.ids.task,
      data: { nope: true },
    });
    expect(bad.status).toBe(200);
    expect(bad.body.ok).toBe(false);
  });

  it('lists the versioned prompt library', async () => {
    const res = await call(app, 'GET', '/api/agent/prompts', token);
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(13);
    expect(res.body.prompts[0].file).toMatch(/^\d\d-.+\.md$/);
  });

  it('404s an unknown prompt instead of reading an arbitrary path', async () => {
    const res = await call(app, 'POST', '/api/agent/prompts/99-nope.md/compose', token, {
      vars: {},
    });
    expect(res.status).toBe(404);
  });
});

/**
 * Regression tests for the six input-validation bugs found by fuzzing the
 * kernel surface. Each one previously either crashed a kernel with an internal
 * TypeError, accepted nonsense silently, or — in the first case — disabled a
 * safety invariant outright. They are grouped here so the reason each input is
 * rejected stays documented next to the assertion.
 */
describe('/api/agent input validation (regressions)', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();
    token = mintDashboardToken('agent-validation@example.com');
  });

  /**
   * The worst of the six. The state machine enforces the repair budget with
   * `repairAttempts >= maxRepairAttempts`. A caller-supplied context was merged
   * in unchecked, so a *string* made that comparison NaN — which is always
   * false — and the run could repair forever. Invariant I4 was effectively off.
   */
  it('rejects a non-numeric repair budget instead of disabling the guard', async () => {
    const res = await call(app, 'POST', '/api/agent/states/transition', token, {
      state: 'VERIFY',
      event: 'tests_failed',
      context: { repairAttempts: 'not-a-number', maxRepairAttempts: 3 },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('context.repairAttempts');
  });

  it('still enforces the repair budget for a well-formed context', async () => {
    const res = await call(app, 'POST', '/api/agent/states/transition', token, {
      state: 'VERIFY',
      event: 'tests_failed',
      context: { repairAttempts: 3, maxRepairAttempts: 3 },
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.reason).toContain('repair budget exhausted');
  });

  it('rejects a repair count above its own ceiling', async () => {
    const res = await call(app, 'POST', '/api/agent/states/transition', token, {
      state: 'VERIFY',
      event: 'tests_failed',
      context: { repairAttempts: 9, maxRepairAttempts: 3 },
    });
    expect(res.status).toBe(400);
  });

  // The next three used to surface as "Cannot read properties of null
  // (reading 'taskId')" — an internal field name that tells the caller nothing.
  it('names the bad index for a null task rather than leaking a TypeError', async () => {
    const res = await call(app, 'POST', '/api/agent/dag/validate', token, {
      tasks: [null, { taskId: 't1', dependsOn: [], writes: [], reads: [] }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('tasks[0]');
    expect(res.body.error.message).not.toContain('Cannot read properties');
  });

  it('names the bad index for a null provider', async () => {
    const res = await call(app, 'POST', '/api/agent/route', token, {
      request: { taskType: 'code_generation', requiresToolCalling: false, contextTokens: 1000 },
      providers: [null],
      mode: 'free',
      privacyLevel: 'internal',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('providers[0]');
  });

  it('rejects an array where a completion claim object is required', async () => {
    const res = await call(app, 'POST', '/api/agent/evidence/audit', token, { claim: [] });
    expect(res.status).toBe(400);
    // Must be rejected for its *shape*, not stumble into a per-field message
    // further down (which is what happened before the isPlainObject guard).
    expect(res.body.error.message).toBe('"claim" must be a CompletionClaim object.');
    expect(res.body.error.message).not.toContain('Cannot read properties');
  });

  it('rejects a negative fallback count that silently produced a null route', async () => {
    const res = await call(app, 'POST', '/api/agent/route', token, {
      request: { taskType: 'code_generation', requiresToolCalling: false, contextTokens: 1000 },
      providers: [],
      mode: 'free',
      privacyLevel: 'internal',
      maxFallbacks: -1,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('maxFallbacks');
  });

  /**
   * Redaction runs a dozen regexes over the whole string, so a megabyte of text
   * was ~0.2s of event-loop time per request — a cheap denial of service.
   */
  it('caps redaction input so one request cannot monopolise the event loop', async () => {
    const res = await call(app, 'POST', '/api/agent/redact', token, {
      text: 'x'.repeat(300 * 1024),
    });
    expect(res.status).toBe(400);
  });

  it('still redacts a normal secret', async () => {
    const res = await call(app, 'POST', '/api/agent/redact', token, {
      text: `token = ${'sk-'}${'a'.repeat(24)}`,
    });
    expect(res.status).toBe(200);
    expect(res.body.text).toContain('[REDACTED');
    expect(res.body.hasSecrets).toBe(true);
  });
});

/**
 * Memory and job endpoints — the durable half of the kernel.
 *
 * The service-level tests cover the semantics; these check the HTTP contract:
 * the tenant scope is mandatory, bad input is refused with a useful message,
 * and the kernel's own rules still apply through the route.
 */
describe('/api/agent memory and jobs', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();
    token = mintDashboardToken('agent-durable@example.com');
  });

  const fact = {
    organizationId: 'acme',
    projectId: 'web',
    kind: 'project_fact',
    content: 'The dashboard is built with Vite and React',
    trust: 'verified',
    source: { sourceType: 'tool', sourceId: 'read:vite.config.ts', evidenceHash: 'h1' },
  };

  it('requires auth for memory like every other /api surface', async () => {
    const res = await call(app, 'POST', '/api/agent/memory', undefined, fact);
    expect(res.status).toBe(401);
  });

  it('stores a fact and recalls it through the API', async () => {
    const stored = await call(app, 'POST', '/api/agent/memory', token, fact);
    expect(stored.status).toBe(201);
    expect(stored.body.created).toBe(true);

    const found = await call(app, 'POST', '/api/agent/memory/query', token, {
      organizationId: 'acme',
      projectId: 'web',
      query: 'what builds the dashboard',
    });
    expect(found.status).toBe(200);
    expect(found.body.count).toBeGreaterThan(0);
    expect(found.body.hits[0].content).toContain('Vite');
  });

  it('returns 200 rather than a duplicate when the same fact is stored twice', async () => {
    const again = await call(app, 'POST', '/api/agent/memory', token, fact);
    expect(again.status).toBe(200);
    expect(again.body.created).toBe(false);
  });

  it('refuses a memory write with no tenant scope', async () => {
    const res = await call(app, 'POST', '/api/agent/memory', token, { ...fact, organizationId: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('organizationId');
  });

  it('refuses secret-like content at the route boundary', async () => {
    const res = await call(app, 'POST', '/api/agent/memory', token, {
      ...fact,
      content: `api_key= ${'x'.repeat(20)}`,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('secret-like');
  });

  it('caps memory content so one write cannot bloat the store', async () => {
    const res = await call(app, 'POST', '/api/agent/memory', token, {
      ...fact,
      content: 'x'.repeat(9000),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('content');
  });

  it('does not recall another tenant\'s memory', async () => {
    const res = await call(app, 'POST', '/api/agent/memory/query', token, {
      organizationId: 'evilcorp',
      projectId: 'web',
      query: 'what builds the dashboard',
    });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });

  it('enqueues, claims and completes a job over HTTP', async () => {
    const created = await call(app, 'POST', '/api/agent/jobs', token, {
      queue: 'run',
      organizationId: 'acme',
      idempotencyKey: 'http-job-1',
      payload: { task: 'build' },
      priority: 5,
    });
    expect(created.status).toBe(201);

    const claimed = await call(app, 'POST', '/api/agent/jobs/claim', token, {
      queue: 'run',
      workerId: 'worker-http',
      limit: 1,
    });
    expect(claimed.status).toBe(200);
    expect(claimed.body.count).toBe(1);
    const jobId = claimed.body.jobs[0].jobId;

    const done = await call(app, 'POST', `/api/agent/jobs/${jobId}/complete`, token, {
      workerId: 'worker-http',
    });
    expect(done.status).toBe(200);
    expect(done.body.job.status).toBe('completed');
  });

  it('rejects a completion from a worker that does not hold the lease', async () => {
    await call(app, 'POST', '/api/agent/jobs', token, {
      queue: 'tool',
      organizationId: 'acme',
      idempotencyKey: 'http-job-2',
      payload: { task: 'lint' },
    });
    const claimed = await call(app, 'POST', '/api/agent/jobs/claim', token, {
      queue: 'tool',
      workerId: 'owner',
    });
    const jobId = claimed.body.jobs[0].jobId;

    const stolen = await call(app, 'POST', `/api/agent/jobs/${jobId}/complete`, token, {
      workerId: 'impostor',
    });
    expect(stolen.status).toBe(400);
    expect(stolen.body.error.message).toContain('not currently leased');
  });

  it('rejects an unknown queue name', async () => {
    const res = await call(app, 'POST', '/api/agent/jobs', token, {
      queue: 'quantum',
      organizationId: 'acme',
      idempotencyKey: 'x',
      payload: {},
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('queue');
  });

  it('rejects an oversized job payload', async () => {
    const res = await call(app, 'POST', '/api/agent/jobs', token, {
      queue: 'run',
      organizationId: 'acme',
      idempotencyKey: 'big',
      payload: { blob: 'x'.repeat(200 * 1024) },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('payload');
  });

  it('reports queue depth alongside the kernel policies', async () => {
    const res = await call(app, 'GET', '/api/agent/jobs/stats', token);
    expect(res.status).toBe(200);
    expect(res.body.queues.map((q: any) => q.queue)).toEqual(['run', 'model', 'tool', 'benchmark']);
    expect(res.body.policies.run.concurrency).toBe(2);
  });

  it('404s an unknown job rather than inventing one', async () => {
    const res = await call(app, 'GET', '/api/agent/jobs/job_does_not_exist', token);
    expect(res.status).toBe(404);
  });
});

/**
 * Run endpoints — the execution loop over HTTP.
 *
 * The service tests cover the loop's semantics; these check the HTTP contract,
 * in particular that a *refused* step is a 200 with ok:false (a legitimate
 * answer about a healthy run) while an unknown run is a 404.
 */
describe('/api/agent runs', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();
    token = mintDashboardToken('agent-runs@example.com');
  });

  const newRun = { organizationId: 'acme', projectId: 'web', goal: 'Ship rate limiting', mode: 'paid' };

  async function create() {
    const res = await call(app, 'POST', '/api/agent/runs', token, newRun);
    return res.body.run.runId as string;
  }

  it('requires auth', async () => {
    const res = await call(app, 'POST', '/api/agent/runs', undefined, newRun);
    expect(res.status).toBe(401);
  });

  it('creates a run in INTAKE', async () => {
    const res = await call(app, 'POST', '/api/agent/runs', token, newRun);
    expect(res.status).toBe(201);
    expect(res.body.run.state).toBe('INTAKE');
    expect(res.body.run.budget.maxSteps).toBeGreaterThan(0);
  });

  it('rejects an unknown compute mode', async () => {
    const res = await call(app, 'POST', '/api/agent/runs', token, { ...newRun, mode: 'quantum' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('mode');
  });

  it('advances a run and returns its checkpoint', async () => {
    const runId = await create();
    const res = await call(app, 'POST', `/api/agent/runs/${runId}/step`, token, {
      event: 'spec_ready',
      payload: { note: 'spec drafted' },
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.run.state).toBe('PLAN');
    expect(res.body.checkpoint.sequence).toBe(1);
  });

  it('answers 200 with ok:false for an illegal event', async () => {
    const runId = await create();
    const res = await call(app, 'POST', `/api/agent/runs/${runId}/step`, token, {
      event: 'deploy_approved',
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.reason).toBeTruthy();
    expect(res.body.run.state).toBe('INTAKE');
  });

  it('drives an approval gate through the decision endpoint', async () => {
    const runId = await create();
    await call(app, 'POST', `/api/agent/runs/${runId}/step`, token, { event: 'spec_ready' });
    const gated = await call(app, 'POST', `/api/agent/runs/${runId}/step`, token, { event: 'plan_ready' });
    expect(gated.body.run.awaiting).toBe('plan');

    const approved = await call(app, 'POST', `/api/agent/runs/${runId}/decision`, token, {
      approved: true,
    });
    expect(approved.body.run.state).toBe('RECON');
  });

  it('exposes the checkpoint history and verifies its chain', async () => {
    const runId = await create();
    await call(app, 'POST', `/api/agent/runs/${runId}/step`, token, { event: 'spec_ready' });

    const history = await call(app, 'GET', `/api/agent/runs/${runId}/checkpoints`, token);
    expect(history.status).toBe(200);
    expect(history.body.count).toBe(2);

    const verified = await call(app, 'GET', `/api/agent/runs/${runId}/verify`, token);
    expect(verified.body.valid).toBe(true);
  });

  it('cancels a run', async () => {
    const runId = await create();
    const res = await call(app, 'POST', `/api/agent/runs/${runId}/cancel`, token, {
      reason: 'no longer needed',
    });
    expect(res.body.run.state).toBe('CANCELLED');
    expect(res.body.run.stopReason).toBe('no longer needed');
  });

  it('lists runs for a project and finds resumable ones', async () => {
    const runId = await create();

    const listed = await call(
      app,
      'GET',
      '/api/agent/runs?organizationId=acme&projectId=web',
      token,
    );
    expect(listed.status).toBe(200);
    expect(listed.body.runs.some((r: any) => r.runId === runId)).toBe(true);

    const resumable = await call(app, 'GET', '/api/agent/runs/resumable', token);
    expect(resumable.status).toBe(200);
    expect(resumable.body.runs.some((r: any) => r.runId === runId)).toBe(true);
  });

  it('404s an unknown run rather than inventing one', async () => {
    const res = await call(app, 'GET', '/api/agent/runs/run_nope', token);
    expect(res.status).toBe(404);

    const stepped = await call(app, 'POST', '/api/agent/runs/run_nope/step', token, {
      event: 'spec_ready',
    });
    expect(stepped.status).toBe(404);
  });
});

/**
 * Driver endpoint. The driver itself is covered in services/agent-driver.test
 * with an injected model; here we check the HTTP surface and the validation
 * that stops a malformed request before it reaches a provider.
 */
describe('/api/agent driver endpoint', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();
    token = mintDashboardToken('agent-driver@example.com');
  });

  async function create() {
    const res = await call(app, 'POST', '/api/agent/runs', token, {
      organizationId: 'acme',
      projectId: 'web',
      goal: 'Ship rate limiting',
      mode: 'paid',
    });
    return res.body.run.runId as string;
  }

  it('requires auth', async () => {
    const res = await call(app, 'POST', '/api/agent/runs/run_x/advance', undefined, {});
    expect(res.status).toBe(401);
  });

  it('404s an unknown run', async () => {
    const res = await call(app, 'POST', '/api/agent/runs/run_nope/advance', token, { once: true });
    expect(res.status).toBe(404);
  });

  it('rejects an out-of-range step cap before calling any provider', async () => {
    const runId = await create();
    const res = await call(app, 'POST', `/api/agent/runs/${runId}/advance`, token, { maxSteps: 500 });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('maxSteps');
  });

  it('rejects an empty model override', async () => {
    const runId = await create();
    const res = await call(app, 'POST', `/api/agent/runs/${runId}/advance`, token, { model: '  ' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('model');
  });

  it('rejects an out-of-range tool-call budget', async () => {
    const runId = await create();
    const res = await call(app, 'POST', `/api/agent/runs/${runId}/advance`, token, {
      useTools: true,
      maxToolCalls: 99,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('maxToolCalls');
  });

  it('refuses to remember a run that has not finished', async () => {
    const runId = await create();
    const res = await call(app, 'POST', `/api/agent/runs/${runId}/remember`, token, {});
    expect(res.status).toBe(200);
    expect(res.body.stored).toBe(false);
    expect(res.body.reason).toContain('only DONE runs');
  });
});

/**
 * Tool endpoints. The registry is covered in services/agent-tools.test; here
 * we check the HTTP surface and, above all, that the workspace root is not
 * something a caller can choose.
 */
describe('/api/agent tool endpoints', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();
    token = mintDashboardToken('agent-tools@example.com');
    clearTools();
    registerBuiltinTools();
  });

  it('requires auth', async () => {
    const res = await call(app, 'GET', '/api/agent/tools', undefined);
    expect(res.status).toBe(401);
  });

  it('lists the catalogue without leaking handlers', async () => {
    const res = await call(app, 'GET', '/api/agent/tools', token);
    expect(res.status).toBe(200);
    expect(res.body.tools.map((t: { name: string }) => t.name)).toContain('fs.read_file');
    expect(JSON.stringify(res.body)).not.toContain('handler');
  });

  it('rejects a missing tool name', async () => {
    const res = await call(app, 'POST', '/api/agent/tools/invoke', token, { args: {} });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('tool');
  });

  it('rejects non-object args', async () => {
    const res = await call(app, 'POST', '/api/agent/tools/invoke', token, {
      tool: 'fs.read_file',
      args: 'hello',
    });
    expect(res.status).toBe(400);
  });

  it('ignores a caller-supplied workspace root', async () => {
    // The request tries to point the agent at the filesystem root. The route
    // must use its own configured root regardless, so this cannot succeed.
    const res = await call(app, 'POST', '/api/agent/tools/invoke', token, {
      tool: 'fs.read_file',
      args: { path: 'passwd' },
      workspaceRoot: '/etc',
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
  });

  it('refuses an unregistered tool with an audit row', async () => {
    const res = await call(app, 'POST', '/api/agent/tools/invoke', token, {
      tool: 'fs.destroy_everything',
      args: {},
      organizationId: 'acme',
    });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('denied');

    const audit = await call(app, 'GET', '/api/agent/tools/calls?organizationId=acme', token);
    expect(audit.body.calls[0].tool).toBe('fs.destroy_everything');
    expect(audit.body.calls[0].outcome).toBe('denied');
  });

  it('rejects a bad limit on the audit trail', async () => {
    const res = await call(app, 'GET', '/api/agent/tools/calls?limit=0', token);
    expect(res.status).toBe(400);
  });
});

/**
 * Regression: the invoke route used to merge the caller's `policy` object into
 * the context the policy engine judges against. Both of these were confirmed
 * to succeed against a live server before the fix.
 */
describe('/api/agent tool invoke cannot be talked out of its guards', () => {
  let app: Express;
  let token: string;
  let repo: string;

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();
    token = mintDashboardToken('approver@example.com');
    clearTools();
    registerBuiltinTools();
    registerGitTools();

    repo = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agent-route-git-')));
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: 'T',
      GIT_AUTHOR_EMAIL: 't@e.com',
      GIT_COMMITTER_NAME: 'T',
      GIT_COMMITTER_EMAIL: 't@e.com',
    };
    execFileSync('git', ['init', '--initial-branch=main'], { cwd: repo, env });
    await fs.writeFile(path.join(repo, 'f.txt'), 'x=1\n');
    execFileSync('git', ['add', '.'], { cwd: repo, env });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: repo, env });
    process.env.AGENT_WORKSPACE_ROOT = repo;
  });

  afterAll(async () => {
    delete process.env.AGENT_WORKSPACE_ROOT;
    await fs.rm(repo, { recursive: true, force: true });
  });

  it('will not un-protect a branch on request', async () => {
    await fs.writeFile(path.join(repo, 'f.txt'), 'x=2\n');
    const res = await call(app, 'POST', '/api/agent/tools/invoke', token, {
      tool: 'git.commit.create',
      args: { message: 'commit straight to main' },
      grantedScopes: ['repository:write'],
      policy: { protectedBranches: [] },
    });

    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('denied');
    expect(res.body.reason).toContain('protected ref "main"');

    const log = execFileSync('git', ['log', '--oneline'], { cwd: repo, encoding: 'utf8' });
    expect(log.trim().split('\n')).toHaveLength(1);
  });

  it('will not let a caller nominate itself as the approver', async () => {
    registerTool({
      name: 'deploy.production',
      description: 'ship it',
      schema: { type: 'object', properties: {}, additionalProperties: false },
      handler: async () => 'shipped',
    });

    const res = await call(app, 'POST', '/api/agent/tools/invoke', token, {
      tool: 'deploy.production',
      args: {},
      grantedScopes: ['deploy:write'],
      policy: { approverUserId: 'i-am-the-agent' },
      approvedBy: 'i-am-the-agent',
    });

    expect(res.body.outcome).toBe('denied');
    // The gate compares against the *session* identity.
    expect(res.body.reason).toContain('only "approver@example.com" may approve');
  });

  it('accepts an approval from the authenticated session identity', async () => {
    registerTool({
      name: 'deploy.production',
      description: 'ship it',
      schema: { type: 'object', properties: {}, additionalProperties: false },
      handler: async () => 'shipped',
    });

    const res = await call(app, 'POST', '/api/agent/tools/invoke', token, {
      tool: 'deploy.production',
      args: {},
      grantedScopes: ['deploy:write'],
      approvedBy: 'approver@example.com',
    });

    expect(res.body.ok).toBe(true);
    expect(res.body.result).toBe('shipped');
  });

  it('will not raise autonomy beyond the configured ceiling', async () => {
    // `full` autonomy would waive approval requirements; a request may not ask
    // for it. The call is still gated, proving the ceiling held.
    registerTool({
      name: 'deploy.production',
      description: 'ship it',
      schema: { type: 'object', properties: {}, additionalProperties: false },
      handler: async () => 'shipped',
    });

    const res = await call(app, 'POST', '/api/agent/tools/invoke', token, {
      tool: 'deploy.production',
      args: {},
      grantedScopes: ['deploy:write'],
      policy: { autonomy: 'full' },
    });

    expect(res.body.outcome).toBe('denied');
    expect(res.body.reason).toContain('requires human approval');
  });
});
