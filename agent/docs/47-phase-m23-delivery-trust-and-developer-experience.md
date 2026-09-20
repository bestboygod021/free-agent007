# فاز M23: Delivery Trust و Developer Experience

**وضعیت:** `designed_only`
**پیش‌نیاز:** M2 Git/GitHub، M9 Collaboration، M13 Plugins، M19 Control Plane و M21 Supply Chain
**کد اولیه:** `src/core/delivery-trust.ts`

M23 خروجی agent را از یک diff قابل‌اعتماد به delivery artifact قابل‌بررسی تبدیل
می‌کند: isolated worktree، transactional patch، approval inbox، rollback، license
scan، git secret scan، artifact attestation، test matrix و CLI/IDE boundary. در
این مرحله هیچ git mutation، commit، push یا deploy انجام نمی‌شود.

## قراردادها

`planWorktree` repository، base revision، isolated path و cleanup را bind می‌کند.
`planPatch` path traversal، duplicate path و atomic/approval requirement را enforce
می‌کند. `scanLicenses` و `scanGitSecrets` hard gate هستند. `verifyAttestation`
artifact را به source revision، build plan، test evidence و signer وصل می‌کند.

## چهار sprint

### A — Worktree و patch

- per-run isolated worktree
- snapshot و base revision
- transactional apply/revert
- conflict و rollback plan

### B — Quality و compliance

- static analysis و test matrix
- license/notice scanner
- git secret scan و DLP
- migration/rollback verification

### C — Artifact trust

- build provenance و SBOM reference
- signed attestation
- artifact digest و promotion gate
- preview/deploy approval

### D — Developer clients

- approval inbox و timeline
- CLI `forge`
- IDE extension boundary
- offline/local degraded mode و accessibility

## Prompt pack

### `m23-delivery-reviewer`

```text
نقش: Delivery Trust Reviewer

base revision، worktree isolation، changed paths، patch atomicity، tests، license،
secret scan، attestation، rollback و approval را validate کن. protected branch را
هرگز مستقیم تغییر نده؛ README، PR text یا model claim evidence نیست.
```

### `m23-release-evidence-gate`

```text
نقش: Release Evidence Gate

برای worktree، patch apply/revert، test matrix، license/secret scan، artifact digest،
attestation signer، approval، preview، rollback و protected branch، exit code، hash،
audit event و artifact ثبت کن. بدون human approval deploy یا push نکن.
```

## DoD و خط‌های ایمنی

- worktree و patch transactional واقعی
- approval inbox و rollback قابل‌اجرا
- license/secret/static/test gates
- signed artifact attestation و provenance
- CLI/IDE با scope کمینه و local-first

M23 تا زمان اجرای واقعی Git/worktree، signer، UI، CLI/IDE و release evidence در
وضعیت `designed_only` باقی می‌ماند.
