# فاز M21: Secure Supply Chain و Runtime Isolation

**وضعیت:** `designed_only`
**پیش‌نیاز:** M3 Sandbox، M5 Connector SDK، M13 Plugin Governance، M14 Data Governance و M17 Protocol
**کد اولیه:** `src/core/secure-supply-chain.ts`

M21 زنجیره تأمین ابزار و مرز egress/secret را از prompt به decision code منتقل
می‌کند: signed manifest، digest، SBOM، license، dependency policy، DLP، prompt
injection firewall و ephemeral secret lease. این فاز secret manager، proxy،
microVM یا اجرای ابزار را در این مرحله راه‌اندازی نمی‌کند.

## قراردادها

`ToolManifest` باید package digest، signature، capability، license، SBOM hash و
runtime governed داشته باشد. `decideToolAdmission` manifest و dependencyها را با
policy مقایسه می‌کند. `planSecretLease` فقط reference و expiry می‌دهد و secret value
نمی‌پذیرد. `decideEgress` domain allowlist و DLP pattern را قبل از خروج بررسی می‌کند.

## چهار sprint

### A — Artifact trust

- canonical manifest و signature
- digest pinning
- SBOM generation/verification
- license/notice inventory

### B — Secret boundary

- reference-only lease
- TTL، audience و one-time use
- vault/KMS adapter
- redaction در log/artifact/exit output

### C — Egress و injection

- domain/protocol proxy
- DLP قبل از خروج
- prompt-injection classifier با human review
- deny برای raw credential، host exec، CAPTCHA/MFA bypass

### D — Runtime isolation

- microVM یا sandbox adapter
- read-only root، resource limit و no-default-network
- cleanup/escape test
- supply-chain incident response

## Prompt pack

### `m21-supply-chain-reviewer`

```text
نقش: Supply Chain Security Reviewer

manifest، digest، signature، SBOM، license، dependency، runtime و capability را
بررسی کن. secret value را هرگز درخواست یا چاپ نکن؛ reference، audience و TTL کافی
است. DLP و egress deny را قبل از هر network action اعمال کن.
```

### `m21-runtime-evidence-gate`

```text
نقش: Runtime Isolation Evidence Gate

برای unsigned artifact، bad digest، denied license، raw secret، prompt injection،
DLP match، egress domain، sandbox escape و cleanup، command، exit code، hash و audit
artifact ثبت کن. mock sandbox یا callback verifier، escape evidence نیست.
```

## DoD و محدودیت

- signed tool admission و SBOM/license gate
- secret lease بدون raw value
- DLP/egress و injection test
- microVM/sandbox escape و cleanup drill
- incident response و key rotation واقعی

تا اجرای واقعی runtime و supply-chain evidence، M21 `designed_only` است.
