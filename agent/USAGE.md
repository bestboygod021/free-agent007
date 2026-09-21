# How to use the ForgePilot kernel

A practical guide. Every command and response below was run against this repo.

- [Start it](#start-it)
- [1. The dashboard](#1-the-dashboard)
- [2. The prompt library (CLI)](#2-the-prompt-library-cli)
- [3. The decision API](#3-the-decision-api)
- [4. Using it from your own code](#4-using-it-from-your-own-code)
- [5. Memory: what it remembers](#5-memory-what-it-remembers)
- [6. Jobs: how it scales](#6-jobs-how-it-scales)
- [What it does not do](#what-it-does-not-do)

## Start it

```bash
npm install
npm run dev          # server on :3001, dashboard on :5173
```

First run prints a setup code and creates the database. Open
<http://localhost:5173>, create an account, and you are in.

For the API examples below you need a dashboard token. Grab one with the
credentials you just created:

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"your-password"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
```

## 1. The dashboard

Open **<http://localhost:5173/forgepilot>**.

Pick **Free / Paid / Local** at the top and the whole page re-reads from that
one switch: which providers are allowed, the cost ceiling, the token budget,
how many tasks run in parallel, which quality gates must pass, and which
capabilities the mode switches off. Below that are the 19 run states (terminal
ones filled) and the 13 versioned prompts.

This page is read-only — it shows you what the kernel *will* decide.

## 2. The prompt library (CLI)

Thirteen agent prompts, each pinned to a version and an output schema.

```bash
npm run agent:prompt:list
```

```
# compute mode: رایگان (سهمیه ابری + مدل محلی)

orchestrator             v1.1.0  283 lines  00-orchestrator.md
product-analyst          v1.1.0  143 lines  01-product-analyst.md
coding-agent             v1.1.0  213 lines  05-coding-agent.md
security-reviewer        v1.1.0  173 lines  07-security-reviewer.md
repair                   v1.1.0  159 lines  12-repair.md
…
```

Print one fully composed — fragments inlined, mode variables substituted:

```bash
npm run agent:prompt:show -- 12-repair.md
```

```
# repair v1.1.0 (12-repair.md)
# compute mode: free — رایگان (سهمیه ابری + مدل محلی)
# fragments: fragments/invariants.md, fragments/untrusted-content.md, …
# output schema: https://forgepilot.dev/schema/completion-report.schema.json

# Repair Agent

You are called when something failed. Your budget is **three attempts per run**.
A loop that never ends is worse than an honest failure.
…
```

These are ready to paste into any model — Claude, GPT, a local Qwen. That is
the simplest possible way to get value out of this repo today.

## 3. The decision API

Fifteen endpoints under `/api/agent`, all behind your dashboard token. They
take JSON, run a decision kernel, and return the verdict **plus the reason**.
Nothing here calls a model or writes to the database.

### "Which provider should run this job?"

The interesting part is not the answer — it is that you are told why every
other candidate lost.

```bash
curl -s -X POST http://localhost:3001/api/agent/route \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
   "mode":"free",
   "request":{"taskType":"code_generation","privacyLevel":"private",
     "requiresToolCalling":true,"requiresStructuredOutput":true,
     "contextTokens":24000,"maxCost":0,"maxLatencyMs":30000},
   "providers":[
    {"provider":"ollama","model":"qwen2.5-coder","locality":"local",
     "maxPrivacyLevel":"confidential","supportsToolCalling":true,
     "supportsStructuredOutput":true,"contextWindow":32768,"rpm":60,"rpd":100000,
     "mayTrainOnInput":false,"license":"apache-2.0","relativeCost":0,
     "relativeLatencyMs":1200,"enabled":true},
    {"provider":"groq","model":"llama-3.3-70b","locality":"cloud",
     "maxPrivacyLevel":"internal","supportsToolCalling":true,
     "supportsStructuredOutput":true,"contextWindow":128000,"rpm":30,"rpd":1000,
     "mayTrainOnInput":false,"license":"llama","relativeCost":0,
     "relativeLatencyMs":400,"enabled":true},
    {"provider":"openai","model":"gpt-4o","locality":"cloud",
     "maxPrivacyLevel":"confidential","supportsToolCalling":true,
     "supportsStructuredOutput":true,"contextWindow":128000,"rpm":500,"rpd":10000,
     "mayTrainOnInput":false,"license":"proprietary","relativeCost":25,
     "relativeLatencyMs":700,"enabled":true}
   ]}'
```

```
PRIMARY : ollama | local execution: zero API cost, data never leaves the machine
REJECTED: groq   -> privacy ceiling internal < requested private
REJECTED: openai -> mode "free" does not allow paid providers
```

The code was marked `private`, so the fast free cloud model was refused on
privacy grounds and the capable paid model was refused on mode grounds. It
routed to the local model instead — and told you exactly why.

### "May this tool call run?"

```bash
curl -s -X POST http://localhost:3001/api/agent/policy/tool-call \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"call":{"tool":"git.push","grantedScopes":["repo:write"],"targetRef":"main"},
       "context":{"autonomy":"supervised","privacyLevel":"internal",
         "workingBranch":"agent/work","protectedBranches":["main"],
         "approverUserId":"u1"}}'
```

```json
{
  "allowed": false,
  "riskLevel": "critical",
  "reasons": ["direct write to protected ref \"main\" is forbidden; open a pull request instead"],
  "denyReason": "protected branch write"
}
```

Leave a context field out and it fails **closed**, not open.

### "May this data leave the machine?"

```bash
curl -s -X POST http://localhost:3001/api/agent/policy/egress \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"privacyLevel":"internal","providerLocality":"cloud",
       "userConsentedToCloud":true,"computeMode":"local"}'
```

```json
{
  "allowed": false,
  "reasons": ["compute mode is \"local\"; no content may leave the machine, consent or not"]
}
```

Local mode is a wall, not a preference — explicit consent does not open it.

### "Is this 'task complete' claim true?"

An agent claiming success with no tests run:

```bash
curl -s -X POST http://localhost:3001/api/agent/evidence/audit \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"claim":{"taskStatus":"completed","summary":"added endpoint",
       "acceptanceCriteria":["returns 200"],"filesChanged":["src/a.ts"],
       "commandsExecuted":[],"tests":[]}}'
```

```json
{ "accepted": false, "violations": ["…"], "repairable": true }
```

The same claim with a passing test run attached returns
`{"accepted": true, "violations": [], "repairable": false}`.

### "Can this workspace use this mode?"

```bash
curl -s -X POST http://localhost:3001/api/agent/modes/validate \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"mode":"free","privacyLevel":"confidential",
       "hasLocalRuntime":false,"hasPaidAccess":false}'
```

Returns `ok: false` with a plain-language problem: confidential work cannot run
in free mode with no local model available. You learn this at selection time,
not ten minutes into a run.

### Scrub secrets out of anything

```bash
curl -s -X POST http://localhost:3001/api/agent/redact \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"text":"export OPENAI_API_KEY=sk-proj-abc123def456ghi789"}'
```

```json
{ "text": "export OPENAI_API_KEY=[REDACTED:KV_SECRET]", "hasSecrets": true, "hits": [...] }
```

Recognises AWS keys, GitHub tokens, JWTs, Slack tokens, database URLs and
generic `KEY=value` shapes. Run untrusted text through this before logging it.

### The rest

| Endpoint | Use |
|---|---|
| `GET /api/agent/modes` | All three profiles in full |
| `GET /api/agent/states` | The 19 run states and which are terminal |
| `POST /api/agent/states/transition` | Apply one event; illegal ones are refused with a reason |
| `POST /api/agent/dag/validate` | Detect dependency cycles, plan parallel waves, find file conflicts |
| `GET /api/agent/schemas` | The 12 output contracts |
| `POST /api/agent/schemas/validate` | Check a model's JSON against a contract |
| `GET /api/agent/prompts` | The prompt library as JSON |
| `POST /api/agent/prompts/:file/compose` | Render a prompt with your variables |

## 4. Using it from your own code

The kernel is a normal workspace package — import it directly and skip HTTP:

```ts
import { resolveMode } from '@freellmapi/agent/core/compute-mode.js'
import { routeModel } from '@freellmapi/agent/core/model-router.js'
import { evaluateToolCall } from '@freellmapi/agent/core/policy-engine.js'
import { redactSecrets } from '@freellmapi/agent/core/redaction.js'

const profile = resolveMode('free')
const { primary, rejected } = routeModel(request, { providers, mode: 'free' })
const verdict = evaluateToolCall(call, context)
const { text, hasSecrets } = redactSecrets(logLine)
```

Run `npm run build -w agent` first so `dist/` exists.

## 5. Memory: what it remembers

An agent that forgets your project between runs will keep asking the same
questions. Facts are scoped to a project, must say where they came from, and
survive a restart.

Store something worth keeping:

```bash
curl -s -X POST http://localhost:3001/api/agent/memory \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "organizationId": "acme",
    "projectId": "web",
    "kind": "decision",
    "content": "Chose SQLite over Postgres to keep deployment single-file",
    "trust": "verified",
    "source": {"sourceType":"user","sourceId":"adr:002","evidenceHash":"ghi789"}
  }'
```

Ask for it back in the words you would actually use:

```bash
curl -s -X POST http://localhost:3001/api/agent/memory/query \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"organizationId":"acme","projectId":"web","query":"SQLite deployment"}'
```

```
0.53 [verified] Chose SQLite over Postgres to keep deployment single-file
0.20 [verified] The build uses Vite 5 and outputs to dist/
```

Worth knowing:

- `kind` is one of `project_fact`, `run_summary`, `user_preference`, `decision`.
- `trust` is `untrusted`, `observed` or `verified`; recall defaults to the last
  two, and more-trusted facts score higher.
- **Provenance is mandatory.** A fact with no `sourceId`/`evidenceHash` is
  refused, so you can always ask *why* the agent believes something.
- **Credentials are refused.** Content matching a secret pattern is rejected
  rather than quietly stored.
- Storing the same content twice returns the original instead of duplicating.
- Pass `ttlMs` for something temporary ("deploy freeze until Friday").
- Queries are filtered by tenant in SQL — another project cannot read yours.

## 6. Jobs: how it scales

Work that takes minutes should not live inside a request. The queue spreads it
across workers, caps how much runs at once, and — the point of persisting it —
does not lose jobs when a worker dies.

```bash
curl -s -X POST http://localhost:3001/api/agent/jobs \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"queue":"run","organizationId":"acme","idempotencyKey":"build-42",
       "payload":{"task":"build"},"priority":9}'
