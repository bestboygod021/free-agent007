# فاز M200: Side-effect Journal و Idempotent Commit

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/side-effect-journal-runtime.ts`
**تست:** `test/next-platform-hardening-phases-15.test.ts`
**gap:** `GAP-EX-24`

## هدف و مرز

M200 عملیات دارای side effect را به operation journal، idempotency key، target/precondition/input hash،
atomic boundary، receipt، no-duplicate و compensation bind می‌کند. این فاز exactly-once را ادعا نمی‌کند؛
آن را به integration evidence وابسته می‌داند. durable journal، transaction/outbox adapter، applier،
receipt verifier و compensation worker واقعی در این فاز ساخته نمی‌شوند.

## معماری

- `validateM200Journal`: operation/action، idempotency، target، precondition، input، compensation و state.
- `decideM200Commit`: attempt، dedupe، precondition، atomic boundary، receipt، no duplicate و approval.
- `validateM200Receipt`: provider receipt، side-effect، target، commit time و replay safety.
- `decideM200Compensation`: original/compensation hash، reason، reversibility، bound و approval.

Local-first journal مسیر اولیه است؛ external/BYOK provider فقط با receipt و idempotency evidence مصرف
می‌شود. raw credential یا payload حساس در journal ذخیره نمی‌شود.

## Sprint plan

### Sprint A — Journal

operation state، idempotency، target/input/precondition hash و compensation hash.

### Sprint B — Prepare/commit

dedupe، precondition، atomic boundary و approval.

### Sprint C — Receipt

provider receipt، commit timestamp، replay-safe verification و no duplicate.

### Sprint D — Compensation

reversible action، reason، bounded compensation و evidence.

## Threat Model

- **Duplicate side effect:** idempotency/dedupe و receipt.
- **TOCTOU/precondition drift:** precondition hash و atomic boundary.
- **Partial commit:** journal state و compensation.
- **Fake provider success:** provider receipt hash.
- **Compensation abuse:** reversibility، bound و approval.
- **Payload/secret leakage:** hash/reference-only journal.

## prompt pack

### `m200-side-effect-engineer`

```text
نقش: Side-effect Runtime Engineer

هر operation را با idempotency key، target/input/precondition hash، compensation و state journal کن. commit
فقط با dedupe، precondition، atomic boundary، receipt و no-duplicate proof مجاز است. compensation باید
reversible، bounded و approved باشد.
```

### `m200-side-effect-auditor`

```text
نقش: Side-effect Auditor

duplicate commit، TOCTOU، partial effect، fake receipt، unsafe compensation و payload leakage را بررسی کن.
یک transaction mock یا success callback جای journal durable، outbox، applier، receipt verifier و compensation worker واقعی نیست.
```

## DoD و production evidence boundary

- journal، duplicate denial، precondition failure، receipt، compensation و tenant boundary تست شوند.
- durable journal، idempotency/outbox store، precondition lock، side-effect applier، receipt verifier و compensation worker باید متصل شوند.
- kernel M200 به‌تنهایی exactly-once، atomic external mutation، receipt completeness یا compensation safety production claim نیست.
