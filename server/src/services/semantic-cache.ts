/**
 * Semantic cache: letting a reworded question hit an existing answer.
 *
 * The exact cache hashes the messages together with every sampling knob, and
 * is right to. Its own comment is the rule this module has to respect:
 * *wrong-answer collisions are worse than missed hits.* But exact hashing also
 * means "how do I reset my password?" and "how can I reset my password" are
 * two provider calls for one answer, and paraphrase is the normal case in
 * chat.
 *
 * The design keeps the safety and adds the recall:
 *
 *   - The request is split in two. The **prompt text** is the part where
 *     rewording is meaningful. Everything else — model, temperature, tools,
 *     response_format, seed, the lot — becomes a `variantKey` that must match
 *     exactly. A JSON-mode request can never be served a plain-text answer,
 *     however similar the words.
 *   - A semantic match resolves to an existing exact `cache_key`, which is
 *     then read through the normal cache path. TTL, LRU and hit counting stay
 *     in one place, and a vector can never outlive the answer it points at.
 *   - Similarity must clear a deliberately high threshold, and the nearest
 *     neighbour must beat the runner-up. Two prompts that are both ~0.9
 *     similar to the query are usually *different* questions about the same
 *     topic, which is exactly when a wrong answer looks plausible.
 *
 * Off by default. Turning a cache from exact to approximate changes what
 * correctness means, so it is an operator's decision, not a default.
 */

import { createHash } from 'node:crypto';
import { getSetting, getDb } from '../db/index.js';
import { runEmbeddings, resolveFamily, EmbeddingsError } from './embeddings.js';

// Same three helpers as services/cache.ts, kept local for the same reason: a
// not-yet-initialised DB must never throw on the proxy hot path.
function envFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  return /^(1|true|on|yes)$/i.test(raw.trim());
}

