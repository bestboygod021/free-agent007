import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb } from '../../db/index.js';

/**
 * The document routes reach an embedding provider, which a test must not do.
 * This replaces the provider call with a deterministic bag-of-words vector, so
 * ingestion works offline and relevance ordering is reproducible rather than
 * luck. `resolveFamily` is left real except that it always names one family.
 */
const RAG_VOCAB = ['timeout', 'seconds', 'request', 'default', 'gardening', 'rainfall', 'drainage', 'heavy'];
vi.mock('../../services/embeddings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/embeddings.js')>();
  return {
    ...actual,
    resolveFamily: () => 'test-family',
    runEmbeddings: async (_model: string | undefined, inputs: string[]) => ({
      family: 'test-family',
      platform: 'test',
      modelId: 'test-embed',
      dimensions: RAG_VOCAB.length,
      vectors: inputs.map((text) => {
        const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
        return RAG_VOCAB.map((term) => words.filter((w) => w === term).length);
      }),
      inputTokens: inputs.join(' ').length,
    }),
  };
});
import { mintDashboardToken } from '../helpers/auth.js';
import { clearTools } from '../../services/agent-tools.js';
import { registerBuiltinTools } from '../../services/agent-tools-builtin.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { registerTool } from '../../services/agent-tools.js';
import { createUser, createSession } from '../../services/auth.js';
import {
  createOrganization,
  createProject,
  addMember,
} from '../../services/agent-tenancy.js';
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
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
  path: string,
  token?: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
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
      ...(extraHeaders ?? {}),
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


/**
 * A dashboard token whose user owns the `acme`/`web` scope the suites below
 * use. Scope used to be a free-form string that every caller was granted by
 * default; it is now membership, so a test user needs a real organisation.
 */


// Worker credentials for the queue-runner endpoints. These are configuration,
// not request data: `AGENT_WORKER_TOKENS` maps a workerId to its secret, and
// the route derives the identity from whichever secret matched.
const WORKER_A_TOKEN = 'a'.repeat(32);
const WORKER_B_TOKEN = 'b'.repeat(32);
const WORKER_TOKENS_ENV = `worker-a:${WORKER_A_TOKEN},worker-b:${WORKER_B_TOKEN}`;

