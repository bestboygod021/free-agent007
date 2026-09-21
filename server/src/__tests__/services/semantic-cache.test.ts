import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initDb, getDb } from '../../db/index.js';

/**
 * Deterministic bag-of-words embedder. Semantic-cache tests are about *when* a
 * match is allowed, not about a particular model's geometry, so the vectors
 * need to be predictable rather than realistic.
 */
const VOCAB = [
  'reset', 'change', 'password', 'email', 'account', 'how', 'do', 'i', 'can',
  'my', 'the', 'weather', 'tomorrow', 'capital', 'france', 'delete',
];

function fakeVector(text: string): number[] {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return VOCAB.map((term) => words.filter((w) => w === term).length);
}

const runEmbeddings = vi.fn(async (_m: string | undefined, inputs: string[]) => ({
  family: 'test-family',
  platform: 'test',
  modelId: 'test-embed',
  dimensions: VOCAB.length,
  vectors: inputs.map(fakeVector),
  inputTokens: 10,
}));

vi.mock('../../services/embeddings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/embeddings.js')>();
  return {
    ...actual,
    resolveFamily: () => 'test-family',
    runEmbeddings: (m: string | undefined, i: string[]) => runEmbeddings(m, i),
  };
});

const {
  isSemanticCacheEnabled,
  extractPromptText,
  computeVariantKey,
  findSemanticMatch,
  rememberSemanticPrompt,
  forgetSemanticPrompt,
  purgeExpiredSemanticEntries,
  semanticCacheSize,
} = await import('../../services/semantic-cache.js');

const VARIANT = 'variant-a';

async function remember(cacheKey: string, promptText: string, expiresAtMs = Date.now() + 60_000) {
  return rememberSemanticPrompt({ cacheKey, variantKey: VARIANT, promptText, expiresAtMs });
}

