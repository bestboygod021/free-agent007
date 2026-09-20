# فاز M115: Provider Routing، Quota و Economics

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IN-06`، `GAP-IN-07`، `GAP-IN-09`، `GAP-OB-04`، `GAP-IG-08`
**کد kernel:** `src/core/provider-routing-economics-runtime.ts`
**تست:** `test/next-governance-integration-phases.test.ts`

## هدف و مرز

M115 provider offer، privacy-aware routing، quota/cooldown و route cost evidence را formalize
می‌کند. route باید mode انتخابی کاربر، capability، privacy، cost، latency، quota و fallback را
رعایت کند. local-only هرگز به remote provider نمی‌رود. free/BYOK/local مسیرهای واقعی و paid مسیر
صریح approval دارد. این فاز provider adapters، live health probes، pricing catalog، quota store،
key rotation یا routing service واقعی را اجرا نمی‌کند.

## معماری

`M115ProviderOfferContract` provider/model، mode، endpoint، capability، price، quota، privacy،
health و terms را نگه می‌دارد. `M115RouteRequest` allowed modes، budget، latency، local-only،
fallback و consent را gate می‌کند. `M115QuotaEvidence` quota/RPM/reset/cooldown و observed headers
را ثبت می‌کند. `M115RoutingOutcome` route reason، cost/latency، fallback و privacy boundary را جمع می‌کند.

## قراردادهای اصلی

- `validateM115ProviderOffer`: endpoint، capability، price/quota، privacy، terms و health را validate می‌کند.
- `decideM115Route`: organization، mode، capability، privacy، cost، consent و fallback را gate می‌کند.
- `validateM115Quota`: quota/RPM، reset، cooldown و provider headers را بررسی می‌کند.
- `validateM115RoutingOutcome`: cost/latency، fallback، route evidence و privacy را enforce می‌کند.

## sprintها

### Sprint A — Provider Catalog

- provider/model offer
- capability/health
- price/currency
- ToS/privacy status

### Sprint B — Route Policy

- local/BYOK/free/paid mode
- capability matching
- data-local boundary
- fallback/deny

### Sprint C — Quota

- RPM/RPD/TPM
- reset/Retry-After
- cooldown
- key rotation evidence

### Sprint D — Economics

- usage/cost estimate
- per-org/per-run ledger
- budget stop
- route outcome audit

## Threat Model

- **Paid egress surprise:** mode، consent و explicit budget gate می‌شوند.
- **Local data leak:** local-only request remote offer را رد می‌کند.
- **Quota storm:** observed headers، reset و cooldown لازم‌اند.
- **Capability hallucination:** route فقط capability evidence ثبت‌شده را می‌پذیرد.
- **Cost bypass:** outcome cost و fallback audit می‌شوند.

## Prompt pack

### `m115-provider-routing-engineer`

```text
نقش: Provider Routing and Economics Engineer

offer را با mode، endpoint، capability، price، quota، privacy، health و terms ثبت کن. route باید
local/BYOK/free/paid، capability، local-only، budget، consent و fallback را رعایت کند. quota/RPM
با observed headers، reset و cooldown gate شود؛ route outcome cost/latency/privacy evidence بدهد.
```

### `m115-routing-evidence-gate`

```text
نقش: Routing Evidence Gate

برای offer، route، quota و outcome، provider/model/mode، capability، cost، latency، quota headers،
cooldown، fallback، command و exit code ثبت کن. جدول قیمت یا یک mock provider جای adapter، health
probe، quota store، failover و cost reconciliation evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای offer، route، quota و outcome.
- provider adapters، health/quota probes، encrypted key broker، routing service و usage ledger باید integration شوند.
- kernel M115 به‌تنهایی intelligent routing، quota enforcement یا provider economics production را ثابت نمی‌کند و `done_tested` نیست.
