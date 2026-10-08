# فاز M73: Platform Resilience، SLO، Backup/Restore و Chaos

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-OB-01`، `GAP-OB-03`، `GAP-OB-05`، `GAP-OB-06`، `GAP-PO-01`، `GAP-PO-03`
**کد kernel:** `src/core/platform-resilience-runtime.ts`
**تست:** `test/next-governance-and-ecosystem-phases.test.ts`

## هدف و مرز

M73 پایداری پلتفرم را از health metric به SLO، error budget، encrypted backup، restore evidence،
incident action و chaos drill می‌رساند. RPO/RTO، runbook، failover و rollback باید قابل‌اندازه‌گیری
باشند. این فاز monitoring backend، backup store، Kubernetes/Compose، failover executor، chaos
runner یا DR certification واقعی را اجرا نمی‌کند.

## معماری

`PlatformSloContract` availability، latency P95، error budget، alert threshold و owner را
ثبت می‌کند. `BackupRestoreEvidence` encrypted backup، hash، restore exit code/count، RPO/RTO و
verification hash دارد. `ResilienceIncident` severity، evidence، runbook و selected action را
ثبت می‌کند. `PlatformChaosExperiment` target/failure mode، duration، blast radius، rollback و
production approval را محدود می‌کند.

## قراردادهای اصلی

- `validatePlatformSlo` target، error budget، alert threshold و approval را بررسی می‌کند.
- `validateBackupRestoreEvidence` encryption، timestamp، restore، RPO/RTO و verification را gate می‌کند.
- `decidePlatformIncident` severity، evidence، runbook و response action را enforce می‌کند.
- `validatePlatformChaosExperiment` duration، blast radius، rollback و production approval را محدود می‌کند.

## sprintها

### Sprint A — SLO و Alerting

- service/model/provider SLO
- latency/error/availability catalog
- error budget burn
- alert threshold و escalation

### Sprint B — Backup/Restore

- encrypted backup
- database/object/event store restore
- RPO/RTO measurement
- verification و restore rehearsal

### Sprint C — Incident Operations

- incident/runbook/severity
- failover/restore/rollback action
- acknowledge/escalate/resolve
- post-incident evidence

### Sprint D — Chaos و Self-host

- API/database/queue/provider/sandbox/webhook failure
- bounded blast radius
- Compose/Kubernetes drill
- DR/chaos report و remediation

## Threat Model

- **False resilience:** SLO بدون metric و restore verification معتبر نیست؛ backup hash و record count بررسی می‌شوند.
- **Data loss:** restore evidence، RPO/RTO و encrypted backup قبل از DR claim لازم است.
- **Unbounded chaos:** duration و blast radius محدود، rollback plan اجباری و production chaos approval لازم است.
- **Incident suppression:** critical incident فقط failover/restore/rollback/human review می‌پذیرد.
- **Operational tenant leak:** metrics/incident/dashboard organization-scoped باقی می‌مانند.

## Prompt pack

### `m73-platform-resilience-engineer`

```text
نقش: Platform Resilience Engineer

SLO را با availability، latency، error budget و alert threshold versioned کن. backup را
encrypted و restore را با exit code، record count، RPO/RTO و verification ثابت کن. incident
را با runbook و action کنترل کن. chaos duration/blast radius محدود و rollbackدار باشد؛
production chaos همیشه approval می‌خواهد.
```

### `m73-resilience-evidence-gate`

```text
نقش: Resilience Evidence Gate

برای SLO، alert burn، backup، restore، RPO/RTO، incident، failover، chaos و rollback، metric
snapshot، backup/restore artifact، command، exit code و owner ثبت کن. SLO document یا backup
fixture جای restore drill و chaos evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای SLO، error budget، backup encryption، restore، incident action، chaos bounds و rollback.
- monitoring/alerting، backup store، restore runner، deployment/self-host، incident system و chaos runner باید integration شوند.
- resilience kernel به‌تنهایی availability، DR readiness یا RPO/RTO production را ثابت نمی‌کند و `done_tested` نیست.
