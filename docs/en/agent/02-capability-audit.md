# Capability audit: the 500-feature list

This audits a 500-item feature list against what is actually in this
repository, so the roadmap starts from evidence instead of optimism.

Every "already have it" claim below points at a file you can open. Every "not
there" is stated plainly, because a list this large is only useful if it is
honest about the gaps.

---

## The one thing to read first

There are **two different systems** in this repo, and the difference decides
what any of these 500 features actually costs to build.

**1. The gateway (`server/`) — a real, working product.**
300 test files, 3,782 tests. It talks to 20 provider families, fails over
between them, normalises their wire formats, tracks cost and quota, and serves
an OpenAI-compatible API. When this document says a feature exists, it almost
always lives here.

**2. The agent kernel (`agent/`) — 225 modules, of which 12 are connected.**

This is the part to be careful about. The kernel's module names read exactly
like the feature list you supplied — `workflow-automation.ts`,
`browser-signal-runtime.ts`, `multi-agent` orchestration, `evaluation-*`,
`marketplace`, `data-residency`, and so on. It is tempting to conclude the
platform already does these things.

It does not. Three measurements:

| Measure | Value |
|---|---|
| Modules in `agent/src/core/` | 225 |
| Modules the running server imports | **12** |
| Modules that perform any I/O (network, disk, subprocess) | 27 |

The other 213 are **pure decision logic that no user can reach**. They are
well-tested (611 tests) and genuinely useful as rule engines, but they take a
JSON object and return a verdict. `workflow-automation.ts` opens with the line
*"It never executes tools or external triggers."* That is representative.

So for most items below, the honest status is not "missing" and not "done" but
**"the rules exist, the machinery does not."** Those are the cheapest features
on the list — the thinking is done and what is missing is wiring.

---

## Scoring

| Mark | Meaning |
|---|---|
| **Built** | Works in production today, with tests. Evidence given. |
| **Partial** | Real but narrower than the item implies. The gap is stated. |
| **Rules only** | Kernel logic exists and is tested, but nothing reaches it. |
| **Absent** | Not in the repo. |

---

## 1. Model gateway and API (items 1–15)

The strongest area in the repo. This is essentially what the gateway *is*.

| # | Feature | Status | Evidence |
|---|---|---|---|
| 1 | OpenAI-compatible API | **Built** | `routes/proxy.ts`, `providers/openai-compat.ts` |
| 2 | Unified Chat / Completion / Response | **Built** | `routes/proxy.ts`, `routes/responses.ts` |
| 3 | SSE streaming | **Built** | `text/event-stream` in proxy, anthropic, gemini routes |
| 4 | WebSocket | **Absent** | no `ws` dependency anywhere |
| 5 | Cross-provider format translation | **Built** | `anthropic-map.ts`, `gemini-map.ts`, `gemini-wire.ts` |
| 6 | Smart routing | **Built** | `services/router.ts`, `services/scoring.ts` |
| 7 | Automatic fallback | **Built** | `lib/fallback-loop.ts` |
| 8 | Load balancing | **Built** | weighted scoring in `services/scoring.ts` |
| 9 | Model capability registry | **Built** | `models` table, `lib/tool-capability.ts` |
| 10 | Task-type-aware selection | **Built** | `lib/task-type.ts` — biases weights, keeps gates intact |
| 11 | Budget-aware selection | **Partial** | `lib/budget.ts` tracks spend; not a routing input |
| 12 | Latency-aware selection | **Built** | latency percentiles feed the router |
| 13 | JSON normalisation | **Built** | `lib/structured-output.ts` |
| 14 | Structured output | **Built** | same — validates, heals fenced JSON, fails over |
| 15 | Full request replay | **Partial** | `request_attempts` records attempts; no re-execution |

Item 13/14 deserves a note, because it is better than the list implies. The
gateway does not merely forward `response_format`. It checks the response,
repairs JSON wrapped in markdown fences, and **fails over to another model** if
the answer came back as prose. The comment in that file names the reason: a
model that ignores JSON mode produces a request that *looks* successful, which
is the worst failure mode.

**Verdict:** 12 of 15 built. The real gaps are WebSocket (4) and true replay (15).

---

## 2. Provider and model management (items 16–35)

