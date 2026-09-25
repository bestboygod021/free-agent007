# فاز M117: Abuse Prevention، DLP و Safety Governance

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-SE-05`، `GAP-SE-06`، `GAP-SE-09`، `GAP-IG-05`، `GAP-QA-04`
**کد kernel:** `src/core/abuse-safety-runtime.ts`
**تست:** `test/next-governance-integration-phases.test.ts`

## هدف و مرز

M117 abuse signal، safety policy، DLP inspection و account activity guard را به contract تبدیل
می‌کند. malware، spam، scraping، credential abuse و harassment باید score/action/review داشته
باشند. secret، personal data و cross-tenant match باید redacted یا blocked شوند. CAPTCHA/MFA bypass
و bulk account creation مطلقاً مجاز نیست. این فاز classifier، DLP engine، moderation service،
account risk store، malware sandbox یا abuse response team واقعی را اجرا نمی‌کند.

## معماری

`M117AbuseSignalContract` actor، class، score، source، evidence، repeat و review را نگه می‌دارد.
`M117SafetyPolicyContract` blocked classes، review/deny threshold، bulk cap و scraping/malware
policy را ثبت می‌کند. `M117DlpInspectionEvidence` secret/PII/tenant match، pattern version، redaction
و block را gate می‌کند. `M117AccountActivityRequest` consent/approval، count، interval، bypass،
bulk و idempotency را enforce می‌کند.

## قراردادهای اصلی

- `validateM117AbuseSignal`: score، evidence، timestamp و high-confidence human review را validate می‌کند.
- `decideM117SafetyAction`: blocked class، threshold، review، scraping/malware policy و action را gate می‌کند.
- `validateM117DlpInspection`: match counts، redaction، tenant mismatch block و reviewer را بررسی می‌کند.
- `decideM117AccountActivity`: bypass، bulk creation، consent، approval، count، interval و idempotency را enforce می‌کند.

## sprintها

### Sprint A — Abuse Taxonomy

- malware/spam/scraping
- credential abuse/harassment
- source/evidence
- score calibration

### Sprint B — Policy

- review/deny thresholds
- human escalation
- rate/volume caps
- safe refusal

### Sprint C — DLP

- secret patterns
- personal data
- tenant mismatch
- redaction/block evidence

### Sprint D — Activity Safety

- consent/approval
- account/target limits
- idempotency
- CAPTCHA/MFA boundary

## Threat Model

- **Malware generation:** blocked class، sandbox review و deny threshold لازم است.
- **Mass scraping/spam:** target count، interval و approval محدود می‌شوند.
- **Secret leakage:** DLP match بدون redaction هرگز allow نمی‌شود.
- **Tenant exfiltration:** tenant mismatch output را block می‌کند.
- **Account abuse:** bulk account creation و CAPTCHA/MFA bypass ممنوع است.

## Prompt pack

### `m117-abuse-safety-engineer`

```text
نقش: Abuse Safety and DLP Engineer

abuse signal را با class، score، source، evidence و human review ثبت کن. policy باید review/deny
threshold و volume cap داشته باشد. DLP secret/PII/tenant mismatch را redact یا block کند. CAPTCHA/MFA
bypass و bulk account creation ممنوع است؛ activity فقط با consent، approval و idempotency مجاز است.
```

### `m117-safety-evidence-gate`

```text
نقش: Safety Evidence Gate

برای abuse، action، DLP و activity، class/score، threshold، match count، pattern version، redaction،
reviewer، target count، approval، command و exit code ثبت کن. classifier mock یا regex نمونه جای
DLP engine، moderation service، sandbox و abuse-response E2E evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای abuse signal، policy action، DLP و account activity.
- classifier/moderation، DLP scanner، malware sandbox، risk store، rate limiter و abuse response workflow باید integration شوند.
- kernel M117 به‌تنهایی abuse prevention، DLP completeness یا safety production را ثابت نمی‌کند و `done_tested` نیست.
