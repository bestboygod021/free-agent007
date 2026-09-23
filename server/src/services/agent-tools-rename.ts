import { registerTool, ToolError } from './agent-tools.js';
import { resolveInside } from './agent-tools-builtin.js';
import {
  buildRenamePreview,
  previewToFileEdits,
  RENAMEABLE_CONTEXTS,
  type RenamePreview,
} from './code-rename.js';
import { writeFilesAtomically, AtomicWriteError } from './atomic-write.js';

/**
 * Renaming a symbol across files: a preview and an apply, deliberately split.
 *
 * ## Why two tools
 *
 * The policy engine classifies by dotted suffix, and these two must be
 * classified differently. `code.rename.preview.read` is a read — a model
 * exploring a refactor should not need human approval to look. `code.rename.apply`
 * is a high-risk write. Fusing them would force the read to carry the write's
 * risk level.
 *
 * Both names were checked against the live engine before being written, the
 * same discipline every tool here has followed. `*.rename.apply` now has its
 * own rule in `BASELINE_RULES` carrying `repository:write` and
 * `alwaysApprove`; without it the name fell to the catch-all, which is
 * nominally `high` but requires **no scope at all**.
 *
 * ## Why the digest
 *
 * `apply` takes the digest the preview produced and refuses if it no longer
 * matches. Between preview and apply, a test run or another tool may have
 * rewritten a file. Without the digest, apply would silently rebase its edits
 * onto content nobody previewed. The digest covers the pre-edit bytes of every
 * touched file, not just the edit list, because an edit list that still looks
 * right against changed content is the dangerous case.
 */

/** Edits returned in one preview. The totals always describe the full set. */
const MAX_PREVIEW_EDITS = 300;

function summarise(preview: RenamePreview) {
  return {
    symbol: preview.symbol,
    newName: preview.newName,
    edits: preview.edits.slice(0, MAX_PREVIEW_EDITS),
    totalEdits: preview.edits.length,
    truncated: preview.edits.length > MAX_PREVIEW_EDITS,
    files: preview.files,
    included: preview.included,
    excluded: preview.excluded,
    confidence: preview.confidence,
    confidenceReason: preview.confidenceReason,
    digest: preview.digest,
    ...(preview.refusal === undefined ? {} : { refusal: preview.refusal }),
  };
}

export function registerRenameTools(): void {
  registerTool({
    name: 'code.rename.preview.read',
    description:
      'Show exactly what renaming a symbol would change, without changing anything. Returns ' +
      'every edit with its file, line and context (code, string, comment, import, declaration), ' +
      'plus a digest to pass to code.rename.apply. Read this before applying.',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, description: 'Current symbol name.' },
        newName: { type: 'string', minLength: 1, description: 'Replacement name.' },
        path: {
          type: 'string',
          description: 'Subdirectory to limit the rename to. Defaults to the workspace root.',
        },
        include: {
          type: 'array',
          items: { type: 'string', enum: [...RENAMEABLE_CONTEXTS] },
          description:
            'Which reference contexts to rewrite. Defaults to ["code","declaration"]. ' +
            'Including "string" or "comment" rewrites text the compiler never sees.',
        },
      },
      required: ['name', 'newName'],
      additionalProperties: false,
    },
    timeoutMs: 60_000,
    async handler(args, ctx) {
      const root = await resolveInside(ctx.workspaceRoot, (args.path as string) ?? '.');
      const preview = await buildRenamePreview({
        root,
        symbol: String(args.name),
        newName: String(args.newName),
        include: Array.isArray(args.include)
          ? (args.include as (typeof RENAMEABLE_CONTEXTS)[number][])
          : undefined,
      });

      return summarise(preview);
    },
  });

  registerTool({
    name: 'code.rename.apply',
    description:
      'Apply a rename previewed by code.rename.preview.read. Requires the digest from that ' +
      'preview and refuses if any file changed since. All files are written together or none ' +
      'are. Requires repository:write and explicit human approval.',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, description: 'Current symbol name.' },
        newName: { type: 'string', minLength: 1, description: 'Replacement name.' },
        digest: {
          type: 'string',
          minLength: 1,
          description: 'The digest returned by code.rename.preview.read.',
        },
        path: { type: 'string', description: 'Same subdirectory the preview used.' },
        include: {
          type: 'array',
          items: { type: 'string', enum: [...RENAMEABLE_CONTEXTS] },
          description: 'Same contexts the preview used.',
        },
        acknowledgeApproximate: {
          type: 'boolean',
          description:
            'Required when the preview reports confidence "approximate". Recorded in the audit row.',
        },
      },
      required: ['name', 'newName', 'digest'],
      additionalProperties: false,
    },
    timeoutMs: 120_000,
    async handler(args, ctx) {
      const root = await resolveInside(ctx.workspaceRoot, (args.path as string) ?? '.');

      // Recomputed rather than trusted from the caller. The digest is what
      // links this to a preview a human saw; accepting an edit list from the
      // request would let the model hand over edits nobody previewed.
      const preview = await buildRenamePreview({
        root,
        symbol: String(args.name),
        newName: String(args.newName),
        include: Array.isArray(args.include)
          ? (args.include as (typeof RENAMEABLE_CONTEXTS)[number][])
          : undefined,
      });

      if (preview.refusal !== undefined) {
        throw new ToolError(`refusing to rename: ${preview.refusal}`);
      }
      if (preview.digest !== String(args.digest)) {
        throw new ToolError(
          'the workspace changed since this rename was previewed; run ' +
            'code.rename.preview.read again and apply the new digest.',
          409,
        );
      }
      if (preview.confidence === 'approximate' && args.acknowledgeApproximate !== true) {
        throw new ToolError(
          `refusing to rename "${preview.symbol}": ${preview.confidenceReason} ` +
            'Pass acknowledgeApproximate: true to proceed anyway.',
        );
      }

      const fileEdits = await previewToFileEdits(root, preview);

      try {
        const result = await writeFilesAtomically(root, fileEdits);
        return {
          renamed: true,
          symbol: preview.symbol,
          newName: preview.newName,
          filesChanged: preview.files,
          editsApplied: preview.edits.length,
          bytesWritten: result.bytesWritten,
          confidence: preview.confidence,
          acknowledgedApproximate: args.acknowledgeApproximate === true,
        };
      } catch (err) {
        if (err instanceof AtomicWriteError) {
          // Whether the tree was left intact is the single thing the caller
          // most needs to know after a failed refactor, so it is said first.
          throw new ToolError(
            `${err.message} (workspace ${err.rolledBack ? 'unchanged' : 'PARTIALLY MODIFIED'}` +
              `${err.unrestored.length > 0 ? `; could not restore: ${err.unrestored.join(', ')}` : ''})`,
            err.rolledBack ? 409 : 500,
          );
        }
        throw err;
      }
    },
  });
}
