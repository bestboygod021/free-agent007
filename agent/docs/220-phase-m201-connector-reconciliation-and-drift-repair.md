# فاز M201: Connector Reconciliation و Drift Repair

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/reconciliation-drift-runtime.ts`
**تست:** `test/next-platform-hardening-phases-15.test.ts`
**gap:** `GAP-IG-21`

## هدف و مرز

M201 اتصال connector را با snapshot، cursor، local/remote revision، ACL، consent، change direction،
conflict state، idempotency، no-clobber reconciliation و drift repair evidence کنترل می‌کند. conflict
دوطرفه هرگز خودکار overwrite نمی‌شود. این فاز snapshot store، diff engine، conflict UI، repair worker
یا remote cursor واقعی نیست.

## معماری

- `validateM201Snapshot`: connector/resource، cursor، revisions، ACL، consent، capture time و tenant.
- `validateM201Change`: direction، operation، resource/base/local/remote hash، conflict و idempotency.
- `decideM201Reconcile`: snapshot، changes، conflict review، merge plan، safe apply و no-clobber.
- `validateM201Drift`: expected/observed revision، repair timeline، residual drift، redaction و tenant.

Local-first shadow snapshot و dry-run مسیر پیش‌فرض است؛ free-tier/BYOK connector فقط با consent و scope
محدود کار می‌کند. remote state untrusted است و بدون ACL/revision evidence authority ندارد.

## Sprint plan

### Sprint A — Snapshot/cursor

resource snapshot، cursor، ACL، consent و revision hash.

### Sprint B — Diff/conflict

change direction، base revision، conflict classification و idempotency.

### Sprint C — Reconciliation

merge plan، review، no-clobber و safe apply.

### Sprint D — Drift repair

expected/observed revision، repair evidence، residual scan و retry bound.

## Threat Model

- **Remote/local overwrite:** base revision و no-clobber.
- **Cross-tenant sync:** ACL، consent و tenant binding.
- **Cursor loss/duplication:** cursor و idempotency.
- **Conflict laundering:** explicit conflict state و review.
- **Drift loop:** repair evidence و residual detection.
- **Malicious remote payload:** reference/hash، schema و untrusted boundary.

## prompt pack

### `m201-reconciliation-engineer`

```text
نقش: Connector Reconciliation Engineer

snapshot را با cursor، ACL، consent و local/remote revision بگیر. change باید base revision، direction،
operation و idempotency داشته باشد. conflict دوطرفه را review کن و reconciliation فقط با merge plan،
no-clobber و safe apply انجام شود. repair residual drift را evidence کند.
```

### `m201-reconciliation-auditor`

```text
نقش: Reconciliation Auditor

overwrite، cross-tenant sync، cursor duplication، conflict laundering، drift loop و remote payload injection
را بررسی کن. webhook mock یا last-write-wins جای snapshot store، diff engine، conflict UI و repair worker واقعی نیست.
```

## DoD و production evidence boundary

- snapshot، conflict denial، no-clobber reconcile، cursor/idempotency و drift residue تست شوند.
- snapshot/cursor store، bidirectional diff engine، conflict review UI، repair worker و drift evidence collector باید متصل شوند.
- kernel M201 به‌تنهایی sync correctness، conflict-free merge، connector reliability یا drift-free production claim نیست.
