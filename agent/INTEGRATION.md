# ForgePilot agent kernel — integration notes

This workspace is the `code-agent` (ForgePilot) blueprint merged into the
FreeLLMAPI monorepo. Nothing from the original router was removed; this package
is additive.

## What was merged

| From the blueprint | Where it lives now |
|---|---|
| `src/core/**` — 225 deterministic kernel modules | `agent/src/core/**` |
| `schema/**` — 12 JSON Schema output contracts | `agent/schema/**` |
| `prompts/**` — 13 versioned agent prompts | `agent/prompts/**` |
| `test/**` — 611 tests | `agent/test/**` |
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
npm run agent:test        # 611 kernel tests
npm run agent:typecheck   # strict tsc, no emit
npm run build -w agent    # emit dist/ for the server to import
npm run agent:prompt:list # list the prompt library
npm run agent:playground  # the blueprint's standalone playground
```

## Honest status

The kernel modules are deterministic contracts, validation and decision logic
with real tests. Phases M9–M208 in `docs/` are marked `designed_only`:
persistence, UI, billing providers, sandbox runtime, marketplace and the other
production concerns described there are **designed, not implemented**. The
merge did not change that status, and the kernel makes no production claim it
did not make in the source repository.
