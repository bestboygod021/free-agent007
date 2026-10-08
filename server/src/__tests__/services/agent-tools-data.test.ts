import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initDb } from '../../db/index.js';
import { invokeTool, clearTools } from '../../services/agent-tools.js';
import { registerBuiltinTools } from '../../services/agent-tools-builtin.js';
import { registerDataTools } from '../../services/agent-tools-data.js';
import { unattendedTools } from '../../services/agent-evidence.js';

let workspace: string;

function call(tool: string, args: Record<string, unknown>) {
  return invokeTool({
    tool,
    args,
    organizationId: 'acme',
    projectId: 'web',
    workspaceRoot: workspace,
  });
}

describe('data tools', () => {
  beforeEach(async () => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    clearTools();
    registerBuiltinTools();
    registerDataTools();
    workspace = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'data-tools-')));
    await fs.writeFile(
      path.join(workspace, 'sales.csv'),
      ['Region,Units,Revenue', 'north,10,199.50', 'south,5,99.75', 'north,2,50.00'].join('\n'),
      'utf8',
    );
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it('is classified read-only, so a phase may actually use it', () => {
    const safe = unattendedTools();
    expect(safe).toContain('data.csv.query');
    expect(safe).toContain('data.csv.schema.read');
  });

  it('answers an aggregate question a model should not do by hand', async () => {
    const res = await call('data.csv.query', {
      path: 'sales.csv',
      sql: 'SELECT region, SUM(units) AS units FROM data GROUP BY region ORDER BY region',
    });
    expect(res.ok).toBe(true);
    const r = res.result as { columns: string[]; rows: unknown[][] };
    expect(r.columns).toEqual(['region', 'units']);
    expect(r.rows).toEqual([
      ['north', 12],
      ['south', 5],
    ]);
  });

  it('describes the schema so a query can use real column names', async () => {
    const res = await call('data.csv.schema.read', { path: 'sales.csv' });
    const r = res.result as {
      rowCount: number;
      columns: { name: string; type: string; original: string }[];
    };
    expect(r.rowCount).toBe(3);
    expect(r.columns.map((c) => `${c.name}:${c.type}`)).toEqual([
      'region:TEXT',
      'units:INTEGER',
      'revenue:REAL',
    ]);
  });

  it('refuses a write through the tool layer', async () => {
    const res = await call('data.csv.query', { path: 'sales.csv', sql: 'DELETE FROM data' });
    expect(res.outcome).toBe('error');
    expect(res.reason).toContain('read-only');
  });

  it('refuses ATTACH through the tool layer', async () => {
    const res = await call('data.csv.query', {
      path: 'sales.csv',
      sql: "ATTACH DATABASE '/etc/passwd' AS x",
    });
    expect(res.outcome).toBe('error');
    expect(res.reason).toContain('ATTACH');
  });

  it('cannot read a CSV outside the workspace', async () => {
    const res = await call('data.csv.query', {
      path: '../../etc/passwd',
      sql: 'SELECT 1',
    });
    expect(res.outcome).toBe('error');
    expect(res.reason).toContain('escapes the workspace');
  });

  it('will not open a credential file as data', async () => {
    await fs.writeFile(path.join(workspace, '.env'), 'k,v\nSECRET,live_value\n', 'utf8');
    const res = await call('data.csv.schema.read', { path: '.env' });
    // Found by this test before the guard existed: the file parsed as a
    // two-column CSV and its values came back as sample rows. A guard on the
    // fs tools is not inherited by a new tool that opens files.
    expect(res.outcome).toBe('error');
    expect(res.reason).toContain('refusing to read');
    expect(JSON.stringify(res)).not.toContain('live_value');
  });

  it('rejects arguments that do not match the schema', async () => {
    const res = await call('data.csv.query', { path: 'sales.csv' });
    expect(res.outcome).toBe('denied');
    expect(res.reason).toContain('invalid arguments');
  });
});
