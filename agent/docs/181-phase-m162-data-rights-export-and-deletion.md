# فاز M162: Data Rights، Export و Deletion Orchestration

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/data-rights-runtime.ts`
**تست:** `test/next-platform-hardening-phases-7.test.ts`
**gap:** `GAP-DA-11`

## هدف و مرز

M162 درخواست access، export، rectify و delete را به identity proof، deadline، scope، legal hold،
encrypted export، recipient verification و residual proof تبدیل می‌کند. هیچ export شامل raw credential
یا tenant دیگر نیست و deletion بدون enumeration replicaها معتبر نیست. این فاز DSAR intake، object
store، deletion orchestrator، index/cache sweep یا legal-hold service واقعی نیست.

## معماری

- `validateM162Request`: identity proof، scope، deadline، hold، approval و tenant.
- `decideM162Export`: dataset hashes، encryption، signature، expiry، recipient و no-clobber.
- `validateM162Deletion`: store enumeration، tombstone، hold، approval و residual proof.
- `decideM162Hold`: reason، stores، authorization، tenant و expiry.

Local-first export را روی encrypted local store با one-time reference قرار می‌دهد. BYOK برای encryption
مجاز است و free/local fallback نباید داده را به provider دیگر منتقل کند. legal hold فقط deletion را
متوقف می‌کند، نه لزوماً access review را؛ همه تصمیم‌ها audit و قابل بازپخش هستند.

## sprint plan

### Sprint A — Rights intake

identity verification، request scope، deadline و subject mapping.

### Sprint B — Export

dataset inventory، redaction، encryption، signed manifest و expiry.

### Sprint C — Deletion

tombstone، primary/replica/index/cache sweep، retry و residual proof.

### Sprint D — Hold و review

legal hold، authorization، conflict review، notification و evidence retention.

## Threat Model

- **Unauthorized export:** identity proof، recipient verification و signed manifest.
- **Secret leakage:** no-raw-secrets و redacted dataset selection.
- **Replica survival:** enumerated stores و residual proof.
- **Deletion under legal hold:** hold gate و authorization.
- **Cross-tenant subject:** tenant match و scope hash.
- **Export clobber/replay:** one-time expiry، no-clobber و idempotency.

## prompt pack

### `m162-data-rights-engineer`

```text
نقش: Data Rights Engineer

درخواست را با identity proof، tenant، scope، deadline و legal hold admit کن. export باید encrypted،
signed، redacted، recipient-verified و expiring باشد. deletion را روی primary، replica، index و cache
enumerate کن و residual proof بده؛ raw credential را هرگز export نکن.
```

### `m162-privacy-auditor`

```text
نقش: Privacy Rights Auditor

identity، scope، legal hold، replica inventory، cache/index deletion، encryption، recipient و residual
proof را بررسی کن. mock export یا tombstone بدون sweep واقعی جای DSAR evidence production نیست.
```

## DoD و production evidence boundary

- request verified/blocked، export سالم/منقضی، deletion/hold و residual proof تست شوند.
- rights intake، identity proof، encrypted export store، deletion worker، index/cache adapters، legal hold و audit retention باید متصل شوند.
- kernel M162 به‌تنهایی انطباق حقوق داده، deletion completeness، export confidentiality یا legal sufficiency production claim نیست.
