# Design — atomic multi-file refactoring

**Status:** design, not yet built. This is the last structural gap in Phase 2.

Everything else in the coding loop is closed: the agent can read a repository,
find where a symbol is declared and where it is used, apply a patch, run tests
behind a namespace boundary, commit, and open a pull request. What it cannot do
is change one thing in several files and be sure the repository is never left
half-changed.

---

## 1. What was measured first

Three numbers decided the shape of this design. All were taken from this
repository's own `server/src`.

### How many files a real rename touches

| symbol | files | bytes rewritten |
|---|---:|---:|
| `resolveInside` | 4 | 42,604 |
| `redactSecrets` | 9 | 176,022 |
| `registerTool` | 10 | 173,670 |
| `invokeTool` | 12 | 193,957 |

So the median case is not "edit a file". It is "edit ten files, any one of
which can fail". A crash after file seven leaves a repository that does not
compile, and the agent's next action is taken against that broken state.

### How many of the matches are actually renameable

From the reference classifier already shipped (`code-references.ts`), for
`redactToken` in this repository:

| context | count |
|---|---:|
| code | 7 |
| string | 28 |
| comment | 2 |
| import | 2 |
| declaration | 1 |

A rename that rewrites all 40 corrupts string literals. One that rewrites only
the 7 leaves documentation and imports lying. **The write tool cannot decide
this on its own**, which is why the design below makes the caller choose which
contexts to include and records the choice.

### Whether any existing write path is atomic

Grepped across every tool in `server/src/services`: there is no `rename()`, no
`fsync`, no temp-file-then-swap anywhere. `fs.file.write` and
`git.patch.file.write` both write in place. So atomicity is not a refinement of
an existing mechanism — it does not exist yet and has to be built.

---

## 2. The design

### 2.1 Two tools, not one

```
code.rename.preview.read    read-only. Returns the exact edit set.
code.rename.apply           the only write. Takes a preview digest.
```

Splitting them is not ceremony. The policy engine classifies by name suffix,
and these two must be classified differently: the preview is a `read`, the
apply is a write that needs approval. Fusing them into one tool would force the
read to carry the write's risk level, and a model exploring a refactor would
need human approval just to look.

The names were checked against the live policy engine before being written
down, the same way `code.references.search` and `git.pull_request.create` were:

| candidate | classification |
|---|---|
| `code.rename.preview.read` | `read`, no approval — correct for a preview |
| `code.rename.apply` | falls to catch-all: `high`, `external_write`, approval |
| `code.refactor.rename` | catch-all, **no required scope** |

`code.rename.apply` landing on the catch-all is acceptable — it *should* be
high risk — but it inherits no required scope, so a dedicated
`*.rename.apply` rule carrying `repository:write` should be added to
`BASELINE_RULES` first, exactly as `*.pull_request.create` already is. That is
part of the work, not a footnote.

### 2.2 The preview is a contract, not a courtesy

`code.rename.preview.read` returns:

```ts
interface RenamePreview {
  symbol: string;
  newName: string;
  /** Every edit that would be made, with enough detail to audit it. */
  edits: {
    path: string;
    line: number;
    column: number;
    context: ReferenceContext;   // from code-references.ts
    before: string;              // the line as it is
    after: string;               // the line as it would be
  }[];
  /** Contexts the caller asked to include. */
  included: ReferenceContext[];
  /** Matches deliberately left alone, so the caller sees what it is not fixing. */
  excluded: { context: ReferenceContext; count: number }[];
  /** Same honesty field the reference search already carries. */
  confidence: 'exact' | 'approximate';
  confidenceReason: string;
  /** Hash over the edit set AND the pre-edit content of every file. */
  digest: string;
}
```

`code.rename.apply` takes that `digest` and refuses if it no longer matches.
This is the part that makes the pair safe rather than merely two-step: between
preview and apply, a test run or another tool may have rewritten a file. Without
the digest the apply would silently rebase its edits onto content nobody
previewed. With it, the apply fails and the caller previews again.

The digest covers pre-edit file content, not just the edit list, for that
reason — an edit list that still *looks* right against changed content is
exactly the dangerous case.

### 2.3 Atomicity, given what this filesystem offers

POSIX gives one atomic primitive worth having: `rename(2)` within a filesystem.
There is no atomic multi-file commit. So the guarantee has to be constructed:

