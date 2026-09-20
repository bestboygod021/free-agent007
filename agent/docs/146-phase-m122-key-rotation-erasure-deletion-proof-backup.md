# فاز M122: Key Rotation، Privacy Erasure، Deletion Proof و Backup Retention

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-PRIV-02`، `GAP-KMS-04`، `GAP-BACKUP-07`، `GAP-AUD-09`
**کد kernel:** `src/core/key-rotation-deletion-runtime.ts`
**تست:** `test/next-hardening-phases.test.ts`

## هدف و مرز

M122 lifecycle کلید، privacy erasure، proof غیرقابل‌تغییر حذف و retention backup را طراحی می‌کند.
حذف فقط پس از identity verification، approval، legal-hold review و propagation plan مجاز است.
Deletion proof باید residual data را رد کند و object، index، cache، search، backup و downstream را
پوشش دهد. KMS/HSM، erasure worker، immutable ledger، backup provider و legal hold واقعی در kernel
وجود ندارند. raw password و key material هرگز ذخیره نمی‌شود؛ فقط opaque references و fingerprints.

## معماری

`M122KeyRotation` key id، state، owner، activation window، overlap، revocation و evidence را می‌سنجد.
`decideM122Deletion` identity، approval، legal hold، scope و propagation را gate می‌کند.
`M122DeletionProof` request، scope، systems، residual count، immutable hash و signer را validate می‌کند.
`M122BackupRetention` class، retention، legal hold، deletion deadline، encryption و restore test را بررسی می‌کند.

## sprintها

### Sprint A — Key lifecycle

key inventory، staged rotation، overlap، revoke، rollback و audit.

### Sprint B — Erasure propagation

canonical record، replicas، cache، search index، analytics و downstream acknowledgements.

### Sprint C — Deletion proof

residual scan، immutable hash، signer، timestamp، scope و auditor review.

### Sprint D — Backup retention

retention class، encrypted backup، legal hold، expiry، purge و restore evidence.

## Threat Model

- **Stale key exposure:** overlap/revocation window و evidence لازم است.
- **Incomplete deletion:** residual scan across all systems و acknowledgement اجباری است.
- **Legal hold violation:** hold باید قبل از execution بررسی شود.
- **False proof:** immutable hash، signer و independent verification لازم است.
- **Backup resurrection:** restore test و retention/purge policy لازم است.
- **Secret exposure:** key material/password هرگز وارد artifact/log نمی‌شود.

## Prompt pack

### `m122-privacy-kms-engineer`

```text
نقش: Privacy Erasure and Key Lifecycle Engineer

key reference را با staged rotation، overlap، revoke و rollback طراحی کن. deletion را پشت identity
verification، approval و legal hold بگذار و propagation را برای object/index/cache/search/backup/
downstream ثبت کن. proof باید residual scan، immutable hash و signer داشته باشد.
```

### `m122-deletion-auditor`

```text
نقش: Deletion and Backup Auditor

scope، systems، residual count، acknowledgement، retention class، expiry، encryption، legal hold
و restore test را بررسی کن. opaque reference مجاز است؛ raw key/password ممنوع. contract kernel
جای KMS/HSM، erasure worker، backup provider یا immutable ledger واقعی نیست.
```

## DoD و production evidence boundary

- rotation state machine، deletion approval/hold، residual negative test، immutable proof و backup matrix.
- KMS/HSM، erasure propagation، immutable audit store، backup purge/restore و legal compliance باید integration شوند.
- kernel M122 به‌تنهایی key rotation، privacy deletion، deletion proof یا backup destruction production claim نمی‌کند.
