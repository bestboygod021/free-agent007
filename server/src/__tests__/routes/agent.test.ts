import { describe, it, expect, beforeAll } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb } from '../../db/index.js';
import { mintDashboardToken } from '../helpers/auth.js';

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