```
1. Read every target file; verify each against the digest.
2. Write every new version to <path>.<runId>.tmp, in the same directory
   (same filesystem, so the later rename is atomic).
3. fsync each temp file. Without this a crash can leave a renamed-into-place
   file whose contents never reached disk.
4. rename() each temp file over its target, in a stable sorted order.
5. On any failure before step 4: unlink all temps, change nothing.
   On any failure during step 4: roll back the renames already done, using
   copies taken in step 1.
```

**This is honest about its limit.** Step 4 is a loop of atomic operations, not
one atomic operation. A power loss midway through step 4 leaves some files
renamed and some not. The design does not claim otherwise; it claims that

- every *reachable* error path (permission, disk full, concurrent edit, a file
  vanishing) is handled without partial application, because those all surface
  before or during step 2–3, and
- the window in step 4 is milliseconds of `rename()` calls with no I/O in
  between.

Closing the remaining window needs either a journal the agent replays on
startup, or letting git do it — see §4.

### 2.4 Refusing rather than guessing

The apply must refuse, not warn, when:

- `confidence` is `approximate`. A lexical rename of `get` is a bad idea and
  the tool should not be the one talked into it. Overridable only by an
  explicit `acknowledgeApproximate: true`, which is recorded in the audit row.
- the new name is not a valid identifier, or collides with an existing
  declaration in any touched file. The collision check is cheap — the index is
  already built for the preview — and a rename that shadows an existing symbol
  is a compile error at best and a silent behaviour change at worst.
- any target file is outside the workspace, or is a symlink pointing outside.
  `resolveInside` + `realpath` already exist for this; they must be applied per
  file, not once for the root.
- the edit set is empty. "Renamed nothing, successfully" is the kind of result
  that makes a model believe it made progress.

### 2.5 What it will not do

Stated now so it does not get quietly assumed later:

- **Not type-aware.** It inherits `code-references.ts`'s lexical matching. It
  cannot tell two `handler`s apart, and says so through `confidence`.
- **Does not rename files.** Renaming `foo.ts` alongside the symbol `foo`
  changes every import specifier and is a different, larger problem.
- **Does not update non-code references** — a symbol named in a Markdown doc
  or a JSON fixture is out of scope, and reported as excluded rather than
  silently missed.

---

## 3. How it will be proved

The rule this codebase is scored by: a capability is built when a request
reaches it and a test goes red when it breaks. For this tool specifically:

| property | how it is proved |
|---|---|
| Atomicity on failure | Make file 7 of 10 unwritable, apply, assert **all ten** files are byte-identical to before |
| Digest actually guards | Preview, mutate a file, apply, assert refusal |
| fsync is not decorative | Mutation test: remove the fsync, assert a test fails |
| String literals untouched | Rename with `included: ['code']`, assert the string count is unchanged |
| Confinement per file | Symlink inside the workspace pointing to `/etc/passwd`, assert refusal |
| Approximate names refused | Rename `get`, assert refusal without the acknowledgement flag |
| Rollback restores content | Force a mid-rename failure, assert original bytes |

The first row is the one that matters most and is the easiest to fake. It must
assert the content of every file, not merely that the call returned an error.

---

## 4. The alternative that was considered and not chosen

Let git do it: write the changes, `git stash` on failure, or apply the whole
edit set as a single `git apply` patch which is itself atomic-ish.

Rejected for now, for a reason worth recording:

- `git apply` fails the whole patch if any hunk does not apply, which is the
  atomicity wanted — but it requires the workspace to be a git repository with
  a clean index, and `sandbox.test` runs against workspaces that may be
  neither. A refactoring tool that only works in a clean git tree is a
  refactoring tool that fails exactly when a run is midway through work.
- It would also put the agent's own edits into git's index, which the current
  design deliberately keeps separate: `git.patch.file.write` and
  `git.commit.create` are distinct tools so that writing and committing stay
  distinct approvals.

Worth revisiting if the temp-file approach proves fragile in practice. The
journal option in §2.3 is the better answer if the step-4 window ever matters.

---

## 5. Cost

Roughly one working session, in the shape the previous three took:

1. Add the `*.rename.apply` rule to `BASELINE_RULES`, verified by querying the
   live engine before and after.
2. `code-rename.ts` — edit-set construction and digest, pure, unit tested.
3. `atomic-write.ts` — the temp/fsync/rename sequence, tested with injected
   failures. Useful on its own: `fs.file.write` should adopt it afterwards.
4. Wire both tools, live-probe them over HTTP, mutation-test the guards.

The second and third are independent and the third is the one with lasting
value beyond this feature — there is currently no atomic write anywhere in the
codebase, and that is a gap this design happens to expose rather than one it
creates.
