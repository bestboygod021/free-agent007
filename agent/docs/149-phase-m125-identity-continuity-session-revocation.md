# فاز M125: Identity Continuity، Session Revocation، Delegation و MFA Recovery

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/identity-continuity-runtime.ts`
**تست:** `test/next-foundation-hardening-phases.test.ts`
**gap:** `GAP-CP-14`

## هدف و مرز

M125 identity را از یک token check به lifecycle قابل revoke تبدیل می‌کند: session باید expiration، last-seen، revocation version، MFA و device binding داشته باشد. delegation باید scoped، time-bound، revocable و approval-bound باشد. role change باید separation of duties و session revocation داشته باشد. recovery هرگز bypass خاموش MFA نیست. این فاز IdP، WebAuthn server، session database، notification delivery یا admin UI واقعی را پیاده نمی‌کند.

## معماری

- `validateM125Session`: lifetime، revoke state، opaque token reference، MFA و device binding را بررسی می‌کند.
- `decideM125Delegation`: subject separation، scope، expiry، revocability، approval و owner deny را gate می‌کند.
- `decideM125RoleChange`: role transition، separation of duties، privileged approval و demotion session revoke را validate می‌کند.
- `validateM125MfaRecovery`: identity verification، bounded attempts، recovery rotation و approval را enforce می‌کند.

هیچ raw password، recovery secret، access token یا API key در state، log یا audit ثبت نمی‌شود؛ فقط hash/reference opaque مجاز است.

## sprint plan

### Sprint A — Session continuity

short-lived session، revocation version، idle/absolute expiry و device binding.

### Sprint B — Membership delegation

scoped delegation، expiry، revoke، approval و owner/admin boundary.

### Sprint C — Role transitions

separation of duties، reauthentication، privileged session invalidation و audit.

### Sprint D — MFA recovery

identity proof، bounded attempt، recovery code rotation، passkey rebind و notification.

## Threat Model

- **Session replay:** expiry، revoke version و device binding لازم است.
- **Privilege escalation:** owner deny، separation of duties و approval لازم است.
- **Delegation persistence:** expiry و revocation باید durable باشند.
- **MFA bypass:** recovery فقط با identity verification و approval مجاز است.
- **Secret exposure:** token/password/recovery value هرگز ذخیره یا چاپ نمی‌شود.

## prompt pack

### `m125-identity-continuity-engineer`

```text
نقش: Identity Continuity Engineer

session را با opaque reference، expiry، last-seen، revocation version، MFA و device binding
طراحی کن. delegation را scoped، time-bound، revocable و approval-bound کن. role change باید
separation of duties و privileged-session revoke داشته باشد.
```

### `m125-identity-reviewer`

```text
نقش: Identity Security Reviewer

replay، expiry، revoke، owner escalation، demotion، recovery attempt و notification evidence را
بررسی کن. MFA/CAPTCHA را bypass نکن، bulk account creation ممنوع است و raw password/token یا
recovery code نباید در artifact باقی بماند.
```

## DoD و production evidence boundary

- session/revoke، delegation، role change و MFA recovery با positive/negative tests پوشش داده شوند.
- IdP/OIDC یا passkey provider، durable session store، revoke propagation، audit، notification و admin workflow باید integration شوند.
- kernel M125 به‌تنهایی identity assurance، MFA enforcement، session revocation production یا membership compliance claim نیست.
