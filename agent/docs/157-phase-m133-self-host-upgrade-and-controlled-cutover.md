# فاز M133: Self-host Upgrade، Backup Restore و Controlled Cutover

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/self-host-cutover-runtime.ts`
**تست:** `test/next-platform-hardening-phases.test.ts`
**gap:** `GAP-PO-08`

## هدف و مرز

M133 self-host release را به image digest، config schema، SBOM، signature، migration و rollback وصل
می‌کند. config باید no-clobber و TLS-aware باشد. backup باید encrypted، checksum-bound، retention-aware و
restore-tested باشد و RTO/RPO را ثبت کند. cutover باید plan/canary/promote/rollback، error budget،
incident، fallback و approval را gate کند. resilience drill باید sandboxed، bounded، no-data-loss و
redacted باشد. این فاز installer، Kubernetes controller، backup object store، traffic switch،
autoscaler یا chaos runner واقعی نیست.

## معماری و قراردادها

- `validateM133ReleasePlan`: image/config/SBOM/signature، migration، rollback، TLS و no-clobber.
- `validateM133BackupRestore`: encryption، checksum، retention، restore، exit code و RTO/RPO.
- `decideM133Cutover`: stage، canary، incident/error budget، approval، rollback و fallback.
- `validateM133Drill`: blast radius، sandbox، recovery budget، no-data-loss و redaction.

production deploy بدون approval ممنوع است؛ local/self-host و read-only fallback باید مسیر صادقانه داشته باشند.

## sprint plan

### Sprint A — Release package

image digest، signed manifest، SBOM، config schema، migration و rollback plan.

### Sprint B — Backup/restore

encryption، checksum، retention، isolated restore، RTO/RPO و operator evidence.

### Sprint C — Cutover

plan، canary، smoke evidence، error budget، approval، promote و rollback.

### Sprint D — Recovery drills

bounded process/network/dependency/disk experiment، recovery budget، no-data-loss و postmortem.

## Threat Model

- **Supply-chain release tamper:** digest، SBOM و signature لازم است.
- **Config destruction:** no-clobber، backup و schema validation اجباری است.
- **Unrecoverable backup:** encrypted checksum و isolated restore test لازم است.
- **Unsafe promotion:** canary، error budget، incident hold و approval لازم است.
- **Chaos data loss:** sandbox، blast-radius، timeout و no-data-loss guard لازم است.
- **Tenant/privacy regression:** rollback و local/read-only fallback حفظ می‌شود.

## prompt pack

### `m133-self-host-release-engineer`

```text
نقش: Self-host Release Engineer

release را به image digest، config schema، SBOM، signature، migration و rollback وصل کن. backup
باید encrypted، checksum-bound، retention-aware و restore-tested باشد. cutover فقط با canary،
smoke evidence، error budget، approval، rollback و local/read-only fallback مجاز است.
```

### `m133-cutover-auditor`

```text
نقش: Controlled Cutover Auditor

package، config no-clobber، backup/restore، RTO/RPO، canary، incident، error budget، fallback و
chaos evidence را بررسی کن. installer mock یا staging unit test جای traffic switch، restore
provider، Kubernetes controller یا production recovery واقعی نیست.
```

## DoD و production evidence boundary

- release، backup/restore، canary/promote/rollback و resilience drill با مسیرهای منفی تست شوند.
- self-host packaging، installer/controller، object store، restore automation، traffic switch، observability و incident drill باید integration شوند.
- kernel M133 به‌تنهایی upgrade safety، backup durability، controlled cutover یا disaster recovery production claim نیست.
