# فاز M106: Artifact Lifecycle، Preview و Signed Delivery

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-EX-05`، `GAP-EX-07`، `GAP-PO-01`، `GAP-PO-03`، `GAP-PO-04`
**کد kernel:** `src/core/artifact-preview-delivery-runtime.ts`
**تست:** `test/next-control-plane-phases.test.ts`

## هدف و مرز

M106 artifact digest/provenance، preview environment، signed delivery URL و rollback evidence را
در یک lifecycle می‌گذارد. artifact باید secret scan، tenant scope، retention و signature داشته
باشد. preview باید TLS، isolation، network allowlist، port binding و expiry داشته باشد.
delivery access-log و expiry لازم دارد و deploy بدون approval ممنوع است. این فاز object storage،
preview router، TLS provisioner، signed URL service، deploy adapter یا rollback executor واقعی را
اجرا نمی‌کند.

## معماری

`ArtifactLifecycleContract` digest، size/media type، source run، provenance، signature، retention
و revoke را ثبت می‌کند. `PreviewEnvironmentContract` state، hostname، TLS، tenant probe، network
allowlist، port و cleanup را gate می‌کند. `ArtifactDeliveryRequest` recipient، signed URL hash،
expiry، limit و access log دارد. `ArtifactRollbackEvidence` digestهای قبل/بعد، backup، smoke و
exit code را نگه می‌دارد.

## قراردادهای اصلی

- `validateM106Artifact`: digest، provenance، signature، retention، secret scan و tenant scope را validate می‌کند.
- `decideM106Preview`: preview namespace، TLS، isolation، allowlist، port و expiry را gate می‌کند.
- `decideM106Delivery`: signed delivery، expiry، download limit، access log و deploy approval را بررسی می‌کند.
- `validateM106RollbackEvidence`: previous/failed digest، backup، smoke و rollback exit code را validate می‌کند.

## sprintها

### Sprint A — Artifact Store

- digest و media type
- provenance/SBOM/signature
- secret scan
- retention/revoke

### Sprint B — Preview

- port allocation
- TLS/hostname
- tenant isolation
- network allowlist و expiry

### Sprint C — Delivery

- signed URL
- recipient authorization
- download limit
- access logging

### Sprint D — Rollback

- previous artifact
- backup reference
- smoke check
- operator evidence و revoke

## Threat Model

- **Artifact tampering:** digest، provenance و signature همزمان لازم‌اند.
- **Preview escape:** namespace، TLS، tenant probe و network allowlist اجباری است.
- **URL leakage:** signed URL expiry، limit و access log دارد.
- **Stale artifact:** retention و revoke قبل از delivery بررسی می‌شوند.
- **Unsafe rollback:** backup و smoke evidence بدون exit success پذیرفته نمی‌شود.

## Prompt pack

### `m106-artifact-delivery-engineer`

```text
نقش: Artifact and Preview Engineer

artifact را با digest، provenance، signature، SBOM، secret scan، retention و tenant scope ثبت کن.
preview باید TLS، hostname namespace، port، network allowlist، isolation و expiry داشته باشد.
signed delivery را با recipient، limit و access log gate کن؛ deploy و rollback نیازمند approval و evidence است.
```

### `m106-delivery-evidence-gate`

```text
نقش: Delivery Evidence Gate

برای artifact، preview، signed URL و rollback، digest/signature، hostname/TLS، tenant probe،
expiry، access log، backup، smoke، command و exit code ثبت کن. local zip یا screenshot جای object
store، router، TLS، signed URL، deploy و rollback integration evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای artifact، preview، delivery و rollback.
- object store، preview router، TLS/certificate، signed URL، deploy adapter و rollback executor باید integration شوند.
- kernel M106 به‌تنهایی artifact storage، preview isolation یا delivery production را ثابت نمی‌کند و `done_tested` نیست.
