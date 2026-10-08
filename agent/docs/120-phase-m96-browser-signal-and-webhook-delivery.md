# فاز M96: Browser Automation، External Signals و Webhook Delivery

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IG-04`، `GAP-IG-05`، `GAP-IN-14`، `GAP-IG-09`
**کد kernel:** `src/core/browser-signal-delivery-runtime.ts`
**تست:** `test/next-memory-security-client-phases.test.ts`

## هدف و مرز

M96 browser session، bounded external signal harvesting و signed outbound webhook delivery را
در یک evidence model قرار می‌دهد. browser باید allowlist، recording، handover و egress approval
داشته باشد. signal unverified authority نیست. webhook باید HTTPS، signature، timestamp، dedupe و
replay window داشته باشد. این فاز Playwright runner، harvester، webhook server، queue یا retry
service واقعی را اجرا نمی‌کند.

## معماری

`ExternalBrowserSession` target، allowed domains، recording و human handover را نگه می‌دارد و
secret injection را type-level false می‌کند. `ExternalSignalHarvest` query/result/source
provenance، count bound، trust و consent را ثبت می‌کند. `SignedWebhookDelivery` endpoint، payload
hash، signature reference، timestamp و dedupe را gate می‌کند. replay guard duplicate، bad signature و stale delivery را رد می‌کند.

## قراردادهای اصلی

- `validateExternalBrowserSession` HTTPS، allowlist، recording، handover و egress را validate می‌کند.
- `decideExternalSignalHarvest` consent، provenance، count bound و trust را gate می‌کند.
- `validateSignedWebhookDelivery` signature reference، payload، HTTPS، attempt و redaction را بررسی می‌کند.
- `decideWebhookReplayGuard` signature، dedupe و replay window را enforce می‌کند.

## sprintها

### Sprint A — Browser Runtime

- session lifecycle
- domain allowlist
- recording/provenance
- human handover

### Sprint B — External Signals

- bounded query/harvest
- source provenance
- corroboration
- consent/retention

### Sprint C — Webhook Delivery

- event schema
- signing
- retry/attempt
- customer endpoint reference

### Sprint D — Replay/Operations

- dedupe store
- replay window
- dead-letter queue
- delivery evidence

## Threat Model

- **Browser exfiltration:** allowlist، egress approval و no secret injection اجباری است.
- **Untrusted signal authority:** unverified source product decision را authorize نمی‌کند.
- **Webhook spoofing:** HTTPS و signature validation لازم است.
- **Replay attack:** timestamp، max age و dedupe key هر دو بررسی می‌شوند.
- **Payload leak:** payload و response body فقط hash/redacted هستند.

## Prompt pack

### `m96-browser-signal-engineer`

```text
نقش: Browser and Signal Delivery Engineer

browser session را HTTPS، domain-allowlisted، recorded و handover-aware کن؛ raw secret inject نکن.
external signal را bounded، consentدار و provenanceدار نگه دار و unverified را authority نکن. webhook
را با signature، timestamp، dedupe، replay window و redacted response ارسال کن.
```

### `m96-external-delivery-evidence-gate`

```text
نقش: Browser/Webhook Evidence Gate

برای browser navigation، handover، harvest، webhook، retry، dedupe و replay، target/provenance/
payload hash، signature، timestamp، command و exit code ثبت کن. browser screenshot یا HTTP 200 جای
allowlist، signature و replay protection evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای browser policy، signal trust، webhook signature و replay guard.
- browser runner، harvester، webhook receiver/delivery، queue/retry و dedupe store باید integration شوند.
- kernel M96 به‌تنهایی browser automation یا webhook delivery production را ثابت نمی‌کند و `done_tested` نیست.
