# فاز M119: Durable Tenant، Transaction و RLS Runtime

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-DA-01`، `GAP-DA-03`، `GAP-SE-10`، `GAP-IG-07`، `GAP-EX-09`
**کد kernel:** `src/core/durable-tenant-runtime.ts`
**تست:** `test/next-hardening-phases.test.ts`

## هدف و مرز

M119 transaction envelope، tenant-bound RLS probe، migration safety و transactional outbox را
formalize می‌کند. write باید idempotent، isolation-aware و write-set دار باشد. RLS باید select/
insert/update/delete و parameter binding را با دو tenant اثبات کند. migration باید dry-run، backup،
lock، no-clobber و down test داشته باشد. این فاز PostgreSQL/RLS deployment، Prisma migration
runner، durable outbox، transaction manager یا distributed lock واقعی را اجرا نمی‌کند.

## معماری

`M119TransactionEnvelope` actor/request/idempotency، isolation، tenant binding و write-set را ثبت
می‌کند. `M119RlsEvidence` جدول/policy و چهار denial probe را نگه می‌دارد. `M119MigrationRequest`
version، action، dry-run، backup، lock، approval و rollback test را gate می‌کند.
`M119OutboxRecord` aggregate، transaction، payload hash، attempts و redaction را جمع می‌کند.

## قراردادهای اصلی

- `validateM119Transaction`: tenant binding، isolation، idempotency و commit/rollback را بررسی می‌کند.
- `validateM119RlsEvidence`: چهار عملیات cross-tenant denial و parameter binding را validate می‌کند.
- `decideM119Migration`: version، dry-run، backup، lock، no-clobber و approval را gate می‌کند.
- `validateM119Outbox`: transaction link، payload redaction، attempts و idempotency را enforce می‌کند.

## sprintها

### Sprint A — Transactions

- tenant context
- isolation level
- write-set/version
- idempotent commit

### Sprint B — RLS

- policy per table
- cross-tenant probes
- parameter binding
- cache boundary

### Sprint C — Migrations

- plan/dry-run/apply/rollback
- backup و lock
- down migration
- no-clobber

### Sprint D — Outbox

- transactional event
- retry/dedupe
- payload redaction
- delivery watermark

## Threat Model

- **Cross-tenant read/write:** هر چهار SQL operation با دو tenant probe می‌شوند.
- **Partial commit:** transaction envelope و outbox link باید یکسان باشند.
- **Destructive migration:** backup، dry-run، lock و rollback evidence لازم است.
- **Duplicate event:** idempotency و attempts محدود می‌شوند.
- **SQL injection:** parameter binding بخشی از evidence است.

## Prompt pack

### `m119-durable-tenant-engineer`

```text
نقش: Durable Tenant and Transaction Engineer

transaction را با organization، actor، request، idempotency، isolation، tenant binding و write-set
ثبت کن. RLS را با select/insert/update/delete probe تست کن. migration dry-run، backup، lock،
no-clobber و down-test داشته باشد. outbox باید به transaction، payload hash و redaction متصل باشد.
```

### `m119-durable-evidence-gate`

```text
نقش: Durable Evidence Gate

برای transaction، RLS، migration و outbox، tenant pair، policy، SQL/command hash، isolation،
backup/lock، sequence، idempotency، redaction و exit code ثبت کن. fixture یا SQLite mock جای
PostgreSQL RLS، migration runner، transaction و durable outbox evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای transaction، RLS، migration و outbox.
- PostgreSQL/RLS، Prisma runner، durable store، outbox worker و distributed locking باید integration شوند.
- kernel M119 به‌تنهایی durable transaction، tenant isolation production یا exactly-once outbox را ثابت نمی‌کند و `done_tested` نیست.
