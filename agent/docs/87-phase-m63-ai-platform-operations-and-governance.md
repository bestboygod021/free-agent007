# فاز M63: AI Platform Operations، Quota و Governance

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-OB-01`، `GAP-OB-03`، `GAP-OB-04`، `GAP-OB-05`، `GAP-SE-08`، `GAP-PO-02`، `GAP-PO-06`
**کد kernel:** `src/core/ai-platform-operations-runtime.ts`
**تست:** `test/next-ai-platform-phases.test.ts`

## هدف و مرز

M63 چرخه عملیاتی model/provider را کامل می‌کند: health، latency، error rate، availability،
quota، token/cost budget، incident response و dashboard tenant-scoped. سلامت model، free API
badge و route recommendation باید با evidence زمانی جدا باشند. این فاز monitoring backend،
alert manager، billing، queue metrics یا incident automation واقعی را اجرا نمی‌کند.

## معماری

`ModelOperationalHealth` capability probe و evidence hash دارد. `ModelQuotaBudget` request/token/
cost limit و hard stop را نگه می‌دارد. `ModelOperationalIncidentRecord` outage، quota، quality/safety
regression و cost anomaly را با severity/action ثبت می‌کند. `validateModelOperationsDashboard`
metric window و tenant scope را enforce می‌کند. actionها `retry`، `cooldown`، `fallback`،
`disable` و `human_review` هستند.

## قراردادهای اصلی

- `validateModelOperationalHealth` status را با observed metrics و timestamp تطبیق می‌دهد.
- `decideModelQuotaBudget` hard stop و fallback را بر اساس request/token/cost limit تعیین می‌کند.
- `decideModelIncidentResponse` action متناسب با safety/quality/outage/cost incident را gate می‌کند.
- `validateModelOperationsDashboard` metric window، model scope و tenant isolation را validate می‌کند.

## sprintها

### Sprint A — Health و SLO

- provider/model probe
- latency/error/availability metric
- model health lifecycle
- user-visible degraded state

### Sprint B — Quota و Cost

- per-org/per-run/per-model usage
- RPM/RPD/TPM/TPD و monthly cost
- hard stop و budget alert
- free-tier cooldown و BYOK accounting

### Sprint C — Incident و Runbook

- outage/rate-limit/safety/quality/cost incident
- retry/cooldown/fallback/disable action
- acknowledgement و escalation
- rollback و post-incident evidence

### Sprint D — Operations Surface

- tenant-scoped dashboard
- alert/notification integration
- audit/retention و privacy
- backup/restore و chaos drill

## Threat Model

- **False healthy status:** health باید با probe/evidence و metric سازگار باشد؛ timestamp آینده یا metric متناقض رد می‌شود.
- **Quota overspend:** hard stop در request/token/cost از عبور بودجه جلوگیری می‌کند؛ fallback نیز policy-bound است.
- **Safety regression:** safety incident با retry ساده حل نمی‌شود و disable یا human review لازم دارد.
- **Tenant metric leak:** dashboard فقط tenant-scoped model/provider و window مجاز را می‌پذیرد.
- **Incident suppression:** severity، evidence، acknowledgement و selected action audit می‌شوند؛ incident بدون evidence بسته نمی‌شود.

## Prompt pack

### `m63-ai-operations-engineer`

```text
نقش: AI Platform Operations Engineer

health را با capability probe، latency، error rate و availability evidence بسنج. quota را در
request/token/cost per tenant/run/model حساب کن و hard stop داشته باش. safety/quality
regression را retry نکن؛ disable یا human review بده. dashboard tenant-scoped و route/fallback
user-visible باشد.
```

### `m63-operations-evidence-gate`

```text
نقش: AI Operations Evidence Gate

برای health probe، quota، cost، hard stop، incident، cooldown، fallback، disable، dashboard
و restore/chaos، metric snapshot، evidence hash، command، exit code و owner ثبت کن. in-memory
metric یا health fixture جای monitoring, alert و incident integration evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای health، metric consistency، quota، hard stop، incident action و tenant dashboard.
- monitoring، alerting، usage ledger، billing, incident system، backup/restore و chaos باید integration شوند.
- decision kernel به‌تنهایی SLO، availability، cost accuracy یا incident readiness production را ثابت نمی‌کند و `done_tested` نیست.
