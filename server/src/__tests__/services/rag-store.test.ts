import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initDb, getDb } from '../../db/index.js';

/**
 * A deterministic stand-in for a real embedding provider.
 *
 * Retrieval tests are worthless against random vectors — every assertion about
 * ranking would be luck. This embeds text as a bag-of-words vector over a
 * fixed vocabulary, so "the timeout is 30 seconds" genuinely scores higher
 * against a timeout question than an unrelated paragraph does, and the
 * ordering is reproducible.
 */
const VOCAB = [
  'timeout', 'seconds', 'retry', 'database', 'sqlite', 'vector', 'embedding',
  'cache', 'token', 'budget', 'provider', 'failover', 'chunk', 'citation',
  'banana', 'weather', 'rainfall', 'gardening',
];

function fakeEmbed(text: string): number[] {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  return VOCAB.map((term) => counts.get(term) ?? 0);
}

const runEmbeddings = vi.fn(async (_model: string | undefined, inputs: string[]) => ({
  family: 'test-family',
  platform: 'test',
  modelId: 'test-embed',
  dimensions: VOCAB.length,
  vectors: inputs.map(fakeEmbed),
  inputTokens: inputs.join(' ').length,
}));

vi.mock('../../services/embeddings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/embeddings.js')>();
  return {
    ...actual,
    runEmbeddings: (model: string | undefined, inputs: string[]) => runEmbeddings(model, inputs),
    resolveFamily: (model: string | undefined) =>
      model === 'unknown-model' ? null : 'test-family',
  };
});

const {
  ingestDocument,
  searchDocuments,
  resolveCitation,
  listDocuments,
  deleteDocument,
  RagError,
} = await import('../../services/rag-store.js');

const SCOPE = { organizationId: 'acme', projectId: 'web' };
const OTHER = { organizationId: 'zeta', projectId: 'web' };

const TIMEOUT_DOC = `
The request timeout is 30 seconds by default.

When a provider fails, the gateway performs a failover to the next provider in
the family. Retry behaviour is controlled separately.

Gardening in heavy rainfall requires good drainage and patience.
`.trim();

