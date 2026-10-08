# فاز M144: Public API Surface و OpenAPI Compatibility

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/public-api-surface-runtime.ts`
**تست:** `test/next-platform-hardening-phases-4.test.ts`
**gap:** `GAP-API-10`

## هدف و مرز

M144 سطح عمومی API را از endpointهای پراکنده به OpenAPI surface قابل‌ممیزی تبدیل می‌کند. document باید
version، spec hash، endpoint hash، HTTPS origin، auth scheme، tenant scope، error catalog و deprecation
را ثبت کند. هر endpoint باید schema، idempotency، authorization، rate class و documentation داشته باشد.
compatibility check باید diff، consumer evidence، migration plan و approval را برای breaking change gate
کند. request admission هم tenant، authz، schema، idempotency، rate limit و redaction را بررسی می‌کند.
این فاز gateway، OpenAPI registry، generated SDK، authz middleware یا rate limiter واقعی نیست.

## معماری و قراردادها

- `validateM144OpenApiDocument`: document identity، HTTPS، auth، tenant و error catalog.
- `validateM144Endpoint`: path، schema، idempotency، authz، rate class و docs.
- `decideM144Compatibility`: spec diff، consumer evidence، deprecation و breaking approval.
- `decideM144Request`: tenant، authz، schema، idempotency، rate و redaction.

raw credential و request payload حساس در contract یا error ثبت نمی‌شود؛ hash/reference و redacted envelope استفاده می‌شود.

## sprint plan

### Sprint A — Public surface

OpenAPI registry، server origins، operation catalog و error codes.

### Sprint B — Endpoint governance

schema hashes، idempotency، authz، rate class و deprecation.

### Sprint C — Compatibility

spec diff، consumer tests، migration plan و approval.

### Sprint D — Admission

tenant/authz middleware، rate limit، idempotency و public-safe errors.

## Threat Model

- **Undocumented endpoint:** endpoint contract و OpenAPI hash لازم است.
- **Breaking API release:** diff، consumer evidence و approval اجباری است.
- **Cross-tenant request:** tenant match fail-closed است.
- **Replay mutation:** mutating endpoint باید idempotent باشد.
- **Rate abuse:** remaining budget در request gate می‌شود.
- **Credential leak:** فقط reference/hash و redaction مجاز است.

## prompt pack

### `m144-public-api-engineer`

```text
نقش: Public API Surface Engineer

OpenAPI document را با version، spec hash، HTTPS origin، auth scheme، tenant scope و error catalog
ثبت کن. endpoint باید schema، authz، idempotency، rate class و documentation داشته باشد. breaking
change فقط با diff، consumer evidence، migration plan، deprecation window و approval مجاز است.
```

### `m144-api-auditor`

```text
نقش: API Surface Auditor

undocumented path، schema drift، breaking diff، authz، tenant، idempotency، rate limit و public
redaction را بررسی کن. mock route یا OpenAPI fixture جای gateway، generated consumer CI و middleware
production واقعی نیست.
```

## DoD و production evidence boundary

- document، endpoint، breaking compatibility، rate denial و tenant mismatch تست شوند.
- OpenAPI registry/gateway، consumer compatibility CI، authz/rate middleware، idempotency store و error catalog باید integration شوند.
- kernel M144 به‌تنهایی public API completeness، compatibility، authorization یا availability production claim نیست.
