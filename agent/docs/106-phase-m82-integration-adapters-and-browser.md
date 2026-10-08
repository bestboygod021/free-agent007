# فاز M82: Integration Adapters، Browser Runtime و Probe Evidence

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IG-02`، `GAP-IG-03`، `GAP-IG-05`، `GAP-IG-06`، `GAP-IG-08`، `GAP-IG-09`
**کد kernel:** `src/core/integration-adapter-runtime.ts`
**تست:** `test/next-governance-and-trust-phases.test.ts`

## هدف و مرز

M82 adapterهای GitHub App، MCP، database و browser را از contract تا probe evidence به هم وصل
می‌کند. scope، auth reference، tenant boundary، rate/protocol behavior، browser allowlist،
human handover و rollback باید یکسان باشند. این فاز GitHub installation/token service، MCP
client، database introspection، browser runner، queue/rate limiter یا webhook server واقعی را
اجرا نمی‌کند.

## معماری

`IntegrationAdapterManifest` kind، endpoint، opaque auth reference، scopes، capabilities،
tenant scope و review را مشخص می‌کند. `decideIntegrationOperation` target organization،
operation، scope، idempotency و approval را بررسی می‌کند. browser policy raw secret injection را
به‌صورت type-level false می‌کند. `IntegrationProbeEvidence` authentication، least privilege،
tenant isolation، protocol و rollback را جمع می‌کند.

## قراردادهای اصلی

- `validateIntegrationAdapterManifest` HTTPS، scope، review، probe، tenant و reference safety را validate می‌کند.
- `decideIntegrationOperation` cross-tenant، out-of-scope و write/execute بدون approval را رد می‌کند.
- `validateBrowserSessionPolicy` allowlist، recording، handover، egress و secret injection را gate می‌کند.
- `validateIntegrationProbeEvidence` auth، least privilege، tenant isolation، exit code و rollback را بررسی می‌کند.

## sprintها

### Sprint A — GitHub App

- installation/token کوتاه‌عمر
- permission و webhook
- repo/organization scope
- revoke و rate handling

### Sprint B — MCP و Database

- MCP capability manifest
- server allowlist
- read-only introspection
- write approval و rollback

### Sprint C — Browser

- session store
- domain allowlist
- recording/provenance
- human handover

### Sprint D — Probe Operations

- auth/least privilege probe
- tenant isolation probe
- protocol/webhook probe
- rollback و evidence bundle

## Threat Model

- **Credential exposure:** فقط opaque auth reference مجاز است؛ raw password/token/API key رد می‌شود.
- **Cross-tenant action:** actor، request و target organization باید همسان باشند.
- **Scope escalation:** operation خارج از reviewed scopes اجرا نمی‌شود.
- **Browser exfiltration:** domain allowlist، egress approval و no secret injection اجباری است.
- **False integration:** probe بدون tenant isolation، exit code صفر یا rollback موفق قابل قبول نیست.

## Prompt pack

### `m82-integration-adapter-engineer`

```text
نقش: Integration Adapter Engineer

برای GitHub/MCP/database/browser manifest مشترک بساز: tenant scope، opaque auth reference،
least-privilege scope، review و probe اجباری است. write/execute approval و idempotency داشته باشد.
browser فقط allowlist، recording، human handover و egress approval دارد؛ raw secret injection ممنوع.
```

### `m82-adapter-evidence-gate`

```text
نقش: Adapter Evidence Gate

برای installation/auth، scope، protocol/webhook، browser session، tenant probe و rollback،
manifest hash، target organization، command، exit code و evidence hash ثبت کن. mock adapter یا
HTTP 200 جای least-privilege و tenant-isolation probe واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای manifest، scope، operation، browser policy و probe evidence.
- GitHub App، MCP client، database connector، browser runner، queue/rate limiter و webhook server باید integration شوند.
- kernel M82 به‌تنهایی external connector/browser production readiness را ثابت نمی‌کند و `done_tested` نیست.