```

A worker leases jobs, does the work, and reports back:

```bash
# claim -> returns at most `concurrency` jobs, highest priority first
curl -s -X POST http://localhost:3001/api/agent/jobs/claim \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"queue":"run","workerId":"worker-1","limit":5}'

# then one of:
curl -s -X POST http://localhost:3001/api/agent/jobs/$JOB_ID/complete \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"workerId":"worker-1"}'

curl -s -X POST http://localhost:3001/api/agent/jobs/$JOB_ID/fail \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"workerId":"worker-1","error":"upstream 502"}'
```

`GET /api/agent/jobs/stats` shows where everything stands:

```
queue      conc  queued  running  retry  done  DLQ
run           2       0        2      0     1    1
model         4       0        0      0     0    0
tool          2       0        0      0     0    0
benchmark     1       0        0      0     0    0
```

The behaviour that matters:

- **Backpressure is real.** Ask for 10 jobs on a queue with concurrency 2 and
  you get 2. The cap is a property of the queue, not a suggestion.
- **A crashed worker loses nothing.** Claiming takes a lease; if the worker
  never reports back the lease expires and another worker picks the job up.
- **Two workers never get the same job**, even racing on the same row.
- **Retries are bounded.** Failures back off exponentially, then the job moves
  to `dead_letter` instead of retrying forever.
- **Enqueueing is idempotent.** The same `idempotencyKey` returns the existing
  job; reusing it for a *different* payload is an error, not a silent overwrite.

## What it does not do

Be clear about this before you build on it.

**It does not run an agent.** There is no loop that reads your repo, calls a
model, writes files and opens a PR. The kernel is the set of rules such a loop
would consult — the referee, not the player.

**It is not wired to your 635 models yet.** `POST /api/agent/route` makes you
pass the candidate providers in the request body. It does not read the
FreeLLMAPI catalog in the database. Connecting those two is the obvious next
step and it is not done.

**Most of the documentation describes plans.** Phases M9–M208 in `agent/docs/`
are marked `designed_only`: billing, sandbox runtime, marketplace and the rest
are specified but not implemented. The 611 kernel tests cover the modules
listed in this guide — nothing more.

Two things that used to be on this list no longer are. **Memory** and the
**job queue** are now persisted in SQLite, so facts and in-flight work survive
a restart; see [memory](#5-memory-what-it-remembers) and
[jobs](#6-jobs-how-it-scales) above.

So today this is useful as: a prompt library you can paste into any model, a
policy/routing/evidence engine you can call before letting an agent do
something irreversible, and a durable memory and work queue to build a real
agent loop on top of.
