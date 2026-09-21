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
