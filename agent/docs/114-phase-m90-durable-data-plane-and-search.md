# فاز M90: Durable Data Plane، Event Store و Governed Search

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-DA-01`، `GAP-DA-03`، `GAP-DA-04`، `GAP-DA-05`، `GAP-EX-09`
**کد kernel:** `src/core/durable-data-plane-runtime.ts`
**تست:** `test/next-operations-and-enterprise-phases.test.ts`

## هدف و مرز

M90 entity، append-only event، migration و search boundary را برای data plane پایدار تعریف
می‌کند. version، idempotency، retention، ACL، tenant scope، backup و rollback باید در کنار
داده باشند. این فاز PostgreSQL execution، Prisma migration runner، event bus، full-text index،
backup store یا production search service را اجرا نمی‌کند.

## معماری

`DurableEntityEnvelope` entity version، state، payload hash، PII redaction و idempotency را
ثبت می‌کند. `DurableEventRecord` sequence و append-only chain دارد؛ audit event بدون predecessor
hash ناقص است. migration فقط با dry-run، backup، lock و approval apply/rollback می‌شود.
`decideDurableSearch` ACL، tenant scope، dataset scope و export boundary را gate می‌کند.

## قراردادهای اصلی

- `validateDurableEntity` version، timestamps، state و redaction را بررسی می‌کند.
- `validateDurableEvent` sequence، append-only، retention و audit chain را validate می‌کند.
- `decideDurableMigration` dry-run، backup، lock و approval را gate می‌کند.
- `decideDurableSearch` ACL، tenant scope، result limit و export را enforce می‌کند.

## sprintها

### Sprint A — Durable Entity

- schema/migration
- optimistic version
- soft delete/archive
- idempotency

### Sprint B — Event Store

- append-only event
- sequence/chain
- outbox/consumer
- retention/legal hold

### Sprint C — Migration Safety

- dry-run
- backup قبل از apply
- lock/fencing
- rollback rehearsal

### Sprint D — Search

- full-text/index
- ACL/tenant filter
- query limit
- controlled export

## Threat Model

- **Lost update:** entity version و idempotency از overwrite جلوگیری می‌کنند.
- **Event tampering:** append-only sequence و audit predecessor hash لازم است.
- **Unsafe migration:** بدون dry-run، backup، lock و approval apply نمی‌شود.
- **Cross-tenant search:** ACL و tenant scope قبل از query اجباری است.
- **Search export leak:** export از search عادی جدا و approval-bound است.

## Prompt pack

### `m90-durable-data-engineer`

```text
نقش: Durable Data Plane Engineer

entity را versioned، idempotent و PII-redacted نگه دار. event store append-only و sequenceدار
باشد. migration بدون dry-run، backup، lock و approval اجرا نشود. search همیشه ACL و tenant-scoped
باشد و export boundary جدا داشته باشد.
```

### `m90-data-evidence-gate`

```text
نقش: Durable Data Evidence Gate

برای entity mutation، event append، migration dry-run/apply/rollback، search و export، version،
sequence، payload hash، backup hash، query hash، command و exit code ثبت کن. in-memory fixture یا
schema compile جای PostgreSQL/event-store/search integration evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای entity، event chain، migration safety و governed search.
- PostgreSQL/Prisma، event bus، outbox، migration runner، full-text index و backup باید integration شوند.
- kernel M90 به‌تنهایی durable persistence، search correctness یا migration safety production را ثابت نمی‌کند و `done_tested` نیست.
