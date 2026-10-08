import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  forgeConfig,
  forgeConfigured,
  parseRepo,
  matchesConfiguredRepo,
  createPullRequest,
  authenticatedRemoteUrl,
  redactToken,
  ForgeError,
  FORGE_TOKEN_ENV,
  FORGE_REPO_ENV,
  FORGE_HOST_ENV,
  type ForgeConfig,
} from '../../services/agent-forge.js';

const TOKEN = 'ghp_0123456789abcdefghijklmnop';

function configure(env: Partial<Record<string, string | undefined>>): void {
  for (const key of [FORGE_TOKEN_ENV, FORGE_REPO_ENV, FORGE_HOST_ENV]) delete process.env[key];
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) process.env[key] = value;
  }
}

const config: ForgeConfig = {
  token: TOKEN,
  owner: 'acme',
  repo: 'widgets',
  host: 'api.github.com',
};

describe('forge configuration', () => {
  afterEach(() => configure({}));

  it('is unconfigured by default, with an actionable message', () => {
    configure({});
    expect(forgeConfigured()).toBe(false);
    const result = forgeConfig();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The message has to steer an operator towards a narrowly scoped token,
      // because the easy thing to paste is one that can reach everything.
      expect(result.reason).toContain('scoped to the one repository');
    }
  });

  it('accepts a well-formed configuration', () => {
    configure({ [FORGE_TOKEN_ENV]: TOKEN, [FORGE_REPO_ENV]: 'acme/widgets' });
    const result = forgeConfig();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config).toMatchObject({ owner: 'acme', repo: 'widgets', host: 'api.github.com' });
    }
  });

  it('reports a missing token and a missing repo separately', () => {
    configure({ [FORGE_REPO_ENV]: 'acme/widgets' });
    expect(forgeConfig()).toMatchObject({ ok: false, reason: expect.stringContaining('TOKEN') });
    configure({ [FORGE_TOKEN_ENV]: TOKEN });
    expect(forgeConfig()).toMatchObject({ ok: false, reason: expect.stringContaining('REPO') });
  });

  it('rejects a token too short to be real', () => {
    configure({ [FORGE_TOKEN_ENV]: 'ghp_short', [FORGE_REPO_ENV]: 'acme/widgets' });
    expect(forgeConfigured()).toBe(false);
  });

  it('rejects a host given as a URL', () => {
    // Accepting a URL would let a pasted value point the token at a server
    // that simply collects tokens.
    configure({
      [FORGE_TOKEN_ENV]: TOKEN,
      [FORGE_REPO_ENV]: 'acme/widgets',
      [FORGE_HOST_ENV]: 'https://evil.example/collect',
    });
    expect(forgeConfig()).toMatchObject({ ok: false, reason: expect.stringContaining('hostname') });
  });

  it('accepts a GitHub Enterprise hostname', () => {
    configure({
      [FORGE_TOKEN_ENV]: TOKEN,
      [FORGE_REPO_ENV]: 'acme/widgets',
      [FORGE_HOST_ENV]: 'github.acme-corp.com',
    });
    const result = forgeConfig();
    expect(result.ok && result.config.host).toBe('github.acme-corp.com');
  });

  it('re-reads configuration on each call so rotation needs no restart', () => {
    configure({ [FORGE_TOKEN_ENV]: TOKEN, [FORGE_REPO_ENV]: 'acme/widgets' });
    expect(forgeConfigured()).toBe(true);
    configure({ [FORGE_TOKEN_ENV]: TOKEN, [FORGE_REPO_ENV]: 'other/repo' });
    const result = forgeConfig();
    expect(result.ok && result.config.repo).toBe('repo');
  });
});

describe('parseRepo', () => {
  it('accepts owner/name', () => {
    expect(parseRepo('acme/widgets')).toEqual({ owner: 'acme', repo: 'widgets' });
    expect(parseRepo('  acme/my.repo_v2-x  ')).toEqual({ owner: 'acme', repo: 'my.repo_v2-x' });
  });

  it('rejects path traversal and extra segments', () => {
    // The value is interpolated into a URL path, so a segment containing
    // ".." or "/" could reach a different endpoint than configured.
    for (const bad of ['../etc', 'acme/../../x', 'a/b/c', '/acme/widgets', 'acme/', '/widgets']) {
      expect(parseRepo(bad), bad).toBeNull();
    }
  });

  it('rejects names with URL-significant characters', () => {
    for (const bad of ['acme/widgets?x=1', 'acme/wid gets', 'acme/wid#get', '-acme/widgets']) {
      expect(parseRepo(bad), bad).toBeNull();
    }
  });
});

describe('matchesConfiguredRepo', () => {
  it('matches case-insensitively', () => {
    expect(matchesConfiguredRepo(config, 'ACME/Widgets')).toBe(true);
  });

  it('does not match a different repository', () => {
    expect(matchesConfiguredRepo(config, 'acme/other')).toBe(false);
    expect(matchesConfiguredRepo(config, 'evil/widgets')).toBe(false);
  });
});

