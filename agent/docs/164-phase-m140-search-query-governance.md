# فاز M140: Full-text Search و Query Governance

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/search-query-governance-runtime.ts`
**تست:** `test/next-platform-hardening-phases-3.test.ts`
**gap:** `GAP-DA-09`

## هدف و مرز

M140 جست‌وجوی پروژه، Run، artifact و knowledge را به index snapshot، ACL filtering، bounded query،
result integrity و audit متصل می‌کند. request باید query hash، subject ACL، field allowlist، row/byte
limit و sort داشته باشد. export query به permission و approval نیاز دارد. هر result باید rank، score،
freshness، ACL verification، tenant match و redaction داشته باشد. این فاز Elasticsearch/Postgres
adapter، parser، ranking engine، cache، pagination store یا search UI واقعی نیست.

## معماری و قراردادها

- `validateM140Index`: snapshot، source، document count، schema و ACL/tenant filter.
- `decideM140Query`: query/index boundary، field allowlist، row/byte budget و export gate.
- `validateM140Result`: rank/score، content/freshness hash و ACL/tenant/redaction.
- `validateM140SearchAudit`: returned count، bytes، row limit، result hashes و export evidence.

query text، document content و PII در audit ذخیره نمی‌شود؛ query/content hash و field policy ثبت می‌شوند.

## sprint plan

### Sprint A — Index contract

snapshot، schema، source types، ACL filter و tenant boundary.

### Sprint B — Query planner

query class، field allowlist، sort، cursor و bounded budgets.

### Sprint C — Result verification

rank/score، freshness، ACL check، redaction و content hash.

### Sprint D — Governance

export approval، query audit، rate/cost budget و cache invalidation.

## Threat Model

- **Cross-tenant result:** index/query/result tenant match لازم است.
- **ACL bypass:** index ACL filtering و per-result verification اجباری است.
- **Unbounded query:** max results، max bytes و row limit اعمال می‌شود.
- **Stale result:** freshness hash به result متصل است.
- **Export abuse:** export permission و approval لازم است.
- **Content leakage:** field allowlist و redaction اجباری است.

## prompt pack

### `m140-search-engineer`

```text
نقش: ACL-aware Search Engineer

index را با snapshot، schema، source، ACL filter و tenant boundary ثبت کن. query باید query hash،
ACL subject، field allowlist، sort، cursor، max results و max bytes داشته باشد. result را با rank،
freshness، ACL verification، tenant match و redaction برگردان؛ export همیشه approval-bound است.
```

### `m140-search-auditor`

```text
نقش: Search Governance Auditor

index snapshot، ACL، tenant، query budget، field leakage، stale result، export approval و audit
count را بررسی کن. fixture search یا lexical mock جای indexer، ranking backend و production ACL
retrieval واقعی نیست.
```

## DoD و production evidence boundary

- index validation، bounded lookup، export denial، ACL mismatch و result integrity تست شوند.
- indexer، search backend، ACL service، ranking/freshness pipeline، pagination/cache و search UI باید integration شوند.
- kernel M140 به‌تنهایی search quality، ACL completeness، freshness یا export compliance production claim نیست.
