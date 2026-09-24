# What is left of the 500, and in what order

A companion to `02-capability-audit.md`. That document scores what exists;
this one lists what does not, and sequences it.

Position as of `6493989`: **~171 of 500 built or partial, ~330 remaining.**
(The per-category column below sums to 334; the audit's own totals round to
171 built. The five-item discrepancy is rounding inside the `~` figures, not a
missing category — it is left visible rather than fudged to match.)
The three commits since the audit were security fixes — they moved no
capability counters, which is worth saying plainly rather than quietly
re-scoring.

---

## The number that should decide the order

Before listing features, one measurement, because it changes what "remaining"
means.

`agent/src/core` is 225 files and 32,312 lines. I classified every file by
whether anything in `server/src`, `cli/src` or `client/src` (excluding test
directories) imports it:

| | files | lines |
|---|---:|---:|
| wired into production | 16 | 3,771 |
| **tested but never wired** | **209** | **28,541** |
| neither wired nor tested | 0 | 0 |

**88% of the kernel is unreachable from a running server.** It is not dead
code in the usual sense — it is well-tested, deliberate, fail-closed logic,
and 613 agent tests pass against it. But no request can reach any of it.

A caveat on that number, because I got it wrong the first time: my initial
pass missed `agent/test/` and reported these files as untested too. They are
tested. The claim is specifically *no production consumer*, not *no coverage*.

This reframes the roadmap. A large part of the "remaining 329" is not
greenfield work — the decision logic is written and proven. What is missing
is the wiring: a table, a route, a call site. **Wiring an existing kernel
module is a fraction of the cost of designing one**, and that is why the
phases below are ordered by wiring-first rather than by list order.

The 16 that are wired, for reference: `checkpoint-store`, `compute-mode`,
`evidence`, `identity-access-contract`, `job-queue`, `knowledge-fabric`,
`memory-retrieval`, `model-router`, `output-contract`, `policy-engine`,
`prompt-library`, `redaction`, `schema-registry`, `state-machine`, `task-dag`,
`types`.

---

## Remaining work by category

Counts are "not built", derived from the audit's per-category scores.

| # | Category | Built | Left | Character of what is left |
|---|---|---:|---:|---|
| 1 | Model gateway | 14/15 | **1** | WebSocket transport; true request replay |
| 2 | Providers | 17/20 | **3** | OAuth, managed identity, geographic routing |
| 3 | Agent runtime | ~16/25 | **9** | Graph execution, parallel sub-agents |
| 4 | Tools | ~8/25 | **17** | Tool SDK, marketplace, dynamic discovery, scheduling, compensation |
| 5 | Memory | 8/25 | **17** | Semantic search, summarisation, contradiction detection, encryption at rest |
| 6 | RAG | ~9/30 | **21** | ANN index, reranking, connectors, PDF (hybrid search and DOCX/XLSX parsing now built) |
| 7 | Workflows | ~1/25 | **24** | Everything except DAG validation logic |
| 8 | Coding | ~7/30 | **23** | PR creation, execution sandbox, cross-file refactoring |
| 9 | Browser | 0/25 | **25** | Entire subsystem, no dependency present |
| 10 | Business data | ~2/25 | **23** | Excel, CRM/email/calendar connectors |
| 11 | Security | 16/25 | **9** | Injection classifier, egress enforcement, gateway-side tenancy |
| 12 | Identity | ~10/25 | **15** | SSO, OIDC, MFA, passkeys, user-management UI |
| 13 | Observability | ~12/25 | **13** | OpenTelemetry, alerting, evals, golden sets, judges |
| 14 | Cost | ~8/25 | **17** | Autoscaling, tool/embedding cache, ROI attribution |
| 15 | UX | ~13/25 | **12** | Streaming UI, conversation branching, workflow canvas, WCAG |
| 16 | Collaboration | ~1/25 | **24** | Blocked on §12 |
| 17 | Multimodal | ~9/25 | **16** | Creative agents, diagram generation, multimodal memory |
| 18 | Extensibility | ~6/25 | **19** | Helm, K8s operator, Terraform, Python/Go SDKs, plugin signing |
| 19 | Resilience | ~12/25 | **13** | Multi-region, PITR, chaos testing, runbooks |
| 20 | Advanced | ~0/30 | **30** | Consensus, canary, human feedback — all written, none wired |
| | **Total** | **~171** | **~334** | |

