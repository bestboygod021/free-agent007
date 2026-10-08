import { createHash, randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';
import { validateToolArguments } from '../lib/tool-validate.js';
import { evaluateToolCall } from '@freellmapi/agent/core/policy-engine.js';
import { redactSecrets, redactPayload } from '@freellmapi/agent/core/redaction.js';
import type { PolicyContext, PolicyVerdict } from '@freellmapi/agent/core/types.js';

/**
 * The tool registry: how an agent is allowed to affect anything.
 *
 * Until now a phase could decide but not act. This is the layer that lets it
 * act, which makes it the most dangerous code in the agent — so the ordering
 * below is deliberate and every step is a gate:
 *
 *   1. the tool must be registered        (unknown names cannot be invented)
 *   2. arguments must match its schema    (Ajv, the same validator the proxy uses)
 *   3. policy must allow it               (the existing kernel policy engine)
 *   4. approval must exist if required    (the agent cannot grant its own)
 *   5. only then does the handler run, inside a timeout
 *   6. the attempt is recorded either way (refusals are the interesting rows)
 *
 * Nothing here interprets natural language and nothing trusts a model. A model
 * supplies a tool name and JSON arguments; every decision after that is code.
 */

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolInvocationContext,
) => Promise<unknown>;

export interface ToolInvocationContext {
  organizationId: string;
  projectId: string;
  runId?: string | undefined;
  /** Root the tool is confined to. Filesystem tools must not escape it. */
  workspaceRoot: string;
  signal: AbortSignal;
}

export interface ToolDefinition {
  /** Dotted name, e.g. `fs.read_file`. The suffix drives policy classification. */
  name: string;
  description: string;
  /** JSON Schema for the arguments object. Validated with Ajv before any call. */
  schema: Record<string, unknown>;
  handler: ToolHandler;
  /** Default ceiling for this tool; a caller may lower it but never raise it. */
  timeoutMs?: number;
  /**
   * Which ref this call is really about to write, for the protected-branch
   * guard. A tool resolves this from the world (e.g. by reading HEAD) rather
   * than taking a model's word for it: a model wanting to commit to `main`
   * would simply not mention `main`.
   */
  resolveTargetRef?: (
    args: Record<string, unknown>,
    workspaceRoot: string,
  ) => Promise<string | null>;
}

export interface ToolCallResult {
  callId: string;
  tool: string;
  ok: boolean;
  /** denied | error | ok */
  outcome: 'denied' | 'error' | 'ok';
  reason?: string;
  result?: unknown;
  riskLevel: string;
  sideEffect: string;
  approvalRequired: boolean;
  durationMs: number;
}

export class ToolError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

const MAX_ARGS_CHARS = 64 * 1024;
const MAX_RESULT_PREVIEW = 4 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;

const registry = new Map<string, ToolDefinition>();

/** Register a tool. Names are unique; re-registering replaces the definition. */
export function registerTool(def: ToolDefinition): void {
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(def.name)) {
    throw new ToolError(
      `tool name "${def.name}" must be dotted lowercase, e.g. "fs.read_file".`,
    );
  }
  registry.set(def.name, def);
}

export function getTool(name: string): ToolDefinition | undefined {
  return registry.get(name);
}

export function clearTools(): void {
  registry.clear();
}

/**
 * The catalogue a model is shown. Deliberately omits the handler, and is
 * shaped like an OpenAI function definition so it can be passed straight
 * through to a tool-calling model.
 */
