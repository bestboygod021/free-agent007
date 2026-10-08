# فاز M132: Knowledge ACL، Freshness و Context Lineage

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/knowledge-freshness-runtime.ts`
**تست:** `test/next-platform-hardening-phases.test.ts`
**gap:** `GAP-IN-19`

## هدف و مرز

M132 context را به ACL، trust، freshness، lineage و deletion marker متصل می‌کند. source untrusted یا
حذف‌شده نباید authority شود. context pack باید tenant-bound، deterministic، budgeted و path-aware باشد.
freshness باید revision را با observed revision مقایسه کند و refresh plan داشته باشد. repository index
باید ACL-filtered و incremental باشد. این فاز indexer، vector store، graph database، embedding service،
ACL-aware connector یا context assembler واقعی نیست.

## معماری و قراردادها

- `validateM132Source`: source identity، lineage، ACL subject، trust، PII و deletion state.
- `decideM132Context`: tenant، ACL، trust، freshness، token budget و deterministic ordering.
- `validateM132Freshness`: revision comparison، timestamp، stale flag و deletion guard.
- `validateM132Index`: snapshot/root، counts، incremental predecessor و ACL filter.

README، issue، webpage و payload مدل untrusted هستند و authority context را تغییر نمی‌دهند.

## sprint plan

### Sprint A — Source lineage

source identity، content hash، lineage hash، trust و PII/deletion marker.

### Sprint B — ACL context

tenant/project subject، candidate filtering، path boundary و deterministic packing.

### Sprint C — Freshness

revision probe، stale classification، refresh plan و expiry.

### Sprint D — Repository index

snapshot binding، incremental index، ACL filter، symbol/import graph و deletion propagation.

## Threat Model

- **Cross-tenant context leak:** organization match و ACL gate لازم است.
- **Stale code advice:** revision/freshness evidence و refresh plan لازم است.
- **Deleted data resurrection:** deletion marker باید fail-closed باشد.
- **Untrusted prompt authority:** trust layer و source provenance لازم است.
- **Context budget abuse:** max tokens/items و deterministic selection لازم است.
- **PII leakage:** redaction و source classification اجباری است.

## prompt pack

### `m132-knowledge-engineer`

```text
نقش: ACL-aware Knowledge Engineer

source را با tenant/project، content hash، lineage، ACL subject، trust، PII و deletion marker ثبت
کن. context فقط از candidateهای trusted و ACL-allowed و fresh انتخاب شود و token/item budget داشته
باشد. index باید snapshot-bound، incremental و ACL-filtered باشد.
```

### `m132-context-auditor`

```text
نقش: Context Integrity Auditor

cross-tenant، stale revision، deleted source، untrusted webpage/README، path، ACL و budget را
ممیزی کن. lexical mock، fixture index یا embedding result جای durable index، ACL connector و
context integration واقعی نیست.
```

## DoD و production evidence boundary

- source، context selection، stale mismatch، deletion marker و index integrity با negative paths تست شوند.
- repository indexer، ACL query، vector/lexical store، freshness worker، deletion propagation و context assembler باید integration شوند.
- kernel M132 به‌تنهایی retrieval quality، ACL completeness، freshness production یا privacy erasure propagation را ثابت نمی‌کند.
