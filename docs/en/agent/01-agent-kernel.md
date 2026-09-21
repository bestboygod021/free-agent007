**English**

# ForgePilot agent kernel

[← Back to README](../README.md) · [Documentation index](../README.md)

The `agent/` workspace is a deterministic decision core for agent-driven
software delivery, merged in from the ForgePilot blueprint. It is built on one
rule:

> **The language model proposes; the code decides.**

A language model is good at drafting and bad at guaranteeing. So the decisions
that must never vary — may this tool run, may this data leave the machine, is
this task actually finished — are made by tested code, not by a prompt.

- [What the kernel decides](#what-the-kernel-decides)
- [Compute modes](#compute-modes)
- [API reference](#api-reference)
- [Prompt library](#prompt-library)
- [Output contracts](#output-contracts)
- [Commands](#commands)
- [Implementation status](#implementation-status)

## What the kernel decides

| Decision | Module |
|---|---|
| Run state transitions | `agent/src/core/state-machine.ts` |
| Whether a tool call is allowed and needs approval | `agent/src/core/policy-engine.ts` |
| Which provider may run a job | `agent/src/core/model-router.ts` |
| Configuration from the free/paid/local switch | `agent/src/core/compute-mode.ts` |
| Secret scrubbing before anything leaves the process | `agent/src/core/redaction.ts` |
| Task ordering and parallelism | `agent/src/core/task-dag.ts` |
| Whether a success claim is believed | `agent/src/core/evidence.ts` |
| Model output validation | `agent/src/core/output-contract.ts` |

## Compute modes

The operator picks one mode and **everything** is configured from it: which
providers are permitted, the cost ceiling, the token budget, repair limits,
task concurrency, quality gates, and whether data may leave the machine at all.

| | Free | Paid | Local |
|---|---|---|---|
| Paid cloud | ❌ | ✅ | ❌ |
| Cost per run | 0 | up to your ceiling | 0 |
| Data leaves the machine | with consent | with consent | **never** |
| Repair attempts / parallel tasks | 2 / 2 | 3 / 4 | 3 / 1 |
| Quality gates | 6 | 9 | 8 |

Local mode is a hard wall, not a preference: cloud egress is refused even when
the user has explicitly consented to it.

## API reference

All endpoints are mounted at `/api/agent` behind the dashboard session
(`requireAuth`), exactly like the other admin surfaces. No handler here ever
calls an upstream model.

Most are pure decision endpoints: they take JSON, run a kernel, and return the
verdict together with the reason for it, touching no state at all. The two
exceptions are the durable surfaces — **memory** and **jobs** — which read and
write SQLite by design, because remembering and queueing are precisely the
things that must outlive the process.

| Method | Path | Answers |
|---|---|---|
| `GET` | `/api/agent/modes` | The three compute modes and their full profiles |
| `GET` | `/api/agent/modes/:mode` | One resolved mode profile |
| `POST` | `/api/agent/modes/validate` | "Is this mode viable for this workspace?" |
| `POST` | `/api/agent/route` | "Which provider may run this job — and why not the others?" |
| `POST` | `/api/agent/policy/tool-call` | "May this tool run? Does it need approval?" |
| `POST` | `/api/agent/policy/egress` | "May this content leave the machine?" |
| `GET` | `/api/agent/states` | The run state machine's vocabulary |
| `POST` | `/api/agent/states/transition` | Apply one event to a run |
| `POST` | `/api/agent/dag/validate` | Validate a task graph and plan its waves |
| `POST` | `/api/agent/redact` | Strip secrets from text or a payload |
| `POST` | `/api/agent/evidence/audit` | "Is this completion claim backed by evidence?" |
| `GET` | `/api/agent/schemas` | The registered output contracts |
| `POST` | `/api/agent/schemas/validate` | Validate data against a contract |
| `GET` | `/api/agent/prompts` | The versioned prompt library |
| `POST` | `/api/agent/prompts/:file/compose` | Render one prompt with variables resolved |

### Runs — the execution loop

A run is a durable object: a state, a budget, and an append-only history. The
kernel decides every transition; this layer drives it, persists it, and stops
it when a ceiling is hit.

| Method | Path | Answers |
|---|---|---|
| `POST` | `/api/agent/runs` | Start a run |
| `GET` | `/api/agent/runs` | List runs for a project |
| `GET` | `/api/agent/runs/resumable` | What was in flight when we last stopped |
| `GET` | `/api/agent/runs/:runId` | One run: state, budget, what it awaits |
| `POST` | `/api/agent/runs/:runId/step` | Advance by one event |
| `POST` | `/api/agent/runs/:runId/decision` | Approve or reject the current gate |
| `POST` | `/api/agent/runs/:runId/cancel` | Stop a run |
| `GET` | `/api/agent/runs/:runId/checkpoints` | The full history |
| `GET` | `/api/agent/runs/:runId/verify` | Re-derive the hash chain |
| `POST` | `/api/agent/runs/:runId/advance` | Let a model drive the next phase(s) |
| `POST` | `/api/agent/runs/:runId/remember` | File a finished run into project memory |

Four properties are worth stating plainly:

- **The loop never overrules the kernel.** A step asks `transition()` and
  records whatever it says. An illegal event is answered `200 {ok:false}` with
  the kernel's own reason — a refusal is a fact about a healthy run, not an
  error — and nothing is written.
- **Budgets are enforced before work counts.** Steps, tokens, cost and
  wall-clock are checked on entry; exhausting one moves the run to `FAILED`
  with the reason, rather than letting it drift past the ceiling. Ceilings are
  copied from the compute mode at creation, so editing a mode profile later
  cannot widen a run already in flight.
- **State and history commit together.** The row update and the checkpoint are
  one transaction, so a crash can never leave a state with no history. A run
  killed mid-flight reappears in `/runs/resumable` and continues.
- **The history is hash-chained.** Each checkpoint carries the digest of the
  previous one, so a row edited or deleted in the database breaks verification
  at a known sequence number.

#### The driver

`advance` is the autonomous layer, and it changes none of the above — it is
just another caller of `step()`, subject to every guarantee listed here.

For each state it knows one question, the task type to route it as, and the
handful of words that are acceptable answers. It composes a prompt from the
run's goal and recalled project memory, sends it through this gateway's own
`/v1/chat/completions` (so the agent inherits the full provider pool, failover
and cost accounting), and maps the reply onto exactly one event.

The safety of the arrangement rests on what the model is *not* given. It never
sees the state machine, never names a state, and never chooses an event. It
picks a word from a list; a lookup table in code turns that word into a
transition. An answer outside the list is refused and the run does not move —
no state change, no step consumed, no checkpoint written. A model insisting on
`deploy_approved` during intake is simply ignored.

Three limits bound the driver regardless of what any model returns: it stops at
every human gate (only a person calls `/decision`), it is capped by both its
own `maxSteps` and the run's step budget, and repair loops end at the compute
mode's attempt limit. Each automated checkpoint records the outcome, the
model's reasoning and the model's name, so the history distinguishes machine
decisions from human ones.

A test asserts that every outcome in the driver's phase table is a legal
transition in the state it belongs to, so the two cannot drift apart.

### Tools — how a run affects anything

The state machine and the driver decide; tools are where a decision becomes a
change, which makes this the most security-sensitive code in the agent. One
function (`services/agent-tools.ts`) puts six gates in a fixed order:

1. **Registration.** A model cannot conjure a capability by naming it; unknown
   tool names are refused before anything else happens.
2. **Schema.** Arguments are validated with Ajv — the same validator the proxy
   uses for provider tool calls. Unlike the proxy path, a missing or
   uncompilable schema fails *closed* here.
3. **Policy.** `evaluateToolCall` from the kernel policy engine, so a tool call
   made by the driver obeys exactly the rules that `/policy/tool-call`
   reports. Hard denies (`host.exec`, `*.credential.read_raw`) are unreachable.
4. **Approval.** When the verdict demands one, the approval must name the
   configured approver. An agent approving itself is refused.
5. **Execution** under a timeout, so a hung tool cannot hold a run.
6. **Audit.** Every attempt is written to `agent_tool_calls` — denials and
   failures included — with arguments and result previews redacted.

| Method | Path | Answers |
|---|---|---|
| `GET` | `/api/agent/tools` | The catalogue, shaped for a tool-calling model |
| `POST` | `/api/agent/tools/invoke` | Run one call through the gates |
| `GET` | `/api/agent/tools/calls` | The audit trail |

The built-in set is deliberately small: `fs.read_file`, `fs.list`, `fs.search`,
`fs.file.write` and `sandbox.test`. All of them are confined to a workspace
root taken from `AGENT_WORKSPACE_ROOT` — **server configuration, never a
request field**, because a caller who can choose the root defeats confinement
entirely. The check resolves symlinks and compares against `root + separator`,
so `../`, absolute paths, links pointing outward and prefix-sharing siblings
are all refused by the same test.

`sandbox.test` spawns with `shell: false` and an environment reduced to `PATH`,
`HOME`, `NODE_ENV` and `CI`. Shell metacharacters are therefore inert
arguments, and the provider API keys in the server's environment are not
inherited by anything a run executes.

### Evidence — joining the driver to the tools

The driver decides and the registry acts; `services/agent-evidence.ts` is what
lets a phase do the second before committing to the first. Given a workspace,
a phase may call read-only tools and put the results in front of the model
before it answers.

Two constraints shape the design.

**Autonomy must not smuggle in authority.** The tools available to an
unattended phase are *derived*, not declared: a tool qualifies only if
`evaluateToolCall` allows it with an empty scope grant, demands no approval,
and reports no side effect. That is the definition of "cannot change anything
and needs no permission", so reads pass and every write, deploy or credential
tool is excluded — including tools registered later, without this module being
told about them. A phase's own list is then intersected with that set, so an
over-generous phase table cannot widen what an unsupervised run may do.

**The loop must terminate.** The model can do exactly two things — request one
tool or answer — and requests are capped per phase. A model that keeps asking
runs out of turns and is then required to decide on what it has. A malformed
`TOOL` line is treated as a final answer rather than retried, so broken JSON
cannot spin the loop either.

Evidence changes what the model knows, never what it may say. The outcome is
parsed from the final text by the same rules as the no-evidence path, so a
phase that reads three files and then demands an illegal event is refused
exactly as before, and the run does not move. Every call is recorded in
`agent_tool_calls` against the run, and the tools consulted are written onto
the checkpoint, so the history shows what each decision was based on.

### Git — the supervised write path

Reading is safe unattended; changing a repository is not. Every git tool that
writes carries a side effect, so `unattendedTools()` excludes it and an
autonomous phase can never reach it. They are callable only through an
explicit, scoped invocation.

The design problem worth recording is the protected-branch guard. The policy
engine refuses a write to a protected ref, but only when the caller declares
which ref is being written — and asking a *model* to declare it is worthless,
because a model wanting to commit to `main` would simply omit it. `ToolDefinition`
therefore gained `resolveTargetRef`, a hook the registry calls before asking
for a verdict. The git tools implement it by reading `HEAD`, so the guard is
evaluated against what the repository is actually on. A resolver that throws
is a denial, not an absent ref: unknown must not degrade to unprotected.

Tool names are load-bearing. `git.status.read` and `git.diff.read` end in
`.read` so `BASELINE_RULES` classifies them as reads with no side effect —
which is also why phases may use them as evidence. `git.patch.file.write` ends
in `.file.write` so it inherits `repository:write`. A name the rule set does
not match falls to the catch-all default (high risk, always approve): safe,
but it would put a human in front of every routine read.

Three smaller decisions:

- git runs with `GIT_TERMINAL_PROMPT=0`, no askpass and no system config, so an
  agent cannot authenticate as the human who installed the gateway.
- Commits use a distinct identity (`FreeLLMAPI Agent`), so history separates
  machine work from human work permanently.
- `--no-verify` is deliberately not passed, and `git apply --check` runs before
  `git apply`, so hooks still apply and a bad patch leaves the tree untouched.

### Memory — what the agent remembers between runs

Facts are scoped to an `(organizationId, projectId)` pair, carry mandatory
provenance, and are ranked lexically with a bonus for how much they are
trusted. Storage is deduplicated by content hash and honours a TTL.

| Method | Path | Answers |
|---|---|---|
| `POST` | `/api/agent/memory` | Store one fact (201 new, 200 if already known) |
| `POST` | `/api/agent/memory/query` | "What do we know that bears on this?" |
| `GET` | `/api/agent/memory/stats` | How much is held, by kind and trust |
| `DELETE` | `/api/agent/memory/:memoryId` | Forget one fact |

Two rules are enforced by the kernel and cannot be bypassed through the route:
a fact with no provenance is refused, and so is content that looks like a
credential. Every query is filtered by tenant **in SQL**, so no result set —
however large — can reach across projects.

### Jobs — how work is spread out and survives failure

| Method | Path | Answers |
|---|---|---|
| `POST` | `/api/agent/jobs` | Enqueue work (idempotent per key) |
| `POST` | `/api/agent/jobs/claim` | Lease jobs for a worker |
| `POST` | `/api/agent/jobs/:jobId/complete` | Report success |
| `POST` | `/api/agent/jobs/:jobId/fail` | Report failure — retries, then dead-letters |
| `POST` | `/api/agent/jobs/:jobId/cancel` | Stop a job that has not finished |
| `GET` | `/api/agent/jobs/stats` | Queue depth plus the configured policies |
| `GET` | `/api/agent/jobs/:jobId` | Inspect one job |

Four queues — `run`, `model`, `tool`, `benchmark` — each with its own
concurrency cap, attempt budget, backoff curve and lease length, taken from the
kernel's `DEFAULT_QUEUE_POLICIES` rather than redefined.

Three properties matter more than the endpoint list:

- **A claim is a lease, not a handover.** Claiming sets an expiry. If the
  worker dies without reporting back, the lease lapses and another worker picks
  the job up — work is never silently stranded.
- **Claims are exclusive.** The claim runs as a conditional `UPDATE` inside a
  transaction, so two workers racing for the same row cannot both win.
- **Retries are bounded.** A job that keeps failing backs off exponentially and
  then moves to `dead_letter`, the same fail-closed reasoning the run state
  machine applies to its repair budget.

### Why a request was refused

The router does not silently fall back. Every rejected candidate comes back
with the reason it was dropped, so a UI can answer "why not Groq?" instead of
leaving the operator guessing:

```bash
curl -s -X POST http://localhost:3001/api/agent/route \
  -H "Authorization: Bearer $DASHBOARD_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "free",
    "request": {
      "taskType": "code_generation",
      "privacyLevel": "internal",
      "requiresToolCalling": true,
      "requiresStructuredOutput": true,
      "contextTokens": 32000,
      "maxCost": 0,
      "maxLatencyMs": 30000
    },
    "providers": [ /* ModelProviderCapability[] */ ]
  }'
```

```jsonc
{
  "primary":  { "provider": "groq", "model": "llama-3.3-70b", "locality": "cloud", "reason": "…" },
  "fallbacks": [ /* … */ ],
  "rejected": [
    { "provider": "openai", "model": "gpt-4o", "reason": "not allowed in mode \"free\"" }
  ],
  "explanation": "…"
}
```

### Fail-closed by default

The policy engine refuses rather than guesses. A push to a protected branch is
denied outright:

```bash
curl -s -X POST http://localhost:3001/api/agent/policy/tool-call \
  -H "Authorization: Bearer $DASHBOARD_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "call": { "tool": "git.push", "grantedScopes": ["repo:write"], "targetRef": "main" },
    "context": {
      "autonomy": "supervised", "privacyLevel": "internal",
      "workingBranch": "agent/work", "protectedBranches": ["main"],
      "approverUserId": "u1"
    }
  }'
```

```jsonc
{
  "allowed": false,
  "riskLevel": "critical",
  "reasons": ["direct write to protected ref \"main\" is forbidden; open a pull request instead"],
  "denyReason": "protected branch write"
}
```

Omitted context fields default to the **most restrictive** interpretation
(supervised autonomy, private work, `main` protected), so a malformed request
can never accidentally widen permissions.

## Prompt library

Thirteen versioned agent prompts live in `agent/prompts/`, each bound to an
output contract so the prompt and the schema it must satisfy move together:
orchestrator, product analyst, requirements clarifier, solution architect,
repository analyst, coding agent, QA/accessibility, security reviewer,
DevOps/deploy, browser automation, documentation, code reviewer and repair.

```bash
npm run agent:prompt:list
npm run agent:prompt:show -- 05-coding-agent.md
```

## Output contracts

Twelve JSON Schemas in `agent/schema/` define what a model is allowed to
return: product spec, plan, task, tool-call decision, completion report, QA
report, security finding, connector manifest, run request, orchestrator output
and the shared definitions. `POST /api/agent/schemas/validate` checks a payload
against any of them.

## Commands

```bash
npm run agent:test        # 611 kernel tests
npm run agent:typecheck   # strict tsc, no emit
npm run build -w agent    # emit dist/ for the server to import
npm run agent:prompt:list # list the prompt library
npm run agent:playground  # the blueprint's standalone playground
```

## Implementation status

This is worth being blunt about, because the design documents are extensive
enough to read as finished product.

**Implemented and tested:** the deterministic kernel — state machine, policy
engine, model router, compute modes, redaction, task DAG, evidence audit,
output contracts, prompt library, free-provider pool, usage ledger, checkpoint
store and session auth. 611 tests cover them.

**Now durable:** memory and the job queue existed in the kernel as in-process
modules that lost everything on restart. Both are now backed by SQLite
(`agent_memories`, `agent_jobs`), so recalled facts and in-flight jobs survive
a crash, and several workers can share one queue.

**Now driven:** the state machine, repair budget and approval gates used to be
callable only by hand — there was no such thing as "a run". `agent_runs` and
`agent_checkpoints` add one, with budget enforcement, human gates, cancellation
and crash-resumable execution over a verifiable history.

**Designed, not implemented:** phases M9–M208 in `agent/docs/` are explicitly
marked `designed_only`. Persistence, UI, billing providers, evaluator runners,
sandbox runtime, the marketplace, accessibility CI, data storage, the
scheduler, protocol gateway, event bus, microVM, secret broker and restore
runtime are specified in detail but have no production implementation behind
them. The registry tracks this honestly and the merge did not change it.

See [`agent/INTEGRATION.md`](../../../agent/INTEGRATION.md) for the merge notes.
