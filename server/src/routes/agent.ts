import { Router } from 'express';
import type { Request, Response } from 'express';

import {
  COMPUTE_MODES,
  isComputeMode,
  resolveMode,
  describeModeFa,
  validateModeSelection,
  type ComputeMode,
} from '@freellmapi/agent/core/compute-mode.js';
import { routeModel } from '@freellmapi/agent/core/model-router.js';
import { evaluateToolCall, evaluateEgress } from '@freellmapi/agent/core/policy-engine.js';
import { authenticateWorker } from '../services/agent-worker-auth.js';
import {
  RUN_STATES,
  TERMINAL_STATES,
  initialContext,
  transition,
} from '@freellmapi/agent/core/state-machine.js';
import {
  validateDag,
  computeWaves,
  findWaveConflicts,
} from '@freellmapi/agent/core/task-dag.js';
import { redactSecrets, redactPayload } from '@freellmapi/agent/core/redaction.js';
import { auditCompletionClaim } from '@freellmapi/agent/core/evidence.js';
import { SCHEMA_IDS, SCHEMAS } from '@freellmapi/agent/core/schema-registry.js';
import { validate as validateAgainstSchema } from '@freellmapi/agent/core/output-contract.js';
import {
  listPromptFiles,
  readPromptFile,
  parseFrontMatter,
  composePrompt,
} from '@freellmapi/agent/core/prompt-library.js';
import type {
  MemoryKind,
  MemorySource,
  MemoryTrust,
} from '@freellmapi/agent/core/memory-retrieval.js';

import { remember, recall, forget, memoryStats } from '../services/agent-memory.js';
import {
  enqueue,
  claim as claimJobs,
  complete as completeJob,
  fail as failJob,
  cancel as cancelJob,
  getJob,
  queueStats,
  isQueueName,
  QUEUE_NAMES,
  DEFAULT_QUEUE_POLICIES,
} from '../services/agent-jobs.js';
import {
  AgentRunError,
  createRun,
  step,
  decide,
  cancelRun,
  getRun,
  listRuns,
  getCheckpoints,
  verifyChain,
  resumableRuns,
} from '../services/agent-runtime.js';
import {
  advance,
  advanceUntil,
  rememberOutcome,
  AgentDriverError,
} from '../services/agent-driver.js';
import { gatewayCompletion } from '../services/agent-completion.js';
import { invokeTool, listTools, listToolCalls, ToolError } from '../services/agent-tools.js';
import { agentWorkspaceRoot } from '../services/agent-tools-builtin.js';
import { buildPolicyContext, resolveScopes } from '../services/agent-policy-context.js';
import {
  resolveScope,
  isScopeFailure,
  canWrite,
  canAdminister,
  membershipRole,
  projectExists,
  createProject,
  listOrganizations,
  listProjects,
  ensureDefaultOrganization,
  isValidIdentifier,
  type Scope,
  type ScopeFailure,
  type Role,
} from '../services/agent-tenancy.js';
import {
  createInvite,
  revokeInvite,
  listInvites,
  listMembers,
  changeRole,
  removeMember,
  isInviteFailure,
} from '../services/agent-invites.js';
import { verifyCredentials } from '../services/auth.js';
import {
  ingestDocument,
  searchDocuments,
  listDocuments,
  deleteDocument,
  resolveCitation,
  RagError,
} from '../services/rag-store.js';
import { EmbeddingsError } from '../services/embeddings.js';

/**
 * ForgePilot agent kernel surface (merged from the `code-agent` blueprint).
 *
 * These endpoints expose the *deterministic* half of the agent platform: the
 * parts that decide rather than generate. Every handler here is pure with
 * respect to the database — it takes a JSON body, runs a decision kernel from
 * the `@freellmapi/agent` workspace, and returns the verdict plus the reason.
 * Nothing in this router calls an upstream model or mutates state, so it is
 * safe to expose to the dashboard and to scripts.
 *
 * Mounted at /api/agent behind requireAuth, like the other admin surfaces.
 */

export const agentRouter = Router();

const MAX_BODY_ITEMS = 500;
/** Redaction runs a dozen regexes over the whole string; 1 MB of text is ~0.2s
 *  of CPU on this box. Cap it so one request cannot monopolise the event loop. */
const MAX_REDACT_CHARS = 256 * 1024;

function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: { message, type: 'invalid_request_error' } });
}

function forbidden(res: Response, message: string): void {
  res.status(403).json({ error: { message, type: 'permission_error' } });
}

/** Ingestion and search reach a provider, so they fail in more ways than a
 *  validation error. Surface the status the service chose. */
function sendRagError(res: Response, error: unknown): void {
  const status = error instanceof RagError ? error.status
    : error instanceof EmbeddingsError ? error.status
    : 500;
  const message = error instanceof Error ? error.message : 'document request failed.';
  res.status(status).json({ error: { message, type: 'invalid_request_error' } });
}

/** A JSON object — not null, not an array. Array bodies reaching a kernel that
 *  expects a record surface as `Cannot read properties of undefined`, which
 *  tells the caller nothing about what to fix. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Every element of `value` must be a plain object.
 *
 * The kernels iterate these arrays and read fields off each entry, so a `null`
 * or a bare string inside an otherwise well-formed array throws a TypeError
 * deep inside the kernel. We still answer 400 in that case (the handlers catch
 * it), but the message leaks an internal property name — "Cannot read
 * properties of null (reading 'taskId')" — instead of naming the bad index.
 */
function badElementIndex(value: readonly unknown[]): number {
  return value.findIndex((entry) => !isPlainObject(entry));
}

/**
 * The run context carries the repair budget the state machine enforces
 * (invariant I4: `repairAttempts >= maxRepairAttempts` stops the run). A
 * caller-supplied context was previously merged in unchecked, so
 * `{"repairAttempts": "not-a-number"}` produced a NaN comparison that is
 * always false — silently disabling the budget guard. Validate the shape
 * before it can reach the kernel.
 */
const RUN_CONTEXT_NUMBERS = ['repairAttempts', 'maxRepairAttempts'] as const;
const RUN_CONTEXT_BOOLEANS = [
  'planApproved',
  'deployApproved',
  'securityGatePassed',
  'verifyPassed',
] as const;

function validateRunContext(raw: Record<string, unknown>): string | null {
  for (const field of RUN_CONTEXT_NUMBERS) {
    const v = raw[field];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
      return `"context.${field}" must be a non-negative integer.`;
    }
  }
  for (const field of RUN_CONTEXT_BOOLEANS) {
    const v = raw[field];
    if (v !== undefined && typeof v !== 'boolean') {
      return `"context.${field}" must be a boolean.`;
    }
  }
  if (raw.blockReason !== undefined && typeof raw.blockReason !== 'string') {
    return '"context.blockReason" must be a string.';
  }
  const attempts = raw.repairAttempts;
  const max = raw.maxRepairAttempts;
  if (typeof attempts === 'number' && typeof max === 'number' && attempts > max) {
    return '"context.repairAttempts" cannot exceed "context.maxRepairAttempts".';
  }
  return null;
}

/** GET /api/agent/modes — the three compute modes and their full profiles. */
agentRouter.get('/modes', (_req: Request, res: Response) => {
  res.json({
    modes: COMPUTE_MODES.map((mode) => {
      const profile = resolveMode(mode);
      return { mode, profile, descriptionFa: describeModeFa(profile) };
    }),
  });
});

/** GET /api/agent/modes/:mode — one resolved mode profile. */
agentRouter.get('/modes/:mode', (req: Request, res: Response) => {
  const mode = req.params.mode;
  if (!isComputeMode(mode)) {
    badRequest(res, `unknown compute mode "${mode}". Expected one of: ${COMPUTE_MODES.join(', ')}.`);
    return;
  }
  const profile = resolveMode(mode);
  res.json({ mode, profile, descriptionFa: describeModeFa(profile) });
});

/**
 * POST /api/agent/modes/validate — pre-flight a mode choice.
 * Body: { mode, privacyLevel, hasLocalRuntime, hasPaidAccess }
 */
agentRouter.post('/modes/validate', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const mode = body.mode;
  if (!isComputeMode(mode)) {
    badRequest(res, `"mode" must be one of: ${COMPUTE_MODES.join(', ')}.`);
    return;
  }
  const privacyLevel = typeof body.privacyLevel === 'string' ? body.privacyLevel : 'internal';
  if (!['public', 'internal', 'private', 'confidential'].includes(privacyLevel)) {
    badRequest(res, '"privacyLevel" must be public, internal, private or confidential.');
    return;
  }

  res.json(
    validateModeSelection({
      mode: mode as ComputeMode,
      privacyLevel: privacyLevel as 'public' | 'internal' | 'private' | 'confidential',
      hasLocalRuntime: body.hasLocalRuntime === true,
      hasPaidAccess: body.hasPaidAccess === true,
    }),
  );
});

