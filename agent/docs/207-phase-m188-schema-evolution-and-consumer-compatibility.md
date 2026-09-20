# فاز M188: Schema Evolution و Consumer Compatibility

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/schema-evolution-runtime.ts`
**تست:** `test/next-platform-hardening-phases-12.test.ts`
**gap:** `GAP-API-11`

## هدف و مرز

M188 schema را versioned و consumer-aware می‌کند: compatibility mode، expand-contract migration،
backfill evidence، contract/replay proof، rollback و bounded cutover. حذف field یا تغییر ناسازگار بدون
consumer proof رد می‌شود. این فاز schema registry، migration runner، backfill worker، consumer CI یا
stream gateway واقعی نیست.

## معماری

- `validateM188Schema`: version، unique fields، compatibility، policy، approval و tenant.
- `decideM188Migration`: increasing version، expand-contract، backfill، rollback و approval.
- `validateM188Consumer`: accepted version، contract test، unknown-field policy، replay و approval.
- `decideM188Cutover`: consumer count/proof، rollback، evidence، approval و bound.

Local-first schema fixtures و contract tests مرجع طراحی هستند؛ BYOK/free-tier API consumer نمی‌تواند
unknown field یا breaking migration را پنهان کند. migration بدون backup/rollback و evidence اجرای واقعی
production claim نیست.

## Sprint plan

### Sprint A — Registry

schema ID/version، field inventory، compatibility و policy hash.

### Sprint B — Expand-contract

additive expand، backfill، dual-read/write و migration evidence.

### Sprint C — Consumer proof

contract test، replay، unknown-field policy و consumer matrix.

### Sprint D — Cutover

consumer proof، approval، bounded switch، rollback و contract deprecation.

## Threat Model

- **Breaking consumer:** compatibility mode و consumer proof.
- **Data loss in migration:** expand-contract، backfill و rollback.
- **Schema spoofing:** registry/policy/schema hash.
- **Unknown-field confusion:** explicit ignore/reject policy.
- **Partial cutover:** consumer count و evidence.
- **Cross-tenant schema leak:** tenant-bound registry/migration.

## prompt pack

### `m188-schema-governance-engineer`

```text
نقش: Schema Evolution Engineer

schema را versioned، hashed و compatibility-bound ثبت کن. migration باید expand-contract، backfill
و rollback داشته باشد. هر consumer contract/replay proof بدهد و cutover فقط با همه consumerها، approval،
rollback و bounded evidence انجام شود.
```

### `m188-schema-auditor`

```text
نقش: Schema Governance Auditor

breaking change، missing consumer، backfill gap، unknown-field ambiguity، partial cutover و rollback
fiction را بررسی کن. schema file یا migration mock جای registry، consumer CI و durable migration evidence واقعی نیست.
```

## DoD و production evidence boundary

- schema، migration، consumer proof، unknown-field denial، cutover و rollback تست شوند.
- schema registry، migration/backfill runner، consumer contract CI، stream/API gateway و rollback controller باید متصل شوند.
- kernel M188 به‌تنهایی backward compatibility، zero data loss، consumer coverage یا migration production claim نیست.
