# Code review: what is wrong and what is missing

A review of the system as it stands at `008c23c`, written from the position of
someone who has to operate it rather than demo it. Roughly 203,000 lines of
TypeScript across 951 files, 3,782 server tests, 613 agent tests.

Findings are ordered by what I would fix first, and every one of them was
*reproduced* before being written down. Where I guessed and was wrong, that is
recorded too — an audit that only lists confirmed hits is hiding its own error
rate.

---

## 1. Cross-tenant access on runs and jobs — **confirmed, exploitable — now fixed**

**Severity: high.** This is the only finding here that is a live security bug
rather than a gap.

A user in organisation `evil` can read, advance, and cancel a run belonging to
organisation `acme`, and can read and cancel its jobs — including the job
payload. Reproduced end to end against the real Express app with two real
users in two real organisations:

```
POST /api/agent/runs            (user A, org acme)  -> 201  run_…
GET  /api/agent/runs/{id}       (user B, org evil)  -> 200  full run, goal text
POST /api/agent/runs/{id}/step  (user B, org evil)  -> 200  state INTAKE -> PLAN
GET  /api/agent/runs/{id}/checkpoints (user B)      -> 200  full history
GET  /api/agent/jobs/{id}       (user B, org evil)  -> 200  {"secret":"acme-payload"}
POST /api/agent/jobs/{id}/cancel(user B, org evil)  -> 200  cancelled
```

### Why it happens

The tenancy layer is correct and well tested — `services/agent-tenancy.test.ts`
covers non-membership, cross-organisation projects, and the deliberately
ambiguous 404. The bug is that **the runs and jobs routes never call it.**

The evidence that this is an oversight rather than a design decision is in the
same file: `GET /api/agent/runs?organizationId=acme` *does* go through
`resolveScope` and correctly answers `404 organization "acme" was not found`
for the same user in the same test. The list route was secured; the
by-id routes were not.

The underlying reason is that a run id is *unguessable*, so the by-id lookup
feels safe. It is not: ids leak through logs, screenshots, support tickets and
the resumable-runs endpoint, and "you need to know the id" is not an
authorisation model.

Of 52 routes in `routes/agent.ts`, 32 have no tenancy check. Most are
genuinely global (policy evaluation, prompt library), but these need one:

| Route | Leak |
|---|---|
| `GET /runs/:runId` | full goal text, context, state |
| `POST /runs/:runId/step` | mutates another tenant's state machine |
| `POST /runs/:runId/decision` | approves another tenant's gated action |
| `POST /runs/:runId/cancel` | denial of service |
| `POST /runs/:runId/advance` | spends another tenant's budget |
| `GET /runs/:runId/checkpoints` | whole hash-chained history |
| `GET /runs/:runId/verify` | — |
| `POST /runs/:runId/remember` | writes into another tenant's memory |
| `GET /jobs/:jobId` | full payload |
| `POST /jobs/:jobId/complete\|fail\|cancel` | mutates another tenant's queue |
| `GET /tools/calls` | audit log across all tenants |
| `GET /runs/resumable` | run ids across all tenants |

`POST /jobs/claim` is a special case: it is a worker endpoint, and a worker is
not a tenant. It is dealt with in finding 2 rather than here.

### The fix, and why it is not the one I first proposed

My first instinct was to change the service signatures: make `getRun` and
`getJob` require an organisation and filter in SQL, so the *type system* forces
every caller to supply one. I abandoned that after reading the callers.
`agent-driver.ts:322` and `:519` call `getRun` from inside the driver, where
there is no user and no request — the driver is the thing executing the run.
Forcing a scope there would mean inventing a fake one, and a fake scope that
satisfies the compiler is worse than no scope at all: it looks checked.

So the guard went in the route layer instead, but as **one** function rather
than twelve hand-written `if`s — twelve checks is twelve chances to forget the
thirteenth, which is how this happened in the first place:

```ts
function authorizeRecord(req, res, record, what, id, { write } = {}): boolean
```

It collapses three decisions that were previously scattered:

- record missing → `404`
- caller is not a member of `record.organizationId` → **the same `404`**, never
  a `403`. A `403` would confirm the id is real, which hands an attacker an
  oracle for enumerating other tenants' run ids. This matches what
  `resolveScope` already did on the scoped routes.
- `write: true` and the member's role cannot write → `403`. Here the distinction
  is safe: the caller already knows the record exists.

Applied to ten routes: `GET /runs/:id`, `step`, `decision`, `cancel`, `advance`,
`remember`, `checkpoints`, `verify`, `GET /jobs/:id`, `POST /jobs/:id/cancel`.

Two routes were leaking without needing an id at all, and needed different
fixes:

- `GET /runs/resumable` returned every in-flight run on the instance. This was
  the *harvesting* step — it is what made the by-id routes worth attacking. Now
  filtered to the caller's organisations.
