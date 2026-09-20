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
(`requireAuth`), exactly like the other admin surfaces. Handlers are pure —
they take JSON, run a decision kernel, and return the verdict together with the
reason for it. They never call an upstream model and never touch the database,
so they are safe to poll and safe to script against.

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
store, job queue and session auth. 611 tests cover them.

**Designed, not implemented:** phases M9–M208 in `agent/docs/` are explicitly
marked `designed_only`. Persistence, UI, billing providers, evaluator runners,
sandbox runtime, the marketplace, accessibility CI, data storage, the
scheduler, protocol gateway, event bus, microVM, secret broker and restore
runtime are specified in detail but have no production implementation behind
them. The registry tracks this honestly and the merge did not change it.

See [`agent/INTEGRATION.md`](../../../agent/INTEGRATION.md) for the merge notes.
