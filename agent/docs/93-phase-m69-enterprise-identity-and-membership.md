# فاز M69: Enterprise Identity، Membership و Delegation

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-CP-02`، `GAP-CP-04`، `GAP-CP-05`، `GAP-CP-08`
**کد kernel:** `src/core/enterprise-identity-runtime.ts`
**تست:** `test/next-governance-and-ecosystem-phases.test.ts`

## هدف و مرز

M69 لایه سازمانی واقعی را برای invitation، membership، role، federation و delegation تعریف
می‌کند. کاربر باید بتواند عضو دعوت کند، نقش را با approval تغییر دهد، SSO/OIDC/SAML را با MFA
وصل کند و delegation کوتاه‌عمر بسازد. این فاز IdP callback، directory sync، database membership
store، MFA provider، email delivery یا admin UI واقعی را اجرا نمی‌کند.

## معماری

`EnterpriseIdentityProvider` method، issuer، allowed domains، opaque key references، MFA و
review را ثبت می‌کند. `EnterpriseInvitation` email hash و expiry دارد و inviter خودش نمی‌تواند
آن را قبول کند. `EnterpriseMembershipChange` separation of duties و owner transfer را gate
می‌کند. `EnterpriseDelegation` capability/resource scope، expiry، revocation و approval را
محدود می‌کند.

## قراردادهای اصلی

- `validateEnterpriseIdentityProvider` federation، HTTPS، MFA، domain و reference safety را بررسی می‌کند.
- `decideEnterpriseInvitation` expiry، revoke، acceptance و self-accept را gate می‌کند.
- `validateEnterpriseMembershipChange` role/state transition و owner approval را enforce می‌کند.
- `validateEnterpriseDelegation` scope، expiry، revocation و approval را validate می‌کند.

## sprintها

### Sprint A — Membership

- invitation/accept/revoke
- role hierarchy و owner transfer
- membership state و audit
- notification/email adapter

### Sprint B — Enterprise Federation

- OIDC/SAML metadata
- callback/state و MFA
- domain verification
- directory sync و deprovision

### Sprint C — Delegation

- capability/resource scope
- short-lived delegation
- revoke و expiration
- human/agent separation

### Sprint D — Access E2E

- admin UI و settings
- cross-tenant denial
- session/MFA recovery
- role/delegation browser evidence

## Threat Model

- **Role escalation:** member خودش نمی‌تواند role را بالا ببرد؛ owner transfer approval لازم دارد.
- **Federation spoofing:** issuer باید HTTPS، domain allowlist، MFA و review داشته باشد.
- **Stale delegation:** expiry و revocation در هر use بررسی می‌شوند؛ delegation دائمی مجاز نیست.
- **Offboarding gap:** revoked membership با active شدن مستقیم برنمی‌گردد و باید invitation جدید داشته باشد.
- **PII exposure:** email فقط hash می‌شود و raw identity در audit/kernel ذخیره نمی‌شود.

## Prompt pack

### `m69-enterprise-identity-engineer`

```text
نقش: Enterprise Identity Engineer

OIDC/SAML را با issuer HTTPS، domain allowlist و MFA وصل کن. invitation را short-lived و
email-hash نگه دار. role change، owner transfer و delegation را به separation of duties،
approval، expiry و revoke بسپار. deprovision باید fail-closed باشد و raw identity/secret وارد
audit نشود.
```

### `m69-identity-evidence-gate`

```text
نقش: Identity Evidence Gate

برای invitation، accept/revoke، role change، federation callback، MFA، deprovision و delegation،
identity hash، state، timestamp، event hash، command و exit code ثبت کن. signed contract جای IdP,
directory sync و browser E2E evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای provider، invitation، role transition، delegation، expiry و revoke.
- IdP، MFA، email/directory sync، membership store، admin UI و E2E باید integration شوند.
- identity kernel به‌تنهایی enterprise SSO یا access-control production را ثابت نمی‌کند و `done_tested` نیست.
