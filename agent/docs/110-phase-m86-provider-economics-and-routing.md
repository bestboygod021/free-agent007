# فاز M86: Provider Economics، Quota و Routing

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-OB-04`، `GAP-CP-03`، `GAP-IN-10`، `GAP-PO-01`، `GAP-IG-08`
**کد kernel:** `src/core/provider-economics-runtime.ts`
**تست:** `test/next-orchestration-and-release-phases.test.ts`

## هدف و مرز

M86 provider catalog را به routing اقتصادی و privacy-aware وصل می‌کند. local-first، BYOK، free
API و paid API باید mode، consent، approval، terms، quota، health، structured capability و
fallback شفاف داشته باشند. این فاز provider adapter، billing ledger، invoice importer، rate
limiter، key vault یا smart router واقعی را اجرا نمی‌کند.

## معماری

`ProviderOfferContract` mode، endpoint/reference، price، quota، privacy، terms و health را
ثبت می‌کند. `decideProviderRoute` data class، allowed mode، selected/fallback chain، consent و
budget را بررسی می‌کند. `ProviderQuotaBudget` allowance و RPM را محدود می‌کند. reconciliation
با ledger/invoice hash و delta صریح، cost drift را نشان می‌دهد.

## قراردادهای اصلی

- `validateProviderOffer` endpoint، mode، terms، health، price و opaque key reference را validate می‌کند.
- `decideProviderRoute` privacy، mode، consent، approval، budget و fallback را gate می‌کند.
- `validateProviderQuotaBudget` cost allowance و request rate را بررسی می‌کند.
- `validateCostReconciliation` ledger، invoice، delta و local mode را reconcile می‌کند.

## sprintها

### Sprint A — Provider Catalog

- model/provider offer
- ToS و privacy review
- capability/structured output
- health/freshness

### Sprint B — Routing

- local-first selection
- BYOK/free/paid fallback
- privacy/data class route
- provider cooldown

### Sprint C — Quota و Budget

- RPM/TPM/cost allowance
- per org/run budget
- preflight denial
- near-limit warning

### Sprint D — Reconciliation

- usage ledger
- invoice import
- delta detection
- audit/export

## Threat Model

- **Hidden paid egress:** paid route بدون consent/approval رد می‌شود.
- **Confidential leakage:** confidential data فقط local-only provider می‌گیرد.
- **Raw credential:** key reference باید opaque باشد؛ raw token/password رد می‌شود.
- **Quota bypass:** request و cost هر دو پیش از route چک می‌شوند.
- **False cost:** delta بدون ledger/invoice evidence reconcile نمی‌شود.

## Prompt pack

### `m86-provider-economics-engineer`

```text
نقش: Provider Economics Engineer

provider offer را با mode، privacy، terms، health، quota و price ثبت کن. local-first و BYOK/free
را قبل از paid route انتخاب کن. confidential data را فقط local نگه دار. external route consent,
approval و budget لازم دارد. key فقط opaque reference باشد و ledger/invoice delta ثبت شود.
```

### `m86-routing-evidence-gate`

```text
نقش: Provider Routing Evidence Gate

برای offer، route، fallback، quota، RPM، cost و reconciliation، provider/model hash، privacy
class، consent، approval، ledger/invoice hash و command/exit code ثبت کن. mocked provider یا price
fixture جای routing، quota و accounting integration evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای offer، privacy route، fallback، quota، RPM و cost reconciliation.
- provider adapters، vault، rate limiter، usage/billing ledger، invoice importer و routing service باید integration شوند.
- kernel M86 به‌تنهایی cost accuracy، quota enforcement یا provider routing production را ثابت نمی‌کند و `done_tested` نیست.
