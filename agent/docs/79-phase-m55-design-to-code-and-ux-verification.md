# فاز M55: Design-to-code، Component Handoff و UX Verification

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-UX-02`، `GAP-UX-05`، `GAP-QA-05`، `GAP-EX-02`، `GAP-EX-04`
**کد kernel:** `src/core/design-to-code-runtime.ts`
**تست:** `test/visual-model-directory-phases.test.ts`

## هدف و مرز

M55 فاصله بین canvas گرافیکی و کد UI را کنترل می‌کند. component mapping برای React، Vue،
Svelte، HTML و Flutter، allowed paths، design tokens، sandbox و accessibility review را
تعریف می‌کند. خروجی، handoff قابل بررسی است؛ این فاز code generator واقعی، repository
workspace، compiler، browser runner یا framework adapter production را اجرا نمی‌کند.

## معماری

`DesignCodeHandoff` canvas/version را به target framework، component mappings، allowed paths،
sandbox و approval bind می‌کند. generated files فقط در workspace-relative pathهای allowlisted
قرار می‌گیرند و فایل credential یا `.env` ممنوع است. `AccessibilityReview` contrast، keyboard،
semantic، RTL/Bidi، reduced motion و blocking finding را به gate تبدیل می‌کند. token handoff
با CSS variable prefix و dark/RTL readiness بررسی می‌شود.

## قراردادهای اصلی

- `validateDesignCodeHandoff` mapping، sandbox، approval و path boundary را بررسی می‌کند.
- `decideDesignCodeGeneration` changed/generated file و credential file را gate می‌کند.
- `validateAccessibilityReview` contrast، keyboard، semantic، RTL، motion و findings را enforce می‌کند.
- `validateDesignTokenHandoff` token uniqueness، CSS prefix، RTL و dark-mode readiness را بررسی می‌کند.

## sprintها

### Sprint A — Component Mapping

- node-to-component registry
- React/Vue/Svelte/HTML/Flutter target
- props/events allowlist
- shared design token mapping

### Sprint B — Safe Code Handoff

- sandboxed code generation
- allowed path و atomic patch
- preview diff و approval
- compile/test adapter

### Sprint C — UX Verification

- axe/accessibility runner
- keyboard path و focus order
- contrast و color-blind checks
- RTL/Bidi و reduced motion

### Sprint D — Iterative Design Loop

- canvas ↔ code synchronization
- visual regression screenshot
- user feedback و correction
- component provenance و rollback

## Threat Model

- **Generated code escape:** code generator فقط sandbox و allowed paths دارد؛ path traversal، `.env` و credential file رد می‌شود.
- **Unsafe component props:** HTML injection، `eval` و dangerous inner HTML در component mapping مجاز نیست.
- **Accessibility overclaim:** design preview بدون keyboard/contrast/semantic evidence، compliance محسوب نمی‌شود.
- **Design/code drift:** canvas version، output hash و diff review لازم است؛ کد handoff شده بدون provenance پذیرفته نمی‌شود.
- **Untrusted library:** importPath و component package باید reviewed/locked باشد؛ package دلخواه auto-install نمی‌شود.

## Prompt pack

### `m55-design-to-code-engineer`

```text
نقش: Design-to-code and UX Verification Engineer

canvas را به component mapping صریح تبدیل کن. output فقط در allowed workspace paths و داخل
sandbox بنویس؛ .env، secret، credential و path traversal را deny کن. قبل از handoff diff و
approval بگیر. contrast، keyboard، semantic، RTL/Bidi و reduced motion را با evidence
بررسی کن؛ screenshot زیبا به‌تنهایی accessibility نیست.
```

### `m55-design-evidence-gate`

```text
نقش: Design Handoff Evidence Gate

برای mapping، generated diff، sandbox، allowed path، compile/test، contrast، keyboard، RTL
و visual regression، artifact hash، browser report، command و exit code ثبت کن. component
mock یا static HTML جای framework/browser integration evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای mapping، sandbox، path، props، token، accessibility و diff approval.
- generator، workspace patcher، framework compiler، browser/axe runner و visual regression باید integration شوند.
- design-to-code contract به‌تنهایی production UI یا UX compliance را ثابت نمی‌کند و `done_tested` نیست.
