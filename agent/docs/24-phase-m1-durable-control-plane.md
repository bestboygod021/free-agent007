# فاز بعدی: M1 Durable Control Plane

**نام فاز:** M1.2 — Durable Persistence، Queue و Worker محصولی
**وضعیت:** `designed_only`
**مدت پیشنهادی:** سه اسپرینت یک‌هفته‌ای، بدون موازی‌سازی ناامن
**پیش‌نیاز:** Reference Queue، Worker Boundary، Prisma DDL/RLS reference، Tenant Context
**منبع وضعیت Proposalها:** `docs/upgrade-register.json` و قراردادهای `docs/23-upgrade-contracts.md`

این فاز فاصله بین reference implementation و اجرای durable را می‌بندد. هدف آن
«اضافه‌کردن چند worker و ادعای production» نیست؛ هدف این است که یک Run ساده از
API تا persistence، queue، worker، lease، event و audit با failure قابل‌بازپخش
حرکت کند و هر مرز با test و evidence واقعی تأیید شود.

---

## ۱. نتیجه‌ای که این فاز باید تحویل دهد

در پایان فاز باید این جریان end-to-end وجود داشته باشد:

```text
Authenticated request
  → authenticated TenantContext
  → PostgreSQL transaction with transaction-local RLS
  → Run + Task + Outbox record
  → commit
  → durable queue delivery
  → worker claim with lease
  → policy decision
  → sandbox/executor boundary
  → task result + usage + audit + event transaction
  → idempotent completion
  → SSE/API projection
```

ویژگی‌های غیرقابل مذاکره:

1. Queue فقط envelope معتبر را ذخیره می‌کند و هیچ handler یا کد غیرقابل‌اعتمادی اجرا نمی‌کند.
2. Redis/BullMQ فقط delivery و scheduling را بر عهده دارد؛ PostgreSQL منبع حقیقت وضعیت durable است.
3. هر transaction قبل از query tenant setting را با پارامتر تنظیم می‌کند.
4. هیچ side effect خارجی بدون idempotency key، policy verdict و audit انجام نمی‌شود.
5. اجرای کد تولیدشده یا repository فقط از Sandbox/Executor مجاز است.
6. raw password، raw provider key و secret در job payload، log، event یا database ذخیره نمی‌شود.
7. CAPTCHA/MFA bypass، ساخت انبوه حساب، push مستقیم به `main` و deploy بدون approval ممنوع است.

---

## ۲. محدوده و خارج از محدوده

### در محدوده

| حوزه | خروجی این فاز |
|---|---|
| Persistence | Prisma client adapter با transaction و tenant context |
| Migration | migration سوم برای job، lease، outbox و indexهای عملیاتی |
| RLS | اجرای واقعی policy روی PostgreSQL test database |
| Queue | `DurableQueueAdapter` برای Redis/BullMQ با envelope versioned |
| Worker | supervisor با claim، heartbeat، drain، retry، DLQ و graceful shutdown |
| Event | outbox transaction و publisher قابل replay |
| API | اتصال create/cancel Run به persistence و queue، بدون اجرای handler در API |
| Observability | metricهای queue lag، lease age، retry، DLQ و Run latency |
| Verification | integration، crash، cross-tenant، idempotency و end-to-end evidence |

### خارج از محدوده

- ساخت Web App کامل
- اجرای production sandbox واقعی بر پایه microVM
- multi-region و failover بین regionها
- پرداخت نهایی و payment provider
- OAuth/OIDC کامل و MFA enrollment محصولی
- اجرای مستقیم tool در API یا Queue Domain
- ادعای availability production بدون اجرای PostgreSQL و Redis واقعی

---

## ۳. معماری مرجع

```text
                    ┌──────────────────────┐
                    │  Control API         │
                    │  auth + policy       │
                    └──────────┬───────────┘
                               │ transaction
                               ▼
                    ┌──────────────────────┐
                    │ PostgreSQL           │
                    │ Run/Task/Job/Outbox  │
                    │ RLS + audit          │
                    └───────┬───────┬──────┘
                            │       │ after commit
                 projection │       ▼
                            │  ┌──────────────┐
                            │  │ Redis/BullMQ │
                            │  │ delivery     │
                            │  └──────┬───────┘
                            │         │ claim/heartbeat
                            ▼         ▼
                    ┌──────────────────────┐
                    │ Worker Supervisor    │
                    │ no authority upgrade │
                    └──────────┬───────────┘
                               │ approved envelope only
                               ▼
                    ┌──────────────────────┐
                    │ Sandbox / Executor   │
                    │ untrusted code only  │
                    └──────────────────────┘
```

