# فاز M205: Capability Attestation و Trust-bound Activation

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/capability-attestation-runtime.ts`
**تست:** `test/next-platform-hardening-phases-16.test.ts`
**gap:** `GAP-SE-22`

## هدف و مرز

M205 پیش از فعال‌سازی capability، attestation امضاشده، artifact/environment match، policy match،
permission scope، revocation و approval را gate می‌کند. این فاز issuer، verifier، registry، sandbox
اجرایی یا revoke fan-out واقعی نیست؛ signature field در kernel اثبات cryptographic production نیست.

## معماری و قرارداد

- `validateM205Attestation`: subject/capability، artifact/environment، issuer/signature، policy، expiry و revocation check.
- `decideM205Activation`: requested/approved scope، attestation validity، no-network، secret-free، approval و tenant.
- `decideM205Revocation`: propagation، immediate block و no reactivation.
- `validateM205Verification`: signature، artifact/environment و unexpected permission evidence.

Local-first و BYOK مسیرهای مجاز هستند؛ free-tier فقط capabilityهایی را فعال می‌کند که model/provider
card و quota آن‌ها قابل‌بررسی باشد. raw credential و secret material در attestation ذخیره نمی‌شود.

## Threat model

- **Artifact substitution:** hash و signature match.
- **Environment drift:** environment attestation و verification.
- **Permission escalation:** requested scope subset of approved scope.
- **Revocation race:** propagation و block پیش از activation بعدی.
- **Fake issuer:** issuer registry و verifier واقعی در integration.
- **Secret/network exfiltration:** default no-network و secret-free activation.

## Sprint plan

### Sprint A — Attestation format

issuer، subject، artifact/environment digest، policy reference و expiry.

### Sprint B — Verification

signature verifier، registry، environment probe و permission scan.

### Sprint C — Activation

capability gateway، scope intersection، approval و sandbox binding.

### Sprint D — Revocation

revocation event، cache purge، worker block، no-reactivation و replay evidence.

## prompt pack

### `m205-trust-engineer`

```text
نقش: Capability Trust Engineer
هر activation باید attestation معتبر، artifact/environment match، policy match، approved scope، approval
و tenant proof داشته باشد. default no-network و secret-free را حفظ کن؛ revocation باید فوری block و fan-out شود.
```

### `m205-attestation-auditor`

```text
نقش: Attestation Auditor
artifact substitution، environment drift، permission escalation، fake issuer و revocation race را تست کن.
signed string یا mock registry جای verifier، issuer trust root، sandbox binding و revoke propagation واقعی نیست.
```

## DoD و production evidence boundary

- expired/revoked attestation، scope expansion، artifact mismatch و permission mismatch deny شوند.
- issuer/verifier، capability registry، environment probe، activation gateway و revocation propagation متصل شوند.
- kernel M205 به‌تنهایی attestation cryptographic، sandbox isolation، supply-chain trust یا capability safety claim نیست.