- `GET /tools/calls` took `organizationId` as an **optional** query parameter,
  so omitting it returned every tenant's audit trail, redacted argument
  previews included. It is now required and membership-checked.

`POST /jobs/claim`, `/complete` and `/fail` needed a different fix, done
second — see finding 2.

### Why the tests did not catch it

`agent.test.ts` asserts `404s an unknown run rather than inventing one` — a
test for a *nonexistent* id. Nothing asserts a *real id belonging to someone
else*. The tenancy suite tests the tenancy service in isolation, and the route
suite tests the routes without tenancy. Both pass; the integration between
them is untested, and that gap is precisely where the bug lives.

The regression test added with the fix (`/api/agent cross-tenant isolation` in
`agent.test.ts`) is written the other way round: a real run owned by `acme`, a
real session belonging to `rival`, and an assertion on every route the exploit
touched. It also asserts that a refused `step` left the run in `INTAKE` — a
guard that returns `404` *after* mutating is not a guard — and that the owning
tenant can still do all of it, so the fix cannot be "deny everything".

I verified the test actually exercises the guard by mutating
`membershipRole(...) ?? 'owner'` and confirming three tests fail. A green test
that never reaches the code it claims to cover is worse than no test.

---

## 2. The job queue believed the caller's `workerId` — **confirmed, now fixed**

The fix above deliberately skipped three routes, so I went back and attacked
them. `POST /jobs/claim` took a `workerId` in the body and believed it. The
result, reproduced end to end:

```
A (acme) enqueues job, payload {"secret":"acme-only-payload"}
B (rival) POST /jobs/claim {"queue":"run","workerId":"rival-worker"}
    -> 200, count=1, *** PAYLOAD LEAKED ***
B POST /jobs/<id>/fail  {"workerId":"rival-worker","error":"sabotage"}
    -> 200, status=retry_wait, attempts=1
```

Two distinct harms: the payload of another tenant's job is disclosed, and the
attacker can burn the attempt budget with repeated `/fail` calls until the job
dead-letters — a denial of service against work they cannot even see.

### Why the existing lease check did not stop it

`complete` and `fail` already verified that the caller holds the lease, and I
initially read that as sufficient. It is not. The check asks "are you the lease
holder?", and the attacker had made itself the lease holder one call earlier.
A check that validates a state the attacker controls is not a check.

### Why `authorizeRecord` was the wrong fix here

The obvious move — reuse the membership guard from finding 1 — would have been
wrong. A worker *legitimately* handles jobs from every organisation; that is
what a queue runner is. Scoping `claim` to the caller's organisations would
have broken the feature while looking like security.

The queue simply has two kinds of caller, and they need different questions
asked of them:

| | authenticates with | question asked |
|---|---|---|
| tenant (`enqueue`, `GET`, `cancel`) | dashboard session | are you a member of the job's org? |
| worker (`claim`, `complete`, `fail`) | `X-Agent-Worker-Token` | are you a configured worker at all? |

`AGENT_WORKER_TOKENS` holds `workerId:token` pairs. Three decisions worth
naming:

- **Identity comes from the credential that matched, not from the body.** The
  route no longer reads `workerId` from the request at all. This is the same
  rule `agent-policy-context.ts` already states for policy fields: a control
  the subject of the control can edit is not a control.
- **Fail closed.** Unconfigured means `503` and a queue that does not drain,
  not a queue anyone can drain. A missing credential should produce a visible
  outage, not silent exposure.
- **The lease check stays.** Being *a* worker lets you claim; being *the* lease
  holder lets you complete. I verified the second layer still holds by having a
  legitimately credentialled `worker-b` try to complete `worker-a`'s job — it
  gets the same `400 not currently leased` as before. Adding a layer above an
  existing one is a common way to accidentally remove it.

Tokens are compared with the existing `timingSafeStringEqual`, which HMACs both
sides to a fixed length, and the loop does not exit early on a match, so the
response time reveals neither which token matched nor how many are configured.

27 tests cover this (21 on the parser and matcher, 6 on the routes), including
one asserting that a rejected `/fail` left `attempts` unchanged — a guard that
refuses *after* the side effect is not a guard. Both halves were
mutation-verified: making an unknown token resolve to the first configured
worker kills 8 tests; making the unconfigured case fail open kills 1.

### What is still not covered

There is no rate limit specific to `claim`, so a leaked worker token is worth
more than it should be. Worker credentials are also static and per-process;
rotation means an env change and a restart of the *worker*, not the server.
Both are acceptable for a single-operator deployment and both should be
revisited before this is multi-operator.

---

## 3. Five high-severity advisories in production dependencies

`npm audit --omit=dev` reports 9 vulnerabilities, 5 high. Two are on live
request paths:

- **`multer`** — DoS via crafted multipart request. Reachable at
  `routes/keys.ts:42` (key file upload) and `routes/proxy.ts:10`.
- **`sharp`** — libheif vulnerabilities. Reachable via
  `lib/image-normalize.ts`, i.e. any request carrying an image.