---

## Phase 1 — Wire what already exists

> **This phase's premise was wrong, and measuring it is the most useful thing
> in this document. Read the correction below before scheduling any of it.**

**~40 items**, originally listed as the highest value per unit of work in the
list, on the theory that the logic is written and tested and only the call site
is missing.

### The measurement that changed this phase

I classified all 209 unwired modules by counting `boolean` fields on their
exported input interfaces — fields like `sandboxed`, `signed`, `noNetwork`,
`redacted`, `dnsPinned`, `tenantMatch`.

| | modules |
|---|---:|
| declare safety facts as boolean inputs | **200** |
| declare none | 9 |

And separately: of 225 files in `agent/src/core`, **6** contain any call
capable of observing the world (`fetch`, `dns`, `crypto`, `fs`, `spawn`).

These are **contract checkers**, not enforcement points. Two live runs, both
executed before writing any code:

```
decideM190Egress({ destination: 'http://169.254.169.254/latest/meta-data/',
                   dnsPinned: true, tlsVerified: true, dlpPassed: true, ... })
  -> { allowed: true }

decideM196Execution({ sandboxed: true, networkAllowed: false,
                      secretAccess: false, ... })  -> { allowed: true }
decideM196Execution({ sandboxed: false, networkAllowed: true,
                      secretAccess: true, ... })   -> { allowed: false }
```

Same plugin in the last two. The only difference is whether the caller told the
truth. **Wiring one of these up produces a guard that rewards honesty and stops
nothing.**

This is not a criticism of the kernel modules. They encode genuinely useful
checklists — *what* must hold before a plugin runs, an egress is permitted, a
model is promoted. What they cannot do is find out whether it holds.

### What Phase 1 actually is

Not "wire up 40 modules". For each one, two separate questions:

1. **Does anything establish the facts it asks for?** If not, that
   establishing layer is the real work, and it is not small.
2. **Is the checklist worth keeping once you have?** Usually yes — the kernel
   already enumerates the conditions, which is the part people get wrong.

Two items have now gone through this:

- **Egress (261)** — shipped as `services/web-fetch.ts`, which resolves DNS and
  classifies the address via `lib/url-guard.ts` rather than accepting
  `dnsPinned` from a caller.
- **Process safety** — shipped as `services/agent-attestation.ts`. An
  `Attestation` is a claim *paired with how it was established*, and there is
  deliberately no constructor taking a bare boolean. `attestSpawn()` takes the
  options object handed to `child_process.spawn` and derives whether it amounts
  to a sandbox, so the guard cannot drift from what the spawn does — flip
  `shell: false` to `true` and the spawn is refused. Verified by mutation.

The same shape applies to the rest: something must measure, then the kernel
checklist becomes useful.

### Revised ordering consequence

Phase 1 is **no longer the cheapest phase**. Its items should be re-costed
individually and most of them are closer in size to Phase 2 work than to a
call-site change. Phases 2 and 3 are now the better place to start, and this
document's earlier claim that Phase 1 is "the only phase where the hard part is
already done" was exactly backwards: the hard part — establishing facts about
the running system — is the part that was never written.

### Original module list, retained for reference

Each of these is an existing `agent/src/core` module with no production
consumer. The work is a table, a route, and a call — not a design.

| Kernel module | Unblocks | Items |
|---|---|---|
| `model-consensus-runtime` | multi-model voting on a proposal | 471–476 |
| `canary-trials` | A/B rollout of a model or prompt | 477–482 |
| `human-feedback-runtime` | thumbs-up/down feeding scoring | 483–488 |
| `evaluation-runtime` + `benchmark-runner` | golden sets, judges, regression gates | 309–320 |
| ~~`egress-policy-runtime`~~ | see the note below — **not wirable as-is** | 261 |
| `workflow-automation` + `task-dag` | actually execute the validated graph | 141–150 |
| `repository-context-runtime` | repo-wide context for coding phases | 166–175 |
| `session-auth`, `usage-ledger`, `platform-settings` | governance surface | 271–280 |

