# فاز M109: Context Assembly و Repository Intelligence

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IN-03`، `GAP-IN-04`، `GAP-IN-05`، `GAP-IN-08`، `GAP-IN-12`
**کد kernel:** `src/core/context-assembly-runtime.ts`
**تست:** `test/next-product-surface-phases.test.ts`

## هدف و مرز

M109 source contract، repository snapshot/index، context budget و citation quality را به قرارداد
قابل بررسی تبدیل می‌کند. source باید tenant، ACL subject، snapshot، freshness، trust و redaction
داشته باشد. context assembly باید layer و path allowlist و token budget صریح داشته باشد.
repository index باید فایل untrusted و path traversal را حذف کند. این فاز parser/indexer واقعی،
vector store، embedding pipeline، context packer، ACL database یا delegation runtime را اجرا نمی‌کند.

## معماری

`M109ContextSourceContract` source lineage و access subject را نگه می‌دارد.
`M109ContextAssemblyRequest` لایه‌ها، sourceها، budget، path و local-only را gate می‌کند.
`M109RepositoryIndexEvidence` snapshot، parser، symbol/import count و safety checks را ثبت می‌کند.
`M109ContextQualityEvidence` citation، token usage، stale/omitted count و review را جمع می‌کند.

## قراردادهای اصلی

- `validateM109ContextSource`: freshness، tenant، trust، redaction و relative locator را بررسی می‌کند.
- `decideM109ContextAssembly`: source/layer، budget، path allowlist و citation boundary را gate می‌کند.
- `validateM109RepositoryIndex`: parser، snapshot، path safety و untrusted-file exclusion را validate می‌کند.
- `validateM109ContextQuality`: citation coverage، token budget، stale source و human review را enforce می‌کند.

## sprintها

### Sprint A — Repository Snapshot

- immutable snapshot
- parser/version
- symbol و import graph
- incremental update

### Sprint B — Context Layers

- repository/memory/run/document
- ACL-aware source selection
- freshness و invalidation
- path allowlist

### Sprint C — Context Packing

- token budget
- priority/compression
- citation hash
- local-only route

### Sprint D — Quality

- stale-source detection
- omitted-source explanation
- context review
- replayable assembly evidence

## Threat Model

- **Tenant context leak:** owner tenant و ACL subject در هر source لازم است.
- **Prompt injection from repository:** untrusted files وارد context trusted نمی‌شوند.
- **Stale code guidance:** freshness و stale count به evidence تبدیل می‌شود.
- **Path hallucination:** locator و indexed paths فقط relative/allowlisted هستند.
- **Context overflow:** token budget قبل از model call enforce می‌شود.

## Prompt pack

### `m109-context-engineer`

```text
نقش: Context and Repository Intelligence Engineer

source را با tenant، ACL subject، snapshot، content hash، freshness، trust و redaction بساز.
repository index باید untrusted files و path traversal را حذف کند. context assembly باید layer،
path allowlist، token budget و citation داشته باشد؛ حافظه stale را بی‌صدا trusted نکن.
```

### `m109-context-evidence-gate`

```text
نقش: Context Evidence Gate

برای snapshot، index، source selection، context pack و quality، parser/snapshot/hash، ACL، path،
token budget، citation، stale count، command و exit code ثبت کن. grep یا چند embedding نمونه جای
indexer، vector store، ACL query و replayable context evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای source، assembly، repository index و quality evidence.
- indexer/parser، vector/embedding store، ACL query، context packer و replay worker باید integration شوند.
- kernel M109 به‌تنهایی repository intelligence یا production RAG/context quality را ثابت نمی‌کند و `done_tested` نیست.
