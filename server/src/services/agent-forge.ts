import crypto from 'crypto';
import { timingSafeStringEqual } from '../lib/system-prompt.js';

/**
 * Forge credentials: how the agent is allowed to open a pull request.
 *
 * This exists because of a tension that a naive implementation would quietly
 * resolve the wrong way. `agent-tools-git.ts` runs every git command with:
 *
 *     GIT_TERMINAL_PROMPT=0
 *     GIT_ASKPASS=''
 *     GIT_CONFIG_NOSYSTEM=1
 *
 * That is not incidental hardening. The comment there states the intent
 * directly: *an agent must not be able to authenticate as the human who
 * installed the gateway.* An operator's `~/.gitconfig` and credential helper
 * typically hold a token with push rights to every repository they own.
 *
 * Opening a pull request needs a forge credential. The path of least
 * resistance — drop the `GIT_ASKPASS` clearing so `git push` can use the
 * ambient helper — would work on the first try and would silently delete that
 * property. The agent would inherit the operator's full GitHub identity.
 *
 * So the credential is separate, explicit, and server-configured:
 *
 *     AGENT_FORGE_TOKEN=ghp_xxx
 *     AGENT_FORGE_REPO=owner/name
 *     AGENT_FORGE_HOST=api.github.com        (optional, for GHE)
 *
 * Three consequences worth stating, because they are the point rather than
 * limitations:
 *
 *  1. **The operator chooses the blast radius.** A token scoped to one
 *     repository means the agent can open pull requests against exactly that
 *     repository. Nothing here can widen it.
 *  2. **It is revocable independently.** Revoking the agent's token does not
 *     log the human out of anything.
 *  3. **It is attributable.** Pull requests arrive as whoever owns the token;
 *     if that is a bot account, `git log` and the PR list both say so forever.
 *
 * The git tools' environment is untouched. `git push` still cannot
 * authenticate. Pushing happens through this module, with this credential,
 * over HTTPS with the token supplied explicitly per invocation — never written
 * to `.git/config`, never left on disk.
 */

export const FORGE_TOKEN_ENV = 'AGENT_FORGE_TOKEN';
export const FORGE_REPO_ENV = 'AGENT_FORGE_REPO';
export const FORGE_HOST_ENV = 'AGENT_FORGE_HOST';

/** Shortest credential we will accept. Below this, it is not a real token. */
export const MIN_FORGE_TOKEN_LENGTH = 20;

export class ForgeError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ForgeError';
    this.status = status;
  }
}

export interface ForgeConfig {
  token: string;
  owner: string;
  repo: string;
  host: string;
}

export type ForgeConfigResult =
  | { ok: true; config: ForgeConfig }
  | { ok: false; reason: string };

/**
 * `owner/name`, conservatively.
 *
 * GitHub itself is stricter than this, but the reason for validating here is
 * narrower: the value is interpolated into a URL path. A segment containing
 * `/`, `..` or a control character could redirect the request to a different
 * endpoint than the operator configured.
 */
const REPO_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function parseRepo(raw: string): { owner: string; repo: string } | null {
  const parts = raw.trim().split('/');
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (!owner || !repo) return null;
  if (!REPO_SEGMENT.test(owner) || !REPO_SEGMENT.test(repo)) return null;
  if (owner.includes('..') || repo.includes('..')) return null;
  return { owner, repo };
}

/**
 * A host is only accepted if it is a plain hostname.
 *
 * Accepting a full URL here would let a configuration mistake — or an operator
 * pasting something they were sent — point the agent's token at a server that
 * simply collects tokens.
 */
const HOSTNAME = /^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$/;

export function forgeConfig(): ForgeConfigResult {
  const token = process.env[FORGE_TOKEN_ENV]?.trim() ?? '';
  const repoRaw = process.env[FORGE_REPO_ENV]?.trim() ?? '';

  if (token === '' && repoRaw === '') {
    return {
      ok: false,
      reason:
        'pull request creation is not configured: set AGENT_FORGE_TOKEN and AGENT_FORGE_REPO. ' +
        'Use a token scoped to the one repository the agent may open pull requests against, ' +
        'not a personal token with access to everything.',
    };
  }
  if (token === '') return { ok: false, reason: `${FORGE_TOKEN_ENV} is not set.` };
  if (token.length < MIN_FORGE_TOKEN_LENGTH) {
    return { ok: false, reason: `${FORGE_TOKEN_ENV} is too short to be a real token.` };
  }
  if (repoRaw === '') return { ok: false, reason: `${FORGE_REPO_ENV} is not set.` };

  const parsed = parseRepo(repoRaw);
  if (!parsed) {
    return { ok: false, reason: `${FORGE_REPO_ENV} must be "owner/name".` };
  }

  const host = process.env[FORGE_HOST_ENV]?.trim() || 'api.github.com';
  if (!HOSTNAME.test(host)) {
    return { ok: false, reason: `${FORGE_HOST_ENV} must be a plain hostname, not a URL.` };
  }

  return { ok: true, config: { token, owner: parsed.owner, repo: parsed.repo, host } };
}