/**
 * POST /api/agent/route — ask the kernel which provider may run a job.
 * Body: { request: ModelRouteRequest, providers: ModelProviderCapability[], mode?, maxFallbacks? }
 *
 * Returns the chosen provider, the ordered fallbacks, and — importantly — the
 * list of rejected candidates with the reason each was dropped, so a UI can
 * answer "why not this provider?" instead of silently falling back.
 */
agentRouter.post('/route', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const request = body.request;
  const providers = body.providers;

  if (!isPlainObject(request)) {
    badRequest(res, '"request" must be a ModelRouteRequest object.');
    return;
  }
  if (!Array.isArray(providers)) {
    badRequest(res, '"providers" must be an array of ModelProviderCapability objects.');
    return;
  }
  if (providers.length > MAX_BODY_ITEMS) {
    badRequest(res, `"providers" may not exceed ${MAX_BODY_ITEMS} entries.`);
    return;
  }
  const badProvider = badElementIndex(providers);
  if (badProvider !== -1) {
    badRequest(res, `"providers[${badProvider}]" must be a ModelProviderCapability object.`);
    return;
  }
  if (body.mode !== undefined && !isComputeMode(body.mode)) {
    badRequest(res, `"mode" must be one of: ${COMPUTE_MODES.join(', ')}.`);
    return;
  }
  if (
    body.maxFallbacks !== undefined &&
    (typeof body.maxFallbacks !== 'number' ||
      !Number.isInteger(body.maxFallbacks) ||
      body.maxFallbacks < 0 ||
      body.maxFallbacks > MAX_BODY_ITEMS)
  ) {
    badRequest(res, `"maxFallbacks" must be an integer between 0 and ${MAX_BODY_ITEMS}.`);
    return;
  }

  try {
    const result = routeModel(request as never, {
      providers: providers as never,
      ...(body.mode === undefined ? {} : { mode: body.mode as ComputeMode }),
      ...(typeof body.maxFallbacks === 'number' ? { maxFallbacks: body.maxFallbacks } : {}),
    });
    res.json(result);
  } catch (err) {
    badRequest(res, err instanceof Error ? err.message : 'routing failed');
  }
});

/**
 * POST /api/agent/policy/tool-call — may this tool call run, and does it need
 * human approval? Body: { call: ToolCallRequest, ...options }
 */
agentRouter.post('/policy/tool-call', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const call = body.call;
  const rawContext = body.context;

  if (!isPlainObject(call)) {
    badRequest(res, '"call" must be a ToolCallRequest object.');
    return;
  }
  if (typeof call.tool !== 'string') {
    badRequest(res, '"call.tool" must be a string, e.g. "git.push".');
    return;
  }
  if (call.grantedScopes !== undefined && !Array.isArray(call.grantedScopes)) {
    badRequest(res, '"call.grantedScopes" must be an array of strings.');
    return;
  }
  if (!isPlainObject(rawContext)) {
    badRequest(res, '"context" must be a PolicyContext object.');
    return;
  }
  if (
    rawContext.protectedBranches !== undefined &&
    !Array.isArray(rawContext.protectedBranches)
  ) {
    badRequest(res, '"context.protectedBranches" must be an array of branch names.');
    return;
  }

  // Built exactly the way /tools/invoke builds it, and for the same reason.
  //
  // This endpoint used to spread the request's context over restrictive
  // defaults, which meant a caller could answer its own question: sending
  // `protectedBranches: []` turned a denied commit to `main` into an allowed
  // one, and `approverUserId` could be set to anything. That made this a
  // simulator of the policy rather than a preview of it, while the docs
  // promised the driver obeys "exactly the rules /policy/tool-call reports".
  //
  // Authority fields (protected branches, working branch, the approver
  // identity, the autonomy ceiling) come from configuration and the session.
  // Non-authority fields the caller may legitimately vary -- privacy level,
  // disabled capabilities -- are still honoured.
  const sessionEmail = (req as Request & { user?: { email?: string } }).user?.email;
  const ctx = buildPolicyContext({
    sessionEmail,
    requested: rawContext as Record<string, unknown>,
  });

  // Scopes too: asserting `repository:write` in the body must not make the
  // preview say yes when the deployment does not hold that scope. A caller
  // may narrow the set for a hypothetical call, never widen it.
  const previewed = {
    ...(call as Record<string, unknown>),
    grantedScopes: resolveScopes(call.grantedScopes),
  };

  try {
    res.json(evaluateToolCall(previewed as never, ctx as never));
  } catch (err) {
    badRequest(res, err instanceof Error ? err.message : 'policy evaluation failed');
  }
});

/**
 * POST /api/agent/policy/egress — may this content leave the machine?
 * Body: { privacyLevel, providerLocality, providerMayTrainOnInput,
 *         hasUnredactedSecrets, userConsentedToCloud, computeMode? }
 */
agentRouter.post('/policy/egress', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const privacyLevel = typeof body.privacyLevel === 'string' ? body.privacyLevel : 'internal';
  const providerLocality = body.providerLocality;

  if (!['public', 'internal', 'private', 'confidential'].includes(privacyLevel)) {
    badRequest(res, '"privacyLevel" must be public, internal, private or confidential.');
    return;
  }
  if (providerLocality !== 'local' && providerLocality !== 'cloud') {
    badRequest(res, '"providerLocality" must be "local" or "cloud".');
    return;
  }
  if (body.computeMode !== undefined && !isComputeMode(body.computeMode)) {
    badRequest(res, `"computeMode" must be one of: ${COMPUTE_MODES.join(', ')}.`);
    return;
  }

  try {
    res.json(
      evaluateEgress({
        privacyLevel: privacyLevel as never,
        providerLocality,
        providerMayTrainOnInput: body.providerMayTrainOnInput === true,
        hasUnredactedSecrets: body.hasUnredactedSecrets === true,
        userConsentedToCloud: body.userConsentedToCloud === true,
        ...(body.computeMode === undefined
          ? {}
          : { computeMode: body.computeMode as ComputeMode }),
      }),
    );
  } catch (err) {
    badRequest(res, err instanceof Error ? err.message : 'egress evaluation failed');
  }
});

/** GET /api/agent/states — the run state machine's vocabulary. */
agentRouter.get('/states', (_req: Request, res: Response) => {
  res.json({
    states: RUN_STATES,
    terminal: [...TERMINAL_STATES],
    initialState: RUN_STATES[0],
    initialContext: initialContext(),
  });
});

/**
 * POST /api/agent/states/transition — apply one event to a run.
 * Body: { state: RunState, event: RunEvent, context?: RunContext }
 */
agentRouter.post('/states/transition', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const state = body.state;
  const event = body.event;

  if (typeof state !== 'string' || !RUN_STATES.includes(state as never)) {
    badRequest(res, `"state" must be one of: ${RUN_STATES.join(', ')}.`);
    return;
  }
  if (typeof event !== 'string') {
    badRequest(res, '"event" must be a RunEvent string.');
    return;
  }

  if (body.context !== undefined && !isPlainObject(body.context)) {
    badRequest(res, '"context" must be a RunContext object.');
    return;
  }
  const contextProblem = isPlainObject(body.context) ? validateRunContext(body.context) : null;
  if (contextProblem) {
    badRequest(res, contextProblem);
    return;
  }

  const context = isPlainObject(body.context)
    ? { ...initialContext(), ...body.context }
    : initialContext();

  try {
    res.json(transition(state as never, event as never, context as never));
  } catch (err) {
    badRequest(res, err instanceof Error ? err.message : 'transition failed');
  }
});

/**
 * POST /api/agent/dag/validate — validate a task graph and plan its waves.
 * Body: { tasks: AgentTask[] }
 */
agentRouter.post('/dag/validate', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const tasks = body.tasks;
  if (!Array.isArray(tasks)) {
    badRequest(res, '"tasks" must be an array of AgentTask objects.');
    return;
  }
  if (tasks.length > MAX_BODY_ITEMS) {
    badRequest(res, `"tasks" may not exceed ${MAX_BODY_ITEMS} entries.`);
    return;
  }
  const badTask = badElementIndex(tasks);
  if (badTask !== -1) {
    badRequest(res, `"tasks[${badTask}]" must be an AgentTask object.`);
    return;
  }

  try {
    const validation = validateDag(tasks as never);
    if (!validation.ok) {
      res.json({ validation, waves: null, conflicts: null });
      return;
    }
    const waves = computeWaves(tasks as never);
    res.json({
      validation,
      waves,
      conflicts: findWaveConflicts(tasks as never, waves),
    });
  } catch (err) {
    badRequest(res, err instanceof Error ? err.message : 'DAG validation failed');
  }
});

