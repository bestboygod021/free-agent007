# فاز M77: Connector Delivery، Webhook Ingress و Rate Limits

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IG-02`، `GAP-IG-03`، `GAP-IG-04`، `GAP-IG-06`، `GAP-IG-08`، `GAP-IG-09`
**کد kernel:** `src/core/connector-delivery-runtime.ts`
**تست:** `test/next-product-runtime-phases.test.ts`

## هدف و مرز

M77 connector manifest، OAuth/install boundary، short-lived token، signed webhook ingress،
dedupe، stale event rejection، rate-limit/Retry-After و normalized action را تعریف می‌کند.
GitHub/GitLab/Bitbucket/Slack/Linear/Notion و custom connector باید local/free/BYOK/paid mode
واضح داشته باشند. این فاز GitHub App، OAuth server، webhook receiver، MCP/database adapter،
queue و provider delivery واقعی را اجرا نمی‌کند.

## معماری

`ConnectorAppManifest` platform، scopes، auth mode، HTTPS endpoint، opaque signing reference،
short-lived token policy و review را ثبت می‌کند. `WebhookIngressEvent` payload hash، signature،
observed time، max age و dedupe key دارد. `ConnectorRateLimitState` remaining/limit/reset و
Retry-After را نگه می‌دارد. `ConnectorActionRequest` ریسک، scope، approval، idempotency و
organization target را enforce می‌کند.

## قراردادهای اصلی

- `validateConnectorApp` scope uniqueness، token lifetime، HTTPS، review و secret reference را بررسی می‌کند.
- `decideWebhookIngress` signature، freshness، payload hash و dedupe boundary را gate می‌کند.
- `validateConnectorRateLimit` limit/reset/Retry-After را validate می‌کند.
- `decideDeliveryConnectorAction` tenant boundary، read/write risk، approval و local mode را enforce می‌کند.

## sprintها

### Sprint A — Connector Registry

- platform manifest
- OAuth/PKCE/install callback
- scope negotiation
- token rotation/revoke

### Sprint B — Ingress

- signed webhook receiver
- event schema/version
- replay/stale rejection
- dedupe/outbox/queue

### Sprint C — Provider Delivery

- 429/Retry-After/backoff
- provider health
- free-tier quota و BYOK
- local/read-only fallback

### Sprint D — Normalized Actions

- GitHub App adapter
- MCP/database adapter
- read/write/admin approval
- output webhook با signature

## Threat Model

- **Webhook spoof/replay:** signature، max age و dedupe key لازم است.
- **Token overreach:** scopes کمینه و short-lived token اجباری‌اند؛ raw token ذخیره نمی‌شود.
- **Rate-limit storm:** Retry-After و reset state از retry بی‌حد جلوگیری می‌کند.
- **Cross-tenant action:** target organization باید با caller organization برابر باشد.
- **Cost surprise:** mode و quota explicit هستند؛ local/free/BYOK fallback باقی می‌ماند.

## Prompt pack

### `m77-connector-delivery-engineer`

```text
نقش: Connector Delivery Engineer

connector را با platform، کمینه scope، OAuth/PKCE، short-lived token و revoke بساز. webhook فقط
HTTPS/signed/fresh/deduplicated باشد. rate limit، Retry-After و provider fallback را مدل کن.
write/admin action بدون approval و cross-tenant target را رد کن.
```

### `m77-integration-evidence-gate`

```text
نقش: Integration Evidence Gate

برای install، consent، token exchange، webhook signature/replay، dedupe، rate limit، retry و
connector action، request hash، scope، payload hash، command و exit code ثبت کن. manifest یا
mock callback جای provider integration evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای manifest، scope، webhook signature/freshness، dedupe، rate limit و action gate.
- OAuth/provider adapters، webhook receiver، queue/outbox، MCP/database connector و delivery retry باید integration شوند.
- connector kernel به‌تنهایی GitHub App یا reliable webhook production را ثابت نمی‌کند و `done_tested` نیست.
