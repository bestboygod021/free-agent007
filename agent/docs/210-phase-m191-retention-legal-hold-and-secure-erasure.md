# فاز M191: Retention، Legal Hold و Secure Erasure

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/data-erasure-runtime.ts`
**تست:** `test/next-platform-hardening-phases-13.test.ts`
**gap:** `GAP-DA-12`

## هدف و مرز

M191 lifecycle داده را با record class، retention، encryption، consent، tenant، legal hold، deletion
request، idempotency، replica/backup scope و verification evidence کنترل می‌کند. subject identifier فقط
hash/reference است. این فاز database/object-store eraser، backup catalog، legal workflow، KMS یا residual
scanner واقعی نیست.

## معماری

- `validateM191Retention`: record class، lifetime، encryption، consent و tenant.
- `decideM191Deletion`: stores، replica count، backup scope، no legal hold، approval و idempotency.
- `validateM191DeletionEvidence`: stores/replicas/backups purged، residual/verification hash و tenant.
- `decideM191RetentionException`: legal basis، expiry، disclosure، approval و bound.

Local-first deletion باید در local store و backup manifest قابل مشاهده باشد؛ cloud/free-tier/BYOK adapter
فقط از طریق reference و deletion evidence کار می‌کند. raw password، raw identifier یا محتوای حذف‌شده
دوباره در audit چاپ نمی‌شود.

## Sprint plan

### Sprint A — Retention registry

record class، policy، creation time، encryption و consent.

### Sprint B — Deletion orchestration

store/replica/backup inventory، idempotency و legal-hold gate.

### Sprint C — Verification

purge evidence، residual scan، backup sweep و cryptographic proof.

### Sprint D — Exceptions

legal basis، user disclosure، expiry، review و automatic close.

## Threat Model

- **Deletion ناقص در replica:** store/replica count و evidence.
- **Backup residue:** explicit backup scope و purge proof.
- **Legal-hold abuse:** legal basis، approval، disclosure و expiry.
- **Identity leakage:** hashed subject و redacted evidence.
- **Double deletion race:** idempotency key و durable workflow.
- **Retention drift:** bounded policy و current-time validation.

## prompt pack

### `m191-erasure-engineer`

```text
نقش: Retention and Erasure Engineer

record را با class، retention، encryption، consent و tenant ثبت کن. deletion باید stores، replica، backup،
legal-hold، approval و idempotency داشته باشد. completion را با purge، residual و verification evidence ثابت کن.
```

### `m191-erasure-auditor`

```text
نقش: Erasure Auditor

replica residue، backup residue، hidden legal hold، identity leak، double deletion و retention drift را
بررسی کن. حذف یک row یا flag mock جای erasure worker، backup sweep و residual proof واقعی نیست.
```

## DoD و production evidence boundary

- valid retention، expiry denial، legal-hold denial، deletion، replica/backup proof و exception expiry تست شوند.
- retention policy store، deletion orchestrator، DB/object eraser، backup catalog، KMS و residual scanner باید متصل شوند.
- kernel M191 به‌تنهایی data deletion compliance، backup erasure، legal sufficiency یا zero-residue production claim نیست.
