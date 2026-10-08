import { getDb } from '../db/index.js';
import {
  createMemoryRecord,
  retrieveMemories,
  type MemoryHit,
  type MemoryKind,
  type MemoryRecord,
  type MemorySource,
  type MemoryTrust,
} from '@freellmapi/agent/core/memory-retrieval.js';

/**
 * Durable agent memory.
 *
 * The kernel's `memory-retrieval.ts` is a pure scorer: hand it an array of
 * records and a query, it ranks them. It deliberately owns no storage. That
 * makes it testable but it also meant memory died with the process — an agent
 * would re-learn the same project facts on every restart.
 *
 * This service is the storage half. It keeps the kernel authoritative for
 * *validation* (secret-like content is refused, provenance is mandatory) and
 * for *ranking*, and adds only what a database must own: persistence, tenant
 * scoping in SQL, deduplication and expiry.
 *
 * Scoping note: every query is filtered by (organizationId, projectId) in the
 * SQL itself, not after loading. A caller cannot read another tenant's memory
 * even by asking for a huge result set.
 */

export interface RememberInput {
  organizationId: string;
  projectId: string;
  kind: MemoryKind;
  content: string;
  trust: MemoryTrust;
  source: MemorySource;
  tags?: string[];
  /** Milliseconds from now until the fact should stop being recalled. */
  ttlMs?: number;
  now?: number;
}

export interface RecallInput {
  organizationId: string;
  projectId: string;
  query: string;
  maxResults?: number;
  allowedTrust?: MemoryTrust[];
  now?: number;
}

interface MemoryRow {
  memory_id: string;
  organization_id: string;
  project_id: string;
  kind: string;
  content: string;
  content_hash: string;
  trust: string;
  source_type: string;
  source_id: string;
  evidence_hash: string;
  tags: string;
  created_at: number;
  expires_at: number | null;
}

const DEFAULT_TRUST: MemoryTrust[] = ['observed', 'verified'];
/** Ranking happens in JS, so bound how many rows a single recall can load. */
const RECALL_SCAN_LIMIT = 2000;

function toRecord(row: MemoryRow): MemoryRecord {
  let tags: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.tags);
    if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === 'string');
  } catch {
    // A corrupt tags blob must not break recall — the content still matters.
  }
  return {
    memoryId: row.memory_id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    kind: row.kind as MemoryKind,
    content: row.content,
    contentHash: row.content_hash,
    trust: row.trust as MemoryTrust,
    source: {
      sourceType: row.source_type as MemorySource['sourceType'],
      sourceId: row.source_id,
      evidenceHash: row.evidence_hash,
    },
    tags,
    createdAt: row.created_at,
    ...(row.expires_at === null ? {} : { expiresAt: row.expires_at }),
  };
}

/**
 * Store one fact. Validation is the kernel's: empty or secret-like content and
 * missing provenance are rejected before anything touches SQLite.
 *
 * Re-storing identical content for the same project is a no-op that returns the
 * existing row, so an agent looping over the same file does not grow the table.
 */
export function remember(input: RememberInput): { memory: MemoryRecord; created: boolean } {
  const now = input.now ?? Date.now();
  const memoryId = `mem_${now.toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  // Kernel-side contract check (throws MemoryRetrievalContractError on bad input).
  const record = createMemoryRecord({
    memoryId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    kind: input.kind,
    content: input.content,
    source: input.source,
    trust: input.trust,
    createdAt: now,
    tags: input.tags ?? [],
    ...(input.ttlMs === undefined ? {} : { expiresAt: now + input.ttlMs }),
  });

  const db = getDb();
  const existing = db
    .prepare(
      `SELECT * FROM agent_memories
       WHERE organization_id = ? AND project_id = ? AND content_hash = ?`,
    )
    .get(record.organizationId, record.projectId, record.contentHash) as MemoryRow | undefined;

  if (existing) return { memory: toRecord(existing), created: false };

  db.prepare(
    `INSERT INTO agent_memories (
       memory_id, organization_id, project_id, kind, content, content_hash, trust,
       source_type, source_id, evidence_hash, tags, created_at, expires_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.memoryId,
    record.organizationId,
    record.projectId,
    record.kind,
    record.content,
    record.contentHash,
    record.trust,
    record.source.sourceType,
    record.source.sourceId,
    record.source.evidenceHash,
    JSON.stringify(record.tags),
    record.createdAt,
    record.expiresAt ?? null,
  );

  return { memory: record, created: true };
}

/**
 * Recall the most relevant facts for a query. Scoring (term overlap + a trust
 * bonus) is the kernel's; this only narrows the candidate set in SQL first.
 */
export function recall(input: RecallInput): MemoryHit[] {
  const now = input.now ?? Date.now();
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT * FROM agent_memories
       WHERE organization_id = ? AND project_id = ?
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(input.organizationId, input.projectId, now, RECALL_SCAN_LIMIT) as MemoryRow[];

  return retrieveMemories(rows.map(toRecord), {
    organizationId: input.organizationId,
    projectId: input.projectId,
    query: input.query,
    now,
    maxResults: input.maxResults ?? 10,
    allowedTrust: input.allowedTrust ?? DEFAULT_TRUST,
  });
}

/** Delete one fact. Returns false when it did not exist in that project. */
export function forget(organizationId: string, projectId: string, memoryId: string): boolean {
  const result = getDb()
    .prepare(
      `DELETE FROM agent_memories
       WHERE memory_id = ? AND organization_id = ? AND project_id = ?`,
    )
    .run(memoryId, organizationId, projectId);
  return result.changes > 0;
}

/** Drop expired rows. Safe to call on a timer; returns how many were removed. */
export function pruneExpired(now = Date.now()): number {
  return getDb()
    .prepare('DELETE FROM agent_memories WHERE expires_at IS NOT NULL AND expires_at <= ?')
    .run(now).changes;
}

export interface MemoryStats {
  total: number;
  byKind: Record<string, number>;
  byTrust: Record<string, number>;
  oldestAt: number | null;
  newestAt: number | null;
}

export function memoryStats(organizationId: string, projectId: string): MemoryStats {
  const db = getDb();
  const scope = [organizationId, projectId];

  const totals = db
    .prepare(
      `SELECT COUNT(*) AS total, MIN(created_at) AS oldest, MAX(created_at) AS newest
       FROM agent_memories WHERE organization_id = ? AND project_id = ?`,
    )
    .get(...scope) as { total: number; oldest: number | null; newest: number | null };

  const group = (column: 'kind' | 'trust'): Record<string, number> =>
    Object.fromEntries(
      (
        db
          .prepare(
            `SELECT ${column} AS k, COUNT(*) AS n FROM agent_memories
             WHERE organization_id = ? AND project_id = ? GROUP BY ${column}`,
          )
          .all(...scope) as { k: string; n: number }[]
      ).map((r) => [r.k, r.n]),
    );

  return {
    total: totals.total,
    byKind: group('kind'),
    byTrust: group('trust'),
    oldestAt: totals.oldest,
    newestAt: totals.newest,
  };
}
