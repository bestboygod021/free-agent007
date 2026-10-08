# فاز M126: Connector Consent، Signed Webhook Delivery و Reconciliation

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/connector-consent-delivery-runtime.ts`
**تست:** `test/next-foundation-hardening-phases.test.ts`
**gap:** `GAP-IG-12`

## هدف و مرز

M126 مرز امن connector را از consent تا webhook و reconciliation تعریف می‌کند. consent باید scope، purpose، terms، expiry، revoke و credential reference داشته باشد. webhook فقط با signature، freshness، dedupe، outbox linkage و redacted output پذیرفته می‌شود. reconciliation cursor و conflict را صریح می‌کند. write/admin action فقط با tenant boundary، approval، idempotency و sandbox مجاز است. این فاز OAuth provider، webhook ingress، connector worker، remote API، persistent cursor یا conflict UI واقعی نیست.

## معماری

- `validateM126Consent`: scope uniqueness، consent، terms، expiry، revoke و opaque credential reference.
- `decideM126Webhook`: signature، timestamp، max age، dedupe، outbox linkage و output redaction.
- `validateM126Reconciliation`: cursor، missing/duplicate/conflict count، replay safety و evidence.
- `decideM126Action`: tenant match، risk/approval، sandbox، idempotency و safe fallback.

Local-first و BYOK اولویت دارند؛ free-tier fallback باید صادقانه باشد و remote connector بدون consent یا terms review فعال نمی‌شود.

## sprint plan

### Sprint A — Consent

scope catalog، purpose limitation، expiry، revoke و credential reference.

### Sprint B — Webhook delivery

signature verification، freshness، dedupe، outbox link و retry classification.

### Sprint C — Reconciliation

monotonic cursor، missing/duplicate detection، replay و conflict review.

### Sprint D — Action safety

read/write/admin risk، approval، sandbox، tenant guard و local/read-only fallback.

## Threat Model

- **Forged webhook:** signature و freshness gate لازم است.
- **Replay/duplicate delivery:** dedupe، cursor و idempotency لازم است.
- **Overbroad consent:** scope و purpose limitation اجباری است.
- **Cross-tenant action:** target organization باید match شود.
- **Untrusted connector code:** write/admin action فقط در sandbox مجاز است.
- **Credential leak:** فقط opaque reference؛ raw secret ممنوع.

## prompt pack

### `m126-connector-delivery-engineer`

```text
نقش: Connector Consent and Delivery Engineer

consent را به provider، purpose، scope، expiry، revoke و opaque credential reference وصل کن.
webhook را با signature، freshness، dedupe، outbox و redaction بپذیر. cursor/reconciliation
باید replay-safe باشد و write/admin action approval، sandbox و tenant match بخواهد.
```

### `m126-connector-reviewer`

```text
نقش: Connector Security Reviewer

OAuth/consent، signed webhook، replay، cursor، conflict، rate/fallback و cross-tenant mutation
را بررسی کن. API رسمی را بر browser bypass ترجیح بده؛ CAPTCHA/MFA bypass، secret logging و
اجرای untrusted connector خارج از sandbox ممنوع است.
```

## DoD و production evidence boundary

- consent expiry/revoke، invalid signature، stale webhook، duplicate، reconciliation conflict و mutation denial تست شوند.
- OAuth/PKCE، provider adapter، webhook ingress، durable outbox/cursor، retry worker، secret broker و conflict UI باید integration شوند.
- kernel M126 به‌تنهایی connector delivery، webhook authenticity، remote API correctness یا cross-platform sync production را ثابت نمی‌کند.
