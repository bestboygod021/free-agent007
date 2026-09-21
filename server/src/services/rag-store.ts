/**
 * Retrieval with citations.
 *
 * `runEmbeddings()` could already turn text into vectors across 20 provider
 * families. Nothing stored them, so nothing could be found again. This is the
 * storage and search half: ingest a document, chunk it, embed the chunks, and
 * later answer a question with the passages that support it — each one
 * pointing at the exact characters it came from.
 *
 * The citation is the part worth being strict about. A retrieval system that
 * returns plausible text without a checkable source is a system that launders
 * a model's guesses into apparent evidence. So every hit carries the document,
 * the character offsets, and the text as stored — a caller can re-read the
 * source span and confirm the quote is real.
 *
 * Ranking is brute-force cosine similarity over the tenant's chunks. There is
 * no ANN index (no sqlite-vss in the lockfile) and for the corpus sizes this
 * serves that is the right trade: exact results, no index to rebuild, and the
 * scan is bounded by (organization_id, project_id) in SQL so it never touches
 * another tenant's rows.
 */

import { createHash, randomBytes } from 'node:crypto';
import { packContext, type ContextItem } from '@freellmapi/agent/core/knowledge-fabric.js';
import { getDb } from '../db/index.js';
import { runEmbeddings, resolveFamily } from './embeddings.js';
import { chunkText, estimateTokens, type ChunkOptions } from './rag-chunker.js';

/** Documents above this are refused rather than silently truncated: a
 *  half-ingested document retrieves confidently and cites nothing real. */
const MAX_DOCUMENT_CHARS = 2_000_000;

/** One embedding call per batch of chunks. Providers cap batch size, and a
 *  huge array is also a huge failure if the call dies halfway. */
const EMBED_BATCH = 64;

export class RagError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
    this.name = 'RagError';
  }
}

export interface IngestInput {
  organizationId: string;
  projectId: string;
  title: string;
  content: string;
  sourceUri?: string;
  model?: string;
  chunking?: ChunkOptions;
  now?: number;
}

export interface IngestResult {
  documentId: string;
  chunks: number;
  family: string;
  deduplicated: boolean;
}

export interface Citation {
  documentId: string;
  title: string;
  sourceUri: string | null;
  chunkId: string;
  /** Which slice of the document this is, and how many there are. */
  ordinal: number;
  startOffset: number;
  endOffset: number;
  text: string;
  score: number;
}

export interface SearchResult {
  citations: Citation[];
  /** Chunks that matched but did not fit the context budget. */
  omitted: number;
  family: string;
  tokenEstimate: number;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** float32 little-endian, matching the BLOB layout the migration documents. */
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

/**
 * Cosine similarity, computed without pre-normalising.
 *
 * Providers do not agree on whether they return unit vectors — OpenAI does,
 * several others do not — so assuming normalisation would silently skew
 * ranking for some families.
 */
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

async function embedBatched(model: string | undefined, inputs: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < inputs.length; i += EMBED_BATCH) {
    const batch = inputs.slice(i, i + EMBED_BATCH);
    const result = await runEmbeddings(model, batch);
    const embeddings = result.vectors;
    if (embeddings.length !== batch.length) {
      throw new RagError(
        `embedding provider returned ${embeddings.length} vectors for ${batch.length} inputs`,
        502,
      );
    }
    vectors.push(...embeddings);
  }
  return vectors;
}

/**
 * Store a document and make it retrievable.
 *
 * Re-ingesting byte-identical content in the same project is a no-op: the
 * existing document is returned rather than duplicated, so syncing a folder
 * twice does not double every search result.
 */
