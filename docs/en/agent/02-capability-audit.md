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
283 test files, 3,396 tests. It talks to 20 provider families, fails over
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
| Agent runtime (36–60) | **Partial — ~12 of 25** | An execution loop now exists (`services/agent-runtime.ts`, `agent_runs`): durable runs with state-machine execution (42), step/token/cost/time ceilings (46–49), manual stop and safe cancel (50–51), resume after crash (52), per-step checkpoints (53), human-approval gates (56), deterministic replay of history (54) and structured stop reasons (59). Still missing: an autonomous planner/executor pair (39–40), ReAct (41), graph execution (43) and parallel sub-agents (44–45) — the loop advances on reported outcomes, it does not yet call models itself. |
| Tools (61–85) | **Rules only** | `policy-engine.ts` decides whether a call is allowed and whether it needs approval; `tool-validate.ts` and `tool-args.ts` validate schemas in the gateway. No registry, no SDK, no marketplace, no scheduling. |
| Memory (86–110) | **Partial — 8 of 25** | Delivered last turn: project memory, provenance (96), expiry (94), user deletion (95), tags (106), PII/secret refusal (109), retention (110), tenant isolation. Missing: semantic search (101 — search is lexical), conversation summarisation (92), contradiction detection (97–98), encryption at rest (105), episodic/semantic split (88–89). |
| RAG (111–140) | **Absent, with one foundation** | `services/embeddings.ts` and an `embedding_models` table exist and work. There is no vector store, no chunker, no document parser, no connector, no reranker, no citations. Item 130 (citations) is the one that matters most and is entirely missing. |
| Workflows (141–165) | **Rules only** | `task-dag.ts` validates graphs and plans parallel waves (142, 146, 147 as *logic*). `workflow-automation.ts` explicitly executes nothing. No builder, no triggers, no versioning. |

**Verdict:** roughly 22 of 130 usable, up from 10 — the execution loop landed.
This is still the bulk of the list and the bulk of the work.

---

## 8–10. Coding, browser, business data (items 166–245)

| Area | Status | Reality |
|---|---|---|
| Coding (166–195) | **Rules only / Absent** | `repository-context-runtime.ts` and `repository-intelligence-runtime.ts` are unreachable pure logic. No repo indexing, no patch generation, no PR creation, no sandbox. Item 189 (secret scanning) is the exception — `redaction.ts` is real and used. |
| Browser (196–220) | **Absent** | No Playwright, no Puppeteer, no browser dependency of any kind. `browser-signal-runtime.ts` processes *hypothetical* browser signals. This is a from-scratch subsystem. |
| Business data (221–245) | **Absent** | No SQL agent, no CSV/Excel analysis, no CRM/email/calendar connectors. |

**Verdict:** ~1 of 80.

---

## 11. Security and safety (items 246–270)

Disproportionately strong, because the gateway had to solve these for itself.

| # | Feature | Status | Evidence |
|---|---|---|---|
| 246–247 | Prompt injection | **Partial** | `lib/guardrails.ts` — pattern-based, not a classifier |
| 249 | Tool-call policy engine | **Rules only** | `policy-engine.ts` — tested, unreachable |
| 250–252 | URL allow/blocklist, SSRF | **Built** | `lib/url-guard.ts` |
| 254–257 | PII and secret handling | **Built** | `redaction.ts`, `log-redaction.ts`, `error-redaction.ts` |
| 260 | Output schema checks | **Built** | `structured-output.ts`, `output-contract.ts` |
| 261 | Egress control | **Rules only** | `egress-policy-runtime.ts` |
| 262 | Tenant isolation | **Partial** | enforced in agent memory/jobs; no platform-wide tenancy |
| 263 | Global kill switch | **Partial** | `maintenance` setting |
| 267 | Security decision log | **Built** | `server_logs`, `attempt-trace.ts` |
| 248, 253, 258–259, 264–266, 268–270 | | **Absent** | |

**Verdict:** 8 built, 6 partial/rules, 11 absent. Redaction (254–257) is
genuinely production-grade and defended by tests that build secret fixtures at
runtime specifically so GitHub's scanner will not block commits.

---

## 12. Identity and governance (items 271–295)

The weakest area relative to its importance.

The `users` table is: `id`, `email`, `password_hash`, `created_at`. That is the
whole identity model. **There is no role column, no teams, no organisations,
no projects.** Sessions are bearer tokens in a `sessions` table.

