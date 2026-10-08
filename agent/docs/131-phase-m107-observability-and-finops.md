# فاز M107: Observability، SLO، Incident Command و FinOps

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-OB-01`، `GAP-OB-02`، `GAP-OB-03`، `GAP-OB-04`، `GAP-OB-06`
**کد kernel:** `src/core/observability-finops-runtime.ts`
**تست:** `test/next-control-plane-phases.test.ts`

## هدف و مرز

M107 telemetry envelope، SLO/error budget، incident command و cost reconciliation را به قرارداد
قابل سنجش تبدیل می‌کند. telemetry باید redacted و trace-aware باشد. SLO target، window، budget و
burn rate دارد. incident باید commander، runbook، containment و postmortem due date داشته باشد.
FinOps recorded/provider cost را با variance و budget مقایسه می‌کند. این فاز collector، metrics
store، tracing backend، alert manager، on-call integration، cost provider API یا dashboard واقعی
را اجرا نمی‌کند.

## معماری

`TelemetryEnvelope` organization/run/event، kind، value، trace، sampling، redaction و timestamp
را نگه می‌دارد. `SloPolicyContract` indicator، target، window، budget، threshold و burn rate را
ثبت می‌کند. `IncidentCommandRecord` severity، commander، affected service، runbook و containment
را gate می‌کند. `M107CostReconciliationEvidence` usage و recorded/provider cost، variance، budget
و source hash را نگه می‌دارد.

## قراردادهای اصلی

- `validateM107Telemetry`: identity، value، trace، sampling و redaction را validate می‌کند.
- `decideM107Slo`: target، window، budget، burn rate و policy review را gate می‌کند.
- `validateM107Incident`: commander، runbook، redacted impact، containment و postmortem را بررسی می‌کند.
- `validateM107CostReport`: period، usage، provider variance، budget و reconciliation را enforce می‌کند.

## sprintها

### Sprint A — Telemetry

- metric/trace/log envelope
- trace propagation
- sampling policy
- redaction و retention

### Sprint B — SLO

- indicator catalog
- target/window
- error budget
- burn-rate alert

### Sprint C — Incident Command

- severity و commander
- runbook
- containment
- postmortem و customer update

### Sprint D — FinOps

- provider usage
- cost reconciliation
- budget stop
- per-org/per-run report

## Threat Model

- **Secret in telemetry:** redaction پیش از export اجباری است.
- **False health:** SLO از observed evidence و budget burn می‌آید، نه status دستی.
- **Incident confusion:** commander و runbook برای severity بالا لازم‌اند.
- **Cost drift:** provider و recorded cost با variance محدود مقایسه می‌شوند.
- **Budget bypass:** عبور از budget باید باعث operational hold شود.

## Prompt pack

### `m107-operations-engineer`

```text
نقش: Observability and FinOps Engineer

telemetry را با organization/run/event، trace، sampling و redaction طراحی کن. SLO باید indicator،
target، window، error budget و burn rate داشته باشد. incident با severity، commander، runbook و
containment ثبت شود. cost را با provider source، variance، budget و reconciliation متوقف‌پذیر کن.
```

### `m107-operations-evidence-gate`

```text
نقش: Operations Evidence Gate

برای telemetry، SLO، alert، incident و cost، trace/source hash، target/budget، commander/runbook،
redaction، provider delta، command و exit code ثبت کن. log دستی یا dashboard mock جای collector،
tracing backend، alerting، on-call و provider reconciliation evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای telemetry، SLO، incident و cost report.
- collector، metrics/tracing backend، alert manager، runbook/on-call، provider billing API و dashboard باید integration شوند.
- kernel M107 به‌تنهایی observability، SLO enforcement، incident response یا FinOps production را ثابت نمی‌کند و `done_tested` نیست.
