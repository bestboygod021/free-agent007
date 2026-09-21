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

  // The kernel refuses to guess: an absent field must fail closed, so the
  // defaults here are the most restrictive ones (supervised autonomy, private
  // work, `main` protected).
  const ctx = {
    autonomy: 'supervised',
    privacyLevel: 'private',
    workingBranch: 'agent/work',
    protectedBranches: ['main'],
    approverUserId: 'unknown',
    ...(rawContext as Record<string, unknown>),
  };

  try {
    res.json(evaluateToolCall(call as never, ctx as never));
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

/** Both identifiers scope every read and write, so an empty one would silently
 *  merge tenants into a shared bucket. Require them explicitly. */
function readScope(body: Record<string, unknown>): { organizationId: string; projectId: string } | string {
  const organizationId = body.organizationId;
  const projectId = body.projectId;
  if (typeof organizationId !== 'string' || organizationId.trim() === '') {
    return '"organizationId" must be a non-empty string.';
  }
  if (typeof projectId !== 'string' || projectId.trim() === '') {
    return '"projectId" must be a non-empty string.';
  }
  return { organizationId, projectId };
}

/** Express types route params as `string | string[]`. Every id below is a
 *  single path segment, so anything else is a malformed request. */
function pathParam(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** POST /api/agent/memory — store one fact. */
agentRouter.post('/memory', (req: Request, res: Response) => {
  const body = req.body;
  if (!isPlainObject(body)) {
    badRequest(res, 'request body must be a JSON object.');
    return;
  }
  const scope = readScope(body);
  if (typeof scope === 'string') {
    badRequest(res, scope);
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
  const scope = readScope(body);
  if (typeof scope === 'string') {
    badRequest(res, scope);
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
  const scope = readScope(req.query as Record<string, unknown>);
  if (typeof scope === 'string') {
    badRequest(res, scope);
    return;
  }
  res.json(memoryStats(scope.organizationId, scope.projectId));
});

/** DELETE /api/agent/memory/:memoryId?organizationId=&projectId= */
agentRouter.delete('/memory/:memoryId', (req: Request, res: Response) => {
  const scope = readScope(req.query as Record<string, unknown>);
  if (typeof scope === 'string') {
    badRequest(res, scope);
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
  const { queue, workerId, limit } = body;
  if (!isQueueName(queue)) {
    badRequest(res, `"queue" must be one of: ${QUEUE_NAMES.join(', ')}.`);
    return;
  }
  if (typeof workerId !== 'string' || workerId.trim() === '') {
    badRequest(res, '"workerId" must be a non-empty string.');
    return;
  }
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
  const body = req.body;
  if (!isPlainObject(body) || typeof body.workerId !== 'string' || body.workerId.trim() === '') {
    badRequest(res, '"workerId" must be a non-empty string.');
    return;
  }
  const jobId = pathParam(req.params.jobId);
  if (jobId === null) {
    badRequest(res, 'job id must be a single path segment.');
    return;
  }
  try {
    res.json({ job: completeJob(jobId, body.workerId) });
  } catch (err) {
    badRequest(res, err instanceof Error ? err.message : 'complete failed');
  }
});

/** POST /api/agent/jobs/:jobId/fail — report failure; retries or dead-letters. */
agentRouter.post('/jobs/:jobId/fail', (req: Request, res: Response) => {
  const body = req.body;
  if (!isPlainObject(body) || typeof body.workerId !== 'string' || body.workerId.trim() === '') {
    badRequest(res, '"workerId" must be a non-empty string.');
    return;
  }
  if (typeof body.error !== 'string' || body.error.trim() === '') {
    badRequest(res, '"error" must be a non-empty string describing the failure.');
    return;
  }
  const jobId = pathParam(req.params.jobId);
  if (jobId === null) {
    badRequest(res, 'job id must be a single path segment.');
    return;
  }
  try {
    res.json({ job: failJob(jobId, body.workerId, body.error) });
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
  if (!job) {
    res.status(404).json({ error: { message: `no such job: ${jobId}`, type: 'not_found' } });
    return;
  }
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
  const scope = readScope(body);
  if (typeof scope === 'string') {
    badRequest(res, scope);
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
  const scope = readScope(req.query as Record<string, unknown>);
  if (typeof scope === 'string') {
    badRequest(res, scope);
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
agentRouter.get('/runs/resumable', (_req: Request, res: Response) => {
  const runs = resumableRuns();
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
  if (!run) {
    res.status(404).json({ error: { message: `no such run: ${runId}`, type: 'not_found' } });
    return;
  }
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
  if (!getRun(runId)) {
    res.status(404).json({ error: { message: `no such run: ${runId}`, type: 'not_found' } });
    return;
  }
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
  if (!getRun(runId)) {
    res.status(404).json({ error: { message: `no such run: ${runId}`, type: 'not_found' } });
    return;
  }
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
  res.json({
    calls: listToolCalls({
      ...(typeof req.query.organizationId === 'string'
        ? { organizationId: req.query.organizationId }
        : {}),
      ...(typeof req.query.projectId === 'string' ? { projectId: req.query.projectId } : {}),
      ...(typeof req.query.runId === 'string' ? { runId: req.query.runId } : {}),
      ...(typeof req.query.outcome === 'string' ? { outcome: req.query.outcome } : {}),
      ...(limit === undefined ? {} : { limit }),
    }),
  });
});