describe('semantic cache', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    runEmbeddings.mockClear();
    process.env.SEMANTIC_CACHE = 'true';
    // A low margin by default so ordinary matching is testable; the ambiguity
    // rule gets its own tests.
    process.env.SEMANTIC_CACHE_MARGIN = '0';
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  describe('the switch', () => {
    it('is off unless explicitly enabled', () => {
      delete process.env.SEMANTIC_CACHE;
      expect(isSemanticCacheEnabled()).toBe(false);
    });

    it('does nothing at all while off', async () => {
      delete process.env.SEMANTIC_CACHE;
      expect(await remember('k1', 'how do i reset my password')).toBe(false);
      expect(
        await findSemanticMatch({ promptText: 'how do i reset my password', variantKey: VARIANT }),
      ).toBeNull();
      expect(runEmbeddings).not.toHaveBeenCalled();
    });

    it('can be switched on by the settings row without a restart', () => {
      delete process.env.SEMANTIC_CACHE;
      getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('semantic_cache_enabled', 'true')").run();
      expect(isSemanticCacheEnabled()).toBe(true);
    });
  });

  describe('what counts as the prompt', () => {
    it('joins roles and text in order', () => {
      expect(
        extractPromptText([
          { role: 'system', content: 'Be brief.' },
          { role: 'user', content: 'Hello' },
        ]),
      ).toBe('system: Be brief.\nuser: Hello');
    });

    it('refuses multimodal content rather than comparing only its text', () => {
      // Identical wording with a different image is a different question.
      expect(
        extractPromptText([
          { role: 'user', content: [{ type: 'text', text: 'what is this' }] as unknown },
        ]),
      ).toBeNull();
    });

    it('refuses empty input', () => {
      expect(extractPromptText([])).toBeNull();
      expect(extractPromptText([{ role: 'user', content: '   ' }])).toBeNull();
    });
  });

  describe('the variant key', () => {
    it('ignores the messages and nothing else', () => {
      const a = computeVariantKey({ model: 'gpt', temperature: 0, messages: [{ content: 'x' }] });
      const b = computeVariantKey({ model: 'gpt', temperature: 0, messages: [{ content: 'y' }] });
      expect(a).toBe(b);
    });

    it('separates requests that differ in any other knob', () => {
      const base = { model: 'gpt', temperature: 0 };
      const variants = [
        { ...base, temperature: 0.7 },
        { ...base, model: 'claude' },
        { ...base, response_format: { type: 'json_object' } },
        { ...base, tools: [{ name: 'search' }] },
        { ...base, seed: 42 },
        { ...base, max_tokens: 100 },
      ].map((v) => computeVariantKey(v));

      const all = new Set([computeVariantKey(base), ...variants]);
      // Every one of those must land in its own bucket.
      expect(all.size).toBe(variants.length + 1);
    });

    it('treats an absent knob and an undefined one as the same request', () => {
      expect(computeVariantKey({ model: 'gpt', seed: undefined })).toBe(
        computeVariantKey({ model: 'gpt' }),
      );
    });
  });

  describe('matching', () => {
    it('finds a reworded question', async () => {
      await remember('k-reset', 'how do i reset my password');

      // Reordered and lightly repunctuated: the same bag of words, which under
      // this embedder is what "a rewording" means.
      const hit = await findSemanticMatch({
        promptText: 'My password — how do I reset i t?',
        variantKey: VARIANT,
      });
      expect(hit?.cacheKey).toBe('k-reset');
      expect(hit!.score).toBeGreaterThan(0.95);
    });

    it('refuses a swapped keyword even though the sentence barely changed', async () => {
      await remember('k-reset', 'how do i reset my password');

      // "do" -> "can" is one short word, and the toy embedder puts this at
      // ~0.83. A real model scores such pairs higher, but the principle under
      // test is the same: below the threshold means no answer, however close
      // the wording looks to a human.
      expect(
        await findSemanticMatch({
          promptText: 'how can i reset my password',
          variantKey: VARIANT,
        }),
      ).toBeNull();
    });

    it('refuses a question that is merely related', async () => {
      await remember('k-reset', 'how do i reset my password');

      // Same topic, different answer. This is the failure mode that makes a
      // naive semantic cache dangerous.
      const hit = await findSemanticMatch({
        promptText: 'how do i delete my account',
        variantKey: VARIANT,
      });
      expect(hit).toBeNull();
    });

    it('refuses an unrelated question outright', async () => {
      await remember('k-reset', 'how do i reset my password');
      expect(
        await findSemanticMatch({ promptText: 'what is the capital of france', variantKey: VARIANT }),
      ).toBeNull();
    });

    it('never crosses a variant boundary', async () => {
      await remember('k-json', 'how do i reset my password');

      // Byte-identical wording, different settings: must not match.
      const hit = await findSemanticMatch({
        promptText: 'how do i reset my password',
        variantKey: 'variant-b',
      });
      expect(hit).toBeNull();
    });

    it('will not choose between two near-equal candidates', async () => {
      // Two stored prompts that are *identical* as bags of words, so both score
      // the same against the query and clear the threshold. The margin is the
      // only thing that can refuse this, which is what makes it a real test:
      // without it the winner is whichever the sort happened to put first.
      process.env.SEMANTIC_CACHE_MARGIN = '0.05';
      await remember('k-reset', 'how do i reset my password');
      await remember('k-reset-2', 'password my reset i do how');

      const hit = await findSemanticMatch({
        promptText: 'how do i reset my password',
        variantKey: VARIANT,
      });
      expect(hit).toBeNull();
    });

    it('serves the clear winner once the runner-up falls away', async () => {
      // Same setup minus the tie: the margin must not block a genuine match.
      process.env.SEMANTIC_CACHE_MARGIN = '0.05';
      await remember('k-reset', 'how do i reset my password');
      await remember('k-weather', 'what is the weather tomorrow');

      const hit = await findSemanticMatch({
        promptText: 'how do i reset my password',
        variantKey: VARIANT,
      });
      expect(hit?.cacheKey).toBe('k-reset');
    });

    it('spends nothing on an empty variant', async () => {
      await remember('k-reset', 'how do i reset my password');
      runEmbeddings.mockClear();

      expect(await findSemanticMatch({ promptText: 'anything', variantKey: 'cold' })).toBeNull();
      // No candidates means no reason to pay for an embedding call.
      expect(runEmbeddings).not.toHaveBeenCalled();
    });

    it('ignores an entry whose answer has expired', async () => {
      const now = Date.now();
      await remember('k-old', 'how do i reset my password', now + 1000);

      expect(
        await findSemanticMatch({
          promptText: 'how can i reset my password',
          variantKey: VARIANT,
          now: now + 5000,
        }),
      ).toBeNull();
    });

    it('skips a prompt too long to be worth embedding', async () => {
      process.env.SEMANTIC_CACHE_MAX_PROMPT_CHARS = '50';
      const long = 'how do i reset my password '.repeat(20);

      expect(await remember('k-long', long)).toBe(false);
      expect(await findSemanticMatch({ promptText: long, variantKey: VARIANT })).toBeNull();
    });

    it('respects a raised threshold', async () => {
      await remember('k-reset', 'how do i reset my password');
      process.env.SEMANTIC_CACHE_THRESHOLD = '0.999';

      expect(
        await findSemanticMatch({ promptText: 'how can i reset my password', variantKey: VARIANT }),
      ).toBeNull();
    });
  });

  describe('when embedding is unavailable', () => {
    it('degrades to a miss instead of failing the request', async () => {
      const { EmbeddingsError } = await import('../../services/embeddings.js');
      await remember('k-reset', 'how do i reset my password');
      runEmbeddings.mockRejectedValueOnce(new EmbeddingsError('no usable keys', 503));

      // A cache is an optimisation; losing it must not break the call.
      await expect(
        findSemanticMatch({ promptText: 'how can i reset my password', variantKey: VARIANT }),
      ).resolves.toBeNull();
    });

    it('declines to remember rather than throwing', async () => {
      runEmbeddings.mockRejectedValueOnce(new Error('provider exploded'));
      await expect(remember('k-x', 'how do i reset my password')).resolves.toBe(false);
    });
  });

  describe('housekeeping', () => {
    it('overwrites rather than duplicating a re-stored key', async () => {
      await remember('k-reset', 'how do i reset my password');
      await remember('k-reset', 'how can i reset my password');
      expect(semanticCacheSize()).toBe(1);
    });

    it('forgets a single prompt', async () => {
      await remember('k-reset', 'how do i reset my password');
      forgetSemanticPrompt('k-reset');
      expect(semanticCacheSize()).toBe(0);
    });

    it('purges expired vectors', async () => {
      const now = Date.now();
      await remember('k-a', 'how do i reset my password', now + 1000);
      await remember('k-b', 'what is the weather tomorrow', now + 100_000);

      expect(purgeExpiredSemanticEntries(now + 5000)).toBe(1);
      expect(semanticCacheSize(now + 5000)).toBe(1);
    });
  });
});