### منبع حقیقت

- **PostgreSQL:** وضعیت durable، tenant boundary، AuditLog، Outbox، job attempt و نتیجه.
- **Redis/BullMQ:** صف delivery، visibility timeout، priority و wake-up. Redis نباید تنها محل وضعیت Run باشد.
- **SSE projection:** read model است و authority ایجاد یا تغییر نمی‌دهد.
- **Worker memory:** فقط context کوتاه‌عمر اجرای یک envelope است و پس از پایان قابل اتکا نیست.

### ترتیب commit و enqueue

API نباید قبل از commit موفق PostgreSQL job را در Redis قرار دهد. الگوی اجباری:

1. `BEGIN`
2. `set_config('app.organization_id', $1, true)`
3. درج Run، Task، `queue_jobs` و `outbox_events`
4. `COMMIT`
5. publisher، outbox را به Redis/BullMQ ارسال می‌کند.
6. consumer پس از claim، `queue_jobs` را با همان lease در PostgreSQL به‌روزرسانی می‌کند.

اگر process بین مرحله ۴ و ۵ بمیرد، outbox scanner پیام را دوباره publish می‌کند.
اگر Redis پیام را duplicate کند، unique idempotency key و compare-and-set در
PostgreSQL از اجرای دوباره side effect جلوگیری می‌کند.

---

## ۴. قرارداد داده جدید

### ۴.۱ `queue_jobs`

```text
id                 TEXT PRIMARY KEY
organization_id    TEXT NOT NULL
run_id             TEXT NULL
queue              TEXT NOT NULL          -- run | model | tool | benchmark
job_id             TEXT NOT NULL UNIQUE
idempotency_key    TEXT NOT NULL
payload_hash       TEXT NOT NULL
payload            JSONB NOT NULL         -- envelope، بدون secret خام
status             TEXT NOT NULL          -- queued | running | retry_wait | completed | dead_letter | cancelled
priority           INTEGER NOT NULL
attempts           INTEGER NOT NULL DEFAULT 0
max_attempts       INTEGER NOT NULL
available_at       TIMESTAMPTZ NOT NULL
lease_expires_at   TIMESTAMPTZ NULL
worker_id          TEXT NULL
last_error         TEXT NULL              -- redacted و محدود به 2,000 کاراکتر
created_at         TIMESTAMPTZ NOT NULL
updated_at         TIMESTAMPTZ NOT NULL
completed_at       TIMESTAMPTZ NULL
UNIQUE (queue, organization_id, idempotency_key)
```

قواعد:

- `payload_hash` با canonical JSON محاسبه می‌شود.
- reuse همان `(queue, organization_id, idempotency_key)` با payload متفاوت خطا است.
- job payload فقط reference به artifact، connector و secret دارد؛ value secret ممنوع است.
- `status=completed` تغییرناپذیر است مگر یک repair/audit command صریح با approval.
- `attempts` هر بار claim موفق یک واحد افزایش می‌یابد.

### ۴.۲ `worker_leases`

```text
job_id             TEXT PRIMARY KEY REFERENCES queue_jobs(id)
organization_id    TEXT NOT NULL
worker_id          TEXT NOT NULL
lease_token_hash   TEXT NOT NULL
leased_at          TIMESTAMPTZ NOT NULL
expires_at         TIMESTAMPTZ NOT NULL
last_heartbeat_at  TIMESTAMPTZ NOT NULL
released_at        TIMESTAMPTZ NULL
```

توکن خام lease ذخیره نمی‌شود؛ فقط hash آن ثبت می‌شود. `worker_id` هویت
process است و authority سازمانی ایجاد نمی‌کند.

### ۴.۳ `outbox_events`

```text
id                 TEXT PRIMARY KEY
organization_id    TEXT NOT NULL
aggregate_type     TEXT NOT NULL
aggregate_id       TEXT NOT NULL
event_id           TEXT NOT NULL UNIQUE
schema_version     INTEGER NOT NULL
payload            JSONB NOT NULL
published_at       TIMESTAMPTZ NULL
attempts           INTEGER NOT NULL DEFAULT 0
next_attempt_at    TIMESTAMPTZ NOT NULL
last_error         TEXT NULL
created_at         TIMESTAMPTZ NOT NULL
```

