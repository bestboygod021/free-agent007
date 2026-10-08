# فاز M128: FinOps، Usage Ledger، Quota Scheduling و Provider Allocation

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/finops-quota-runtime.ts`
**تست:** `test/next-foundation-hardening-phases.test.ts`
**gap:** `GAP-OB-07`

## هدف و مرز

M128 هزینه و ظرفیت provider را به تصمیم قبل از اجرا وصل می‌کند. usage ledger باید append-only، idempotent و tenant-bound باشد. quota decision باید requested/used units، cost limit، mode، consent، approval و fallback را بررسی کند. provider allocation باید quota، RPM، privacy، terms، fallback rank و evidence داشته باشد. reconciliation باید ledger/provider variance و budget را گزارش کند. این فاز billing provider، durable ledger database، quota scheduler، payment system یا provider API واقعی را پیاده نمی‌کند.

## معماری

- `validateM128UsageLedger`: quantity/cost، append-only، idempotency، source hash و local/free zero-cost boundary.
- `decideM128Quota`: quota/cost preflight، compute mode، consent، approval و local/read-only fallback.
- `validateM128ProviderAllocation`: remaining quota/RPM، privacy/terms، fallback rank و selected capacity.
- `validateM128CostReconciliation`: period، ledger/provider variance، budget، reviewer و reconcile state.

Local-first اولویت دارد. BYOK فقط reference است؛ raw API key ذخیره نمی‌شود. free-tier quota نباید با paid capacity یا unlimited success اشتباه شود.

## sprint plan

### Sprint A — Usage ledger

append-only event، idempotency، token/request/CPU/storage units و source provenance.

### Sprint B — Quota preflight

tenant/org limits، mode policy، cost ceiling، consent و hard stop.

### Sprint C — Provider allocation

quota/RPM، health/privacy/terms، fallback rank و fair scheduling.

### Sprint D — Reconciliation

provider statement، variance، budget breach، reviewer و customer-safe report.

## Threat Model

- **Quota overspend:** preflight و hard stop قبل از provider call لازم است.
- **Ledger tampering/duplicate:** append-only، idempotency و source hash لازم است.
- **Paid fallback in free/local:** mode wall و zero-cost assertion اجباری است.
- **Provider privacy drift:** terms/privacy evidence پیش از allocation لازم است.
- **Tenant cost leakage:** organization binding و redacted reports لازم است.
- **False reconciliation:** reviewer و variance threshold لازم است.

## prompt pack

### `m128-finops-engineer`

```text
نقش: FinOps and Quota Engineer

usage را append-only و idempotent ثبت کن. قبل از provider call quota، cost، compute mode، consent،
approval و fallback را gate کن. provider allocation باید quota/RPM، privacy، terms و fallback rank
داشته باشد؛ free/local هرگز paid cost یا unlimited capacity اعلام نکنند.
```

### `m128-cost-auditor`

```text
نقش: Cost and Quota Auditor

ledger/provider statement، variance، budget، tenant scope، mode و reviewer evidence را بررسی کن.
BYOK را فقط opaque reference نگه دار. عدد شبیه‌سازی‌شده، mock quota یا unit test به‌تنهایی billing
reconciliation یا provider capacity production نیست.
```

## DoD و production evidence boundary

- append-only ledger، quota denial، provider allocation، fallback و variance negative paths تست شوند.
- durable usage store، provider quota probes، scheduler، billing/reconciliation adapter و cost dashboard باید integration شوند.
- kernel M128 به‌تنهایی metering accuracy، billing correctness، quota enforcement یا provider economics production claim نیست.
