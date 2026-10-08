# فاز M135: Device Pairing و Local Trust

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/device-pairing-trust-runtime.ts`
**تست:** `test/next-platform-hardening-phases-2.test.ts`
**gap:** `GAP-CP-16`

## هدف و مرز

M135 اتصال local-first device، CLI، browser و worker را به trust lifecycle تبدیل می‌کند. device باید
opaque key reference، attestation، platform، capability و trust state داشته باشد. pairing باید
challenge-bound، کوتاه‌عمر، tenant-matched، consented و MFA/approval-bound باشد. session grant باید
scope و expiry داشته باشد و revocation باید به active grants و local cache propagate شود. این فاز
WebAuthn/IdP، secure enclave، QR transport، device registry، notification یا remote attestation
provider واقعی نیست.

## معماری و قراردادها

- `validateM135Device`: device identity، attestation، capability، trust state و opaque key reference.
- `decideM135Pairing`: challenge، scope، consent، approval، tenant match، MFA و expiry.
- `validateM135Grant`: grant lifetime، scope، tenant/MFA/approval و no-private-key storage.
- `decideM135Revocation`: propagation، active grant revoke، cache invalidation و audit.

private key، password، token و raw credential ذخیره یا در audit ثبت نمی‌شود؛ فقط reference/hash باقی می‌ماند.

## sprint plan

### Sprint A — Device identity

device registry، platform، attestation، capability و pending/trusted/revoked state.

### Sprint B — Pairing

local challenge، QR/admin invite، user consent، MFA و approval.

### Sprint C — Scoped grant

short-lived grant، scope attenuation، refresh boundary و local-only mode.

### Sprint D — Revocation

grant invalidation، cache purge، offline recovery و revocation evidence.

## Threat Model

- **Rogue device:** attestation، approval و capability allowlist لازم است.
- **Pairing replay:** challenge hash و expiry جلوی replay را می‌گیرد.
- **Cross-tenant device grant:** tenant match fail-closed است.
- **Long-lived credential:** grant کوتاه‌عمر و refresh constrained است.
- **Revocation lag:** propagation، cache invalidation و active grant revoke ثبت می‌شوند.
- **Key leakage:** opaque reference و no-raw-private-key contract اجباری است.

## prompt pack

### `m135-device-trust-engineer`

```text
نقش: Local Device Trust Engineer

device را با attestation، platform، opaque key reference، capability و trust state ثبت کن. pairing
باید challenge-bound، کوتاه‌عمر، tenant-matched، consented و MFA/approval-bound باشد. grant را
scoped و کوتاه‌عمر بساز و raw private key/password/token را ذخیره نکن.
```

### `m135-pairing-reviewer`

```text
نقش: Device Pairing Reviewer

challenge replay، remote capability، tenant match، grant expiry، revocation propagation و local
cache را ممیزی کن. mock QR، fixture attestation یا unit test جای IdP، secure enclave و device
registry واقعی نیست.
```

## DoD و production evidence boundary

- device، pairing، grant، revocation و negative tenant/MFA/replay paths تست شوند.
- IdP/WebAuthn، device registry، attestation verifier، secure storage، grant service و notification باید integration شوند.
- kernel M135 به‌تنهایی device authenticity، secure pairing، revocation convergence یا local agent trust production claim نیست.
