# فاز M94: Retrieval، Semantic Memory و Human Feedback

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IN-03`، `GAP-IN-05`، `GAP-IN-13`، `GAP-SE-04`
**کد kernel:** `src/core/retrieval-memory-runtime.ts`
**تست:** `test/next-memory-security-client-phases.test.ts`

## هدف و مرز

M94 semantic memory را به retrieval قابل‌اندازه‌گیری و human feedback وصل می‌کند. memory باید
source/ACL/trust/expiry/PII state داشته باشد و retrieval با tenant، relevance و token budget
محدود شود. stale/unsafe feedback باید review شود و deletion/invalidation boundary داشته باشد.
این فاز embedding service، pgvector، RAG worker، feedback UI یا memory database واقعی را اجرا نمی‌کند.

## معماری

`SecureMemoryRecord` kind، content/source hash، embedding، ACL subject، trust، expiry و deletion را
ثبت می‌کند. `decideSecureRetrieval` candidates را deterministic sort و فقط memory معتبر tenant/
ACL/trust را انتخاب می‌کند. `RetrievalQualityEvidence` relevance، stale count، citation coverage و
tenant probe را می‌گیرد. `RetrievalFeedbackRecord` correct/incorrect/stale/unsafe و approval را نگه می‌دارد.

## قراردادهای اصلی

- `validateSecureMemoryRecord` provenance، embedding، redaction و deletion را بررسی می‌کند.
- `decideSecureRetrieval` ACL، tenant، stale، trust و token/result budget را gate می‌کند.
- `validateRetrievalQualityEvidence` count، citation coverage و tenant isolation را validate می‌کند.
- `decideRetrievalFeedback` stale/unsafe memory review و feedback evidence را enforce می‌کند.

## sprintها

### Sprint A — Memory Store

- episodic/semantic memory
- embedding و source lineage
- expiry/deletion
- tenant/ACL index

### Sprint B — Retrieval

- hybrid/vector search
- relevance/rerank
- context budget
- local-only mode

### Sprint C — Evaluation

- retrieval precision/recall
- stale/unsafe rate
- citation coverage
- regression corpus

### Sprint D — Feedback

- correct/incorrect feedback
- human review
- invalidation/reindex
- audit retention

## Threat Model

- **Cross-tenant memory:** candidate organization و ACL باید همسان باشد.
- **Stale memory:** stale/expired/deleted memory وارد retrieval نمی‌شود.
- **Untrusted authority:** untrusted source نمی‌تواند semantic authority باشد.
- **PII persistence:** memory فقط پس از redaction معتبر است.
- **Feedback poisoning:** stale/unsafe feedback approval و reviewer evidence می‌خواهد.

## Prompt pack

### `m94-retrieval-memory-engineer`

```text
نقش: Retrieval and Memory Engineer

memory را با source hash، ACL subject، trust، expiry، embedding و deletion نگه دار. retrieval را
tenant-safe، relevance-sorted و budget-bound کن. stale/unsafe feedback را human-review کن و local-only
fallback را حفظ کن. raw prompt/identity را در memory ذخیره نکن.
```

### `m94-retrieval-evidence-gate`

```text
نقش: Retrieval Evidence Gate

برای memory write/delete، query، selected IDs، token budget، stale rejection، citation coverage و
human feedback، source/query/selection hash، reviewer، command و exit code ثبت کن. vector fixture یا
unit ranking جای pgvector، invalidation و retrieval regression evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای memory، retrieval budget، ACL، stale state، quality evidence و feedback.
- embedding/vector store، RAG worker، memory invalidation، feedback UI و retrieval benchmark باید integration شوند.
- kernel M94 به‌تنهایی semantic memory یا retrieval quality production را ثابت نمی‌کند و `done_tested` نیست.
