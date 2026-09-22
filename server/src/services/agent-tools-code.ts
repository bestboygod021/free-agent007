import { promises as fs } from 'node:fs';
import path from 'node:path';
import { registerTool, ToolError } from './agent-tools.js';
import { resolveInside } from './agent-tools-builtin.js';
import {
  buildCodeIndex,
  rankSymbols,
  summariseByFile,
  extractSymbols,
  type CodeSymbol,
} from './code-index.js';

/**
 * Code navigation tools: finding a definition, and reading a repository's
 * shape without reading the repository.
 *
 * These exist because of how a coding run actually fails. Given only
 * `fs.read_file` and `fs.search`, a model asked to change `resolveScope`
 * greps for the name, gets its forty call sites, reads three whole files
 * looking for the declaration, and spends most of its context window before
 * it has found the thing it was asked to edit. Every one of those steps is a
 * chance to give up or to edit the wrong place.
 *
 * `code.symbol.search` answers the question directly. `code.outline` answers
 * the one before it — "what is in this codebase at all" — in a few hundred
 * tokens.
 *
 * Both are read-only and confined to the workspace the same way every other
 * filesystem tool is: through `resolveInside`, which is imported rather than
 * re-implemented so there is exactly one confinement check in the codebase.
 *
 * ## The names are load-bearing — do not "tidy" them
 *
 * The policy engine classifies a tool by the suffix of its dotted name:
 * `*.read`, `*.search`, `*.list` are the read vocabulary. These were first
 * written as `code.symbol.find` and `code.outline`, which match no rule, so
 * they fell to the restrictive default — `external_write`, `high`, approval
 * required — and `unattendedTools()` filtered them out of every phase. The
 * tools registered fine and were simply never offered to a model.
 *
 * That is the policy engine failing closed, which is correct. The fix is to
 * speak its vocabulary rather than to add exceptions for these three tools:
 * renaming to `.search` and `.read` makes them read-classified by the same
 * rule that covers `fs.read_file`. Rename them back and they go quiet again.
 */

/** How many matches a find returns. Enough to disambiguate, not enough to flood. */
const MAX_MATCHES = 25;
/** Lines of surrounding source returned with a match. */
const MAX_CONTEXT_LINES = 12;
const MAX_OUTLINE_FILES = 300;

export function registerCodeTools(): void {
  registerTool({
    name: 'code.symbol.search',
    description:
      'Find where a function, class, interface, type or method is DEFINED, with its file, ' +
      'line number and signature. Use this before reading files: it is far cheaper than ' +
      'searching for a name and reading every file that mentions it.',
    schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          description: 'Symbol name to locate. Exact matches rank first, substrings after.',
        },
        path: {
          type: 'string',
          description: 'Subdirectory to search. Defaults to the workspace root.',
        },
        includeSource: {
          type: 'boolean',
          description: 'Include a few lines of source around each definition.',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
    timeoutMs: 60_000,
    async handler(args, ctx) {
      const base = await resolveInside(ctx.workspaceRoot, (args.path as string) ?? '.');
      const query = String(args.name);

      const index = await buildCodeIndex(base);
      const ranked = rankSymbols(index.symbols, query);
      const matches = ranked.slice(0, MAX_MATCHES);

      // A definition the caller cannot verify is not much better than a
      // guess, so the source around it can be returned with it — the same
      // argument as citations in retrieval.
      let withSource: (CodeSymbol & { source?: string })[] = matches;
      if (args.includeSource === true) {
        withSource = await Promise.all(
          matches.map(async (sym) => {
            const file = path.join(base, sym.path);
            const content = await fs.readFile(file, 'utf8').catch(() => null);
            if (content === null) return sym;
            const lines = content.split('\n');
            const start = Math.max(0, sym.line - 1);
            return { ...sym, source: lines.slice(start, start + MAX_CONTEXT_LINES).join('\n') };
          }),
        );
      }

      return {
        query,
        matches: withSource,
        totalMatches: ranked.length,
        filesScanned: index.filesScanned,
        // Said plainly rather than hidden: a truncated index may simply not
        // contain the answer, and the model should know that "not found" here
        // is weaker than "not present".
        indexTruncated: index.truncated,
      };
    },
  });

  registerTool({
    name: 'code.outline.read',
    description:
      'List the exported symbols of each code file, as a map of the codebase. Use this to ' +
      'orient yourself in an unfamiliar repository before opening any file.',
    schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Subdirectory to outline. Defaults to the workspace root.',
        },
      },
      additionalProperties: false,
    },
    timeoutMs: 60_000,
    async handler(args, ctx) {
      const base = await resolveInside(ctx.workspaceRoot, (args.path as string) ?? '.');
      const index = await buildCodeIndex(base);
      const files = summariseByFile(index);

      return {
        files: files.slice(0, MAX_OUTLINE_FILES),
        totalFiles: files.length,
        filesScanned: index.filesScanned,
        totalSymbols: index.symbols.length,
        truncated: index.truncated || files.length > MAX_OUTLINE_FILES,
      };
    },
  });

  registerTool({
    name: 'code.file.outline.read',
    description:
      'List every symbol defined in ONE file, including non-exported ones and class methods, ' +
      'with line numbers. Cheaper than reading a large file when you only need its structure.',
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string', minLength: 1, description: 'File relative to the workspace root.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const relative = String(args.path);
      const file = await resolveInside(ctx.workspaceRoot, relative);

      const stat = await fs.stat(file).catch(() => null);
      if (!stat) throw new ToolError(`no such file: ${relative}`, 404);
      if (stat.isDirectory()) throw new ToolError(`${relative} is a directory.`);

      const content = await fs.readFile(file, 'utf8').catch(() => null);
      if (content === null) throw new ToolError(`could not read ${relative}.`);

      const normalised = path
        .relative(ctx.workspaceRoot, file)
        .split(path.sep)
        .join('/');
      return {
        path: normalised,
        symbols: extractSymbols(normalised, content),
        lines: content.split('\n').length,
      };
    },
  });
}
