# فاز M208: Policy Change Control و Rollback

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/policy-change-runtime.ts`
**تست:** `test/next-platform-hardening-phases-16.test.ts`
**gap:** `GAP-SE-23`

## هدف و مرز

M208 تغییر policy را با diff، reason، test evidence، separation of duties، rollback plan، signed approval،
canary، expiry، propagation و no-drift rollback evidence gate می‌کند. این فاز policy registry، canary
runtime، signed distributor، fleet enforcement یا rollback controller واقعی نیست.

## معماری و قرارداد

- `validateM208Change`: old/new hash، diff، reason، tests، rollback plan، requester و separation of duties.
- `decideM208Promotion`: canary scope، evidence، signature، tests، approval و expiry.
- `decideM208Rollback`: target policy، propagation، approval و review block.
- `validateM208RollbackEvidence`: target coverage، observed hash، no drift و no stale target.

Policy payload از README، Issue، webpage یا مدل به‌عنوان authority پذیرفته نمی‌شود؛ فقط policy registry
امضاشده و approval انسانی معتبر است. تغییرات production بدون approval ممنوع و local policy bundle
مسیر fallback است.

## Threat model

- **Silent policy mutation:** old/new hash و immutable diff.
- **Self-approval:** separation of duties و reviewer identity.
- **Unsafe global rollout:** canary scope و expiry.
- **Stale target:** propagation/no-stale evidence.
- **Rollback loop:** target distinction، block-until-review و reason.
- **Policy injection:** signed registry و source trust boundary.

## Sprint plan

### Sprint A — Change registry

versioned policy, diff, reason، test/rollback evidence و owner.

### Sprint B — Review and canary

two-person approval، signed promotion، canary target و expiry.

### Sprint C — Distribution

target inventory، propagation receipt، drift monitor و deny stale target.

### Sprint D — Rollback

bounded rollback، block-until-review، evidence collection و postmortem.

## prompt pack

### `m208-policy-engineer`

```text
نقش: Policy Change Engineer
هر policy change باید old/new hash، diff، reason، tests، rollback plan و separation of duties داشته باشد.
promotion فقط با signed approval، canary evidence و expiry انجام شود؛ rollback باید propagate شود و تا review block بماند.
```

### `m208-governance-auditor`

```text
نقش: Policy Governance Auditor
silent mutation، self-approval، global rollout، stale target، rollback loop و policy injection را بررسی کن.
mock policy، یک flag یا callback جای signed registry، canary evaluator، distributor، drift monitor و rollback controller واقعی نیست.
```

## DoD و production evidence boundary

- same-hash change، self-approval، expired canary، missing tests و stale rollback target deny شوند.
- policy registry، diff/test evaluator، signed promotion gateway، distributor، drift monitor و rollback controller متصل شوند.
- kernel M208 به‌تنهایی policy enforcement، rollout consistency، cryptographic signing یا rollback production claim نیست.
