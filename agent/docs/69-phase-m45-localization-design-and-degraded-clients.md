# فاز M45: Localization، Design System و Degraded Clients

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-CP-09`، `GAP-UX-05`، `GAP-UX-06`، `GAP-UX-08`
**کد kernel:** `src/core/localization-design-runtime.ts`
**تست:** `test/future-runtime-phases.test.ts`

## هدف و مرز

M45 قرارداد message catalog، locale fallback، Persian RTL، design token، PWA manifest و
offline/degraded client را تعریف می‌کند. این فاز translation workflow، design system package،
PWA service worker، Tauri shell، offline database یا browser accessibility runner واقعی
اجرا نمی‌کند. credential و raw secret در cache/client ذخیره نمی‌شوند.

## معماری

Catalog compiler key/version/translation/fallback را تولید می‌کند و locale resolver با
fallback امن ادامه می‌دهد. design token layer رنگ، spacing، focus و direction را برای
light/dark و RTL validate می‌کند. client capability layer action را بر اساس online،
degraded یا offline به read-only snapshot، queued comment یا deny تبدیل می‌کند. PWA
manifest فقط relative start URL و tenant-scoped cache را می‌پذیرد.

## قراردادهای اصلی

- `validateMessageCatalog` key uniqueness، translation coverage و fa-IR RTL/number system را بررسی می‌کند.
- `resolveLocaleFallback` locale unavailable را بدون سقوط به زبان نامعلوم به fallback می‌برد.
- `validateDesignTokenSet` token completeness، inline RTL spacing، focus و contrast را gate می‌کند.
- `decideOfflineAction` approval/run mutation را offline متوقف و local snapshot را الزام می‌کند.
- `validatePwaManifest` relative URL، tenant cache و no-credential storage را enforce می‌کند.

## sprintها

### Sprint A — Catalog و Formatting

- message extraction و key lint
- Persian/English fallback
- number/date/time formatting
- locale version و migration

### Sprint B — RTL Design System

- light/dark token set
- logical spacing و mixed-direction code/path/log
- focus/contrast/keyboard token
- component inventory و visual regression

### Sprint C — Degraded Web Client

- online/degraded/offline capability matrix
- tenant-scoped snapshot/cache
- read-only timeline و queued comment
- reconnect، conflict و cache invalidation

### Sprint D — PWA و Desktop Boundary

- PWA manifest/service worker
- Tauri desktop shell contract
- credential/secret non-persistence
- browser/desktop accessibility و security evidence

## Threat Model

- **Locale fallback data leak:** fallback catalog نباید tenant یا secret content را cache کند؛
  key/version و locale باید deterministic باشند.
- **RTL/UI confusion:** mixed-direction path/code/log و focus token در design system explicit
  هستند؛ visual appearance بدون keyboard/RTL evidence کافی نیست.
- **Offline replay:** offline queue فقط idempotent read/comment را نگه می‌دارد؛ approval و
  run start نیازمند اتصال و server revision هستند.
- **Client credential theft:** PWA/Tauri manifest و cache هرگز raw password، token یا MFA
  seed ذخیره نمی‌کنند؛ local-first به‌معنای credential persistence نیست.

## Prompt pack

### `m45-localization-design-engineer`

```text
نقش: Localization and Degraded Client Engineer

catalog را versioned و key-based نگه دار. fa-IR باید RTL، number/date formatting و mixed
content را پوشش دهد. design token را برای light/dark، focus و contrast validate کن. offline
فقط snapshot tenant-scoped و comment queue داشته باشد؛ approval، run start و credential
storage را deny کن.
```

### `m45-localization-evidence-gate`

```text
نقش: Localization and Client Evidence Gate

برای catalog extraction، fallback، RTL، contrast، keyboard، cache scope، reconnect و
PWA/Tauri، command، screenshot/browser output، report hash و exit code ثبت کن. token unit
test یا static manifest جای accessibility/offline integration evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای catalog gap، fallback، RTL token، contrast، offline mutation و cache scope.
- catalog pipeline، design-system package، service worker، Tauri/PWA، reconnect و browser
  accessibility باید جداگانه اجرا شوند.
- ترجمه کامل، WCAG/RTL compliance، offline reliability یا PWA security بدون evidence واقعی
  `done_tested` نیست.