/**
 * POST /api/agent/redact — strip secrets from text or a structured payload.
 * Body: { text } or { payload }
 */
agentRouter.post('/redact', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body.text === 'string') {
    if (body.text.length > MAX_REDACT_CHARS) {
      badRequest(
        res,
        `"text" may not exceed ${MAX_REDACT_CHARS} characters; split it before redacting.`,
      );
      return;
    }
    res.json(redactSecrets(body.text));
    return;
  }
  if (body.payload !== undefined) {
    res.json({ payload: redactPayload(body.payload) });
    return;
  }
  badRequest(res, 'provide either "text" (string) or "payload" (any JSON value).');
});

/**
 * POST /api/agent/evidence/audit — decide whether a completion claim is
 * actually backed by evidence. The model may claim success; this says so.
 */
agentRouter.post('/evidence/audit', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const claim = body.claim ?? body;
  if (!isPlainObject(claim)) {
    badRequest(res, '"claim" must be a CompletionClaim object.');
    return;
  }
  if (typeof claim.taskStatus !== 'string') {
    badRequest(
      res,
      '"claim.taskStatus" is required (completed, blocked or failed).',
    );
    return;
  }
  for (const field of ['acceptanceCriteria', 'filesChanged', 'commandsExecuted', 'tests'] as const) {
    if (claim[field] !== undefined && !Array.isArray(claim[field])) {
      badRequest(res, `"claim.${field}" must be an array.`);
      return;
    }
  }
  try {
    res.json(auditCompletionClaim(claim as never));
  } catch (err) {
    badRequest(res, err instanceof Error ? err.message : 'claim audit failed');
  }
});

/** GET /api/agent/schemas — the registered output contracts. */
agentRouter.get('/schemas', (_req: Request, res: Response) => {
  res.json({ ids: SCHEMA_IDS, count: SCHEMAS.length });
});

/**
 * POST /api/agent/schemas/validate — validate data against a registered
 * contract. Body: { schemaId, data }
 */
agentRouter.post('/schemas/validate', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const schemaId = body.schemaId;
  if (typeof schemaId !== 'string') {
    badRequest(res, '"schemaId" must be one of the ids from GET /api/agent/schemas.');
    return;
  }
  try {
    res.json(validateAgainstSchema(schemaId, body.data));
  } catch (err) {
    badRequest(res, err instanceof Error ? err.message : 'schema validation failed');
  }
});

/** GET /api/agent/prompts — the versioned agent prompt library. */
agentRouter.get('/prompts', (_req: Request, res: Response) => {
  try {
    const prompts = listPromptFiles().map((file) => {
      const { meta } = parseFrontMatter(readPromptFile(file));
      return { file, meta };
    });
    res.json({ prompts, count: prompts.length });
  } catch (err) {
    res.status(500).json({
      error: {
        message: err instanceof Error ? err.message : 'failed to read prompt library',
        type: 'server_error',
      },
    });
  }
});

/**
 * POST /api/agent/prompts/:file/compose — render one prompt with its
 * variables resolved. Body: { vars: PromptVars }
 */