function mintScopedToken(email: string): string {
  const user = createUser(email, 'password123');
  createOrganization({ organizationId: 'acme', name: 'Acme', ownerUserId: user.userId });
  createProject({ organizationId: 'acme', projectId: 'web', name: 'Web' });
  return createSession(user.userId);
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

  /**
   * The point of this endpoint is to answer "would this be allowed?" the same
   * way /tools/invoke would. It used to spread the caller's context over its
   * defaults, so the caller could answer its own question -- sending an empty
   * protectedBranches list turned a denied commit into an allowed one, while
   * the real execution path still denied it. A preview that disagrees with
   * the enforcement is worse than no preview: it is a confident wrong answer.
   */
  it('ignores a request that tries to un-protect a branch', async () => {
    process.env.AGENT_GRANTED_SCOPES = 'repository:write';
    try {
      const res = await call(app, 'POST', '/api/agent/policy/tool-call', token, {
        call: {
          tool: 'git.commit.create',
          grantedScopes: ['repository:write'],
          targetRef: 'main',
        },
        context: { protectedBranches: [], approverUserId: 'user-1' },
      });

      expect(res.status).toBe(200);
      expect(res.body.allowed).toBe(false);
      expect(String(res.body.reasons)).toMatch(/protected/);
    } finally {
      delete process.env.AGENT_GRANTED_SCOPES;
    }
  });

  /**
   * `autonomy` widens what may run without approval, so the request must not
   * be able to raise it. The assertion is on the *reason*, which names the
   * ceiling actually used -- asserting only on `allowed` would pass against
   * the broken version too, because an external_write tool needs approval
   * either way and the verdict happens to be the same.
   */
  it('ignores a request that raises its own autonomy ceiling', async () => {
    process.env.AGENT_GRANTED_SCOPES = 'pull_request:write';
    try {
      const res = await call(app, 'POST', '/api/agent/policy/tool-call', token, {
        call: { tool: 'git.pull_request.create', grantedScopes: ['pull_request:write'] },
        context: { autonomy: 'full' },
      });

      expect(res.status).toBe(200);
      expect(String(res.body.reasons)).toContain('"supervised" autonomy ceiling');
      expect(String(res.body.reasons)).not.toContain('"full"');
    } finally {
      delete process.env.AGENT_GRANTED_SCOPES;
    }
  });

  it('does not let the request assert a scope the deployment lacks', async () => {
    // AGENT_GRANTED_SCOPES is unset in tests, so no scope is actually held.
    const res = await call(app, 'POST', '/api/agent/policy/tool-call', token, {
      call: { tool: 'git.commit.create', grantedScopes: ['repository:write'] },
      context: {},
    });

    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
    expect(String(res.body.reasons)).toMatch(/scope/i);
  });

  /**
   * The preview and the enforcement must not disagree. This asserts they
   * reach the same verdict for the same call rather than asserting a
   * hard-coded expectation, so it keeps holding if the rules change.
   */
  it('agrees with what /tools/invoke actually does', async () => {
    const preview = await call(app, 'POST', '/api/agent/policy/tool-call', token, {
      call: { tool: 'git.commit.create', grantedScopes: ['repository:write'], targetRef: 'main' },
      context: { protectedBranches: [], approverUserId: 'attacker@evil.test' },
    });
    const executed = await call(app, 'POST', '/api/agent/tools/invoke', token, {
      tool: 'git.commit.create',
      args: { message: 'test' },
      grantedScopes: ['repository:write'],
      approvedBy: 'attacker@evil.test',
    });

    expect(preview.body.allowed).toBe(false);
    expect(executed.body.outcome).toBe('denied');
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
    process.env.AGENT_WORKER_TOKENS = WORKER_TOKENS_ENV;
    initDb(':memory:');
    app = createApp();
    token = mintScopedToken('agent-durable@example.com');
  });

  afterAll(() => {
    delete process.env.AGENT_WORKER_TOKENS;
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
    // This used to return an empty result set: the scope was accepted and
    // simply matched nothing. Membership now refuses the scope outright, which
    // is the stronger guarantee — an empty answer still confirms the tenant
    // exists and is reachable.
    expect(res.status).toBe(404);
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

    // The worker identifies itself with its credential; `workerId` in the body
    // is no longer read, because a body field cannot be an identity.
    const claimed = await call(
      app, 'POST', '/api/agent/jobs/claim', token,
      { queue: 'run', limit: 1 },
      { 'X-Agent-Worker-Token': WORKER_A_TOKEN },
    );
    expect(claimed.status).toBe(200);
    expect(claimed.body.count).toBe(1);
    expect(claimed.body.jobs[0].workerId).toBe('worker-a');
    const jobId = claimed.body.jobs[0].jobId;

    const done = await call(
      app, 'POST', `/api/agent/jobs/${jobId}/complete`, token, {},
      { 'X-Agent-Worker-Token': WORKER_A_TOKEN },
    );
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
    const claimed = await call(
      app, 'POST', '/api/agent/jobs/claim', token,
      { queue: 'tool' },
      { 'X-Agent-Worker-Token': WORKER_A_TOKEN },
    );
    const jobId = claimed.body.jobs[0].jobId;

    // worker-b is a *legitimate* worker with a valid credential. It still may
    // not complete a job it does not hold: authentication says who you are,
    // the lease says what is yours. Both layers have to hold.
    const stolen = await call(
      app, 'POST', `/api/agent/jobs/${jobId}/complete`, token, {},
      { 'X-Agent-Worker-Token': WORKER_B_TOKEN },
    );
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
    token = mintScopedToken('agent-runs@example.com');
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
    token = mintScopedToken('agent-driver@example.com');
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
    token = mintScopedToken('agent-tools@example.com');
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
    token = mintScopedToken('approver@example.com');
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
    // The deployment grants these; the tests below prove a request cannot add
    // to the set, only spend what is already granted.
    process.env.AGENT_GRANTED_SCOPES = 'repository:write, deploy:write';
  });

  afterAll(async () => {
    delete process.env.AGENT_WORKSPACE_ROOT;
    delete process.env.AGENT_GRANTED_SCOPES;
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

  it('will not let a caller grant itself a scope the deployment lacks', async () => {
    // `secret:write` is not in AGENT_GRANTED_SCOPES. Asserting it used to be
    // enough, because the route read the list straight off the request body.
    registerTool({
      name: 'vault.secret.write',
      description: 'write a secret',
      schema: { type: 'object', properties: {}, additionalProperties: false },
      handler: async () => 'written',
      policy: {
        category: 'secret_write',
        riskLevel: 'critical',
        sideEffect: 'external_write',
        requiredScopes: ['secret:write'],
        approval: 'never',
      },
    });

    const res = await call(app, 'POST', '/api/agent/tools/invoke', token, {
      tool: 'vault.secret.write',
      args: {},
      grantedScopes: ['secret:write'],
    });

    expect(res.body.outcome).toBe('denied');
    expect(res.body.reason).toContain('missing required scopes: secret:write');
  });

  it('lets a request narrow its own scopes but not widen them', async () => {
    const narrowed = await call(app, 'POST', '/api/agent/tools/invoke', token, {
      tool: 'git.branch.create',
      args: { branch: 'agent/narrowed' },
      grantedScopes: [],
    });

    expect(narrowed.body.outcome).toBe('denied');
    expect(narrowed.body.reason).toContain('missing required scopes');

    const granted = await call(app, 'POST', '/api/agent/tools/invoke', token, {
      tool: 'git.branch.create',
      args: { branch: 'agent/granted' },
    });

    expect(granted.body.ok).toBe(true);
  });
});


describe('/api/agent tenancy is resolved from membership, not the body', () => {
  let app: Express;
  let aliceToken: string;
  let malloryToken: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();

    const alice = createUser('alice@example.com', 'password123');
    aliceToken = createSession(alice.userId);
    const mallory = createUser('mallory@example.com', 'password123');
    malloryToken = createSession(mallory.userId);

    createOrganization({ organizationId: 'acme', name: 'Acme', ownerUserId: alice.userId });
    createProject({ organizationId: 'acme', projectId: 'web', name: 'Web' });
    // Mallory is a real, authenticated user — with an organisation of her own.
    createOrganization({ organizationId: 'zeta', name: 'Zeta', ownerUserId: mallory.userId });
    createProject({ organizationId: 'zeta', projectId: 'web', name: 'Web' });
  });

  const memory = (organizationId: string, projectId: string, content: string) => ({
    organizationId,
    projectId,
    kind: 'project_fact',
    content,
    trust: 'observed',
    source: { sourceType: 'user', sourceId: 'test', evidenceHash: 'h' },
  });

  it('writes into a scope the caller belongs to', async () => {
    const res = await call(app, 'POST', '/api/agent/memory', aliceToken,
      memory('acme', 'web', 'acme fact'));
    expect(res.status).toBe(201);
  });

  it('refuses a write into an organisation the caller is not in', async () => {
    const res = await call(app, 'POST', '/api/agent/memory', malloryToken,
      memory('acme', 'web', 'stolen'));

    expect(res.status).toBe(404);
    // Not 403: telling her it exists would let any account enumerate tenants.
    expect(res.body.error.message).toContain('was not found');
  });

  it('does not leak another tenant\'s data through a read', async () => {
    const mine = await call(app, 'GET',
      '/api/agent/memory/stats?organizationId=zeta&projectId=web', malloryToken);
    expect(mine.status).toBe(200);
    expect(mine.body.total).toBe(0);

    const theirs = await call(app, 'GET',
      '/api/agent/memory/stats?organizationId=acme&projectId=web', malloryToken);
    expect(theirs.status).toBe(404);
  });

  it('keeps identically-named projects in different organisations apart', async () => {
    await call(app, 'POST', '/api/agent/memory', malloryToken,
      memory('zeta', 'web', 'zeta fact'));

    const acme = await call(app, 'GET',
      '/api/agent/memory/stats?organizationId=acme&projectId=web', aliceToken);
    const zeta = await call(app, 'GET',
      '/api/agent/memory/stats?organizationId=zeta&projectId=web', malloryToken);

    // Both are called "web"; neither sees the other's rows.
    expect(acme.body.total).toBe(1);
    expect(zeta.body.total).toBe(1);
  });

  it('lists only the organisations the caller can act in', async () => {
    const res = await call(app, 'GET', '/api/agent/organizations', malloryToken);
    expect(res.status).toBe(200);
    expect(res.body.organizations.map((o: { organizationId: string }) => o.organizationId))
      .toEqual(['zeta']);
  });

  it('refuses a viewer a write but allows the read', async () => {
    const viewer = createUser('viewer@example.com', 'password123');
    const viewerToken = createSession(viewer.userId);
    addMember({ organizationId: 'acme', userId: viewer.userId, role: 'viewer' });

    const read = await call(app, 'GET',
      '/api/agent/memory/stats?organizationId=acme&projectId=web', viewerToken);
    expect(read.status).toBe(200);

    const write = await call(app, 'POST', '/api/agent/memory', viewerToken,
      memory('acme', 'web', 'viewer should not write'));
    expect(write.status).toBe(403);
    expect(write.body.error.message).toContain('may not write');
  });

  it('will not let a non-admin create a project', async () => {
    const dev = createUser('dev@example.com', 'password123');
    const devToken = createSession(dev.userId);
    addMember({ organizationId: 'acme', userId: dev.userId, role: 'developer' });

    const res = await call(app, 'POST', '/api/agent/organizations/acme/projects', devToken,
      { projectId: 'sneaky' });
    expect(res.status).toBe(403);
  });

  it('lets an owner create a project, and it is immediately usable', async () => {
    const created = await call(app, 'POST', '/api/agent/organizations/acme/projects', aliceToken,
      { projectId: 'billing', name: 'Billing' });
    expect(created.status).toBe(201);

    const used = await call(app, 'POST', '/api/agent/memory', aliceToken,
      memory('acme', 'billing', 'billing fact'));
    expect(used.status).toBe(201);
  });
});


