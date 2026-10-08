# فاز M120: Verification Matrix، CI، Security، Accessibility و Load Evidence

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-QA-04`، `GAP-SE-11`، `GAP-UX-08`، `GAP-OP-06`
**کد kernel:** `src/core/verification-matrix-runtime.ts`
**تست:** `test/next-hardening-phases.test.ts`

## هدف و مرز

M120 یک verification matrix بازتولیدپذیر برای typecheck، unit، integration، security، accessibility
و load evidence تعریف می‌کند. هر row باید owner، command، fixture، environment، artifact، exit code و
revision داشته باشد. CI provider، scanner، browser، load generator یا production telemetry واقعی
در این kernel وجود ندارد. free-tier و Local-first مسیرهای قابل استفاده‌اند، اما نباید evidence را
بیش از واقعیت نشان دهند.

## معماری و قرارداد

`M120TestMatrix` suite، command، reproducible، fixture، environment، artifact و exit code را می‌سنجد.
`M120PipelineEvidence` stage، revision، logs، artifacts و rerun status را می‌سنجد.
`M120SecurityCheck` scanner، scope، findings، severity و remediation evidence را gate می‌کند.
`M120AccessibilityEvidence` keyboard، screen reader، contrast، RTL، locale و viewport را validate می‌کند.

## verification lanes

| Lane | حداقل evidence |
|---|---|
| Static | `npm run typecheck`، lint، dependency audit |
| Unit | deterministic tests، seed و artifact |
| Integration | service contract، migration و isolation evidence |
| Security | SAST، dependency، secret scan، DAST با finding disposition |
| Accessibility | keyboard، focus، labels، contrast، RTL و screen reader |
| Load | scenario، concurrency، limits، latency، error و resource metrics |

## sprintها

### Sprint A — Matrix و reproducibility

manifest، revision lock، fixture hash و isolated runner.

### Sprint B — CI evidence

stage contract، artifact retention، rerun و approval gate.

### Sprint C — Security

secret scan، dependency، SAST/DAST، severity و remediation.

### Sprint D — Accessibility و load

keyboard/RTL evidence، scenario catalog و bounded load test.

## Threat Model

- **Green بدون اجرای واقعی:** exit code و artifact الزام است.
- **Flaky/reproducibility gap:** seed، revision و environment ثبت می‌شود.
- **Secret leakage:** scan و redacted logs لازم است.
- **Accessibility omission:** keyboard، RTL و screen-reader lane اجباری است.
- **Load harm:** concurrency/time budget و customer-impact guard لازم است.

## Prompt pack

### `m120-verification-lead`

```text
نقش: Reproducible Verification Lead

matrix را با lane، owner، command، revision، fixture hash، environment، artifact، exit code و
rerun policy بساز. typecheck/unit/integration/security/accessibility/load را جدا نگه دار و failure
را سبز نکن. خروجی logs و secrets را redact کن و free/local runner را صادقانه label کن.
```

### `m120-security-accessibility-reviewer`

```text
نقش: Security and Accessibility Reviewer

SAST، dependency، secret، DAST، keyboard، focus، labels، contrast، RTL، locale و screen reader را
بررسی کن. هر finding باید severity، owner، remediation و evidence داشته باشد؛ absence of finding
به‌تنهایی proof امنیت یا accessibility production نیست.
```

## DoD و production evidence boundary

- matrix deterministic و تست‌های negative برای missing artifact، failed stage و severe finding.
- CI provider، artifact store، scanners، real browser/screen reader و load telemetry باید integration شوند.
- kernel M120 فقط contract validation است و quality/security/accessibility/load readiness production را ثابت نمی‌کند.