describe('authenticatedRemoteUrl', () => {
  it('embeds the token for github.com', () => {
    expect(authenticatedRemoteUrl(config)).toBe(
      `https://x-access-token:${TOKEN}@github.com/acme/widgets.git`,
    );
  });

  it('uses the configured host directly for Enterprise', () => {
    expect(authenticatedRemoteUrl({ ...config, host: 'git.acme-corp.com' })).toContain(
      'git.acme-corp.com/acme/widgets.git',
    );
  });
});

describe('redactToken', () => {
  it('removes every occurrence', () => {
    const text = `remote: https://x-access-token:${TOKEN}@github.com failed for ${TOKEN}`;
    const clean = redactToken(text, TOKEN);
    expect(clean).not.toContain(TOKEN);
    expect(clean.match(/\*\*\*/g)).toHaveLength(2);
  });

  it('leaves text alone when the token is empty', () => {
    expect(redactToken('nothing to hide', '')).toBe('nothing to hide');
  });
});

describe('createPullRequest', () => {
  function jsonResponse(body: unknown, status = 201): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  it('posts to the configured repository and returns the pull request', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ number: 42, html_url: 'https://github.com/acme/widgets/pull/42', state: 'open', title: 'Add thing' }),
    );

    const pr = await createPullRequest(
      config,
      { title: 'Add thing', body: 'why', head: 'agent/work', base: 'main' },
      { fetchImpl },
    );

    expect(pr).toMatchObject({ number: 42, state: 'open', head: 'agent/work', base: 'main' });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/acme/widgets/pulls');
    expect(init.method).toBe('POST');
  });

  it('sends the token as a bearer header, never in the body', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ number: 1, html_url: 'https://github.com/acme/widgets/pull/1' }),
    );
    await createPullRequest(
      config,
      { title: 't', body: 'b', head: 'h', base: 'main' },
      { fetchImpl },
    );
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(String(init.body)).not.toContain(TOKEN);
  });

  it('does not take a repository from the caller', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ number: 1, html_url: 'https://github.com/acme/widgets/pull/1' }),
    );
    await createPullRequest(
      // A model cannot ask for a pull request somewhere else: the repository
      // is not a parameter at all.
      config,
      { title: 't', body: 'b', head: 'h', base: 'main' },
      { fetchImpl },
    );
    expect(fetchImpl.mock.calls[0]?.[0]).toContain('/repos/acme/widgets/');
  });

  it('refuses a head equal to base', async () => {
    const fetchImpl = vi.fn();
    await expect(
      createPullRequest(config, { title: 't', body: 'b', head: 'main', base: 'main' }, { fetchImpl }),
    ).rejects.toThrow(/must differ/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses an empty title', async () => {
    const fetchImpl = vi.fn();
    await expect(
      createPullRequest(config, { title: '  ', body: 'b', head: 'h', base: 'main' }, { fetchImpl }),
    ).rejects.toThrow(/title/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('surfaces a forge rejection with its message', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        { message: 'Validation Failed', errors: [{ message: 'No commits between main and x' }] },
        422,
      ),
    );
    await expect(
      createPullRequest(config, { title: 't', body: 'b', head: 'x', base: 'main' }, { fetchImpl }),
    ).rejects.toThrow(/No commits between/);
  });

  it('maps an auth failure to 403 rather than a generic error', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: 'Bad credentials' }, 401));
    await expect(
      createPullRequest(config, { title: 't', body: 'b', head: 'x', base: 'main' }, { fetchImpl }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects a response missing the number or URL', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ state: 'open' }));
    await expect(
      createPullRequest(config, { title: 't', body: 'b', head: 'x', base: 'main' }, { fetchImpl }),
    ).rejects.toThrow(/number and URL/);
  });

  it('rejects a non-JSON response', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>gateway error</html>', { status: 200 }));
    await expect(
      createPullRequest(config, { title: 't', body: 'b', head: 'x', base: 'main' }, { fetchImpl }),
    ).rejects.toThrow(/not JSON/);
  });

  it('times out rather than hanging', async () => {
    const fetchImpl = vi.fn(
      (_u: string, init?: RequestInit) =>
        new Promise<Response>((_res, rej) => {
          const fail = () => {
            const e = new Error('aborted');
            e.name = 'AbortError';
            rej(e);
          };
          if (init?.signal?.aborted) return fail();
          init?.signal?.addEventListener('abort', fail);
        }),
    );
    await expect(
      createPullRequest(
        config,
        { title: 't', body: 'b', head: 'x', base: 'main' },
        { fetchImpl, timeoutMs: 20 },
      ),
    ).rejects.toMatchObject({ status: 504 });
  });

  it('truncates an oversized title and body instead of failing', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ number: 1, html_url: 'https://github.com/acme/widgets/pull/1' }),
    );
    await createPullRequest(
      config,
      { title: 'x'.repeat(5_000), body: 'y'.repeat(200_000), head: 'h', base: 'main' },
      { fetchImpl },
    );
    const body = JSON.parse(String((fetchImpl.mock.calls[0]?.[1] as RequestInit).body)) as {
      title: string;
      body: string;
    };
    expect(body.title.length).toBeLessThanOrEqual(250);
    expect(body.body.length).toBeLessThanOrEqual(60_000);
  });
});

describe('ForgeError', () => {
  it('carries a status for the tool layer to map', () => {
    expect(new ForgeError('x', 503).status).toBe(503);
  });
});
