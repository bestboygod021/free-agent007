# فاز M64: Product Control-plane UI، API و Approval Surfaces

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-API-05`، `GAP-UX-02`، `GAP-UX-03`، `GAP-UX-05`، `GAP-QA-03`
**کد kernel:** `src/core/product-control-plane-runtime.ts`
**تست:** `test/next-platform-integration-phases.test.ts`

## هدف و مرز

M64 قراردادهای deterministic قبلی را به سطح محصول نزدیک می‌کند: API داخلی، screen projection،
home/runs/workspace/connections/models/directory/studio/approvals/settings، حالت‌های
loading/empty/ready/error/degraded و approval inbox. این فاز Web App، API server، session
middleware، SSE، UI component package یا approval persistence واقعی را اجرا نمی‌کند.

## معماری

`ProductApiRequest` با organization/user/session/request/route/method/screen و tenant scope
ساخته می‌شود. mutation به CSRF proof و idempotency نیاز دارد. `ProductScreenProjection` data
hash، state و allowed actions را بدون نشت داده نمایش می‌دهد. `ProductApprovalItem` payload hash،
expiry، assignment و separation of duties را نگه می‌دارد؛ requester نمی‌تواند high-risk action
خود را approve کند.

## قراردادهای اصلی

- `validateProductApiRequest` route، session، tenant، CSRF و idempotency را gate می‌کند.
- `validateProductScreenProjection` screen state، timestamp، data hash و action visibility را بررسی می‌کند.
- `decideProductAction` expiry، assignment، requester/reviewer separation و approval را enforce می‌کند.
- `validateProductApiError` user-safe error و secret redaction را validate می‌کند.

## sprintها

### Sprint A — API و Session Boundary

- REST/tRPC routing boundary
- session/CSRF middleware
- error envelope و request id
- SSE/resume contract

### Sprint B — Product Screens

- screen inventory و route guard
- loading/empty/error/degraded states
- RTL/dark/light و keyboard
- tenant-safe projection

### Sprint C — Approval Inbox

- approval list/detail
- assignment و reviewer separation
- expiry/reject/approve
- notification و audit

### Sprint D — Product E2E

- registration → connection → request → plan → approval
- Web App/CLI parity
- accessibility runner
- browser/API evidence

## Threat Model

- **Cross-tenant API access:** هر request و projection organization-scoped است؛ route بدون tenant context رد می‌شود.
- **CSRF/replay:** mutation به CSRF proof و idempotency نیاز دارد؛ request ID برای audit ثبت می‌شود.
- **Approval self-dealing:** requester نمی‌تواند action پرریسک خود را approve کند؛ assignment و expiry enforce می‌شوند.
- **UI data leak:** error message و projection hash نباید secret یا tenant دیگر را منتشر کند.
- **Degraded-state confusion:** loading/error/degraded actionهای mutating را بی‌دلیل expose نمی‌کنند.

## Prompt pack

### `m64-product-control-plane-engineer`

```text
نقش: Product Control-plane Engineer

API را به organization/user/session/request bind کن. mutation را با CSRF و idempotency gate
کن. همه screenها loading/empty/ready/error/degraded داشته باشند. projection tenant-scoped
باشد و requester نتواند approval پرریسک خودش را صادر کند. error را user-safe و secret-free
برگردان.
```

### `m64-product-evidence-gate`

```text
نقش: Product Evidence Gate

برای API request، screen state، approval assignment، expiry، error، degraded state و E2E flow،
request ID، response hash، browser/API output، command و exit code ثبت کن. kernel projection
جای Web App/API integration evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای API، tenant scope، CSRF، idempotency، screen state، approval و error redaction.
- API server، Web App، session middleware، SSE، approval store و accessibility E2E باید integration شوند.
- وجود screen contract به‌تنهایی محصول قابل استفاده یا approval flow production را ثابت نمی‌کند و `done_tested` نیست.
