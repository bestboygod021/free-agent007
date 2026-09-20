# فاز M111: Plugin Marketplace و Extension Trust

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IG-03`، `GAP-IG-06`، `GAP-SE-05`، `GAP-SE-06`، `GAP-PO-04`
**کد kernel:** `src/core/plugin-marketplace-runtime.ts`
**تست:** `test/next-product-surface-phases.test.ts`

## هدف و مرز

M111 manifest، permission، host allowlist، package attestation، installation و invocation را
govern می‌کند. هر plugin باید digest، signature، publisher، sandbox، source review، SBOM، dependency
scan و license review داشته باشد. install باید consent، tenant isolation، rollback و idempotency
داشته باشد. invocation با permission، timeout، sandbox و output redaction محدود می‌شود. این فاز
marketplace UI، package registry، signature verifier، plugin worker، sandbox runtime یا MCP/database
adapter واقعی را اجرا نمی‌کند.

## معماری

`M111PluginManifestContract` plugin kind/version، package/manifest/signature، publisher، permission
و host allowlist را نگه می‌دارد. `M111PluginAttestationEvidence` SBOM، dependency/license/injection
scan و reproducible build را ثبت می‌کند. `M111PluginInstallRequest` granted subset، approval،
isolation، license، consent، rollback و idempotency را gate می‌کند. `M111PluginInvocationRequest`
permission، host، timeout، sandbox و redacted output را enforce می‌کند.

## قراردادهای اصلی

- `validateM111PluginManifest`: manifest، signature، explicit host و sandbox را validate می‌کند.
- `validateM111PluginAttestation`: SBOM، dependency/license/injection/secret scan و reproducibility را بررسی می‌کند.
- `decideM111PluginInstall`: granted permissions/hosts، approval، consent، isolation و rollback را gate می‌کند.
- `decideM111PluginInvocation`: operation permission، host، timeout، sandbox و output redaction را enforce می‌کند.

## sprintها

### Sprint A — Manifest

- plugin kind/version
- capability/permission
- host allowlist
- publisher identity

### Sprint B — Trust

- package digest/signature
- SBOM/license
- dependency/injection/secret scan
- reproducible build

### Sprint C — Marketplace

- submitted/verified/listed/revoked lifecycle
- review/approval
- tenant install
- consent و rollback

### Sprint D — Runtime

- sandbox invocation
- timeout/limits
- output redaction
- permission audit

## Threat Model

- **Malicious plugin:** signature، scan، source review و sandbox همزمان لازم‌اند.
- **Permission escalation:** granted set باید subset manifest باشد.
- **Host exfiltration:** wildcard host ممنوع و host allowlist صریح است.
- **Supply-chain replacement:** package digest و reproducible attestation بررسی می‌شود.
- **Output leakage:** invocation output باید redacted و audit شود.

## Prompt pack

### `m111-plugin-trust-engineer`

```text
نقش: Plugin Marketplace Trust Engineer

manifest را با package digest، signature، publisher، permission، host allowlist، sandbox و source
review بساز. attestation باید SBOM، dependency/license/injection/secret scan و reproducible build
داشته باشد. install فقط با consent، isolation، approval، rollback و idempotency انجام شود.
```

### `m111-plugin-evidence-gate`

```text
نقش: Plugin Evidence Gate

برای manifest، attestation، install و invocation، digest/signature، permission، host، SBOM، scan،
sandbox، timeout، redaction، command و exit code ثبت کن. manifest JSON یا local script جای registry،
verifier، sandbox و marketplace E2E evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای manifest، attestation، install و invocation.
- registry، signature verifier، package scanner، plugin sandbox، marketplace UI و MCP/database adapters باید integration شوند.
- kernel M111 به‌تنهایی governed marketplace یا secure plugin runtime production را ثابت نمی‌کند و `done_tested` نیست.
