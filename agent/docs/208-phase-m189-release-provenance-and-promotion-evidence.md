# فاز M189: Release Provenance و Promotion Evidence

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/release-provenance-runtime.ts`
**تست:** `test/next-platform-hardening-phases-13.test.ts`
**gap:** `GAP-PO-15`

## هدف و مرز

M189 زنجیره release را از source commit تا artifact digest، build recipe، SBOM، attestation، signer،
reproducibility، smoke evidence، canary، rollback و promotion approval bind می‌کند. این فاز manifest،
attestation و promotion را قرارداد می‌کند؛ builder، registry، signer، canary controller، deployment
adapter و rollback runtime واقعی نیست.

## معماری

- `validateM189Manifest`: artifact/source/build/SBOM/attestation hash، signer، target و quality gates.
- `decideM189Promotion`: stage transition، smoke، policy، rollback digest، canary و approval.
- `validateM189Attestation`: issuer، signature، trusted builder، source/SBOM match و expiry.
- `decideM189Rollback`: target digest مستقل، reason/health evidence، bound و no-forward-mutation.

Local-first build و self-hosted registry مسیر پیش‌فرض‌اند؛ free-tier/BYOK signing service فقط با key
reference و disclosure استفاده می‌شود. secret خام یا credential در manifest، log یا audit ذخیره نمی‌شود.

## Sprint plan

### Sprint A — Manifest

artifact digest، source commit، build recipe، SBOM و signer reference.

### Sprint B — Attestation

trusted builder، signature verification، subject match و expiry.

### Sprint C — Promotion

smoke، policy، canary bound، approval و tenant boundary.

### Sprint D — Rollback

rollback digest، health evidence، no-forward mutation و recovery drill.

## Threat Model

- **Artifact substitution:** digest، source commit و attestation subject match.
- **Unsigned build:** signer و signature verification.
- **Non-reproducible release:** build recipe و reproducibility evidence.
- **Canary bypass:** bounded percentage، smoke و approval.
- **Rollback poisoning:** distinct rollback digest و health evidence.
- **Secret leakage:** reference-only signer/credential و redacted evidence.

## prompt pack

### `m189-release-provenance-engineer`

```text
نقش: Release Provenance Engineer

manifest را به artifact digest، source commit، build recipe، SBOM، attestation و signer bind کن. promotion
فقط با smoke، policy، canary bound، rollback digest و approval انجام شود. attestation باید signature،
trusted builder، source/SBOM match و expiry داشته باشد.
```

### `m189-release-auditor`

```text
نقش: Release Provenance Auditor

artifact substitution، unsigned build، stale attestation، canary bypass و rollback mutation را بررسی کن.
manifest mock یا hash محلی جای registry، signer، builder، canary و deployment evidence واقعی نیست.
```

## DoD و production evidence boundary

- manifest، promotion، attestation expiry، reproducibility denial و rollback تست شوند.
- hermetic builder، artifact registry، SBOM/provenance verifier، signing service، canary controller و rollback runner باید متصل شوند.
- kernel M189 به‌تنهایی supply-chain integrity، reproducible build، deployment safety یا release production claim نیست.