describe('rag store', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    runEmbeddings.mockClear();
  });

  describe('ingestion', () => {
    it('stores a document, its chunks and their vectors', async () => {
      const result = await ingestDocument({ ...SCOPE, title: 'Ops notes', content: TIMEOUT_DOC });

      expect(result.chunks).toBeGreaterThan(0);
      expect(result.deduplicated).toBe(false);

      const db = getDb();
      const chunks = db.prepare('SELECT COUNT(*) AS n FROM rag_chunks').get() as { n: number };
      const vectors = db.prepare('SELECT COUNT(*) AS n FROM rag_embeddings').get() as { n: number };
      expect(chunks.n).toBe(result.chunks);
      // Every chunk must be searchable; a chunk without a vector is invisible.
      expect(vectors.n).toBe(result.chunks);
    });

    it('is a no-op when the same content is ingested twice', async () => {
      const first = await ingestDocument({ ...SCOPE, title: 'Ops', content: TIMEOUT_DOC });
      const second = await ingestDocument({ ...SCOPE, title: 'Ops again', content: TIMEOUT_DOC });

      expect(second.deduplicated).toBe(true);
      expect(second.documentId).toBe(first.documentId);
      expect(listDocuments('acme', 'web')).toHaveLength(1);
    });

    it('treats identical content in another project as a separate document', async () => {
      await ingestDocument({ ...SCOPE, title: 'Ops', content: TIMEOUT_DOC });
      const other = await ingestDocument({ ...OTHER, title: 'Ops', content: TIMEOUT_DOC });

      expect(other.deduplicated).toBe(false);
      expect(listDocuments('acme', 'web')).toHaveLength(1);
      expect(listDocuments('zeta', 'web')).toHaveLength(1);
    });

    it('writes nothing when the embedding provider fails', async () => {
      runEmbeddings.mockRejectedValueOnce(new Error('provider is down'));

      await expect(
        ingestDocument({ ...SCOPE, title: 'Doomed', content: TIMEOUT_DOC }),
      ).rejects.toThrow('provider is down');

      // A half-ingested document would retrieve confidently and cite nothing.
      const docs = getDb().prepare('SELECT COUNT(*) AS n FROM rag_documents').get() as { n: number };
      const chunks = getDb().prepare('SELECT COUNT(*) AS n FROM rag_chunks').get() as { n: number };
      expect(docs.n).toBe(0);
      expect(chunks.n).toBe(0);
    });

    it('refuses empty, untitled, oversized and unknown-model input', async () => {
      await expect(ingestDocument({ ...SCOPE, title: '', content: 'x' })).rejects.toThrow(RagError);
      await expect(ingestDocument({ ...SCOPE, title: 'T', content: '   ' })).rejects.toThrow(RagError);
      await expect(
        ingestDocument({ ...SCOPE, title: 'T', content: 'x'.repeat(2_000_001) }),
      ).rejects.toThrow(/limit is/);
      await expect(
        ingestDocument({ ...SCOPE, title: 'T', content: 'hello', model: 'unknown-model' }),
      ).rejects.toThrow(/unknown embedding model/);
    });

    it('batches large documents rather than sending one enormous call', async () => {
      // Enough paragraphs to exceed the 64-chunk batch size comfortably.
      const long = Array.from({ length: 300 }, (_, i) => `Paragraph ${i} about vector storage.`).join('\n\n');
      await ingestDocument({ ...SCOPE, title: 'Long', content: long, chunking: { maxChars: 200 } });

      const batchSizes = runEmbeddings.mock.calls.map(([, inputs]) => inputs.length);
      expect(batchSizes.length).toBeGreaterThan(1);
      expect(Math.max(...batchSizes)).toBeLessThanOrEqual(64);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await ingestDocument({
        ...SCOPE,
        title: 'Ops notes',
        sourceUri: 'notes/ops.md',
        content: TIMEOUT_DOC,
        chunking: { maxChars: 200, overlapChars: 0 },
      });
    });

    it('returns the passage that actually answers the question', async () => {
      const result = await searchDocuments({ ...SCOPE, query: 'what is the timeout in seconds' });

      expect(result.citations.length).toBeGreaterThan(0);
      expect(result.citations[0]?.text).toContain('timeout is 30 seconds');
    });

    it('ranks an unrelated passage below a relevant one', async () => {
      const result = await searchDocuments({ ...SCOPE, query: 'provider failover' , minScore: 0 });
      const texts = result.citations.map((c) => c.text);
      const failoverIdx = texts.findIndex((t) => t.includes('failover'));
      const gardenIdx = texts.findIndex((t) => t.includes('Gardening'));

      expect(failoverIdx).toBeGreaterThanOrEqual(0);
      if (gardenIdx >= 0) expect(failoverIdx).toBeLessThan(gardenIdx);
    });

    it('carries a citation that points at real characters', async () => {
      const result = await searchDocuments({ ...SCOPE, query: 'timeout seconds' });
      const citation = result.citations[0]!;

      expect(citation.title).toBe('Ops notes');
      expect(citation.sourceUri).toBe('notes/ops.md');

      const resolved = resolveCitation({ ...SCOPE, chunkId: citation.chunkId })!;
      // The offsets must reproduce the quoted text from the stored document.
      expect(resolved.text).toBe(citation.text);
      expect(resolved.matchesStoredChunk).toBe(true);
    });

    it('never returns another tenant\'s passages', async () => {
      await ingestDocument({
        ...OTHER,
        title: 'Zeta secrets',
        content: 'The timeout in seconds for zeta is a secret value.',
      });

      const mine = await searchDocuments({ ...SCOPE, query: 'timeout seconds' });
      expect(mine.citations.every((c) => !c.text.includes('zeta'))).toBe(true);

      const theirs = await searchDocuments({ ...OTHER, query: 'timeout seconds' });
      expect(theirs.citations.some((c) => c.text.includes('zeta'))).toBe(true);
    });

    it('returns nothing rather than noise when nothing matches', async () => {
      const result = await searchDocuments({ ...SCOPE, query: 'banana' });
      expect(result.citations).toEqual([]);
    });

    it('returns nothing for an empty corpus without calling a provider', async () => {
      const empty = await searchDocuments({
        organizationId: 'nobody', projectId: 'here', query: 'anything',
      });
      expect(empty.citations).toEqual([]);
      // No corpus means no reason to spend an embedding call on the query.
      expect(runEmbeddings.mock.calls.filter(([, i]) => i[0] === 'anything')).toHaveLength(0);
    });

    it('respects the requested limit', async () => {
      const result = await searchDocuments({ ...SCOPE, query: 'the', limit: 1, minScore: -1 });
      expect(result.citations.length).toBeLessThanOrEqual(1);
    });

    it('drops passages that do not fit the token budget and says so', async () => {
      const wide = await searchDocuments({ ...SCOPE, query: 'timeout failover retry', minScore: 0, tokenBudget: 100_000 });
      const narrow = await searchDocuments({ ...SCOPE, query: 'timeout failover retry', minScore: 0, tokenBudget: 1 });

      expect(wide.citations.length).toBeGreaterThan(0);
      expect(narrow.citations.length).toBeLessThan(wide.citations.length);
      expect(narrow.omitted).toBeGreaterThan(0);
    });

    it('rejects an empty query and an unknown model', async () => {
      await expect(searchDocuments({ ...SCOPE, query: '  ' })).rejects.toThrow(RagError);
      await expect(
        searchDocuments({ ...SCOPE, query: 'x', model: 'unknown-model' }),
      ).rejects.toThrow(/unknown embedding model/);
    });
  });

  describe('deletion', () => {
    it('removes the document, its chunks and its vectors', async () => {
      const { documentId } = await ingestDocument({ ...SCOPE, title: 'Ops', content: TIMEOUT_DOC });

      expect(deleteDocument({ ...SCOPE, documentId })).toBe(true);

      const db = getDb();
      expect((db.prepare('SELECT COUNT(*) AS n FROM rag_chunks').get() as { n: number }).n).toBe(0);
      expect((db.prepare('SELECT COUNT(*) AS n FROM rag_embeddings').get() as { n: number }).n).toBe(0);
    });

    it('will not delete across tenants', async () => {
      const { documentId } = await ingestDocument({ ...SCOPE, title: 'Ops', content: TIMEOUT_DOC });

      expect(deleteDocument({ ...OTHER, documentId })).toBe(false);
      expect(listDocuments('acme', 'web')).toHaveLength(1);
    });

    it('will not resolve a citation across tenants', async () => {
      await ingestDocument({ ...SCOPE, title: 'Ops', content: TIMEOUT_DOC });
      const found = await searchDocuments({ ...SCOPE, query: 'timeout seconds' });
      const chunkId = found.citations[0]!.chunkId;

      expect(resolveCitation({ ...OTHER, chunkId })).toBeNull();
    });
  });
});
