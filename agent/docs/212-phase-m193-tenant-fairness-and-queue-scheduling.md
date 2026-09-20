# فاز M193: Tenant Fairness و Queue Scheduling

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/fair-scheduler-runtime.ts`
**تست:** `test/next-platform-hardening-phases-13.test.ts`
**gap:** `GAP-EX-23`

## هدف و مرز

M193 admission و allocation را به quota، slot، max share، starvation bound، reserved capacity،
preemption، lease، idempotency و fairness evidence bind می‌کند. هدف جلوگیری از noisy neighbor و گرسنگی
tenantهاست، نه تضمین کیفیت مدل یا SLA. این فاز durable queue، scheduler، autoscaler، worker fleet یا
provider quota adapter واقعی نیست.

## معماری

- `validateM193Workload`: slot، cost، deadline، quota، fairness class، idempotency و tenant.
- `decideM193Admission`: active/max slots، share cap، starvation، reservation، request و approval.
- `validateM193Allocation`: granted slots، queue position، preemption، lease، bound و tenant.
- `validateM193FairnessEvidence`: window، tenant shares، disparity، sample، starvation و budget evidence.

Local-first scheduler مسیر پیش‌فرض است؛ free-tier/BYOK providers با quota/rate limit خودشان باید در
admission دیده شوند و fallback صادقانه اعلام شود. reserved/priority هیچ مسیر پنهان برای دورزدن policy
یا tenant isolation ایجاد نمی‌کند.

## Sprint plan

### Sprint A — Workload admission

slot، cost، deadline، quota، idempotency و fairness class.

### Sprint B — Capacity/fairness

active/max slot، tenant share، max share، starvation و reserved capacity.

### Sprint C — Allocation

queue position، bounded lease، preemption و worker handoff.

### Sprint D — Fairness evidence

service share window، disparity، starvation bound، redaction و budget linkage.

## Threat Model

- **Noisy neighbor:** max share و tenant-bound admission.
- **Starvation:** queue position و starvation bound.
- **Priority abuse:** reserved approval و fairness evidence.
- **Overcommit:** active/max slot و quota.
- **Duplicate execution:** idempotency key و bounded lease.
- **Provider mismatch:** budget/quota evidence و explicit fallback.

## prompt pack

### `m193-fair-scheduler-engineer`

```text
نقش: Fair Scheduler Engineer

workload را با slot، cost، deadline، quota، fairness class و idempotency بگیر. admission باید max capacity،
max tenant share، starvation bound و reserved policy داشته باشد. allocation باید lease، queue position،
preemption و tenant evidence بدهد و fairness window را redacted ثبت کند.
```

### `m193-scheduler-auditor`

```text
نقش: Fair Scheduling Auditor

noisy neighbor، starvation، priority bypass، overcommit، duplicate run و provider quota mismatch را بررسی
کن. round-robin mock یا queue length جای scheduler durable، quota adapter و fairness evidence واقعی نیست.
```

## DoD و production evidence boundary

- workload، over-capacity denial، fair admission، allocation، bounded lease و fairness evidence تست شوند.
- durable queue، scheduler، lease store، autoscaler، provider quota adapter و fairness telemetry باید متصل شوند.
- kernel M193 به‌تنهایی fair scheduling، starvation freedom، quota accuracy، autoscaling یا SLA production claim نیست.