describe('/api/agent membership invites', () => {
  let app: Express;
  let ownerToken: string;
  let adminToken: string;
  let devToken: string;
  let devId: number;

  const PASSWORD = 'password123';

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();

    const owner = createUser('owner@example.com', PASSWORD);
    ownerToken = createSession(owner.userId);
    createOrganization({ organizationId: 'acme', name: 'Acme', ownerUserId: owner.userId });
    createProject({ organizationId: 'acme', projectId: 'web', name: 'Web' });

    const admin = createUser('admin@example.com', PASSWORD);
    adminToken = createSession(admin.userId);
    addMember({ organizationId: 'acme', userId: admin.userId, role: 'admin' });

    const dev = createUser('dev@example.com', PASSWORD);
    devId = dev.userId;
    devToken = createSession(dev.userId);
    addMember({ organizationId: 'acme', userId: dev.userId, role: 'developer' });
  });

  const reauth = { 'x-reauth-password': PASSWORD };

  it('invites, and returns the token exactly once', async () => {
    const res = await call(app, 'POST', '/api/agent/organizations/acme/invites', ownerToken,
      { email: 'new@example.com', role: 'developer' });

    expect(res.status).toBe(201);
    expect(res.body.token).toMatch(/^[0-9a-f]{64}$/);

    // The listing never shows it again.
    const listed = await call(app, 'GET', '/api/agent/organizations/acme/members', ownerToken);
    expect(JSON.stringify(listed.body)).not.toContain(res.body.token);
  });

  it('turns an invite into a working second account', async () => {
    const invited = await call(app, 'POST', '/api/agent/organizations/acme/invites', ownerToken,
      { email: 'joiner@example.com', role: 'developer' });

    // No auth: the invitee has no account yet. The token is the authorisation.
    const accepted = await call(app, 'POST', '/api/auth/accept-invite', undefined,
      { token: invited.body.token, password: 'joinerpassword' });

    expect(accepted.status).toBe(201);
    expect(accepted.body).toMatchObject({ email: 'joiner@example.com', organizationId: 'acme', role: 'developer' });

    // And the session it returns can actually do the work the role allows.
    const wrote = await call(app, 'POST', '/api/agent/memory', accepted.body.token, {
      organizationId: 'acme',
      projectId: 'web',
      kind: 'project_fact',
      content: 'written by the invited user',
      trust: 'observed',
      source: { sourceType: 'user', sourceId: 'joiner', evidenceHash: 'h' },
    });
    expect(wrote.status).toBe(201);
  });

  it('will not let the newcomer exceed the role they were given', async () => {
    const invited = await call(app, 'POST', '/api/agent/organizations/acme/invites', ownerToken,
      { email: 'viewer@example.com', role: 'viewer' });
    const accepted = await call(app, 'POST', '/api/auth/accept-invite', undefined,
      { token: invited.body.token, password: 'viewerpassword' });

    const wrote = await call(app, 'POST', '/api/agent/memory', accepted.body.token, {
      organizationId: 'acme',
      projectId: 'web',
      kind: 'project_fact',
      content: 'a viewer should not write this',
      trust: 'observed',
      source: { sourceType: 'user', sourceId: 'v', evidenceHash: 'h' },
    });
    expect(wrote.status).toBe(403);

    const invitedOthers = await call(app, 'POST', '/api/agent/organizations/acme/invites',
      accepted.body.token, { email: 'chain@example.com', role: 'owner' });
    expect(invitedOthers.status).toBe(403);
  });

  it('refuses a developer the whole management surface', async () => {
    for (const [method, path, body] of [
      ['GET', '/api/agent/organizations/acme/members', undefined],
      ['POST', '/api/agent/organizations/acme/invites', { email: 'x@example.com', role: 'viewer' }],
      ['PATCH', `/api/agent/organizations/acme/members/${devId}`, { role: 'admin' }],
      ['DELETE', `/api/agent/organizations/acme/members/${devId}`, undefined],
    ] as const) {
      const res = await call(app, method, path, devToken, body);
      expect(res.status).toBe(403);
    }
  });

  it('requires the password again before granting owner or admin', async () => {
    const without = await call(app, 'POST', '/api/agent/organizations/acme/invites', ownerToken,
      { email: 'elevated@example.com', role: 'admin' });
    expect(without.status).toBe(403);
    expect(without.body.error.message).toContain('x-reauth-password');

    const wrong = await call(app, 'POST', '/api/agent/organizations/acme/invites', ownerToken,
      { email: 'elevated@example.com', role: 'admin' }, { 'x-reauth-password': 'not-it' });
    expect(wrong.status).toBe(403);

    const right = await call(app, 'POST', '/api/agent/organizations/acme/invites', ownerToken,
      { email: 'elevated@example.com', role: 'admin' }, reauth);
    expect(right.status).toBe(201);
  });

  it('does not require re-auth for an ordinary role', async () => {
    const res = await call(app, 'POST', '/api/agent/organizations/acme/invites', ownerToken,
      { email: 'ordinary@example.com', role: 'reviewer' });
    expect(res.status).toBe(201);
  });

  it('applies the kernel\'s rule when an admin overreaches', async () => {
    const res = await call(app, 'POST', '/api/agent/organizations/acme/invites', adminToken,
      { email: 'esc@example.com', role: 'owner' }, reauth);
    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('only owner may grant elevated');
  });

  it('revokes a pending invite', async () => {
    const created = await call(app, 'POST', '/api/agent/organizations/acme/invites', ownerToken,
      { email: 'revoked@example.com', role: 'viewer' });

    const revoked = await call(app, 'DELETE',
      `/api/agent/organizations/acme/invites/${created.body.invite.inviteId}`, ownerToken);
    expect(revoked.status).toBe(200);

    const used = await call(app, 'POST', '/api/auth/accept-invite', undefined,
      { token: created.body.token, password: 'whatever12' });
    expect(used.status).toBe(404);
  });

  it('changes a role and then removes the member', async () => {
    const promoted = await call(app, 'PATCH', `/api/agent/organizations/acme/members/${devId}`,
      ownerToken, { role: 'reviewer' });
    expect(promoted.status).toBe(200);
    expect(promoted.body.role).toBe('reviewer');

    const removed = await call(app, 'DELETE', `/api/agent/organizations/acme/members/${devId}`,
      ownerToken);
    expect(removed.status).toBe(200);

    // Gone: the scope no longer resolves for them.
    const after = await call(app, 'GET',
      '/api/agent/memory/stats?organizationId=acme&projectId=web', devToken);
    expect(after.status).toBe(404);
  });

  it('will not strand an organisation without an owner', async () => {
    const res = await call(app, 'DELETE', '/api/agent/organizations/acme/members/1', adminToken);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('at least one owner');
  });
});


