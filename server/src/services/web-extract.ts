/**
 * Turn an HTML document into readable text.
 *
 * No parser dependency: the lockfile has no HTML library, and adding one for
 * this would pull a tree that has to be audited and kept patched. What a
 * reading tool needs is narrower than a DOM — strip the non-content elements,
 * unescape entities, keep block structure as newlines.
 *
 * The important part is `SKIP_ELEMENTS`. `<script>` and `<style>` are dropped
 * *with their contents* rather than having their tags stripped, because
 * stripping tags alone would leave a page's JavaScript source in the text
 * handed to a model. That is both noise and an injection surface: a model
 * reading `// ignore previous instructions` out of a script body cannot tell
 * it apart from prose.
 *
 * This is deliberately not a sanitiser for rendering. The output is text for a
 * model to read, never HTML for a browser to run.
 */

/** Elements whose entire subtree is removed, not just their tags. */
const SKIP_ELEMENTS = [
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'iframe',
  'object',
  'embed',
  'head',
];

/** Elements that imply a line break in the text rendering. */
const BLOCK_ELEMENTS = new Set([
  'address', 'article', 'aside', 'blockquote', 'br', 'dd', 'div', 'dl', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section',
  'table', 'tr', 'ul',
]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©',
  reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–', lsquo: '\u2018',
  rsquo: '\u2019', ldquo: '\u201C', rdquo: '\u201D', laquo: '«', raquo: '»',
  deg: '°', plusmn: '±', times: '×', divide: '÷', euro: '€', pound: '£',
  yen: '¥', cent: '¢', sect: '§', para: '¶', middot: '·', bull: '•',
};

export interface ExtractedPage {
  /** Contents of <title>, when present. */
  title: string | null;
  /** Readable text with block structure preserved as newlines. */
  text: string;
  /** Absolute and relative hrefs found in the document, de-duplicated. */
  links: string[];
}

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body.startsWith('#')) {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const code = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      // Surrogate halves are not standalone characters; emitting them produces
      // broken UTF-8 downstream.
      if (code >= 0xd800 && code <= 0xdfff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

/** Remove an element and everything inside it. */
function stripElement(html: string, tag: string): string {
  // Non-greedy, case-insensitive, tolerant of attributes and of the malformed
  // markup that real pages are full of.
  const paired = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi');
  const unclosed = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*$`, 'i');
  let out = html.replace(paired, ' ');
  // An unclosed <script> swallows the rest of the document in a browser too;
  // matching that behaviour is safer than leaving the source visible.
  if (new RegExp(`<${tag}\\b`, 'i').test(out)) out = out.replace(unclosed, ' ');
  return out;
}

export function extractTitle(html: string): string | null {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  if (!match?.[1]) return null;
  const title = decodeEntities(match[1].replace(/\s+/g, ' ')).trim();
  return title === '' ? null : title;
}

export function extractLinks(html: string, limit = 200): string[] {
  const links: string[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const href = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '').trim();
    if (href === '' || href.startsWith('#')) continue;
    // A javascript: or data: href is not a destination worth reporting, and
    // echoing it back invites something downstream to try to follow it.
    if (/^(javascript|data|vbscript):/i.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    links.push(href);
    if (links.length >= limit) break;
  }
  return links;
}

export function htmlToText(html: string): string {
  let out = html;

  for (const tag of SKIP_ELEMENTS) out = stripElement(out, tag);

  // Comments can contain anything, including commented-out scripts.
  out = out.replace(/<!--[\s\S]*?-->/g, ' ');

  // Block-level tags become newlines so paragraphs do not run together; every
  // other tag becomes nothing.
  out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g, (_m, tag: string) =>
    BLOCK_ELEMENTS.has(tag.toLowerCase()) ? '\n' : '',
  );

  out = decodeEntities(out);

  return out
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractPage(html: string): ExtractedPage {
  return {
    title: extractTitle(html),
    text: htmlToText(html),
    links: extractLinks(html),
  };
}

/**
 * Find the lines of a document that mention a query.
 *
 * Lexical, not semantic — this answers "where does this page say X?" rather
 * than "what does this page mean?". Naming it honestly matters: a caller who
 * believes it is semantic will trust an empty result.
 */
export function findInText(
  text: string,
  query: string,
  options: { maxMatches?: number; contextChars?: number } = {},
): Array<{ line: number; text: string }> {
  const maxMatches = options.maxMatches ?? 20;
  const contextChars = options.contextChars ?? 300;
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];

  const matches: Array<{ line: number; text: string }> = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length && matches.length < maxMatches; i += 1) {
    const line = lines[i] ?? '';
    if (line.toLowerCase().includes(needle)) {
      matches.push({
        line: i + 1,
        text: line.length > contextChars ? `${line.slice(0, contextChars)}…` : line,
      });
    }
  }
  return matches;
}