The 16 modules that *are* wired include every one that decides something
without being told it — `policy-engine`, `state-machine`,
`identity-access-contract`, `model-router`, `redaction`. That is almost
certainly not a coincidence: the ones that could be used got used.

Two cautions learned the hard way on this codebase:

- **Wiring is where the security bugs live.** All three bugs fixed this week
  were wiring failures, not logic failures — a guard that existed and was not
  called, a service tested in isolation while its route was tested without it.
  Every item here should ship with a test that exercises the *route*, not the
  module.
- **Tool names are load-bearing.** Anything registered as a tool must be
  verified with a live `evaluateToolCall`, because an unrecognised name is
  silently classified high-risk and dropped from every autonomous phase.

**Exit criterion:** wired-module count goes from 16 to ~30, and each new
route has a test that fails if the kernel call is removed.

---

## Phase 2 — Close the coding loop

**~23 items (166–195).** The agent can read a repo, find where a symbol is
declared *and* where it is used, apply a patch, commit, run tests behind a
real namespace boundary, and open a pull request. The one structural gap
left in this phase is the *write* half of refactoring: an atomic multi-file
rename.

1. ~~**PR creation**~~ — **done.** `git.pull_request.create`, under a
   separate `AGENT_FORGE_TOKEN` that is never written to `.git/config`, so
   the deliberate property in `agent-tools-git.ts` (`GIT_ASKPASS=''`,
   `GIT_TERMINAL_PROMPT=0`, `GIT_CONFIG_NOSYSTEM=1` — *an agent can never
   authenticate as the human who installed the gateway*) survives intact.
   Two things worth carrying forward:
   - The tool name was chosen by querying the live policy engine, not by
     taste. `git.pull_request.create` matches a rule carrying
     `pull_request:write` and `alwaysApprove`. The plausible alternatives
     (`git.pr.create`, `forge.pr.create`, `git.push`) are classified `high`
     but carry **no required scope at all** — nominally stricter, actually
     weaker.
   - Deleting the token redaction inside the spawn helper left every
     tool-level test green, because a real git run scrubs URL userinfo
     before printing and a stubbed push replaces the helper entirely. A
     guard with no reachable test is not a guard.
2. ~~**Cross-file refactoring**~~ — **the reference half is done.**
   `code.references.search` classifies every occurrence as code, string,
   comment, import or declaration, because the classification *is* the
   answer: measured on this repository, `redactToken` has 7 code references
   against 28 inside string literals. It is lexical, not type-aware, and
   says so — `confidence: approximate` for short or common names rather
   than a confident wrong number. What remains is the *write* half: a
   rename that edits the code references and leaves the rest, which needs
   the multi-file atomic patch this codebase does not have yet.
3. ~~**Execution sandbox**~~ — **done, and this document was wrong about
   why it was hard.** The claim was that no docker/podman/bwrap means a
   sandbox "needs a real design decision". True about the tools; false as a
   conclusion. `unshare` is present and unprivileged user namespaces are
   permitted, which is enough for `--user --mount --net --pid`, a read-only
   `/` with the workspace bind-mounted back read-write, and a fresh `/proc`.
   Verified by running six escape probes through the live tool before and
   after: all six went from REACHED to blocked.

   The general lesson, which cost three bugs to learn: **an isolation
   boundary has to be probed, never assumed.** The pid namespace was
   working while `/proc` was inherited and still listed 100 host processes.
   `SIGKILL` to the `unshare` pid fired `exit` but never `close`, so the
   timeout that was supposed to bound a run leaked the process instead.
   Remounting the workspace read-write silently did nothing unless it was
   bind-mounted to itself first.

   Still not covered, and said out loud rather than buried: read access is
   *reduced by masking, not eliminated* (no `pivot_root` here), and there
   is no CPU or memory ceiling without cgroup delegation.
