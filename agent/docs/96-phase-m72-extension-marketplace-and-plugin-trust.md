# فاز M72: Extension Marketplace و Plugin Trust

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IG-03`، `GAP-IG-06`، `GAP-SE-05`، `GAP-SE-06`، `GAP-PO-04`
**کد kernel:** `src/core/extension-marketplace-runtime.ts`
**تست:** `test/next-governance-and-ecosystem-phases.test.ts`

## هدف و مرز

M72 اکوسیستم extension/plugin را با manifest، permission، signature، checksum، sandbox،
security scan، dependency scan و marketplace review کنترل می‌کند. built-in، reviewed upload و
community source از هم جدا هستند؛ high-risk community extension مستقیم listed یا installed
نمی‌شود. این فاز marketplace UI، package registry، runtime sandbox، scanner یا billing واقعی
را اجرا نمی‌کند.

## معماری

`ExtensionManifest` runtime، entrypoint/package hash، requested permissions، allowed domains،
risk، signer reference و sandbox را معرفی می‌کند. `ExtensionReview` reviewer، license و scan
hashها را ثبت می‌کند. `ExtensionSecurityEvidence` checksum/signature، sandbox/network/secret
probe را جدا می‌کند. installation فقط permissionهای declared و egress consent را می‌پذیرد.

## قراردادهای اصلی

- `validateExtensionManifest` runtime، permission، source، domain، risk و signer reference را validate می‌کند.
- `decideExtensionReview` reviewer، license، version match و security/dependency scan را gate می‌کند.
- `decideExtensionInstallation` granted permission، egress، approval و security evidence را enforce می‌کند.
- `validateExtensionSecurityEvidence` checksum، signature، sandbox، network و secret scan را بررسی می‌کند.

## sprintها

### Sprint A — Plugin SDK

- manifest و permission registry
- capability API
- sandbox/wasm/container boundary
- version compatibility

### Sprint B — Marketplace Review

- submit/review/list/revoke lifecycle
- license/dependency/security scan
- signer/checksum verification
- community moderation

### Sprint C — Installation

- permission diff و user consent
- egress domains
- rollback/uninstall
- audit و organization policy

### Sprint D — Ecosystem Operations

- vulnerability disclosure
- dependency refresh
- extension health
- enterprise allowlist/denylist

## Threat Model

- **Plugin supply chain:** package/entrypoint checksum و signature باید verify شوند؛ unverified package install نمی‌شود.
- **Permission escalation:** extension فقط declared/granted permission می‌گیرد؛ network permission egress consent می‌خواهد.
- **Sandbox escape:** uploaded/community extension sandboxed و security-probed است.
- **Secret exfiltration:** secret scan و network probe لازم است؛ plugin raw credential ندارد.
- **License risk:** license/dependency scan و reviewer approval پیش از listing لازم است.

## Prompt pack

### `m72-extension-marketplace-engineer`

```text
نقش: Extension Marketplace and Trust Engineer

manifest را با version، checksum، signature، permission، allowed domain، runtime و risk ثبت
کن. community/high-risk را مستقیم enable نکن. نصب فقط permission declared، egress consent،
sandbox probe و secret scan معتبر داشته باشد. revoke، rollback و vulnerability disclosure را
از ابتدا مدل کن.
```

### `m72-plugin-evidence-gate`

```text
نقش: Plugin Evidence Gate

برای submit، review، license/dependency scan، checksum/signature، sandbox/network/secret probe،
permission grant و revoke، artifact hash، scan report، command و exit code ثبت کن. manifest یا
static package list جای runtime sandbox و marketplace evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای manifest، permission، risk، review، signature، scan، install و revoke.
- package registry، marketplace UI، scanner، sandbox runtime، install/uninstall و policy enforcement باید integration شوند.
- plugin contract به‌تنهایی ecosystem trust یا safe extension execution production را ثابت نمی‌کند و `done_tested` نیست.
