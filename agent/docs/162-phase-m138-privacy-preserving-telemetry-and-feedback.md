# فاز M138: Privacy-preserving Telemetry و Feedback

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/privacy-telemetry-runtime.ts`
**تست:** `test/next-platform-hardening-phases-2.test.ts`
**gap:** `GAP-OB-08`

## هدف و مرز

M138 telemetry و user feedback را به consent، purpose، sampling، retention، local-only mode و
redaction متصل می‌کند. event فقط با consent معتبر، schema version، payload hash، dimensions hash،
PII redaction و no-raw-payload پذیرفته می‌شود. feedback باید secret-free، redacted و consent-bound
باشد. retention باید deletion job، downstream notification و legal hold را مدل کند. این فاز
analytics warehouse، consent UI، DLP scanner، deletion worker، telemetry SDK یا dashboard واقعی نیست.

## معماری و قراردادها

- `validateM138Consent`: purpose، expiry، retention، sampling، explicit/withdrawable و opaque subject.
- `decideM138Telemetry`: consent/event boundary، local-only، sampling، redaction و export permission.
- `validateM138Feedback`: rating، comment/source hashes، PII و secret-free state.
- `decideM138Retention`: expiry، anonymization/legal hold و downstream deletion notification.

raw payload، raw comment، email، password، token و API key ذخیره نمی‌شود؛ hash/reference جایگزین محتوای حساس است.

## sprint plan

### Sprint A — Consent

purpose registry، explicit consent، withdrawal، expiry و retention.

### Sprint B — Event minimization

schema، sampling، dimensions hash، PII redaction و local-first delivery.

### Sprint C — Feedback governance

category، rating، moderation، source hash و secret/PII screening.

### Sprint D — Retention

anonymization، deletion propagation، legal hold، downstream notification و audit.

## Threat Model

- **Consent mismatch:** consentId، tenant و purpose binding اجباری است.
- **Telemetry PII leak:** redaction، hash dimensions و no raw payload لازم است.
- **Hidden cloud egress:** local-only و exportAllowed gate می‌شوند.
- **Feedback secret leak:** secret-free validation و comment hash استفاده می‌شود.
- **Retention failure:** deletion job و downstream notification لازم است.
- **Legal hold conflict:** anonymization فوری با hold ناسازگار است.

## prompt pack

### `m138-privacy-telemetry-engineer`

```text
نقش: Privacy-preserving Telemetry Engineer

telemetry را با explicit/withdrawable consent، purpose، expiry، retention، sampling و local-only
mode بساز. event باید schema/payload/dimensions hash، PII redaction و no-raw-payload داشته باشد.
feedback را secret-free نگه دار و retention را با deletion propagation و legal hold gate کن.
```

### `m138-privacy-auditor`

```text
نقش: Telemetry Privacy Auditor

consent mismatch، cloud export، sampling، PII، raw payload، feedback secret، retention expiry و
legal hold را ممیزی کن. event fixture یا local mock جای SDK، DLP، warehouse و deletion worker واقعی نیست.
```

## DoD و production evidence boundary

- consent، telemetry، feedback، retention، cloud-egress denial و raw-payload denial تست شوند.
- consent UI/store، telemetry SDK، DLP/redaction pipeline، analytics warehouse، deletion worker و legal hold باید integration شوند.
- kernel M138 به‌تنهایی privacy compliance، telemetry completeness، feedback quality یا erasure propagation production claim نیست.
