# فاز M34: Identity، Membership و Access Runtime

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-CP-01`، `GAP-CP-02`، `GAP-CP-04`، `GAP-CP-05`، `GAP-CP-08`، `GAP-CP-10`
**کد kernel:** `src/core/identity-access-contract.ts`
**تست:** `test/next-followup-phases.test.ts`

## هدف و مرز

M34 مرز قطعی احراز هویت پلتفرم، session proof، membership invitation، نقش‌ها،
settings hierarchy و notification intent را تعریف می‌کند. این فاز provider احراز
هویت، database membership، mailer، MFA service یا billing entitlement را اجرا نمی‌کند.
raw password، recovery secret و MFA seed هرگز وارد kernel یا audit نمی‌شوند؛ فقط digest و
opaque reference مجاز است.

## معماری

ورودی auth provider پس از تطبیق با `SessionProof` به policy kernel می‌رسد. membership
service دعوت و role change را با actor role، organization و MFA gate بررسی می‌کند.
`resolveIdentitySettings` به‌ترتیب defaults، organization، project و user را merge می‌کند و
notification planner فقط payload hash و dedupe key را به outbox تحویل می‌دهد. session
store، identity provider، mailer و durable organization store adapterهای بعدی هستند.

## قراردادهای اصلی

- `validateSessionProof` عمر session، tenant، token digest و MFA را بررسی می‌کند.
- `decideMembershipInvite` دعوت را به organization، role، inviter و expiry bind می‌کند.
- `decideRoleChange` self-escalation و تغییر role بدون authority را رد می‌کند.
- `resolveIdentitySettings` override را به ترتیب ثابت اعمال می‌کند و cross-organization layer را رد می‌کند.
- `planNotification` secret را از payload و invite webhook ناامن را از مسیر notification خارج می‌کند.

## sprintها

### Sprint A — Session و Authentication Boundary

- session proof و short-lived token reference
- MFA challenge/result بدون ذخیره seed
- expiry، revocation و device/session inventory
- recovery flow با opaque provider reference

### Sprint B — Membership و Role Governance

- invitation lifecycle و acceptance
- owner/admin/developer/reviewer/viewer/agent matrix
- role change، self-escalation و separation of duties
- cross-tenant membership probe

### Sprint C — Settings و Onboarding

- defaults → organization → project → user precedence
- first-run checklist و degraded local-first onboarding
- تغییر تنظیمات با audit و optimistic update ممنوع
- notification preference و quota warning

### Sprint D — Durable Identity Integration

- identity provider adapter و session store
- PostgreSQL membership و RLS integration
- email/in-app delivery و dedupe
- MFA/role-change integration test و recovery drill

## Threat Model

- **Account takeover:** session digest، expiry، revocation و MFA gate باید قبل از action بررسی شوند؛ raw password یا MFA seed ذخیره نمی‌شود.
- **Privilege escalation:** agent/viewer نمی‌تواند owner/admin شود؛ actor نمی‌تواند role خودش را تغییر دهد و owner change نیازمند authority/MFA است.
- **Cross-tenant membership leak:** organization در session، invite، role change و settings layer باید یکسان باشد؛ mismatch deny است.
- **Notification exfiltration:** notification فقط hash و metadata دارد؛ secret یا invite credential در email/webhook payload قرار نمی‌گیرد.

## Prompt pack

### `m34-identity-access-architect`

```text
نقش: Identity and Access Runtime Architect

هر تصمیم را به organization، user، session و actor role bind کن. raw password، recovery
secret و MFA seed را وارد مدل یا لاگ نکن؛ فقط digest/opaque reference استفاده کن.
self-escalation، cross-tenant membership، role change بدون authority و notification حاوی
secret را deny کن. local-first و BYOK را حفظ کن.
```

### `m34-identity-evidence-gate`

```text
نقش: Identity Evidence Gate

برای session expiry/revocation، MFA، invitation، role matrix، settings precedence و
notification dedupe، command، exit code، tenant probe و audit hash ثبت کن. unit kernel یا
mock identity provider production authentication evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای expired session، missing MFA، invitation expiry، role escalation،
  settings conflict و notification secret.
- identity provider، session store، MFA service، PostgreSQL membership، mailer و
  cross-tenant integration باید جداگانه اجرا و مستند شوند.
- این فاز login، registration، MFA، invitation یا entitlement production را `done_tested`
  اعلام نمی‌کند.
