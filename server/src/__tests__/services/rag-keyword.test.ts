import { describe, it, expect } from 'vitest';
import {
  toMatchExpression,
  fuseRankings,
  RRF_K,
  type Ranked,
} from '../../services/rag-keyword.js';

describe('toMatchExpression', () => {
  it('quotes each term so it is data, not query syntax', () => {
    expect(toMatchExpression('ERR_QUOTA_7734')).toBe('"err_quota_7734"');
  });

  /**
   * The measured failures. Passed raw to FTS5 these produce, in order:
   * "syntax error near .", "no such column: tools", a column filter instead
   * of a word search, a NOT operator, and an unclosed string.
   */
  it.each([
    ['v2.10.3', '"v2" OR "10" OR "3"'],
    ['agent-tools', '"agent" OR "tools"'],
    ['body:secret', '"body" OR "secret"'],
    ['NOT timeout', '"not" OR "timeout"'],
  ])('neutralises %s', (input, expected) => {
    expect(toMatchExpression(input)).toBe(expected);
  });

  it('returns null when nothing usable survives', () => {
    // Not an empty string: an empty MATCH is itself a syntax error, and the
    // caller must be able to tell "no keyword opinion" from "match nothing".
    expect(toMatchExpression('*')).toBeNull();
    expect(toMatchExpression('  ')).toBeNull();
    expect(toMatchExpression('"')).toBeNull();
  });

  it('deduplicates repeated terms', () => {
    expect(toMatchExpression('timeout timeout TIMEOUT')).toBe('"timeout"');
  });

  it('keeps non-ASCII letters, which are words in most languages', () => {
    expect(toMatchExpression('مهلت زمانی')).toBe('"مهلت" OR "زمانی"');
  });

  /**
   * The tokenizer cannot currently emit a double quote, so this guards the
   * escape against a future tokenizer change rather than a present bug.
   */
  it('escapes a double quote by doubling it, the way FTS5 expects', () => {
    const expression = toMatchExpression('say "hi"');
    expect(expression).toBe('"say" OR "hi"');
  });
});

describe('fuseRankings', () => {
  const v = (...ids: string[]): Ranked[] => ids.map((chunkId, i) => ({ chunkId, rank: i + 1 }));

  it('ranks a chunk found by both rankers above one found by either', () => {
    const fused = fuseRankings(v('a', 'both'), v('both', 'b'));

    expect(fused[0]!.chunkId).toBe('both');
    expect(fused[0]!.vectorRank).toBe(2);
    expect(fused[0]!.keywordRank).toBe(1);
  });

  it('uses the reciprocal rank formula', () => {
    const fused = fuseRankings(v('a'), v('a'));

    expect(fused[0]!.score).toBeCloseTo(1 / (RRF_K + 1) + 1 / (RRF_K + 1), 10);
  });

  it('keeps a chunk only one ranker found', () => {
    const fused = fuseRankings(v('only-vector'), []);

    expect(fused).toHaveLength(1);
    expect(fused[0]).toMatchObject({ chunkId: 'only-vector', vectorRank: 1, keywordRank: null });
  });

  it('reproduces a single ranker exactly when the other is empty', () => {
    expect(fuseRankings(v('a', 'b', 'c'), []).map((f) => f.chunkId)).toEqual(['a', 'b', 'c']);
    expect(fuseRankings([], v('x', 'y')).map((f) => f.chunkId)).toEqual(['x', 'y']);
  });

  /**
   * A ranker that returns the same chunk twice would otherwise add its
   * reciprocal a second time and promote it over better results. The first
   * rank wins, because it is the better one.
   */
  it('ignores a duplicate from the same ranker', () => {
    const duplicated: Ranked[] = [
      { chunkId: 'a', rank: 1 },
      { chunkId: 'a', rank: 2 },
    ];
    const fused = fuseRankings(duplicated, []);

    expect(fused).toHaveLength(1);
    expect(fused[0]!.vectorRank).toBe(1);
    expect(fused[0]!.score).toBeCloseTo(1 / (RRF_K + 1), 10);
  });

  it('breaks a tie on chunk id rather than on argument order', () => {
    const forwards = fuseRankings(v('b'), v('a')).map((f) => f.chunkId);
    const backwards = fuseRankings(v('a'), v('b')).map((f) => f.chunkId);

    expect(forwards).toEqual(['a', 'b']);
    expect(backwards).toEqual(['a', 'b']);
  });

  it('returns nothing for two empty rankings', () => {
    expect(fuseRankings([], [])).toEqual([]);
  });

  /**
   * The constant damps the gap between adjacent ranks. With k = 0 the top hit
   * is worth twice the second; with k = 60 they are within two percent, which
   * is what lets the second ranker's opinion actually matter.
   */
  it('damps the gap between adjacent ranks', () => {
    const undamped = fuseRankings(v('a', 'b'), [], 0);
    expect(undamped[0]!.score / undamped[1]!.score).toBeCloseTo(2, 5);

    const damped = fuseRankings(v('a', 'b'), [], RRF_K);
    expect(damped[0]!.score / damped[1]!.score).toBeLessThan(1.02);
  });
});
