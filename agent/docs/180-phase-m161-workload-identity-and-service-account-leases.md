# فاز M161: Workload Identity و Service-account Leases

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/workload-identity-runtime.ts`
**تست:** `test/next-platform-hardening-phases-7.test.ts`
**gap:** `GAP-IG-16`

## هدف و مرز

M161 هویت machine-to-machine را از static credential جدا می‌کند: issuer/audience proof، scoped binding،
short-lived lease، least privilege، rotation و revoke. service account باید owner و tenant داشته باشد و
هر action به resource و condition مشخص bind شود. این فاز IdP، workload attestation، credential broker،
policy store یا revoke fan-out واقعی نیست.

## معماری

- `validateM161Identity`: issuer، audience، proof، scope، tenant و human ownership.
- `decideM161Lease`: TTL، opaque reference، state، scope و idempotency.
- `validateM161Binding`: resource، action، least privilege، expiry و approval.
- `decideM161Rotation`: lease جدید، revoke قبلی، overlap bound و evidence.

Local-first از identity محلی با reference کوتاه‌عمر استفاده می‌کند؛ BYOK به machine identity خام
تبدیل نمی‌شود و free/local fallback باید در policy ثبت شود. raw password، private key، token و client
secret در identity contract، log یا test ذخیره نمی‌شود.

## sprint plan

### Sprint A — Identity proof

issuer/audience، subject، attestation و owner registry.

### Sprint B — Binding

resource/action condition، least privilege و tenant policy.

### Sprint C — Lease

short TTL، broker، idempotency، refresh و revoke.

### Sprint D — Rotation

dual-lease overlap، fan-out revoke، stale worker probe و audit.

## Threat Model

- **Stolen static credential:** short-lived opaque lease و rotation.
- **Confused deputy:** audience، subject و resource binding.
- **Scope escalation:** least privilege و exact action set.
- **Revocation lag:** propagation evidence و stale-cache denial.
- **Tenant crossover:** identity، binding و lease tenant-bound.
- **Issuer spoofing:** trusted issuer registry و attestation verification.

## prompt pack

### `m161-workload-identity-engineer`

```text
نقش: Workload Identity Engineer

هویت را با issuer، audience، subject، proof، tenant و scope validate کن. برای resource binding
least privilege و expiry بگذار. credential فقط opaque short-lived lease باشد و rotation، revoke و
fan-out evidence تولید کند؛ raw key/token را ذخیره نکن.
```

### `m161-machine-identity-auditor`

```text
نقش: Machine Identity Auditor

issuer spoofing، audience confusion، scope escalation، stale revoke، static secret، tenant crossover
و overlap rotation را بررسی کن. JWT/mock issuer یا unit test جای IdP، attestation و broker واقعی نیست.
```

## DoD و production evidence boundary

- identity proof، lease expiry، least-privilege binding، rotation و revoke denial تست شوند.
- IdP/attestation، identity registry، lease broker، binding policy، secure storage و revoke propagation باید متصل شوند.
- kernel M161 به‌تنهایی workload authenticity، secret confidentiality، revocation SLA یا access isolation production claim نیست.
