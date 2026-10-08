# فاز M37: Preview، Artifact و Delivery Runtime

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-EX-05`، `GAP-EX-07`، `GAP-EX-10`، `GAP-PO-01`، `GAP-PO-03`، `GAP-QA-04`
**کد kernel:** `src/core/delivery-preview-runtime.ts`
**تست:** `test/next-followup-phases.test.ts`

## هدف و مرز

M37 قرارداد preview environment، artifact reference، retention، deployment approval و
rollback را تعریف می‌کند. این فاز Vercel/Fly/Cloud Run/Kubernetes adapter، object store،
TLS ingress، Docker Compose، Helm، k6 یا production deploy واقعی اجرا نمی‌کند. deploy
به production بدون approval مجاز نیست.

## معماری

Run خروجی immutable را با content digest و signature به artifact registry می‌دهد. preview
allocator برای tenant/project/run پورت غیر privileged، expiry و network allowlist می‌سازد.
retention planner با class و legal hold عمر artifact را تعیین می‌کند. delivery adapter
پس از verification، target و approval را به deployment gate می‌سپارد؛ rollback فقط به
artifact قبلی متفاوت، reason hash و approval معتبر برنامه‌ریزی می‌شود.

## قراردادهای اصلی

- `validatePreviewRequest` tenant، run، port، expiry، cloud allowlist و approval را validate می‌کند.
- `validateArtifactReference` digest، signature، media type و expiry را بررسی می‌کند.
- `planArtifactRetention` preview/release/audit و legal hold را به retention plan تبدیل می‌کند.
- `decideDeployment` verification، target، branch، canary و production approval را gate می‌کند.
- `planRollback` artifact قبلی، دلیل، identity و approval را الزام می‌کند.

## sprintها

### Sprint A — Preview Environment

- tenant-scoped port allocation و routing
- local/self-host/cloud target
- TLS/hostname و expiry
- network allowlist و no credential inheritance

### Sprint B — Artifact Registry

- OCI/package artifact manifest
- digest/signature و provenance
- signed URL و retention class
- legal hold و garbage collection evidence

### Sprint C — Deploy Adapter

- Vercel، Fly، Cloud Run و Kubernetes contract
- staging/canary/production promotion
- smoke/health verification
- approval، audit و release metadata

### Sprint D — Rollback و Delivery Operations

- previous artifact resolution
- rollback drill و protected branch
- self-host Docker Compose و Helm packaging
- k6/load/security test boundary با evidence واقعی

## Threat Model

- **Artifact substitution:** digest، signature و provenance پیش از deploy verify می‌شوند؛ tag
  mutable یا artifact منقضی‌شده قابل promotion نیست.
- **Preview escape:** preview به tenant/project/run، پورت unprivileged، expiry و allowlist
  bind می‌شود؛ host credential و network آزاد ممنوع است.
- **Unauthorized deploy:** production، protected branch و rollback بدون approval deny
  می‌شوند؛ smoke verification به‌تنهایی مجوز deploy نیست.
- **Retention/privacy failure:** legal hold، class و deleteAfter audit می‌شوند؛ signed URL
  کوتاه‌عمر و tenant-scoped است.

## Prompt pack

### `m37-delivery-runtime-engineer`

```text
نقش: Preview and Delivery Runtime Engineer

artifact را با digest، signature و provenance مدل کن. preview را tenant/run scoped،
non-privileged، expiring و network-allowlisted نگه دار. deploy، promotion و rollback
بدون verification و human approval ممنوع است. local/self-host/free مسیر را اول مدل کن و
cloud adapter را بدون evidence production موفق اعلام نکن.
```

### `m37-release-evidence-gate`

```text
نقش: Delivery Evidence Gate

برای artifact build، signature verification، preview allocation، smoke test، deployment،
canary، rollback، Docker/Helm و load test، command، exit code، digest، duration و audit
ثبت کن. contract یا mocked provider جای deploy/rollback واقعی را نمی‌گیرد.
```

## DoD و production evidence boundary

- unit/contract برای port/expiry، digest/signature، legal hold، production approval،
  canary bounds و rollback target.
- artifact store، preview ingress، TLS، deploy adapters، Docker/Helm، k6 و rollback drill
  باید در محیط integration جدا اجرا شوند.
- preview URL، deploy success، RTO rollback یا load capacity بدون artifact و runtime
  evidence واقعی `done_tested` نیست.