| # | Feature | Status | Evidence |
|---|---|---|---|
| 16 | Encrypted key storage | **Built** | `lib/crypto.ts`, `provider-credential.ts` |
| 17 | OAuth | **Absent** | no OAuth in `server/` |
| 18 | Managed identity | **Absent** | — |
| 19 | Per-org keys | **Absent** | no org model — see §12 |
| 20 | Provider health checks | **Built** | `services/health.ts`, background checker |
| 21 | Price/speed/quality scoring | **Built** | `services/scoring.ts` |
| 22 | Per-request cost | **Built** | `db/model-pricing.ts`, `requests` table |
| 23 | Geographic routing | **Absent** | — |
| 24 | Privacy-policy routing | **Rules only** | `agent/core/policy-engine.ts` decides; gateway ignores it |
| 25 | Rate-limit detection | **Built** | `services/ratelimit.ts`, `provider-quota.ts`, cooldowns |
| 26 | Custom endpoints | **Built** | `services/custom-endpoint.ts` — multi-key pooling |
| 27–29 | Local / Ollama / vLLM | **Partial** | `routes/ollama.ts` is **inbound emulation** — it lets Ollama *clients* call this gateway. Any OpenAI-compatible local server (vLLM, LM Studio) works as a custom endpoint. There is no outbound native Ollama driver. |
| 30 | Version pinning | **Partial** | `model_overrides`, tombstones |
| 31 | Model aliases | **Built** | `services/model-groups.ts`, `fusion.ts` |
| 32 | Provider contract tests | **Built** | per-provider test suites |
| 33 | Model discovery | **Built** | `services/model-discovery.ts`, `catalog-sync.ts` |
| 34 | Allowed-model limits | **Built** | `lib/model-scope.ts`, `endpoint-scope.ts` |
| 35 | Model comparison | **Built** | `AnalyticsPage.tsx`, benchmark runner |

Items 27–29 are the ones most likely to be misread. Local models *work*, via
the custom-endpoint path. What is missing is a native Ollama client, and
`routes/ollama.ts` is the opposite direction from what the list means.

**Verdict:** 13 built, 4 partial, 3 absent. The cluster worth attention is
19 + 17 — no organisations and no SSO, which §12 depends on entirely.

---

## 3–7. Agent runtime, tools, memory, RAG, workflows (items 36–165)

This is where the two-systems problem dominates. Summary rather than 130 rows:

| Area | Status | Reality |
|---|---|---|
| Agent runtime (36–60) | **Partial — ~16 of 25** | A full loop plus an autonomous driver. `services/agent-runtime.ts` (`agent_runs`) gives durable state-machine execution (42), step/token/cost/time ceilings (46–49), manual stop and safe cancel (50–51), crash resume (52), per-step checkpoints (53), human-approval gates (56), deterministic replay (54) and structured stop reasons (59). `services/agent-driver.ts` adds the planner/executor pair (39–40): it picks the phase, asks a model through this gateway's own pool (`agent-completion.ts`), and maps the reply to one legal event — a constrained observe/decide/act cycle with real tool use (41) via `agent-evidence.ts`, and outcomes fed back into project memory (58). Still missing: graph execution (43) and parallel sub-agents (44–45). |
| Tools (61–85) | **Partial — ~8 of 25** | `services/agent-tools.ts` is a real registry: registration with JSON-Schema validation (61–62), invocation with policy enforcement and human approval (63, 69), per-call timeouts (66), a redacted audit trail of every attempt (67, 70) and a catalogue shaped for tool-calling models (64). Built-ins cover filesystem read/list/search/write, a no-shell test runner and git status/diff/branch/patch/commit (68), confined to a workspace root that callers cannot choose; writes resolve their own target ref so the protected-branch guard cannot be evaded by omission. Still missing: a third-party tool SDK and marketplace (71–75), MCP-style dynamic discovery (76–78), parallel/scheduled tool execution (79–81) and retries with compensation (82–85). |
| Memory (86–110) | **Partial — 8 of 25** | Delivered last turn: project memory, provenance (96), expiry (94), user deletion (95), tags (106), PII/secret refusal (109), retention (110), tenant isolation. Missing: semantic search (101 — search is lexical), conversation summarisation (92), contradiction detection (97–98), encryption at rest (105), episodic/semantic split (88–89). |
| RAG (111–140) | **Partial** | `services/rag-store.ts` + `rag-chunker.ts` + migration `…_000006`. Ingest → boundary-aware chunking → embed → store → cosine search → **citations with character offsets** (130), re-checkable via `GET /documents/citations/:chunkId`. Still absent: document parsers (PDF, DOCX), connectors, reranking, hybrid keyword search, and an ANN index — retrieval is an exact brute-force scan. |
| Workflows (141–165) | **Rules only** | `task-dag.ts` validates graphs and plans parallel waves (142, 146, 147 as *logic*). `workflow-automation.ts` explicitly executes nothing. No builder, no triggers, no versioning. |

