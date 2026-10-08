# فاز M87: Quality Integration، E2E، Load/Security و Accessibility

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-QA-03`، `GAP-QA-04`، `GAP-QA-05`، `GAP-PO-02`، `GAP-PO-05`
**کد kernel:** `src/core/quality-integration-runtime.ts`
**تست:** `test/next-orchestration-and-release-phases.test.ts`

## هدف و مرز

M87 شواهد quality را از قرارداد به integration-ready evidence envelope می‌رساند: E2E مسیر
product، load/security threshold و accessibility شامل keyboard، contrast، screen reader، RTL و
reduced motion. scenario باید seed، fixture، expected outcome و redaction داشته باشد. این فاز
browser runner، k6/security scanner، axe runner، CI provider یا staging environment واقعی را اجرا نمی‌کند.

## معماری

`QualityScenarioContract` نوع تست، environment، seed، fixture و tenant isolation را مشخص می‌کند.
`QualityE2eEvidence` step evidence، security/accessibility و tenant probe را جمع می‌کند.
`QualityLoadSecurityEvidence` runner/report، threshold و measured result را ثبت می‌کند.
`QualityAccessibilityEvidence` گزارش axe و keyboard/contrast/screen-reader/RTL را جدا می‌کند.

## قراردادهای اصلی

- `validateQualityScenario` reproducibility، redaction، tenant isolation و canary approval را gate می‌کند.
- `decideQualityE2eEvidence` step، exit code، security، accessibility و tenant evidence را بررسی می‌کند.
- `validateQualityLoadSecurityEvidence` threshold، runner، redaction و pass state را validate می‌کند.
- `validateQualityAccessibilityEvidence` accessibility dimensions را enforce می‌کند.

## sprintها

### Sprint A — Product E2E

- signup/session
- connection/request/approval
- model/run/workspace/output
- cross-tenant probe

### Sprint B — Load و Security

- k6 scenario
- security scanner
- rate/latency/error threshold
- secret/injection/egress test

### Sprint C — Accessibility

- axe report
- keyboard navigation
- contrast/screen reader
- Persian RTL/reduced motion

### Sprint D — Evidence/CI

- seed/fixture artifact
- report upload
- CI gate
- failure triage و retry

## Threat Model

- **Flaky success:** seed و fixture hash و step evidence اجباری است.
- **False E2E:** tenant isolation، security و accessibility gate بدون استثنا لازم است.
- **Load masking:** measured threshold و runner report باید مستقل ثبت شود.
- **Accessibility omission:** screen reader، RTL و reduced motion نیز gate هستند.
- **Secret in reports:** fixture، output و report باید redacted باشند.

## Prompt pack

### `m87-quality-integration-engineer`

```text
نقش: Quality Integration Engineer

هر scenario را با seed، fixture hash، expected outcome و environment ثبت کن. E2E باید مسیر کامل
و tenant isolation داشته باشد. load/security threshold و report hash را ثبت کن. accessibility
شامل axe، keyboard، contrast، screen reader، RTL و reduced motion است. secret در fixture/report نماند.
```

### `m87-quality-evidence-gate`

```text
نقش: Quality Evidence Gate

برای E2E step، load/security measurement، accessibility check و CI gate، scenario/run/report
hash، seed، exit code و threshold ثبت کن. unit test یا screenshot دستی جای browser E2E، load,
security و screen-reader evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای scenario، seed، E2E، tenant probe، threshold و accessibility.
- browser/API E2E، load/security runner، axe/screen-reader runner، CI provider و staging باید integration شوند.
- kernel M87 به‌تنهایی product E2E، performance، security یا accessibility production readiness را ثابت نمی‌کند و `done_tested` نیست.