describe('/api/agent documents and citations', () => {
  let app: Express;
  let ownerToken: string;
  let viewerToken: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();

    const owner = createUser('rag-owner@example.com', 'password123');
    ownerToken = createSession(owner.userId);
    createOrganization({ organizationId: 'acme', name: 'Acme', ownerUserId: owner.userId });
    createProject({ organizationId: 'acme', projectId: 'web', name: 'Web' });

    const viewer = createUser('rag-viewer@example.com', 'password123');
    viewerToken = createSession(viewer.userId);
    addMember({ organizationId: 'acme', userId: viewer.userId, role: 'viewer' });

  });

  const doc = {
    organizationId: 'acme',
    projectId: 'web',
    title: 'Ops notes',
    sourceUri: 'notes/ops.md',
    content: 'The request timeout is 30 seconds by default.\n\nGardening in heavy rainfall needs drainage.',
  };

  it('ingests a document and searches it with a checkable citation', async () => {
    const ingested = await call(app, 'POST', '/api/agent/documents', ownerToken, doc);
    expect(ingested.status).toBe(201);
    expect(ingested.body.chunks).toBeGreaterThan(0);

    const found = await call(app, 'POST', '/api/agent/documents/search', ownerToken, {
      organizationId: 'acme', projectId: 'web', query: 'what is the timeout in seconds',
    });
    expect(found.status).toBe(200);
    const citation = found.body.citations[0];
    expect(citation.text).toContain('timeout is 30 seconds');
    expect(citation.sourceUri).toBe('notes/ops.md');

    // The citation is verifiable: re-reading the source at its offsets
    // reproduces the quote.
    const resolved = await call(app, 'GET',
      `/api/agent/documents/citations/${citation.chunkId}?organizationId=acme&projectId=web`,
      ownerToken);
    expect(resolved.status).toBe(200);
    expect(resolved.body.text).toBe(citation.text);
    expect(resolved.body.matchesStoredChunk).toBe(true);
  });

  it('answers 200 rather than duplicating when the same content is re-sent', async () => {
    const again = await call(app, 'POST', '/api/agent/documents', ownerToken, doc);
    expect(again.status).toBe(200);
    expect(again.body.deduplicated).toBe(true);
  });

  it('lets a viewer search but not ingest or delete', async () => {
    const searched = await call(app, 'POST', '/api/agent/documents/search', viewerToken, {
      organizationId: 'acme', projectId: 'web', query: 'timeout',
    });
    expect(searched.status).toBe(200);

    const ingested = await call(app, 'POST', '/api/agent/documents', viewerToken,
      { ...doc, content: 'Something else entirely.' });
    expect(ingested.status).toBe(403);

    const listed = await call(app, 'GET',
      '/api/agent/documents?organizationId=acme&projectId=web', ownerToken);
    const removed = await call(app, 'DELETE',
      `/api/agent/documents/${listed.body.documents[0].documentId}?organizationId=acme&projectId=web`,
      viewerToken);
    expect(removed.status).toBe(403);
  });

  it('refuses a scope the caller is not a member of', async () => {
    for (const [method, path, body] of [
      ['POST', '/api/agent/documents', { ...doc, organizationId: 'ghost' }],
      ['POST', '/api/agent/documents/search', { organizationId: 'ghost', projectId: 'web', query: 'x' }],
      ['GET', '/api/agent/documents?organizationId=ghost&projectId=web', undefined],
    ] as const) {
      const res = await call(app, method, path, ownerToken, body);
      expect(res.status).toBe(404);
    }
  });

  it('rejects a malformed ingest with the service\'s own status', async () => {
    const empty = await call(app, 'POST', '/api/agent/documents', ownerToken,
      { organizationId: 'acme', projectId: 'web', title: 'T', content: '   ' });
    expect(empty.status).toBe(400);

    const huge = await call(app, 'POST', '/api/agent/documents', ownerToken,
      { organizationId: 'acme', projectId: 'web', title: 'T', content: 'x'.repeat(2_000_001) });
    expect(huge.status).toBe(413);
  });

  it('deletes a document and stops citing it', async () => {
    const listed = await call(app, 'GET',
      '/api/agent/documents?organizationId=acme&projectId=web', ownerToken);
    const documentId = listed.body.documents[0].documentId;

    const removed = await call(app, 'DELETE',
      `/api/agent/documents/${documentId}?organizationId=acme&projectId=web`, ownerToken);
    expect(removed.status).toBe(200);

    const after = await call(app, 'POST', '/api/agent/documents/search', ownerToken, {
      organizationId: 'acme', projectId: 'web', query: 'timeout seconds',
    });
    expect(after.body.citations).toEqual([]);
  });
});

