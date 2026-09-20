# فاز M134: Data Portability و Controlled Import

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/data-portability-runtime.ts`
**تست:** `test/next-platform-hardening-phases-2.test.ts`
**gap:** `GAP-DA-08`

## هدف و مرز

M134 قابلیت انتقال داده را از یک export خام به portable، tenant-bound و قابل‌ممیزی تبدیل می‌کند.
هر export باید scope، schema version، redaction policy، consent، approval، expiry و manifest integrity
داشته باشد. import باید cross-tenant boundary، schema compatibility، mapping، conflict policy،
secret absence، dry-run و rollback را gate کند. legal hold نباید با export evidence دور زده شود.
این فاز object store، encryption/KMS، migration worker، schema registry، import UI یا durable
cross-tenant job واقعی نیست.

## معماری و قراردادها

- `validateM134ExportRequest`: scope، consent، approval، legal hold، expiry و no-secret contract.
- `validateM134ExportManifest`: root hash، checksum، encryption reference، count، expiry و tenant boundary.
- `decideM134ImportPlan`: schema/mapping، conflict policy، dry-run، rollback و isolation.
- `decideM134Portability`: اتصال manifest به source/target و fail-closed import gate.

هیچ raw password، API key، token یا private key در export، manifest، log یا import plan ذخیره نمی‌شود.

## sprint plan

### Sprint A — Export policy

scope registry، user consent، approval، redaction، legal hold و retention.

### Sprint B — Portable manifest

schema version، checksum/root hash، encrypted object reference و expiry.

### Sprint C — Import dry-run

mapping، compatibility، conflict review، tenant isolation و preview report.

### Sprint D — Apply/rollback

approval، idempotency، reversible migration، failed-item report و cleanup.

## Threat Model

- **Cross-tenant data leak:** source/target identity و tenant-bound manifest لازم است.
- **Secret export:** type-level no-secret و runtime validation اجباری است.
- **Tampered bundle:** checksum، root hash و encryption reference لازم است.
- **Legal-hold bypass:** audit scope و hold policy export را متوقف می‌کند.
- **Destructive import:** dry-run، mapping، approval و rollback لازم است.
- **Schema confusion:** source/target version و compatibility evidence بررسی می‌شود.

## prompt pack

### `m134-portability-engineer`

```text
نقش: Data Portability Engineer

export را با scope، schema version، redaction policy، consent، approval، expiry و tenant-bound
manifest بساز. import همیشه dry-run، schema-compatible، secret-free، conflict-aware و rollback-ready
باشد. raw secret را هرگز export، log یا persist نکن.
```

### `m134-migration-reviewer`

```text
نقش: Portability Reviewer

source/target tenant، legal hold، checksum، mapping، conflict، dry-run، approval و rollback را
ممیزی کن. fixture bundle جای object store، KMS، import worker یا دو-tenant production replay واقعی نیست.
```

## DoD و production evidence boundary

- export request، manifest، import dry-run، cross-tenant mismatch و destructive import denial تست شوند.
- encrypted object store، KMS، schema registry، migration worker، idempotency و rollback باید integration شوند.
- kernel M134 به‌تنهایی data portability، import correctness، legal export compliance یا migration durability production claim نیست.
