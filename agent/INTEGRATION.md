# ForgePilot agent kernel — integration notes

This workspace is the `code-agent` (ForgePilot) blueprint merged into the
FreeLLMAPI monorepo. Nothing from the original router was removed; this package
is additive.

> **Looking for how to actually use it?** See [USAGE.md](./USAGE.md) — a
> practical walkthrough with worked examples. This file covers what was merged
> and how it is wired together.

## What was merged

| From the blueprint | Where it lives now |
|---|---|
| `src/core/**` — 225 deterministic kernel modules | `agent/src/core/**` |
| `schema/**` — 12 JSON Schema output contracts | `agent/schema/**` |
| `prompts/**` — 13 versioned agent prompts | `agent/prompts/**` |
| `test/**` — 613 tests | `agent/test/**` |
| `docs/**` — 231 design documents | `agent/docs/**` |
| `apps/api`, `apps/playground` | `agent/apps/**` |
| `examples/`, `prisma/`, `scripts/`, `openapi.yaml` | `agent/**` |

## The rule the kernel exists to enforce

> The language model proposes; the code decides.

These decisions are never delegated to a model:

| Decision | Module |
|---|---|
| Run state transitions | `src/core/state-machine.ts` |
| Whether a tool call is allowed / needs approval | `src/core/policy-engine.ts` |
| Which provider may run a job | `src/core/model-router.ts` |
| Configuration from the free/paid/local switch | `src/core/compute-mode.ts` |
| Secret scrubbing before anything leaves the process | `src/core/redaction.ts` |
| Task ordering and parallelism | `src/core/task-dag.ts` |
| Whether a success claim is believed | `src/core/evidence.ts` |
| Model output validation | `src/core/output-contract.ts` |

## How it plugs into the server

`server/src/routes/agent.ts` mounts the kernel at `/api/agent`, behind
`requireAuth` like every other admin surface. The handlers are pure: they take
JSON, run a decision kernel, and return the verdict plus its reason. They never
call an upstream model and never touch the database.

| Endpoint | What it answers |
|---|---|
| `GET /api/agent/modes` | The three compute modes and their full profiles |
| `GET /api/agent/modes/:mode` | One resolved mode profile |
| `POST /api/agent/modes/validate` | "Is this mode viable for this workspace?" |
| `POST /api/agent/route` | "Which provider may run this job, and why not the others?" |
| `POST /api/agent/policy/tool-call` | "May this tool run? Does it need approval?" |
| `POST /api/agent/policy/egress` | "May this content leave the machine?" |
| `GET /api/agent/states` | The run state machine's vocabulary |
| `POST /api/agent/states/transition` | Apply one event to a run |
| `POST /api/agent/dag/validate` | Validate a task graph and plan its waves |
| `POST /api/agent/redact` | Strip secrets from text or a payload |
| `POST /api/agent/evidence/audit` | "Is this completion claim backed by evidence?" |
| `GET /api/agent/schemas` | The registered output contracts |
| `POST /api/agent/schemas/validate` | Validate data against a contract |
| `GET /api/agent/prompts` | The versioned prompt library |
| `POST /api/agent/prompts/:file/compose` | Render one prompt with variables resolved |

The dashboard page at `/forgepilot` (`client/src/pages/ForgePilotPage.tsx`)
renders the read-only half of this: compute modes, provider policy, budgets,
quality gates, run states and the prompt library.

## Commands

```bash
npm run agent:test        # 613 kernel tests
npm run agent:typecheck   # strict tsc, no emit
npm run build -w agent    # emit dist/ for the server to import
npm run agent:prompt:list # list the prompt library
npm run agent:playground  # the blueprint's standalone playground
```

## Honest status

The kernel modules are deterministic contracts, validation and decision logic
with real tests. Phases M9–M208 in `docs/` were marked `designed_only`:
persistence, UI, billing providers, sandbox runtime, marketplace and the other
production concerns described there were **designed, not implemented**.

Since the merge, some of that has changed and the rest has not. What is now
real, with a live caller and a test that fails if the guard is removed:

- **Persistence** — runs, memory and the job queue survive a restart.
- **Sandbox runtime** — `sandbox.test` executes inside a user/mount/net/pid
  namespace with a read-only root and no network. Verified by escape probes,
  not by reading a man page.
- **Tooling** — 19 registered tools behind schema validation, the policy
  engine, approval, a timeout and an audit row.

What remains `designed_only` is unchanged: billing providers, the marketplace,
and most of the UI surface described in those phase documents.

The number worth knowing before planning around this: **of 225 modules in
`agent/src/core`, 16 have a production caller and 209 do not.** 200 of the 209
take safety facts as boolean parameters, so they validate a claim rather than
establishing one. Wiring them is therefore not plumbing — it needs a
measurement layer first, which `server/src/services/agent-attestation.ts`
began.