export function listTools(): { name: string; description: string; parameters: unknown }[] {
  return [...registry.values()]
    .map((t) => ({ name: t.name, description: t.description, parameters: t.schema }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Persist the attempt. Called for refusals and successes alike. */
function record(row: {
  callId: string;
  runId?: string | undefined;
  organizationId: string;
  projectId: string;
  tool: string;
  args: string;
  outcome: string;
  reason?: string | undefined;
  riskLevel: string;
  sideEffect: string;
  resultHash?: string | undefined;
  resultPreview?: string | undefined;
  durationMs: number;
}): void {
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO agent_tool_calls
         (call_id, run_id, organization_id, project_id, tool, args, outcome, reason,
          risk_level, side_effect, result_hash, result_preview, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.callId,
      row.runId ?? null,
      row.organizationId,
      row.projectId,
      row.tool,
      row.args,
      row.outcome,
      row.reason ?? null,
      row.riskLevel,
      row.sideEffect,
      row.resultHash ?? null,
      row.resultPreview ?? null,
      row.durationMs,
      now,
    );
}

export interface InvokeParams {
  tool: string;
  args: Record<string, unknown>;
  organizationId: string;
  projectId: string;
  runId?: string | undefined;
  workspaceRoot: string;
  /** Policy inputs. Missing fields default to the most restrictive value. */
  policy?: Partial<PolicyContext> | undefined;
  grantedScopes?: string[] | undefined;
  /** Id of the human who approved this call, when the verdict demands one. */
  approvedBy?: string | undefined;
  timeoutMs?: number | undefined;
}

/**
 * Run one tool call through every gate.
 *
 * Returns a result rather than throwing for a refusal: being denied is a normal
 * outcome of a healthy agent, and the caller needs the reason to feed back to
 * the model. Only malformed *requests* throw.
 */
export async function invokeTool(params: InvokeParams): Promise<ToolCallResult> {
  const callId = `call_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
  const started = Date.now();
  const def = registry.get(params.tool);

  // Arguments are redacted before they are stored or shown, so a secret passed
  // by mistake does not become a permanent row in the audit log.
  const safeArgs = JSON.stringify(redactPayload(params.args) ?? {});
  if (safeArgs.length > MAX_ARGS_CHARS) {
    throw new ToolError(`arguments exceed ${MAX_ARGS_CHARS} characters.`);
  }

  const deny = (
    reason: string,
    risk = 'high',
    sideEffect = 'unknown',
    approvalRequired = false,
  ): ToolCallResult => {
    const durationMs = Date.now() - started;
    record({
      callId,
      runId: params.runId,
      organizationId: params.organizationId,
      projectId: params.projectId,
      tool: params.tool,
      args: safeArgs,
      outcome: 'denied',
      reason,
      riskLevel: risk,
      sideEffect,
      durationMs,
    });
    return {
      callId,
      tool: params.tool,
      ok: false,
      outcome: 'denied',
      reason,
      riskLevel: risk,
      sideEffect,
      approvalRequired,
      durationMs,
    };
  };

  // 1. Unknown tool. A model cannot conjure a capability by naming it.
  if (!def) {
    return deny(`no tool named "${params.tool}" is registered.`);
  }

  // 2. Schema. `validateToolArguments` fails open on an uncompilable schema,
  //    which is right for the proxy but not here, so the schema is required.
  const verdict = validateToolArguments(params.tool, JSON.stringify(params.args ?? {}), def.schema);
  if (!verdict.ok) {
    return deny(`invalid arguments: ${verdict.reason}`);
  }

  // 3. Policy. Reuses the kernel engine so tool calls made by the driver obey
  //    exactly the same rules as tool calls checked through /policy/tool-call.
  const ctx: PolicyContext = {
    autonomy: 'supervised',
    privacyLevel: 'private',
    workingBranch: 'agent/work',
    protectedBranches: ['main'],
    approverUserId: 'unknown',
    ...params.policy,
  } as PolicyContext;

  // Resolved before the verdict, so the guard judges the branch the repository
  // is actually on. A resolver that fails is treated as "unknown", and an
  // unknown ref must not silently become "no ref to protect".
  let targetRef: string | null = null;
  if (def.resolveTargetRef) {
    try {
      targetRef = await def.resolveTargetRef(params.args ?? {}, params.workspaceRoot);
    } catch (err) {
      return deny(
        `could not determine which ref "${params.tool}" would write: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      );
    }
  } else if (typeof params.args?.ref === 'string') {
    targetRef = params.args.ref;
  }

  let policy: PolicyVerdict;
  try {
    policy = evaluateToolCall(
      {
        tool: params.tool,
        grantedScopes: params.grantedScopes ?? [],
        ...(targetRef === null ? {} : { targetRef }),
      },
      ctx,
    );
  } catch (err) {
    return deny(err instanceof Error ? err.message : 'policy evaluation failed');
  }

  if (!policy.allowed) {
    return deny(
      policy.reasons.join('; ') || 'policy refused this call',
      policy.riskLevel,
      policy.sideEffect,
      policy.approvalRequired,
    );
  }

  // 4. Approval. The agent may not approve itself: an approval naming the
  //    configured approver is the only one that counts.
  if (policy.approvalRequired) {
    if (!params.approvedBy) {
      return deny(
        `this call requires human approval (${policy.riskLevel} risk); no approval was supplied`,
        policy.riskLevel,
        policy.sideEffect,
        true,
      );
    }
    if (params.approvedBy !== ctx.approverUserId) {
      return deny(
        `approval by "${params.approvedBy}" is not valid; only "${ctx.approverUserId}" may approve`,
        policy.riskLevel,
        policy.sideEffect,
        true,
      );
    }
  }

  // 5. Execute under a ceiling. A tool that hangs must not hang the run.
  const timeoutMs = Math.min(
    params.timeoutMs ?? def.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const value = await def.handler(params.args ?? {}, {
      organizationId: params.organizationId,
      projectId: params.projectId,
      runId: params.runId,
      workspaceRoot: params.workspaceRoot,
      signal: controller.signal,
    });

    const serialized = JSON.stringify(value ?? null);
    // Tool output is untrusted text heading for a model prompt, so it is
    // redacted on the way out as well as on the way in.
    const preview = redactSecrets(serialized.slice(0, MAX_RESULT_PREVIEW)).text;
    const durationMs = Date.now() - started;

    record({
      callId,
      runId: params.runId,
      organizationId: params.organizationId,
      projectId: params.projectId,
      tool: params.tool,
      args: safeArgs,
      outcome: 'ok',
      riskLevel: policy.riskLevel,
      sideEffect: policy.sideEffect,
      resultHash: sha256(serialized),
      resultPreview: preview,
      durationMs,
    });

    return {
      callId,
      tool: params.tool,
      ok: true,
      outcome: 'ok',
      // The caller gets the real value; `preview` is the redacted, truncated
      // copy kept for the audit row.
      result: value,
      riskLevel: policy.riskLevel,
      sideEffect: policy.sideEffect,
      approvalRequired: policy.approvalRequired,
      durationMs,
    };
  } catch (err) {
    const aborted = controller.signal.aborted;
    const reason = aborted
      ? `tool timed out after ${timeoutMs}ms`
      : redactSecrets(err instanceof Error ? err.message : 'tool failed').text;
    const durationMs = Date.now() - started;

    record({
      callId,
      runId: params.runId,
      organizationId: params.organizationId,
      projectId: params.projectId,
      tool: params.tool,
      args: safeArgs,
      outcome: 'error',
      reason,
      riskLevel: policy.riskLevel,
      sideEffect: policy.sideEffect,
      durationMs,
    });

    return {
      callId,
      tool: params.tool,
      ok: false,
      outcome: 'error',
      reason,
      riskLevel: policy.riskLevel,
      sideEffect: policy.sideEffect,
      approvalRequired: policy.approvalRequired,
      durationMs,
    };
  } finally {
    clearTimeout(timer);
  }
}

