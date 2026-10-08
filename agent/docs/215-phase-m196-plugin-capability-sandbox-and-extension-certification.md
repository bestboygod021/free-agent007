# فاز M196: Plugin Capability Sandbox و Extension Certification

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/plugin-certification-runtime.ts`
**تست:** `test/next-platform-hardening-phases-14.test.ts`
**gap:** `GAP-SE-21`

## هدف و مرز

M196 extension را با publisher، artifact digest، API version، capability/permission، license، signature،
attestation، sandbox، no-network، no-secret، certification، behavior/static scan و revocation محدود می‌کند.
این فاز marketplace registry، sandbox executor، scanner، publisher verifier، permission broker یا revoke
propagation واقعی نیست.

## معماری

- `validateM196Manifest`: manifest کامل، capabilities/permissions، digest، license، signature، sandbox و no-network/no-secret.
- `decideM196Execution`: input/target، capability، timeout، sandbox، network/secret denial، approval و tenant.
- `validateM196Certification`: API/license، static/behavior/permission evidence، publisher، expiry و approval.
- `decideM196Revocation`: reason، timestamp، propagation، block، approval و tenant.

Local-first plugin execution در sandbox بدون network مسیر پایه است؛ BYOK/free-tier extension نمی‌تواند
secret یا credential بگیرد. untrusted plugin، README، package metadata و publisher claim authority امنیتی
ندارند و باید verifier evidence داشته باشند.

## Sprint plan

### Sprint A — Manifest

publisher، digest، API، entrypoint، capability، permission و license.

### Sprint B — Certification

signature/attestation، static scan، behavior test و permission review.

### Sprint C — Safe execution

sandbox، timeout، target reference، no-network و no-secret.

### Sprint D — Revocation

blocked artifact، propagation، cache invalidation و audit.

## Threat Model

- **Malicious extension:** digest، publisher verification و attestation.
- **Capability escalation:** explicit permission و requested capability.
- **Network exfiltration:** no-network و sandbox.
- **Secret theft:** no-secret و reference-only inputs.
- **Sandbox escape:** bounded timeout و executor isolation.
- **Revoked plugin reuse:** propagation و block gate.

## prompt pack

### `m196-plugin-engineer`

```text
نقش: Plugin Trust Engineer

plugin را با publisher، artifact digest، API، capability، permission، license، signature و attestation
ثبت کن. execution باید sandboxed، bounded، no-network و no-secret باشد. certification شامل static/behavior/
permission evidence و expiry است و revoke باید propagate و block شود.
```

### `m196-plugin-auditor`

```text
نقش: Extension Security Auditor

publisher spoof، digest drift، capability escalation، network/secret exfiltration، sandbox escape و revoked
artifact reuse را بررسی کن. package metadata یا plugin mock جای registry، scanner، sandbox و revoke propagation واقعی نیست.
```

## DoD و production evidence boundary

- manifest، network denial، secret denial، expired certification، sandbox execution و revocation تست شوند.
- extension registry، artifact/publisher verifier، sandbox executor، scanners، permission broker و revoke propagation باید متصل شوند.
- kernel M196 به‌تنهایی plugin safety، sandbox isolation، license compliance یا marketplace trust production claim نیست.