export async function ingestDocument(input: IngestInput): Promise<IngestResult> {
  const now = input.now ?? Date.now();
  const title = input.title.trim();
  if (title === '') throw new RagError('"title" must be a non-empty string.');
  if (typeof input.content !== 'string' || input.content.trim() === '') {
    throw new RagError('"content" must be a non-empty string.');
  }
  if (input.content.length > MAX_DOCUMENT_CHARS) {
    throw new RagError(
      `document is ${input.content.length} characters; the limit is ${MAX_DOCUMENT_CHARS}.`,
      413,
    );
  }

  const family = resolveFamily(input.model);
  if (!family) {
    throw new RagError(`unknown embedding model "${input.model}".`);
  }

  const db = getDb();
  const contentHash = sha256(input.content);

  const existing = db
    .prepare(
      'SELECT document_id FROM rag_documents WHERE organization_id = ? AND project_id = ? AND content_hash = ?',
    )
    .get(input.organizationId, input.projectId, contentHash) as { document_id?: string } | undefined;

  if (existing?.document_id) {
    const count = db
      .prepare('SELECT COUNT(*) AS n FROM rag_chunks WHERE document_id = ?')
      .get(existing.document_id) as { n: number };
    return { documentId: existing.document_id, chunks: count.n, family, deduplicated: true };
  }

  const chunks = chunkText(input.content, input.chunking ?? {});
  if (chunks.length === 0) throw new RagError('document produced no chunks.');

  // Embed before writing anything. A provider outage should leave no
  // half-ingested document behind, and this is the only step that can fail
  // slowly.
  const vectors = await embedBatched(input.model, chunks.map((c) => c.text));
  const dimensions = vectors[0]?.length ?? 0;
  if (dimensions === 0) throw new RagError('embedding provider returned empty vectors.', 502);

  const documentId = `doc_${randomBytes(9).toString('hex')}`;

  db.transaction(() => {
    db.prepare(
      `INSERT INTO rag_documents
         (document_id, organization_id, project_id, title, source_uri, content_hash, content, byte_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      documentId,
      input.organizationId,
      input.projectId,
      title,
      input.sourceUri ?? null,
      contentHash,
      input.content,
      Buffer.byteLength(input.content, 'utf8'),
      now,
    );

    const insertChunk = db.prepare(
      `INSERT INTO rag_chunks
         (chunk_id, document_id, organization_id, project_id, ordinal, start_offset, end_offset, text, token_estimate, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertVector = db.prepare(
      'INSERT INTO rag_embeddings (chunk_id, family, dimensions, vector, created_at) VALUES (?, ?, ?, ?, ?)',
    );

    chunks.forEach((chunk, i) => {
      const chunkId = `chk_${randomBytes(9).toString('hex')}`;
      insertChunk.run(
        chunkId,
        documentId,
        input.organizationId,
        input.projectId,
        chunk.ordinal,
        chunk.startOffset,
        chunk.endOffset,
        chunk.text,
        chunk.tokenEstimate,
        now,
      );
      insertVector.run(chunkId, family, dimensions, vectorToBlob(vectors[i] ?? []), now);
    });
  })();

  return { documentId, chunks: chunks.length, family, deduplicated: false };
}

export interface SearchInput {
  organizationId: string;
  projectId: string;
  query: string;
  /** Maximum passages to return. */
  limit?: number;
  /** Token budget for the returned passages, enforced by the kernel packer. */
  tokenBudget?: number;
  /** Discard weak matches rather than padding the answer with noise. */
  minScore?: number;
  model?: string;
}

/**
 * Find the passages that answer a question.
 *
 * Selection is two-stage: cosine similarity ranks every candidate, then the
 * kernel's `packContext` fits the best of them into a token budget. Using the
 * kernel packer rather than a local slice keeps one behaviour in one place —
 * it also drops anything marked `secret_like`, which is the behaviour we want
 * and would otherwise have to reimplement.
 */
export async function searchDocuments(input: SearchInput): Promise<SearchResult> {
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  if (query === '') throw new RagError('"query" must be a non-empty string.');

  const family = resolveFamily(input.model);
  if (!family) throw new RagError(`unknown embedding model "${input.model}".`);

  const limit = Math.min(Math.max(Math.floor(input.limit ?? 5), 1), 50);
  const tokenBudget = Math.min(Math.max(Math.floor(input.tokenBudget ?? 2000), 1), 100_000);
  const minScore = typeof input.minScore === 'number' ? input.minScore : 0.2;

  const db = getDb();
  // Tenant scoping in SQL, not after loading: a caller cannot reach another
  // tenant's chunks however large a result they ask for.
  const rows = db
    .prepare(
      `SELECT c.chunk_id AS chunkId, c.document_id AS documentId, c.ordinal AS ordinal,
              c.start_offset AS startOffset, c.end_offset AS endOffset, c.text AS text,
              c.token_estimate AS tokenEstimate,
              d.title AS title, d.source_uri AS sourceUri,
              e.vector AS vector, e.dimensions AS dimensions
         FROM rag_chunks c
         JOIN rag_documents d ON d.document_id = c.document_id
         JOIN rag_embeddings e ON e.chunk_id = c.chunk_id AND e.family = ?
        WHERE c.organization_id = ? AND c.project_id = ?`,
    )
    .all(family, input.organizationId, input.projectId) as Array<{
    chunkId: string;
    documentId: string;
    ordinal: number;
    startOffset: number;
    endOffset: number;
    text: string;
    tokenEstimate: number;
    title: string;
    sourceUri: string | null;
    vector: Buffer;
    dimensions: number;
  }>;

  if (rows.length === 0) {
    return { citations: [], omitted: 0, family, tokenEstimate: 0 };
  }

  const [queryVector] = await embedBatched(input.model, [query]);
  if (!queryVector) throw new RagError('could not embed the query.', 502);
  const queryTyped = Float32Array.from(queryVector);

  const scored = rows
    .map((row) => ({
      row,
      // A vector from a different-dimension model cannot be compared; skip it
      // rather than returning a meaningless number.
      score: row.dimensions === queryTyped.length
        ? cosine(queryTyped, blobToVector(row.vector, row.dimensions))
        : Number.NEGATIVE_INFINITY,
    }))
    .filter((c) => c.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (scored.length === 0) {
    return { citations: [], omitted: 0, family, tokenEstimate: 0 };
  }

  const items: ContextItem[] = scored.map(({ row, score }) => ({
    itemId: row.chunkId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    contentHash: sha256(row.text),
    tokenEstimate: Math.max(1, row.tokenEstimate || estimateTokens(row.text)),
    // packContext ranks on relevance; cosine can be negative, and a negative
    // relevance would sort below items it should outrank.
    relevance: Math.max(0, score),
    trust: 'observed',
    taint: 'clean',
    allowedSubjectIds: [],
    provenanceHash: sha256(`${row.documentId}:${row.startOffset}:${row.endOffset}`),
    sourceRevision: row.documentId,
  }));

  const packed = packContext(items, tokenBudget);
  const selected = new Set(packed.selectedItemIds);

  const citations = scored
    .filter(({ row }) => selected.has(row.chunkId))
    .map(({ row, score }) => ({
      documentId: row.documentId,
      title: row.title,
      sourceUri: row.sourceUri,
      chunkId: row.chunkId,
      ordinal: row.ordinal,
      startOffset: row.startOffset,
      endOffset: row.endOffset,
      text: row.text,
      score,
    }));

  return {
    citations,
    omitted: scored.length - citations.length,
    family,
    tokenEstimate: packed.tokenEstimate,
  };
}

/**
 * Re-read a citation from the stored document.
 *
 * This is what makes a citation checkable rather than decorative: it slices
 * the source text at the offsets the citation claims. If a chunk's text and
 * its offsets ever disagree, this returns the document's version — the
 * authoritative one.
 */
export function resolveCitation(input: {
  organizationId: string;
  projectId: string;
  chunkId: string;
}): { text: string; documentId: string; title: string; matchesStoredChunk: boolean } | null {
  const row = getDb()
    .prepare(
      `SELECT c.text AS chunkText, c.start_offset AS startOffset, c.end_offset AS endOffset,
              d.document_id AS documentId, d.title AS title, d.content AS content
         FROM rag_chunks c
         JOIN rag_documents d ON d.document_id = c.document_id
        WHERE c.chunk_id = ? AND c.organization_id = ? AND c.project_id = ?`,
    )
    .get(input.chunkId, input.organizationId, input.projectId) as
    | {
        chunkText: string;
        startOffset: number;
        endOffset: number;
        documentId: string;
        title: string;
        content: string;
      }
    | undefined;

  if (!row) return null;

  const fromSource = row.content.slice(row.startOffset, row.endOffset);
  return {
    text: fromSource,
    documentId: row.documentId,
    title: row.title,
    matchesStoredChunk: fromSource === row.chunkText,
  };
}

export function listDocuments(organizationId: string, projectId: string): Array<{
  documentId: string;
  title: string;
  sourceUri: string | null;
  chunks: number;
  byteSize: number;
  createdAt: number;
}> {
  return getDb()
    .prepare(
      `SELECT d.document_id AS documentId, d.title AS title, d.source_uri AS sourceUri,
              d.byte_size AS byteSize, d.created_at AS createdAt,
              (SELECT COUNT(*) FROM rag_chunks c WHERE c.document_id = d.document_id) AS chunks
         FROM rag_documents d
        WHERE d.organization_id = ? AND d.project_id = ?
        ORDER BY d.created_at DESC`,
    )
    .all(organizationId, projectId) as Array<{
    documentId: string;
    title: string;
    sourceUri: string | null;
    chunks: number;
    byteSize: number;
    createdAt: number;
  }>;
}

/** Delete a document, its chunks and their vectors. Scoped, so one tenant
 *  cannot delete another's document by guessing an id. */
export function deleteDocument(input: {
  organizationId: string;
  projectId: string;
  documentId: string;
}): boolean {
  const result = getDb()
    .prepare(
      'DELETE FROM rag_documents WHERE document_id = ? AND organization_id = ? AND project_id = ?',
    )
    .run(input.documentId, input.organizationId, input.projectId);
  return result.changes === 1;
}
