# فاز M172: Accessibility و Localization Verification

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/accessibility-localization-runtime.ts`
**تست:** `test/next-platform-hardening-phases-9.test.ts`
**gap:** `GAP-QA-11`

## هدف و مرز

M172 locale catalog، fallback، RTL، version، WCAG AA، keyboard/contrast/screen-reader evidence و
responsive screen proof را به gate تبدیل می‌کند. fallback ترجمه به‌معنای پنهان‌کردن missing key نیست و
waiver باید approval و expiry داشته باشد. این فاز translation platform، browser runner، screen reader،
visual regression یا CI provider واقعی نیست.

## معماری

- `validateM172Catalog`: locale/fallback، key alignment، version، no-user-data، tenant و approval.
- `decideM172A11yCheck`: WCAG AA، violations، keyboard، contrast، screen reader و waiver.
- `validateM172ScreenEvidence`: screenshot/focus/labels hash، direction، responsive و redaction.
- `decideM172Fallback`: missing keys، fallback locale، reason و approval.

Local-first locale catalog با fallback صریح اجرا می‌شود؛ Persian RTL، اعداد/date و plural باید به‌عنوان
رفتار قابل‌تست ثبت شوند. هیچ screenshot یا accessibility artifact نباید customer data یا raw secret
داشته باشد. `waived` success نیست مگر approval مستقل موجود باشد.

## sprint plan

### Sprint A — Catalog

message extraction، key lint، version، fallback و RTL metadata.

### Sprint B — Browser checks

keyboard/focus، contrast، axe/WCAG و screen-reader lane.

### Sprint C — Visual evidence

RTL screenshot، responsive states، labels، empty/loading/error و redaction.

### Sprint D — CI gate

locale matrix، waiver expiry، regression baseline و release blocking.

## Threat Model

- **Missing translation:** key lint، fallback evidence و review.
- **RTL layout break:** direction metadata و visual evidence.
- **Keyboard trap:** focus/keyboard runner.
- **False a11y pass:** independent browser/screen-reader evidence.
- **Customer data in screenshot:** redaction و synthetic fixture.
- **Waiver abuse:** approval، expiry و explicit non-pass state.

## prompt pack

### `m172-ux-verification-engineer`

```text
نقش: Accessibility و Localization Verification Engineer

catalog را versioned و key-complete نگه دار. برای هر screen و locale، WCAG AA، keyboard، contrast،
screen reader، RTL و responsive evidence بگیر. missing translation یا waiver را pass پنهان نکن و
screenshotها را synthetic/redacted نگه دار.
```

### `m172-ux-auditor`

```text
نقش: UX Verification Auditor

key drift، fallback، RTL، focus، contrast، screen-reader، responsive state، screenshot privacy و
waiver expiry را بررسی کن. static checklist یا axe mock جای browser/screen-reader CI واقعی نیست.
```

## DoD و production evidence boundary

- catalog، missing-key fallback، WCAG failure، passed screen evidence و waiver denial تست شوند.
- locale pipeline، browser/axe/keyboard runner، screen-reader evidence، visual runner و CI gate باید متصل شوند.
- kernel M172 به‌تنهایی WCAG compliance، translation completeness، RTL correctness یا accessibility production claim نیست.
