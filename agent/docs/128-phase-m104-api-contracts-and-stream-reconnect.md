# فاز M104: API Contracts، Versioning و Stream Reconnect

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-API-01`، `GAP-API-03`، `GAP-API-04`، `GAP-API-05`، `GAP-API-06`، `GAP-API-07`
**کد kernel:** `src/core/api-contract-runtime.ts`
**تست:** `test/next-control-plane-phases.test.ts`

## هدف و مرز

M104 versioned API surface، error taxonomy، SSE reconnect و rate-limit evidence را یک قرارداد
واحد می‌کند. هر API باید tenant boundary، request/response schema، lifecycle و compatibility
window داشته باشد. خطاها باید public-safe، correlation-aware و قابل دسته‌بندی باشند. reconnect
فقط با cursor معتبر، tenant match، redaction و replay limit انجام می‌شود. این فاز OpenAPI server،
tRPC router، SSE broker، persistence، gateway rate limiter یا client SDK واقعی را اجرا نمی‌کند.

## معماری

`ApiVersionContract` protocol، version، schema hash، lifecycle و deprecation را نگه می‌دارد.
`ApiErrorContract` class/status/retryability و internal detail hash را از public message جدا می‌کند.
`SseReconnectRequest` برای replay cursor، terminal event و snapshot fallback مرز می‌گذارد.
`ApiRateLimitEvidence` bucket، cost، remaining، reset و header evidence را ثبت می‌کند.

## قراردادهای اصلی

- `validateM104ApiVersion`: version، schema، lifecycle، tenant scope و compatibility را بررسی می‌کند.
- `validateM104ApiError`: status، retryability، correlation و secret redaction را gate می‌کند.
- `decideM104SseReconnect`: tenant، cursor، replay limit، terminal و event redaction را enforce می‌کند.
- `decideM104RateLimit`: bucket، request cost، quota، reset و `Retry-After` را validate می‌کند.

## sprintها

### Sprint A — Contract Registry

- REST/SSE/Webhook/CLI surface
- schema compatibility
- lifecycle و deprecation
- generated client boundary

### Sprint B — Error Contract

- stable error codes
- public/internal split
- correlation ID
- retryability taxonomy

### Sprint C — Stream Reconnect

- `Last-Event-ID`
- cursor persistence
- replay limit
- snapshot fallback و terminal state

### Sprint D — Rate Limit

- user/org/IP/connector buckets
- weighted request cost
- standard headers
- Retry-After و observability

## Threat Model

- **Breaking client:** version و compatibility window قبل از تغییر gate می‌شود.
- **Information leak:** public error هرگز internal detail یا secret خام ندارد.
- **Cross-tenant replay:** stream tenant match اجباری است.
- **Replay amplification:** cursor expiry و replay limit مانع replay نامحدود می‌شود.
- **Quota evasion:** rate limit چندلایه و request-cost aware است.

## Prompt pack

### `m104-api-contract-engineer`

```text
نقش: API Contract Engineer

برای هر endpoint protocol، version، request/response schema hash، lifecycle، compatibility
window و tenant boundary ثبت کن. error را به code/class/status/correlation تقسیم کن و detail داخلی
را hash/redact نگه دار. SSE با Last-Event-ID، cursor، replay limit، terminal و snapshot fallback کار کند.
```

### `m104-api-evidence-gate`

```text
نقش: API Evidence Gate

برای contract، deprecation، error، reconnect و rate limit، schema/version/hash، cursor، tenant،
header، Retry-After، command و exit code ثبت کن. OpenAPI نمونه یا in-memory stream جای gateway،
client reconnect، persistence و compatibility E2E evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای API version، error، reconnect و rate limit.
- OpenAPI/tRPC implementation، SSE broker، cursor store، gateway limiter و SDK compatibility باید integration شوند.
- kernel M104 به‌تنهایی public API production، reconnect durability یا rate-limit enforcement را ثابت نمی‌کند و `done_tested` نیست.