/**
 * Cross-tenant isolation on the by-id routes.
 *
 * The scoped routes take `organizationId` in the body and go through
 * `resolveScope`, which was well covered. The by-id routes take only a run or
 * job id, so for a while "knowing the id" was the whole authorisation model:
 * a member of one organisation could read, advance, approve and cancel
 * another organisation's runs, and read another organisation's job payloads.
 *
 * The suite above missed it because it tests *unknown* ids — `404s an unknown
 * run rather than inventing one`. The dangerous case is a **real id owned by
 * someone else**, which is what these assert.
 */
describe('/api/agent cross-tenant isolation', () => {
  let app: Express;
  let owner: string;
  let outsider: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();

    const a = createUser('tenant-owner@example.com', 'password123');
    createOrganization({ organizationId: 'acme', name: 'Acme', ownerUserId: a.userId });
    createProject({ organizationId: 'acme', projectId: 'web', name: 'Web' });
    owner = createSession(a.userId);

    const b = createUser('tenant-outsider@example.com', 'password123');
    createOrganization({ organizationId: 'rival', name: 'Rival', ownerUserId: b.userId });
    createProject({ organizationId: 'rival', projectId: 'app', name: 'App' });
    outsider = createSession(b.userId);
  });

  async function ownerRun(goal: string): Promise<string> {
    const res = await call(app, 'POST', '/api/agent/runs', owner, {
      goal, organizationId: 'acme', projectId: 'web', mode: 'free',
    });
    expect(res.status).toBe(201);
    return res.body.run.runId as string;
  }

  it('hides another tenant\'s run behind the same 404 as a missing one', async () => {
    const runId = await ownerRun('acme confidential: migrate billing');
    const res = await call(app, 'GET', `/api/agent/runs/${runId}`, outsider);
    expect(res.status).toBe(404);
    // A 403 would confirm the id is real. The refusal must be indistinguishable
    // from a run that does not exist.
    expect(JSON.stringify(res.body)).not.toContain('confidential');
  });

  it('refuses every state-changing route on another tenant\'s run', async () => {
    const runId = await ownerRun('acme confidential: state machine');
    const attempts: [string, 'GET' | 'POST', string, unknown][] = [
      ['step', 'POST', `/api/agent/runs/${runId}/step`, { event: 'spec_ready' }],
      ['decision', 'POST', `/api/agent/runs/${runId}/decision`, { approved: true }],
      ['cancel', 'POST', `/api/agent/runs/${runId}/cancel`, {}],
      ['advance', 'POST', `/api/agent/runs/${runId}/advance`, {}],
      ['remember', 'POST', `/api/agent/runs/${runId}/remember`, {}],
      ['checkpoints', 'GET', `/api/agent/runs/${runId}/checkpoints`, undefined],
      ['verify', 'GET', `/api/agent/runs/${runId}/verify`, undefined],
    ];
    for (const [label, method, path, body] of attempts) {
      const res = await call(app, method, path, outsider, body);
      expect(res.status, label).toBe(404);
      expect(JSON.stringify(res.body), label).not.toContain('confidential');
    }

    // And the run is untouched: a refused step must not have advanced it.
    const after = await call(app, 'GET', `/api/agent/runs/${runId}`, owner);
    expect(after.body.run.state).toBe('INTAKE');
  });

  it('does not leak a job payload to another tenant', async () => {
    const created = await call(app, 'POST', '/api/agent/jobs', owner, {
      queue: 'run', kind: 'demo', organizationId: 'acme', projectId: 'web',
      payload: { secret: 'acme-only-payload' }, idempotencyKey: 'tenancy-1',
    });
    expect(created.status).toBe(201);
    const jobId = created.body.job.jobId;

    const read = await call(app, 'GET', `/api/agent/jobs/${jobId}`, outsider);
    expect(read.status).toBe(404);
    expect(JSON.stringify(read.body)).not.toContain('acme-only-payload');

    const cancelled = await call(app, 'POST', `/api/agent/jobs/${jobId}/cancel`, outsider, {});
    expect(cancelled.status).toBe(404);
  });

  it('does not hand out other tenants\' run ids through /runs/resumable', async () => {
    await ownerRun('acme confidential: resumable');
    const res = await call(app, 'GET', '/api/agent/runs/resumable', outsider);
    expect(res.status).toBe(200);
    // This endpoint was the harvesting step that made the by-id routes worth
    // attacking in the first place.
    expect(JSON.stringify(res.body)).not.toContain('confidential');
  });

  it('scopes the tool-call audit trail to one organisation', async () => {
    const unscoped = await call(app, 'GET', '/api/agent/tools/calls', outsider);
    expect(unscoped.status).toBe(400);

    const cross = await call(app, 'GET', '/api/agent/tools/calls?organizationId=acme', outsider);
    expect(cross.status).toBe(404);
  });

  it('still lets the owning tenant do all of it', async () => {
    const runId = await ownerRun('legitimate acme work');

    expect((await call(app, 'GET', `/api/agent/runs/${runId}`, owner)).status).toBe(200);
    expect((await call(app, 'GET', `/api/agent/runs/${runId}/checkpoints`, owner)).status).toBe(200);
    expect(
      (await call(app, 'POST', `/api/agent/runs/${runId}/step`, owner, { event: 'spec_ready' }))
        .status,
    ).toBe(200);
    expect(
      (await call(app, 'GET', '/api/agent/tools/calls?organizationId=acme', owner)).status,
    ).toBe(200);

    const resumable = await call(app, 'GET', '/api/agent/runs/resumable', owner);
    expect(JSON.stringify(resumable.body)).toContain('legitimate acme work');
  });
});

