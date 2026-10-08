# فاز M197: Notification Delivery و Preference Governance

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/notification-governance-runtime.ts`
**تست:** `test/next-platform-hardening-phases-14.test.ts`
**gap:** `GAP-CP-21`

## هدف و مرز

M197 notification intent را با sensitivity، content/recipient hash، consent، preference، channel allowlist،
dedupe، TTL، delivery evidence، retry bound، quiet hours و escalation کنترل می‌کند. critical notification
نیازمند human approval در escalation است. این فاز notification store/router، channel adapter، delivery
worker، preference UI، provider receipt یا escalation service واقعی نیست.

## معماری

- `validateM197Intent`: event، sensitivity، content/recipient hash، channel، consent، preference، dedupe، TTL و tenant.
- `validateM197Preference`: enabled channels، opt-in، quiet hours، critical bypass، version، approval و tenant.
- `validateM197Delivery`: provider reference، status، attempts، timestamp، redaction و consent check.
- `decideM197Escalation`: level/deadline، no-spam، critical approval و tenant.

Local-first in-app notification مسیر پیش‌فرض است؛ email/webhook/SMS در free-tier/BYOK فقط با consent و
disclosure مجاز است. raw email، phone، token و notification content در evidence ذخیره نمی‌شود.

## Sprint plan

### Sprint A — Intent

event، sensitivity، content/recipient hash، channel و dedupe.

### Sprint B — Preferences

opt-in، channel policy، quiet hours، category version و critical bypass.

### Sprint C — Delivery

provider reference، bounded retry، status، receipt و redacted evidence.

### Sprint D — Escalation

level، deadline، no-spam، human approval و suppression.

## Threat Model

- **Notification spam:** dedupe، TTL، retry bound و no-spam proof.
- **Consent bypass:** intent/preference consent checks.
- **Sensitive leakage:** content hash، recipient hash و redacted receipt.
- **Channel spoofing:** allowlist و provider reference.
- **Escalation storm:** maximum level و deadline.
- **Critical silence:** explicit critical bypass و human review.

## prompt pack

### `m197-notification-engineer`

```text
نقش: Notification Governance Engineer

intent را با sensitivity، content/recipient hash، consent، preference، channel allowlist، dedupe و TTL بساز.
delivery باید retry bound، provider receipt، redaction و consent check داشته باشد. escalation سطح‌دار،
no-spam و برای critical دارای human approval باشد.
```

### `m197-notification-auditor`

```text
نقش: Notification Auditor

spam، consent bypass، sensitive leak، channel spoof، escalation storm و critical silence را بررسی کن.
یک email mock یا event log جای store/router، delivery worker، preference UI و escalation service واقعی نیست.
```

## DoD و production evidence boundary

- intent consent denial، preference، delivery bound، redacted receipt و escalation denial تست شوند.
- notification store/router، preference/consent UI، channel adapters، dedupe/retry worker و escalation service باید متصل شوند.
- kernel M197 به‌تنهایی delivery guarantee، provider receipt، user preference compliance یا escalation production claim نیست.