/** True when a usable forge credential is configured. */
export function forgeConfigured(): boolean {
  return forgeConfig().ok;
}

/**
 * Confirm a repository matches the one configured.
 *
 * Constant-time because a caller that could probe this would learn which
 * repository an install is wired to one character at a time. Cheap insurance
 * on a comparison that runs rarely.
 */
export function matchesConfiguredRepo(config: ForgeConfig, candidate: string): boolean {
  return timingSafeStringEqual(candidate.trim().toLowerCase(), `${config.owner}/${config.repo}`.toLowerCase());
}

export interface PullRequest {
  number: number;
  url: string;
  state: string;
  title: string;
  head: string;
  base: string;
}

export interface CreatePullRequestInput {
  title: string;
  body: string;
  head: string;
  base: string;
}

export interface ForgeCallOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TITLE_CHARS = 250;
const MAX_BODY_CHARS = 60_000;

/**
 * Open a pull request.
 *
 * The token goes in an `Authorization` header on a single request and is never
 * persisted. Note what is *not* accepted as a parameter: the repository. It
 * comes from configuration, so a model cannot ask for a pull request against
 * somewhere else.
 */
export async function createPullRequest(
  config: ForgeConfig,
  input: CreatePullRequestInput,
  options: ForgeCallOptions = {},
): Promise<PullRequest> {
  const doFetch = options.fetchImpl ?? fetch;
  const title = input.title.trim();
  if (title === '') throw new ForgeError('pull request title must not be empty.');
  if (input.head.trim() === '') throw new ForgeError('head branch must not be empty.');
  if (input.base.trim() === '') throw new ForgeError('base branch must not be empty.');
  if (input.head.trim() === input.base.trim()) {
    throw new ForgeError('head and base branches must differ.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const response = await doFetch(
      `https://${config.host}/repos/${config.owner}/${config.repo}/pulls`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
          'User-Agent': 'FreeLLMAPI-Agent/1.0',
        },
        body: JSON.stringify({
          title: title.slice(0, MAX_TITLE_CHARS),
          body: input.body.slice(0, MAX_BODY_CHARS),
          head: input.head.trim(),
          base: input.base.trim(),
        }),
      },
    );

    const text = await response.text();
    if (!response.ok) {
      // The forge's error body can echo the request, and the request carried a
      // token in a header -- not in the body, but this keeps the habit.
      throw new ForgeError(
        `forge refused the pull request (HTTP ${response.status}): ${summariseError(text)}`,
        response.status === 401 || response.status === 403 ? 403 : 502,
      );
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new ForgeError('forge returned a response that was not JSON.', 502);
    }

    const number = typeof parsed.number === 'number' ? parsed.number : null;
    const url = typeof parsed.html_url === 'string' ? parsed.html_url : null;
    if (number === null || url === null) {
      throw new ForgeError('forge response did not contain a pull request number and URL.', 502);
    }

    return {
      number,
      url,
      state: typeof parsed.state === 'string' ? parsed.state : 'unknown',
      title: typeof parsed.title === 'string' ? parsed.title : title,
      head: input.head.trim(),
      base: input.base.trim(),
    };
  } catch (err) {
    if (err instanceof ForgeError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ForgeError('the forge did not respond in time.', 504);
    }
    throw new ForgeError(
      `could not reach the forge: ${err instanceof Error ? err.message : String(err)}`,
      502,
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

/** Pull a usable message out of a forge error body without echoing the whole thing. */
function summariseError(body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: unknown; errors?: unknown };
    const message = typeof parsed.message === 'string' ? parsed.message : '';
    const errors = Array.isArray(parsed.errors)
      ? parsed.errors
          .map((e) =>
            typeof e === 'object' && e !== null && typeof (e as { message?: unknown }).message === 'string'
              ? (e as { message: string }).message
              : '',
          )
          .filter((m) => m !== '')
          .join('; ')
      : '';
    const combined = [message, errors].filter((s) => s !== '').join(' — ');
    return combined === '' ? body.slice(0, 200) : combined.slice(0, 400);
  } catch {
    return body.slice(0, 200);
  }
}

/**
 * The remote URL used for a push, with the token embedded.
 *
 * Returned rather than written to `.git/config` on purpose: a remote URL
 * containing a token, once written, survives in the config file and in the
 * reflog of anyone who later clones or inspects the workspace.
 */
export function authenticatedRemoteUrl(config: ForgeConfig): string {
  // api.github.com is the API host; the git host is the same name without the
  // api prefix for github.com, and the same host for GitHub Enterprise.
  const gitHost = config.host === 'api.github.com' ? 'github.com' : config.host;
  return `https://x-access-token:${config.token}@${gitHost}/${config.owner}/${config.repo}.git`;
}

/** Remove a token from text before it reaches a log, an error or an audit row. */
export function redactToken(text: string, token: string): string {
  if (token === '') return text;
  return text.split(token).join('***');
}

/** Generate a placeholder for documentation and setup tooling. */
export function exampleToken(): string {
  return `ghp_${crypto.randomBytes(18).toString('hex')}`;
}
