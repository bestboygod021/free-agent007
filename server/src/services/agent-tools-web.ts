import { registerTool, ToolError } from './agent-tools.js';
import { fetchPage, WebFetchError, MAX_BODY_BYTES } from './web-fetch.js';
import { extractPage, findInText } from './web-extract.js';

/**
 * Web reading tools.
 *
 * These are the first tools that reach outside the machine. Everything before
 * them touched the workspace, the repository or a local CSV; the blast radius
 * of a mistake was a file. Here a mistake is a request to an address of the
 * model's choosing, which is why the destination check lives in `web-fetch.ts`
 * and is re-run on every redirect hop rather than once up front.
 *
 * The names matter and were verified against a live `evaluateToolCall` before
 * being chosen. `web.page.read` and `web.page.search` classify as reads with
 * `sideEffect: 'none'`, so they qualify for `unattendedTools()` — an
 * autonomous phase may use them. The obvious alternatives do not:
 * `web.fetch` and `http.get` both fall to the catch-all rule and come back
 * `high` / `external_write` / approval-required, which would have silently
 * removed them from every autonomous phase.
 *
 * That classification is correct, not a loophole. Reading a page changes
 * nothing on the remote server, and the SSRF guard means the set of reachable
 * addresses is bounded before the model has any say.
 *
 * What these tools deliberately cannot do:
 *
 *  - **No JavaScript.** The response is parsed as text, never executed, so a
 *    single-page app that renders client-side returns nearly nothing. That is
 *    an honest limitation of a fetch-based reader, not something to paper over.
 *  - **No POST.** Only GET is offered; a tool that can write to a third-party
 *    service is a different risk class and would need a different name.
 *  - **No private addresses.** Blocked by default here even though the
 *    provider path makes it opt-in.
 */

const MAX_TEXT_CHARS = 100_000;
const MAX_LINKS = 100;

/**
 * Test seam for the network.
 *
 * Deliberately module-level rather than a field on `InvokeParams`: the tool
 * invocation contract describes *what a tool may do*, and "which fetch
 * implementation to use" is not part of that. Putting it there would let a
 * caller supply a fetch that skips the destination guard, which is precisely
 * the thing the guard exists to prevent.
 */
let fetchImpl: typeof fetch | undefined;

/** Replace the network for tests. Pass undefined to restore the real one. */
export function setWebFetchImplForTest(impl: typeof fetch | undefined): void {
  fetchImpl = impl;
}

function toToolError(err: unknown): never {
  if (err instanceof WebFetchError) throw new ToolError(err.message, err.status);
  throw new ToolError(err instanceof Error ? err.message : String(err), 502);
}

export function registerWebTools(): void {
  registerTool({
    name: 'web.page.read',
    description:
      'Fetch a public web page over HTTP(S) and return its readable text, title and links. ' +
      'Does not run JavaScript, so pages that render client-side may return little text.',
    schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Absolute http:// or https:// URL to read.',
        },
        maxChars: {
          type: 'integer',
          minimum: 100,
          maximum: MAX_TEXT_CHARS,
          description: `Truncate the returned text to this many characters (default ${MAX_TEXT_CHARS}).`,
        },
        includeLinks: {
          type: 'boolean',
          description: 'Include the page links in the result (default true).',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
    timeoutMs: 30_000,
    async handler(args, ctx) {
      const url = String(args.url ?? '').trim();
      if (url === '') throw new ToolError('"url" must be a non-empty string.');

      const maxChars = typeof args.maxChars === 'number' ? args.maxChars : MAX_TEXT_CHARS;
      const includeLinks = args.includeLinks !== false;

      let page;
      try {
        page = await fetchPage(url, {
          signal: ctx.signal,
          maxBytes: MAX_BODY_BYTES,
          ...(fetchImpl ? { fetchImpl } : {}),
        });
      } catch (err) {
        toToolError(err);
      }

      const extracted = extractPage(page.body);
      const text =
        extracted.text.length > maxChars ? extracted.text.slice(0, maxChars) : extracted.text;

      return {
        // The URL actually read, which is not always the one requested. A
        // caller quoting this page needs to know where the text came from.
        url: page.finalUrl,
        requestedUrl: url,
        ...(page.chain.length > 1 ? { redirectChain: page.chain } : {}),
        status: page.status,
        contentType: page.contentType,
        title: extracted.title,
        text,
        textTruncated: page.truncated || extracted.text.length > maxChars,
        ...(includeLinks ? { links: extracted.links.slice(0, MAX_LINKS) } : {}),
      };
    },
  });

  registerTool({
    name: 'web.page.search',
    description:
      'Fetch a web page and return only the lines matching a query, with line numbers. ' +
      'Use instead of web.page.read when looking for something specific on a large page.',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute http:// or https:// URL to read.' },
        query: {
          type: 'string',
          minLength: 1,
          description: 'Text to look for. Matching is literal and case-insensitive.',
        },
        maxMatches: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Maximum matching lines to return (default 20).',
        },
      },
      required: ['url', 'query'],
      additionalProperties: false,
    },
    timeoutMs: 30_000,
    async handler(args, ctx) {
      const url = String(args.url ?? '').trim();
      if (url === '') throw new ToolError('"url" must be a non-empty string.');
      const query = String(args.query ?? '').trim();
      if (query === '') throw new ToolError('"query" must be a non-empty string.');

      const maxMatches = typeof args.maxMatches === 'number' ? args.maxMatches : 20;

      let page;
      try {
        page = await fetchPage(url, {
          signal: ctx.signal,
          maxBytes: MAX_BODY_BYTES,
          ...(fetchImpl ? { fetchImpl } : {}),
        });
      } catch (err) {
        toToolError(err);
      }

      const extracted = extractPage(page.body);
      const matches = findInText(extracted.text, query, { maxMatches });

      return {
        url: page.finalUrl,
        requestedUrl: url,
        title: extracted.title,
        query,
        matchCount: matches.length,
        matches,
        // Distinguishing "no match" from "nothing to match against" matters:
        // a JS-rendered page yields empty text, and a caller told only
        // "0 matches" would conclude the page does not mention the term.
        pageHadText: extracted.text.trim() !== '',
      };
    },
  });
}
