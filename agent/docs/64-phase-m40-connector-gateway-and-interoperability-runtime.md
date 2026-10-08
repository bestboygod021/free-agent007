# فاز M40: Connector Gateway و Interoperability Runtime

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IG-02`، `GAP-IG-03`، `GAP-IG-04`، `GAP-IG-06`، `GAP-IG-08`، `GAP-IG-09`
**کد kernel:** `src/core/connector-gateway-runtime.ts`
**تست:** `test/next-runtime-phases.test.ts`

## هدف و مرز

M40 قرارداد GitHub App installation، connector rate/backoff، signed outbound webhook،
database introspection و MCP envelope را تعریف می‌کند. این فاز GitHub API، MCP server،
database driver، webhook HTTP ingress/egress، queue یا token vault واقعی اجرا نمی‌کند.
متن repository و payload connector همچنان untrusted هستند و raw credential ذخیره نمی‌شود.

## معماری

Gateway ورودی connector را با organization و connector identity به policy kernel می‌دهد.
GitHub installation فقط opaque token reference و expiry دارد. rate planner قبل از request
remaining/reset/Retry-After را می‌سنجد. outbound webhook با event/payload hash، signing
key reference و idempotency عبور می‌کند. database connector به read-only introspection
محدود است و MCP envelope با server identity، nonce، TTL، capability و approval gate می‌شود.

## قراردادهای اصلی

- `validateGithubInstallation` installation، repository، opaque token reference و expiry را validate می‌کند.
- `decideConnectorBackoff` quota، requested units، reset و Retry-After را gate می‌کند.
- `validateSignedOutboundWebhook` event/payload hash، signing reference، attempt و idempotency را الزام می‌کند.
- `decideDatabaseIntrospection` schema grant، read-only boundary و row-sample approval را enforce می‌کند.
- `validateMcpEnvelope` nonce، identity، capability، TTL و side-effect approval را بررسی می‌کند.

## sprintها

### Sprint A — GitHub App Runtime

- App installation و repository permission
- short-lived token exchange و rotation
- Issue/PR read/write scope
- webhook signature و installation dedupe

### Sprint B — Connector Quota و Webhook

- per-connector bucket و Retry-After
- queue/backoff/circuit integration
- signed outbound webhook و replay protection
- delivery result و customer endpoint policy

### Sprint C — Database Connector

- schema/table/column introspection
- read-only/sample rows با approval
- SQL injection و sensitive column redaction
- local/self-host database boundary

### Sprint D — MCP Interoperability

- server identity و capability catalog
- nonce/session/expiry/replay
- tools/resources envelope
- sandbox و approval برای tool side effect

## Threat Model

- **GitHub token abuse:** token فقط opaque reference است؛ installation، repository، permission
  و expiry match می‌شوند و admin permission مسیر جدا دارد.
- **Webhook spoof/replay:** payload hash، signing key reference، event id و idempotency پیش
  از delivery بررسی می‌شوند؛ outbound customer endpoint untrusted است.
- **Quota exhaustion:** rate limit و Retry-After پیش از call gate می‌شوند؛ retry بی‌نهایت یا
  دورزدن quota مجاز نیست.
- **Connector overreach:** database write و schema خارج از grant رد می‌شود؛ MCP tool call
  بدون capability، nonce/TTL و approval اجرا نمی‌شود.

## Prompt pack

### `m40-connector-gateway-engineer`

```text
نقش: Connector Gateway and Interoperability Engineer

GitHub installation را به tenant/repository/permission/expiry bind کن و فقط opaque token
reference نگه دار. rate limit، Retry-After و idempotency را پیش از retry بررسی کن. database
را read-only و schema-scoped نگه دار. MCP envelope باید identity، nonce، TTL، capability و
approval داشته باشد. CAPTCHA/MFA bypass، bulk account creation و raw credential ممنوع است.
```

### `m40-connector-evidence-gate`

```text
نقش: Connector Evidence Gate

برای App installation، token expiry، 429/backoff، signed webhook، customer delivery،
database introspection و MCP replay، request/response digest، exit code و audit ثبت کن.
fixture یا mock GitHub/MCP/database integration production evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای installation expiry، quota exhaustion، webhook signature/replay،
  schema denial و MCP nonce/side-effect.
- GitHub App، vault، webhook ingress/egress، DB driver، MCP server و connector queue باید
  در integration مستقل اجرا شوند.
- GitHub write، customer webhook delivery، MCP tool success یا quota reliability بدون
  external evidence `done_tested` نیست.
