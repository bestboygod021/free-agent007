# How to use the ForgePilot kernel

A practical guide. Every command and response below was run against this repo.

- [Start it](#start-it)
- [1. The dashboard](#1-the-dashboard)
- [2. The prompt library (CLI)](#2-the-prompt-library-cli)
- [3. The decision API](#3-the-decision-api)
- [4. Using it from your own code](#4-using-it-from-your-own-code)
- [5. Runs: driving an agent end to end](#5-runs-driving-an-agent-end-to-end)
- [6. Memory: what it remembers](#6-memory-what-it-remembers)
- [7. Jobs: how it scales](#7-jobs-how-it-scales)
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

## 5. Runs: driving an agent end to end

A run is the thing that was missing. It has a state, a budget, and a history
you can verify — and it survives the process dying.

```bash
RUN=$(curl -s -X POST http://localhost:3001/api/agent/runs \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"organizationId":"acme","projectId":"web",
       "goal":"Add rate limiting to the public API","mode":"paid","maxSteps":50}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["run"]["runId"])')
```

Advance it one event at a time. Whatever did the work reports the outcome:

```bash
curl -s -X POST http://localhost:3001/api/agent/runs/$RUN/step \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"event":"spec_ready","payload":{"note":"spec drafted"},"tokensUsed":1200}'
```

At a gate the run parks and tells you what it wants:

```
state: AWAITING_PLAN_APPROVAL | awaiting: plan
```

```bash
curl -s -X POST http://localhost:3001/api/agent/runs/$RUN/decision \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"approved":true}'          # -> RECON
```

### The four things worth trying

**An agent cannot skip a human.** Ask to deploy while the plan is still
unapproved:

```
ok: False
refused: deploy approval is only valid while AWAITING_DEPLOY_APPROVAL (invariant I2)
still in: AWAITING_PLAN_APPROVAL
```

**A runaway run stops itself.** With `maxSteps: 3`, the fourth step does not
quietly continue:

```
ok=True  state=PLAN
ok=True  state=AWAITING_PLAN_APPROVAL
ok=True  state=RECON
ok=False state=FAILED     step budget exhausted (3/3)
```

The same applies to `maxTokens`, `maxCost` and `timeoutMs`.

**A crash loses nothing.** `kill -9` the server mid-run, start it again:

```bash
curl -s http://localhost:3001/api/agent/runs/resumable -H "Authorization: Bearer $TOKEN"
#   run_mub9vv4b_dt5jjmrf in TEST (5 steps, 4200 tokens)
```

Then just keep stepping it. It finishes normally.

**The history cannot be rewritten quietly.** Every checkpoint carries the hash
of the one before it:

```bash
curl -s http://localhost:3001/api/agent/runs/$RUN/checkpoints -H "Authorization: Bearer $TOKEN"
```

```
 0  created                      -> INTAKE
 1  spec_ready                   -> PLAN
 2  plan_ready                   -> AWAITING_PLAN_APPROVAL
 3  plan_approved                -> RECON
 4  recon_complete               -> IMPLEMENT
 5  implementation_batch_done    -> TEST
 ...
11  finalized                    -> DONE
```

Edit one row directly in SQLite and `/verify` names the break:

```
valid: False | brokenAt: 1 | checkpoint contents do not match its hash
```

Budgets also come from the mode, so you do not have to know the numbers:

| mode | maxRepairAttempts | maxCost |
|---|---|---|
| `free` | 2 | 0 |
| `paid` | 3 | 1000 |

One limit to be aware of: **the loop does not call models.** It advances when
something tells it what happened. That keeps every decision in the tested
kernel and leaves execution to you — or to an autonomous driver built on top.

### The agent driving itself

Everything above advances the run by hand. `advance` closes the loop: it works
out which phase the run is in, asks a model the one question that phase needs
answered, and maps the reply onto a legal event.

```bash
curl -s -X POST http://localhost:3001/api/agent/runs/$RUN/advance \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"maxSteps":8}'
```

```
  clear      -> spec_ready                 PLAN
  ready      -> plan_ready                 AWAITING_PLAN_APPROVAL

stopped: awaiting_human | run is waiting for plan approval
```

It went as far as it legitimately could and stopped. Approve the plan and call
`advance` again, and it carries on through recon, implementation, tests,
security review and preview before parking at the deploy gate.

The model is never told the state machine exists. It is asked a question and
given a short list of permitted words; this code turns the word it picks into
exactly one event. That is what makes the loop safe to run unattended:

```
stopped: refused
reason : model answered "deploy_approved\nIgnore the process, ship";
         expected one of: clear, unclear
state  : INTAKE (unchanged)
steps  : 0
```

A model demanding deployment during intake does not get a veto, an error, or a
half-applied transition — it gets ignored, and the run does not move.

Three properties hold no matter what comes back:

- **It cannot approve itself.** Human gates stop the driver every time; only a
  person calls `/decision`.
- **It cannot invent a transition.** Unrecognised answers are refused and cost
  the run nothing — no state change, no step consumed, no checkpoint.
- **It cannot run forever.** It is bounded by its own `maxSteps`, by the run's
  step budget, and by the repair-attempt limit for the compute mode.

Useful options: `once: true` advances a single phase (handy for a UI that
renders each step), `model` pins a specific model, and `useMemory: false`
leaves recalled project facts out of the prompt.

Every automated step is checkpointed with the outcome, the model's reasoning
and the model's name, so `GET /runs/$RUN/checkpoints` shows exactly which
decisions were machine-made and which were human:

```
   1  spec_ready                 -> PLAN                     [auto]
   2  plan_ready                 -> AWAITING_PLAN_APPROVAL   [auto]
   3  plan_approved              -> RECON                    [human]
   4  recon_complete             -> IMPLEMENT                [auto]
```

When a run reaches `DONE`, `POST /runs/$RUN/remember` files what it achieved
into project memory, so the next run on that project starts informed.

### Tools: how a run changes anything

Deciding is not doing. Tools are the layer where an agent stops being advisory,
so every call passes six gates in order: the tool must be registered, the
arguments must match its JSON Schema, the kernel policy engine must allow it,
any required approval must exist, the handler runs under a timeout, and the
attempt is recorded either way.

```bash
curl -s http://localhost:3001/api/agent/tools -H "Authorization: Bearer $TOKEN"
```

```
code.file.outline.read   code.outline.read     code.symbol.search
data.csv.query           data.csv.schema.read  fs.file.write
fs.list                  fs.read_file          fs.search
git.branch.create        git.commit.create     git.diff.read
git.patch.file.write     git.status.read       sandbox.test
```

```bash
curl -s -X POST http://localhost:3001/api/agent/tools/invoke \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"tool":"fs.search","args":{"query":"port","extensions":[".ts"]}}'
```

```json
{"outcome":"ok","result":{"hits":[{"path":"src/app.ts","line":1,
 "text":"export const port = 3001;"}]}}
```

#### What it refuses

Tools are confined to a workspace root that is **server configuration**
(`AGENT_WORKSPACE_ROOT`), never a request field — a caller who could name the
root would make every check below meaningless.

```
error   fs.read_file   path "../outside-secret.txt" escapes the workspace.
error   fs.read_file   path "/etc/passwd" escapes the workspace.
denied  host.exec      no tool named "host.exec" is registered.
denied  fs.file.write  connector is missing required scopes: repository:write
```

The confinement check resolves symlinks, so a link inside the workspace
pointing out of it is refused too, and a sibling directory that merely shares a
name prefix (`/work-secrets` next to `/work`) is not a child.

`sandbox.test` spawns without a shell and with a scrubbed environment, so shell
metacharacters are inert and provider keys are not inherited:

```bash
-d '{"tool":"sandbox.test","args":{"command":"echo hi; touch /tmp/PWNED"}}'
```

```json
{"exitCode":0,"stdout":"hi; touch /tmp/PWNED\n"}   # no file was created
```

A write needs the `repository:write` scope; a critical tool additionally needs
an approval, and **the agent cannot supply its own** — an `approvedBy` that is
not the configured approver is refused.

#### The audit trail

Every attempt is a row, refusals included, because "the agent tried to read
/etc/passwd and was stopped" is the event worth seeing:

```bash
curl -s "http://localhost:3001/api/agent/tools/calls?organizationId=acme" \
  -H "Authorization: Bearer $TOKEN"
```

```
ok      fs.search       risk=read
error   fs.read_file    risk=read     path "/etc/passwd" escapes the workspace.
denied  fs.file.write   risk=medium   connector is missing required scopes
ok      fs.file.write   risk=medium
```

Arguments and result previews are redacted before storage, so a secret passed
by mistake does not become a permanent row — while the caller still receives
the real value.

### Joining the two: phases that look before they leap

The driver decides and tools act, but on their own they stay separate — a
phase would answer from the goal and its own history, which is an educated
guess about a repository nobody has read. Pass `useTools` and a phase may
inspect the workspace first:

```bash
curl -s -X POST http://localhost:3001/api/agent/runs/$RUN/advance \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"once":true,"useTools":true,"maxToolCalls":3}'
```

```
ok: True | outcome: clear -> spec_ready | state: PLAN

what it looked at before deciding:
  fs.search {"query":"rate limiting"}   ok=True
     hits: src/server.ts:3  "// NOTE: no rate limiting is configured yet."
  fs.read_file {"path":"src/server.ts"} ok=True
     import express from 'express'; export const app = express(); …
```

The checkpoint records the provenance, so the history says not just what was
decided but what it was decided on:

```
seq 1  spec_ready -> PLAN
   based on: fs.search, fs.read_file
```

#### Autonomy does not grant authority

An unattended phase may only use tools that need **no scope and no approval**,
and that set is *derived* rather than listed: a tool qualifies only if the
policy engine allows it with an empty scope grant and demands no sign-off.
Register a dangerous tool tomorrow and it is excluded automatically.

A phase's own wish list is intersected with that set, so naming a write tool in
the phase table cannot widen what an unsupervised run does. A model that tries
anyway gets told, and still has to decide:

```
fs.file.write   ok=False  "fs.file.write" is not available in this phase.
                          Available: fs.list, fs.read_file, fs.search
sandbox.test    ok=False  "sandbox.test" is not available in this phase.
fs.read_file    ok=False  path "../outside-secret.txt" escapes the workspace.
```

No file was written, no command ran, nothing outside the workspace was read.

Two more things keep the loop bounded. Tool calls are capped per phase
(`maxToolCalls`, default 3): a model that keeps asking runs out of turns and is
then required to answer on what it has. And a malformed `TOOL` line is read as
a final answer rather than retried, so a model cannot spin the loop by
producing broken JSON.

Evidence changes what the model **knows**, never what it may **say**: the
outcome is still parsed against the phase's permitted words, so a model that
reads three files and then demands `deploy_approved` is refused exactly as
before.

### Navigating code without reading all of it

Given only `fs.search`, a run asked to change `calculateTax` greps the name,
gets every call site and import, then reads whole files looking for the one
line that defines it. Most of a context window goes on text nobody needed.

```bash
curl -s -X POST http://localhost:3001/api/agent/tools/invoke \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"tool":"code.symbol.search","args":{"name":"calculateTax"}}'
```

```json
{
  "matches": [{
    "name": "calculateTax", "kind": "function",
    "path": "src/services/billing.ts", "line": 8, "exported": true,
    "signature": "export function calculateTax(invoice: Invoice): number {"
  }],
  "totalMatches": 1, "filesScanned": 2, "indexTruncated": false
}
```

One match: the definition, not the import in `checkout.ts` and not the call
below it. Pass `includeSource: true` to get the first lines of the body with
it, so the caller can verify the hit rather than trust it.

`code.outline.read` gives the whole repository as a map — exported symbols per
file, a few hundred tokens for a codebase — and `code.file.outline.read` gives
one file's structure including private functions and class methods. The usual
order is outline to orient, symbol search to locate, `fs.read_file` to read
only what matters.

**What it is.** A hand-written scanner over declaration syntax, not a
compiler. `typescript` is a devDependency here, so importing it at runtime
would break `npm ci --omit=dev` — a feature that only works on developer
machines is worse than a blunter one that works everywhere. Measured against
the real TypeScript AST it found every one of 6,281 top-level declarations in
this repository, and reports nothing for commented-out code, call sites or
names inside strings.

**What it is not.** It has no semantics: a re-export is not followed, a type
alias is not resolved, and a name assembled at runtime is invisible. It says
`indexTruncated` when a limit stopped the scan, because "not found" in a
truncated index is weaker than "not present".

The index is rebuilt per call and never stored. An index is a cache of the
working tree, and a stale one is worse than none — it sends the agent to a
line number that has moved.

### Asking a spreadsheet a question

A model asked for a total has historically had one option: read the whole CSV
into the prompt and add the numbers up. A file of any size does not fit, and
a language model doing arithmetic over a thousand rows is the least reliable
component in the system. SQLite is exact and costs nothing.

```bash
curl -s -X POST http://localhost:3001/api/agent/tools/invoke \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"tool":"data.csv.schema.read","args":{"path":"sales.csv"}}'
```

```json
{
  "rowCount": 5,
  "columns": [
    { "name": "region",  "original": "Region",  "type": "TEXT" },
    { "name": "units",   "original": "Units",   "type": "INTEGER" },
    { "name": "revenue", "original": "Revenue", "type": "REAL" }
  ]
}
```

`original` is kept so a question phrased in the spreadsheet's own words
("Total Amount") maps to the column name a query can use (`total_amount`).
Then ask:

```bash
curl -s -X POST http://localhost:3001/api/agent/tools/invoke \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"tool":"data.csv.query","args":{
        "path":"sales.csv",
        "sql":"SELECT region, SUM(units) AS units FROM data GROUP BY region"}}'
```

The CSV reader is written here rather than installed — RFC 4180 is small, and
a dependency to parse commas is a poor trade. It handles quoted fields with
embedded commas and newlines, doubled quotes, CRLF and a BOM. A blank numeric
cell becomes `NULL`, never `0`, so an average is not quietly wrong. One
unparseable value makes a whole column `TEXT` rather than silently dropping
the row that contained `N/A`.

**Why a query cannot reach your data.** The CSV is loaded into a *separate*
in-memory SQLite database. The gateway's own `freeapi.db` is never opened by
this code, so `SELECT * FROM api_keys` fails with `no such table` — the
isolation does not depend on getting a filter right.

Writes are stopped by `PRAGMA query_only` inside the engine, so obfuscating a
`DELETE` buys nothing; `statement.readonly` is checked first only to return a
clear message. `SELECT 1; DROP TABLE data` is rejected by the driver, which
refuses any string holding more than one statement.

| Attempt | Result |
|---|---|
| `DELETE FROM data` | refused — read-only |
| `SELECT 1; DROP TABLE data` | refused — more than one statement |
| `ATTACH DATABASE '/path/x.db'` | refused by name (see below) |
| `SELECT * FROM api_keys` | `no such table` — different database |
| `data.csv.query` on `.env` | refused — credential filename |

That third row is worth explaining. `ATTACH DATABASE '/any/file.db'` reports
`readonly === true` and is allowed under `query_only` — it is a file-read
primitive wearing a SELECT's clothes. It is refused by keyword because the
engine's own read-only enforcement does not cover it. That is the only
keyword check here; a long blacklist would mean the defence was in the wrong
layer.

### Credential files are refused, not redacted

Tool output is scrubbed for secrets that match known patterns — an `sk-...`
key, a JWT. That cannot protect a `.env`, whose values are arbitrary:
`INTERNAL_TOKEN=plain_words` matches no pattern at all.

So the read tools refuse by filename:

```bash
curl -s -X POST http://localhost:3001/api/agent/tools/invoke \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"tool":"fs.read_file","args":{"path":".env"}}'
```

```json
{
  "ok": false, "outcome": "error",
  "reason": "refusing to read \".env\": file names of this kind hold credentials. Ask a human for the specific value if the task genuinely needs it."
}
```

`fs.search` skips the same files rather than returning their matching lines,
and the code index never opens them. The list is `SENSITIVE_PATHS` in the
kernel's `redaction.ts` — `.env*`, `id_rsa`, `credentials`, `secrets.y[a]ml`,
`.npmrc`, `.netrc` and friends — imported rather than restated, so adding a
name there covers every read path at once.

This is a read-side rule. Writing such a file is a separate question, left to
the policy engine, which classifies writes by side effect.

### Git: the supervised write path

Reading is safe to do unattended; changing a repository is not. The git tools
are only reachable through an explicit, scoped call — an autonomous phase is
never offered them at all.

```bash
curl -s -X POST http://localhost:3001/api/agent/tools/invoke \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"tool":"git.commit.create","args":{"message":"Add rate limiting"},
       "grantedScopes":["repository:write"]}'
```

#### It cannot commit to main by keeping quiet

The kernel refuses writes to a protected ref, but only when the caller says
which ref is being written — and a model that wants to commit to `main` would
simply not mention `main`. So these tools never take the branch from the
request: `git.commit.create` resolves `HEAD` from the repository and hands the
*real* branch to the policy layer.

```
denied  git.commit.create  direct write to protected ref "main" is forbidden;
                           open a pull request instead
```

Nobody declared a branch there. The repository was on `main`, and that was
enough.

#### The workflow that is allowed

```
ok  git.branch.create     {"branch":"agent/rate-limiting","created":true}
ok  git.patch.file.write  {"applied":true,"summary":"src/server.ts | 3 ++-"}
ok  git.diff.read         {"diff":"…"}
ok  git.commit.create     {"committed":true,"branch":"agent/rate-limiting",
                           "sha":"11be31b","files":["src/server.ts"]}
```

```
11be31b FreeLLMAPI Agent: Add rate limiting to the public API
467bd83 Human: initial commit
```

Agent commits carry their own identity, so `git log` separates them from a
human's forever after. `main` is untouched.

#### Who decides the rules

A control that its own subject can edit is not a control, so the fields
deciding *whether* a call is allowed never come from the request:

| Field | Comes from | Why |
|---|---|---|
| `protectedBranches` | `AGENT_PROTECTED_BRANCHES` (default `main,master`) | A request could otherwise send `[]` and commit to `main`. |
| `approverUserId` | the authenticated session | Otherwise a caller names itself approver and satisfies the gate with no human. |
| `autonomy` | `AGENT_AUTONOMY` (default `supervised`) | A request may *lower* it, never raise it. |
| `workspaceRoot` | `AGENT_WORKSPACE_ROOT` | A caller choosing the root defeats confinement. |
| `organizationId` / `projectId` | checked against `organization_members` | The body may *name* a scope; membership decides whether the caller gets it. |
| `grantedScopes` | `AGENT_GRANTED_SCOPES` (default *empty*) | These are the permissions the deployment *holds*; a caller asserting `repository:write` was previously believed. A request may narrow the set, never extend it. |

Descriptive fields (`privacyLevel`, `disabledCapabilities`) are taken from the
request, because getting those wrong makes a verdict stricter, not looser.

```bash
# Asking nicely does not work:
-d '{"tool":"git.commit.create","args":{"message":"…"},
     "grantedScopes":["repository:write"],
     "policy":{"protectedBranches":[]}}'
```

```
denied  direct write to protected ref "main" is forbidden
```

Scopes work the same way. A write tool is refused until an operator says the
install may write:

```bash
# Nothing is granted by default, so this is refused however it is asked:
-d '{"tool":"git.commit.create","args":{"message":"…"},
     "grantedScopes":["repository:write"]}'
#   denied  connector is missing required scopes: repository:write

# Granting is an operator action, made once, outside the request:
AGENT_GRANTED_SCOPES=repository:write
```

A request that sends `grantedScopes` gets the *intersection* with the grant,
which is a real convenience — a single step can run with less privilege than
the install allows by asking for less, or none at all by sending `[]`.

#### Organisations and projects

Every memory, run and tool call is scoped to an organisation and a project.
Ask what you may act in before acting:

```bash
curl -s localhost:3001/api/agent/organizations -H "Authorization: Bearer $TOKEN"
```

```json
{"organizations":[{"organizationId":"default","name":"Default","role":"owner",
  "projects":[{"projectId":"default","name":"Default project"}]}]}
```

The first account created at setup owns a `default` organisation with a
`default` project, so an existing install keeps working unchanged. An `admin`
or `owner` can add more:

```bash
curl -s -X POST localhost:3001/api/agent/organizations/default/projects \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"projectId":"billing","name":"Billing"}'
```

Naming a scope you are not a member of returns `404`, deliberately identical
to a scope that does not exist:

```
{"error":{"message":"organization \"acme-corp\" was not found."}}
```

Roles rank `viewer < agent < reviewer < developer < admin < owner`. A `viewer`
reads but cannot write. An `agent` writes but cannot create projects or change
membership — an autonomous run should not be able to widen its own access.

#### Inviting someone

There is no open registration route: an install is claimed once at setup, and
an invite is the only way a second account can exist. An `admin` or `owner`
issues one:

```bash
curl -s -X POST localhost:3001/api/agent/organizations/default/invites \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"email":"bob@example.com","role":"developer"}'
```

```json
{"invite":{"inviteId":"inv_…","email":"bob@example.com","role":"developer",
  "expiresAt":1790625052158},
 "token":"2f411fcc…"}
```

The token is shown **once** — only its hash is stored, so a leaked database
cannot be used to redeem outstanding invites. Lost it? Revoke and re-invite.

Bob redeems it without being logged in, because he has no account yet. The
token is the authorisation:

```bash
curl -s -X POST localhost:3001/api/auth/accept-invite \
  -H 'Content-Type: application/json' \
  -d '{"token":"2f411fcc…","password":"a-password-he-chooses"}'
```

He gets a session, an account and the membership in one step. The invite is
single-use, expires in seven days by default, and is bound to the address it
was issued to.

Granting `owner` or `admin` needs the password again:

```bash
-H 'x-reauth-password: your-password'
```

The kernel marks elevated grants `requiresMfa`. This deployment has no MFA, so
re-authentication is the closest honest substitute — weaker, and not a
replacement.

**One property worth understanding:** whoever holds the link claims the seat.
If the invite address has no account yet, redeeming the token *creates* that
account, so the invite must be delivered over a channel you trust. Once the
address does have an account, redeeming requires its password.

| Route | Who |
|---|---|
| `GET /organizations/:org/members` | admin, owner |
| `POST /organizations/:org/invites` | admin, owner (+ re-auth for elevated) |
| `DELETE /organizations/:org/invites/:id` | admin, owner |
| `PATCH /organizations/:org/members/:userId` | admin, owner (kernel rules apply) |
| `DELETE /organizations/:org/members/:userId` | admin, owner — never the last owner |
| `POST /api/auth/accept-invite` | anyone holding a valid token |

### 5b. Documents: retrieval you can check

`runEmbeddings()` could always turn text into vectors. Nothing stored them, so
nothing could be found again. Documents close that loop.

```bash
curl -s -X POST localhost:3001/api/agent/documents \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"organizationId":"default","projectId":"default",
       "title":"Ops notes","sourceUri":"notes/ops.md",
       "content":"The request timeout is 30 seconds by default."}'
```

```json
{"documentId":"doc_…","chunks":1,"family":"gemini-embedding-001","deduplicated":false}
```

Re-sending identical content returns `200` with `"deduplicated": true` instead
of storing it twice, so syncing a folder repeatedly does not multiply every
search result.

Ask a question and get passages back:

```bash
curl -s -X POST localhost:3001/api/agent/documents/search \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"organizationId":"default","projectId":"default",
       "query":"what is the request timeout"}'
```

```json
{"citations":[{"documentId":"doc_…","title":"Ops notes","sourceUri":"notes/ops.md",
  "chunkId":"chk_…","ordinal":0,"startOffset":0,"endOffset":44,
  "text":"The request timeout is 30 seconds by default.","score":0.86}],
 "omitted":0,"tokenEstimate":11}
```

**The offsets are the point.** A retrieval system that returns plausible text
with no checkable source launders a model's guesses into apparent evidence. So
a citation can be re-read from the stored document:

```bash
curl -s "localhost:3001/api/agent/documents/citations/chk_…?organizationId=default&projectId=default" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{"text":"The request timeout is 30 seconds by default.","documentId":"doc_…",
 "title":"Ops notes","matchesStoredChunk":true}
```

`matchesStoredChunk` is false if the chunk text and the source span ever
disagree — in which case believe the document, not the chunk.

**Known limits, so you can judge whether this fits:**

| | |
|---|---|
| Input | Plain text only. No PDF, DOCX or HTML parser. |
| Search | Exact brute-force cosine scan, bounded per project. No ANN index, so expect this to slow down somewhere in the tens of thousands of chunks. |
| Ranking | Embeddings only — no reranker, no keyword or hybrid stage. Recall is whatever your embedding model gives you. |
| Models | Vectors from different families are not comparable, so search filters by family. Changing embedding model means re-ingesting. |

`tokenBudget` (default 2000) caps how much text comes back; anything that
ranked well but did not fit is counted in `omitted`. `minScore` (default 0.2)
discards weak matches rather than padding the answer with noise.

### 5c. Semantic cache: paying once for a reworded question

The response cache hashes the messages, so `"how do I reset my password?"` and
`"how can I reset my password"` are two provider calls for one answer. The
semantic layer lets the second one hit.

```bash
RESPONSE_CACHE=on
SEMANTIC_CACHE=true
```

Both are needed — the semantic layer finds an entry, the response cache owns
it. A hit is labelled so you can tell it apart from an exact one:

```
X-FreeLLM-Cache: HIT-SEMANTIC
X-FreeLLM-Cache-Score: 0.9812
```

**What it refuses is the interesting part.** The request is split in two: the
prompt text, where rewording is meaningful, and everything else — model,
temperature, tools, `response_format`, seed — which becomes a variant key that
must match *exactly*. So:

| Situation | Result |
|---|---|
| Same question, different words | hit |
| Same words, `temperature` changed | miss — different variant |
| Same words, `response_format: json_object` | miss — a JSON request never gets a plain-text answer |
| Different question about the same topic | miss — below the threshold |
| Two stored prompts equally similar | miss — ambiguous, so no guess |
| Streaming request | skipped entirely |
| Message contains an image | skipped — text similarity cannot judge it |

The threshold is `0.95` by default and a winner must beat the runner-up by
`0.02`. Both are deliberately strict: embedding models put genuinely different
questions about one topic at 0.85–0.93, and a wrong cached answer is worse
than a missed saving. Loosen with `SEMANTIC_CACHE_THRESHOLD` if your traffic is
narrow and repetitive.

**It is off by default on purpose.** An exact cache can only ever return the
answer to the question that was asked. This one can return the answer to a
*similar* question, which is a different promise to your users — so enabling it
is a decision, not a default. If the embedding provider is unavailable, lookups
quietly return a miss: a broken optimisation must never break the request.

Approval works the same way: `approvedBy` must match the email on the session
token, so the only way to approve a call is to be logged in as that person.

#### Details that matter

- **Names are load-bearing.** `git.status.read` and `git.diff.read` end in
  `.read` so the kernel classifies them as reads; `git.patch.file.write` ends
  in `.file.write` so it requires `repository:write`. An unrecognised name
  falls to the catch-all — high risk, always approve — which is safe but would
  make routine reads need a human.
- **No credentials.** git runs with prompting disabled and no credential
  helper, so an agent cannot authenticate as the human who installed the
  gateway.
- **No option injection.** Branch names and paths are rejected if they could be
  read as flags, and file lists are passed after `--`.
- **Hooks still run.** `--no-verify` is deliberately not passed: an agent's
  commit faces the same checks a human's would.
- **Patches are checked first.** A patch that does not apply cleanly leaves the
  tree exactly as it was.

Because `git.status.read` and `git.diff.read` are classified as reads, phases
*can* use them as evidence — an agent may look at what has changed before
deciding, while still being unable to change anything itself.

## 6. Memory: what it remembers

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

## 7. Jobs: how it scales

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

**Autonomous phases still cannot change anything.** A run can now branch,
patch and commit — but only through a supervised call carrying a scope. No
phase reaches those tools on its own, by construction rather than convention.
Closing that last gap means letting an approved phase execute a write step,
which is a product decision about how much rope to give an agent, not a
missing mechanism.

**There is no pull request, and no sandbox.** Work stays on a local branch:
nothing pushes, and nothing opens a PR. Commands run as the server user with a
scrubbed environment, not in a container, so this is safe for a repository you
control and not for untrusted code.

**Its judgement is only as good as the model's.** The kernel guarantees the
*shape* of a run: legal transitions, budgets, human gates, a verifiable trail.
It cannot guarantee that a model answering `pass` actually ran your tests. The
structure is trustworthy; the content still needs review.

**Most of the documentation describes plans.** Phases M9–M208 in `agent/docs/`
are marked `designed_only`: billing, sandbox runtime, marketplace and the rest
are specified but not implemented. The 611 kernel tests cover the modules
listed in this guide — nothing more.

Three things that used to be on this list no longer are. **Memory** and the
**job queue** are persisted in SQLite, so facts and in-flight work survive a
restart. And the agent **no longer waits to be told what to do**: `advance`
drives it through your own model pool, stopping only at human gates. See
[memory](#6-memory-what-it-remembers), [jobs](#7-jobs-how-it-scales) and
[autonomy](#the-agent-driving-itself) above.

So today this is useful as: a prompt library you can paste into any model, a
policy/routing/evidence engine you can call before letting an agent do
something irreversible, and a durable memory and work queue to build a real
agent loop on top of.
