# فاز M71: Developer Experience، API Contract و SDK/CLI

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-API-05`، `GAP-UX-07`، `GAP-IG-09`، `GAP-PO-06`
**کد kernel:** `src/core/developer-experience-runtime.ts`
**تست:** `test/next-governance-and-ecosystem-phases.test.ts`

## هدف و مرز

M71 استفاده توسعه‌دهندگان از پلتفرم را ساده می‌کند: API versioning، SDK compatibility، Forge
CLI و signed customer webhook. contractها برای TypeScript، Python، Go و Rust تعریف می‌شوند و
API request/response schema hash، tenant header و idempotency را حفظ می‌کنند. این فاز OpenAPI/
tRPC server، SDK generator، CLI binary، package registry یا webhook delivery واقعی را اجرا نمی‌کند.

## معماری

`DeveloperApiContract` route، version، transport، schema hash، tenant و idempotency را ثبت
می‌کند. `DeveloperSdkTarget` زبان/version و generated schema را با API contract مقایسه می‌کند.
`ForgeCommandRequest` command، project path، args hash، local mode و approval را gate می‌کند.
`DeveloperWebhookClient` endpoint HTTPS، event subscriptions، signing reference، retry policy
و verification را نگه می‌دارد.

## قراردادهای اصلی

- `validateDeveloperApiContract` route، tenant، schema، deprecation و sunset را بررسی می‌کند.
- `decideDeveloperSdkCompatibility` API/SDK version، schema و compatibility review را gate می‌کند.
- `validateForgeCommand` path، command approval، local mode و argument hash را validate می‌کند.
- `validateDeveloperWebhookClient` HTTPS، subscriptions، signature reference و verification را enforce می‌کند.

## sprintها

### Sprint A — Public API

- OpenAPI/tRPC boundary
- API versioning و sunset
- tenant/idempotency headers
- error/pagination/streaming contract

### Sprint B — SDK Generation

- TypeScript/Python/Go/Rust SDK
- schema-driven generation
- retry/streaming support
- compatibility matrix

### Sprint C — Forge CLI

- init/connect/run/approve/logs/export/doctor
- local/BYOK mode
- config backup و no-clobber
- CLI auth و output redaction

### Sprint D — Webhook Developer Surface

- subscription management
- signed delivery و retry
- event schema/version
- local tunnel/test fixture و docs

## Threat Model

- **API version drift:** schema hash و API version mismatch SDK را block می‌کند؛ deprecated route sunset دارد.
- **CLI path/command injection:** project path relative/allowlisted و args hash است؛ command از input خام authority نمی‌گیرد.
- **Webhook spoofing:** endpoint HTTPS، signing reference، verification و retry policy لازم است.
- **Secret leakage:** config/CLI output/webhook payload raw key ندارد و redaction boundary حفظ می‌شود.
- **Local mode egress:** local mode connect خارجی را deny می‌کند؛ BYOK/free explicit باقی می‌ماند.

## Prompt pack

### `m71-developer-platform-engineer`

```text
نقش: Developer Platform Engineer

API contract را versioned و schema-hashed کن. SDK فقط از schema سازگار تولید شود. Forge CLI
path را relative/allowlisted، args را hash و config را backup/no-clobber نگه دارد. webhook
فقط HTTPS و signed/verified باشد. local mode نباید external connection پنهان بسازد.
```

### `m71-sdk-evidence-gate`

```text
نقش: Developer Experience Evidence Gate

برای API version، SDK generation، compatibility failure، CLI command، config backup، webhook
signature/retry و redacted output، schema hash، package artifact، command و exit code ثبت کن.
README یا generated type به‌تنهایی SDK/CLI/webhook integration evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای API، version، schema، SDK compatibility، CLI path/approval و webhook verification.
- API server، SDK generator، CLI binary، package publishing و webhook delivery باید integration شوند.
- contract developer experience production SDK یا CLI قابل انتشار را ثابت نمی‌کند و `done_tested` نیست.
