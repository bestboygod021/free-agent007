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
| 6 | RAG | ~6/30 | **24** | Document parsers, ANN index, reranking, hybrid search, connectors |
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

**~40 items. Highest value per unit of work in the entire list**, because the
logic is written and tested; only the call site is missing.

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

**A correction to this phase's premise, found by attempting it.** I listed
`egress-policy-runtime` as a wiring job. It is not, and the reason generalises
to much of the 209. That module is a *validator*: `decideM190Egress` accepts
`dnsPinned`, `tlsVerified` and `dlpPassed` as booleans **from its caller**.
Handed a request for `http://169.254.169.254/latest/meta-data/` with every flag
asserted true, it returns `allowed: true`. I ran that before writing any code.

So "wire up the egress module" would have produced a guard that enforces
nothing. What actually shipped for item 261 was `services/web-fetch.ts`, which
*establishes* the facts — resolves DNS, classifies the address — using the
existing `lib/url-guard.ts`, and is checked on every redirect hop.

The general lesson for the rest of Phase 1: **a kernel module that takes its
safety properties as parameters cannot be the enforcement point.** Before
scheduling one as "wiring", check whether it decides anything or merely
validates what it is told. The ones that decide (`policy-engine`,
`state-machine`, `identity-access-contract`) are already wired — which is
probably not a coincidence.

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

**~23 items (166–195).** The agent can read a repo, search symbols, apply a
patch and commit. It cannot propose the result to a human.

1. **PR creation** — the one genuinely small item. Note the constraint that
   makes it interesting: `agent-tools-git.ts` deliberately runs git with
   `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=''` and `GIT_CONFIG_NOSYSTEM=1`,
   specifically so *an agent can never authenticate as the human who installed
   the gateway*. Opening a PR requires a forge credential, which is in direct
   tension with that rule. The design has to introduce a **separate, scoped,
   server-configured forge token** — the same shape as the worker credential
   added this week — rather than reusing the operator's git config. Doing it
   the easy way would silently undo a deliberate safety property.
2. **Execution sandbox** — `sandbox.test` runs a test command; there is no
   isolation boundary. No docker/podman/bwrap in this environment, so this
   needs a real design decision, not just a library.
3. **Cross-file refactoring** — depends on `code-index.ts` gaining a reference
   graph, not just declarations.

---

## Phase 3 — Retrieval that survives real documents

**~24 items (111–140).** `rag-store.ts` works, with three stated limits:
text-only input, brute-force cosine scan, no reranking.

1. **Document parsers** — PDF and DOCX. No parser dependency is present.
   Highest user-visible value in this phase.
2. **ANN index** — the current scan is O(n) per query; fine at demo scale,
   not at corpus scale.
3. **Hybrid keyword + vector search, then reranking.**

Related and cheap: **Excel** (items 221–230). `tabular-query.ts` already
isolates CSV into a private in-memory SQLite database; `.xlsx` is a zip of XML
and reuses that entire sandbox once parsed.

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
| 1 | Wire the existing kernel | ~40 | Logic already written and tested; cheapest real capability |
| 2 | Close the coding loop | ~23 | Agent can code but cannot deliver |
| 3 | Retrieval + Excel | ~34 | Highest user-visible value per unit of work |
| 4 | Governance and identity | ~39 | Unblocks all of §16 |
| 5 | Observability | ~13 | Needed before any of this is operable at scale |
| 6 | Browser | ~25 | Largest gap; partly unprovable in this environment |
| 7 | Platform and distribution | ~32 | Blocks nothing |

That is ~206 of the ~334. The remainder is long-tail polish spread across
categories — worth doing, not worth sequencing.

---

## The rule this list is scored by

Unchanged from the audit, and it is what keeps the numbers honest:

> A capability counts as built when a request can reach it and a test fails if
> it stops working. Logic that exists, is tested, and cannot be called is
> **designed**, not built.

By that rule, 28,541 lines of this repository are designed. Phase 1 exists to
convert as much of that as possible into built, and it is first precisely
because it is the only phase where the hard part is already done.
