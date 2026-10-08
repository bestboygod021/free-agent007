import { invokeTool, listTools, type ToolCallResult } from './agent-tools.js';
import { evaluateToolCall } from '@freellmapi/agent/core/policy-engine.js';
import { redactSecrets } from '@freellmapi/agent/core/redaction.js';
import type { PolicyContext } from '@freellmapi/agent/core/types.js';

/**
 * Evidence gathering: how a phase looks before it leaps.
 *
 * The driver and the tool registry were built separately, and until now they
 * stayed separate — a phase decided from the goal and its own history alone,
 * which meant every answer was an educated guess about a repository nobody had
 * read. This joins them: before a phase commits to an outcome, it may call
 * read-only tools and put the results in front of the model.
 *
 * Two constraints shape the whole design.
 *
 * The first is that autonomy must not smuggle in authority. A driver running
 * unattended can only use tools that need no scope and no human approval, and
 * that set is not a hand-written list here — it is derived by asking the policy
 * engine what survives an empty scope grant. Add a dangerous tool to the
 * registry tomorrow and it is excluded automatically; relax a rule and the
 * change shows up in one place.
 *
 * The second is that the loop must end. The model can only ever do two things
 * — ask for one tool or answer — and the asking is capped, so a model that
 * stalls runs out of turns and is then required to decide on what it has.
 */

export interface EvidenceEntry {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  /** Redacted, truncated rendering of the result, safe to put in a prompt. */
  summary: string;
}

export interface GatherParams {
  runId: string;
  organizationId: string;
  projectId: string;
  workspaceRoot: string;
  /** Tool names this phase is allowed to use, intersected with what is safe. */
  allowedTools: readonly string[];
  /** Asks the model for its next move. Returns raw text. */
  ask: (prompt: string) => Promise<string>;
  /** Prompt describing the task, before any evidence is appended. */
  basePrompt: string;
  maxCalls?: number;
  policy?: Partial<PolicyContext> | undefined;
}

export interface GatherResult {
  evidence: EvidenceEntry[];
  /** The final model text, once it stopped asking for tools. */
  finalAnswer: string;
  /** True when the model used every call it was given. */
  budgetExhausted: boolean;
}

const DEFAULT_MAX_CALLS = 5;
const MAX_SUMMARY_CHARS = 2000;

/**
 * The tools a driver may use with nobody watching.
 *
 * Derived, not declared: a tool qualifies only if the policy engine allows it
 * with no granted scopes and demands no approval. That is precisely the
 * definition of "cannot change anything and needs no permission", so read
 * tools pass and every write, deploy or credential tool is filtered out.
 */
export function unattendedTools(policy?: Partial<PolicyContext>): string[] {
  const ctx: PolicyContext = {
    autonomy: 'supervised',
    privacyLevel: 'private',
    workingBranch: 'agent/work',
    protectedBranches: ['main'],
    approverUserId: 'unknown',
    ...policy,
  } as PolicyContext;

  return listTools()
    .filter((tool) => {
      try {
        const verdict = evaluateToolCall({ tool: tool.name, grantedScopes: [] }, ctx);
        return verdict.allowed && !verdict.approvalRequired && verdict.sideEffect === 'none';
      } catch {
        // A tool the policy engine cannot classify is not one to hand an
        // unsupervised agent.
        return false;
      }
    })
    .map((tool) => tool.name);
}

/**
 * Parse a model's move.
 *
 * Accepts `TOOL <name> {json}` on a line of its own. Everything else is
 * treated as the model's answer, which means an unparseable tool request ends
 * evidence gathering rather than looping — the model gets its decision read
 * instead, and a malformed request cannot spin the loop.
 */
export function parseToolRequest(
  text: string,
): { tool: string; args: Record<string, unknown> } | null {
  for (const line of text.split('\n')) {
    const match = /^\s*TOOL\s+([a-z][a-z0-9_.]*)\s*(\{[\s\S]*\})?\s*$/i.exec(line.trim());
    if (!match) continue;

    const tool = match[1]!;
    if (!match[2]) return { tool, args: {} };

    try {
      const parsed: unknown = JSON.parse(match[2]);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return { tool, args: parsed as Record<string, unknown> };
    } catch {
      return null;
    }
  }
  return null;
}