agentRouter.post('/prompts/:file/compose', (req: Request, res: Response) => {
  const file = req.params.file;
  if (typeof file !== 'string' || !/^\d\d-[a-z0-9-]+\.md$/.test(file)) {
    badRequest(res, 'prompt file must look like "05-coding-agent.md".');
    return;
  }
  if (!listPromptFiles().includes(file)) {
    res.status(404).json({ error: { message: `no such prompt: ${file}`, type: 'not_found' } });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const vars = typeof body.vars === 'object' && body.vars !== null ? body.vars : {};
  try {
    res.json(composePrompt(file, vars as never));
  } catch (err) {
    badRequest(res, err instanceof Error ? err.message : 'prompt composition failed');
  }
});

/* ------------------------------------------------------------------ *
 * Memory — durable, tenant-scoped recall
 *
 * The kernel's memory module ranks records but stores none. These endpoints
 * add the storage half (server/src/services/agent-memory.ts) so facts learned
 * in one run are still there for the next one. Validation stays with the
 * kernel: secret-like content and missing provenance are refused there.
 * ------------------------------------------------------------------ */

const MEMORY_KINDS = ['project_fact', 'run_summary', 'user_preference', 'decision'] as const;
const MEMORY_TRUST = ['untrusted', 'observed', 'verified'] as const;
const MEMORY_SOURCE_TYPES = ['user', 'tool', 'model', 'test'] as const;
/** Long enough for a design decision, short enough that one write cannot bloat
 *  the row store or make the JS-side scorer walk a megabyte per candidate. */
const MAX_MEMORY_CHARS = 8 * 1024;
const MAX_MEMORY_TAGS = 32;

/**
 * Both identifiers scope every read and write, so an empty one would silently
 * merge tenants into a shared bucket — and a *believed* one lets a caller read
 * another tenant's data. The body may name the scope, because a user can
 * belong to several; membership decides whether they get it.
 *
 * Returns the resolved scope (including the caller's role) or a failure with
 * the status to send. Callers must pass the authenticated user, never an id
 * from the request.
 */
function readScope(
  req: Request,
  body: Record<string, unknown>,
): Scope | ScopeFailure {
  const userId = (req as Request & { user?: { userId?: number } }).user?.userId;
  if (typeof userId !== 'number') {
    // requireAuth is mounted in front of this router, so this is a wiring
    // error rather than a reachable request. Fail closed regardless.
    return { status: 403, message: 'authentication is required.' };
  }
  return resolveScope(userId, body);
}

/** Send whichever refusal `readScope` produced. */
function sendScopeFailure(res: Response, failure: ScopeFailure): void {
  res
    .status(failure.status)
    .json({ error: { message: failure.message, type: 'invalid_request_error' } });
}

/** Express types route params as `string | string[]`. Every id below is a
 *  single path segment, so anything else is a malformed request. */
function pathParam(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** The authenticated user id, or null if the auth middleware is not mounted. */
function callerId(req: Request): number | null {
  const userId = (req as Request & { user?: { userId?: number } }).user?.userId;
  return typeof userId === 'number' ? userId : null;
}

/**
 * Authorise a caller against a record they named by id.
 *
 * The scoped routes take `organizationId` in the body and go through
 * `resolveScope`. The by-id routes cannot: the caller supplies only a run or
 * job id, and the organisation is a property of the *stored record*. Without
 * this, "knowing the id" was the entire authorisation model — and a run id
 * leaks through logs, screenshots, support tickets and `/runs/resumable`.
 *
 * The failure is a 404 rather than a 403, matching `resolveScope`: telling a
 * stranger that a run exists but is not theirs confirms the id is real.
 *
 * `write` distinguishes reading a record from driving it. A viewer may look
 * at a run; advancing, approving or cancelling one needs write.
 */
/**
 * Resolve the caller to a *worker* identity for the queue-runner endpoints.
 *
 * These three routes (claim / complete / fail) are not tenant routes: a worker
 * legitimately handles jobs from every organisation, so `authorizeRecord` is
 * the wrong check. What they need is proof the caller is a worker at all.
 *
 * The workerId comes from the matched credential, never from the request body,
 * so a worker cannot rename itself into another worker's lease.
 *
 * Failures are 401, not 404: unlike a record id, the existence of the queue is
 * not a secret, and an operator debugging a misconfigured runner needs to be
 * able to tell "wrong token" from "no such route".
 */
function authorizeWorker(req: Request, res: Response): string | null {
  const header = req.headers['x-agent-worker-token'];
  const presented = typeof header === 'string' ? header : undefined;
  const result = authenticateWorker(presented);
  if (result.ok) return result.worker.workerId;

  if (result.reason === 'not_configured') {
    // Fail closed. An operator who has not configured workers gets a queue
    // nothing can drain, which is visible; the alternative is a queue anyone
    // can drain, which is not.
    res.status(503).json({
      error: {
        message:
          'worker endpoints are disabled: no worker credentials are configured (set AGENT_WORKER_TOKENS).',
        type: 'not_configured',
      },
    });
    return null;
  }
  res.status(401).json({
    error: {
      message: 'a valid X-Agent-Worker-Token header is required for worker endpoints.',
      type: 'authentication_error',
    },
  });
  return null;
}

function authorizeRecord(
  req: Request,
  res: Response,
  record: { organizationId: string } | null,
  what: string,
  id: string,
  options: { write?: boolean } = {},
): boolean {
  const notFound = (): boolean => {
    res.status(404).json({ error: { message: `no such ${what}: ${id}`, type: 'not_found' } });
    return false;
  };

  if (!record) return notFound();

  const userId = callerId(req);
  if (userId === null) {
    forbidden(res, 'authentication is required.');
    return false;
  }

  const role = membershipRole(userId, record.organizationId);
  if (role === null) return notFound();

  if (options.write === true && !canWrite(role)) {
    forbidden(res, `role "${role}" cannot modify a ${what}.`);
    return false;
  }
  return true;
}

/**
 * GET /api/agent/organizations — the scopes this caller may act in.
 *
 * A client needs this before it can send a scoped request at all, and it
 * doubles as the honest answer to "what am I allowed to see": the list is
 * built from membership, so it never mentions an organisation the caller is
 * not in.
 *
 * A first-run install has no organisation yet, so the first call creates the
 * default one rather than returning an empty list the UI cannot act on.
 */
agentRouter.get('/organizations', (req: Request, res: Response) => {
  const userId = callerId(req);
  if (userId === null) {
    forbidden(res, 'authentication is required.');
    return;
  }
  if (listOrganizations(userId).length === 0) {
    ensureDefaultOrganization(userId);
  }
  const organizations = listOrganizations(userId).map((org) => ({
    ...org,
    projects: listProjects(org.organizationId),
  }));
  res.json({ organizations });
});

/**
 * Resolve an administrable organisation for the caller, or send the refusal.
 *
 * Returns null when it has already answered, so callers just `return`.
 */
function requireAdmin(req: Request, res: Response): { userId: number; organizationId: string; role: Role } | null {
  const userId = callerId(req);
  if (userId === null) {
    forbidden(res, 'authentication is required.');
    return null;
  }
  const organizationId = pathParam(req.params.organizationId);
  if (organizationId === null) {
    badRequest(res, 'organizationId is required.');
    return null;
  }
  const role = membershipRole(userId, organizationId);
  if (role === null) {
    res.status(404).json({
      error: { message: `organization "${organizationId}" was not found.`, type: 'invalid_request_error' },
    });
    return null;
  }
  if (!canAdminister(role)) {
    forbidden(res, `role "${role}" may not manage this organization.`);
    return null;
  }
  return { userId, organizationId, role };
}

/**
 * The kernel marks owner and admin grants `requiresMfa`. This deployment has
 * no MFA, so the closest honest equivalent is the re-auth header the keys
 * export already uses: prove the password again before handing out an
 * elevated role. Calling it MFA would be a lie; skipping it would ignore the
 * rule.
 */
function elevatedRoleNeedsReauth(req: Request, res: Response, role: unknown): boolean {
  if (role !== 'owner' && role !== 'admin') return false;
  const email = (req as Request & { user?: { email?: string } }).user?.email;
  const password = req.headers['x-reauth-password'];
  if (typeof email !== 'string' || typeof password !== 'string' || !verifyCredentials(email, password)) {
    res.status(403).json({
      error: {
        message: 'Granting owner or admin requires re-entering your password (x-reauth-password).',
        type: 'authentication_error',
      },
    });
    return true;
  }
  return false;
}

/** GET /api/agent/organizations/:organizationId/members */
agentRouter.get('/organizations/:organizationId/members', (req: Request, res: Response) => {
  const ctx = requireAdmin(req, res);
  if (ctx === null) return;
  res.json({
    members: listMembers(ctx.organizationId),
    invites: listInvites(ctx.organizationId).map((invite) => ({
      inviteId: invite.inviteId,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      acceptedAt: invite.acceptedAt,
    })),
  });
});

/**
 * POST /api/agent/organizations/:organizationId/invites
 *
 * Returns the token once. It is stored only as a hash, so it cannot be shown
 * again — an inviter who loses it revokes and re-invites.
 */
agentRouter.post('/organizations/:organizationId/invites', (req: Request, res: Response) => {
  const ctx = requireAdmin(req, res);
  if (ctx === null) return;
  const body = req.body;
  if (!isPlainObject(body)) {
    badRequest(res, 'request body must be a JSON object.');
    return;
  }
  if (elevatedRoleNeedsReauth(req, res, body.role)) return;

  const result = createInvite({
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    email: body.email,
    role: body.role,
    ...(typeof body.ttlMs === 'number' ? { ttlMs: body.ttlMs } : {}),
  });
  if (isInviteFailure(result)) {
    res.status(result.status).json({ error: { message: result.message, type: 'invalid_request_error' } });
    return;
  }
  res.status(201).json({
    invite: {
      inviteId: result.invite.inviteId,
      email: result.invite.email,
      role: result.invite.role,
      expiresAt: result.invite.expiresAt,
    },
    // Shown once, never again.
    token: result.token,
  });
});

/** DELETE /api/agent/organizations/:organizationId/invites/:inviteId */
agentRouter.delete('/organizations/:organizationId/invites/:inviteId', (req: Request, res: Response) => {
  const ctx = requireAdmin(req, res);
  if (ctx === null) return;
  const inviteId = pathParam(req.params.inviteId);
  if (inviteId === null) {
    badRequest(res, 'inviteId is required.');
    return;
  }
  if (!revokeInvite({ organizationId: ctx.organizationId, inviteId })) {
    res.status(404).json({
      error: { message: 'no pending invite with that id.', type: 'invalid_request_error' },
    });
    return;
  }
  res.json({ revoked: true });
});

/** PATCH /api/agent/organizations/:organizationId/members/:userId — change a role. */
agentRouter.patch('/organizations/:organizationId/members/:userId', (req: Request, res: Response) => {
  const ctx = requireAdmin(req, res);
  if (ctx === null) return;
  const subject = Number(pathParam(req.params.userId));
  if (!Number.isInteger(subject)) {
    badRequest(res, 'userId must be an integer.');
    return;
  }
  const body = req.body;
  if (!isPlainObject(body)) {
    badRequest(res, 'request body must be a JSON object.');
    return;
  }
  if (elevatedRoleNeedsReauth(req, res, body.role)) return;

  const result = changeRole({
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    subjectUserId: subject,
    nextRole: body.role,
  });
  if (isInviteFailure(result)) {
    res.status(result.status).json({ error: { message: result.message, type: 'invalid_request_error' } });
    return;
  }
  res.json({ userId: subject, role: result.role });
});

/** DELETE /api/agent/organizations/:organizationId/members/:userId */
agentRouter.delete('/organizations/:organizationId/members/:userId', (req: Request, res: Response) => {
  const ctx = requireAdmin(req, res);
  if (ctx === null) return;
  const subject = Number(pathParam(req.params.userId));
  if (!Number.isInteger(subject)) {
    badRequest(res, 'userId must be an integer.');
    return;
  }
  const result = removeMember({ organizationId: ctx.organizationId, subjectUserId: subject });
  if (isInviteFailure(result)) {
    res.status(result.status).json({ error: { message: result.message, type: 'invalid_request_error' } });
    return;
  }
  res.json({ removed: true });
});

/** POST /api/agent/organizations/:organizationId/projects — add a project. */
agentRouter.post('/organizations/:organizationId/projects', (req: Request, res: Response) => {
  const userId = callerId(req);
  if (userId === null) {
    forbidden(res, 'authentication is required.');
    return;
  }
  const organizationId = pathParam(req.params.organizationId);
  if (organizationId === null) {
    badRequest(res, 'organizationId is required.');
    return;
  }
  const role = membershipRole(userId, organizationId);
  if (role === null) {
    // Same wording as a missing organisation, so this cannot be used to probe
    // which organisations exist.
    res
      .status(404)
      .json({ error: { message: `organization "${organizationId}" was not found.`, type: 'invalid_request_error' } });
    return;
  }
  if (!canAdminister(role)) {
    forbidden(res, `role "${role}" may not create projects.`);
    return;
  }

  const body = req.body;
  if (!isPlainObject(body)) {
    badRequest(res, 'request body must be a JSON object.');
    return;
  }
  const projectId = body.projectId;
  if (!isValidIdentifier(projectId)) {
    badRequest(
      res,
      '"projectId" must be lowercase letters, digits, hyphen or underscore (max 63 characters).',
    );
    return;
  }
  if (projectExists(organizationId, projectId)) {
    res
      .status(409)
      .json({ error: { message: `project "${projectId}" already exists.`, type: 'invalid_request_error' } });
    return;
  }
  const name = typeof body.name === 'string' && body.name.trim() !== '' ? body.name.trim() : projectId;

  createProject({ organizationId, projectId, name });
  res.status(201).json({ organizationId, projectId, name });
});

/**
 * POST /api/agent/documents — ingest a document and make it searchable.
 *
 * Embedding happens before any row is written, so a provider outage leaves no
 * half-ingested document behind.
 */
agentRouter.post('/documents', async (req: Request, res: Response) => {
  const body = req.body;
  if (!isPlainObject(body)) {
    badRequest(res, 'request body must be a JSON object.');
    return;
  }
  const scope = readScope(req, body);
  if (isScopeFailure(scope)) {
    sendScopeFailure(res, scope);
    return;
  }
  if (!canWrite(scope.role)) {
    forbidden(res, `role "${scope.role}" may not write in this project.`);
    return;
  }

  try {
    const result = await ingestDocument({
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      title: typeof body.title === 'string' ? body.title : '',
      content: typeof body.content === 'string' ? body.content : '',
      ...(typeof body.sourceUri === 'string' ? { sourceUri: body.sourceUri } : {}),
      ...(typeof body.model === 'string' ? { model: body.model } : {}),
      ...(isPlainObject(body.chunking) ? { chunking: body.chunking as Record<string, number> } : {}),
    });
    res.status(result.deduplicated ? 200 : 201).json(result);
  } catch (error) {
    sendRagError(res, error);
  }
});

/** GET /api/agent/documents?organizationId=&projectId= */
agentRouter.get('/documents', (req: Request, res: Response) => {
  const scope = readScope(req, req.query as Record<string, unknown>);
  if (isScopeFailure(scope)) {
    sendScopeFailure(res, scope);
    return;
  }
  res.json({ documents: listDocuments(scope.organizationId, scope.projectId) });
});

/** DELETE /api/agent/documents/:documentId?organizationId=&projectId= */
agentRouter.delete('/documents/:documentId', (req: Request, res: Response) => {
  const scope = readScope(req, req.query as Record<string, unknown>);
  if (isScopeFailure(scope)) {
    sendScopeFailure(res, scope);
    return;
  }
  if (!canWrite(scope.role)) {
    forbidden(res, `role "${scope.role}" may not write in this project.`);
    return;
  }
  const documentId = pathParam(req.params.documentId);
  if (documentId === null) {
    badRequest(res, 'documentId is required.');
    return;
  }
  if (!deleteDocument({ organizationId: scope.organizationId, projectId: scope.projectId, documentId })) {
    res.status(404).json({ error: { message: 'no such document.', type: 'invalid_request_error' } });
    return;
  }
  res.json({ deleted: true });
});

/**
 * POST /api/agent/documents/search — retrieve passages, with citations.
 *
 * Every hit carries the document it came from and the character offsets within
 * it, so the quote can be checked against the source rather than trusted.
 */
agentRouter.post('/documents/search', async (req: Request, res: Response) => {
  const body = req.body;
  if (!isPlainObject(body)) {
    badRequest(res, 'request body must be a JSON object.');
    return;
  }
  const scope = readScope(req, body);
  if (isScopeFailure(scope)) {
    sendScopeFailure(res, scope);
    return;
  }

  try {
    const result = await searchDocuments({
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      query: typeof body.query === 'string' ? body.query : '',
      ...(typeof body.limit === 'number' ? { limit: body.limit } : {}),
      ...(typeof body.tokenBudget === 'number' ? { tokenBudget: body.tokenBudget } : {}),
      ...(typeof body.minScore === 'number' ? { minScore: body.minScore } : {}),
      ...(typeof body.model === 'string' ? { model: body.model } : {}),
      // Passed through unvalidated on purpose: searchDocuments rejects an
      // unknown mode with a RagError that becomes a 400, so validating here
      // too would mean two places to keep in step and one of them would rot.
      ...(body.mode === undefined ? {} : { mode: body.mode as 'vector' | 'keyword' | 'hybrid' }),
    });
    res.json(result);
  } catch (error) {
    sendRagError(res, error);
  }
});

/**
 * GET /api/agent/documents/citations/:chunkId — re-read a citation from source.
 *
 * This is what makes a citation checkable: it slices the stored document at
 * the offsets the citation claims, and reports whether that still matches the
 * chunk text.
 */
agentRouter.get('/documents/citations/:chunkId', (req: Request, res: Response) => {
  const scope = readScope(req, req.query as Record<string, unknown>);
  if (isScopeFailure(scope)) {
    sendScopeFailure(res, scope);
    return;
  }
  const chunkId = pathParam(req.params.chunkId);
  if (chunkId === null) {
    badRequest(res, 'chunkId is required.');
    return;
  }
  const resolved = resolveCitation({
    organizationId: scope.organizationId,
    projectId: scope.projectId,
    chunkId,
  });
  if (resolved === null) {
    res.status(404).json({ error: { message: 'no such citation.', type: 'invalid_request_error' } });
    return;
  }
  res.json(resolved);
});

/** POST /api/agent/memory — store one fact. */
agentRouter.post('/memory', (req: Request, res: Response) => {
  const body = req.body;
  if (!isPlainObject(body)) {
    badRequest(res, 'request body must be a JSON object.');
    return;
  }
  const scope = readScope(req, body);
  if (isScopeFailure(scope)) {
    sendScopeFailure(res, scope);
    return;
  }
  if (!canWrite(scope.role)) {
    forbidden(res, `role "${scope.role}" may not write in this project.`);
    return;
  }

  const { kind, content, trust, source, tags, ttlMs } = body;
  if (typeof kind !== 'string' || !(MEMORY_KINDS as readonly string[]).includes(kind)) {
    badRequest(res, `"kind" must be one of: ${MEMORY_KINDS.join(', ')}.`);
    return;
  }
  if (typeof content !== 'string' || content.trim() === '') {
    badRequest(res, '"content" must be a non-empty string.');
    return;
  }
  if (content.length > MAX_MEMORY_CHARS) {
    badRequest(res, `"content" must be at most ${MAX_MEMORY_CHARS} characters.`);
    return;
  }
  if (typeof trust !== 'string' || !(MEMORY_TRUST as readonly string[]).includes(trust)) {
    badRequest(res, `"trust" must be one of: ${MEMORY_TRUST.join(', ')}.`);
    return;
  }
  if (!isPlainObject(source)) {
    badRequest(res, '"source" must be an object with sourceType, sourceId and evidenceHash.');
    return;
  }
  if (
    typeof source.sourceType !== 'string' ||
    !(MEMORY_SOURCE_TYPES as readonly string[]).includes(source.sourceType)
  ) {
    badRequest(res, `"source.sourceType" must be one of: ${MEMORY_SOURCE_TYPES.join(', ')}.`);
    return;
  }
  if (typeof source.sourceId !== 'string' || source.sourceId.trim() === '') {
    badRequest(res, '"source.sourceId" must be a non-empty string.');
    return;
  }
  if (typeof source.evidenceHash !== 'string' || source.evidenceHash.trim() === '') {
    badRequest(res, '"source.evidenceHash" must be a non-empty string.');
    return;
  }
  if (tags !== undefined) {
    if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string')) {
      badRequest(res, '"tags" must be an array of strings.');
      return;
    }
    if (tags.length > MAX_MEMORY_TAGS) {
      badRequest(res, `"tags" must contain at most ${MAX_MEMORY_TAGS} entries.`);
      return;
    }
  }
  if (ttlMs !== undefined && (typeof ttlMs !== 'number' || !Number.isInteger(ttlMs) || ttlMs <= 0)) {
    badRequest(res, '"ttlMs" must be a positive integer.');
    return;
  }

  try {
    const result = remember({
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      kind: kind as MemoryKind,
      content,
      trust: trust as MemoryTrust,
      source: {
        sourceType: source.sourceType as MemorySource['sourceType'],
        sourceId: source.sourceId,
        evidenceHash: source.evidenceHash,
      },
      ...(tags === undefined ? {} : { tags: tags as string[] }),
      ...(ttlMs === undefined ? {} : { ttlMs }),
    });
    res.status(result.created ? 201 : 200).json(result);
  } catch (err) {
    // createMemoryRecord throws on secret-like content and bad provenance —
    // that is a caller error, not a server fault.
    badRequest(res, err instanceof Error ? err.message : 'memory could not be stored');
  }
});

/** POST /api/agent/memory/query — recall ranked facts for a query. */
agentRouter.post('/memory/query', (req: Request, res: Response) => {
  const body = req.body;
  if (!isPlainObject(body)) {
    badRequest(res, 'request body must be a JSON object.');
    return;
  }
  const scope = readScope(req, body);
  if (isScopeFailure(scope)) {
    sendScopeFailure(res, scope);
    return;
  }
  if (!canWrite(scope.role)) {
    forbidden(res, `role "${scope.role}" may not write in this project.`);
    return;
  }

  const { query, maxResults, allowedTrust } = body;
  if (typeof query !== 'string' || query.trim() === '') {
    badRequest(res, '"query" must be a non-empty string.');
    return;
  }
  if (
    maxResults !== undefined &&
    (typeof maxResults !== 'number' || !Number.isInteger(maxResults) || maxResults < 1 || maxResults > 100)
  ) {
    badRequest(res, '"maxResults" must be an integer between 1 and 100.');
    return;
  }
  if (allowedTrust !== undefined) {
    if (
      !Array.isArray(allowedTrust) ||
      allowedTrust.length === 0 ||
      allowedTrust.some((t) => typeof t !== 'string' || !(MEMORY_TRUST as readonly string[]).includes(t))
    ) {
      badRequest(res, `"allowedTrust" must be a non-empty array of: ${MEMORY_TRUST.join(', ')}.`);
      return;
    }
  }

  try {
    const hits = recall({
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      query,
      ...(maxResults === undefined ? {} : { maxResults }),
      ...(allowedTrust === undefined ? {} : { allowedTrust: allowedTrust as MemoryTrust[] }),
    });
    res.json({ hits, count: hits.length });
  } catch (err) {
    badRequest(res, err instanceof Error ? err.message : 'memory query failed');
  }
});

/** GET /api/agent/memory/stats?organizationId=&projectId= */
agentRouter.get('/memory/stats', (req: Request, res: Response) => {
  const scope = readScope(req, req.query as Record<string, unknown>);
  if (isScopeFailure(scope)) {
    sendScopeFailure(res, scope);
    return;
  }
  res.json(memoryStats(scope.organizationId, scope.projectId));
});

/** DELETE /api/agent/memory/:memoryId?organizationId=&projectId= */
agentRouter.delete('/memory/:memoryId', (req: Request, res: Response) => {
  const scope = readScope(req, req.query as Record<string, unknown>);
  if (isScopeFailure(scope)) {
    sendScopeFailure(res, scope);
    return;
  }
  if (!canWrite(scope.role)) {
    forbidden(res, `role "${scope.role}" may not write in this project.`);
    return;
  }
  const memoryId = pathParam(req.params.memoryId);
  if (memoryId === null) {
    badRequest(res, 'memory id must be a single path segment.');
    return;
  }
  // Scoped delete: a memoryId from another tenant simply does not match.
  const deleted = forget(scope.organizationId, scope.projectId, memoryId);
  if (!deleted) {
    res.status(404).json({ error: { message: `no such memory: ${memoryId}`, type: 'not_found' } });
    return;
  }
  res.json({ deleted: true, memoryId });
});

/* ------------------------------------------------------------------ *
 * Scale — durable job queue
 *
 * The kernel's InMemoryJobQueue has the right semantics but loses in-flight
 * work on restart. These endpoints expose the SQLite-backed queue
 * (server/src/services/agent-jobs.ts), which keeps the kernel's policies and
 * adds persistence, multi-worker claims and lease recovery.
 * ------------------------------------------------------------------ */

const MAX_JOB_PAYLOAD_CHARS = 128 * 1024;

/** POST /api/agent/jobs — enqueue work. */
agentRouter.post('/jobs', (req: Request, res: Response) => {
  const body = req.body;
  if (!isPlainObject(body)) {
    badRequest(res, 'request body must be a JSON object.');
    return;
  }

  const { queue, organizationId, idempotencyKey, payload, runId, priority, maxAttempts, delayMs } = body;
  if (!isQueueName(queue)) {
    badRequest(res, `"queue" must be one of: ${QUEUE_NAMES.join(', ')}.`);
    return;
  }
  if (typeof organizationId !== 'string' || organizationId.trim() === '') {
    badRequest(res, '"organizationId" must be a non-empty string.');
    return;
  }
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
    badRequest(res, '"idempotencyKey" must be a non-empty string.');
    return;
  }
  if (payload === undefined) {
    badRequest(res, '"payload" is required.');
    return;
  }
  // Serialised size is what actually lands in the row.
  if (JSON.stringify(payload ?? null).length > MAX_JOB_PAYLOAD_CHARS) {
    badRequest(res, `"payload" must serialise to at most ${MAX_JOB_PAYLOAD_CHARS} characters.`);
    return;
  }
  if (runId !== undefined && (typeof runId !== 'string' || runId.trim() === '')) {
    badRequest(res, '"runId" must be a non-empty string when provided.');
    return;
  }
  if (delayMs !== undefined && (typeof delayMs !== 'number' || !Number.isInteger(delayMs) || delayMs < 0)) {
    badRequest(res, '"delayMs" must be a non-negative integer.');
    return;
  }

  try {
    const now = Date.now();
    const result = enqueue({
      queue,
      organizationId,
      idempotencyKey,
      payload,
      ...(runId === undefined ? {} : { runId }),
      ...(priority === undefined ? {} : { priority: priority as number }),
      ...(maxAttempts === undefined ? {} : { maxAttempts: maxAttempts as number }),
      ...(delayMs === undefined ? {} : { availableAt: now + delayMs }),
      now,
    });
    res.status(result.created ? 201 : 200).json(result);
  } catch (err) {
    badRequest(res, err instanceof Error ? err.message : 'job could not be enqueued');
  }
});

