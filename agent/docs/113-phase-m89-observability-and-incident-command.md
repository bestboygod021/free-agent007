# فاز M89: Observability، SLO Measurement و Incident Command

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-OB-01`، `GAP-OB-03`، `GAP-OB-04`، `GAP-OB-06`
**کد kernel:** `src/core/observability-incident-runtime.ts`
**تست:** `test/next-operations-and-enterprise-phases.test.ts`

## هدف و مرز

M89 telemetry را به SLO measurement، alert evaluation و incident runbook action متصل می‌کند.
metric، trace، log و audit باید redacted، organization-scoped و hash-bound باشند. این فاز
metrics backend، tracing collector، alert manager، on-call integration، incident UI یا chaos
runner واقعی را اجرا نمی‌کند.

## معماری

`ObservabilityTelemetryEnvelope` signal/service/metric و payload hash را ثبت می‌کند. trace بدون
trace id معتبر نیست و telemetry بدون redaction رد می‌شود. `ObservabilitySloMeasurement` availability،
latency P95 و error rate را در یک window نگه می‌دارد. `ObservabilityAlertEvaluation` critical alert
را از silent suppression حفظ می‌کند. `IncidentRunbookAction` operator، command، approval و exit code را ثبت می‌کند.

## قراردادهای اصلی

- `validateObservabilityTelemetry` redaction، signal identity و trace provenance را validate می‌کند.
- `validateObservabilitySloMeasurement` rate/latency/target bounds را بررسی می‌کند.
- `decideObservabilityAlert` threshold، severity و notification suppression را gate می‌کند.
- `validateIncidentRunbookAction` runbook، approval، command و completion را enforce می‌کند.

## sprintها

### Sprint A — Telemetry

- metric/trace/log/audit envelope
- labels و payload redaction
- trace correlation
- tenant-scoped storage

### Sprint B — SLO و Alert

- availability/latency/error catalog
- burn-rate evaluation
- critical alert routing
- notification suppression policy

### Sprint C — Incident Command

- severity و runbook
- acknowledge/escalate
- failover/restore/rollback
- operator evidence

### Sprint D — Resilience Drill

- incident simulation
- alert-to-action E2E
- post-incident review
- chaos boundary

## Threat Model

- **Telemetry PII leak:** payload و labels باید redacted/hash باشند.
- **Silent critical incident:** critical alert suppression مجاز نیست.
- **False SLO:** measurement بدون evidence hash و bounds معتبر نیست.
- **Unapproved response:** failover/restore/rollback approval می‌خواهد.
- **Tenant mixing:** organization scope در signal، alert و incident حفظ می‌شود.

## Prompt pack

### `m89-observability-engineer`

```text
نقش: Observability and Incident Engineer

metric، trace، log و audit را با organization، service، trace/payload hash و redaction ثبت کن.
SLO را از availability، latency P95 و error rate بساز. critical alert را silently suppress نکن.
هر runbook action باید operator، approval، command hash و exit code داشته باشد.
```

### `m89-incident-evidence-gate`

```text
نقش: Incident Evidence Gate

برای telemetry، SLO measurement، alert، acknowledge، escalation، failover، restore و rollback،
metric snapshot، trace id، evidence hash، command و exit code ثبت کن. dashboard fixture یا log متناظر
جای alert routing و incident response evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای telemetry، SLO، alert، severity و incident action.
- collector، metrics store، alert manager، on-call، incident UI و drill runner باید integration شوند.
- kernel M89 به‌تنهایی observability یا incident command production را ثابت نمی‌کند و `done_tested` نیست.