/** Render a tool result for a prompt: redacted, bounded, and honest about failure. */
function summarize(result: ToolCallResult): string {
  if (!result.ok) return `FAILED: ${result.reason ?? 'no reason given'}`;
  const body = typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
  const clipped = (body ?? '').slice(0, MAX_SUMMARY_CHARS);
  return (
    redactSecrets(clipped).text + (body && body.length > MAX_SUMMARY_CHARS ? '\n…(truncated)' : '')
  );
}

/**
 * Let the model gather evidence, then answer.
 *
 * Returns the transcript alongside the final answer so the caller can record
 * what the decision was actually based on.
 */
export async function gatherEvidence(params: GatherParams): Promise<GatherResult> {
  const maxCalls = Math.min(Math.max(params.maxCalls ?? DEFAULT_MAX_CALLS, 0), 20);

  // The phase's wish list, narrowed to what is safe unattended. Intersecting
  // rather than trusting the phase means a mistake in the phase table cannot
  // widen what an unsupervised run may do.
  const safe = new Set(unattendedTools(params.policy));
  const available = listTools().filter(
    (tool) => params.allowedTools.includes(tool.name) && safe.has(tool.name),
  );

  const evidence: EvidenceEntry[] = [];

  if (available.length === 0 || maxCalls === 0) {
    return { evidence, finalAnswer: await params.ask(params.basePrompt), budgetExhausted: false };
  }

  const catalogue = available
    .map((tool) => `- ${tool.name}: ${tool.description}\n  arguments: ${JSON.stringify(tool.parameters)}`)
    .join('\n');

  for (let used = 0; used < maxCalls; used++) {
    const remaining = maxCalls - used;
    const prompt = [
      params.basePrompt,
      `# Tools you may use to check your answer\n${catalogue}`,
      evidence.length > 0
        ? `# What you have found so far\n${evidence
            .map((e) => `## ${e.tool} ${JSON.stringify(e.args)}\n${e.summary}`)
            .join('\n\n')}`
        : '',
      `# How to reply\nTo inspect something first, reply with exactly one line:\nTOOL <name> {"arg": "value"}\nYou may do this ${remaining} more time(s). Otherwise, give your final answer now in the format described above.`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const reply = await params.ask(prompt);
    const request = parseToolRequest(reply);
    if (!request) return { evidence, finalAnswer: reply, budgetExhausted: false };

    // A tool outside the phase's allowance is refused and recorded, so the
    // model sees the refusal and can adjust. It still costs a turn, which is
    // what stops a model burning the budget on guesses.
    if (!available.some((tool) => tool.name === request.tool)) {
      evidence.push({
        tool: request.tool,
        args: request.args,
        ok: false,
        summary: `FAILED: "${request.tool}" is not available in this phase. Available: ${available
          .map((t) => t.name)
          .join(', ')}`,
      });
      continue;
    }

    const result = await invokeTool({
      tool: request.tool,
      args: request.args,
      organizationId: params.organizationId,
      projectId: params.projectId,
      runId: params.runId,
      workspaceRoot: params.workspaceRoot,
      ...(params.policy ? { policy: params.policy } : {}),
      // No scopes and no approval, deliberately: this is the unattended path,
      // and invokeTool re-checks rather than trusting the filter above.
      grantedScopes: [],
    });

    evidence.push({
      tool: request.tool,
      args: request.args,
      ok: result.ok,
      summary: summarize(result),
    });
  }

  // Out of turns: the model must now decide on what it has.
  const finalPrompt = [
    params.basePrompt,
    `# What you found\n${evidence
      .map((e) => `## ${e.tool} ${JSON.stringify(e.args)}\n${e.summary}`)
      .join('\n\n')}`,
    '# How to reply\nYou have used all your tool calls. Give your final answer now, in the format described above.',
  ].join('\n\n');

  return { evidence, finalAnswer: await params.ask(finalPrompt), budgetExhausted: true };
}