/** POST /api/agent/jobs/claim — lease jobs for a worker. */
agentRouter.post('/jobs/claim', (req: Request, res: Response) => {
  const body = req.body;
  if (!isPlainObject(body)) {
    badRequest(res, 'request body must be a JSON object.');
    return;
  }
  const { queue, limit } = body;
  if (!isQueueName(queue)) {
    badRequest(res, `"queue" must be one of: ${QUEUE_NAMES.join(', ')}.`);
    return;
  }
  // The worker names itself through its credential, not through the body.
  const workerId = authorizeWorker(req, res);
  if (workerId === null) return;
  if (limit !== undefined && (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 100)) {
    badRequest(res, '"limit" must be an integer between 1 and 100.');
    return;
  }

  try {
    const jobs = claimJobs(queue, workerId, limit === undefined ? {} : { limit });
    res.json({ jobs, count: jobs.length });
  } catch (err) {
    badRequest(res, err instanceof Error ? err.message : 'claim failed');
  }
});

/** POST /api/agent/jobs/:jobId/complete — report success. */
agentRouter.post('/jobs/:jobId/complete', (req: Request, res: Response) => {
  const jobId = pathParam(req.params.jobId);
  if (jobId === null) {
    badRequest(res, 'job id must be a single path segment.');
    return;
  }
  const workerId = authorizeWorker(req, res);
  if (workerId === null) return;
  try {
    // completeJob still checks the lease: being *a* worker is not enough, you
    // must be the worker holding this job.
    res.json({ job: completeJob(jobId, workerId) });
  } catch (err) {
    badRequest(res, err instanceof Error ? err.message : 'complete failed');
  }
});