Outbox payload باید redacted باشد. publisher حق تغییر state یا اجرای handler
ندارد؛ فقط publish و mark-published انجام می‌دهد.

---

## ۵. Interfaceهای TypeScript

### ۵.۱ `DurableQueueAdapter`

```ts
interface DurableQueueAdapter<TEnvelope> {
  enqueue(input: EnqueueInput<TEnvelope>): Promise<EnqueueReceipt>;
  claim(input: ClaimInput): Promise<ClaimedEnvelope<TEnvelope> | null>;
  heartbeat(input: LeaseInput): Promise<LeaseReceipt>;
  complete(input: CompleteInput): Promise<CompletionReceipt>;
  fail(input: FailInput): Promise<RetryOrDeadLetterReceipt>;
  cancel(input: CancelInput): Promise<CancelReceipt>;
  reclaimExpired(input: ReclaimInput): Promise<ReclaimReceipt[]>;
  stats(input: QueueStatsInput): Promise<DurableQueueStats>;
}
```

الزامات implementation:

- `claim` باید atomic باشد؛ دو worker نباید یک lease معتبر هم‌زمان بگیرند.
- `heartbeat` باید compare-and-set روی `lease_token_hash` و `worker_id` انجام دهد.
- `complete` فقط برای lease معتبر و status=`running` مجاز است.
- `fail` باید backoff را deterministic و سقف‌دار اعمال کند.
- `reclaimExpired` نباید job completed را به retry برگرداند.
- همه mutationها باید organization scope و audit event داشته باشند.

### ۵.۲ `WorkerSupervisor`

```ts
interface WorkerSupervisor<TEnvelope> {
  start(): Promise<void>;
  pollOnce(signal: AbortSignal): Promise<WorkerPollResult>;
  drain(deadline: Date): Promise<DrainResult>;
  stop(reason: string): Promise<void>;
  health(): WorkerHealth;
}
```

`pollOnce` فقط پس از validation envelope، tenant context و policy verdict آن را
به `JobExecutor` می‌دهد. `JobExecutor` باید contract زیر را رعایت کند:

```ts
interface JobExecutor<TEnvelope, TResult> {
  execute(input: {
    envelope: TEnvelope;
    tenant: TenantContext;
    signal: AbortSignal;
  }): Promise<TResult>;
}
```

در production، برای `tool`، `benchmark` و هر task حاوی کد غیرقابل‌اعتماد، executor
باید Sandbox handle بگیرد. handler مستقیم Node process یا database credentials
دریافت نمی‌کند.

---

## ۶. Redis/BullMQ adapter design

### Key و prefix

```text
FORGEPILOT_REDIS_PREFIX=forgepilot:{environment}
queue key:   {prefix}:queue:{queue}:wait
job key:     {prefix}:job:{jobId}
lease key:   {prefix}:lease:{jobId}
outbox lock: {prefix}:outbox:publisher
```

- prefix حتماً environment-aware است تا staging و production مخلوط نشوند.
- payload بزرگ در Redis ذخیره نمی‌شود؛ envelope به artifact reference اشاره می‌کند.
- TTL روی lockها اجباری است؛ lock بدون expiry ممنوع.
- Redis credential از environment secret manager می‌آید و در config، log یا event چاپ نمی‌شود.

### atomicity

BullMQ delivery ممکن است duplicate، delayed یا out-of-order باشد. adapter باید:

1. job را در PostgreSQL با idempotency key reserve کند.
2. Redis enqueue را بعد از commit و از outbox انجام دهد.
3. claim را با lock/lease atomic انجام دهد.
4. نتیجه را ابتدا در PostgreSQL ثبت و سپس delivery acknowledgment کند.
5. در crash بعد از result و قبل از ack، duplicate را با compare-and-set بی‌اثر کند.

### retry و DLQ

| وضعیت | اقدام |
|---|---|
| network timeout | retry با exponential backoff و jitter محدود |
| validation error | بدون retry، `dead_letter` با reason code |
| policy denied | بدون retry؛ Audit و user-visible denial |
| provider 429 | retry پس از `Retry-After` با سقف budget |
| sandbox violation | توقف task، quarantine artifact، نیازمند review |
| lease timeout | reclaim؛ افزایش attempts؛ در سقف retry → DLQ |
| database serialization conflict | retry transaction محدود و قابل اندازه‌گیری |

