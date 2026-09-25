/**
 * Keyword retrieval, and the fusion that combines it with the vector scan.
 *
 * WHY THIS EXISTS, measured rather than argued. Against the deterministic
 * embedding used by the retrieval tests, a corpus containing the sentence
 * "Error ERR_QUOTA_7734 means the provider rejected the request" answers the
 * query `ERR_QUOTA_7734` with **nothing at all**: every chunk scores 0.000,
 * and the default `minScore` of 0.2 throws them all away. The identifier is
 * out of vocabulary, so it contributes no signal, so the ranking is a tie.
 *
 * A real model behaves the same way for the same reason. Its tokenizer has a
 * fixed vocabulary too; a rare identifier becomes subword fragments whose mean
 * points nowhere useful. Dense retrieval answers "what is the timeout policy"
 * well and "ERR_QUOTA_7734" badly, and for an agent reading a codebase the
 * second kind of query is the common one.
 *
 * So: BM25 through SQLite's FTS5, which is already compiled into the
 * better-sqlite3 in the lockfile, fused with the existing cosine scan.
 */

import { getDb } from '../db/index.js';

/** Highest keyword rank considered; past this, fused scores are noise. */
export const MAX_KEYWORD_CANDIDATES = 200;

/**
 * The RRF constant. 60 is the value from the original Cormack et al. paper and
 * the one every implementation uses; it damps the difference between rank 1
 * and rank 2 enough that a single ranker cannot dominate on its own.
 */
export const RRF_K = 60;

export interface KeywordHit {
  chunkId: string;
  /** Raw bm25() output. Negative, and more negative is better — see below. */
  bm25: number;
  /** 1-based position in the keyword ranking. */
  rank: number;
}

export interface Ranked {
  chunkId: string;
  rank: number;
}

export interface FusedHit {
  chunkId: string;
  score: number;
  vectorRank: number | null;
  keywordRank: number | null;
}

/**
 * Turn arbitrary user text into an FTS5 MATCH expression that cannot be an
 * FTS5 *query*.
 *
 * This is the part that matters for safety, and it was found by measurement:
 * passing raw text to MATCH interprets it as a query language, so `v2.10.3`
 * raises "fts5: syntax error near .", `agent-tools` raises "no such column:
 * tools" (the hyphen reads as a column filter), and a lone `"` is an unclosed
 * string. A user searching for a version number should not be able to crash
 * the query, and `body:secret` should search for those two words rather than
 * addressing a column.
 *
 * Every run of letters, digits and underscores becomes a quoted literal, and
 * the terms are OR-ed so that a multi-word question still matches a chunk
 * containing only some of the words -- BM25 then ranks the ones matching more
 * of them higher. Returns null when nothing usable survives, which the caller
 * must read as "no keyword opinion", not "no results".
 */
export function toMatchExpression(query: string): string | null {
  const terms = query.toLowerCase().match(/[\p{L}\p{N}_]+/gu);
  if (!terms || terms.length === 0) return null;

  // Deduplicated: repeating a term in the expression does not improve BM25,
  // it just makes the query longer.
  const unique = [...new Set(terms)];

  // A double quote is the only character that can escape a quoted literal, and
  // FTS5 escapes it by doubling. The tokenizer above cannot produce one, but
  // the escape stays because this function's contract is "safe for any input"
  // and a future tokenizer change should not silently become an injection.
  return unique.map((term) => `"${term.replace(/"/g, '""')}"`).join(' OR ');
}

/**
 * BM25 keyword search over one tenant's chunks.
 *
 * Scoping is in SQL, like the vector path: filtering afterwards would let a
 * large limit walk another tenant's rows before discarding them.
 */
