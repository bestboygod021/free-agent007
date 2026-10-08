import { describe, it, expect, vi } from 'vitest';
import { fetchPage, WebFetchError, MAX_REDIRECTS } from '../../services/web-fetch.js';

/**
 * A fake `assess` that classifies by hostname, standing in for the real
 * DNS-backed guard. The real one is tested in url-guard.test.ts; what matters
 * here is *when* fetchPage consults it, not how it decides.
 */
const assess = vi.fn(async (url: string) => {
  const host = new URL(url).hostname;
  if (host === '169.254.169.254') {
    return { allowed: false, reason: 'resolves to a cloud metadata address' };
  }
  if (host === 'localhost' || host === '127.0.0.1') {
    return { allowed: false, reason: 'resolves to a loopback address' };
  }
  if (host === 'internal.corp') {
    return { allowed: false, reason: 'resolves to a private address' };
  }
  return { allowed: true };
});

function response(
  body: string,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { 'content-type': 'text/html', ...(init.headers ?? {}) },
  });
}

describe('fetchPage — destination control', () => {
  it('reads an allowed page', async () => {
    const fetchImpl = vi.fn(async () => response('<p>hello</p>'));
    const page = await fetchPage('https://example.com/', { fetchImpl, assess });
    expect(page.status).toBe(200);
    expect(page.body).toContain('hello');
    expect(page.finalUrl).toBe('https://example.com/');
  });

  it('refuses the cloud metadata endpoint', async () => {
    const fetchImpl = vi.fn(async () => response('secrets'));
    await expect(
      fetchPage('http://169.254.169.254/latest/meta-data/', { fetchImpl, assess }),
    ).rejects.toThrow(WebFetchError);
    // The point is not the error, it is that no request was made at all.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses loopback and private addresses', async () => {
    const fetchImpl = vi.fn(async () => response('internal'));
    for (const url of ['http://localhost:8080/', 'http://internal.corp/admin']) {
      await expect(fetchPage(url, { fetchImpl, assess })).rejects.toThrow(/refused to fetch/);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('asks for private addresses to be blocked regardless of provider settings', async () => {
    const spy = vi.fn(async () => ({ allowed: true }));
    await fetchPage('https://example.com/', {
      fetchImpl: vi.fn(async () => response('ok')),
      assess: spy,
    });
    // The provider path makes this opt-in via an env var. An agent following a
    // link must not inherit that choice.
    expect(spy).toHaveBeenCalledWith('https://example.com/', { blockPrivate: true });
  });
});

describe('fetchPage — redirects', () => {
  it('re-checks the destination on every hop', async () => {
    // The bypass this exists to stop: a public URL that 302s to the metadata
    // service. Checking only the first URL would let this through.
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === 'https://example.com/go') {
        return response('', {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data/' },
        });
      }
      return response('SHOULD NEVER BE READ');
    });

    await expect(fetchPage('https://example.com/go', { fetchImpl, assess })).rejects.toThrow(
      /cloud metadata/,
    );
    // One call for the redirect itself; the metadata address was never fetched.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('follows an allowed redirect and reports the chain', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === 'https://example.com/old') {
        return response('', { status: 301, headers: { location: 'https://example.com/new' } });
      }
      return response('<p>moved here</p>');
    });

    const page = await fetchPage('https://example.com/old', { fetchImpl, assess });
    expect(page.finalUrl).toBe('https://example.com/new');
    expect(page.chain).toEqual(['https://example.com/old', 'https://example.com/new']);
    expect(page.body).toContain('moved here');
  });

  it('resolves a relative Location against the current URL', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === 'https://example.com/a/b') {
        return response('', { status: 302, headers: { location: '../c' } });
      }
      return response('<p>at c</p>');
    });
    const page = await fetchPage('https://example.com/a/b', { fetchImpl, assess });
    expect(page.finalUrl).toBe('https://example.com/c');
  });

  it('refuses a relative redirect that escapes to a blocked host', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === 'https://example.com/start') {
        return response('', { status: 302, headers: { location: '//169.254.169.254/meta' } });
      }
      return response('SHOULD NEVER BE READ');
    });
    // A protocol-relative Location keeps the scheme but changes the host --
    // easy to miss if redirects are only compared by pathname.
    await expect(fetchPage('https://example.com/start', { fetchImpl, assess })).rejects.toThrow(
      /cloud metadata/,
    );
  });

  it('stops after the redirect limit', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const n = Number(new URL(url).searchParams.get('n') ?? '0');
      return response('', {
        status: 302,
        headers: { location: `https://example.com/?n=${n + 1}` },
      });
    });
    await expect(fetchPage('https://example.com/?n=0', { fetchImpl, assess })).rejects.toThrow(
      /too many redirects/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_REDIRECTS + 1);
  });

  it('rejects a redirect with no Location header', async () => {
    const fetchImpl = vi.fn(async () => response('', { status: 302 }));
    await expect(fetchPage('https://example.com/', { fetchImpl, assess })).rejects.toThrow(
      /no Location header/,
    );
  });
});

