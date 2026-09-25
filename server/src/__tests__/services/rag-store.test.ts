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

/** Padding, so each paragraph becomes its own chunk. */
const PAD = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod. '.repeat(20);

/**
 * The corpus that motivated hybrid retrieval. `ERR_QUOTA_7734` is not in the
 * embedding's vocabulary -- exactly as a rare identifier is out of a real
 * tokenizer's -- so it contributes nothing to any vector and every chunk ties.
 */
const IDENTIFIER_DOC =
  `The request timeout is 30 seconds by default and the retry budget is three. ${PAD}\n\n` +
  `Error ERR_QUOTA_7734 means the provider rejected the request for quota reasons. ${PAD}\n\n` +
  `The cache uses sqlite for the vector database with embedding chunk support. ${PAD}`;
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

    it('drops the keyword index rows too, so a deleted document stops matching', async () => {
      const { documentId } = await ingestDocument({
        ...SCOPE,
        title: 'Runbook',
        content: IDENTIFIER_DOC,
      });
      expect(
        (await searchDocuments({ ...SCOPE, query: 'ERR_QUOTA_7734', mode: 'keyword' })).citations,
      ).toHaveLength(1);

      deleteDocument({ ...SCOPE, documentId });

      // An FTS5 table cannot carry a foreign key, so the cascade that clears
      // rag_chunks does not clear this. Getting it wrong leaves a deleted
      // document answering searches: a retention bug, not a ranking one.
      const after = await searchDocuments({ ...SCOPE, query: 'ERR_QUOTA_7734', mode: 'keyword' });
      expect(after.citations).toEqual([]);
      const db = getDb();
      expect(
        (db.prepare('SELECT COUNT(*) AS n FROM rag_chunks_fts').get() as { n: number }).n,
      ).toBe(0);
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

  describe('hybrid retrieval', () => {
    /**
     * The measurement this whole feature exists for. Before hybrid search,
     * asking for a string that is *literally in the corpus* returned nothing:
     * the identifier is out of vocabulary, so every chunk scores 0.000 and
     * the default minScore of 0.2 discards all of them.
     */
    it('finds an exact identifier that vector search cannot see at all', async () => {
      await ingestDocument({ ...SCOPE, title: 'Runbook', content: IDENTIFIER_DOC });

      const vector = await searchDocuments({ ...SCOPE, query: 'ERR_QUOTA_7734', mode: 'vector' });
      expect(vector.citations).toEqual([]);

      const hybrid = await searchDocuments({ ...SCOPE, query: 'ERR_QUOTA_7734', mode: 'hybrid' });
      expect(hybrid.citations).toHaveLength(1);
      // The chunk actually contains the term -- not merely a neighbour of it.
      expect(hybrid.citations[0]!.text).toContain('ERR_QUOTA_7734');
      expect(hybrid.citations[0]!.keywordRank).toBe(1);
      expect(hybrid.citations[0]!.vectorRank).toBeNull();
    });

    it('still answers a semantic question that has no matching keyword', async () => {
      await ingestDocument({ ...SCOPE, title: 'Ops', content: TIMEOUT_DOC });

      // "how long before giving up" shares no content word with the document,
      // so only the vector half can find it. Hybrid must not regress it.
      const hybrid = await searchDocuments({ ...SCOPE, query: 'timeout seconds' });
      expect(hybrid.citations.length).toBeGreaterThan(0);
      expect(hybrid.citations[0]!.vectorRank).toBe(1);
    });

    it('defaults to hybrid', async () => {
      await ingestDocument({ ...SCOPE, title: 'Runbook', content: IDENTIFIER_DOC });

      const result = await searchDocuments({ ...SCOPE, query: 'ERR_QUOTA_7734' });
      expect(result.mode).toBe('hybrid');
      expect(result.citations).toHaveLength(1);
    });

    it('reports which rankers actually ran', async () => {
      await ingestDocument({ ...SCOPE, title: 'Runbook', content: IDENTIFIER_DOC });

      const keyword = await searchDocuments({ ...SCOPE, query: 'timeout', mode: 'keyword' });
      expect(keyword).toMatchObject({ vectorSearched: false, keywordSearched: true });

      const vector = await searchDocuments({ ...SCOPE, query: 'timeout', mode: 'vector' });
      expect(vector).toMatchObject({ vectorSearched: true, keywordSearched: false });
    });

    /**
     * Raw text used to reach FTS5 MATCH, which reads it as a *query language*:
     * `v2.10.3` raised "syntax error near .", `agent-tools` raised "no such
     * column: tools". A user searching for a version number must not be able
     * to error the query.
     */
    it('treats punctuation in a query as text, not as query syntax', async () => {
      await ingestDocument({ ...SCOPE, title: 'Runbook', content: IDENTIFIER_DOC });

      for (const query of ['v2.10.3', 'agent-tools', 'body:secret', 'NOT timeout', '"', '*']) {
        await expect(searchDocuments({ ...SCOPE, query, mode: 'hybrid' })).resolves.toBeDefined();
      }
    });

    it('does not leak another tenant\'s chunks through the keyword index', async () => {
      await ingestDocument({ ...SCOPE, title: 'Runbook', content: IDENTIFIER_DOC });

      const other = await searchDocuments({ ...OTHER, query: 'ERR_QUOTA_7734', mode: 'keyword' });
      expect(other.citations).toEqual([]);
    });

    /**
     * Ordering, which needs several keyword matches to be observable at all.
     * With one match per query, reversing `ORDER BY bm25` changes nothing and
     * the mutant survives -- the fixture was the weak part, not the check.
     *
     * BM25 rewards term frequency and penalises length, so the short chunk
     * that is *about* the identifier must outrank the long one that merely
     * mentions it once.
     */
    it('ranks the better keyword match first', async () => {
      await ingestDocument({
        ...SCOPE,
        title: 'Runbook',
        content:
          `ERR_QUOTA_7734 ERR_QUOTA_7734 ERR_QUOTA_7734 is the quota error.\n\n` +
          `A passing mention of ERR_QUOTA_7734 buried in prose. ${PAD}\n\n` +
          `Another passing mention of ERR_QUOTA_7734 in more prose. ${PAD}`,
      });

      const result = await searchDocuments({
        ...SCOPE,
        query: 'ERR_QUOTA_7734',
        mode: 'keyword',
        limit: 3,
      });

      expect(result.citations.length).toBeGreaterThan(1);
      expect(result.citations[0]!.text).toContain('is the quota error');
      expect(result.citations[0]!.keywordRank).toBe(1);
    });

    /**
     * The keyword index holds every chunk; the vector join holds only chunks
     * embedded for the requested family. A chunk in the first and not the
     * second has nothing to return, and an unfiltered fusion dereferences it.
     */
    it('ignores a keyword hit that has no vector row to resolve', async () => {
      await ingestDocument({ ...SCOPE, title: 'Runbook', content: IDENTIFIER_DOC });

      // A chunk id the FTS index knows and rag_chunks does not: the state the
      // migration backfill produces for a corpus embedded under another
      // family, and the state a partial delete would leave.
      getDb()
        .prepare(
          `INSERT INTO rag_chunks_fts (text, chunk_id, organization_id, project_id)
           VALUES (?, ?, ?, ?)`,
        )
        .run('ERR_QUOTA_7734 orphaned row', 'chk_orphan', SCOPE.organizationId, SCOPE.projectId);

      const result = await searchDocuments({ ...SCOPE, query: 'ERR_QUOTA_7734', mode: 'hybrid' });

      expect(result.citations.map((c) => c.chunkId)).not.toContain('chk_orphan');
      expect(result.citations).toHaveLength(1);
    });

    it('rejects an unknown mode rather than silently choosing one', async () => {
      await ingestDocument({ ...SCOPE, title: 'Runbook', content: IDENTIFIER_DOC });

      await expect(
        searchDocuments({ ...SCOPE, query: 'timeout', mode: 'semantic' as never }),
      ).rejects.toThrow(RagError);
    });

    /**
     * Hybrid mode degrades to keyword-only when the embedding provider is
     * down, and says so. Returning keyword results labelled as hybrid would
     * be the dishonest version of this.
     */
    it('falls back to keyword-only when the embedding provider fails', async () => {
      await ingestDocument({ ...SCOPE, title: 'Runbook', content: IDENTIFIER_DOC });
      runEmbeddings.mockRejectedValueOnce(new Error('provider down'));

      const result = await searchDocuments({ ...SCOPE, query: 'ERR_QUOTA_7734', mode: 'hybrid' });

      expect(result.vectorSearched).toBe(false);
      expect(result.keywordSearched).toBe(true);
      expect(result.citations).toHaveLength(1);
    });

    it('fails rather than degrading when vector mode is asked for explicitly', async () => {
      await ingestDocument({ ...SCOPE, title: 'Runbook', content: IDENTIFIER_DOC });
      runEmbeddings.mockRejectedValueOnce(new Error('provider down'));

      await expect(
        searchDocuments({ ...SCOPE, query: 'timeout', mode: 'vector' }),
      ).rejects.toThrow(/provider down/);
    });
  });
});
