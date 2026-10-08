import { describe, it, expect } from 'vitest';
import { chunkText, estimateTokens } from '../../services/rag-chunker.js';

/** Every chunk must be exactly what its offsets say it is, or a citation
 *  pointing at those offsets quotes the wrong text. */
function assertOffsetsAreHonest(source: string, chunks: ReturnType<typeof chunkText>): void {
  for (const chunk of chunks) {
    expect(source.slice(chunk.startOffset, chunk.endOffset)).toBe(chunk.text);
  }
}

describe('rag chunker', () => {
  it('returns nothing for empty or blank input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n  \t ')).toEqual([]);
  });

  it('keeps a short document whole', () => {
    const text = 'The gateway uses SQLite. It stores vectors as float32 blobs.';
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toBe(text);
    assertOffsetsAreHonest(text, chunks);
  });

  it('reports offsets that actually index the source', () => {
    const paragraph = 'Retrieval needs chunks. '.repeat(40);
    const text = `${paragraph}\n\n${'Citations need offsets. '.repeat(40)}`;
    const chunks = chunkText(text, { maxChars: 300 });

    expect(chunks.length).toBeGreaterThan(1);
    assertOffsetsAreHonest(text, chunks);
  });

  it('prefers a paragraph break over a sentence break', () => {
    const first = 'A'.repeat(180);
    const second = 'B'.repeat(180);
    const text = `${first}. More text here.\n\n${second}. And more.`;

    const chunks = chunkText(text, { maxChars: 260, overlapChars: 0 });
    // The first chunk should stop at the blank line, not mid-way through B.
    expect(chunks[0]?.text.endsWith('More text here.')).toBe(true);
    expect(chunks[0]?.text).not.toContain('B');
  });

  it('falls back to a sentence boundary when there is no paragraph', () => {
    const text = `${'word '.repeat(50)}. ${'Other '.repeat(50)}. Done.`;
    const chunks = chunkText(text, { maxChars: 300, overlapChars: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    // A sentence-ending period, not a mid-word cut.
    expect(chunks[0]?.text.trimEnd().endsWith('.')).toBe(true);
  });

  it('does not treat an abbreviation as the end of a sentence', () => {
    // "e.g. the" and "Node.js is" must not become boundaries.
    const text = `Use a runtime, e.g. the one in Node.js is fine for this. ${'padding '.repeat(60)}`;
    const chunks = chunkText(text, { maxChars: 400, overlapChars: 0 });
    expect(chunks[0]?.text).toContain('Node.js is fine');
  });

  it('still terminates on text with no punctuation at all', () => {
    // Minified JSON: no sentences, no paragraphs, no spaces.
    const text = `{"a":${'1234567890'.repeat(400)}}`;
    const chunks = chunkText(text, { maxChars: 500, overlapChars: 50 });

    expect(chunks.length).toBeGreaterThan(5);
    assertOffsetsAreHonest(text, chunks);
    // Nothing silently dropped: the last chunk reaches the end.
    expect(chunks[chunks.length - 1]?.endOffset).toBe(text.length);
  });

  it('covers the whole document', () => {
    const text = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} has some content in it.`).join('\n\n');
    const chunks = chunkText(text, { maxChars: 300, overlapChars: 40 });

    expect(chunks[0]?.startOffset).toBe(0);
    expect(chunks[chunks.length - 1]?.endOffset).toBe(text.trimEnd().length);

    // Consecutive chunks must not leave a gap — a gap is content that can
    // never be retrieved.
    for (let i = 1; i < chunks.length; i += 1) {
      expect(chunks[i]!.startOffset).toBeLessThanOrEqual(chunks[i - 1]!.endOffset);
    }
  });

  it('overlaps so a fact straddling a boundary survives intact', () => {
    const filler = 'Some filler sentence here. '.repeat(20);
    const text = `${filler}The request timeout is 30 seconds.${filler}`;
    const chunks = chunkText(text, { maxChars: 300, overlapChars: 120 });

    // The whole fact appears in at least one chunk, not split across two.
    expect(chunks.some((c) => c.text.includes('The request timeout is 30 seconds.'))).toBe(true);
  });

  it('numbers chunks in reading order', () => {
    const text = Array.from({ length: 12 }, (_, i) => `Section ${i}.`).join('\n\n');
    const chunks = chunkText(text, { maxChars: 200, overlapChars: 0 });
    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i));
    for (let i = 1; i < chunks.length; i += 1) {
      expect(chunks[i]!.startOffset).toBeGreaterThan(chunks[i - 1]!.startOffset);
    }
  });

  it('never emits a chunk padded with surrounding whitespace', () => {
    const text = 'First part.\n\n\n\n   Second part after lots of space.\n\n\n';
    const chunks = chunkText(text, { maxChars: 40, overlapChars: 0 });
    for (const chunk of chunks) {
      expect(chunk.text).toBe(chunk.text.trim());
      expect(chunk.text.length).toBeGreaterThan(0);
    }
    assertOffsetsAreHonest(text, chunks);
  });

  it('clamps absurd options instead of hanging or exploding', () => {
    const text = 'Sentence one. '.repeat(200);

    // Tiny maxChars is raised to the floor rather than producing 1-char chunks.
    const tiny = chunkText(text, { maxChars: 1 });
    expect(tiny.length).toBeGreaterThan(0);
    expect(Math.max(...tiny.map((c) => c.text.length))).toBeGreaterThan(100);

    // Overlap larger than the chunk would never advance; it is capped.
    const greedy = chunkText(text, { maxChars: 300, overlapChars: 100000 });
    expect(greedy.length).toBeGreaterThan(0);
    expect(greedy[greedy.length - 1]?.endOffset).toBe(text.trimEnd().length);
  });

  it('handles a document that is one enormous word', () => {
    const text = 'x'.repeat(5000);
    const chunks = chunkText(text, { maxChars: 400, overlapChars: 0 });
    expect(chunks.length).toBe(Math.ceil(5000 / 400));
    assertOffsetsAreHonest(text, chunks);
  });

  it('estimates tokens conservatively', () => {
    expect(estimateTokens('')).toBe(1);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });
});
