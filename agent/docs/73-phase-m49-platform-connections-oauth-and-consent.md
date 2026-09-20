# فاز M49: Platform Connections، OAuth/PKCE و Consent

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IG-02`، `GAP-IG-04`، `GAP-IG-08`، `GAP-CP-08`
**کد kernel:** `src/core/platform-connection-runtime.ts`
**تست:** `test/platform-connection-phases.test.ts`

## هدف و مرز

M49 نقطه ورود اتصال کاربر به پلتفرم‌های دیگر است: GitHub، GitLab، Bitbucket، Slack،
Linear، Notion، Google Drive، Jira و connectorهای custom. کاربر connection را با scope و
consent روشن ایجاد، مشاهده و revoke می‌کند. این فاز OAuth server، callback web app، token
vault، provider registration یا هیچ remote API واقعی را اجرا نمی‌کند؛ فقط قرارداد امن و
قابل‌تست آن‌ها را تعریف می‌کند.

## معماری

`PlatformDescriptor` یک registry versioned برای auth endpoint، redirect allowlist، scope و
methodهای مجاز است. `PlatformConnectionRequest` state hash، S256 PKCE، user consent،
organization/user scope و connection mode را حمل می‌کند. credential به‌صورت raw در request
یا storage نیست و فقط opaque `tokenReference` قابل revoke/expire است. modeهای `free`،
`paid` و `local` از provider policy جدا هستند؛ local mode نمی‌تواند بی‌صدا از remote
credential استفاده کند.

## قراردادهای اصلی

- `validatePlatformDescriptor`، HTTPS، redirect URI، scope و auth method registry را بررسی می‌کند.
- `decidePlatformConnection`، platform match، scope grant، S256 PKCE، consent، mode و no-raw-credential را gate می‌کند.
- `validateConnectionSecretReference`، expiry، revocation و opaque reference را enforce می‌کند.
- `revokePlatformConnection`، revoke action کاربر/policy را به tenant و connection bind می‌کند.

## sprintها

### Sprint A — Connection Registry

- platform/provider descriptor schema
- scope catalog و risk classification
- redirect allowlist و environment separation
- connector version و deprecation policy

### Sprint B — OAuth/PKCE Flow

- authorization state و S256 PKCE
- callback validation و CSRF/replay prevention
- consent screen با scope diff
- short-lived access و refresh reference

### Sprint C — Credential Lifecycle

- encrypted token vault adapter
- token rotation و expiry
- revoke/disconnect و deletion propagation
- audit event و user-visible status

### Sprint D — Provider Onboarding

- GitHub/GitLab/Slack/Linear/Notion/Jira adapters
- BYOK و local connector boundary
- provider ToS/privacy review
- OAuth integration و negative security tests

## Threat Model

- **OAuth CSRF یا code injection:** state hash، exact redirect allowlist و S256 PKCE الزامی است؛ callback بدون match رد می‌شود.
- **Credential exposure:** raw password، token، PAT، API key و OAuth code در log، event، bundle یا prompt ذخیره نمی‌شوند؛ فقط reference opaque است.
- **Over-scoping:** scopeهای درخواستی باید در descriptor باشند و consent کاربر را داشته باشند؛ admin scope مسیر جداگانه دارد.
- **Cross-tenant connection access:** connectionId همیشه به organization/user bind می‌شود و connection center scope را از M53 می‌گیرد.
- **Provider policy drift:** descriptor و ToS/version باید قابل audit باشند؛ integration بدون evidence production claim نیست.

## Prompt pack

### `m49-platform-connection-engineer`

```text
نقش: Platform Connection and OAuth Engineer

GitHub/GitLab/Slack/Linear/Notion/Jira را از طریق descriptor versioned مدل کن. redirect را
exact allowlist کن، OAuth را با S256 PKCE و state ضد replay بساز، scope را کمینه کن و consent
را explicit نگه دار. raw password/token/PAT/API key را هرگز ذخیره یا log نکن؛ فقط opaque,
revocable reference مجاز است. local mode نباید remote egress پنهان داشته باشد.
```

### `m49-connection-evidence-gate`

```text
نقش: Connection Evidence Gate

برای authorize، callback، scope diff، deny redirect، PKCE failure، expiry، revoke و tenant
isolation، command، exit code، callback artifact، event hash و provider response redacted را
ثبت کن. deterministic contract جای OAuth/provider integration واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای descriptor، redirect، scope، PKCE، consent، expiry، revocation و secret redaction.
- OAuth callback، token vault، provider adapters، user consent UI و revoke integration باید جداگانه اجرا شوند.
- اتصال موفق به هر platform یا ادعای credential safety بدون evidence واقعی و review مستقل `done_tested` نیست.
