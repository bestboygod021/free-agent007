# فاز M145: Connector SDK و OAuth/PKCE Lifecycle

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/connector-sdk-oauth-runtime.ts`
**تست:** `test/next-platform-hardening-phases-4.test.ts`
**gap:** `GAP-IG-13`

## هدف و مرز

M145 connector را به SDK manifest، capability/scopes، trust، OAuth PKCE، opaque token lease و signed
webhook تبدیل می‌کند. manifest باید permission hash، auth method، source trust و no-raw-credential را
ثبت کند. OAuth flow باید state، PKCE، redirect allowlist، consent، expiry، tenant match و approval داشته
باشد. token lease کوتاه‌عمر، encrypted-reference و revocable است. webhook باید signature، dedupe،
redaction و tenant verification داشته باشد. این فاز connector SDK، OAuth provider/IdP، token broker،
webhook ingress یا refresh/revoke worker واقعی نیست.

## معماری و قراردادها

- `validateM145Manifest`: capability، scopes، trust، auth method و credential boundary.
- `decideM145OAuth`: state/PKCE، redirect، consent، tenant، expiry و opaque token reference.
- `validateM145TokenLease`: scope، lifetime، encryption، revoke و raw-token denial.
- `decideM145Webhook`: signature، event hash، dedupe، redaction و tenant match.

raw password، OAuth token، API key و refresh secret هرگز ذخیره یا audit نمی‌شود؛ فقط opaque reference/hash باقی می‌ماند.

## sprint plan

### Sprint A — SDK manifest

capability registry، scopes، permission hash، trust و version compatibility.

### Sprint B — OAuth

state، PKCE، redirect allowlist، consent، token lease و scope attenuation.

### Sprint C — Webhook

signature verification، ingress، dedupe، replay window و redacted event.

### Sprint D — Revoke/fallback

expiry، revoke، local-only mode، BYOK و provider fallback.

## Threat Model

- **OAuth state replay:** state hash، PKCE و expiry لازم است.
- **Redirect exfiltration:** redirect URI allowlist اجباری است.
- **Scope escalation:** manifest و token lease scope-bound هستند.
- **Raw credential leakage:** opaque/encrypted reference تنها مجاز است.
- **Webhook spoofing:** signature، timestamp، dedupe و tenant check لازم است.
- **Untrusted connector:** source trust و approval gate می‌شوند.

## prompt pack

### `m145-connector-sdk-engineer`

```text
نقش: Connector SDK and OAuth Engineer

manifest را با capability، scope، permission hash، source trust و no-raw-credential بساز. OAuth
را state/PKCE، redirect allowlist، consent، tenant match، approval و expiry gate کن. token را
short-lived encrypted reference نگه دار و webhook را signature-verified، deduplicated و redacted کن.
```

### `m145-connector-auditor`

```text
نقش: Connector Lifecycle Auditor

scope، state replay، PKCE، redirect، token expiry/revoke، raw secret، webhook signature، dedupe و
tenant boundary را ممیزی کن. OAuth fixture یا fake webhook جای SDK، IdP، token broker و ingress
production واقعی نیست.
```

## DoD و production evidence boundary

- manifest، OAuth denial، expired lease، raw-token denial و webhook spoof/replay تست شوند.
- connector SDK، OAuth/PKCE provider، encrypted token broker، webhook ingress، dedupe store و revoke worker باید integration شوند.
- kernel M145 به‌تنهایی OAuth security، connector authenticity، token confidentiality یا webhook delivery production claim نیست.