هیچ retry نباید CAPTCHA/MFA را دوباره دور بزند یا external write را بدون
idempotency دوباره اجرا کند.

---

## ۷. اجرای transaction و RLS

تمام repository adapterها باید یک API شبیه این داشته باشند:

```ts
await db.transaction(async (tx) => {
  await tx.setTenantContext(tenantContext);
  const run = await tx.run.create(input);
  await tx.queueJob.create({
    organizationId: tenantContext.organizationId,
    payloadHash,
    idempotencyKey,
  });
  await tx.outbox.create(event);
});
```

قواعد:

- `setTenantContext` اولین database operation در transaction است.
- tenant ID از session/auth membership می‌آید، نه از `projectId` یا body.
- repository متد global مثل `findAllRuns()` بدون organization scope ندارد.
- break-glass role فقط برای migration/incident و خارج از runtime role است.
- application role حق `BYPASSRLS` ندارد.
- هر query cross-tenant در integration test باید با `42501` یا نتیجه خالی fail شود.

---

## ۸. lifecycle Worker

### شروع

1. process با `workerId` یکتا و environment ثبت می‌شود.
2. readiness فقط پس از اتصال Redis، PostgreSQL و health policy اعلام می‌شود.
3. supervisor queueهای مجاز خود را از config signed می‌خواند.
4. worker هیچ queue خارج از allowlist tenant/platform را claim نمی‌کند.

### اجرای job

1. claim atomic.
2. load job از PostgreSQL و تطبیق payload hash.
3. verify tenant، policy، budget و status.
4. ایجاد lease و heartbeat.
5. اجرای handler در executor/sandbox مناسب.
6. ثبت result، usage، audit و event در یک transaction.
7. complete durable job.
8. publish notification بعد از commit.

### shutdown

- `SIGTERM` حالت draining می‌گیرد.
- job جدید claim نمی‌شود.
- job در حال اجرا تا deadline heartbeat می‌گیرد.
- پس از deadline، lease آزاد یا reclaim می‌شود؛ process حق mark کردن job دیگری را ندارد.
- shutdown موفق فقط با evidence از `drained= true` یا `reclaimed_count` گزارش می‌شود.

---

## ۹. Observability و capacity

Metricهای اجباری:

- `queue_depth{queue,organization_tier}`
- `queue_lag_seconds{queue}`
- `job_attempts_total{queue,status}`
- `lease_expired_total{queue}`
- `worker_active_jobs{worker,queue}`
- `dead_letter_total{queue,reason}`
- `outbox_publish_lag_seconds`
- `run_time_to_first_event_seconds`
- `run_completion_seconds`
- `tenant_rls_denied_total`

هیچ metric نباید user request، secret، token، prompt خام یا repository content را
label کند. cardinality با `organization_tier` محدود می‌شود، نه `organization_id` خام.

ظرفیت اولیه برای benchmark:

```text
arrival_rate = run_per_minute
service_rate = completed_job_per_minute_per_worker
required_workers = ceil(arrival_rate / service_rate * 1.5)
queue_saturation = queue_depth / max_queue_depth
```

هر autoscaling یا افزایش concurrency باید با budget، provider quota و mode
محاسباتی انتخاب‌شده سازگار باشد. local mode نباید با scale-out cloud تغییر کند.

---

## ۱۰. برنامه اجرای سه اسپرینت

### Sprint A — Persistence و migration gate

- افزودن مدل‌های `queue_jobs`، `worker_leases` و `outbox_events` به Prisma
- migration append-only بعدی
- repository transaction با `TenantContext`
- PostgreSQL test database و اجرای واقعی migration
- integration test برای RLS، parent mismatch و append-only audit/event
- status هدف: `partial` برای UP-003، UP-004 و UP-010 حفظ می‌شود تا اجرای واقعی ثبت شود.

### Sprint B — Durable Queue و Worker Supervisor

- افزودن `DurableQueueAdapter`
- adapter Redis/BullMQ با prefix، lease و retry policy
- outbox publisher و reconciliation scanner
- graceful shutdown و heartbeat
- worker health/readiness و metrics
- test crash در چهار نقطه: قبل از claim، بعد از claim، بعد از result، قبل از ack

### Sprint C — End-to-End و hardening

