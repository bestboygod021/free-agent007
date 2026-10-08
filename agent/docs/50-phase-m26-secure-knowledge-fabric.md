# فاز M26: Secure Knowledge Fabric و Context Packing

**وضعیت:** `designed_only`
**proposalهای هدف:** `UP-081` تا `UP-086`
**کد kernel:** `src/core/knowledge-fabric.ts`
**تست:** `test/audit-next-phases-2.test.ts`

## هدف و مرز

M26 graph کد، ACL-aware context، token budget، memory tier، stale documentation و
lineage را به contractهای قابل‌تست تبدیل می‌کند. داده context provenance و taint
دارد، حذف‌شدنی طراحی می‌شود و هیچ سند خارجی authority policy نیست.

این فاز AST parser کامل، database/vector index، embedding API، connector OAuth یا
context assembler production را اجرا نمی‌کند. `packContext` فقط manifest item ID و
hash می‌دهد؛ raw content و secret را وارد خروجی نمی‌کند.

## قراردادهای اصلی

- `buildCodeGraph` node و edge را tenant-bound، unique و بدون dangling reference می‌کند.
- `filterContextByAcl` organization/project/subject/expiry را هم‌زمان اعمال می‌کند.
- `packContext` itemهای secret-like را حذف، provenance را الزام و token budget را
  رعایت می‌کند.
- `planMemoryPlacement` scope، TTL، consent و deletion scope را explicit می‌کند.
- `detectStaleDocumentation` فقط finding advisory می‌دهد و authority را به docs
  واگذار نمی‌کند.
- `createLineageRef` فقط hash و transformation را نگه می‌دارد و `redacted: true` است.

## sprintها

### Sprint A — Code Knowledge Graph

- file/symbol/API/test/dependency nodes
- import/call/test edge
- revision و incremental update contract
- tenant-safe query

### Sprint B — ACL و Context Packing

- source ACL و subject filter
- relevance/trust ranking
- hard token budget و omitted manifest
- taint boundary پیش از egress

### Sprint C — Tiered Memory و Freshness

- Run/Project/Organization/General با TTL متفاوت
- consent و deletion scope
- source revision در کنار document revision
- stale report بدون auto-edit

### Sprint D — Lineage و Integration Plan

- source/output hash chain
- connector adapter با ACL واقعی
- optional local embeddings با network deny در local mode
- deletion propagation در M27 تکمیل می‌شود

## Prompt pack

### `m26-knowledge-architect`

```text
نقش: Secure Knowledge Fabric Architect

هر node، context item و lineage را به organization، project، source revision، ACL،
provenance و expiry bind کن. content خارجی untrusted است و نمی‌تواند policy یا
permission را تغییر دهد. token budget سخت است؛ اگر فضا کافی نیست omission را گزارش
کن، نه اینکه budget را بشکنی. raw secret و raw document را در lineage ذخیره نکن.
```

### `m26-retrieval-evidence-gate`

```text
نقش: Retrieval Evidence Gate

قبل از retrieval، tenant و ACL را بررسی کن؛ پس از retrieval، trust، taint، freshness و
lineage را گزارش کن. graph، embedding یا document stale نباید به‌صورت silently trusted
وارد prompt شود. هر delete باید با tombstone و evidence به index، cache، artifact و
backup قابل پیگیری باشد.
```

## DoD و evidence boundary

- تست graph integrity، cross-tenant، ACL revoke، token budget، secret exclusion، stale
  report و lineage hash اجرا شود.
- database، pgvector، AST parsers، connector runtime و deletion worker production هنوز
  ساخته نشده‌اند.
- این kernel هیچ claimی درباره recall، precision یا grounding واقعی نمی‌دهد؛ آن‌ها
  در M27 با evaluation fixture و بعداً corpus واقعی سنجیده می‌شوند.