/** POST /api/agent/jobs/:jobId/fail — report failure; retries or dead-letters. */
agentRouter.post('/jobs/:jobId/fail', (req: Request, res: Response) => {
  const body = req.body;
  if (!isPlainObject(body) || typeof body.error !== 'string' || body.error.trim() === '') {
    badRequest(res, '"error" must be a non-empty string describing the failure.');
    return;
  }
  const jobId = pathParam(req.params.jobId);
  if (jobId === null) {
    badRequest(res, 'job id must be a single path segment.');
    return;
  }
  const workerId = authorizeWorker(req, res);
  if (workerId === null) return;
  try {
    res.json({ job: failJob(jobId, workerId, body.error) });
  } catch (err) {
    badRequest(res, err instanceof Error ? err.message : 'fail failed');
  }
});

/** POST /api/agent/jobs/:jobId/cancel — stop a job that has not finished. */
agentRouter.post('/jobs/:jobId/cancel', (req: Request, res: Response) => {
  const jobId = pathParam(req.params.jobId);
  if (jobId === null) {
    badRequest(res, 'job id must be a single path segment.');
    return;
  }
  if (!authorizeRecord(req, res, getJob(jobId), 'job', jobId, { write: true })) return;
  try {
    res.json({ job: cancelJob(jobId) });
  } catch (err) {
    badRequest(res, err instanceof Error ? err.message : 'cancel failed');
  }
});

