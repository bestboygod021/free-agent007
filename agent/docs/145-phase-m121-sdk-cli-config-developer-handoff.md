# فاز M121: SDK/API Compatibility، Safe CLI، Config Bootstrap و Developer Handoff

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-API-12`، `GAP-CLI-05`، `GAP-CFG-04`، `GAP-DX-03`
**کد kernel:** `src/core/developer-sdk-cli-runtime.ts`
**تست:** `test/next-hardening-phases.test.ts`

## هدف و مرز

M121 قرارداد سازگاری SDK/API، اجرای safe CLI، bootstrap تنظیمات و handoff توسعه‌دهنده را تعریف
می‌کند. مسیرها فقط workspace-relative هستند؛ command injection، path traversal، secret output و
overwrite ناخواسته مسدود می‌شوند. BYOK فقط به reference امن/opaque اشاره می‌کند؛ raw password، API
key و token ذخیره یا چاپ نمی‌شوند. SDK generator، package registry، real shell runner و config
store در این kernel شبیه‌سازی نمی‌شوند.

## معماری

`M121SdkContract` version، compatibility، schema، examples، deprecation و migration note را بررسی
می‌کند. `decideM121CliRequest` command، args، cwd، approval، sandbox و output policy را gate می‌کند.
`M121ConfigBootstrap` path، existing config، backup، no-clobber و secret handling را validate می‌کند.
`M121DeveloperHandoff` docs، example، test، owner، status و limitation را بررسی می‌کند.

## sprintها

### Sprint A — SDK/API

schema versioning، backward/forward compatibility، deprecation و generated examples.

### Sprint B — CLI safety

allowlist command، relative cwd، sandbox، approval و redacted output.

### Sprint C — Config bootstrap

local-first defaults، BYOK reference، free-tier fallback، backup و no-clobber.

### Sprint D — Handoff

README، runbook، examples، troubleshooting، ownership و known limits.

## Threat Model

- **Command injection:** shell metacharacters و untrusted command block می‌شوند.
- **Path traversal:** absolute/out-of-workspace path رد می‌شود.
- **Secret disclosure:** raw secret در config، args، logs و output ممنوع است.
- **Breaking API:** version/schema/deprecation evidence لازم است.
- **Unsafe config overwrite:** existing file بدون backup و approval overwrite نمی‌شود.
- **Untrusted docs:** README، issue و webpage فقط input untrusted هستند.

## Prompt pack

### `m121-sdk-cli-engineer`

```text
نقش: SDK, CLI and Developer Experience Engineer

SDK contract را با schema/version/compatibility/deprecation validate کن. CLI را با allowlist،
workspace-relative path، sandbox، approval و redacted output اجراپذیر طراحی کن. config bootstrap
باید local-first، BYOK reference-only، free-tier fallback، backup و no-clobber داشته باشد.
```

### `m121-developer-handoff-reviewer`

```text
نقش: Developer Handoff Reviewer

README، example، test، runbook، owner، limitation و recovery را بررسی کن. هیچ secret را ذخیره یا
نمایش نده. generated SDK، registry، shell، package publish یا production integration واقعی را با
contract kernel اشتباه نکن.
```

## DoD و production evidence boundary

- compatibility matrix، safe CLI negative tests، config no-clobber و handoff checklist.
- SDK generation/publish، real sandbox، secret manager، config persistence و CLI telemetry باید integration شوند.
- kernel M121 به‌تنهایی API compatibility، command safety یا developer-ready production claim نیست.
