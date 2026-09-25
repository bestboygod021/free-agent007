# فاز M42: Quality، CI و Verification Runtime

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IN-01`، `GAP-EX-03`، `GAP-EX-04`، `GAP-QA-01`، `GAP-QA-03`، `GAP-QA-04`، `GAP-QA-05`، `GAP-PO-02`، `GAP-PO-05`
**کد kernel:** `src/core/quality-ci-runtime.ts`
**تست:** `test/next-runtime-phases.test.ts`

## هدف و مرز

M42 قرارداد toolchain matrix، adapter test result، E2E critical path، CI quality gate،
load/security surface و accessibility evidence را تعریف می‌کند. این فاز runner زبان‌ها،
GitHub Actions، k6، Playwright، axe، ESLint، Prettier یا security scanner واقعی اجرا
نمی‌کند؛ pass شدن kernel به‌معنای pass شدن CI یا E2E production نیست.

## معماری

Toolchain registry هر language/runner را با image digest، version و allowlist ثبت می‌کند.
adapter result به status و evidence hash normalize می‌شود. E2E planner critical path را
با approval و connector fixture الزام می‌کند. CI gate test result، E2E/load/security/
a11y surface و findings را در یک decision جمع می‌کند. accessibility evidence برای keyboard،
focus، RTL و critical findings جدا ثبت می‌شود.

## قراردادهای اصلی

- `validateToolchainCell` language/runner، digest، version و allowlist را بررسی می‌کند.
- `normalizeAdapterTestResult` خروجی runnerهای مختلف را به status و evidence واحد تبدیل می‌کند.
- `planEndToEndScenario` مسیر ثبت‌نام تا PR، approval و connector fixture را gate می‌کند.
- `decideCiQualityGate` surfaceهای لازم، test result، security/a11y findings و approval را ارزیابی می‌کند.
- `validateAccessibilityEvidence` keyboard، focus، RTL و critical finding را enforce می‌کند.

## sprintها

### Sprint A — Language و Test Adapter Matrix

- Node، Python، Go، Rust، Java و PHP runner
- pinned image و version manifest
- normalized exit/result/log/artifact
- timeout، cancellation و test evidence

### Sprint B — Evaluation و CI Harness

- dataset/scorer/gate در CI
- prompt/schema regression
- fixture project و seed
- PR status/check و protected branch

### Sprint C — Product E2E و Load/Security

- signup → connector → request → plan → approval → PR
- Playwright browser path با human approval
- k6 load و rate-limit verification
- security scanner و finding severity gate

### Sprint D — Accessibility و Release Quality

- keyboard/focus/screen reader
- Persian RTL و mixed-direction content
- axe/manual report و regression snapshots
- lint/formatter و release quality dashboard

## Threat Model

- **False green CI:** result باید log/artifact evidence و exit code داشته باشد؛ mock یا
  skipped test به‌عنوان passed پذیرفته نمی‌شود.
- **Toolchain supply-chain drift:** image digest، version و allowlist پیش از runner gate می‌شود.
- **E2E approval bypass:** critical journey بدون approval step معتبر نیست؛ connector fixture
  جای authorization واقعی را نمی‌گیرد.
- **Accessibility/security omission:** required surfaceها و critical findings release را
  block می‌کنند؛ RTL و keyboard به‌صورت قابل‌مشاهده evidence می‌خواهند.

## Prompt pack

### `m42-quality-ci-engineer`

```text
نقش: Quality and CI Verification Engineer

هر runner را با language، version و image digest pin کن. exit code، log و artifact hash را
normalize کن. E2E باید مسیر واقعی و approval را پوشش دهد. security/a11y critical finding
باید gate را متوقف کند؛ skipped، mock یا local unit test را به‌عنوان production evidence
گزارش نکن.
```

### `m42-quality-evidence-gate`

```text
نقش: Quality Evidence Gate

برای toolchain cell، test adapter، benchmark/CI، E2E، load، security، RTL و accessibility،
command، exit code، duration، report hash و browser output ثبت کن. contract kernel یا
fixture connector به‌تنهایی CI/E2E evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای digest pinning، result normalization، critical E2E، finding gate و RTL/a11y.
- language runners، CI provider، Playwright/axe، k6، scanner، lint/formatter و protected
  branch checks باید در integration جدا اجرا شوند.
- test pass، load capacity، security posture یا accessibility compliance بدون artifact و
  runner evidence واقعی `done_tested` نیست.