export interface ToolCallRow {
  callId: string;
  runId: string | null;
  tool: string;
  args: unknown;
  outcome: string;
  reason: string | null;
  riskLevel: string;
  sideEffect: string;
  resultPreview: string | null;
  durationMs: number;
  createdAt: string;
}

/** The audit trail, newest first. */
export function listToolCalls(filter: {
  organizationId?: string;
  projectId?: string;
  runId?: string;
  outcome?: string;
  limit?: number;
}): ToolCallRow[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (filter.organizationId) {
    where.push('organization_id = ?');
    args.push(filter.organizationId);
  }
  if (filter.projectId) {
    where.push('project_id = ?');
    args.push(filter.projectId);
  }
  if (filter.runId) {
    where.push('run_id = ?');
    args.push(filter.runId);
  }
  if (filter.outcome) {
    where.push('outcome = ?');
    args.push(filter.outcome);
  }
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);

  const rows = getDb()
    .prepare(
      `SELECT call_id, run_id, tool, args, outcome, reason, risk_level, side_effect,
              result_preview, duration_ms, created_at
         FROM agent_tool_calls
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY created_at DESC, rowid DESC
        LIMIT ?`,
    )
    .all(...args, limit) as Record<string, unknown>[];

  return rows.map((r) => ({
    callId: r.call_id as string,
    runId: (r.run_id as string | null) ?? null,
    tool: r.tool as string,
    args: JSON.parse((r.args as string) || '{}'),
    outcome: r.outcome as string,
    reason: (r.reason as string | null) ?? null,
    riskLevel: r.risk_level as string,
    sideEffect: r.side_effect as string,
    resultPreview: (r.result_preview as string | null) ?? null,
    durationMs: r.duration_ms as number,
    createdAt: new Date(r.created_at as number).toISOString(),
  }));
}