`js-yaml`, `fast-uri` and `browserslist` are the others. None is theoretical:
all five sit in the dependency tree of a running server.

There is no automated dependency scanning in CI. `.github/workflows/ci.yml`
runs migrations, tests, lint and build — all good — but nothing fails the
build when a dependency picks up a known CVE, so this will recur.

---

## 4. `routes/proxy.ts` is 2,975 lines

The largest file in the repository, and the one every request passes through.
It holds routing, caching (exact and semantic), streaming, retries, budget
accounting, analytics and error classification.

This is not a style complaint. It has a measurable cost: when I added the
semantic cache, the change had to be threaded through three separate points in
this file, and the only way to know they were the right three was to read most
of it. The next person will pay that cost again.

The natural seams are already visible in the code — the cache block, the
fallback loop, the stream pipeline — and `lib/fallback-loop.ts` shows the
extraction pattern already works.

Related: `services/router.ts` (2,326) and `routes/agent.ts` (1,835). The agent
router is where finding 1 hides; at that length, "is every route scoped?" is
not answerable by reading.

---

## 5. Capability gaps, honestly ranked

From the 500-item review in `02-capability-audit.md`, now ~171 built. The gaps
that actually block real use, rather than the ones that are simply unticked:

**Browser automation (196–220, 0 of 25).** No Playwright, no Puppeteer, no
browser dependency at all. This is the largest single hole: any task involving
a web UI — scraping, form filling, visual verification — is impossible, not
merely awkward. It is also the most expensive to close, needing a new
dependency, a browser binary, and a sandboxing story.

**No PR creation (item ~180).** The agent can branch, patch and commit, and
then stops. The last step of the workflow everyone actually wants is missing,
and it is small: `gh` is already available.

**No execution sandbox.** `sandbox.test` runs the project's test command as the
server user, with no container, namespace or seccomp. It is argv-form with no
shell, and provider keys are stripped — both good — but an agent that can write
a file and run the test command can run arbitrary code as the server. The
policy engine gates *which tools* run, not *what a tool may do to the host*.
Nothing here can fix that; it needs a real isolation boundary.

**Connectors (231–245, 0 of 15).** No CRM, email or calendar integration. Less
interesting than it sounds — these are mostly API-client work — but genuinely
absent.

**Excel.** `data.csv.query` handles CSV. `.xlsx` is a zip of XML and needs a
parser; business users will ask for it immediately.

**Observability.** No OpenTelemetry in the lockfile. There is structured
logging and request analytics, but no distributed tracing, so a slow agent run
cannot be attributed to a phase or a provider call without reading logs by
hand.

---

## 6. What is genuinely good

A review that only lists faults gives a false picture of where the risk is.

- **Zero `@ts-ignore` / `@ts-expect-error`** in server source. In 200k lines
  that is unusual and it means the type system is load-bearing rather than
  decorative.
- **Fail-closed policy engine.** An unrecognised tool name is classified
  high-risk rather than waved through. I hit this myself — it silently
  filtered out three tools I had misnamed — and it was right to.
- **Sessions are hashed at rest** and looked up by hash, so a database read
  does not yield usable tokens.
- **Brute-force lockout** on login, plus IP rate limiters on both the proxy
  and admin surfaces.
- **CI pins actions by SHA**, not by tag — that defends against a tag being
  moved under you, and most repositories do not bother.
- **Migrations are registered in two places and a test enforces it**, so a
  migration cannot silently not run.
- **The tenancy service itself is well designed**, including the ambiguous 404
  that avoids confirming whether an organisation exists. Finding 1 is a wiring
  failure, not a design failure.

---

## 7. Things I suspected and was wrong about

Recorded so the next reviewer does not spend time here again.

- **`custom-endpoint.ts:114` compares a secret with `===`.** It looked like a
  timing-attack surface. It is not an authentication path — it deduplicates a
  key the caller already supplied. No issue.
- **32 SQL statements touch tenant tables without an `organization_id`
  filter.** Most are keyed by an unguessable id *and* called from a scoped
  route, or are worker-level queue operations that are correctly global. The
  subset that matters is in finding 1.
- **No `timingSafeEqual` on session tokens.** Correct and intentional: tokens
  are SHA-256 hashed and looked up by hash, so there is no byte-by-byte
  comparison to attack.

---

## Recommended order

1. ~~**Fix cross-tenant run/job access**~~ — **done.** Twelve routes guarded,
   regression test added, mutation-verified. See finding 1.
2. ~~**Authenticate the worker endpoints**~~ — **done.** Worker credentials,
   fail-closed, mutation-verified. See finding 2.
3. **Add `npm audit` to CI and patch the five high advisories** — known CVEs
   on live request paths. This is now the top open item.
4. **Add PR creation** — small, and completes the coding workflow.
5. **Split `proxy.ts`** — pay down the cost before it compounds further.
6. **Browser automation** — the largest capability gap, and a project rather
   than a task.
