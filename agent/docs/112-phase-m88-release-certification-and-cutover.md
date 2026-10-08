# فاز M88: Release Certification، Canary و Controlled Cutover

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-PO-01`، `GAP-PO-02`، `GAP-PO-03`، `GAP-PO-05`، `GAP-PO-06`، `GAP-EX-10`، `GAP-OB-05`
**کد kernel:** `src/core/release-certification-runtime.ts`
**تست:** `test/next-orchestration-and-release-phases.test.ts`

## هدف و مرز

M88 آخرین مرز قبل از release واقعی را formalize می‌کند: release candidate، artifact/SBOM/signature،
CI/E2E/security/accessibility evidence، backup/rollback، canary observation، promotion و abort.
production cutover فقط با approval و نبود incident باز مجاز است. این فاز Compose/Kubernetes
deployment، registry، canary traffic manager، backup executor، migration runner یا production release واقعی را اجرا نمی‌کند.

## معماری

`ReleaseCandidateContract` همه artifact و evidence hashها را همراه backup/rollback نگه می‌دارد.
`ReleaseCutoverRequest` environment، rollout، traffic، operator، incident و rollback را مشخص
می‌کند. `ReleaseCanaryEvidence` error/latency/availability و tenant probe را ثبت می‌کند.
`ReleaseRollbackEvidence` backup، command، exit code، health و data integrity را اثبات می‌کند.

## قراردادهای اصلی

- `validateReleaseCandidate` artifact، SBOM، signature، CI، E2E، security، accessibility و rollback را بررسی می‌کند.
- `decideReleaseCutover` production approval، canary bounds، incident و organization boundary را gate می‌کند.
- `validateReleaseCanaryEvidence` metrics، threshold، traffic و tenant probe را validate می‌کند.
- `validateReleaseRollbackEvidence` command، backup، exit code، health و data integrity را enforce می‌کند.

## sprintها

### Sprint A — Artifact Trust

- immutable artifact
- digest/SBOM/signature
- changelog/version
- vulnerability/license scan

### Sprint B — Deployment

- Docker Compose
- Kubernetes/Helm
- migration dry-run
- backup before upgrade

### Sprint C — Canary

- traffic percentage
- error/latency/availability
- tenant isolation
- promote/hold/rollback

### Sprint D — Cutover/DR

- production approval
- incident abort
- rollback rehearsal
- post-release evidence

## Threat Model

- **Unsigned release:** candidate بدون artifact، SBOM یا signature evidence hold می‌شود.
- **Unsafe production action:** production approval، rollback hash و operator لازم است.
- **Canary blast radius:** traffic بیشتر از ۲۵٪ در canary مجاز نیست.
- **Release during incident:** incident باز cutover را block می‌کند.
- **Rollback illusion:** exit code، restored health و data integrity همگی لازم هستند.

## Prompt pack

### `m88-release-certification-engineer`

```text
نقش: Release Certification Engineer

release candidate را با artifact digest، SBOM، signature، CI/E2E/security/accessibility evidence،
backup و rollback verify کن. canary را ۱ تا ۲۵ درصد نگه دار و error/latency/availability و tenant
probe را observe کن. production فقط با approval و بدون incident باز promote شود.
```

### `m88-cutover-evidence-gate`

```text
نقش: Cutover Evidence Gate

برای candidate، canary، promote، hold، rollback و abort، artifact/evidence hash، traffic، metric،
operator، approval، command و exit code ثبت کن. staging green یا signed artifact به‌تنهایی production
readiness و rollback evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای candidate، cutover، canary، incident block و rollback.
- registry/deployment، Compose/Kubernetes، migration/backup، traffic manager و production approval workflow باید integration شوند.
- kernel M88 به‌تنهایی release certification، deployment success یا production readiness را ثابت نمی‌کند و `done_tested` نیست.
