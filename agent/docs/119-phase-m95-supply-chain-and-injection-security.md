# فاز M95: Supply-chain، Artifact Provenance و Injection Security

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-SE-01`، `GAP-SE-05`، `GAP-SE-06`، `GAP-EX-12`، `GAP-PO-04`
**کد kernel:** `src/core/supply-chain-security-runtime.ts`
**تست:** `test/next-memory-security-client-phases.test.ts`

## هدف و مرز

M95 dependency، artifact، secret lease و injection guard را در یک supply-chain boundary جمع
می‌کند. dependency باید provenance، integrity، license، vulnerability و allowlist داشته باشد.
artifact باید SBOM/provenance/signature/reproducibility داشته باشد. secret lease کوتاه‌عمر و
zero-persistence است و به untrusted sandbox inject نمی‌شود. این فاز scanner، registry، signer,
Vault/KMS، DLP یا sandbox runtime واقعی را اجرا نمی‌کند.

## معماری

`SupplyChainDependencyRecord` source/integrity/license/scan/allowlist را ثبت می‌کند.
`SupplyChainArtifactAttestation` digest، SBOM، provenance، signer و reproducible build را gate
می‌کند. `SupplyChainSecretLease` scope و expiry دارد و raw reference، revoke یا sandbox injection
را رد می‌کند. `SupplyChainInjectionGuard` classifier score، blocked state، canary و human review را می‌گیرد.

## قراردادهای اصلی

- `validateSupplyChainDependency` source، integrity، license و vulnerability evidence را بررسی می‌کند.
- `decideSupplyChainArtifact` signature، SBOM، provenance، reproducibility و activation approval را gate می‌کند.
- `validateSupplyChainSecretLease` expiry، zero persistence و no sandbox injection را enforce می‌کند.
- `decideSupplyChainInjectionGuard` score، block، canary و human review را validate می‌کند.

## sprintها

### Sprint A — Dependency Trust

- lockfile/provenance
- license policy
- vulnerability scan
- allowlist/denylist

### Sprint B — Artifact Attestation

- digest/SBOM
- signed provenance
- reproducible build
- registry promotion

### Sprint C — Secret Lease

- opaque reference
- short TTL
- revoke/rotation
- zero persistence

### Sprint D — Injection Guard

- dependency/artifact/prompt/tool surfaces
- classifier/canary
- block/sanitize/review
- sandbox cleanup

## Threat Model

- **Dependency confusion:** source/integrity/allowlist لازم است.
- **Unsigned artifact:** signature/SBOM/provenance ناقص، activation را block می‌کند.
- **Secret leakage:** raw credential ممنوع و lease به sandbox untrusted inject نمی‌شود.
- **Injection bypass:** score بالا باید block شود؛ canary بدون human review عبور نمی‌کند.
- **License risk:** dependency بدون license scan معتبر نیست.

## Prompt pack

### `m95-supply-chain-security-engineer`

```text
نقش: Supply-chain Security Engineer

dependency را با source، integrity، license، vulnerability scan و allowlist verify کن. artifact را
با digest/SBOM/provenance/signature و reproducible build gate کن. secret فقط opaque short-lived lease
باشد و وارد sandbox نشود. injection score بالا را block و canary را human-review کن.
```

### `m95-security-evidence-gate`

```text
نقش: Supply-chain Evidence Gate

برای dependency، artifact، SBOM، signature، secret lease، revoke، injection، canary و block،
source/digest/provenance hash، expiry، classifier version، command و exit code ثبت کن. lockfile یا
mock scan جای registry/signing/Vault/sandbox evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای dependency، artifact، lease و injection guard.
- package/container/model scanner، registry، signer/KMS، Vault، DLP و sandbox باید integration شوند.
- kernel M95 به‌تنهایی supply-chain trust یا injection resilience production را ثابت نمی‌کند و `done_tested` نیست.
