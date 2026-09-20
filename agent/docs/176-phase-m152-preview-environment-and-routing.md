# فاز M152: Preview Environment و Deployment Routing

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/preview-environment-runtime.ts`
**تست:** `test/next-platform-hardening-phases-5.test.ts`
**gap:** `GAP-EX-18`

## هدف و مرز

M152 preview را از یک port به environment tenant-bound با sandbox، TLS، origin allowlist، port lease،
expiry و deployment target تبدیل می‌کند. environment باید run، target، port، hostname، state، expiry،
read-only artifact و isolation داشته باشد. port lease باید reservation، host reference، tenant match و
lifetime داشته باشد. route باید proxy reference، path prefix، TLS و origin داشته باشد. deployment target
باید image/config/smoke/network/rollback و approval داشته باشد. این فاز provisioner، port allocator،
TLS/proxy، Docker/Kubernetes adapter یا cleanup worker واقعی نیست.

## معماری و قراردادها

- `validateM152Environment`: target/state، port، hostname، TLS، expiry، tenant و sandbox.
- `validateM152PortLease`: reservation، range، host، lifetime و tenant.
- `decideM152Route`: path prefix، TLS، origin، proxy، tenant و expiry.
- `validateM152DeploymentTarget`: image/config/smoke، network، rollback، approval و no-clobber.

preview هیچ credential یا raw artifact را public نمی‌کند؛ read-only artifact و origin-bound delivery حفظ می‌شود.

## sprint plan

### Sprint A — Provisioner

environment registry، target adapter، sandbox و lifecycle state.

### Sprint B — Port/routing

port lease، hostname، TLS، proxy route و origin allowlist.

### Sprint C — Deployment target

image/config/network policy، smoke check، approval و rollback.

### Sprint D — Expiry/cleanup

lease expiry، route revoke، environment destroy و artifact cleanup.

## Threat Model

- **Port collision:** reserved lease و bounded port range لازم است.
- **Cross-tenant preview:** environment/lease/route tenant match می‌خواهند.
- **Origin abuse:** TLS و origin allowlist اجباری است.
- **Preview escape:** sandbox و read-only artifact gate می‌شوند.
- **Stale public route:** expiry و proxy revoke لازم است.
- **Unsafe deployment:** smoke، network policy، approval و rollback لازم است.

## prompt pack

### `m152-preview-engineer`

```text
نقش: Preview Environment Engineer

environment را با run، target، port، hostname، TLS، expiry، sandbox و tenant binding بساز. port را
reserved و کوتاه‌عمر کن. route باید TLS، origin allowlist، path prefix و proxy reference داشته باشد.
deployment را با image/config/smoke، network policy، approval، no-clobber و rollback gate کن.
```

### `m152-routing-auditor`

```text
نقش: Preview Routing Auditor

port collision، route expiry، TLS، origin، tenant، sandbox، read-only artifact، deployment smoke و
cleanup را ممیزی کن. localhost mock یا route fixture جای provisioner، proxy/TLS و container adapter
واقعی نیست.
```

## DoD و production evidence boundary

- environment expiry، invalid port، route origin denial، tenant mismatch و deployment rollback تست شوند.
- provisioner، port store، TLS/proxy، Docker/Kubernetes adapter، smoke runner و cleanup باید integration شوند.
- kernel M152 به‌تنهایی preview isolation، routing security، deployment correctness یا cleanup completeness production claim نیست.
