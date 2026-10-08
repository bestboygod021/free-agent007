# فاز M22: Resilience، SLO، FinOps و Provider Operations

**وضعیت:** `designed_only`
**پیش‌نیاز:** M8 Reliability، M11 Entitlements، M19 Durable Events و M21 Egress/Supply Chain
**کد اولیه:** `src/core/resilience-operations.ts`

M22 تصمیم‌های قبل از اجرا و failure handling را یکپارچه می‌کند: budget preflight،
provider circuit، quota-aware endpoint selection، SLO/error budget و restore plan.
ماژول فعلی provider را صدا نمی‌زند، backup را restore نمی‌کند و metric واقعی تولید
نمی‌کند.

## قراردادهای کلیدی

- `decidePreRunBudget` پیش از model/tool call هزینه و token را hard-stop می‌کند.
- `transitionCircuit` برای failure/cooldown/half-open state استفاده می‌شود؛ retry
  بی‌حد و دورزدن quota مجاز نیست.
- `chooseQuotaEndpoint` فقط endpoint سالم، غیر-cooldown و دارای quota را انتخاب می‌کند.
- `evaluateSlo` availability، p95 latency و error budget را جدا verdict می‌دهد.
- `planRestore` tenant scope، RPO/RTO، environment و human approval را bind می‌کند.

## چهار sprint

### A — Preflight و quota

- cost/token estimator با M11 ledger
- provider quota با RPM/RPD/TPM/TPD
- local/free/paid routing boundary
- hard stop و user-facing denial

### B — Health و circuit

- provider health probe
- circuit breaker و cooldown
- failover با handoff note
- response cache tenant-safe و opt-in

### C — SLO و FinOps

- metric catalog و error budget
- cost-quality optimizer با approval
- energy metering برای local run
- alert، dashboard و incident owner

### D — Backup و recovery

- backup manifest و encryption
- isolated restore drill
- RPO/RTO measurement
- multi-region design و tenant/privacy verification

## Prompt pack

### `m22-operations-planner`

```text
نقش: Resilience and FinOps Planner

پیش از هر اجرا projected cost/token، quota، mode، provider health، circuit، SLO و
error budget را محاسبه کن. local/free را به paid تبدیل نکن. اگر سقف یا evidence
نامعلوم است stop کن و denial با دلیل و policy hash بده.
```

### `m22-recovery-evidence-gate`

```text
نقش: Recovery Evidence Gate

برای budget stop، quota exhaustion، circuit transition، failover، SLO alert، backup
integrity، isolated restore و RPO/RTO، command، timestamp، hash، exit code و audit
ثبت کن. restore claim بدون مشاهده محیط مقصد معتبر نیست.
```

## DoD

- pre-run budget/token hard gate
- quota/circuit/health integration
- SLO dashboard و error-budget action
- opt-in tenant-safe cache و energy report
- backup/restore drill با RPO/RTO واقعی

تا اتصال provider، metrics و storage recovery واقعی، M22 `designed_only` است.
