import { describe, it, expect, beforeEach } from 'vitest';
import { initDb } from '../../db/index.js';
import { remember, recall, forget, pruneExpired, memoryStats } from '../../services/agent-memory.js';

/**
 * Durable agent memory.
 *
 * The kernel's memory module ranks records but stores none, so these tests
 * focus on what the storage layer adds: persistence, tenant isolation,
 * deduplication and expiry — plus proof that the kernel's safety rules are
 * still enforced rather than bypassed on the way to SQLite.
 */

const SOURCE = { sourceType: 'tool', sourceId: 'read:config.ts', evidenceHash: 'h1' } as const;

function store(overrides: Partial<Parameters<typeof remember>[0]> = {}) {
  return remember({
    organizationId: 'acme',
    projectId: 'web',
    kind: 'project_fact',
    content: 'The build uses Vite and outputs to dist',
    trust: 'verified',
    source: { ...SOURCE },
    ...overrides,
  });
}

describe('agent memory service', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
  });

  it('stores a fact and recalls it later', () => {
    const { created, memory } = store();
    expect(created).toBe(true);
    expect(memory.contentHash).toMatch(/^[0-9a-f]{8}$/);

    const hits = recall({ organizationId: 'acme', projectId: 'web', query: 'vite build output' });
    expect(hits).toHaveLength(1);
    expect(hits[0].content).toContain('Vite');
    // Provenance is non-negotiable: a recalled fact must say where it came from.
    expect(hits[0].provenanceRequired).toBe(true);
    expect(hits[0].source.sourceId).toBe('read:config.ts');
  });

  it('ranks the more relevant fact first', () => {
    store({ content: 'Chose SQLite over Postgres for single-file deployment' });
    store({ content: 'The CI pipeline runs on GitHub Actions', source: { ...SOURCE, evidenceHash: 'h2' } });

    // Lexical scoring: this query overlaps the SQLite fact on two terms and the
    // CI fact on none, so relevance — not insertion order — must decide.
    const hits = recall({ organizationId: 'acme', projectId: 'web', query: 'SQLite deployment' });
    expect(hits[0].content).toContain('SQLite');
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
  });

  it('never leaks memory across organizations', () => {
    store({ organizationId: 'acme', content: 'acme internal architecture note' });

    const theirs = recall({ organizationId: 'evilcorp', projectId: 'web', query: 'architecture note' });
    expect(theirs).toEqual([]);
  });

  it('never leaks memory across projects in the same organization', () => {
    store({ projectId: 'web', content: 'web project uses Tailwind' });

    const other = recall({ organizationId: 'acme', projectId: 'mobile', query: 'Tailwind' });
    expect(other).toEqual([]);
  });

  it('does not store the same fact twice', () => {
    const first = store();
    const second = store();

    expect(second.created).toBe(false);
    expect(second.memory.memoryId).toBe(first.memory.memoryId);
    expect(memoryStats('acme', 'web').total).toBe(1);
  });

  it('refuses secret-like content instead of persisting it', () => {
    expect(() =>
      store({ content: `api_key= ${'x'.repeat(20)}` }),
    ).toThrow(/secret-like/);
    expect(memoryStats('acme', 'web').total).toBe(0);
  });

  it('refuses a fact with no provenance', () => {
    expect(() =>
      store({ source: { sourceType: 'tool', sourceId: '', evidenceHash: '' } }),
    ).toThrow(/provenance/);
  });

  it('honours trust filtering', () => {
    store({ content: 'unverified rumour about the API', trust: 'untrusted' });

    // Default recall excludes untrusted material.
    expect(recall({ organizationId: 'acme', projectId: 'web', query: 'rumour API' })).toEqual([]);

    const permissive = recall({
      organizationId: 'acme',
      projectId: 'web',
      query: 'rumour API',
      allowedTrust: ['untrusted', 'observed', 'verified'],
    });
    expect(permissive).toHaveLength(1);
  });

  it('stops recalling a fact once it expires', () => {
    const now = Date.now();
    store({ content: 'temporary deploy freeze is in effect', ttlMs: 1000, now });

    expect(
      recall({ organizationId: 'acme', projectId: 'web', query: 'deploy freeze', now: now + 500 }),
    ).toHaveLength(1);
    expect(
      recall({ organizationId: 'acme', projectId: 'web', query: 'deploy freeze', now: now + 5000 }),
    ).toEqual([]);
  });

  it('prunes expired rows so the table stays bounded', () => {
    const now = Date.now();
    store({ content: 'short lived note', ttlMs: 1000, now });
    store({ content: 'permanent architecture decision', source: { ...SOURCE, evidenceHash: 'h9' }, now });

    expect(pruneExpired(now + 5000)).toBe(1);
    expect(memoryStats('acme', 'web').total).toBe(1);
  });

  it('deletes only within the owning tenant', () => {
    const { memory } = store();

    expect(forget('evilcorp', 'web', memory.memoryId)).toBe(false);
    expect(forget('acme', 'web', memory.memoryId)).toBe(true);
    expect(memoryStats('acme', 'web').total).toBe(0);
  });

  it('summarises what it holds', () => {
    store({ content: 'fact one' });
    store({ kind: 'decision', content: 'decision one', trust: 'observed', source: { ...SOURCE, evidenceHash: 'h3' } });

    const stats = memoryStats('acme', 'web');
    expect(stats.total).toBe(2);
    expect(stats.byKind).toEqual({ project_fact: 1, decision: 1 });
    expect(stats.byTrust).toEqual({ verified: 1, observed: 1 });
  });
});