**Verdict:** roughly 22 of 130 usable, up from 10 — the execution loop landed.
This is still the bulk of the list and the bulk of the work.

---

## 8–10. Coding, browser, business data (items 166–245)

| Area | Status | Reality |
|---|---|---|
| Coding (166–195) | **Partial** | Navigation is real: `services/code-index.ts` maps declarations and `code.symbol.search` / `code.outline.read` / `code.file.outline.read` are offered to every read-only phase. Patch application and commits exist via `agent-tools-git.ts`. Still absent: PR creation, a real execution sandbox, refactoring across files. `repository-context-runtime.ts` and `repository-intelligence-runtime.ts` remain unreachable pure logic. |
| Browser (196–220) | **Partial — 2 of 25** | `web.page.read` and `web.page.search` fetch a page and return its text, behind the DNS-resolving SSRF guard in `lib/url-guard.ts`, re-checked on every redirect hop. No JavaScript is executed, so items needing a rendered DOM (clicking, forms, screenshots) remain absent, as does Playwright/Puppeteer. `browser-signal-runtime.ts` still processes *hypothetical* signals. |
| Business data (221–245) | **Partial** | `services/tabular-query.ts` loads a CSV into a private in-memory SQLite database and answers read-only SQL against it (`data.csv.query`, `data.csv.schema.read`). No Excel parser, and no CRM/email/calendar connectors. |

**Verdict:** ~11 of 80.

A note on item 189 (secret scanning), which the previous pass scored as the
one built capability here. `redaction.ts` was real but only half-connected:
it scrubbed tool *output* for recognisable patterns, while `fs.read_file`
would happily open `.env` and hand over its contents. Pattern redaction
cannot help there — a `.env` holds arbitrary values, and `INTERNAL_TOKEN=
plain_words` matches nothing. `isSensitivePath` existed, was tested, and had
no callers. It now guards the read tools, so the filename rule and the
content rule are both connected.

---

## 11. Security and safety (items 246–270)

Disproportionately strong, because the gateway had to solve these for itself.

| # | Feature | Status | Evidence |
|---|---|---|---|
| 246–247 | Prompt injection | **Partial** | `lib/guardrails.ts` — pattern-based, not a classifier |
| 249 | Tool-call policy engine | **Built** | `policy-engine.ts`, enforced on every call by `agent-tools.ts`; authority fields (protected branches, approver, granted scopes) are server- and session-owned via `agent-policy-context.ts`, so a request cannot widen its own verdict — it may only narrow it |
| 250–252 | URL allow/blocklist, SSRF | **Built** | `lib/url-guard.ts` |
| 254–257 | PII and secret handling | **Built** | `redaction.ts`, `log-redaction.ts`, `error-redaction.ts` |
| 260 | Output schema checks | **Built** | `structured-output.ts`, `output-contract.ts` |
| 261 | Egress control | **Partial** | `lib/url-guard.ts` now enforces on the agent's own outbound path (`services/web-fetch.ts`): DNS resolved, address classified, re-checked per redirect. `egress-policy-runtime.ts` remains a *validator* — it takes `dnsPinned`/`tlsVerified`/`dlpPassed` as booleans from its caller and returns `allowed: true` for the AWS metadata endpoint if asked nicely, so it cannot be the enforcement point |
| 262 | Tenant isolation | **Built** (agent surface) | `services/agent-tenancy.ts` — every scoped read and write resolves membership from the database; a body naming another tenant gets 404, not its data. Still agent-only: the gateway's own tables have no tenancy |
| 263 | Global kill switch | **Partial** | `maintenance` setting |
| 267 | Security decision log | **Built** | `server_logs`, `attempt-trace.ts` |
| 248, 253, 258–259, 264–266, 268–270 | | **Absent** | |

**Verdict:** 9 built, 5 partial/rules, 11 absent. Redaction (254–257) is
genuinely production-grade and defended by tests that build secret fixtures at
runtime specifically so GitHub's scanner will not block commits.

---

## 12. Identity and governance (items 271–295)

The weakest area relative to its importance.

The `users` table is still `id`, `email`, `password_hash`, `created_at` — no
role column lives there. Sessions are bearer tokens in a `sessions` table.

