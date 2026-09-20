# فاز M167: Reproducible Build و Release Manifest

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/reproducible-release-runtime.ts`
**تست:** `test/next-platform-hardening-phases-8.test.ts`
**gap:** `GAP-PO-11`

## هدف و مرز

M167 build را به source revision، lockfile، toolchain digest، hermetic/sandbox boundary، SBOM،
provenance، scan، rollback artifact و promotion evidence bind می‌کند. release بدون reproducibility،
no-clobber و approval وارد محیط بالاتر نمی‌شود. این فاز hermetic builder، registry، attestation verifier،
scanner، release controller یا canary platform واقعی نیست.

## معماری

- `validateM167BuildPlan`: source، lockfile، toolchain، config، reproducibility، sandbox و no-network.
- `decideM167Build`: artifact، SBOM، provenance، tests، scans و source/toolchain match.
- `validateM167Manifest`: signature reference، vulnerability/policy scan، rollback و no-clobber.
- `decideM167Promotion`: smoke، canary، rollback، operator، expiry و production approval.

Local-first می‌تواند build را با cache محلی immutable انجام دهد؛ dependency download باید از lockfile و
allowlist پیروی کند. provider/cloud registry یا paid build بدون consent و budget فعال نمی‌شود. release
manifest payload خام secret، customer data یا untrusted release claim را authority نمی‌کند.

## sprint plan

### Sprint A — Hermetic build

lockfile، toolchain digest، network denial، cache و source snapshot.

### Sprint B — Artifact evidence

SBOM، provenance، signature، vulnerability/license scan و immutable digest.

### Sprint C — Release manifest

rollback pair، policy admission، no-clobber و environment promotion.

### Sprint D — Canary

smoke، canary telemetry، expiry، rollback و incident hold.

## Threat Model

- **Dependency substitution:** lockfile، digest و signed provenance.
- **Build network exfiltration:** no-network sandbox و allowlist.
- **Artifact tampering:** immutable digest، signature و registry admission.
- **Vulnerable release:** vulnerability/policy scan و promotion gate.
- **Irreversible promotion:** rollback artifact، no-clobber و approval.
- **False reproducibility:** source/toolchain/config/reproducibility evidence مستقل لازم است.

## prompt pack

### `m167-release-engineer`

```text
نقش: Reproducible Release Engineer

build را به source revision، lockfile hash، toolchain digest و config bind کن. builder باید sandboxed
و no-network باشد. artifact را با digest، SBOM، provenance، signature، tests و scans admit کن و promotion
را با smoke، canary، rollback، expiry و approval انجام بده.
```

### `m167-release-auditor`

```text
نقش: Release Supply-chain Auditor

lockfile drift، toolchain substitution، network build، SBOM gap، signature، vulnerability scan،
rollback و production approval را بررسی کن. image tag یا CI green به‌تنهایی reproducible release evidence نیست.
```

## DoD و production evidence boundary

- build plan، build mismatch، scan failure، manifest و promotion expiry/rollback تست شوند.
- hermetic builder، registry، attestation verifier، SBOM/license/vulnerability scanners، release controller و canary telemetry باید متصل شوند.
- kernel M167 به‌تنهایی artifact integrity، vulnerability coverage، reproducibility یا release readiness production claim نیست.
