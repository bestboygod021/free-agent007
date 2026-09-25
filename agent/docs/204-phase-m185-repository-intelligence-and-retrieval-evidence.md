# فاز M185: Repository Intelligence و Retrieval Evidence

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/repository-intelligence-runtime.ts`
**تست:** `test/next-platform-hardening-phases-12.test.ts`
**gap:** `GAP-IN-24`

## هدف و مرز

M185 repository snapshot را به commit-bound index، ACL، consent، exact-commit retrieval، path allowlist،
code evidence و refresh/deletion proof تبدیل می‌کند. نتیجه retrieval بدون commit match یا ACL evidence
وارد context نمی‌شود. این فاز git indexer، AST/semantic search، vector store، RAG service یا deletion
worker واقعی نیست.

## معماری

- `validateM185Snapshot`: repository/commit/snapshot/index/ACL hash، path count، consent و redaction.
- `decideM185Retrieval`: query، expected commit، path allowlist، bounded results، evidence، freshness و ACL.
- `validateM185CodeEvidence`: path/line/symbol/content hash، snapshot match و tenant.
- `decideM185Refresh`: new commit/index، deleted paths، deletion evidence و approval.

Local-first lexical/AST index بر semantic retrieval مقدم است؛ BYOK/free-tier embedding فقط با consent و
tenant policy فعال می‌شود. README، Issue، webpage و model payload داده untrusted هستند و authority
repository را تغییر نمی‌دهند.

## Sprint plan

### Sprint A — Snapshot/index

commit-bound snapshot، file path، index hash و ACL hash.

### Sprint B — Retrieval boundary

query hash، allowlist، result limit، exact commit و freshness.

### Sprint C — Evidence

line/symbol evidence، content hash، redaction و context citation.

### Sprint D — Refresh/deletion

commit refresh، deleted paths، stale index، purge evidence و rollback.

## Threat Model

- **Stale code advice:** exact commit و freshness.
- **Cross-tenant retrieval:** ACL/tenant match.
- **Path traversal:** allowlist و snapshot boundary.
- **Secret indexing:** redaction و secret scan.
- **Citation laundering:** content/line hash evidence.
- **Deletion residue:** refresh و deleted-path proof.

## prompt pack

### `m185-repository-intelligence-engineer`

```text
نقش: Repository Intelligence Engineer

snapshot را به commit، snapshot/index/ACL hash و consent bind کن. retrieval فقط با path allowlist، result
bound، exact commit، ACL و freshness مجاز است. code evidence باید line/symbol/content hash و redaction
داشته باشد و refresh حذف pathها را proof کند.
```

### `m185-repository-auditor`

```text
نقش: Repository Retrieval Auditor

stale index، cross-tenant result، path traversal، secret در index، citation جعلی و deletion residue را
بررسی کن. grep یا vector mock جای indexer، ACL retrieval و deletion propagation واقعی نیست.
```

## DoD و production evidence boundary

- snapshot، exact retrieval، path denial، code evidence، stale refresh و deletion path تست شوند.
- git/indexer، ACL retrieval، lexical/AST/semantic backend، secret scanner و refresh/deletion worker باید متصل شوند.
- kernel M185 به‌تنهایی repository completeness، RAG accuracy، ACL compliance یا no-secret index production claim نیست.