4. ~~**Atomic multi-file refactoring**~~ — **done.** Designed in
   **[05-atomic-refactor-design.md](05-atomic-refactor-design.md)** and built
   as `atomic-write.ts` + `code-rename.ts`, exposed as
   `code.rename.preview.read` and `code.rename.apply`. The measurement that
   shaped it: a realistic rename here touches 4–12 files and rewrites up to
   190 KB, and **no write path in the codebase was atomic** — no `rename()`,
   no `fsync`, no temp-and-swap anywhere — so it had to be built rather than
   refined.

   Three lessons worth more than the feature:

   - **A failure test can exercise the wrong failure and still look right.**
     Killing the rollback mutant took three attempts. Making the target a
     directory failed in phase 1 (read); `chmod 0o555` on the directory failed
     in phase 2 (temp write, because the temp file lives beside its target).
     Both left the test green with the rollback code *entirely deleted*. Only
     stubbing `fs.rename` to fail on the seventh call reached phase 3. Before
     trusting a failure test, ask which phase actually failed.
   - **`fsync` is not observable by reading the file back** — the page cache
     answers. Counting `handle.sync()` calls through a stubbed `fs.open` is a
     weaker test, and that weakness is recorded in the test rather than
     hidden, because without it deleting `fsync` turns nothing red.
   - **Classification bugs hide until something acts on them.** Building the
     rename surfaced a real bug in `code-references.ts`, shipped earlier and
     tested: `export const label = 'widgetise';` was classified as an *import*
     because the line starts with `export`. Read-only navigation merely
     mislabelled a row; a rename would have refused to rewrite a legitimate
     string, or rewritten a module path. **A writer is a much harsher test of
     a reader than the reader's own tests are.**

   `fs.file.write` has since adopted the atomic path, which needed two
   changes to the writer and exposed a third bug:

   - **Creating a file and replacing one are different decisions.** The writer
     refused anything it could not first read — the guard that stops a typo'd
     path from quietly producing a plausible new file. `fs.file.write`
     genuinely creates files, so creation became an explicit `allowCreate`
     opt-in rather than the default softening for everyone.
   - **A file that does not exist has no realpath**, so the *parent* is
     resolved instead. Resolving only the string would have let a symlinked
     parent directory place the write outside the workspace while the
     confinement check looked at a path the write never used.
   - **A TOCTOU that was already there:** phase 2 called `realpath` again
     instead of reusing the target phase 1 had verified. A symlink swapped
     between the two phases would be checked as one path and written as
     another. Phase 1's resolved target is now carried forward.

   And a mutant survived on the first attempt, the same trap as before: the
   rollback test created a file that sorted *second*, so the simulated failure
   happened before it was ever renamed in and there was nothing to undo.
   Deleting the entire "remove the created file" branch kept the test green.
   Renaming it to sort first killed the mutant. **When a mutant survives, the
   fixture is usually wrong, not the assertion.**

   Auditing the last direct writer, `git.patch.file.write`, found a
   concurrency bug that had nothing to do with atomicity. It staged the diff
   to `.git/agent-patch-${Date.now()}.diff`, and `Date.now()` has millisecond
   resolution — measured here at **4,948 calls producing 5 distinct values in
   5 ms**, so roughly a thousand calls share a name. Two concurrent patches
   wrote, read and deleted the same file.

   The observed failure is the part worth recording. With `Date.now()` frozen,
   one call returned **`applied: true` while its own diff was never applied**:
   its staging file had been overwritten between `git apply --check` and
   `git apply --apply`, so it validated one patch and applied another, then
   reported success. A crash would have been better. The name now carries
   `process.pid` and eight random bytes, and the test freezes `Date.now()` —
   without freezing it the two calls land a millisecond apart and the
   collision never happens, which is exactly the "green test exercising a
   path that never runs" trap from the rollback work.

   Still not covered, said out loud: phase 3 is a loop of atomic operations,
   not one atomic operation — a power loss mid-loop is not covered.

