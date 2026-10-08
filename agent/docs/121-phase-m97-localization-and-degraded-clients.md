# فاز M97: Localization، RTL Accessibility و Degraded Clients

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-CP-09`، `GAP-UX-05`، `GAP-UX-06`، `GAP-UX-08`
**کد kernel:** `src/core/localization-client-runtime.ts`
**تست:** `test/next-memory-security-client-phases.test.ts`

## هدف و مرز

M97 locale catalog، Persian RTL، accessibility localized و offline/degraded behavior را به
contract واحد تبدیل می‌کند. locale باید fallback، plural/date/number format، review و coverage
داشته باشد. offline mode نباید silently egress کند و queued mutation باید idempotent و user-visible
باشد. این فاز UI، message extraction، PWA/Tauri shell، service worker، screen reader runner یا
sync conflict engine واقعی را اجرا نمی‌کند.

## معماری

`LocaleCatalogContract` locale/fallback، message coverage، plural/date version، RTL و review را
ثبت می‌کند. `DegradedClientPolicy` offline/read-only/local-only/queued mode، last-known state،
mutation idempotency، egress و user notice را gate می‌کند. accessibility شامل RTL و plural/date/
number است. `OfflineMutationRequest` payload hash، queue time، conflict version و idempotency دارد.

## قراردادهای اصلی

- `validateLocaleCatalog` locale format، coverage، RTL و review را بررسی می‌کند.
- `decideDegradedClientPolicy` egress، queue idempotency و user notice را gate می‌کند.
- `validateLocalizedAccessibilityEvidence` keyboard، screen reader، contrast، RTL و reduced motion را validate می‌کند.
- `validateOfflineMutation` queue، payload، idempotency، conflict و approval request را enforce می‌کند.

## sprintها

### Sprint A — Locale System

- message catalog
- extraction/lint
- fallback
- plural/date/number formatting

### Sprint B — RTL Design

- Persian RTL tokens
- dark/light
- responsive layout
- keyboard/focus order

### Sprint C — Degraded Clients

- offline/read-only/local-only
- last-known state
- user notice
- no hidden egress

### Sprint D — Offline Sync

- mutation queue
- idempotency
- conflict version
- replay/reconciliation

## Threat Model

- **Locale fallback data loss:** fallback explicit و reviewed است.
- **RTL accessibility gap:** RTL، screen reader و keyboard مستقل gate می‌شوند.
- **Offline surprise:** offline client egress ندارد و user notice لازم دارد.
- **Duplicate mutation:** idempotency key برای queued mutation اجباری است.
- **Approval replay:** offline approval request conflict version می‌خواهد.

## Prompt pack

### `m97-localization-client-engineer`

```text
نقش: Localization and Degraded Client Engineer

catalog را با locale/fallback، coverage، plural/date/number version و RTL review کن. offline/read-only
mode نباید egress پنهان داشته باشد. mutation queue باید payload hash، idempotency، conflict version و
user notice داشته باشد. accessibility شامل keyboard، screen reader، contrast، RTL و reduced motion است.
```

### `m97-client-evidence-gate`

```text
نقش: Localization Evidence Gate

برای locale catalog، fallback، RTL/a11y، offline state، queued mutation، conflict و replay، catalog/
report/payload hash، locale، command و exit code ثبت کن. ترجمه چند کلید یا screenshot دستی جای axe,
screen-reader، service-worker و offline sync evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای catalog، fallback، RTL، degraded mode و offline mutation.
- web/PWA/Tauri UI، message tooling، service worker، screen reader runner و sync engine باید integration شوند.
- kernel M97 به‌تنهایی localization، accessibility یا offline client production را ثابت نمی‌کند و `done_tested` نیست.
