# فاز M202: Approval Integrity و Decision Expiry

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/approval-integrity-runtime.ts`
**تست:** `test/next-platform-hardening-phases-15.test.ts`
**gap:** `GAP-CP-23`

## هدف و مرز

M202 approval request را با action/target، risk، evidence/policy hash، requester، no-self-approval و expiry
ثبت می‌کند و decision را به signature، request/policy match، human presence، expiry، revocation و
second-reviewer escalation bind می‌کند. این فاز approval inbox، signature service، decision store،
revoke propagation یا reviewer workflow واقعی نیست.

## معماری

- `validateM202Request`: action/target، risk، evidence/policy، requester، expiry، no-self-approval و tenant.
- `decideM202Approval`: signed decision، request/policy match، freshness، human، expiry و tenant.
- `decideM202Revocation`: decision/reason hash، timestamp، propagation و block.
- `validateM202Escalation`: risk transition، reason، second reviewer، approval و tenant.

Local-first approval inbox و signed decision log مرجع‌اند؛ BYOK/free-tier assistant نمی‌تواند human decision
را جعل کند. approver identity به hash/reference محدود است و raw password/MFA code هرگز ذخیره نمی‌شود.

## Sprint plan

### Sprint A — Request

action، target، risk، evidence/policy، requester و expiry.

### Sprint B — Decision

human presence، signature، request/policy match و decision expiry.

### Sprint C — Revocation

reason، propagation، blocked state و audit.

### Sprint D — Escalation

risk escalation، second reviewer و emergency control.

## Threat Model

- **Self-approval:** requester/approver separation.
- **Decision replay:** expiry، signed hash و request match.
- **Policy drift:** policy hash match.
- **Revoked approval reuse:** propagation و block.
- **Reviewer spoofing:** signature و human presence.
- **High-risk bypass:** second reviewer و escalation.

## prompt pack

### `m202-approval-engineer`

```text
نقش: Approval Integrity Engineer

request را با action/target، risk، evidence/policy hash، requester، expiry و no-self-approval ثبت کن.
decision باید signed، human، request/policy-matched و fresh باشد. revoke باید propagate/block شود و high-risk
به second reviewer escalate شود.
```

### `m202-approval-auditor`

```text
نقش: Approval Auditor

self-approval، replay، policy drift، revoked decision reuse، reviewer spoof و high-risk bypass را بررسی کن.
یک boolean approval یا UI mock جای signed decision store، expiry gate، revoke propagation و reviewer workflow واقعی نیست.
```

## DoD و production evidence boundary

- request expiry، signed approval، request mismatch، revocation، self-approval denial و escalation تست شوند.
- approval inbox، signed decision store، expiry/revoke gate، policy matcher و second-reviewer workflow باید متصل شوند.
- kernel M202 به‌تنهایی human identity، non-repudiation، approval delivery یا high-risk governance production claim نیست.