/**
 * Worker authentication on the queue-runner endpoints.
 *
 * `claim`, `complete` and `fail` are not tenant routes: a worker legitimately
 * handles jobs from every organisation, so the membership check that guards
 * the by-id routes is the wrong control here. For a while there was no control
 * at all — the caller asserted a `workerId` in the body and was believed, so
 * any dashboard session could claim another tenant's job, read its payload out
 * of the claim response, and burn the attempt budget with repeated `/fail`
 * calls until the job dead-lettered.
 *
 * The lease check on `complete`/`fail` was not a defence against this: it
 * verifies the caller is the lease *holder*, and the attacker became the lease
 * holder one call earlier.
 */
describe('/api/agent worker endpoints', () => {
  let app: Express;
  let tenant: string;
  let outsider: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    process.env.AGENT_WORKER_TOKENS = WORKER_TOKENS_ENV;
    initDb(':memory:');
    app = createApp();

    const a = createUser('worker-tenant@example.com', 'password123');
    createOrganization({ organizationId: 'acme', name: 'Acme', ownerUserId: a.userId });
    createProject({ organizationId: 'acme', projectId: 'web', name: 'Web' });
    tenant = createSession(a.userId);

    const b = createUser('worker-outsider@example.com', 'password123');
    createOrganization({ organizationId: 'rival', name: 'Rival', ownerUserId: b.userId });
    outsider = createSession(b.userId);
  });

  afterAll(() => {
    delete process.env.AGENT_WORKER_TOKENS;
  });

  let counter = 0;
  // Each test gets its own queue. Claimed-but-never-completed jobs from an
  // earlier test would otherwise eat the concurrency budget and make a later
  // claim return zero jobs for a reason that has nothing to do with auth.
  async function enqueue(secret: string, queue = 'run'): Promise<string> {
    counter += 1;
    const res = await call(app, 'POST', '/api/agent/jobs', tenant, {
      queue, kind: 'demo', organizationId: 'acme', projectId: 'web',
      payload: { secret }, idempotencyKey: `worker-suite-${counter}`,
    });
    expect(res.status).toBe(201);
    return res.body.job.jobId as string;
  }

  const asWorkerA = { 'X-Agent-Worker-Token': WORKER_A_TOKEN };

  it('refuses a claim from a session with no worker credential', async () => {
    await enqueue('acme-only-payload');
    const res = await call(app, 'POST', '/api/agent/jobs/claim', outsider, {
      queue: 'run', workerId: 'rival-worker',
    });
    expect(res.status).toBe(401);
    // The exploit's whole value was the payload coming back in this response.
    expect(JSON.stringify(res.body)).not.toContain('acme-only-payload');
  });

  it('ignores a workerId supplied in the body', async () => {
    await enqueue('body-identity-check');
    const res = await call(
      app, 'POST', '/api/agent/jobs/claim', tenant,
      { queue: 'run', workerId: 'i-am-whoever-i-say' },
      asWorkerA,
    );
    expect(res.status).toBe(200);
    // Identity comes from the credential that matched, never from the body.
    for (const job of res.body.jobs) expect(job.workerId).toBe('worker-a');
  });

  it('refuses a claim with a wrong token', async () => {
    const res = await call(
      app, 'POST', '/api/agent/jobs/claim', tenant,
      { queue: 'run' },
      { 'X-Agent-Worker-Token': 'z'.repeat(32) },
    );
    expect(res.status).toBe(401);
  });

  it('refuses complete and fail without a worker credential', async () => {
    const jobId = await enqueue('lease-protection', 'model');
    const claimed = await call(
      app, 'POST', '/api/agent/jobs/claim', tenant, { queue: 'model', limit: 100 }, asWorkerA,
    );
    expect(claimed.body.count).toBeGreaterThan(0);

    const done = await call(app, 'POST', `/api/agent/jobs/${jobId}/complete`, outsider, {});
    expect(done.status).toBe(401);

    const failed = await call(app, 'POST', `/api/agent/jobs/${jobId}/fail`, outsider, {
      workerId: 'rival-worker', error: 'sabotage',
    });
    expect(failed.status).toBe(401);
  });

  it('does not let a failed attempt burn the retry budget', async () => {
    const jobId = await enqueue('budget-protection');
    const before = await call(app, 'GET', `/api/agent/jobs/${jobId}`, tenant);
    const attemptsBefore = before.body.job.attempts;

    await call(app, 'POST', `/api/agent/jobs/${jobId}/fail`, outsider, {
      workerId: 'rival-worker', error: 'sabotage',
    });

    const after = await call(app, 'GET', `/api/agent/jobs/${jobId}`, tenant);
    // A rejected call must not have side effects. Without this, an attacker who
    // could not read the payload could still dead-letter the job.
    expect(after.body.job.attempts).toBe(attemptsBefore);
    expect(after.body.job.status).toBe(before.body.job.status);
  });

  it('still lets a credentialled worker run the full lifecycle', async () => {
    const jobId = await enqueue('legitimate-work', 'tool');
    const claimed = await call(
      app, 'POST', '/api/agent/jobs/claim', tenant, { queue: 'tool', limit: 100 }, asWorkerA,
    );
    expect(claimed.status).toBe(200);
    const mine = claimed.body.jobs.find((j: { jobId: string }) => j.jobId === jobId);
    expect(mine).toBeDefined();
    // A worker is meant to see the payload -- it is the thing doing the work.
    expect(JSON.stringify(mine)).toContain('legitimate-work');

    const done = await call(
      app, 'POST', `/api/agent/jobs/${jobId}/complete`, tenant, {}, asWorkerA,
    );
    expect(done.status).toBe(200);
    expect(done.body.job.status).toBe('completed');
  });

  it('still enforces the lease between two legitimate workers', async () => {
    const jobId = await enqueue('lease-between-workers', 'benchmark');
    await call(
      app, 'POST', '/api/agent/jobs/claim', tenant, { queue: 'benchmark', limit: 100 }, asWorkerA,
    );

    const stolen = await call(
      app, 'POST', `/api/agent/jobs/${jobId}/complete`, tenant, {},
      { 'X-Agent-Worker-Token': WORKER_B_TOKEN },
    );
    // Authentication says who you are; the lease says what is yours. Adding the
    // first layer must not have removed the second.
    expect(stolen.status).toBe(400);
    expect(stolen.body.error.message).toContain('not currently leased');
  });
});

describe('/api/agent worker endpoints without configuration', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    delete process.env.AGENT_WORKER_TOKENS;
    initDb(':memory:');
    app = createApp();
    token = mintScopedToken('worker-unconfigured@example.com');
  });

  it('disables the claim surface rather than leaving it open', async () => {
    const res = await call(app, 'POST', '/api/agent/jobs/claim', token, {
      queue: 'run', workerId: 'anyone',
    });
    // 503, not 200: an operator who has not configured workers gets a queue
    // nothing can drain, which is visible, rather than one anyone can drain.
    expect(res.status).toBe(503);
    expect(res.body.error.message).toContain('AGENT_WORKER_TOKENS');
  });
});
