# فاز M74: Product Experience، Client Contracts و Accessibility

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-UX-02`، `GAP-UX-03`، `GAP-UX-05`، `GAP-UX-07`، `GAP-API-05`، `GAP-QA-03`، `GAP-QA-05`
**کد kernel:** `src/core/product-experience-runtime.ts`
**تست:** `test/next-product-runtime-phases.test.ts`

## هدف و مرز

M74 قرارداد قابل‌اتکای تجربه محصول را برای Web، Mobile، Desktop و CLI تعریف می‌کند: screen
state، empty/loading/error/degraded، locale، RTL، dark/light، API action، idempotency و
accessibility evidence. این فاز UI واقعی، router/server، browser E2E، design system package،
axe runner، screen-reader test یا production deploy را اجرا نمی‌کند.

## معماری

`ExperienceScreenContract` مسیر، stateهای مجاز، locale، theme، RTL و tenant scope را ثبت
می‌کند. `ExperienceClientAction` هر mutation را به approval، idempotency و organization
boundary وصل می‌کند. `ExperienceAccessibilityEvidence` گزارش axe، keyboard، contrast، screen
reader، RTL و reduced motion را hash می‌کند. release فقط با artifact، error-state evidence و
approval برای production قابل قبول است.

## قراردادهای اصلی

- `validateExperienceScreen` screen route، state، tenant scope و Persian RTL را بررسی می‌کند.
- `decideExperienceClientAction` action mutation، idempotency، approval و cross-tenant boundary را gate می‌کند.
- `validateExperienceAccessibilityEvidence` شواهد keyboard/contrast/screen-reader/RTL را validate می‌کند.
- `decideExperienceRelease` artifact، error-state evidence و production approval را بررسی می‌کند.

## sprintها

### Sprint A — Screen Inventory و Design System

- screen/route inventory
- loading/empty/error/degraded state
- design token و dark/light
- RTL و locale fallback

### Sprint B — Client Contract

- REST/tRPC client boundary
- tenant header و session state
- optimistic mutation و idempotency
- offline/read-only/local fallback

### Sprint C — Accessibility

- keyboard flow
- axe/WCAG 2.1 AA
- contrast/screen reader
- Persian RTL و reduced motion

### Sprint D — Product E2E

- sign-in تا run/output
- approval inbox و timeline
- diff/terminal/task board
- browser evidence و release gate

## Threat Model

- **Cross-tenant action:** target organization باید با session organization برابر باشد.
- **Duplicate mutation:** mutation بدون idempotency key رد می‌شود.
- **False accessibility claim:** contract بدون axe، keyboard، screen reader و RTL evidence کافی نیست.
- **Degraded-state omission:** هر screen باید error/degraded state صریح داشته باشد.
- **Local-first violation:** local mode نباید remote mutation پنهان ایجاد کند.

## Prompt pack

### `m74-product-experience-engineer`

```text
نقش: Product Experience Engineer

هر screen را با route، tenant scope، empty/loading/ready/error/degraded، locale، RTL، theme و
labels hash مدل کن. mutation را با session organization، approval و idempotency key محدود کن.
local/read-only fallback را صادقانه نگه دار و raw credential را در client state یا output نگذار.
```

### `m74-accessibility-evidence-gate`

```text
نقش: Accessibility Evidence Gate

برای هر surface، axe report، keyboard، contrast، screen reader، RTL و reduced-motion را با
artifact hash، browser/command، timestamp و exit code ثبت کن. screen screenshot یا unit test
جای browser accessibility evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای screen state، tenant-safe action، idempotency، RTL و accessibility evidence.
- UI، API client، browser E2E، axe/screen-reader runner، design system و offline client باید integration شوند.
- این kernel به‌تنهایی UI production، WCAG certification یا E2E موفق را ثابت نمی‌کند و `done_tested` نیست.
