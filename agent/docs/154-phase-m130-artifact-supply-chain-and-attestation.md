# فاز M130: Artifact Supply Chain، SBOM و Attestation

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/artifact-supply-chain-runtime.ts`
**تست:** `test/next-platform-hardening-phases.test.ts`
**gap:** `GAP-SE-13`

## هدف و مرز

M130 admission artifact را به digest، signature، SBOM، provenance، attestation، license و runtime
sandbox متصل می‌کند. policy باید capability deny، source trust و review را enforce کند. secret lease
فقط reference opaque، scope-bound، کوتاه‌عمر و sandbox-bound است. egress فقط با allowlist، DLP،
redaction، consent و approval مجاز است. این فاز registry، signer/KMS، SBOM builder، image scanner،
secret broker، egress proxy یا sandbox runtime واقعی نیست.

## معماری و قراردادها

- `validateM130Artifact`: digest، signature، SBOM، attestation، provenance، license، trust و sandbox.
- `decideM130Admission`: admission policy و approval برای artifact source.
- `validateM130SecretLease`: expiry، revoke، scope، sandbox و opaque reference.
- `decideM130Egress`: domain allowlist، DLP، redaction، user consent و approval.

untrusted artifact هرگز به `builtin` runtime راه پیدا نمی‌کند؛ کد untrusted فقط sandboxed است.

## sprint plan

### Sprint A — Artifact identity

digest، version، provenance، signature و source trust.

### Sprint B — Dependency governance

SBOM، license policy، capability deny و vulnerability disposition.

### Sprint C — Runtime admission

sandbox/microVM boundary، attestation verification و revoke.

### Sprint D — Secret و egress

short-lived lease، scope، DLP، allowlist، consent و redacted output.

## Threat Model

- **Tampered artifact:** digest و signature verification لازم است.
- **Malicious dependency:** SBOM، license و capability policy اجباری است.
- **Untrusted runtime escape:** sandbox/microVM admission gate لازم است.
- **Secret exfiltration:** opaque lease، expiry، scope و DLP لازم است.
- **Unauthorized egress:** domain allowlist، consent و approval fail-closed می‌شوند.

## prompt pack

### `m130-supply-chain-engineer`

```text
نقش: Artifact Supply Chain Engineer

artifact را به digest، signature، SBOM، provenance، attestation، license و source trust متصل کن.
capability deny و sandbox admission اجباری است. secret فقط opaque short-lived lease باشد و egress
با allowlist، DLP، redaction، consent و approval gate شود.
```

### `m130-attestation-reviewer`

```text
نقش: Supply Chain Reviewer

artifact، dependency، SBOM، license، attestation، runtime، secret lease و egress را بررسی کن.
untrusted code را خارج از sandbox اجرا نکن و raw password/token/key را در log یا artifact نگذار.
fixture و signature شبیه‌سازی‌شده جای registry/KMS/scanner واقعی نیست.
```

## DoD و production evidence boundary

- artifact admission، denied capability، revoked lease، DLP و egress denial تست شوند.
- signed registry، SBOM/scanner، attestation verifier، secret broker، egress proxy و runtime sandbox باید integration شوند.
- kernel M130 به‌تنهایی artifact authenticity، dependency security، secret isolation یا egress compliance production claim نیست.