What changed: `organizations`, `projects` and `organization_members` now exist
(migration `20260921_000004`), and the agent surface enforces them. Roles are
the kernel's own six (`owner`, `admin`, `developer`, `reviewer`, `viewer`,
`agent`), deliberately reusing the vocabulary that
`agent/src/core/identity-access-contract.ts` already decides invites and role
changes against.

| Item | Status | Evidence |
|---|---|---|
| 277 Teams/groups | **Partial** | `organization_members` — membership and roles, no nested groups |
| 278 Organisations | **Built** | `organizations`, owner assigned transactionally |
| 279 Projects | **Built** | `projects`, ids unique per organisation |
| 275–276 RBAC/ABAC | **Partial** | role ranking gates read/write/administer on the agent surface only |
| 280 Service accounts | **Partial** | the `agent` role is one in all but name: it writes, but cannot administer |
| 294 Invitations | **Built** | `services/agent-invites.ts` — single-use hashed tokens, bound to one address, expiring |
| 271–274 | **Absent** | SSO, OIDC, MFA, passkeys |

**Scope of the enforcement, stated plainly:** it covers `/api/agent/*`. The
gateway's keys, models and logs remain single-tenant.

`decideMembershipInvite` and `decideRoleChange` are now reachable — the invite
routes call them rather than restating their rules, so the refusal messages
users see (*"only owner may grant elevated organization roles"*) come from the
kernel itself. Two things about that are worth stating plainly:

- **MFA is substituted, not implemented.** The kernel marks owner and admin
  grants `requiresMfa`. There is no MFA here, so those grants require
  re-entering the password (`x-reauth-password`, the same mechanism the key
  export already uses). That is weaker than MFA and is not a replacement for
  it.
- **One kernel rule made a guard of mine dead code.** A last-owner check in
  `changeRole` turned out to be unreachable: `decideRoleChange` only permits
  demoting an owner when the actor is another owner, so a second owner exists
  by construction. It was deleted rather than left in as a decorative safety
  net. The equivalent check in `removeMember` *is* load-bearing — deletion has
  no such kernel rule — and a test fails if it is removed.

**Built:** 281 (scoped API keys, `key_model_scope`), 282–283 partially
(`key_monthly_usage`, `key-budget.ts`), 291 (admin dashboard), 292 partially
(`server_logs` — appended, not tamper-evident).

**Verdict:** ~10 of 25, up from ~4.

---

## 13–14. Observability and cost (items 296–345)

| # | Feature | Status | Evidence |
|---|---|---|---|
| 296–300 | Traces, timeline, tokens, latency | **Built** | `attempt-trace.ts`, `request_attempts`, percentile indexes |
| 302 | Tool traces | **Built** | `agent_tool_calls` — every attempt, refusals included, linked to its run |
| 303 | Cost dashboard | **Built** | `AnalyticsPage.tsx` |
| 304 | Error classification | **Built** | `lib/error-classify.ts` |
| 305–307 | Alerts | **Absent** | metrics exist; no alerting |
| 308 | OpenTelemetry | **Absent** | — |
| 309–320 | Replay, golden sets, judges, evals | **Rules only** | `evaluation*.ts`, `benchmark-runner.ts` unreachable |
| 321 | Semantic cache | **Built** (opt-in) | `services/semantic-cache.ts` — a reworded prompt hits an existing entry. Off by default; similarity is only compared within an identical `variantKey`, so settings can never vary |
| 322–325 | Prefix cache, compression | **Partial** | `services/compression/` exists |
| 329–332 | Batch, concurrency, priority, backpressure | **Built** | delivered last turn in `agent-jobs.ts` |
| 333 | Autoscaling | **Absent** | queue supports multiple workers; no scaler |
| 336–337 | Tool/embedding cache | **Partial** | response cache only |
| 338–344 | Cost forecasting and budgets | **Built** | `quota-forecast.ts`, `quota-outlook.ts`, `key-budget.ts` |
| 345 | ROI per agent | **Absent** | — |

Item 321 now does what the name says, but the interesting part is what it
refuses. The request is split into prompt text (where rewording is meaningful)
and a `variantKey` covering everything else — model, temperature, tools,
`response_format`, seed. Similarity is only ever compared inside one variant,
so a JSON-mode request cannot be served a plain-text answer however close the
wording. A match resolves to an existing exact key and is read back through the
normal path, so TTL, LRU and hit counting are unchanged.

