import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Write several files as one operation, or write none of them.
 *
 * ## Why this exists
 *
 * Grepped across every tool in `server/src/services` before writing it: there
 * was no `rename()`, no `fsync`, no temp-and-swap anywhere in this codebase.
 * `fs.file.write` and `git.patch.file.write` both write in place. That is
 * fine for one file and wrong for ten — and a realistic symbol rename in this
 * repository touches 4 to 12 files and rewrites up to 190 KB. A failure at
 * file seven leaves a repository that does not compile, and the agent's next
 * action is taken against that broken state.
 *
 * ## The sequence
 *
 * ```
 * 1. Read and keep the current bytes of every target.  (rollback material)
 * 2. Write each new version to <path>.<token>.tmp, in the SAME directory.
 * 3. fsync each temp file, then fsync the directory.
 * 4. rename() each temp over its target, in sorted order.
 * 5. Any failure before step 4  -> unlink temps, change nothing.
 *    Any failure during step 4 -> restore the already-renamed files from the
 *                                 bytes captured in step 1.
 * ```
 *
 * Step 2 insists on the same directory because `rename(2)` is only atomic
 * within a filesystem. Writing to `/tmp` and renaming across a mount boundary
 * silently degrades to copy-then-delete, which is exactly the non-atomic
 * behaviour this is meant to remove.
 *
 * Step 3 is not optional. Without the fsync a crash can leave a file renamed
 * into place whose contents never reached disk — the rename is durable and
 * the data is not, which is worse than not writing at all because it looks
 * like it worked.
 *
 * ## What this does NOT guarantee
 *
 * Step 4 is a loop of atomic operations, not one atomic operation. A power
 * loss midway through leaves some files renamed and some not. Closing that
 * needs a journal replayed on startup, which this does not have.
 *
 * What it does guarantee is that every *reachable* error — a permission
 * denial, a full disk, a concurrent edit, a file that vanished, a symlink
 * pointing outside the workspace — is detected before step 4, or rolled back
 * during it. Those are the failures that actually happen; the power-loss
 * window is milliseconds of `rename()` calls with no I/O in between.
 *
 * This distinction is stated rather than glossed because a caller that
 * believes it has crash atomicity will build on that belief.
 */

export interface FileEdit {
  /** Absolute path. Confinement is the caller's job and is checked again here. */
  path: string;
  /** Full new content. */
  content: string;
  /**
   * SHA-256 of the content this edit was computed against. When present, the
   * write refuses if the file on disk no longer matches — the guard against
   * applying an edit set to content nobody previewed.
   */
  expectedHash?: string;
}

export interface AtomicWriteResult {
  written: string[];
  bytesWritten: number;
}

export class AtomicWriteError extends Error {
  constructor(
    message: string,
    /** Whether the filesystem was left exactly as it was found. */
    readonly rolledBack: boolean,
    /** Paths that could not be restored, if a rollback itself failed. */
    readonly unrestored: string[] = [],
  ) {
    super(message);
    this.name = 'AtomicWriteError';
  }
}

export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/** fsync a path, tolerating platforms that refuse to sync a directory. */
async function syncPath(target: string, isDirectory: boolean): Promise<void> {
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(target, isDirectory ? 'r' : 'r+');
    await handle.sync();
  } catch (err) {
    // Directory fsync is unsupported on some platforms and filesystems. A
    // file fsync failing is a real problem and must not be swallowed.
    if (!isDirectory) throw err;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

/**
 * Apply every edit, or none.
 *
 * `root` is the workspace boundary. Every target is re-resolved through
 * `realpath` against it: a symlink inside the workspace pointing at
 * `/etc/passwd` is a file inside the workspace right up until it is written.
 */
export async function writeFilesAtomically(
  root: string,
  edits: readonly FileEdit[],
): Promise<AtomicWriteResult> {
  if (edits.length === 0) {
    // Not an error, but not a success either: a caller that reads "ok" from
    // an empty write will believe work happened.
    throw new AtomicWriteError('no edits to apply', true);
  }

  const resolvedRoot = await fs.realpath(root);
  const token = `${process.pid}.${crypto.randomBytes(6).toString('hex')}`;

  // Sorted so the order is deterministic: a rollback that replays in a
  // different order than the apply is far harder to reason about.
  const ordered = [...edits].sort((a, b) => a.path.localeCompare(b.path));

  const originals = new Map<string, string>();
  const temps: string[] = [];
  const renamed: string[] = [];

  const cleanupTemps = async (): Promise<void> => {
    await Promise.all(temps.map((t) => fs.rm(t, { force: true }).catch(() => undefined)));
  };

  try {
    // --- Phase 1: read and verify. Nothing is written in this phase. -------
    for (const edit of ordered) {
      const real = await fs.realpath(edit.path).catch(() => null);
      const target = real ?? path.resolve(edit.path);

      const relative = path.relative(resolvedRoot, target);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new AtomicWriteError(
          `refusing to write outside the workspace: ${edit.path}`,
          true,
        );
      }

      const current = await fs.readFile(target, 'utf8').catch(() => null);
      if (current === null) {
        throw new AtomicWriteError(`cannot read ${edit.path}; refusing to write any file`, true);
      }
      if (edit.expectedHash !== undefined && hashContent(current) !== edit.expectedHash) {
        throw new AtomicWriteError(
          `${path.relative(resolvedRoot, target)} changed since the edit was computed; ` +
            'nothing was written',
          true,
        );
      }
      originals.set(target, current);
    }

    // --- Phase 2: write temps beside their targets and fsync them. ---------
    const plan: { target: string; temp: string; content: string }[] = [];
    for (const edit of ordered) {
      const target = await fs.realpath(edit.path);
      const temp = path.join(
        path.dirname(target),
        `.${path.basename(target)}.${token}.tmp`,
      );
      await fs.writeFile(temp, edit.content, { encoding: 'utf8', mode: 0o600 });
      temps.push(temp);
      await syncPath(temp, false);
      plan.push({ target, temp, content: edit.content });
    }

    // One directory sync per directory, so the temp entries themselves are
    // durable before any of them is renamed into place.
    const directories = [...new Set(plan.map((p) => path.dirname(p.target)))];
    for (const dir of directories) await syncPath(dir, true);

    // --- Phase 3: rename into place. ---------------------------------------
    for (const step of plan) {
      try {
        await fs.rename(step.temp, step.target);
        renamed.push(step.target);
      } catch (err) {
        // Roll back everything already swapped, from the bytes read in phase 1.
        const unrestored: string[] = [];
        for (const done of renamed) {
          const original = originals.get(done);
          if (original === undefined) {
            unrestored.push(done);
            continue;
          }
          try {
            await fs.writeFile(done, original, 'utf8');
          } catch {
            unrestored.push(done);
          }
        }
        await cleanupTemps();
        throw new AtomicWriteError(
          `failed to replace ${step.target}: ${err instanceof Error ? err.message : 'rename failed'}`,
          unrestored.length === 0,
          unrestored,
        );
      }
    }

    return {
      written: plan.map((p) => p.target),
      bytesWritten: plan.reduce((sum, p) => sum + Buffer.byteLength(p.content, 'utf8'), 0),
    };
  } catch (err) {
    await cleanupTemps();
    if (err instanceof AtomicWriteError) throw err;
    throw new AtomicWriteError(
      err instanceof Error ? err.message : 'atomic write failed',
      renamed.length === 0,
    );
  }
}
