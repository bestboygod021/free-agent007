# فاز M32: Operations Evidence، SLO، FinOps و Disaster Recovery

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-OB-01`، `GAP-OB-02`، `GAP-OB-03`، `GAP-OB-04`، `GAP-OB-05`، `GAP-OB-06`
**کد kernel:** `src/core/operations-evidence.ts`
**تست:** `test/audit-followup-phases.test.ts`

## هدف و مرز

M32 metric، SLO، error budget، cost reconciliation، incident action و restore drill را
به evidence قابل‌بررسی تبدیل می‌کند. این فاز Prometheus/OTel backend، dashboard، backup
storage، restore execution یا on-call واقعی راه‌اندازی نمی‌کند.

## معماری

Instrumentation از run، tool، queue و provider یک event/metric envelope tenant-bound
می‌سازد و collector آن را به metric/trace backend می‌فرستد. SLO evaluator پنجره را به
error-budget و incident action تبدیل می‌کند؛ FinOps ledger با usage provider reconcile
می‌شود. Backup coordinator manifest و checksum تولید می‌کند و restore controller فقط
در isolated target، پس از approval، restore/verify/rollback را اجرا و evidence chain را
به incident و audit متصل می‌کند.

## قراردادهای اصلی

- `validateMetricSample` tenant/run/unit/timestamp را validate می‌کند.
- `evaluateSloWindow` availability، latency و error budget را به allow یا incident gate
  تبدیل می‌کند.
- `reconcileCost` تخمین و مصرف واقعی را با idempotency key و tolerance مقایسه می‌کند.
- `planRestoreDrill` RPO/RTO، tenant scope، environment و evidence لازم را ثبت و
  human approval را اجباری می‌کند.
- `verifyIncidentAction` اجازه status verified بدون evidence را نمی‌دهد.

## Threat Model

- **Telemetry poisoning و tenant leak:** metric name، unit، range، tenant/run binding و cardinality باید validate شوند و cross-tenant samples رد شوند.
- **False SLO/cost claims:** availability، latency، usage و cost فقط با timestamp، idempotency و source evidence reconcile می‌شوند؛ mock dashboard success نیست.
- **Destructive recovery:** restore فقط در isolated environment، با approval، checksum، RPO/RTO measurement و rollback evidence اجرا می‌شود.
- **Incident suppression:** breach باید incident/stop gate ایجاد کند؛ verified بدون owner، step، status و evidence hash قابل قبول نیست.

## sprintها

### Sprint A — Metrics و Tracing

- metric catalog و unit normalization
- traceId/runId در model/tool/queue
- cardinality و tenant privacy
- alert rule و dashboard contract

### Sprint B — SLO و Incident

- availability، latency، error و quality SLO
- error budget burn و incident threshold
- runbook step، owner و escalation
- chaos scenario با approval

### Sprint C — FinOps و Reconciliation

- estimated/actual token و cost
- free/local zero-cost guard
- provider reported usage و discrepancy
- tenant/run aggregation بدون leak

### Sprint D — Backup و Restore Drill

- backup checksum و retention
- isolated restore پیش از production
- RPO/RTO measurement
- evidence post-restore و rollback

## Prompt pack

### `m32-operations-engineer`

```text
نقش: Operations and Recovery Engineer

هر metric را به tenant/run، unit و timestamp bind کن. SLO breach باید incident یا
stop decision بدهد، نه success claim. هزینه تخمینی را با usage واقعی reconcile کن.
restore فقط در محیط ایزوله و با approval انسانی انجام شود؛ RPO/RTO بدون command و
evidence قابل ادعا نیست.
```

### `m32-incident-evidence-gate`

```text
نقش: Incident Evidence Gate

برای alert، trace، error budget، cost discrepancy، backup، restore و chaos، owner،
command، exit code، duration، checksum و tenant isolation evidence ثبت کن. dashboard
mock، metric unit test و plan restore جای drill واقعی را نمی‌گیرد.
```

## DoD و evidence boundary

- unit برای metric validation، SLO breach، cost tolerance، restore approval و incident evidence.
- OTel/Prometheus، backup object store، restore runtime، chaos runner و on-call system
  باید در integration بعدی اجرا شوند.
- هیچ SLO، RTO، RPO یا cost saving production بدون measurement واقعی اعلام نمی‌شود.
