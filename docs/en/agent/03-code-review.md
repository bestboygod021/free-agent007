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
not a tenant. It should be authenticated as a worker rather than scoped to an
organisation, which is a different fix.

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

`POST /jobs/claim`, `/complete` and `/fail` are deliberately left alone. They
are worker endpoints, not tenant endpoints — a worker legitimately claims jobs
across organisations. They need *worker* authentication, which is a separate
piece of work and is listed in the gaps below rather than papered over here.

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

## 2. Five high-severity advisories in production dependencies

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

## 3. `routes/proxy.ts` is 2,975 lines

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

## 4. Capability gaps, honestly ranked

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

## 5. What is genuinely good

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

## 6. Things I suspected and was wrong about

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
2. **Authenticate the worker endpoints** (`/jobs/claim`, `/complete`, `/fail`).
   These were scoped out of the fix above because they are not tenant routes,
   but right now any authenticated user can claim another tenant's job and read
   its payload through the claim response. This is the remaining half of
   finding 1 and it needs a worker identity, not a membership check.
3. **Add `npm audit` to CI and patch the five high advisories** — known CVEs
   on live request paths.
4. **Add PR creation** — small, and completes the coding workflow.
5. **Split `proxy.ts`** — pay down the cost before it compounds further.
6. **Browser automation** — the largest capability gap, and a project rather
   than a task.