function envNum(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function readSetting(key: string): string | undefined {
  try {
    return getSetting(key);
  } catch {
    return undefined;
  }
}

export const SEMANTIC_CACHE_ENABLED_SETTING = 'semantic_cache_enabled';

/**
 * Master switch, default off.
 *
 * An exact cache can only ever return the answer to the question that was
 * asked. An approximate one can return the answer to a *similar* question,
 * which is a different correctness guarantee — so adopting it is explicit.
 */
export function isSemanticCacheEnabled(): boolean {
  const stored = readSetting(SEMANTIC_CACHE_ENABLED_SETTING);
  if (stored !== undefined && stored.trim() !== '') {
    return /^(1|true|on|yes)$/i.test(stored.trim());
  }
  return envFlag('SEMANTIC_CACHE', false);
}

/**
 * Cosine similarity a candidate must reach.
 *
 * 0.95 is high on purpose. Embedding models put genuinely different questions
 * about one topic in the 0.85–0.93 range — "how do I reset my password" and
 * "how do I change my password" are close neighbours with different answers.
 * The cost of being wrong here is a confidently incorrect cached reply, so the
 * default errs toward missing.
 */
export function semanticThreshold(): number {
  const configured = envNum('SEMANTIC_CACHE_THRESHOLD', 0.95);
  if (!Number.isFinite(configured)) return 0.95;
  return Math.min(Math.max(configured, 0.5), 1);
}

/**
 * How far the best candidate must beat the second best.
 *
 * If two stored prompts are near-equally similar to the query, the query is
 * probably about a topic they share rather than a rewording of either. Serving
 * the arbitrary winner is how a semantic cache produces answers that are
 * relevant but wrong.
 */
export function semanticMargin(): number {
  const configured = envNum('SEMANTIC_CACHE_MARGIN', 0.02);
  return Number.isFinite(configured) ? Math.max(configured, 0) : 0.02;
}

/** Prompts longer than this are not embedded: the cost of the embedding call
 *  starts to rival the saving, and long prompts are rarely reworded verbatim. */
export function semanticMaxPromptChars(): number {
  return Math.floor(envNum('SEMANTIC_CACHE_MAX_PROMPT_CHARS', 8000));
}

export interface ChatMessageLike {
  role?: unknown;
  content?: unknown;
}

/**
 * The text a human would recognise as "the question".
 *
 * Only string content is used. A multimodal message carrying an image cannot
 * be compared by text similarity — two prompts with identical wording and
 * different images are different questions — so those return null and skip the
 * semantic path entirely.
 */
export function extractPromptText(messages: readonly ChatMessageLike[]): string | null {
  if (!Array.isArray(messages) || messages.length === 0) return null;

  const parts: string[] = [];
  let sawContent = false;
  for (const message of messages) {
    if (typeof message?.content !== 'string') return null;
    const role = typeof message.role === 'string' ? message.role : 'user';
    const content = message.content.trim();
    if (content !== '') sawContent = true;
    parts.push(`${role}: ${content}`);
  }

  // Role labels alone are not a question. Without this, every blank prompt in
  // a variant embeds to the same vector and matches every other blank one.
  if (!sawContent) return null;

  const text = parts.join('\n').trim();
  return text === '' ? null : text;
}

/**
 * A fingerprint of everything that is *not* the prompt text.
 *
 * Built by taking the exact cache's own key input and blanking the messages.
 * Anything the exact cache considers answer-changing therefore still has to
 * match exactly here — including knobs added later, since this reads whatever
 * it is given rather than listing fields itself.
 */
export function computeVariantKey(keyInput: Record<string, unknown>): string {
  const withoutMessages: Record<string, unknown> = { ...keyInput, messages: undefined };
  const canonical = JSON.stringify(
    Object.keys(withoutMessages)
      .sort()
      .map((key) => [key, withoutMessages[key]])
      .filter(([, value]) => value !== undefined),
  );
  return createHash('sha256').update(canonical).digest('hex');
}

function vectorToBlob(vector: number[]): Buffer {
  const buffer = Buffer.allocUnsafe(vector.length * 4);
  for (let i = 0; i < vector.length; i += 1) buffer.writeFloatLE(vector[i] ?? 0, i * 4);
  return buffer;
}

function blobToVector(blob: Buffer, dimensions: number): Float32Array {
  const out = new Float32Array(dimensions);
  for (let i = 0; i < dimensions; i += 1) out[i] = blob.readFloatLE(i * 4);
  return out;
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function embedPrompt(text: string): Promise<{ vector: number[]; family: string } | null> {
  const family = resolveFamily(undefined);
  if (!family) return null;
  try {
    const result = await runEmbeddings(undefined, [text]);
    const vector = result.vectors[0];
    if (!vector || vector.length === 0) return null;
    return { vector, family };
  } catch (error) {
    // A cache is an optimisation. If embedding is unavailable — no key, quota
    // exhausted, provider down — the request must proceed normally rather than
    // fail because a *speedup* was unavailable.
    if (error instanceof EmbeddingsError) return null;
    return null;
  }
}

export interface SemanticLookup {
  /** The exact cache key a near-match resolved to. */
  cacheKey: string;
  score: number;
  /** The stored prompt that matched, for logging and debugging. */
  matchedPrompt: string;
}

/**
 * Find a cached answer to a question close enough to this one.
 *
 * Returns null whenever anything is uncertain: cache off, prompt not plain
 * text, embedding unavailable, nothing similar enough, or two candidates too
 * close to call.
 */
export async function findSemanticMatch(input: {
  promptText: string;
  variantKey: string;
  now?: number;
}): Promise<SemanticLookup | null> {
  if (!isSemanticCacheEnabled()) return null;
  if (input.promptText.length > semanticMaxPromptChars()) return null;

  const now = input.now ?? Date.now();
  const db = getDb();

  // Cheap first: is there anything at all in this variant? Avoids paying for an
  // embedding call on a cold cache.
  const candidates = db
    .prepare(
      `SELECT cache_key AS cacheKey, family, dimensions, vector, prompt_text AS promptText
         FROM semantic_cache
        WHERE variant_key = ? AND expires_at_ms > ?`,
    )
    .all(input.variantKey, now) as Array<{
    cacheKey: string;
    family: string;
    dimensions: number;
    vector: Buffer;
    promptText: string;
  }>;

  if (candidates.length === 0) return null;

  // An identical prompt in the same variant would already have hit the exact
  // cache, so there is no fast path worth adding here.
  const embedded = await embedPrompt(input.promptText);
  if (!embedded) return null;

  const query = Float32Array.from(embedded.vector);
  const scored = candidates
    .filter((c) => c.family === embedded.family && c.dimensions === query.length)
    .map((c) => ({ candidate: c, score: cosine(query, blobToVector(c.vector, c.dimensions)) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < semanticThreshold()) return null;

  // Ambiguity check: if the runner-up is nearly as close, these are probably
  // sibling questions rather than rewordings, and picking one is guesswork.
  const runnerUp = scored[1];
  if (runnerUp && best.score - runnerUp.score < semanticMargin()) return null;

  return {
    cacheKey: best.candidate.cacheKey,
    score: best.score,
    matchedPrompt: best.candidate.promptText,
  };
}

/**
 * Record the prompt behind a freshly cached answer.
 *
 * Called after the exact cache stores an entry, with the same key and expiry,
 * so a vector can never point at an answer that has already gone.
 */
export async function rememberSemanticPrompt(input: {
  cacheKey: string;
  variantKey: string;
  promptText: string;
  expiresAtMs: number;
  now?: number;
}): Promise<boolean> {
  if (!isSemanticCacheEnabled()) return false;
  if (input.promptText.length > semanticMaxPromptChars()) return false;

  const embedded = await embedPrompt(input.promptText);
  if (!embedded) return false;

  const now = input.now ?? Date.now();
  getDb()
    .prepare(
      `INSERT INTO semantic_cache
         (cache_key, variant_key, family, dimensions, vector, prompt_text, created_at_ms, expires_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         variant_key = excluded.variant_key,
         family = excluded.family,
         dimensions = excluded.dimensions,
         vector = excluded.vector,
         prompt_text = excluded.prompt_text,
         expires_at_ms = excluded.expires_at_ms`,
    )
    .run(
      input.cacheKey,
      input.variantKey,
      embedded.family,
      embedded.vector.length,
      vectorToBlob(embedded.vector),
      input.promptText,
      now,
      input.expiresAtMs,
    );
  return true;
}

/** Drop expired vectors. Called on the same sweep as the response cache. */
export function purgeExpiredSemanticEntries(now = Date.now()): number {
  return getDb().prepare('DELETE FROM semantic_cache WHERE expires_at_ms <= ?').run(now).changes;
}

/** Forget one prompt — used when its exact entry is evicted or invalidated. */
export function forgetSemanticPrompt(cacheKey: string): void {
  getDb().prepare('DELETE FROM semantic_cache WHERE cache_key = ?').run(cacheKey);
}

export function semanticCacheSize(now = Date.now()): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS n FROM semantic_cache WHERE expires_at_ms > ?')
    .get(now) as { n: number };
  return row.n;
}
