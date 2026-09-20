# فاز M163: FinOps Budget Guardrails و Usage Reconciliation

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/finops-guardrail-runtime.ts`
**تست:** `test/next-platform-hardening-phases-7.test.ts`
**gap:** `GAP-OB-10`

## هدف و مرز

M163 پیش از اجرای provider، token/cost reservation و hard stop را enforce می‌کند و پس از اجرا usage
واقعی را با receipt آشتی می‌دهد. حالت‌های free، BYOK، local و paid باید هزینه، egress و fallback
شفاف داشته باشند. این فاز usage ledger، provider receipt adapter، price catalog، billing، alerting یا
budget gateway واقعی نیست.

## معماری

- `validateM163Budget`: period، token/cost limit، mode، egress، hard stop و fallback.
- `decideM163Reservation`: atomic reservation، remaining budget، expiry و idempotency.
- `validateM163Usage`: estimated/actual، provider receipt، reconciliation و redaction.
- `decideM163Circuit`: failure/cost threshold، cooldown و approval.

Local mode egress ندارد؛ BYOK هزینه provider را حذف نمی‌کند و paid fallback فقط با انتخاب صریح مجاز
است. free-tier quota و provider terms باید قبل از reservation بررسی شوند. budget deny باید به کاربر
دلیل و fallback موجود را بگوید، نه اینکه silent upgrade یا account creation انجام دهد.

## sprint plan

### Sprint A — Budget model

mode matrix، token/cost catalog، period، hard stop و fallback policy.

### Sprint B — Reservation

atomic quota، idempotency، expiry، concurrent spend و preflight.

### Sprint C — Reconciliation

provider receipt، estimate/actual delta، append-only ledger و correction.

### Sprint D — Guardrail operations

circuit، alert، dashboard، anomaly review و provider outage drill.

## Threat Model

- **Overspend race:** atomic reservation و idempotency.
- **Provider receipt mismatch:** append-only reconciliation و signed receipt.
- **Silent paid fallback:** explicit mode/approval و fail-closed.
- **Quota exhaustion:** hard stop، local/BYOK fallback یا denial شفاف.
- **Tenant budget leak:** budget/usage/reservation tenant-bound.
- **Cost metric tampering:** immutable usage evidence و independent aggregation.

## prompt pack

### `m163-finops-engineer`

```text
نقش: FinOps Guardrail Engineer

پیش از provider call، mode، token/cost limit، egress، quota و atomic reservation را بررسی کن. hard
stop را دور نزن. بعد از اجرا estimate را با provider receipt آشتی بده و actual usage redacted را در
ledger ثبت کن. paid fallback فقط با انتخاب و approval صریح مجاز است.
```

### `m163-finops-auditor`

```text
نقش: FinOps Auditor

reservation race، receipt mismatch، silent upgrade، provider quota، tenant accounting، circuit
cooldown و alert را بررسی کن. محاسبه در memory یا mock receipt جای ledger durable و reconciliation واقعی نیست.
```

## DoD و production evidence boundary

- budget valid/invalid، reservation race/expiry، usage reconciliation و circuit open/close تست شوند.
- usage ledger، cost catalog، provider receipt adapter، atomic reservation store، gateway، alerting و dashboard باید متصل شوند.
- kernel M163 به‌تنهایی cost accuracy، billing correctness، quota SLA یا جلوگیری از overspend production claim نیست.
