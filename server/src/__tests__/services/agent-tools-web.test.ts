import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { initDb } from '../../db/index.js';
import { listTools, invokeTool, clearTools } from '../../services/agent-tools.js';
import { registerWebTools, setWebFetchImplForTest } from '../../services/agent-tools-web.js';
import { unattendedTools } from '../../services/agent-evidence.js';

/**
 * The network is faked at the `fetch` boundary. There is no live HTTP here on
 * purpose: a test that reaches the internet fails for reasons unrelated to the
 * code, and the destination guard is exactly what we want to assert rather
 * than route around.
 */
function mockFetch(pages: Record<string, { body: string; type?: string; status?: number }>) {
  return vi.fn(async (url: string) => {
    const page = pages[url];
    if (!page) return new Response('not found', { status: 404 });
    return new Response(page.body, {
      status: page.status ?? 200,
      headers: { 'content-type': page.type ?? 'text/html' },
    });
  });
}

function call(tool: string, args: Record<string, unknown>) {
  return invokeTool({
    tool,
    args,
    organizationId: 'acme',
    projectId: 'web',
    workspaceRoot: '/tmp',
  });
}

describe('web tools', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    clearTools();
    registerWebTools();
  });

  afterEach(() => setWebFetchImplForTest(undefined));

  it('registers both tools with usable schemas', () => {
    const names = listTools().map((t) => t.name);
    expect(names).toContain('web.page.read');
    expect(names).toContain('web.page.search');
  });

  /**
   * The name is part of the security interface, not a label. The policy engine
   * classifies by dotted suffix, and a name it does not recognise falls to the
   * catch-all -- high risk, approval required -- which silently removes the
   * tool from every autonomous phase.
   */
  it('names classify as reads, so an autonomous phase may use them', () => {
    const unattended = unattendedTools();
    expect(unattended).toContain('web.page.read');
    expect(unattended).toContain('web.page.search');
  });

  it('reads a page and returns title, text and links', async () => {
    setWebFetchImplForTest(
      mockFetch({
        'https://example.com/': {
          body:
            '<html><head><title>Example</title></head><body><p>Hello world</p>' +
            '<a href="/more">more</a><script>tracker()</script></body></html>',
        },
      }) as unknown as typeof fetch,
    );
    const result = await call('web.page.read', { url: 'https://example.com/' });

    expect(result.outcome).toBe('ok');
    const payload = result.result as Record<string, unknown>;
    expect(payload.title).toBe('Example');
    expect(String(payload.text)).toContain('Hello world');
    expect(String(payload.text)).not.toContain('tracker()');
    expect(payload.links).toEqual(['/more']);
  });

  it('refuses a URL that resolves to a blocked address', async () => {
    const result = await call('web.page.read', {
      url: 'http://169.254.169.254/latest/meta-data/',
    });

    // The guard is real DNS-backed classification, so this needs no mock: the
    // metadata address is recognised from its literal form.
    expect(result.outcome).toBe('error');
    expect(String(result.reason)).toMatch(/metadata|refused/i);
  });

  it('refuses loopback', async () => {
    const result = await call('web.page.read', { url: 'http://127.0.0.1:3001/api/agent/runs' });
    expect(result.outcome).toBe('error');
  });

  it('rejects a non-URL argument at the schema boundary', async () => {
    const result = await call('web.page.read', { url: 123 });
    expect(result.outcome).not.toBe('ok');
  });

  it('rejects unknown arguments', async () => {
    const result = await call('web.page.read', { url: 'https://example.com/', follow: true });
    expect(result.outcome).not.toBe('ok');
  });
});