/** GET /api/agent/jobs/stats — queue depths plus the configured policies. */
agentRouter.get('/jobs/stats', (_req: Request, res: Response) => {
  res.json({ queues: queueStats(), policies: DEFAULT_QUEUE_POLICIES });
});

/** GET /api/agent/jobs/:jobId — inspect one job. */
agentRouter.get('/jobs/:jobId', (req: Request, res: Response) => {
  const jobId = pathParam(req.params.jobId);
  if (jobId === null) {
    badRequest(res, 'job id must be a single path segment.');
    return;
  }
  const job = getJob(jobId);
  if (!authorizeRecord(req, res, job, 'job', jobId)) return;
  res.json({ job });
});

/* ------------------------------------------------------------------ *
 * Runs — the agent execution loop
 *
 * The kernel decides; this drives. A run is a durable object with a state, a
 * budget and a hash-chained history, so it can be inspected, approved,
 * cancelled and resumed after a crash. See services/agent-runtime.ts.
 * ------------------------------------------------------------------ */

/** POST /api/agent/runs — start a run. */
agentRouter.post('/runs', (req: Request, res: Response) => {
  const body = req.body;
  if (!isPlainObject(body)) {
    badRequest(res, 'request body must be a JSON object.');
    return;
  }
  const scope = readScope(req, body);
  if (isScopeFailure(scope)) {
    sendScopeFailure(res, scope);
    return;
  }
  if (!canWrite(scope.role)) {
    forbidden(res, `role "${scope.role}" may not write in this project.`);
    return;
  }
  const { goal, mode } = body;
  if (typeof goal !== 'string' || goal.trim() === '') {
    badRequest(res, '"goal" must be a non-empty string.');
    return;
  }
  if (!isComputeMode(mode)) {
    badRequest(res, `"mode" must be one of: ${COMPUTE_MODES.join(', ')}.`);
    return;
  }

  try {
    const run = createRun({
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      goal,
      mode,
      ...(typeof body.privacyLevel === 'string' ? { privacyLevel: body.privacyLevel } : {}),
      ...(body.maxSteps === undefined ? {} : { maxSteps: body.maxSteps as number }),
      ...(body.maxTokens === undefined ? {} : { maxTokens: body.maxTokens as number }),
      ...(body.maxCost === undefined ? {} : { maxCost: body.maxCost as number }),
      ...(body.timeoutMs === undefined ? {} : { timeoutMs: body.timeoutMs as number }),
    });
    res.status(201).json({ run });
  } catch (err) {
    runError(res, err, 'run could not be created');
  }
});

/** Map an AgentRunError's own status (404 for unknown run) onto the response. */
function runError(res: Response, err: unknown, fallback: string): void {
  const status = err instanceof AgentRunError ? err.status : 400;
  const message = err instanceof Error ? err.message : fallback;
  res
    .status(status)
    .json({ error: { message, type: status === 404 ? 'not_found' : 'invalid_request_error' } });
}

/** GET /api/agent/runs?organizationId=&projectId= — list runs. */
agentRouter.get('/runs', (req: Request, res: Response) => {
  const scope = readScope(req, req.query as Record<string, unknown>);
  if (isScopeFailure(scope)) {
    sendScopeFailure(res, scope);
    return;
  }
  const rawState = req.query.state;
  if (rawState !== undefined && (typeof rawState !== 'string' || !RUN_STATES.includes(rawState as never))) {
    badRequest(res, `"state" must be one of: ${RUN_STATES.join(', ')}.`);
    return;
  }
  const runs = listRuns(scope.organizationId, scope.projectId, {
    ...(rawState === undefined ? {} : { state: rawState as never }),
  });
  res.json({ runs, count: runs.length });
});

/** GET /api/agent/runs/resumable — runs that were in flight when we last stopped. */
agentRouter.get('/runs/resumable', (req: Request, res: Response) => {
  const userId = callerId(req);
  if (userId === null) {
    forbidden(res, 'authentication is required.');
    return;
  }
  // Filtered by membership, not returned wholesale: this endpoint was the one
  // place a caller could harvest run ids belonging to other tenants, which is
  // what made the by-id routes worth attacking.
  const mine = new Set(listOrganizations(userId).map((org) => org.organizationId));
  const runs = resumableRuns().filter((run) => mine.has(run.organizationId));
  res.json({ runs, count: runs.length });
});

/** GET /api/agent/runs/:runId — one run. */
agentRouter.get('/runs/:runId', (req: Request, res: Response) => {
  const runId = pathParam(req.params.runId);
  if (runId === null) {
    badRequest(res, 'run id must be a single path segment.');
    return;
  }
  const run = getRun(runId);
  if (!authorizeRecord(req, res, run, 'run', runId)) return;
  res.json({ run });
});

/**
 * POST /api/agent/runs/:runId/step — advance the run by one event.
 *
 * A refused step is a 200 with `ok:false` and the kernel's reason, not a 4xx:
 * "that event is illegal here" is a legitimate answer about a healthy run, and
 * callers need the run state back alongside it.
 */
agentRouter.post('/runs/:runId/step', (req: Request, res: Response) => {
  const runId = pathParam(req.params.runId);
  if (runId === null) {
    badRequest(res, 'run id must be a single path segment.');
    return;
  }
  const body = req.body;
  if (!isPlainObject(body) || typeof body.event !== 'string') {
    badRequest(res, '"event" must be a RunEvent string.');
    return;
  }
  for (const field of ['tokensUsed', 'costUsed'] as const) {
    const v = body[field];
    if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)) {
      badRequest(res, `"${field}" must be a non-negative number.`);
      return;
    }
  }
  if (!authorizeRecord(req, res, getRun(runId), 'run', runId, { write: true })) return;

  try {
    res.json(
      step({
        runId,
        event: body.event as never,
        ...(body.payload === undefined ? {} : { payload: body.payload }),
        ...(body.tokensUsed === undefined ? {} : { tokensUsed: body.tokensUsed as number }),
        ...(body.costUsed === undefined ? {} : { costUsed: body.costUsed as number }),
      }),
    );
  } catch (err) {
    runError(res, err, 'step failed');
  }
});

/** POST /api/agent/runs/:runId/decision — approve or reject what it waits on. */
agentRouter.post('/runs/:runId/decision', (req: Request, res: Response) => {
  const runId = pathParam(req.params.runId);
  if (runId === null) {
    badRequest(res, 'run id must be a single path segment.');
    return;
  }
  const body = req.body;
  if (!isPlainObject(body) || typeof body.approved !== 'boolean') {
    badRequest(res, '"approved" must be a boolean.');
    return;
  }
  if (!authorizeRecord(req, res, getRun(runId), 'run', runId, { write: true })) return;
  try {
    res.json(decide(runId, body.approved));
  } catch (err) {
    runError(res, err, 'decision failed');
  }
});

/** POST /api/agent/runs/:runId/cancel — stop a run that has not finished. */
agentRouter.post('/runs/:runId/cancel', (req: Request, res: Response) => {
  const runId = pathParam(req.params.runId);
  if (runId === null) {
    badRequest(res, 'run id must be a single path segment.');
    return;
  }
  const body = isPlainObject(req.body) ? req.body : {};
  if (!authorizeRecord(req, res, getRun(runId), 'run', runId, { write: true })) return;
  try {
    const reason = typeof body.reason === 'string' && body.reason.trim() !== '' ? body.reason : undefined;
    res.json({ run: cancelRun(runId, reason) });
  } catch (err) {
    runError(res, err, 'cancel failed');
  }
});

/** GET /api/agent/runs/:runId/checkpoints — the run's full history. */
agentRouter.get('/runs/:runId/checkpoints', (req: Request, res: Response) => {
  const runId = pathParam(req.params.runId);
  if (runId === null) {
    badRequest(res, 'run id must be a single path segment.');
    return;
  }
  if (!authorizeRecord(req, res, getRun(runId), 'run', runId)) return;
  const checkpoints = getCheckpoints(runId);
  res.json({ checkpoints, count: checkpoints.length });
});

/** GET /api/agent/runs/:runId/verify — re-derive the hash chain. */
agentRouter.get('/runs/:runId/verify', (req: Request, res: Response) => {
  const runId = pathParam(req.params.runId);
  if (runId === null) {
    badRequest(res, 'run id must be a single path segment.');
    return;
  }
  if (!authorizeRecord(req, res, getRun(runId), 'run', runId)) return;
  res.json(verifyChain(runId));
});

