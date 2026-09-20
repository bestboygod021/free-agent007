# فاز M43: Self-host، Release و Resilience Runtime

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-EX-10`، `GAP-OB-05`، `GAP-OB-06`، `GAP-PO-01`، `GAP-PO-03`، `GAP-PO-04`، `GAP-PO-06`
**کد kernel:** `src/core/self-host-resilience-runtime.ts`
**تست:** `test/next-runtime-phases.test.ts`

## هدف و مرز

M43 مرز self-host profile، release candidate، recovery drill، chaos experiment و upgrade
plan را تعریف می‌کند. این فاز Docker Compose، Helm/Kubernetes، Cloud Run/Vercel/Fly
adapter، backup object store، chaos runner، changelog pipeline یا Enterprise upgrade
service واقعی اجرا نمی‌کند. هر production release، recovery و external egress approval می‌خواهد.

## معماری

Self-host profile deployment mode، digestهای image، database URL reference و secret store
را validate می‌کند. release planner candidate را با commit، artifact digest، changelog،
tests/security و channel gate می‌کند. recovery planner فقط isolated/staging target،
RPO/RTO، restore steps و rollback hash می‌پذیرد. chaos experiment blast radius، isolation،
stop condition و duration دارد؛ upgrade planner compatibility، backup، migration/rollback
و approval را قبل از version change الزام می‌کند.

## قراردادهای اصلی

- `validateSelfHostProfile` mode، digest، opaque database reference، secret store و egress را بررسی می‌کند.
- `planReleaseCandidate` artifact، test/security evidence، channel و stable approval را gate می‌کند.
- `planSelfHostRecovery` target، RPO/RTO، restore steps، rollback و approval را validate می‌کند.
- `decideChaosExperiment` isolation، blast radius، stop condition، duration و staging approval را enforce می‌کند.
- `validateUpgradePlan` version، compatibility، backup، migration/rollback و approval را بررسی می‌کند.

## sprintها

### Sprint A — Self-host Packaging

- Docker Compose local/self-host profile
- Helm chart و Kubernetes manifests
- secret store local encrypted/Vault/KMS
- network/egress و persistent volume policy

### Sprint B — Release Engineering

- semantic version و changelog
- signed release artifact و stable/canary/nightly
- compatibility matrix و migration manifest
- release approval و protected branch

### Sprint C — Backup و Recovery

- backup manifest/checksum و retention
- isolated restore و RPO/RTO measurement
- rollback و failed migration recovery
- self-host upgrade path و operator runbook

### Sprint D — Chaos و Resilience

- worker/provider/database/network fault injection
- single-run/single-tenant/staging blast radius
- stop condition و incident evidence
- load/security/DR regression در release gate

## Threat Model

- **Supply-chain substitution:** image/artifact digest و signed release پیش از install/upgrade
  لازم است؛ mutable tag یا unverified package پذیرفته نیست.
- **Self-host secret exposure:** database URL و secret فقط opaque reference هستند؛ Kubernetes
  profile بدون Vault/KMS مجاز نیست و external egress explicit approval می‌خواهد.
- **Destructive recovery/upgrade:** restore در production مستقیم انجام نمی‌شود؛ backup،
  compatibility، rollback و approval قبل از migration لازم است.
- **Chaos blast radius:** experiment باید isolated، bounded و stop-conditionدار باشد؛ chaos
  بدون approval برای staging یا بدون audit ممنوع است.

## Prompt pack

### `m43-self-host-release-engineer`

```text
نقش: Self-host and Resilience Release Engineer

profile را با mode، image digest، database reference و secret store validate کن. stable
release، upgrade، recovery و external egress بدون approval متوقف شود. recovery ابتدا در
isolated/staging با RPO/RTO و rollback evidence انجام شود. chaos فقط bounded و stop-conditionدار
باشد و local-first/BYOK مسیر پیش‌فرض باقی بماند.
```

### `m43-release-evidence-gate`

```text
نقش: Release and Resilience Evidence Gate

برای Compose/Helm، artifact/signature، release، migration، backup/restore، rollback و
chaos، command، exit code، digest، duration، RPO/RTO، blast radius و audit ثبت کن.
contract یا dry-run به‌جای self-host/recovery/chaos واقعی evidence production نیست.
```

## DoD و production evidence boundary

- unit/contract برای profile، digest، release channel، recovery target، chaos boundary و
  upgrade compatibility.
- Docker/Compose، Helm/Kubernetes، cloud adapter، backup/restore، migration و chaos باید
  در integration واقعی و محیط isolated اجرا شوند.
- self-host readiness، deploy adapter، RTO/RPO، rollback success یا resilience claim بدون
  evidence قابل بازپخش `done_tested` نیست.