5. ~~**The two policy advice endpoints were never audited**~~ — **done, and
   one was wrong.** `/policy/tool-call` spread the caller's context over
   restrictive defaults, so the caller could answer its own question:
   `protectedBranches: []` turned a denied commit to `main` into
   `allowed: true`, `approverUserId` could be set to anything, and
   `grantedScopes` was taken from the body rather than from configuration.

   The execution path was never affected — `/tools/invoke` has always built
   its context with `buildPolicyContext` — so this was not a privilege
   escalation. It was worse in a quieter way: the docs promise that a driver
   "obeys exactly the rules `/policy/tool-call` reports", and an agent that
   consults the preview before acting would have been told yes and then
   denied. **A preview that disagrees with the enforcement is worse than no
   preview: it is a confident wrong answer.** Both endpoints now build their
   context the same way the executor does.

   Writing the tests was the instructive part, and two of the first three
   asserted nothing:

   - The scope gate fires first, so a test about the *approver* on a call
     without the scope is refused before it reaches the approval logic. It
     passed against the broken code.
   - `approverUserId` is not echoed in the response, so asserting the
     attacker's address is absent passed no matter what. Deleted.
   - `autonomy: 'autonomous'` is not a level at all — the levels are
     `readonly`, `supervised`, `autonomous-branch`, `full` — so the invalid
     value was discarded by both versions. The surviving test claims `full`
     and asserts on the *reason string*, which names the ceiling actually
     applied.

   **An assertion that cannot fail is not a test.** Mutation testing is what
   exposed all three: the mutant killed one test out of three.

6. **A run budget could be turned off by asking for less of it.** Found by
   grepping for request fields that reach a decision without validation, the
   same pattern as item 5.

   `createRun` clamped every ceiling with `Math.min(requested, allowed)`, so
   nobody could ask for *more* than the mode permits. There was no floor.
   `exhaustedBudget` reads `row.max_tokens > 0 && ...` — a non-positive
   ceiling means "this mode has no token budget", which is right for a mode
   and catastrophic for a caller-supplied value.

   Measured, not argued: a run created with `maxTokens: -5` survived six
   steps of a million tokens each, while the default stopped after two with
   `token budget exhausted (1000000/400000)`. `maxTokens: 0` did the same.
   **Asking for less bought unlimited.**

   `maxTokens` now needs to be finite and ≥ 1; `maxCost` finite and ≥ 0 —
   *not* symmetric, because free mode's genuine cost budget is `0` and
   rejecting it would reject the default. Four mutants killed, including one
   in the opposite direction: making the cost floor `< 1` too breaks free
   mode, and a test catches that as well.

   `maxSteps` already had its floor, which is why this was easy to miss: the
   validation next to it looked like the validation for all of them.

---

## Phase 3 — Retrieval that survives real documents

**~24 items (111–140).** `rag-store.ts` works, with three stated limits:
text-only input, brute-force cosine scan, no reranking.

The phase opened by measuring all three, and the measurement reordered them.

1. ~~**Hybrid keyword + vector search**~~ — **done, and it was the urgent one,
   not the third.** The measurement: a corpus containing the sentence
   *"Error ERR_QUOTA_7734 means the provider rejected the request"*, asked for
   `ERR_QUOTA_7734`, returned **nothing**. Every chunk scored 0.000 and the
   default `minScore: 0.2` discarded them all. The identifier is outside the
   embedding's vocabulary, so it contributes no signal, so the ranking is a
   flat tie. A real model fails the same way for the same reason — a rare
   identifier becomes subword fragments whose mean points nowhere — and
   "find this identifier" is the query an agent reading code actually types.

   `rag-keyword.ts` adds BM25 through SQLite's FTS5, which turned out to be
   compiled into the better-sqlite3 already in the lockfile (checked by
   running it, not by reading build flags), so this cost no new dependency.
   Fusion is Reciprocal Rank Fusion: cosine lives in [-1, 1] and BM25 is
   unbounded and negative, so normalising them onto one scale would mean
   inventing a conversion that does the real work while looking like
   arithmetic. Ranks are already comparable.

   Three things worth more than the feature:

   - **Raw query text reached `MATCH`, which is a query *language*.** Measured:
     `v2.10.3` raised "syntax error near .", and `agent-tools` raised "no such
     column: tools" because the hyphen reads as a column filter. A user
     searching for a version number could error the query. Every term is now
     extracted and quoted as a literal.
   - **Hybrid degrades to keyword-only when the embedding provider is down,
     and says so** via `vectorSearched: false`. Explicit `vector` mode still
     throws, because there is no second half to fall back to. Returning
     keyword results labelled as hybrid would be the dishonest version.
   - **Two mutants survived the first pass, and both times the fixture was
     wrong, not the assertion.** Reversing `ORDER BY bm25` changed nothing
     because every test query matched exactly one chunk; a corpus with three
     competing matches killed it. The orphan-row filter needed a chunk that
     exists in the FTS index and not in the vector join — the state the
     migration backfill actually produces.

   Still not done here: no reranking model, and camelCase is not split, so
   `resolveScope` is findable and `scope` alone does not find it.