/* ------------------------------------------------------------------ *
 * Driver — autonomous advancement
 *
 * The run loop advances on reported outcomes; the driver obtains those
 * outcomes from a model through this gateway's own pool. The kernel still
 * decides every transition — a model only answers a bounded question and the
 * driver maps that answer onto one legal event.
 * ------------------------------------------------------------------ */

/** POST /api/agent/runs/:runId/advance — drive the run automatically. */
agentRouter.post('/runs/:runId/advance', (req: Request, res: Response) => {
  const runId = pathParam(req.params.runId);
  if (runId === null) {
    badRequest(res, 'run id must be a single path segment.');
    return;
  }
  const body = isPlainObject(req.body) ? req.body : {};

  const maxSteps = body.maxSteps;
  if (
    maxSteps !== undefined &&
    (typeof maxSteps !== 'number' || !Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 100)
  ) {
    badRequest(res, '"maxSteps" must be an integer between 1 and 100.');
    return;
  }
  if (body.model !== undefined && (typeof body.model !== 'string' || body.model.trim() === '')) {
    badRequest(res, '"model" must be a non-empty string when provided.');
    return;
  }

  const maxToolCalls = body.maxToolCalls;
  if (
    maxToolCalls !== undefined &&
    (typeof maxToolCalls !== 'number' ||
      !Number.isInteger(maxToolCalls) ||
      maxToolCalls < 0 ||
      maxToolCalls > 20)
  ) {
    badRequest(res, '"maxToolCalls" must be an integer between 0 and 20.');
    return;
  }

  if (!authorizeRecord(req, res, getRun(runId), 'run', runId, { write: true })) return;

  const complete = gatewayCompletion({
    ...(typeof body.model === 'string' ? { model: body.model } : {}),
  });

  // Evidence gathering is opt-in per request. The workspace root itself is
  // still server configuration -- `useTools` only says whether to use it.
  const evidenceOptions =
    body.useTools === true
      ? {
          workspaceRoot: agentWorkspaceRoot(),
          ...(typeof maxToolCalls === 'number' ? { maxToolCalls } : {}),
        }
      : {};

  // `once: true` runs a single phase, which is the useful default for a UI
  // that wants to show each step; otherwise drive until a human is needed.
  const driving =
    body.once === true
      ? advance({
          runId,
          complete,
          ...evidenceOptions,
          ...(body.useMemory === false ? { useMemory: false } : {}),
        }).then(
          (result) => ({
            run: result.run,
            steps: [result],
            stopped: result.ok ? undefined : result.stopped,
            reason: result.reason,
          }),
        )
      : advanceUntil({
          runId,
          complete,
          ...evidenceOptions,
          ...(maxSteps === undefined ? {} : { maxSteps }),
          ...(body.useMemory === false ? { useMemory: false } : {}),
        });

  driving.then(
    (result) => res.json(result),
    (err: unknown) => {
      const status = err instanceof AgentDriverError ? err.status : 500;
      res.status(status).json({
        error: {
          message: err instanceof Error ? err.message : 'driver failed',
          type: status === 404 ? 'not_found' : 'server_error',
        },
      });
    },
  );
});

/** POST /api/agent/runs/:runId/remember — store what a finished run concluded. */
agentRouter.post('/runs/:runId/remember', (req: Request, res: Response) => {
  const runId = pathParam(req.params.runId);
  if (runId === null) {
    badRequest(res, 'run id must be a single path segment.');
    return;
  }
  if (!authorizeRecord(req, res, getRun(runId), 'run', runId, { write: true })) return;
  try {
    res.json(rememberOutcome(runId));
  } catch (err) {
    const status = err instanceof AgentDriverError ? err.status : 400;
    res.status(status).json({
      error: {
        message: err instanceof Error ? err.message : 'could not store the outcome',
        type: status === 404 ? 'not_found' : 'invalid_request_error',
      },
    });
  }
});

/* ------------------------------------------------------------------ *
 * Tools — how a run affects anything
 *
 * A phase can now decide *and* act. Every call passes the same gates:
 * registered name, schema, kernel policy, approval, timeout, audit row.
 * ------------------------------------------------------------------ */

/** GET /api/agent/tools — the catalogue, shaped for a tool-calling model. */
agentRouter.get('/tools', (_req: Request, res: Response) => {
  res.json({ tools: listTools() });
});

/** POST /api/agent/tools/invoke — run one tool call. */
agentRouter.post('/tools/invoke', (req: Request, res: Response) => {
  const body = isPlainObject(req.body) ? req.body : {};

  if (typeof body.tool !== 'string' || body.tool.trim() === '') {
    badRequest(res, '"tool" must be a non-empty string, e.g. "fs.read_file".');
    return;
  }
  if (body.args !== undefined && !isPlainObject(body.args)) {
    badRequest(res, '"args" must be an object.');
    return;
  }
  if (body.grantedScopes !== undefined && !Array.isArray(body.grantedScopes)) {
    badRequest(res, '"grantedScopes" must be an array of strings.');
    return;
  }
  if (body.policy !== undefined && !isPlainObject(body.policy)) {
    badRequest(res, '"policy" must be a PolicyContext object.');
    return;
  }
  const timeoutMs = body.timeoutMs;
  if (
    timeoutMs !== undefined &&
    (typeof timeoutMs !== 'number' || !Number.isInteger(timeoutMs) || timeoutMs < 1)
  ) {
    badRequest(res, '"timeoutMs" must be a positive integer.');
    return;
  }

  // The workspace root is server-side configuration, never a request field:
  // letting a caller name the root would make every confinement check moot.
  const workspaceRoot = agentWorkspaceRoot();

  // Likewise the authority half of the policy context. `protectedBranches` and
  // `approverUserId` are decided by configuration and the session, so a
  // request can neither un-protect a branch nor nominate itself as approver.
  const sessionEmail = (req as Request & { user?: { email?: string } }).user?.email;
  const policy = buildPolicyContext({
    sessionEmail,
    ...(isPlainObject(body.policy) ? { requested: body.policy } : {}),
  });

  invokeTool({
    tool: body.tool,
    args: (body.args as Record<string, unknown>) ?? {},
    organizationId: typeof body.organizationId === 'string' ? body.organizationId : 'default',
    projectId: typeof body.projectId === 'string' ? body.projectId : 'default',
    ...(typeof body.runId === 'string' ? { runId: body.runId } : {}),
    workspaceRoot,
    policy,
    // Granted by configuration, not by the request. A caller may narrow the
    // set for a single call, but asserting a scope the deployment does not
    // hold gets it nothing.
    grantedScopes: resolveScopes(body.grantedScopes),
    ...(typeof body.approvedBy === 'string' ? { approvedBy: body.approvedBy } : {}),
    ...(typeof timeoutMs === 'number' ? { timeoutMs } : {}),
  }).then(
    (result) => res.json(result),
    (err: unknown) => {
      const status = err instanceof ToolError ? err.status : 500;
      res.status(status).json({
        error: {
          message: err instanceof Error ? err.message : 'tool invocation failed',
          type: status >= 500 ? 'server_error' : 'invalid_request_error',
        },
      });
    },
  );
});

/** GET /api/agent/tools/calls — the audit trail. */
agentRouter.get('/tools/calls', (req: Request, res: Response) => {
  const limit = req.query.limit === undefined ? undefined : Number(req.query.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    badRequest(res, '"limit" must be a positive integer.');
    return;
  }
  // The audit trail is per-tenant. When organizationId was optional, omitting
  // it returned every tenant's tool calls -- including the redacted argument
  // previews -- to any authenticated user.
  const userId = callerId(req);
  if (userId === null) {
    forbidden(res, 'authentication is required.');
    return;
  }
  const organizationId = req.query.organizationId;
  if (typeof organizationId !== 'string' || organizationId.trim() === '') {
    badRequest(res, '"organizationId" is required.');
    return;
  }
  if (membershipRole(userId, organizationId.trim()) === null) {
    res.status(404).json({
      error: { message: `organization "${organizationId.trim()}" was not found.`, type: 'not_found' },
    });
    return;
  }

  res.json({
    calls: listToolCalls({
      organizationId: organizationId.trim(),
      ...(typeof req.query.projectId === 'string' ? { projectId: req.query.projectId } : {}),
      ...(typeof req.query.runId === 'string' ? { runId: req.query.runId } : {}),
      ...(typeof req.query.outcome === 'string' ? { outcome: req.query.outcome } : {}),
      ...(limit === undefined ? {} : { limit }),
    }),
  });
});
