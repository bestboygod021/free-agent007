# فاز M168: Outbound Webhook و Callback Delivery

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/outbound-webhook-runtime.ts`
**تست:** `test/next-platform-hardening-phases-8.test.ts`
**gap:** `GAP-IG-18`

## هدف و مرز

M168 endpoint مشتری را با verification، HTTPS، event allowlist، HMAC signature، idempotent delivery،
retry/DLQ، response validation و bounded replay کنترل می‌کند. payload فقط hash/reference/redacted data
است و endpoint revokeable است. این فاز endpoint registry، signing service، outbound queue، delivery
worker، retry store یا dashboard واقعی نیست.

## معماری

- `validateM168Endpoint`: HTTPS، event types، verification، signature algorithm، TLS، allowlist و tenant.
- `decideM168Delivery`: event/payload/signature، attempt bound، schedule، idempotency و redaction.
- `validateM168Response`: status، response signature، replay و Retry-After.
- `decideM168Replay`: operator، reason، approval، bound و redaction.

Local-first callback به endpoint خارجی پیش‌فرضاً خاموش است؛ BYOK یا free provider نباید secret signing
را به مدل بدهد. 4xx معمولاً retry کور نمی‌شود، 5xx با Retry-After و سقف تلاش مدیریت می‌شود و dead
letter نیازمند review است. webhook خروجی هیچ مسیر bulk account creation یا CAPTCHA/MFA bypass ندارد.

## sprint plan

### Sprint A — Endpoint verification

challenge، TLS، allowlist، event subscription و revoke.

### Sprint B — Signed delivery

canonical payload، HMAC، timestamp، idempotency و redaction.

### Sprint C — Retry/DLQ

status taxonomy، Retry-After، backoff، dedupe و dead letter.

### Sprint D — Replay/operations

bounded replay، operator approval، dashboard، delivery SLO و incident drill.

## Threat Model

- **SSRF:** HTTPS، destination allowlist و endpoint verification.
- **Signature forgery:** canonical payload، opaque signing reference و timestamp.
- **Duplicate side effect:** event/delivery idempotency و receiver contract.
- **Retry storm:** bounded attempts، Retry-After و DLQ.
- **Payload leakage:** redaction، hash/reference و tenant match.
- **Replay abuse:** operator approval، bounded replay و revoke.

## prompt pack

### `m168-webhook-engineer`

```text
نقش: Outbound Webhook Engineer

endpoint را با HTTPS، verification، allowlist، tenant و event subscription admit کن. payload را
canonical/redacted و با HMAC و timestamp امضا کن. delivery را idempotent، retry-bounded و DLQ-aware
بساز؛ replay فقط با operator، approval و bound انجام شود.
```

### `m168-webhook-auditor`

```text
نقش: Webhook Delivery Auditor

SSRF، signature forgery، duplicate effect، retry storm، payload/tenant leak، replay و revoke را
بررسی کن. HTTP mock یا generated signature جای endpoint registry، durable worker و provider delivery evidence واقعی نیست.
```

## DoD و production evidence boundary

- endpoint valid/invalid، delivery، response، Retry-After، duplicate و replay denial تست شوند.
- endpoint registry، verifier، signing service، outbound queue/worker، retry/DLQ، dedupe store و telemetry باید متصل شوند.
- kernel M168 به‌تنهایی delivery reliability، receiver correctness، signature security یا external callback SLA production claim نیست.
