# فاز M183: Service Entitlement، SLA و Degraded Disclosure

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/service-entitlement-runtime.ts`
**تست:** `test/next-platform-hardening-phases-11.test.ts`
**gap:** `GAP-CP-20`

## هدف و مرز

M183 entitlement را به capability، quota، budget، provider policy، expiry و no-silent-upgrade وصل می‌کند؛
admission نباید capability یا هزینه‌ای خارج از plan ایجاد کند. SLA فقط با window و evidence قابل ادعاست و
حالت degraded/fallback باید به کاربر گفته شود. این فاز billing provider، usage ledger durable، SLA
monitor، legal terms یا entitlement service واقعی نیست.

## معماری

- `validateM183Entitlement`: capability، quota، budget، expiry، approval و tenant.
- `decideM183Admission`: requested capability، estimated cost، quota، egress، degraded disclosure و idempotency.
- `validateM183SlaEvidence`: time window، target/observed availability، samples، incident و approval.
- `decideM183Disclosure`: evidence expiry، fallback disclosure، no-false-guarantee و approval.

Local-first entitlement باید هزینه و egress صفر/محلی را دقیق نشان دهد؛ free-tier محدودیت quota را پنهان
نمی‌کند و BYOK/hosted بدون approval فعال نمی‌شود. هیچ plan claim، uptime promise یا fallback success بدون
شاهد معتبر منتشر نمی‌شود.

## Sprint plan

### Sprint A — Entitlement registry

plan، mode، capability، quota، budget، policy hash و expiry.

### Sprint B — Admission و metering boundary

cost estimate، quota reservation، egress، idempotency و degraded mode.

### Sprint C — SLA evidence

window، sample، availability، incident linkage و approval.

### Sprint D — Honest disclosure

claim، expiry، fallback، user-facing state و no-false-guarantee review.

## Threat Model

- **Capability over-entitlement:** exact capability و quota gate.
- **Silent paid upgrade:** no-silent-upgrade و explicit approval.
- **Quota/cost surprise:** estimated cost و hard admission denial.
- **False SLA promise:** fresh windowed evidence و incident linkage.
- **Hidden degradation:** mandatory fallback disclosure.
- **Cross-tenant plan leak:** tenant-bound entitlement/admission.

## prompt pack

### `m183-entitlement-engineer`

```text
نقش: Service Entitlement Engineer

plan را با mode، capability، quota، budget، provider policy و expiry بساز. admission باید cost، egress،
idempotency و degraded state را کنترل کند. هیچ upgrade یا SLA را بی‌approval و بدون evidence اعلام نکن
و fallback را صریح به کاربر نشان بده.
```

### `m183-service-auditor`

```text
نقش: Service Entitlement Auditor

capability escalation، quota surprise، silent paid path، stale SLA evidence، false uptime claim و hidden
fallback را بررسی کن. plan mock یا status text بدون metering/evidence store جای entitlement و disclosure واقعی نیست.
```

## DoD و production evidence boundary

- entitlement، quota admission، expiry، SLA window، degraded admission و disclosure denial تست شوند.
- entitlement/billing adapter، usage ledger، quota gateway، SLA monitor، incident store و disclosure UI باید متصل شوند.
- kernel M183 به‌تنهایی billing correctness، SLA compliance، availability، cost reconciliation یا legal guarantee production claim نیست.