2. ~~**ANN index**~~ — **measured, and deliberately not built.** The brute
   force scan costs 5 ms at 100 chunks, 13 ms at 1,000, 149 ms at 10,000 and
   888 ms at 50,000. A single embedding API call for the query costs more than
   the scan does below ~10,000 chunks, so an ANN index would optimise the
   cheaper half. The keyword half is a real index already. Revisit when a
   corpus here actually passes ten thousand chunks; until then this is a
   speculative dependency.
3. ~~**Document parsers**~~ — **DOCX and XLSX built; PDF deliberately not.**
   `office-zip.ts` reads the archive and `office-text.ts` extracts the text,
   with no new dependency: `pdf-parse`, `pdfjs-dist`, `mammoth`, `docx`,
   `xlsx`, `exceljs`, `unzipper`, `adm-zip` and `jszip` all still fail to
   resolve, and that is the point. `POST /api/agent/documents` takes
   `contentBase64`, so the parser is reachable rather than a library sitting
   in `services/`.

   Four decisions worth keeping:

   - **The central directory is the index, not a scan for local headers.**
     The two disagree in real archives that use data descriptors, and a
     tampered archive can hide an entry from a scan. Entry *data* is still
     located through the local header, because its extra-field length
     routinely differs from the central directory's.
   - **Runs are joined with no separator.** Word splits `resolveScope` across
     two `<w:r>` elements; a space would store `resolve Scope` and the
     identifier would be unfindable by either half of hybrid search. Line
     breaks come only from `<w:p>`, `<w:br/>`, `<w:tab/>` and cell
     boundaries, and a table row comes out tab-separated rather than one line
     per cell.
   - **`<w:instrText>` is dropped.** It carries field instructions such as a
     HYPERLINK target. Keeping it would index a URL no human reader ever saw.
   - **PDF is out of reach and was not attempted.** It needs font maps and
     content-stream decoding that `zlib` alone does not provide. A parser
     that handles the three PDFs it was tested against is worse than none,
     because it fails silently on the fourth.

   The test fixtures are not written by this code. The DOCX and XLSX come
   from `python-docx` and `openpyxl`, and the hazard fixture is a genuine
   Word-authored template with a substituted `document.xml` — a parser
   validated against its own writer proves only that the two agree.
   Hand-built archives appear in the suite **only** for the malformed and
   hostile cases a real library will not emit.

   Still open here: `.doc`/`.xls` (the pre-2007 binary formats, a different
   problem entirely), `.pptx`, and embedded images.

~~Related and cheap: **Excel** (items 221–230).~~ **Done.** `data.xlsx.query`
and `data.xlsx.schema.read` load one sheet into the same sandbox
`data.csv.query` uses, through a shared `loadRows` so column normalisation,
type inference and the read-only enforcement are one implementation rather
than two that drift.

Two bugs in the freshly shipped parser surfaced only because a table demands
more of it than text does:

- **Column identity.** Excel omits an empty cell entirely, so a four-column
  row with a gap writes three `<c>` elements. Reading them in order files the
  third column's value under the second. In extracted text that is a cosmetic
  misalignment; in a table it is a wrong answer returned confidently. Columns
  now come from the `r="C2"` reference, and filling those gaps needed its own
  ceiling, because a single `r="XFD1"` otherwise decides how much memory every
  row costs.
- **Sheet identity.** The sheet's part was guessed as `sheet{n+1}.xml` from
  the tab position. Excel leaves `sheet1.xml` and `sheet3.xml` behind after a
  middle tab is deleted, so the guess read nothing for the second tab — while
  still reporting its name, so a caller was told a sheet had been read that
  had not. Resolution now goes through `r:id` and
  `xl/_rels/workbook.xml.rels`.

