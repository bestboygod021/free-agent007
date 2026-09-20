# فاز M85: Public API، Worker Lease و Stream Runtime

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-API-05`، `GAP-OB-01`، `GAP-EX-09`، `GAP-IN-11`، `GAP-DA-03`
**کد kernel:** `src/core/api-worker-runtime.ts`
**تست:** `test/next-orchestration-and-release-phases.test.ts`

## هدف و مرز

M85 مرز قابل‌اعتماد public API، worker lease، SSE/WebSocket resume و job completion را تعریف
می‌کند. tenant context، schema hash، idempotency، fencing token، heartbeat، cursor و redacted
output باید در هر مسیر حاضر باشند. این فاز API server، authentication middleware، queue، worker
process، SSE broker، websocket gateway یا durable database را اجرا نمی‌کند.

## معماری

`PublicApiRequestContract` route، method، transport، schema، tenant header، auth context و
idempotency را می‌گیرد. `WorkerLeaseContract` lease interval، heartbeat، attempt و fencing token
را محدود می‌کند. `StreamSessionContract` cursor/ack/resume و output redaction را نگه می‌دارد.
`JobCompletionEvidence` خروجی، artifact، cleanup، secret scan و acknowledgement را جمع می‌کند.

## قراردادهای اصلی

- `validatePublicApiRequest` public route، tenant، schema، idempotency و body hash را بررسی می‌کند.
- `validateWorkerLease` expiry، heartbeat، attempt و fencing را gate می‌کند.
- `decideApiStreamSession` cursor، ack، resume و redacted stream را validate می‌کند.
- `validateJobCompletionEvidence` exit code، artifact، cleanup، secret scan و error class را enforce می‌کند.

## sprintها

### Sprint A — API Boundary

- REST/tRPC public router
- schema/version enforcement
- tenant/auth middleware
- idempotency store

### Sprint B — Worker Runtime

- queue lease
- heartbeat/fencing
- retry و DLQ
- job cancellation

### Sprint C — Streaming

- SSE cursor
- websocket boundary
- reconnect/resume token
- incremental redaction

### Sprint D — Completion Evidence

- exit code و error taxonomy
- artifact reference
- cleanup/secret scan
- acknowledgement و audit

## Threat Model

- **Tenant bypass:** نبود tenant header یا auth context request را block می‌کند.
- **Double execution:** mutation idempotency و worker fencing token لازم دارد.
- **Stale worker:** lease expiry و heartbeat خارج interval رد می‌شود.
- **Stream leakage:** output باید redacted و resume token opaque باشد.
- **False success:** job بدون artifact، cleanup یا secret scan موفق اعلام نمی‌شود.

## Prompt pack

### `m85-api-worker-engineer`

```text
نقش: API and Worker Runtime Engineer

public API را با /api route، tenant header، auth context، schema hash و idempotency بساز. worker
lease باید expiry، heartbeat و fencing token داشته باشد. stream cursor/resume و redaction را
حفظ کن. job success فقط با exit code، artifact، cleanup و secret scan معتبر است.
```

### `m85-api-evidence-gate`

```text
نقش: API/Worker Evidence Gate

برای request، lease، heartbeat، retry، stream cursor، reconnect، completion و DLQ، request/job
hash، fencing، cursor، command و exit code ثبت کن. mock API یا local queue جای auth، durable lease،
stream resume و worker evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای API، idempotency، lease، fencing، stream resume و completion.
- API server، auth middleware، queue/worker، SSE broker، websocket gateway و durable store باید integration شوند.
- kernel M85 به‌تنهایی public API یا worker/stream reliability production را ثابت نمی‌کند و `done_tested` نیست.
