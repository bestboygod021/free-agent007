# فاز M91: Billing، Entitlements و Usage Reconciliation

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-CP-03`، `GAP-OB-04`، `GAP-PO-04`، `GAP-IG-08`
**کد kernel:** `src/core/billing-entitlement-runtime.ts`
**تست:** `test/next-operations-and-enterprise-phases.test.ts`

## هدف و مرز

M91 plan، entitlement، usage charge، invoice و subscription change را یکپارچه می‌کند. local،
free، BYOK و paid باید مسیرهای جدا و صادقانه داشته باشند. charge باید از usage ledger بیاید،
raw credential نداشته باشد و invoice با delta قابل reconciliation باشد. این فاز payment provider،
billing database، webhook، tax engine، invoice UI یا Enterprise upgrade service را اجرا نمی‌کند.

## معماری

`BillingPlanEntitlement` allowance، mode، effective/expiry و local fallback را ثبت می‌کند.
`BillingUsageCharge` quantity/unit price/total، ledger hash، state و idempotency دارد و raw
credential را type-level رد می‌کند. `BillingInvoiceEvidence` expected/reported/delta و provider
reference را reconcile می‌کند. subscription change برای upgrade/proration approval می‌خواهد.

## قراردادهای اصلی

- `validateBillingPlan` allowance، dates، mode، fallback و approval را بررسی می‌کند.
- `decideBillingUsageCharge` quantity، total، ledger، idempotency و credential safety را gate می‌کند.
- `validateBillingInvoiceEvidence` invoice/ledger/delta reconciliation را validate می‌کند.
- `decideBillingSubscriptionChange` plan transition، proration و approval را enforce می‌کند.

## sprintها

### Sprint A — Plan و Entitlement

- local/free/BYOK/paid catalog
- allowance و expiry
- per-org/run entitlement
- degraded/local fallback

### Sprint B — Usage Ledger

- run/token/storage/connector metric
- idempotency
- preflight authorization
- near-limit notification

### Sprint C — Invoice

- provider invoice adapter
- ledger reconciliation
- delta review
- audit export

### Sprint D — Subscription

- start/upgrade/downgrade/cancel/renew
- proration consent
- Enterprise/self-host route
- billing incident handling

## Threat Model

- **Quota bypass:** charge فقط پس از ledger و entitlement معتبر است.
- **Raw secret leakage:** billing object فقط reference/hash دارد، نه password/token.
- **False invoice:** reported و expected cost باید delta سازگار داشته باشند.
- **Paid surprise:** paid mode consent، approval و provider terms می‌خواهد.
- **Fallback deception:** local/free/BYOK availability صریح و قابل مشاهده است.

## Prompt pack

### `m91-billing-entitlement-engineer`

```text
نقش: Billing and Entitlement Engineer

plan را با mode، allowance، expiry و local fallback ثبت کن. usage charge باید از ledger، quantity،
unit price، total و idempotency ساخته شود و raw credential نداشته باشد. invoice را با expected/
reported/delta reconcile کن. paid upgrade و proration بدون consent/approval اجرا نشود.
```

### `m91-billing-evidence-gate`

```text
نقش: Billing Evidence Gate

برای plan، entitlement، charge، invoice، reconciliation و subscription change، plan/ledger/invoice
hash، quantity، delta، consent، approval، command و exit code ثبت کن. mock price یا UI plan جای payment
provider، durable ledger و invoice integration evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای plan، allowance، charge، invoice، delta و subscription.
- billing DB، payment/provider adapters، webhook، tax/invoice service، usage ledger و UI باید integration شوند.
- kernel M91 به‌تنهایی billing accuracy، payment collection یا Enterprise entitlement production را ثابت نمی‌کند و `done_tested` نیست.
