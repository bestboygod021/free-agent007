# فاز M67: External Integration Gates و Adapter Probes

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IG-02`، `GAP-IG-03`، `GAP-IG-04`، `GAP-IG-06`، `GAP-IG-08`، `GAP-IG-09`، `GAP-IN-10`، `GAP-IN-11`
**کد kernel:** `src/core/external-integration-gate-runtime.ts`
**تست:** `test/next-platform-integration-phases.test.ts`

## هدف و مرز

M67 contractهای connector/model provider/webhook/database/MCP را به یک integration gate مشترک
می‌رساند. هر adapter manifest، capability، environment، sandbox، review و credential reference
دارد. هر capability پیش از run یک probe با request/response hash، exit code، tenant probe و
signature evidence می‌دهد. این فاز adapter network، OAuth/token broker، MCP server، database
connector یا webhook receiver واقعی را اجرا نمی‌کند.

## معماری

`ExternalAdapterManifest` نوع adapter، platform/provider، endpoint reference، capability names،
credential reference و environment را معرفی می‌کند. `ExternalIntegrationProbe` نتیجه قابل
بازپخش برای یک capability است. `ExternalIntegrationRun` فقط capabilityهای declared و probeهای
passed را اجرا می‌کند؛ production به review، approval و egress consent نیاز دارد. rollback
نیز evidence hash و approval دارد.

## قراردادهای اصلی

- `validateExternalAdapterManifest` capability، sandbox، review، environment و credential safety را validate می‌کند.
- `validateExternalIntegrationProbe` status، exit code، tenant isolation، webhook signature و timestamp را gate می‌کند.
- `decideExternalIntegrationRun` scope، capability evidence، egress و production approval را بررسی می‌کند.
- `validateExternalRollback` rollback evidence و approval را enforce می‌کند.

## sprintها

### Sprint A — Adapter Harness

- connector/provider/MCP adapter SDK
- manifest و capability registry
- local/sandbox/staging environment
- credential injection از reference

### Sprint B — Probe Matrix

- read/write capability probe
- tenant isolation و permission probe
- webhook signature/replay
- database introspection read-only

### Sprint C — Provider Runtime

- model endpoint request/response
- streaming و structured output
- rate-limit/backoff
- error normalization

### Sprint D — Integration Certification

- conformance suite
- staging evidence bundle
- rollback drill
- production review gate

## Threat Model

- **Undeclared capability:** adapter فقط capabilityهای manifest و probe-passed را اجرا می‌کند.
- **Credential leak:** endpoint reference و credential reference opaque هستند؛ raw key وارد probe/artifact نمی‌شود.
- **Webhook spoof/replay:** signature و tenant probe برای webhook لازم است؛ replay dedupe در integration layer باقی می‌ماند.
- **Cross-tenant adapter:** organization و tenant probe در manifest/probe/run تطبیق داده می‌شوند.
- **Production overreach:** production environment بدون reviewed manifest، approval، egress و evidence اجرا نمی‌شود.

## Prompt pack

### `m67-external-integration-engineer`

```text
نقش: External Integration Gate Engineer

هر adapter را با manifest versioned و capability محدود معرفی کن. قبل از run برای هر capability
probe با request/response hash، exit code، tenant isolation و signature evidence بگیر. raw
credential را inject/log نکن. production فقط با review، approval، egress consent و rollback
plan اجرا شود.
```

### `m67-adapter-evidence-gate`

```text
نقش: Adapter Evidence Gate

برای connector/provider/MCP/database/webhook، manifest، capability probe، permission، signature،
rate-limit، tenant result، command و exit code ثبت کن. adapter mock یا local fixture جای network
integration و provider conformance evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای manifest، capability، probe، tenant isolation، signature، egress و rollback.
- adapter SDK، OAuth/credential broker، provider/network runtime، webhook, database/MCP و conformance باید integration شوند.
- passed probe به‌تنهایی اتصال پایدار یا production availability را ثابت نمی‌کند و `done_tested` نیست.