- اتصال API create/cancel Run
- اجرای یک task واقعی در Sandbox reference
- test دو tenant هم‌زمان
- load test با quota و budget
- DLQ replay با approval
- restore و replay evidence
- ثبت Evidence در `docs/gap-register.json` و `docs/upgrade-register.json`

---

## ۱۱. ماتریس تهدید و کنترل

| تهدید | مسیر حمله | کنترل اجباری | تست |
|---|---|---|---|
| cross-tenant read | connection pool با setting قدیمی | transaction-local RLS + reset | tenant A/B integration |
| cross-tenant write | parent ID معتبر ولی org جعلی | same-org trigger + RLS WITH CHECK | SQL negative test |
| duplicate side effect | crash بعد از provider write | idempotency key + result CAS | crash/replay test |
| Redis poisoning | job payload دست‌کاری‌شده | payload hash + DB source of truth | tamper fixture |
| lease theft | worker دیگر heartbeat/complete می‌کند | lease token hash + worker ID CAS | ownership test |
| poison job | validation یا sandbox error دائمی | reason code + DLQ | retry ceiling test |
| secret leakage | secret در payload/log/metric | SecretReference، redaction، label policy | grep/redaction test |
| authority injection | README/Issue محتوای untrusted می‌فرستد | policy قبل از executor | injection fixture |
| shutdown loss | SIGTERM وسط job | drain، heartbeat، reclaim | supervisor crash test |
| quota bypass | retry بدون budget | preflight reservation + hard stop | concurrent budget test |

---

## ۱۲. Test plan و Evidence قابل قبول

### Unit

- key/prefix و canonical payload hash
- backoff، jitter سقف‌دار و retry classification
- state transition و monotonic attempts
- TenantContext و SQL command
- worker ownership و heartbeat

### PostgreSQL integration

- اجرای migration از database خالی
- اجرای migration دوم پس از migration اول
- `SET LOCAL` در transaction و reset بعد از commit
- select/insert/update/delete برای دو organization
- trigger parent-child mismatch
- append-only AuditLog و SystemEvent
- rollback transaction و outbox consistency

### Redis/BullMQ integration

- priority و concurrency
- duplicate delivery
- worker crash و lease reclaim
- delayed retry و DLQ
- prefix isolation بین environmentها
- publisher دوباره‌فرستادن outbox بدون duplicate event

### End-to-end

سناریوی اصلی:

```text
login/session
→ create project
→ create Run with idempotency key
→ commit queue_jobs + outbox
→ publish
→ worker claim
→ heartbeat
→ sandbox task
→ persist result + usage + audit
→ complete
→ API/SSE replay
```

Evidence معتبر فقط شامل خروجی واقعی migration، log redacted worker، query result
دو tenant، test report و artifact hash است. متن مدل یا snapshot دستی Evidence نیست.

---

## ۱۳. Definition of Done فاز

فاز فقط وقتی `partial` به milestone بعدی می‌رود که همه موارد زیر برقرار باشند:

- [ ] migrationها روی PostgreSQL خالی واقعاً اجرا شده‌اند.
- [ ] `prisma validate` و migration drift در CI اجرا می‌شوند.
- [ ] application runtime role `BYPASSRLS` ندارد.
- [ ] cross-tenant read/write integration test fail می‌شود.
- [ ] `queue_jobs`، lease و outbox در PostgreSQL durable هستند.
- [ ] Redis/BullMQ adapter atomic claim، heartbeat، retry و DLQ دارد.
- [ ] API فقط بعد از commit موفق enqueue می‌کند.
- [ ] outbox publisher crash-safe و replay-safe است.
- [ ] Worker supervisor graceful shutdown و reclaim دارد.
- [ ] هیچ handler در Queue Domain اجرا نمی‌شود.
- [ ] tool/benchmark code فقط در Sandbox/Executor اجرا می‌شود.
- [ ] raw password، provider key و secret در payload/log/metric دیده نمی‌شود.
- [ ] idempotency برای external write با crash test اثبات شده است.
- [ ] budget، compute mode، quota و privacy قبل از provider call اعمال می‌شوند.
- [ ] evidence واقعی در gap و upgrade register ثبت شده است.

**وضعیت فعلی:** این سند طراحی فاز است؛ تا قبل از اجرای موارد بالا، Redis/BullMQ،
PostgreSQL و Worker محصولی `done_tested` اعلام نمی‌شوند.
