# فاز M65: Durable Persistence، RLS، Outbox و Job Leases

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-DA-03`، `GAP-DA-04`، `GAP-DA-05`، `GAP-OB-01`، `GAP-EX-09`
**کد kernel:** `src/core/durable-persistence-runtime.ts`
**تست:** `test/next-platform-integration-phases.test.ts`

## هدف و مرز

M65 مرز process-local kernelها را به durable transaction، tenant RLS، optimistic version،
outbox و worker lease تبدیل می‌کند. transaction باید قابل retry و idempotent باشد، event باید
پس از commit به outbox برود و job باید lease/version داشته باشد. این فاز PostgreSQL، Prisma
migration، RLS policy، queue، event store یا worker واقعی را اجرا نمی‌کند.

## معماری

`DurableTransactionRequest` entity، operation، isolation، RLS tenant context، idempotency و
expected version را حمل می‌کند. `DurableOutboxEvent` به transaction/aggregate/sequence و
payload hash متصل است. `DurableJobLease` worker، lease version، expiry، attempts و payload
hash دارد تا دو worker هم‌زمان job را اجرا نکنند. event sequence فقط در aggregate و tenant
خود monotonic است.

## قراردادهای اصلی

- `validateDurableTransaction` RLS، isolation، idempotency، version و delete approval را gate می‌کند.
- `validateDurableOutboxEvent` payload، sequence، attempts و published state را بررسی می‌کند.
- `decideDurableJobLease` worker ownership، expiry، attempt و lease version را enforce می‌کند.
- `advanceOutboxSequence` scope، sequence increment و duplicate event را validate می‌کند.

## sprintها

### Sprint A — Database Foundation

- PostgreSQL schema و migration
- organization/project/run RLS
- optimistic version و transaction boundary
- seed/fixture برای توسعه

### Sprint B — Event Bus

- transactional outbox
- publisher و consumer cursor
- dedupe و retry
- dead-letter و replay

### Sprint C — Durable Jobs

- queue/worker lease
- heartbeat و expiry
- attempt/backoff
- cleanup و job recovery

### Sprint D — Search و Analytics

- event store و retention
- full-text projection
- dashboard read model
- restore/replay drill

## Threat Model

- **Cross-tenant row leak:** هر transaction باید RLS tenant context داشته باشد؛ query بدون scope اجرا نمی‌شود.
- **Lost event:** business write بدون transactional outbox پذیرفته نیست؛ payload hash و sequence ثبت می‌شود.
- **Double execution:** lease version، worker ownership و idempotency جلوی دو اجرا را می‌گیرند.
- **Delete abuse:** delete transaction نیازمند approval و audit است.
- **Replay corruption:** sequence monotonic، duplicate event و stale version رد می‌شوند.

## Prompt pack

### `m65-durable-persistence-engineer`

```text
نقش: Durable Persistence Engineer

هر write را با organization/RLS، transaction ID، isolation، idempotency و expected version
انجام بده. event را در همان transaction به outbox بنویس. worker فقط lease معتبر و version
متناسب دارد. sequence را monotonic نگه دار و duplicate/replay را fail-closed کن.
```

### `m65-persistence-evidence-gate`

```text
نقش: Persistence Evidence Gate

برای RLS denial، transaction retry، optimistic conflict، outbox publish، duplicate event،
lease expiry، worker recovery و replay، SQL output، transaction trace، event hash، command و
exit code ثبت کن. in-memory store یا unit test جای PostgreSQL/queue evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای RLS context، transaction، idempotency، version، outbox sequence و lease.
- PostgreSQL/RLS، migration، queue، event bus، worker، retry و restore/replay باید integration شوند.
- durable contract به‌تنهایی durability، no-loss event یا exactly-once execution production را ثابت نمی‌کند و `done_tested` نیست.
