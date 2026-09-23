import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  writeFilesAtomically,
  hashContent,
  AtomicWriteError,
} from '../../services/atomic-write.js';

let root: string;

async function write(rel: string, content: string): Promise<string> {
  const full = path.join(root, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
  return full;
}

async function read(rel: string): Promise<string> {
  return fs.readFile(path.join(root, rel), 'utf8');
}

/** Every file's content, so "nothing changed" can be asserted literally. */
async function snapshot(names: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const n of names) out[n] = await read(n);
  return out;
}

describe('writeFilesAtomically', () => {
  beforeEach(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'atomic-')));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('applies every edit when all of them succeed', async () => {
    const a = await write('a.txt', 'one');
    const b = await write('b.txt', 'two');

    const result = await writeFilesAtomically(root, [
      { path: a, content: 'ONE' },
      { path: b, content: 'TWO' },
    ]);

    expect(result.written).toHaveLength(2);
    expect(await read('a.txt')).toBe('ONE');
    expect(await read('b.txt')).toBe('TWO');
  });

  /**
   * The test that matters most, and the easiest one to fake by asserting only
   * that the call threw. It asserts the content of all ten files.
   *
   * The failure is engineered into phase 3 -- the rename loop -- rather than
   * phase 1. A first draft made file 7 unreadable, which fails during the
   * read-and-verify phase before anything is written; that version passed
   * even with the rollback code deleted, because the rollback never ran. The
   * distinction is the whole point of the test.
   */
  it('restores every file when the seventh rename fails midway', async () => {
    const names: string[] = [];
    const paths: string[] = [];
    for (let i = 0; i < 10; i++) {
      names.push(`f${i}.txt`);
      paths.push(await write(`f${i}.txt`, `original-${i}`));
    }
    const before = await snapshot(names);

    // The failure has to land in phase 3 -- the rename loop -- because that
    // is the only phase with anything to roll back. Two earlier attempts got
    // this wrong and both passed with the rollback code deleted: making the
    // file unreadable fails in phase 1, and making its directory read-only
    // fails in phase 2 when the temp file is written beside it. Failing the
    // seventh rename directly is the only way to exercise the path.
    const realRename = fs.rename.bind(fs);
    let renames = 0;
    (fs as any).rename = async (from: string, to: string) => {
      renames += 1;
      if (renames === 7) {
        const err = new Error('EACCES: simulated rename failure') as NodeJS.ErrnoException;
        err.code = 'EACCES';
        throw err;
      }
      return realRename(from, to);
    };

    try {
      await expect(
        writeFilesAtomically(
          root,
          paths.map((p, i) => ({ path: p, content: `rewritten-${i}` })),
        ),
      ).rejects.toThrow(AtomicWriteError);

      // Six files were already renamed into place before the failure and had
      // to be put back. All ten must hold their original bytes.
      expect(renames).toBe(7);
      for (const name of names) {
        expect(await read(name)).toBe(before[name]);
      }
    } finally {
        (fs as any).rename = realRename;
    }
  });

  it('reports a complete rollback as complete', async () => {
    const a = await write('a.txt', 'original-a');
    const b = await write('b.txt', 'original-b');

    const realRename = fs.rename.bind(fs);
    let renames = 0;
    (fs as any).rename = async (from: string, to: string) => {
      renames += 1;
      if (renames === 2) throw new Error('simulated rename failure');
      return realRename(from, to);
    };

    try {
      await writeFilesAtomically(root, [
        { path: a, content: 'new-a' },
        { path: b, content: 'new-b' },
      ]);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AtomicWriteError);
      expect((err as AtomicWriteError).rolledBack).toBe(true);
      expect((err as AtomicWriteError).unrestored).toEqual([]);
      expect(await read('a.txt')).toBe('original-a');
      expect(await read('b.txt')).toBe('original-b');
    } finally {
        (fs as any).rename = realRename;
    }
  });

  it('reports whether the filesystem was left as it was found', async () => {
    const a = await write('a.txt', 'one');

    try {
      await writeFilesAtomically(root, [
        { path: a, content: 'ONE' },
        { path: path.join(root, 'missing.txt'), content: 'X' },
      ]);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AtomicWriteError);
      expect((err as AtomicWriteError).rolledBack).toBe(true);
      expect((err as AtomicWriteError).unrestored).toEqual([]);
    }

    // The readable file was not written, because its partner was unreadable.
    expect(await read('a.txt')).toBe('one');
  });

  it('leaves no temporary files behind after a failure', async () => {
    const a = await write('a.txt', 'one');

    await expect(
      writeFilesAtomically(root, [
        { path: a, content: 'ONE' },
        { path: path.join(root, 'nope.txt'), content: 'X' },
      ]),
    ).rejects.toThrow();

    const leftovers = (await fs.readdir(root)).filter((n) => n.includes('.tmp'));
    expect(leftovers).toEqual([]);
  });

  it('leaves no temporary files behind after success', async () => {
    const a = await write('a.txt', 'one');
    await writeFilesAtomically(root, [{ path: a, content: 'ONE' }]);

    const leftovers = (await fs.readdir(root)).filter((n) => n.includes('.tmp'));
    expect(leftovers).toEqual([]);
  });

  describe('the expectedHash guard', () => {
    it('applies the edit when the file still matches', async () => {
      const a = await write('a.txt', 'one');

      await writeFilesAtomically(root, [
        { path: a, content: 'ONE', expectedHash: hashContent('one') },
      ]);

      expect(await read('a.txt')).toBe('ONE');
    });

    /**
     * The case the digest exists for: between computing an edit set and
     * applying it, something else rewrote the file. Without this check the
     * edit would be applied to content nobody previewed.
     */
    it('refuses when the file changed since the edit was computed', async () => {
      const a = await write('a.txt', 'one');
      const staleHash = hashContent('one');
      await fs.writeFile(a, 'someone else wrote this', 'utf8');

      await expect(
        writeFilesAtomically(root, [{ path: a, content: 'ONE', expectedHash: staleHash }]),
      ).rejects.toThrow(/changed since/);

      expect(await read('a.txt')).toBe('someone else wrote this');
    });

    it('refuses the whole set when any one file changed', async () => {
      const a = await write('a.txt', 'one');
      const b = await write('b.txt', 'two');
      const hashB = hashContent('two');
      await fs.writeFile(b, 'changed', 'utf8');

      await expect(
        writeFilesAtomically(root, [
          { path: a, content: 'ONE', expectedHash: hashContent('one') },
          { path: b, content: 'TWO', expectedHash: hashB },
        ]),
      ).rejects.toThrow(/changed since/);

      // a.txt was verifiable and is still untouched: the refusal is for the set.
      expect(await read('a.txt')).toBe('one');
    });
  });

  describe('confinement', () => {
    it('refuses a path outside the workspace', async () => {
      const outside = path.join(os.tmpdir(), `outside-${process.pid}.txt`);
      await fs.writeFile(outside, 'host content', 'utf8');
      try {
        await expect(
          writeFilesAtomically(root, [{ path: outside, content: 'OWNED' }]),
        ).rejects.toThrow(/outside the workspace/);

        expect(await fs.readFile(outside, 'utf8')).toBe('host content');
      } finally {
        await fs.rm(outside, { force: true });
      }
    });

    /**
     * A symlink inside the workspace is a file inside the workspace right up
     * until it is written. Resolution happens through realpath for exactly
     * this case.
     */
    it('refuses a symlink that points outside the workspace', async () => {
      const outside = path.join(os.tmpdir(), `target-${process.pid}.txt`);
      await fs.writeFile(outside, 'host content', 'utf8');
      const link = path.join(root, 'innocent.txt');
      await fs.symlink(outside, link);

      try {
        await expect(
          writeFilesAtomically(root, [{ path: link, content: 'OWNED' }]),
        ).rejects.toThrow(/outside the workspace/);

        expect(await fs.readFile(outside, 'utf8')).toBe('host content');
      } finally {
        await fs.rm(outside, { force: true });
      }
    });
  });

  it('refuses an empty edit set rather than reporting success', async () => {
    // "Wrote nothing, successfully" is the result that makes a caller believe
    // work happened.
    await expect(writeFilesAtomically(root, [])).rejects.toThrow(/no edits/);
  });

  it('writes files in nested directories', async () => {
    const a = await write('src/deep/a.ts', 'export const a = 1;');
    const b = await write('src/b.ts', 'export const b = 2;');

    await writeFilesAtomically(root, [
      { path: a, content: 'export const a = 11;' },
      { path: b, content: 'export const b = 22;' },
    ]);

    expect(await read('src/deep/a.ts')).toBe('export const a = 11;');
    expect(await read('src/b.ts')).toBe('export const b = 22;');
  });

  /**
   * fsync cannot be observed by reading the file back -- the page cache makes
   * an unsynced write indistinguishable from a synced one until the machine
   * loses power, which a test cannot arrange. So the call itself is what is
   * asserted.
   *
   * That is a weaker test than the others here and is worth naming as such:
   * it proves the sync is requested, not that the data reached the platter.
   * Without it, deleting the fsync leaves every other test green, and a
   * durability guarantee nothing checks is one that quietly disappears.
   */
  it('fsyncs each temp file before renaming it into place', async () => {
    const a = await write('a.txt', 'one');
    const b = await write('b.txt', 'two');

    const realOpen = fs.open.bind(fs);
    const synced: string[] = [];
    (fs as any).open = async (target: string, flags: string) => {
      const handle = await realOpen(target, flags);
      const realSync = handle.sync.bind(handle);
      handle.sync = async () => {
        synced.push(target);
        return realSync();
      };
      return handle;
    };

    try {
      await writeFilesAtomically(root, [
        { path: a, content: 'ONE' },
        { path: b, content: 'TWO' },
      ]);
    } finally {
        (fs as any).open = realOpen;
    }

    // Both temp files, and the directory holding them.
    expect(synced.filter((p) => p.includes('.tmp'))).toHaveLength(2);
    expect(synced).toContain(root);
  });

  it('puts the temp file in the same directory as its target', async () => {
    // Renaming across a filesystem boundary is not atomic, so the temp file
    // must be a sibling of the target rather than living in /tmp.
    const deep = await write('src/deep/a.ts', 'x');
    const observed: string[] = [];

    const original = fs.rename.bind(fs);
    (fs as any).rename = async (from: string, to: string) => {
      observed.push(from);
      return original(from, to);
    };
    try {
      await writeFilesAtomically(root, [{ path: deep, content: 'y' }]);
    } finally {
        (fs as any).rename = original;
    }

    expect(observed).toHaveLength(1);
    expect(path.dirname(observed[0]!)).toBe(path.dirname(deep));
  });
});