export function keywordSearch(input: {
  organizationId: string;
  projectId: string;
  query: string;
  limit?: number;
}): KeywordHit[] {
  const expression = toMatchExpression(input.query);
  if (expression === null) return [];

  const limit = Math.min(Math.max(Math.floor(input.limit ?? 50), 1), MAX_KEYWORD_CANDIDATES);

  let rows: Array<{ chunkId: string; bm25: number }>;
  try {
    rows = getDb()
      .prepare(
        `SELECT chunk_id AS chunkId, bm25(rag_chunks_fts) AS bm25
           FROM rag_chunks_fts
          WHERE rag_chunks_fts MATCH ?
            AND organization_id = ?
            AND project_id = ?
          ORDER BY bm25
          LIMIT ?`,
      )
      .all(expression, input.organizationId, input.projectId, limit) as Array<{
      chunkId: string;
      bm25: number;
    }>;
  } catch {
    // The expression is built by this module and every term is quoted, so a
    // syntax error should be impossible. Returning no keyword opinion rather
    // than propagating keeps a malformed query from taking down the vector
    // half of a hybrid search, which would turn a degraded answer into none.
    return [];
  }

  // bm25() returns a *negative* number where more negative is a better match,
  // so ORDER BY bm25 ascending is best-first. Rank is what fusion consumes;
  // the raw score is returned only so a caller can show it.
  return rows.map((row, index) => ({ chunkId: row.chunkId, bm25: row.bm25, rank: index + 1 }));
}

/**
 * Reciprocal Rank Fusion.
 *
 * Fusing on *rank* rather than on score is the whole point. Cosine similarity
 * lives in [-1, 1] and BM25 is unbounded and negative; normalising them onto a
 * common scale means inventing a conversion, and the conversion would be doing
 * the real work while looking like arithmetic. Ranks are already comparable.
 *
 * A chunk found by both rankers beats a chunk found by one, which is the
 * behaviour that makes hybrid retrieval worth having.
 */
export function fuseRankings(
  vector: readonly Ranked[],
  keyword: readonly Ranked[],
  k: number = RRF_K,
): FusedHit[] {
  const fused = new Map<string, FusedHit>();

  const add = (list: readonly Ranked[], field: 'vectorRank' | 'keywordRank'): void => {
    for (const item of list) {
      const existing = fused.get(item.chunkId) ?? {
        chunkId: item.chunkId,
        score: 0,
        vectorRank: null,
        keywordRank: null,
      };
      // Guard against a ranker reporting the same chunk twice: without it the
      // duplicate would add its reciprocal a second time and quietly promote
      // that chunk above better ones.
      if (existing[field] !== null) continue;
      existing[field] = item.rank;
      existing.score += 1 / (k + item.rank);
      fused.set(item.chunkId, existing);
    }
  };

  add(vector, 'vectorRank');
  add(keyword, 'keywordRank');

  return [...fused.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // A stable, explainable tiebreak beats Map insertion order, which depends
    // on which ranker happened to run first.
    return a.chunkId < b.chunkId ? -1 : 1;
  });
}

/** Mirror a chunk into the keyword index. Call inside the ingest transaction. */
export function indexChunkForKeywords(chunk: {
  chunkId: string;
  organizationId: string;
  projectId: string;
  text: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO rag_chunks_fts (text, chunk_id, organization_id, project_id)
       VALUES (?, ?, ?, ?)`,
    )
    .run(chunk.text, chunk.chunkId, chunk.organizationId, chunk.projectId);
}

/**
 * Drop a document's chunks from the keyword index.
 *
 * rag_chunks has ON DELETE CASCADE from rag_documents; an FTS5 table cannot
 * carry a foreign key, so deletion is explicit. Getting this wrong leaves a
 * deleted document still answering searches, which is a data-retention bug
 * rather than a relevance one -- hence the test that deletes and re-searches.
 */
export function removeDocumentFromKeywordIndex(input: {
  organizationId: string;
  projectId: string;
  documentId: string;
}): void {
  getDb()
    .prepare(
      `DELETE FROM rag_chunks_fts
        WHERE organization_id = ?
          AND project_id = ?
          AND chunk_id IN (SELECT chunk_id FROM rag_chunks WHERE document_id = ?)`,
    )
    .run(input.organizationId, input.projectId, input.documentId);
}
