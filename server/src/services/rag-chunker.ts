/**
 * Splitting a document into retrievable pieces.
 *
 * Chunking decides what retrieval can ever return, so it is worth doing
 * carefully rather than slicing every N characters. A chunk cut mid-sentence
 * retrieves badly (the embedding describes half a thought) and cites worse —
 * a citation that begins "…and therefore the value must" is not checkable.
 *
 * The strategy is to split at the strongest boundary available: paragraph
 * breaks first, then sentence ends, and only then a hard character cut for
 * pathological input like minified JSON or a wall of text with no punctuation.
 *
 * Pure and synchronous on purpose: no database, no network, no clock. The
 * offsets it returns index into the original string, which is what makes a
 * citation verifiable later.
 */

export interface Chunk {
  ordinal: number;
  /** Inclusive character offset into the source text. */
  startOffset: number;
  /** Exclusive character offset into the source text. */
  endOffset: number;
  text: string;
  tokenEstimate: number;
}

export interface ChunkOptions {
  /** Target size in characters. Chunks may come in under this at a boundary. */
  maxChars?: number;
  /** How much of the previous chunk to repeat at the start of the next. */
  overlapChars?: number;
}

const DEFAULT_MAX_CHARS = 1200;
const DEFAULT_OVERLAP_CHARS = 150;

/** Hard bounds. A tiny chunk retrieves noise; an enormous one blows the
 *  context budget it is supposed to fit inside. */
const MIN_MAX_CHARS = 200;
const MAX_MAX_CHARS = 8000;

/**
 * Rough token count.
 *
 * Deliberately an estimate: the real tokeniser depends on which provider ends
 * up serving the request, and this only has to be good enough to pack a
 * context budget. Four characters per token is the usual English
 * approximation; it over-counts code slightly, which errs toward staying
 * under budget.
 */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Paragraph breaks: one or more blank lines. */
const PARAGRAPH = /\n\s*\n/g;

/**
 * The end of a sentence, followed by whitespace.
 *
 * Requires a capital letter, digit or quote after the space so that "e.g. the"
 * and "Node.js is" are not treated as boundaries. Not perfect — no regex is —
 * but it fails toward *not* splitting, which is the safer direction.
 */
const SENTENCE_END = /[.!?]["')\]]?\s+(?=[A-Z0-9"'([])/g;

function lastMatchBefore(text: string, pattern: RegExp, limit: number): number {
  pattern.lastIndex = 0;
  let best = -1;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const end = match.index + match[0].length;
    if (end > limit) break;
    // Ignore a boundary so early that the chunk would be mostly empty.
    if (end >= limit * 0.4) best = end;
    if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
  }
  return best;
}

/**
 * Where to end a chunk that starts at 0 in `text`, given a maximum length.
 * Returns the exclusive end offset.
 */
function findBreak(text: string, maxChars: number): number {
  if (text.length <= maxChars) return text.length;

  const window = text.slice(0, maxChars);

  const paragraph = lastMatchBefore(window, PARAGRAPH, maxChars);
  if (paragraph > 0) return paragraph;

  const sentence = lastMatchBefore(window, SENTENCE_END, maxChars);
  if (sentence > 0) return sentence;

  // No sentence boundary: fall back to a line break, then a space, then a
  // hard cut. Minified JSON and long tables land here.
  const newline = window.lastIndexOf('\n');
  if (newline >= maxChars * 0.4) return newline + 1;

  const space = window.lastIndexOf(' ');
  if (space >= maxChars * 0.4) return space + 1;

  return maxChars;
}

/**
 * Split `text` into overlapping chunks.
 *
 * Overlap exists so a fact that straddles a boundary is still wholly present
 * in one chunk. Without it, "the timeout is" and "30 seconds" become separate
 * embeddings and neither answers the question.
 */
export function chunkText(text: string, options: ChunkOptions = {}): Chunk[] {
  const maxChars = Math.min(
    Math.max(Math.floor(options.maxChars ?? DEFAULT_MAX_CHARS), MIN_MAX_CHARS),
    MAX_MAX_CHARS,
  );
  // Overlap must leave room to make progress, or chunking never terminates.
  const overlapChars = Math.min(
    Math.max(Math.floor(options.overlapChars ?? DEFAULT_OVERLAP_CHARS), 0),
    Math.floor(maxChars / 2),
  );

  if (text.trim() === '') return [];

  const chunks: Chunk[] = [];
  let cursor = 0;
  let ordinal = 0;

  while (cursor < text.length) {
    const remaining = text.slice(cursor);
    const breakAt = findBreak(remaining, maxChars);
    const rawEnd = cursor + breakAt;

    const slice = text.slice(cursor, rawEnd);
    const trimmedStart = slice.length - slice.trimStart().length;
    const trimmedEnd = slice.length - slice.trimEnd().length;
    const startOffset = cursor + trimmedStart;
    const endOffset = rawEnd - trimmedEnd;

    if (endOffset > startOffset) {
      const chunkText_ = text.slice(startOffset, endOffset);
      chunks.push({
        ordinal,
        startOffset,
        endOffset,
        text: chunkText_,
        tokenEstimate: estimateTokens(chunkText_),
      });
      ordinal += 1;
    }

    if (rawEnd >= text.length) break;

    // Step forward, then back up by the overlap — but never past where this
    // chunk began, or the loop stalls.
    const next = Math.max(rawEnd - overlapChars, cursor + 1);
    cursor = next;
  }

  return chunks;
}