describe('fetchPage — response limits', () => {
  it('refuses a non-text content type before reading the body', async () => {
    const fetchImpl = vi.fn(async () =>
      response('BINARY', { headers: { 'content-type': 'application/octet-stream' } }),
    );
    await expect(fetchPage('https://example.com/f.bin', { fetchImpl, assess })).rejects.toThrow(
      /content type/,
    );
  });

  it('accepts text, JSON and XML types', async () => {
    for (const type of ['text/plain', 'application/json', 'text/html; charset=utf-8']) {
      const fetchImpl = vi.fn(async () => response('body', { headers: { 'content-type': type } }));
      const page = await fetchPage('https://example.com/', { fetchImpl, assess });
      expect(page.body).toBe('body');
    }
  });

  it('truncates an oversized body instead of buffering it whole', async () => {
    const huge = 'x'.repeat(50_000);
    const fetchImpl = vi.fn(async () => response(huge));
    const page = await fetchPage('https://example.com/', {
      fetchImpl,
      assess,
      maxBytes: 1_000,
    });
    expect(page.truncated).toBe(true);
    expect(page.body.length).toBeLessThanOrEqual(1_000);
  });

  it('does not mark a body at exactly the limit as truncated', async () => {
    const fetchImpl = vi.fn(async () => response('y'.repeat(500)));
    const page = await fetchPage('https://example.com/', { fetchImpl, assess, maxBytes: 1_000 });
    expect(page.truncated).toBe(false);
    expect(page.body.length).toBe(500);
  });

  it('surfaces a timeout as a 504-shaped error', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );
    await expect(
      fetchPage('https://example.com/', { fetchImpl, assess, timeoutMs: 20 }),
    ).rejects.toMatchObject({ status: 504 });
  });

  it('propagates an external abort signal', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const fail = () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          };
          // Real fetch() rejects immediately when handed an already-aborted
          // signal. An earlier version of this fake only listened for the
          // event, so it hung forever on a signal that had already fired --
          // the fake was wrong, not the code under test.
          if (init?.signal?.aborted) return fail();
          init?.signal?.addEventListener('abort', fail);
        }),
    );
    const promise = fetchPage('https://example.com/', {
      fetchImpl,
      assess,
      signal: controller.signal,
    });
    controller.abort();
    await expect(promise).rejects.toThrow(WebFetchError);
  });

  it('only ever issues GET', async () => {
    const fetchImpl = vi.fn(async () => response('ok'));
    await fetchPage('https://example.com/', { fetchImpl, assess });
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', redirect: 'manual' });
  });

  it('identifies itself honestly in the User-Agent', async () => {
    const fetchImpl = vi.fn(async () => response('ok'));
    await fetchPage('https://example.com/', { fetchImpl, assess });
    const headers = (fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined)?.headers as Record<
      string,
      string
    >;
    // A tool that disguises itself as a browser cannot be found in an
    // operator's own access logs.
    expect(headers['User-Agent']).toContain('FreeLLMAPI-Agent');
  });
});
