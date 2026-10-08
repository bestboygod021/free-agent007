# فاز M113: Data Plane، Event Store، Search و Analytics

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-DA-01`، `GAP-DA-03`، `GAP-DA-04`، `GAP-DA-05`، `GAP-OB-04`
**کد kernel:** `src/core/data-plane-analytics-runtime.ts`
**تست:** `test/next-product-surface-phases.test.ts`

## هدف و مرز

M113 seed fixture، append-only event، governed search و analytics report را به قراردادهای
replayable تبدیل می‌کند. seed باید deterministic، redacted، versioned و idempotent باشد. event
باید sequence، previous hash، event hash، immutability و tenant داشته باشد. search باید scope،
ACL subject، tenant filter، limit/offset و PII safety را enforce کند. analytics فقط report tenant
scoped با cost redaction و source watermark تولید می‌کند. این فاز Prisma migration، PostgreSQL
RLS، event store، full-text index، analytics warehouse یا dashboard واقعی را اجرا نمی‌کند.

## معماری

`M113SeedFixtureContract` fixture/schema/version/hash/records و approval را نگه می‌دارد.
`M113AppendOnlyEvent` aggregate sequence و hash chain را ثبت می‌کند. `M113GovernedSearchRequest`
scope/query/ACL/pagination و tenant/PII gates دارد. `M113AnalyticsReportEvidence` period، event/run
counts، dimensions، aggregation، cost redaction و watermark را جمع می‌کند.

## قراردادهای اصلی

- `validateM113SeedFixture`: schema، hash، record count، privacy، determinism و idempotency را validate می‌کند.
- `validateM113AppendOnlyEvent`: sequence، previous hash، immutability، redaction و timestamp را بررسی می‌کند.
- `decideM113GovernedSearch`: scope، resource ID، pagination، ACL، tenant filter و PII safety را gate می‌کند.
- `validateM113AnalyticsReport`: period، counts، dimensions، aggregation، cost redaction و tenant scope را enforce می‌کند.

## sprintها

### Sprint A — Durable Schema

- migration/fixture version
- tenant/RLS boundary
- seed idempotency
- soft-delete relation

### Sprint B — Event Store

- append-only sequence
- hash chain
- event retention
- watermark/outbox

### Sprint C — Governed Search

- project/run/event scope
- full-text index
- ACL filter
- pagination و PII safety

### Sprint D — Analytics

- aggregation dimensions
- usage/cost report
- per-org/per-run view
- export/redaction

## Threat Model

- **Event mutation:** hash chain و immutable flag باید بررسی شود.
- **Seed contamination:** fixture deterministic و PII-redacted است.
- **Cross-tenant search:** tenant filter و ACL subject پیش‌شرط query هستند.
- **Analytics leakage:** cost و dimensions قبل از export redacted می‌شوند.
- **Unbounded query:** limit/offset و scope از search abuse جلوگیری می‌کنند.

## Prompt pack

### `m113-data-plane-engineer`

```text
نقش: Data Plane and Analytics Engineer

seed را versioned، deterministic، idempotent و PII-redacted بساز. event باید aggregate sequence،
previous/event hash، immutable و tenant scoped باشد. search با ACL، tenant filter، scope، limit و
PII safety gate شود. analytics باید watermark، dimensions، cost redaction و source evidence داشته باشد.
```

### `m113-data-evidence-gate`

```text
نقش: Data Plane Evidence Gate

برای seed، event، search و analytics، schema/version/hash chain، sequence، ACL، tenant filter،
watermark، counts، redaction، command و exit code ثبت کن. JSON fixture یا SQLite محلی جای migration،
RLS، durable event store، full-text index و analytics dashboard evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای seed، event، search و analytics.
- Prisma/PostgreSQL migration، RLS، durable event store/outbox، full-text index، analytics pipeline و dashboard باید integration شوند.
- kernel M113 به‌تنهایی durable data plane، tenant-safe search یا analytics production را ثابت نمی‌کند و `done_tested` نیست.
