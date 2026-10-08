# فاز M93: Deployment Operations، Environment Promotion و Self-host

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-PO-01`، `GAP-PO-03`، `GAP-PO-04`، `GAP-EX-10`، `GAP-OB-05`، `GAP-SE-08`
**کد kernel:** `src/core/deployment-operations-runtime.ts`
**تست:** `test/next-operations-and-enterprise-phases.test.ts`

## هدف و مرز

M93 deployment adapter را به environment promotion، migration evidence و self-host safety وصل
می‌کند. Compose، Kubernetes، Vercel، Fly و Cloud Run باید artifact، config، smoke test، backup،
rollback و approval boundary یکسان داشته باشند. این فاز deployment executor، Helm chart، container
registry، cloud API، migration runner یا self-host installation واقعی را اجرا نمی‌کند.

## معماری

`DeploymentAdapterContract` target، artifact/config hash، opaque secret references، dry-run،
review و rollback support را ثبت می‌کند. `EnvironmentPromotionRequest` staging/canary/production
و smoke/incident/approval را gate می‌کند. migration با backup، lock، dry-run، exit code و rollback
test معتبر است. `SelfHostConfiguration` TLS، backup و no-clobber را اجباری می‌کند.

## قراردادهای اصلی

- `validateDeploymentAdapter` review، dry-run، HTTPS، rollback و secret reference را validate می‌کند.
- `decideEnvironmentPromotion` environment transition، smoke evidence، incident و production approval را gate می‌کند.
- `validateDeploymentMigrationEvidence` backup، lock، dry-run، exit code و rollback test را بررسی می‌کند.
- `validateSelfHostConfiguration` TLS، backup، no-clobber، egress و secret safety را enforce می‌کند.

## sprintها

### Sprint A — Deployment Adapter

- Compose
- Kubernetes/Helm
- Vercel/Fly/Cloud Run
- config/artifact digest

### Sprint B — Promotion

- development → staging
- staging → canary
- canary → production
- smoke/health gate

### Sprint C — Migration و Backup

- dry-run
- backup/restore
- lock/fencing
- rollback rehearsal

### Sprint D — Self-host

- zero-clobber config
- TLS/egress policy
- local/BYOK mode
- Enterprise upgrade path

## Threat Model

- **Unreviewed deployment:** adapter و config بدون review/dry-run عبور نمی‌کند.
- **Production bypass:** promotion به production approval و smoke evidence لازم دارد.
- **Migration corruption:** backup، lock، exit code و rollback test اجباری هستند.
- **Secret leakage:** deployment فقط opaque reference می‌پذیرد.
- **Self-host clobber:** config موجود باید backup/no-clobber شود و TLS فعال باشد.

## Prompt pack

### `m93-deployment-operations-engineer`

```text
نقش: Deployment Operations Engineer

adapter را با target، artifact/config hash، dry-run، review و rollback پشتیبانی کن. promotion را
environment-bound نگه دار؛ production approval، smoke evidence و incident check لازم است. migration
با backup/lock/rollback test اجرا شود. self-host بدون TLS، backup و no-clobber config معتبر نیست.
```

### `m93-deployment-evidence-gate`

```text
نقش: Deployment Evidence Gate

برای adapter، plan/apply، promotion، smoke، migration، backup، rollback و self-host، artifact/config
hash، environment، operator، approval، command و exit code ثبت کن. successful build یا generated
Compose جای deployment، migration و rollback evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای adapter، promotion، smoke، migration، rollback و self-host safeguards.
- registry، cloud/deployment adapters، Compose/Kubernetes، backup/restore، migration runner و self-host installer باید integration شوند.
- kernel M93 به‌تنهایی deployment success، self-host readiness یا production operations را ثابت نمی‌کند و `done_tested` نیست.
