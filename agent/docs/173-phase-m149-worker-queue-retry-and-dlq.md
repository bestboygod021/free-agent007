# فاز M149: Durable Worker Queue، Retry و DLQ

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/worker-queue-runtime.ts`
**تست:** `test/next-platform-hardening-phases-5.test.ts`
**gap:** `GAP-EX-17`

## هدف و مرز

M149 job execution را از queue نامشخص به envelope، policy، durable lease، idempotency، bounded retry و
DLQ تبدیل می‌کند. job باید payload hash، tenant، attempt، max attempts، priority و not-before داشته باشد.
policy باید concurrency، depth، retryable errors، backoff، DLQ و approval را تعیین کند. lease باید
worker، heartbeat، expiry و revoke داشته باشد. DLQ replay فقط با operator reference و evidence مجاز است.
این فاز queue backend، consumer، distributed lock، retry scheduler یا DLQ store واقعی نیست.

## معماری و قراردادها

- `validateM149Job`: envelope، attempt، status، idempotency و tenant/redaction.
- `validateM149Policy`: depth/concurrency، retry/backoff، DLQ و approval.
- `decideM149Lease`: lease lifetime، heartbeat، worker و revoke.
- `decideM149Dlq`: reason/evidence، replay permission و operator reference.

raw payload، secret و credential در queue یا DLQ ذخیره نمی‌شوند؛ hash/reference و redacted metadata استفاده می‌شود.

## sprint plan

### Sprint A — Durable envelope

job schema، queue registry، idempotency و priority.

### Sprint B — Worker lease

lease/heartbeat، expiry، revoke و worker fencing.

### Sprint C — Retry

retryable taxonomy، exponential backoff، max attempts و queue bound.

### Sprint D — DLQ operations

DLQ evidence، review، bounded replay و alert.

## Threat Model

- **Duplicate execution:** idempotency key و lease fencing لازم است.
- **Retry storm:** retryable errors، backoff و max attempts gate می‌شوند.
- **Queue exhaustion:** depth/concurrency bounds اجباری است.
- **Poison job:** DLQ و replay approval لازم است.
- **Cross-tenant worker:** envelope tenant و worker lease بررسی می‌شود.
- **Payload leakage:** payload hash و redaction تنها evidence است.

## prompt pack

### `m149-worker-queue-engineer`

```text
نقش: Durable Worker Queue Engineer

job را با payload hash، tenant، idempotency، attempt، max attempts، priority و not-before ثبت کن.
policy باید concurrency، depth، retryable error، backoff و DLQ داشته باشد. lease را heartbeat/fence
کن و DLQ replay را فقط با evidence و operator approval انجام بده.
```

### `m149-queue-auditor`

```text
نقش: Queue Reliability Auditor

duplicate، lease expiry، retry storm، poison job، DLQ replay، tenant boundary و raw payload را
ممیزی کن. in-memory queue یا fake lease جای durable backend، worker consumer و DLQ store واقعی نیست.
```

## DoD و production evidence boundary

- job، policy، lease expiry، duplicate protection، retry bound و DLQ replay denial تست شوند.
- queue backend، consumer، distributed lease، retry scheduler، idempotency store، DLQ و telemetry باید integration شوند.
- kernel M149 به‌تنهایی exactly-once، queue durability، worker availability یا retry correctness production claim نیست.
