# فاز M31: Connector و Provider Runtime

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IG-01`، `GAP-IG-02`، `GAP-IG-04`، `GAP-IG-08`، `GAP-IN-09`
**کد kernel:** `src/core/connector-provider-runtime.ts`
**تست:** `test/audit-followup-phases.test.ts`

## هدف و مرز

M31 مرز قابل اجرای connector و model provider را تعریف می‌کند: OAuth state، webhook
signature/dedupe، connector scope، provider locality/privacy و BYOK/free/local policy.
این فاز GitHub App، provider HTTP adapter، OAuth server، webhook ingress یا secret
vault واقعی نمی‌سازد.

## معماری

Connector gateway callback/webhook را در مرز untrusted دریافت می‌کند و قبل از dispatch
state، signature، replay و tenant را validate می‌کند. scope/consent policy سپس action
را به adapter مجاز می‌فرستد؛ token فقط در vault با opaque reference دیده می‌شود. Provider
router از mode و locality برای انتخاب local، free یا BYOK استفاده می‌کند، budget/usage
را ثبت می‌کند و هر cloud egress را با consent و privacy gate متوقف یا اجازه می‌دهد.

## قراردادهای اصلی

- `validateOAuthCallback` state، redirect hash، PKCE verifier، code presence و TTL را enforce می‌کند.
- `validateWebhook` signature digest، future timestamp و replay را رد می‌کند.
- `decideConnectorAction` scope و idempotency write را الزام می‌کند.
- `decideProviderCall` local mode را از cloud جدا می‌کند، budget و consent را gate
  می‌کند و confidential cloud egress را block می‌کند.
- key فقط opaque reference است؛ raw password/API key هرگز در این contract وارد نمی‌شود.

## Threat Model

- **OAuth CSRF و token replay:** state، redirect hash، PKCE reference و TTL باید match شوند و callback code هرگز raw credential ذخیره نمی‌کند.
- **Webhook spoofing و replay:** signature digest، timestamp، event id و dedupe پیش از dispatch بررسی می‌شوند؛ payload متن untrusted است.
- **Scope و egress escalation:** connector write scope، idempotency و approval لازم است؛ local/confidential mode اجازه cloud egress ندارد.
- **Provider and ToS risk:** BYOK/free/local fallback باید صادقانه، budget-gated و با usage evidence باشد؛ CAPTCHA/MFA bypass، bulk account creation و raw password ممنوع است.

## sprintها

### Sprint A — Connector SDK Runtime

- OAuth 2.1 PKCE state و refresh boundary
- scope، consent و connector error taxonomy
- rate limit و Retry-After
- encrypted token reference بدون raw secret

### Sprint B — GitHub و Webhook

- GitHub App installation و short-lived token
- webhook signature، timestamp و dedupe
- Issue/PR mapping به event
- متن Issue/README همچنان untrusted data

### Sprint C — Model Provider Adapter

- OpenAI-compatible، Anthropic، Gemini و Ollama adapter contract
- usage، timeout، refusal و invalid JSON normalization
- free-tier failover و BYOK
- no cloud egress در local/confidential boundary

### Sprint D — MCP/A2A Connector Boundary

- capability/scope mapping به M17 protocol
- connector rate limit و circuit integration
- approval برای write connector action
- sandbox برای هر tool execution

## Prompt pack

### `m31-connector-runtime-engineer`

```text
نقش: Connector and Provider Runtime Engineer

OAuth state را به tenant، connector، redirect و TTL bind کن. webhook signature و
idempotency را پیش از dispatch بررسی کن. provider call فقط با mode، privacy، budget،
consent و opaque key reference مجاز است. raw credential، CAPTCHA/MFA bypass، bulk
account creation و write بدون approval ممنوع است.
```

### `m31-adapter-evidence-gate`

```text
نقش: Adapter Evidence Gate

برای OAuth، webhook، provider call، quota، failover و usage reconciliation، درخواست،
response status، digest/hash، audit و tenant probe را ثبت کن. fixture یا mock provider
برای claim integration production کافی نیست.
```

## DoD و evidence boundary

- unit برای state mismatch، webhook replay، scope denial، cloud consent و local privacy.
- GitHub App، OAuth provider، vault، model HTTP و webhook deployment integrationهای بعدی
  هستند.
- free/local/BYOK fallback صادقانه باقی می‌ماند و هزینه پیش از call gate می‌شود.