Neither was reachable from a fixture written by `openpyxl`, which renumbers
parts on save and fills gaps. Both needed an archive built to be structurally
real rather than conveniently generated.

Still open in this area: `.xlsx` writing, merged cells (currently the value
lands in the top-left and the rest read empty, which is what the file says but
not what a human sees), and dates (a date is a serial number and the format
that makes it a date lives in `styles.xml`, which is not read).

---

## Phase 4 — Governance and identity

**~39 items (§12 + §16).** Collaboration is 1 of 25 purely because it is
blocked here.

Tenancy currently covers `/api/agent/*` only. **The gateway's own tables —
keys, models, logs, requests — remain single-tenant.** That is the larger half
and the honest blocker: multi-tenant billing or per-org keys cannot be built
on top of a single-tenant key store.

Then SSO/OIDC (271–272), real MFA (273 — currently *substituted* by password
re-entry, which the audit already flags as weaker), passkeys, and a
user-management UI.

---

## Phase 5 — Observability you can page on

**~13 items.** Metrics exist; alerting does not. OpenTelemetry is absent from
the lockfile, so a slow agent run cannot be attributed to a phase or a
provider call without reading logs by hand.

---

## Phase 6 — Browser automation

**25 items (196–220), and the only phase that is a project rather than a
task.** No Playwright, no Puppeteer, no browser dependency of any kind;
`browser-signal-runtime.ts` processes hypothetical signals.

**Environment constraint, stated because it changes what can be proven:** this
sandbox has no browser installed and `cdn.playwright.dev` is unreachable,
though the npm registry is not. Code that drives a real browser can be
*written* here but cannot be *executed* here — and the standing rule on this
project is that a capability is not claimed until it has been run.

That argues for splitting the phase:

- **6a — `web.page.read` / `web.page.search`** — **done.** HTTP fetch plus
  HTML-to-text extraction behind `lib/url-guard.ts`, re-checked on every
  redirect hop. Verified against a live server: the AWS metadata endpoint, its
  decimal-encoded form `http://2852039166/`, and the gateway's own loopback API
  are all refused; a real page fetches and parses. 50 tests, two mutations
  killed.
- **6b — CDP driver:** tools connect to a remote Chrome via an
  `AGENT_BROWSER_CDP_URL`. Real automation, but only testable against a fake
  CDP endpoint in this environment; the live path stays unproven until it runs
  somewhere with a browser.

---

## Phase 7 — Platform and distribution

**~32 items.** Helm, K8s operator, Terraform, Python/Go SDKs, plugin signing,
multi-region, PITR, chaos testing. Real work, but none of it blocks anything
else, which is why it is last.

---

## Sequencing summary

| Phase | Theme | Items | Why here |
|---|---|---:|---|
| ~~1~~ | ~~Wire the existing kernel~~ | ~40 | **Re-cost it.** 200 of 209 modules take their safety facts as boolean inputs; each needs an establishing layer built first |
| 2 | Close the coding loop | ~23 | Agent can code but cannot deliver |
| 3 | Retrieval + Excel | ~34 | Highest user-visible value per unit of work |
| 4 | Governance and identity | ~39 | Unblocks all of §16 |
| 5 | Observability | ~13 | Needed before any of this is operable at scale |
| 6 | Browser | ~25 | Largest gap; partly unprovable in this environment |
| 7 | Platform and distribution | ~32 | Blocks nothing |

Phase 1 is struck from the top of that order rather than deleted: its items
are still worth doing, but each needs costing as "build the measurement, then
apply the checklist" rather than "add a call site". Start at Phase 2.

That is ~206 of the ~334. The remainder is long-tail polish spread across
categories — worth doing, not worth sequencing.

---

## The rule this list is scored by

Unchanged from the audit, and it is what keeps the numbers honest:

> A capability counts as built when a request can reach it and a test fails if
> it stops working. Logic that exists, is tested, and cannot be called is
> **designed**, not built.

By that rule, 28,541 lines of this repository are designed. The uncomfortable
follow-on, found by measuring rather than assuming: most of it cannot be
converted to *built* by connecting it, because it asks to be told the things
that would need to be discovered. The conversion work is writing the
discovering part — and the checklist it already provides is then genuinely
useful, which is why none of this argues for deleting any of it.