It is **off by default**: an exact cache can only return the answer to the
question asked, an approximate one can return the answer to a *similar*
question, and that is a different correctness guarantee for an operator to
accept knowingly.

**Verdict:** ~19 of 50.

---

## 15–20. UX, collaboration, multimodal, deployment, resilience, advanced (items 346–500)

| Area | Status | Notes |
|---|---|---|
| UX (346–370) | **~13 of 25** | Dashboard, playground, 60-locale i18n with full RTL, dark mode, cost display, run filtering. Missing: live token/tool streaming UI, conversation branching, workflow canvas, WCAG audit. |
| Collaboration (371–395) | **~1 of 25** | No teams, so essentially nothing. Blocked on §12. |
| Multimodal (396–420) | **~9 of 25** | Genuinely strong: image generation, TTS, STT, video, OCR-capable models across the provider set (`routes/media.ts`, `AudioPage`, `ImagePage`, `VideoPage`). Missing: the creative agents (413–420), diagram generation, multimodal memory. |
| Deployment (421–445) | **~6 of 25** | MCP client and server (422–423) are **built** — `routes/mcp.ts`. Docker, CLI, TypeScript SDK exist. Missing: Helm, K8s operator, Terraform, Python/Go SDKs, plugin signing. |
| Resilience (446–470) | **~12 of 25** | Best-covered advanced area. Durable queue, permanent checkpoints, crash-resumable execution, idempotency, DLQ, circuit breaker, smart retry, graceful degradation, model fallback, backups, health status, maintenance mode — all real. Missing: multi-region, PITR, chaos testing, runbooks. |
| Advanced (471–500) | **Rules only** | `consensus.ts`, `model-consensus-runtime.ts`, `canary-trials.ts` (A/B), `human-feedback-runtime.ts` all exist as unreachable logic. Nothing runs. |

---

## Totals

| Category | Built or partial | Of |
|---|---|---|
| 1. Gateway/API | 14 | 15 |
| 2. Providers | 17 | 20 |
| 3–7. Agent, tools, memory, RAG, workflow | ~44 | 130 |
| 8–10. Coding, browser, data | ~11 | 80 |
| 11. Security | 16 | 25 |
| 12. Identity | ~10 | 25 |
| 13–14. Observability, cost | ~20 | 50 |
| 15–20. UX → advanced | ~41 | 155 |
| **Total** | **~173** | **500** |

> **A caution about the "rules only" rows below.** 200 of the 209 unwired
> kernel modules declare their safety properties as `boolean` *inputs*
> (`sandboxed`, `signed`, `dnsPinned`). They are contract checkers: run
> `decideM196Execution` with `sandboxed: true` on an unsandboxed plugin and it
> returns `allowed: true`. Scoring one as "rules only, just needs wiring"
> overstates how close it is — something has to establish the facts first. See
> [`04-remaining-roadmap.md`](./04-remaining-roadmap.md) §Phase 1.

> **Sequencing for the remaining ~330 lives in
> [`04-remaining-roadmap.md`](./04-remaining-roadmap.md)**, which also reports a
> measurement this table does not: of the 225 files in `agent/src/core`, only
> **16 are imported by anything in production**. The other 209 — 28,541 lines —
> are tested and unreachable. Much of the "remaining" work is therefore wiring
> rather than design.

**Roughly a quarter is real.** The quarter that is real is the hard,
unglamorous quarter: multi-provider routing, failover, cost accounting,
redaction, durability. Those are the parts that are painful to retrofit.

---

## What to build, in order

Sequenced by *what unblocks the most*, not by list order. Item 2 is done; the
rest stand.

**1. Organisations, projects and RBAC** (items 275–279, unblocks 19, 262, §16)
— **done for the agent surface**
Membership decides scope (`services/agent-tenancy.ts`), and organisations can
now grow: `services/agent-invites.ts` issues single-use invites, and
`POST /api/auth/accept-invite` is the only way a second account can exist on an
install. What remains is a user-management UI, real MFA, and extending tenancy
to the gateway's own tables — that last one is the larger half.

**2. An agent execution loop** (items 39–44, 52–53) — **done**
Delivered in `services/agent-runtime.ts`, with autonomy in
`services/agent-driver.ts`. Runs are durable, budgeted, human-gated,
cancellable and crash-resumable over a hash-chained history, and `advance`
drives them through the gateway's own model pool without ever letting a model
name a state or choose an event. What remains under this heading is not the
loop but its *hands*: phases decide, they do not yet read a repo, run tests or
write a patch. That is now the same problem as (5).

