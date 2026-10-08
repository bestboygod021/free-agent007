import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb, getDb, getUnifiedApiKey } from '../../db/index.js';
import { clearCache } from '../../services/cache.js';
import { mintDashboardToken, isGatedApiPath } from '../helpers/auth.js';

/**
 * End-to-end proof that a reworded question reaches an existing cache entry
 * without touching the provider — and, more importantly, that it does not do
 * so when the settings differ or the questions merely share a topic.
 *
 * The embedding provider is replaced with a deterministic bag-of-words vector
 * so the assertions are about policy, not about a particular model's geometry.
 */
const VOCAB = ['capital', 'france', 'what', 'is', 'the', 'of', 'tell', 'me', 'weather', 'population'];

vi.mock('../../services/embeddings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/embeddings.js')>();
  return {
    ...actual,
    resolveFamily: () => 'test-family',
    runEmbeddings: async (_m: string | undefined, inputs: string[]) => ({
      family: 'test-family',
      platform: 'test',
      modelId: 'test-embed',
      dimensions: VOCAB.length,
      vectors: inputs.map((text) => {
        const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
        return VOCAB.map((term) => words.filter((w) => w === term).length);
      }),
      inputTokens: 10,
    }),
  };
});

let dashToken = '';

async function request(app: Express, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const server = app.listen(0, '127.0.0.1');
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const addr = server.address() as { port: number };
  const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(isGatedApiPath(path) && !('Authorization' in headers) ? { Authorization: `Bearer ${dashToken}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  server.close();
  let json: Record<string, unknown> | null = null;
  try { json = JSON.parse(raw); } catch { /* SSE or empty */ }
  return { status: res.status, body: json as any, headers: res.headers };
}

function authHeaders() {
  return { Authorization: `Bearer ${getUnifiedApiKey()}` };
}

function mockGroq(content: string) {
  const origFetch = global.fetch;
  const counter = { calls: 0 };
  vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.includes('api.groq.com/openai/v1/chat/completions')) {
      counter.calls++;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          id: 'c1', object: 'chat.completion', created: 1, model: 'openai/gpt-oss-120b',
          choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
        }),
        text: async () => '',
      } as unknown as Response;
    }
    return origFetch(url, init);
  });
  return counter;
}

describe('Semantic cache (proxy integration)', () => {
  let app: Express;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    process.env.RESPONSE_CACHE = 'on';
    process.env.SEMANTIC_CACHE = 'true';
    process.env.SEMANTIC_CACHE_MARGIN = '0';
    initDb(':memory:');
    app = createApp();
    dashToken = mintDashboardToken();
  });

  afterAll(() => {
    delete process.env.RESPONSE_CACHE;
    delete process.env.SEMANTIC_CACHE;
    delete process.env.SEMANTIC_CACHE_MARGIN;
  });

  beforeEach(async () => {
    const db = getDb();
    db.prepare('DELETE FROM api_keys').run();
    db.prepare('DELETE FROM requests').run();
    db.prepare('DELETE FROM semantic_cache').run();
    clearCache();
    const addKey = await request(app, 'POST', '/api/keys', { platform: 'groq', key: 'gsk_semantic_test', label: 'sem' });
    expect(addKey.status).toBe(201);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearCache();
  });

  const ask = (content: string, extra: Record<string, unknown> = {}) =>
    request(app, 'POST', '/v1/chat/completions', {
      model: 'auto',
      messages: [{ role: 'user', content }],
      ...extra,
    }, authHeaders());

  /** The proxy answers before the prompt vector is written, so a test that
   *  immediately re-asks can race the background store. */
  async function settle() {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  it('serves a reworded question without calling the provider', async () => {
    const counter = mockGroq('Paris');

    const first = await ask('what is the capital of france');
    expect(first.status).toBe(200);
    expect(first.headers.get('x-freellm-cache')).toBe('MISS');
    expect(counter.calls).toBe(1);
    await settle();

    // Same words, different order and punctuation: a different exact key.
    const second = await ask('the capital of france — what is it');
    expect(second.status).toBe(200);
    expect(second.body.choices[0].message.content).toBe('Paris');
    expect(second.headers.get('x-freellm-cache')).toBe('HIT-SEMANTIC');
    // The saving is the point: no second provider call.
    expect(counter.calls).toBe(1);
  });

  it('reports the score so a surprising reply can be traced', async () => {
    mockGroq('Paris');
    await ask('what is the capital of france');
    await settle();

    const second = await ask('the capital of france — what is it');
    const score = Number(second.headers.get('x-freellm-cache-score'));
    expect(score).toBeGreaterThan(0.95);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('does not answer a different question about the same topic', async () => {
    const counter = mockGroq('Paris');

    await ask('what is the capital of france');
    await settle();

    // Shares most words, asks something else entirely.
    const other = await ask('what is the population of france');
    expect(other.headers.get('x-freellm-cache')).not.toBe('HIT-SEMANTIC');
    expect(counter.calls).toBe(2);
  });

  it('never crosses a settings boundary', async () => {
    const counter = mockGroq('Paris');

    await ask('what is the capital of france');
    await settle();

    // Identical wording, different temperature: a different variant, so the
    // vector must not be reachable.
    const hotter = await ask('what is the capital of france', { temperature: 0.9 });
    expect(hotter.headers.get('x-freellm-cache')).not.toBe('HIT-SEMANTIC');
    expect(counter.calls).toBe(2);
  });

  it('never serves a json-mode request a plain-text answer', async () => {
    // The mock returns valid JSON so the output contract does not reject it and
    // retry down the model chain — the assertion here is about the cache, not
    // about response_format enforcement.
    const counter = mockGroq('{"city":"Paris"}');

    await ask('what is the capital of france');
    await settle();

    const json = await ask('the capital of france — what is it', {
      response_format: { type: 'json_object' },
    });
    expect(json.headers.get('x-freellm-cache')).not.toBe('HIT-SEMANTIC');
    // A plain-text entry exists and is textually near-identical; the variant
    // key is the only thing keeping it out of this reply.
    expect(counter.calls).toBe(2);
  });

  it('still prefers an exact hit, which stays labelled HIT', async () => {
    const counter = mockGroq('Paris');

    await ask('what is the capital of france');
    await settle();

    const same = await ask('what is the capital of france');
    expect(same.headers.get('x-freellm-cache')).toBe('HIT');
    expect(counter.calls).toBe(1);
  });

  it('does nothing when the feature is off', async () => {
    delete process.env.SEMANTIC_CACHE;
    try {
      const counter = mockGroq('Paris');
      await ask('what is the capital of france');
      await settle();

      const second = await ask('the capital of france — what is it');
      expect(second.headers.get('x-freellm-cache')).not.toBe('HIT-SEMANTIC');
      expect(counter.calls).toBe(2);
      // Nothing was even recorded.
      const rows = getDb().prepare('SELECT COUNT(*) AS n FROM semantic_cache').get() as { n: number };
      expect(rows.n).toBe(0);
    } finally {
      process.env.SEMANTIC_CACHE = 'true';
    }
  });
});
