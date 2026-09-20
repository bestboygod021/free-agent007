# فاز M78: Self-host Release، CI Evidence و Upgrade Gates

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-PO-01`، `GAP-PO-02`، `GAP-PO-03`، `GAP-PO-05`، `GAP-PO-06`، `GAP-EX-10`، `GAP-OB-05`، `GAP-QA-04`
**کد kernel:** `src/core/self-host-release-runtime.ts`
**تست:** `test/next-product-runtime-phases.test.ts`

## هدف و مرز

M78 release artifact قابل‌ردیابی، CI evidence، self-host mode، changelog، canary/blue-green،
backup-before-upgrade، migration dry-run، compatibility و rollback rehearsal را تعریف می‌کند.
Docker Compose، Kubernetes/Helm، local bundle، Vercel/Fly/Cloud Run و upgrade باید approval و
fallback شفاف داشته باشند. این فاز CI provider، container registry، Helm chart، deployment
adapter، backup executor یا production release واقعی را اجرا نمی‌کند.

## معماری

`SelfHostArtifact` version، image digest، SBOM، signature، vulnerability/license scan، backup
و rollback hash را ثبت می‌کند. `CiPipelineEvidence` commit، typecheck/test/lint/security، test
count و artifact hash دارد. `SelfHostReleasePlan` channel/environment/rollout، changelog، approval
و rollback verification را gate می‌کند. `SelfHostUpgradeEvidence` migration dry-run، compatibility،
backup، rollback و downtime را اندازه‌گیری می‌کند.

## قراردادهای اصلی

- `validateSelfHostArtifact` signature/hash، SBOM، vulnerability/license scan و backup را validate می‌کند.
- `validateCiPipelineEvidence` typecheck، test، lint، security و artifact evidence را بررسی می‌کند.
- `decideSelfHostRelease` artifact/CI organization match، channel، environment، approval و rollback را gate می‌کند.
- `validateSelfHostUpgrade` migration، compatibility، backup، rollback و downtime را enforce می‌کند.

## sprintها

### Sprint A — Reproducible CI

- typecheck/test/lint/security
- commit/artifact provenance
- test matrix و cache
- changelog/versioning

### Sprint B — Self-host Packaging

- local bundle
- Docker Compose
- Kubernetes/Helm
- config/BYOK/secret references

### Sprint C — Deployment Adapters

- staging/canary/production
- Vercel/Fly/Cloud Run/Kubernetes
- canary/blue-green
- approval/rollback

### Sprint D — Upgrade و DR

- migration dry-run
- compatibility check
- backup-before-upgrade
- restore/rollback rehearsal و release notes

## Threat Model

- **Supply-chain artifact:** digest، SBOM، signature و vulnerability/license scan لازم است.
- **Unreviewed deployment:** production approval، rollback verification و environment match اجباری است.
- **Nightly drift:** nightly channel به production راه ندارد.
- **Migration loss:** dry-run، backup، compatibility و rollback rehearsal پیش از upgrade لازم است.
- **Self-host secret leak:** config فقط opaque references/BYOK دارد؛ raw credential در artifact یا log نیست.

## Prompt pack

### `m78-self-host-release-engineer`

```text
نقش: Self-host Release Engineer

artifact را با version، digest، SBOM، signature، vulnerability/license scan و rollback hash
بساز. CI باید commit، typecheck، test، lint و security evidence بدهد. production release فقط با
approval، changelog، backup و rollback verification انجام شود؛ nightly را deploy نکن.
```

### `m78-release-evidence-gate`

```text
نقش: Release Evidence Gate

برای CI، artifact، image/SBOM/signature، staging/canary، migration dry-run، backup، rollback و
production approval، artifact hash، command، exit code و operator ثبت کن. green unit test یا
container build به‌تنهایی release و DR evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای artifact، CI evidence، release plan، upgrade و rollback.
- CI provider، registries، Compose/Helm، deployment adapter، backup/restore و upgrade rehearsal باید integration شوند.
- release kernel به‌تنهایی self-host، deploy یا DR readiness production را ثابت نمی‌کند و `done_tested` نیست.
