# فاز M41: Data Lifecycle، Analytics و Metering Runtime

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-SE-04`، `GAP-DA-03`، `GAP-DA-04`، `GAP-DA-05`، `GAP-OB-04`، `GAP-CP-03`
**کد kernel:** `src/core/data-lifecycle-analytics-runtime.ts`
**تست:** `test/next-runtime-phases.test.ts`

## هدف و مرز

M41 قرارداد retention sweep، legal hold، analytics event store، scoped query،
free/paid/local entitlement و full-text search را تعریف می‌کند. این فاز deletion worker،
analytics warehouse، billing provider، full-text index، seed fixture یا dashboard backend
واقعی اجرا نمی‌کند. هزینه و entitlement بدون usage evidence و reconciliation موفق اعلام نمی‌شود.

## معماری

lifecycle planner candidateهای deletion را با organization، cutoff، legal hold و approval
فیلتر می‌کند. event ledger رویدادهای tenant-bound را با sequence و payload hash می‌پذیرد.
analytics query بر اساس organization/project/run scope محدود می‌شود. entitlement planner
mode و unit budget را قبل از call بررسی می‌کند؛ search surface query hash و result limit
دارد و deleted record را از default surface خارج می‌کند.

## قراردادهای اصلی

- `planLifecycleSweep` legal hold، cutoff، candidate و approval را به deletion plan تبدیل می‌کند.
- `validateAnalyticsEvent` organization، sequence، payload hash و event-specific identity را بررسی می‌کند.
- `decideAnalyticsQuery` visibility، tenant scope و time window را gate می‌کند.
- `decideUsageEntitlement` free/paid/local، unit budget، local-only و pre-run budget را enforce می‌کند.
- `validateFullTextQuery` search scope، project identity، result bound و deleted-record policy را validate می‌کند.

## sprintها

### Sprint A — Retention و Deletion

- retention class و deletion candidate
- legal hold و cascade manifest
- soft-delete، hard-delete و audit event
- restore/deletion propagation evidence

### Sprint B — Analytics Event Store

- append-only event schema و sequence
- run/provider/approval/cost event mapping
- tenant-safe aggregation و warehouse export
- replay/read-only analytics query

### Sprint C — Metering و Entitlement

- free-tier/BYOK/local usage accounting
- pre-run quota و post-run reconciliation
- paid entitlement/billing boundary
- invoice/cost discrepancy بدون raw credential

### Sprint D — Search و Dashboard

- full-text project/run/artifact index
- query ACL، ranking و retention filtering
- org/run cost dashboard
- analytics deletion/export و privacy review

## Threat Model

- **Retention bypass:** legal hold و approval قبل از deletion اعمال می‌شوند؛ candidate خارج
  از tenant یا بدون cutoff حذف نمی‌شود.
- **Analytics tenant leak:** event و query organization-bound هستند؛ visibility project/run
  بدون identifier معتبر رد می‌شود.
- **Metering fraud:** unit budget، idempotency و actual usage باید reconcile شوند؛ free/local
  zero-cost به‌معنای جعل مصرف یا دورزدن quota نیست.
- **Search privacy:** deleted record در default search دیده نمی‌شود؛ query hash و result bound
  از exfiltration گسترده جلوگیری می‌کنند.

## Prompt pack

### `m41-data-lifecycle-engineer`

```text
نقش: Data Lifecycle and Analytics Runtime Engineer

deletion را با tenant، cutoff، legal hold، cascade و approval مدل کن. analytics event باید
sequence و payload hash داشته باشد و query به organization/project/run محدود شود. free،
paid، BYOK و local را با unit budget و usage واقعی reconcile کن. full-text search نباید
deleted یا cross-tenant data را برگرداند.
```

### `m41-metering-evidence-gate`

```text
نقش: Lifecycle and Metering Evidence Gate

برای retention sweep، legal hold، event append، analytics query، usage reconciliation،
search ACL و dashboard aggregation، command، exit code، event hash، tenant probe و audit
ثبت کن. unit ledger یا mock billing/search backend production evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای legal hold، deletion candidate، event sequence، scoped query، budget
  overrun و deleted search.
- deletion worker، event store، billing/entitlement adapter، full-text index و dashboard
  باید در integration واقعی اجرا و با tenant fixture بررسی شوند.
- deletion completion، invoice correctness، dashboard accuracy یا cost saving بدون evidence
  مستقل `done_tested` نیست.