So: 271–280 (SSO, OIDC, MFA, passkeys, RBAC, ABAC, teams, orgs, projects,
service accounts) are all **absent**, and they block each other — RBAC without
orgs is meaningless.

**Built:** 281 (scoped API keys, `key_model_scope`), 282–283 partially
(`key_monthly_usage`, `key-budget.ts`), 291 (admin dashboard), 292 partially
(`server_logs` — appended, not tamper-evident).

**Verdict:** ~4 of 25. Recommend treating orgs/RBAC as one foundational
project, because §2 item 19, §11 item 262 and most of §16 all wait on it.

---

## 13–14. Observability and cost (items 296–345)

| # | Feature | Status | Evidence |
|---|---|---|---|
| 296–300 | Traces, timeline, tokens, latency | **Built** | `attempt-trace.ts`, `request_attempts`, percentile indexes |
| 302 | Tool traces | **Absent** | no tools to trace |
| 303 | Cost dashboard | **Built** | `AnalyticsPage.tsx` |
| 304 | Error classification | **Built** | `lib/error-classify.ts` |
| 305–307 | Alerts | **Absent** | metrics exist; no alerting |
| 308 | OpenTelemetry | **Absent** | — |
| 309–320 | Replay, golden sets, judges, evals | **Rules only** | `evaluation*.ts`, `benchmark-runner.ts` unreachable |
| 321 | Semantic cache | **Partial** | `services/cache.ts` is **exact-match** (canonical hash), not semantic |
| 322–325 | Prefix cache, compression | **Partial** | `services/compression/` exists |
| 329–332 | Batch, concurrency, priority, backpressure | **Built** | delivered last turn in `agent-jobs.ts` |
| 333 | Autoscaling | **Absent** | queue supports multiple workers; no scaler |
| 336–337 | Tool/embedding cache | **Partial** | response cache only |
| 338–344 | Cost forecasting and budgets | **Built** | `quota-forecast.ts`, `quota-outlook.ts`, `key-budget.ts` |
| 345 | ROI per agent | **Absent** | — |

Item 321 is worth flagging: the cache is real and useful, but "semantic cache"
means *similar* prompts hit. This one matches only byte-identical canonicalised
requests. Upgrading it is a genuine improvement with a clear path — embeddings
already exist.

**Verdict:** ~18 of 50.

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
| 3–7. Agent, tools, memory, RAG, workflow | ~22 | 130 |
| 8–10. Coding, browser, data | ~1 | 80 |
| 11. Security | 14 | 25 |
| 12. Identity | ~4 | 25 |
| 13–14. Observability, cost | ~18 | 50 |
| 15–20. UX → advanced | ~41 | 155 |
| **Total** | **~131** | **500** |

**Roughly a quarter is real.** The quarter that is real is the hard,
unglamorous quarter: multi-provider routing, failover, cost accounting,
redaction, durability. Those are the parts that are painful to retrofit.

---

## What to build, in order

Sequenced by *what unblocks the most*, not by list order. Item 2 is done; the
rest stand.

**1. Organisations, projects and RBAC** (items 275–279, unblocks 19, 262, §16)
Nothing else in governance or collaboration can start until `users` has more
than four columns. This is the single highest-leverage change in the list, and
it gets harder every month.

**2. An agent execution loop** (items 39–44, 52–53) — **done**
Delivered in `services/agent-runtime.ts`. Runs are durable, budgeted,
human-gated, cancellable and crash-resumable over a hash-chained history. What
remains of this item is autonomy: a planner/executor pair that calls models and
feeds outcomes back into the loop. The loop was built to accept exactly that
without changing its contract.

**3. RAG with citations** (items 127–130, 111, 119, 123)
Vector store + chunker + PDF parser + citations. `embeddings.ts` and the
`embedding_models` table are already there, so this starts from a foundation
rather than zero. Item 130 (accurate citations) is what makes the rest
trustworthy.

**4. Semantic cache upgrade** (item 321)
Small, self-contained, immediate cost saving. Embeddings exist; the cache
exists; connect them with a similarity threshold.

**5. Tool registry and SDK** (items 61–67)
Depends on (2). Without an execution loop a tool registry has no caller.

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

See [`01-agent-kernel.md`](./01-agent-kernel.md) for what the kernel decides
today, and [`agent/USAGE.md`](../../../agent/USAGE.md) for how to drive it.
