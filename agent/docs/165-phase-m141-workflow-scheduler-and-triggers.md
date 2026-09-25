# فاز M141: Workflow Scheduler و Trigger Runtime

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/workflow-scheduler-runtime.ts`
**تست:** `test/next-platform-hardening-phases-3.test.ts`
**gap:** `GAP-EX-14`

## هدف و مرز

M141 schedule، cron، event، webhook و manual trigger را به tenant scope، authorization، dedupe،
concurrency، quota و lease وصل می‌کند. schedule باید timezone، expression، next run، misfire policy،
max concurrency، owner و approval داشته باشد. trigger باید event hash، dedupe، authorization و
redaction داشته باشد. run lease باید idempotency، bounded attempts، worker reference و expiry داشته
باشد. این فاز scheduler، durable queue، cron parser، worker consumer، distributed lock یا DLQ واقعی نیست.

## معماری و قراردادها

- `validateM141Schedule`: next run، expression، timezone، concurrency، tenant و approval.
- `decideM141Trigger`: event identity، timestamp، authorization، tenant و redaction.
- `validateM141RunLease`: attempt، lease، worker، idempotency و revoke.
- `decideM141Concurrency`: active/queued counts، quota، tenant و duplicate trigger.

trigger payload و credentials در scheduler ذخیره نمی‌شوند؛ event hash، dedupe key و opaque reference استفاده می‌شود.

## sprint plan

### Sprint A — Schedule registry

timezone، expression، next-run calculation، owner و approval.

### Sprint B — Trigger intake

cron/event/webhook/manual، authorization، event hash و dedupe.

### Sprint C — Run leases

worker lease، attempt، idempotency، expiry و revoke.

### Sprint D — Capacity governance

concurrency slots، queue bounds، quota preflight، misfire و DLQ policy.

## Threat Model

- **Duplicate trigger:** dedupe key و idempotency لازم است.
- **Cross-tenant trigger:** tenant match و authorization اجباری است.
- **Runaway schedule:** concurrency، queue bound و quota gate می‌شود.
- **Lease split-brain:** short expiry و worker reference لازم است.
- **Retry storm:** max attempts و misfire policy محدود می‌شوند.
- **Secret in event:** event hash و redacted payload تنها evidence است.

## prompt pack

### `m141-scheduler-engineer`

```text
نقش: Workflow Scheduler Engineer

schedule را با timezone، expression، next run، misfire policy، owner، max concurrency، tenant و
approval ثبت کن. trigger باید authorized، redacted، tenant-matched و deduplicated باشد. lease را
با worker reference، idempotency، bounded attempts، expiry و revoke بساز.
```

### `m141-trigger-auditor`

```text
نقش: Scheduler Auditor

cron/event/webhook authorization، dedupe، quota، concurrency، lease expiry، retry bound و tenant
isolation را ممیزی کن. fake clock یا in-memory queue جای scheduler، distributed lease و durable
worker/DLQ واقعی نیست.
```

## DoD و production evidence boundary

- schedule، trigger، duplicate denial، expired lease و concurrency/quota denial تست شوند.
- cron/event scheduler، durable queue، distributed lock/lease، worker، DLQ، quota adapter و observability باید integration شوند.
- kernel M141 به‌تنهایی scheduling accuracy، exactly-once execution، queue durability یا workflow reliability production claim نیست.
