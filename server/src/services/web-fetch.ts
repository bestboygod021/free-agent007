import { assessProviderUrl } from '../lib/url-guard.js';

/**
 * Outbound HTTP for agent tools.
 *
 * The kernel has had `evaluateEgress` and `egress-policy-runtime.ts` since the
 * beginning, and neither could stop anything, for a reason worth stating: both
 * are *validators*. `decideM190Egress` takes `dnsPinned`, `tlsVerified` and
 * `dlpPassed` as booleans **from its caller**. Handed a request for
 * `http://169.254.169.254/latest/meta-data/` with every flag asserted true, it
 * returns `allowed: true`. I ran exactly that before writing this file.
 *
 * That is not a bug in the kernel — it is a contract checker, and a contract
 * checker cannot resolve DNS. But it means egress enforcement cannot be
 * delivered by "wiring up the egress module". Something has to establish the
 * facts the kernel is willing to reason about.
 *
 * `lib/url-guard.ts` already does that job for provider URLs: it canonicalises
 * the host (so `http://2852039166/` is recognised as 169.254.169.254),
 * resolves DNS, and classifies every resulting address as metadata,
 * link-local, loopback, private or public. This module reuses it rather than
 * writing a second, subtly different SSRF check — two implementations of the
 * same rule is how the weaker one ends up on the live path.
 *
 * Three differences from the provider path, all deliberate:
 *
 *  1. **Private addresses are blocked by default.** For providers that is
 *     opt-in (`FREEAPI_BLOCK_PRIVATE_PROVIDER_URLS`), because an operator may
 *     legitimately run a local model on the LAN. An agent following a link it
 *     read in a document has no such excuse, so the default flips.
 *  2. **Redirects are followed manually**, re-checking every hop. `fetch` with
 *     `redirect: 'follow'` would let a public URL 302 to 169.254.169.254 after
 *     the check passed — the classic TOCTOU bypass of exactly this guard.
 *  3. **Responses are bounded** in both bytes and time, and non-text content
 *     types are refused before the body is read.
 */

export class WebFetchError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'WebFetchError';
    this.status = status;
  }
}

/** Hard ceiling on a downloaded body. Larger pages are truncated, not refused. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

/** Redirect hops. Each one is re-assessed; this only bounds the chain length. */
export const MAX_REDIRECTS = 5;

/** Wall-clock budget for the whole chain, including redirects. */
export const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Content types we are willing to read. An agent asking for a page wants text;
 * handing it a 2MB binary blob decoded as UTF-8 is noise at best, and at worst
 * a way to smuggle bytes past a reviewer skimming a transcript.
 */
const READABLE_TYPES = [
  'text/html',
  'text/plain',
  'text/markdown',
  'application/xhtml+xml',
  'application/json',
  'application/xml',
  'text/xml',
];

export interface FetchedPage {
  /** The URL actually fetched, after redirects. */
  finalUrl: string;
  status: number;
  contentType: string;
  /** Decoded body, truncated to MAX_BODY_BYTES. */
  body: string;
  truncated: boolean;
  /** Every URL in the redirect chain, starting with the request. */
  chain: string[];
}

export interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  signal?: AbortSignal;
  /** Injection seam for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injection seam for tests; defaults to the real DNS-backed assessment. */
  assess?: typeof assessProviderUrl;
}

/**
 * Assess one URL and throw if it must not be contacted.
 *
 * `blockPrivate: true` is passed explicitly rather than relying on the
 * environment default, so this rule cannot be switched off by an operator
 * setting intended for provider URLs.
 */
async function assertFetchable(
  url: string,
  assess: typeof assessProviderUrl,
): Promise<void> {
  const verdict = await assess(url, { blockPrivate: true });
  if (!verdict.allowed) {
    throw new WebFetchError(`refused to fetch ${url}: ${verdict.reason}`, 403);
  }
}

function isReadableType(contentType: string): boolean {
  const base = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return READABLE_TYPES.includes(base);
}

/**
 * Fetch a URL, re-checking the destination at every redirect hop.
 *
 * Only GET is offered. A tool that could POST is a tool that can change state
 * on a third-party service, which is a different risk class and would have to
 * be named (and classified) as such.
 */
export async function fetchPage(
  rawUrl: string,
  options: FetchOptions = {},
): Promise<FetchedPage> {
  const doFetch = options.fetchImpl ?? fetch;
  const assess = options.assess ?? assessProviderUrl;
  const maxBytes = options.maxBytes ?? MAX_BODY_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const timer = new AbortController();
  const timeout = setTimeout(() => timer.abort(), timeoutMs);
  const onOuterAbort = () => timer.abort();
  options.signal?.addEventListener('abort', onOuterAbort, { once: true });

  try {
    let current = rawUrl;
    const chain: string[] = [];

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      // Checked before every request, not once at the start: a 302 to a
      // metadata address is the whole reason this loop is manual.
      await assertFetchable(current, assess);
      chain.push(current);

      const response = await doFetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: timer.signal,
        headers: {
          // Identify honestly. A tool that disguises itself as a browser is
          // one an operator cannot find in their own access logs.
          'User-Agent': 'FreeLLMAPI-Agent/1.0 (+https://github.com/freellmapi)',
          Accept: READABLE_TYPES.join(', '),
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new WebFetchError(`redirect from ${current} had no Location header`, 502);
        }
        let next: string;
        try {
          next = new URL(location, current).toString();
        } catch {
          throw new WebFetchError(`redirect from ${current} had an unusable Location`, 502);
        }
        if (hop === MAX_REDIRECTS) {
          throw new WebFetchError(`too many redirects (limit ${MAX_REDIRECTS})`, 502);
        }
        current = next;
        continue;
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (contentType !== '' && !isReadableType(contentType)) {
        throw new WebFetchError(
          `refused to read content type "${contentType}"; this tool reads text pages only`,
          415,
        );
      }

      // Read through the stream so an oversized body is abandoned rather than
      // buffered whole. Content-Length is a claim, not a guarantee.
      const { text, truncated } = await readBounded(response, maxBytes);

      return {
        finalUrl: current,
        status: response.status,
        contentType,
        body: text,
        truncated,
        chain,
      };
    }

    throw new WebFetchError(`too many redirects (limit ${MAX_REDIRECTS})`, 502);
  } catch (err) {
    if (err instanceof WebFetchError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new WebFetchError(`fetching ${rawUrl} timed out after ${timeoutMs}ms`, 504);
    }
    throw new WebFetchError(
      `could not fetch ${rawUrl}: ${err instanceof Error ? err.message : String(err)}`,
      502,
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onOuterAbort);
  }
}

/** Read a response body, stopping once maxBytes have been taken. */
async function readBounded(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const body = response.body;
  if (!body) {
    const text = await response.text();
    const buf = Buffer.from(text, 'utf8');
    return buf.length > maxBytes
      ? { text: buf.subarray(0, maxBytes).toString('utf8'), truncated: true }
      : { text, truncated: false };
  }

  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  let truncated = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const chunk = Buffer.from(value);
    if (total + chunk.length >= maxBytes) {
      chunks.push(chunk.subarray(0, maxBytes - total));
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(chunk);
    total += chunk.length;
  }

  return { text: Buffer.concat(chunks).toString('utf8'), truncated };
}