**3. RAG with citations** (items 127–130, 111, 119, 123) — **done for text**
`services/rag-store.ts` stores what `runEmbeddings()` could always produce but
nothing kept. A document is chunked at paragraph and sentence boundaries,
embedded, and searched by cosine similarity; every hit carries the document,
the character offsets, and the quoted text, so a citation can be re-read from
source rather than trusted. The kernel's `packContext` does the budget fitting,
which also means `secret_like` items are dropped without reimplementing that
rule.

Three limits worth stating: input must already be text (no PDF or DOCX
parser), search is an exact brute-force scan rather than an ANN index (no
sqlite-vss in the lockfile — fine at these corpus sizes, not at millions of
chunks), and there is no reranker or keyword/hybrid stage, so recall depends
entirely on the embedding model.

**4. Semantic cache upgrade** (item 321) — **done, opt-in**
`services/semantic-cache.ts`. The threshold defaults to 0.95 and a match must
also beat the runner-up by a margin, because two prompts that are both ~0.9
similar to a query are usually sibling questions rather than rewordings —
which is exactly when a wrong cached answer looks plausible. Enable with
`SEMANTIC_CACHE=true`.

**5. Code navigation** (items 166–170) — **done**
`services/code-index.ts` plus three read-only tools. A run can now ask "where
is `resolveScope` defined" and get `file:line` with the signature, instead of
grepping a name, getting its call sites, and reading whole files to find the
declaration. The index is built on demand and thrown away: an index is a cache
of the working tree, and a stale one sends the agent to a line that has moved.

It is a hand-written scanner, not the TypeScript compiler, because
`typescript` is a devDependency — importing it at runtime would break
`npm ci --omit=dev`. Measured against `ts.createSourceFile` as an oracle it
found 6,281 of 6,281 top-level declarations across this repository's server,
agent and client trees, and invents nothing on commented-out code, call sites
or strings. What it cannot do is semantic: no re-export resolution, no type
following, no dynamically built names.

**6. Tabular data** (items 221–226) — **done for CSV**
`services/tabular-query.ts`. A model asked for a total used to have one
option: read the whole file into the prompt and add the numbers up — which
does not fit and is the least reliable arithmetic available. SQLite is exact
and free.

The isolation is the design. A CSV is loaded into a *separate* in-memory
database, so a query cannot name `api_keys` no matter how it is written —
verified live, the error is `no such table`. Writes are stopped by
`PRAGMA query_only` in the engine, not by a regex; `statement.readonly` is
consulted first only to give a clear message. Stacked statements need no
guard because `prepare()` rejects a string with more than one statement.

One trap found by probing rather than reading: `ATTACH DATABASE '/any/file'`
reports `readonly === true` and is permitted under `query_only`. It is a
file-read primitive wearing a SELECT's clothes, and it is refused by name.

**7. Tool registry and SDK** (items 61–67) — **done**
Delivered in `services/agent-tools.ts`, joined to the driver by
`services/agent-evidence.ts`, and extended to git in
`services/agent-tools-git.ts`. A phase inspects the workspace with read-only
tools before deciding; a supervised, scoped call can branch, patch and commit.
What remains is pushing and opening a pull request, a container sandbox for
untrusted code, and the product decision of whether an approved phase may
execute a write step unattended.

Deliberately deferred: browser automation (§9) and business connectors (§10)
are large from-scratch subsystems with no foundation here, and they do not
unblock anything else.

---

## How to keep this honest

Two rules, learned from the `agent/` workspace:

1. **Count reachability, not modules.** 225 modules and 12 connected is the
   number that matters. A feature nobody can invoke is not a feature.
2. **A design document is not a status.** The kernel's own registry marks
   phases M9–M208 `designed_only`, which is admirable — but the module names
   still read like finished work. Prefer "the rules exist, the machinery does
   not" over both "done" and "missing".
3. **Add up the table.** The §8–10 row read `~4` while the section below it
   read `~1`, so the grand total was three higher than the parts for at least
   one revision. A number in a summary that nobody re-derives will drift.
4. **"Exists" is not "connected".** `isSensitivePath` had a test and no
   callers; `redaction.ts` was scored as built on that basis. Before scoring
   a capability, grep for who *calls* it.

See [`01-agent-kernel.md`](./01-agent-kernel.md) for what the kernel decides
today, and [`agent/USAGE.md`](../../../agent/USAGE.md) for how to drive it.
