# فاز M105: Identity، Membership و MFA Boundary

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-CP-01`، `GAP-CP-02`، `GAP-CP-04`، `GAP-CP-10`، `GAP-SE-03`
**کد kernel:** `src/core/identity-membership-runtime.ts`
**تست:** `test/next-control-plane-phases.test.ts`

## هدف و مرز

M105 session lifecycle، invitation، role transition و MFA evidence را با separation of duties
formalize می‌کند. session باید expiry، revoke، token reference opaque و device boundary داشته
باشد. invitation owner promotion را مجاز نمی‌کند. role change actor/subject را جدا می‌کند و
privileged session revoke را برای demotion می‌خواهد. این فاز OIDC/SAML provider، passwordless
broker، MFA device store، email delivery، directory یا membership UI واقعی را اجرا نمی‌کند.

## معماری

`IdentitySessionContract` subject hash، auth method، factor، lifetime، device binding و revoke را
ثبت می‌کند. `MembershipInvitationContract` invitee reference، role، expiry، approval و token hash
دارد. `MembershipRoleChangeRequest` actor/subject، role delta، reauthentication، separation of
duties و active session revoke را gate می‌کند. `MfaEvidence` challenge، attempt، recovery-code
rotation و phishing resistance را نگه می‌دارد؛ raw password یا secret هرگز ذخیره نمی‌شود.

## قراردادهای اصلی

- `validateM105IdentitySession`: expiry، revoke، device binding و opaque token reference را validate می‌کند.
- `decideM105Invitation`: invitation expiry، revoke، approval و role boundary را gate می‌کند.
- `decideM105RoleChange`: actor/subject separation، approval، reauthentication و demotion revoke را enforce می‌کند.
- `validateM105MfaEvidence`: verified challenge، attempt cap و recovery-code rotation را بررسی می‌کند.

## sprintها

### Sprint A — Session

- local/OIDC session
- token reference و expiry
- device binding
- revoke و reauthentication

### Sprint B — Membership

- invitation lifecycle
- accept/revoke/expire
- role hierarchy
- owner/admin separation

### Sprint C — MFA

- passkey/TOTP/OIDC factor
- challenge attempt cap
- recovery code rotation
- phishing-resistant evidence

### Sprint D — Access Operations

- deprovision
- active-session revoke
- notification/audit
- settings precedence

## Threat Model

- **Session theft:** token خام ذخیره نمی‌شود و expiry/revoke/device binding اجباری است.
- **Invitation takeover:** token hash، expiry و approval بررسی می‌شوند.
- **Privilege escalation:** owner grant محدود و role actor از subject جداست.
- **MFA downgrade:** recovery code یک‌بارمصرف و rotation دارد.
- **Stale privilege:** demotion با revoke sessionهای privileged همراه است.

## Prompt pack

### `m105-identity-engineer`

```text
نقش: Identity and Membership Engineer

session را با subject hash، auth factor، expiry، revoke، opaque token reference و device binding
بساز. invitation owner را مستقیم grant نکند. role change باید actor/subject separation،
reauthentication، separation of duties و revoke session داشته باشد. raw password ذخیره نکن.
```

### `m105-identity-evidence-gate`

```text
نقش: Identity Evidence Gate

برای session، invitation، role change و MFA، subject/token hash، factor، expiry، approval، revoke،
challenge، attempts، command و exit code ثبت کن. fixture token یا تست unit جای OIDC، passkey/TOTP
provider، mail delivery، directory و membership E2E evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای session، invitation، role change و MFA.
- OIDC/SAML، passkey/TOTP store، token broker، directory، notification و access UI باید integration شوند.
- kernel M105 به‌تنهایی authentication، MFA یا membership production را ثابت نمی‌کند و `done_tested` نیست.
