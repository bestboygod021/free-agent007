import { getUnifiedApiKey } from '../db/index.js';
import { loadConfig } from '../lib/config.js';
import type { CompletionFn, CompletionRequest, CompletionResponse } from './agent-driver.js';

/**
 * Connects the agent driver to this gateway's own model pool.
 *
 * The driver asks a bounded question and needs one word back. This turns that
 * into an ordinary chat completion against `/v1/chat/completions`, which means
 * the agent inherits everything the gateway already does — 20 provider
 * families, failover, cooldowns, cost accounting, quota tracking — without
 * re-implementing any of it.
 *
 * Going over HTTP to our own port rather than calling the proxy internals is
 * deliberate. `runInboundChat` is written against Express `req`/`res`, and
 * faking those objects to reuse it would couple the agent to the exact shape
 * of the streaming wire protocol. A loopback request is a little slower and
 * much harder to break.
 */

export interface GatewayCompletionOptions {
  /** Override the model. Default: let the router choose. */
  model?: string;
  /** Base URL of this server. Default: loopback on the configured port. */
  baseUrl?: string;
  /** Per-request timeout. Default 120s. */
  timeoutMs?: number;
  maxTokens?: number;
}

interface ChatCompletionResponse {
  model?: string;
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

/**
 * Pull the decision word out of a model's answer.
 *
 * Models do not reliably answer with exactly one word, so this is forgiving in
 * the ways that are safe and strict in the way that matters: the outcome must
 * be one the caller listed. Anything else returns null and the driver refuses
 * to move the run.
 */
export function parseOutcome(
  text: string,
  allowed: readonly string[],
): { outcome: string; detail: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const lines = trimmed.split('\n');
  const firstLine = (lines[0] ?? '').toLowerCase();
  const detail = lines.slice(1).join('\n').trim() || trimmed;

  // Preferred: the first line is (or starts with) the decision.
  for (const candidate of allowed) {
    const word = candidate.toLowerCase();
    if (firstLine === word || new RegExp(`^\\W*${word}\\b`).test(firstLine)) {
      return { outcome: candidate, detail };
    }
  }

  // Fallback: the model buried the word in a sentence. Accept it only when
  // exactly one allowed outcome appears, so an answer mentioning two
  // possibilities is treated as no answer rather than guessed at.
  const haystack = trimmed.toLowerCase();
  const found = allowed.filter((candidate) =>
    new RegExp(`\\b${candidate.toLowerCase()}\\b`).test(haystack),
  );
  if (found.length === 1) return { outcome: found[0], detail: trimmed };

  return null;
}

/**
 * Build a CompletionFn backed by this gateway.
 *
 * The returned function is what `advance()` calls for each phase.
 */
export function gatewayCompletion(options: GatewayCompletionOptions = {}): CompletionFn {
  const baseUrl = options.baseUrl ?? `http://127.0.0.1:${loadConfig().port}`;
  const timeoutMs = options.timeoutMs ?? 120_000;

  return async function complete(request: CompletionRequest): Promise<CompletionResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getUnifiedApiKey()}`,
          // Lets the gateway's task-type routing bias model choice toward
          // quality for code work and speed for chat-like phases.
          'X-Task-Type': request.taskType === 'code_generation' ? 'code' : 'auto',
        },
        body: JSON.stringify({
          ...(options.model === undefined ? {} : { model: options.model }),
          messages: [
            {
              role: 'system',
              content:
                'You are one phase of a software agent. Answer with exactly one of the permitted words on the first line, then explain briefly. Never invent a word that is not permitted.',
            },
            { role: 'user', content: request.prompt },
          ],
          max_tokens: options.maxTokens ?? 800,
          temperature: 0,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`gateway returned ${response.status}: ${body.slice(0, 300)}`);
      }

      const data = (await response.json()) as ChatCompletionResponse;
      const text = data.choices?.[0]?.message?.content ?? '';
      const parsed = parseOutcome(text, request.allowedOutcomes);

      // An unparseable answer is reported as-is, truncated, because it only
      // ever appears in a refusal message. `detail` always carries the FULL
      // text: evidence gathering reads the tool protocol out of it, and
      // truncating here would corrupt a `TOOL name {json}` line mid-argument.
      return {
        outcome: parsed?.outcome ?? text.trim().slice(0, 40),
        detail: parsed?.detail ?? text.trim(),
        ...(data.model === undefined ? {} : { model: data.model }),
        tokensUsed: data.usage?.total_tokens ?? 0,
      };
    } finally {
      clearTimeout(timer);
    }
  };
}
