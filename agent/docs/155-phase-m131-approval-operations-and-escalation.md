# فاز M131: Approval Operations، Human Review و Escalation

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/approval-operations-runtime.ts`
**تست:** `test/next-platform-hardening-phases.test.ts`
**gap:** `GAP-CP-15`

## هدف و مرز

M131 approval را از یک boolean به workflow قابل ممیزی تبدیل می‌کند. request باید subject، risk، queue،
evidence، expiry و customer-impact redaction داشته باشد. assignment باید self-review را ممنوع کند و
برای ریسک بالا second reviewer بخواهد. decision باید evidence reviewed، conflict-of-interest، reason
hash و signature reference داشته باشد. escalation باید level، trigger، notification و audit داشته
باشد. این فاز approval inbox، notification provider، reviewer directory، signature service یا admin UI واقعی نیست.

## معماری و قراردادها

- `validateM131Approval`: request identity، expiry، critical separation و impact redaction.
- `decideM131Assignment`: reviewer، self-review، second reviewer و assignment window.
- `validateM131DecisionRecord`: evidence review، conflict، reason و signature reference.
- `decideM131Escalation`: increasing level، trigger، notification، approval و redaction.

approval هرگز CAPTCHA/MFA bypass یا production deployment بدون approval را مجاز نمی‌کند.

## sprint plan

### Sprint A — Intake

risk classification، queue routing، evidence link، expiry و customer-impact redaction.

### Sprint B — Review assignment

role routing، self-review prevention، second reviewer و unavailable timeout.

### Sprint C — Decision ledger

approve/reject/change/expire، evidence confirmation، signature و immutable audit.

### Sprint D — Escalation

timeout، critical risk، reviewer unavailable، policy conflict و notification runbook.

## Threat Model

- **Rubber-stamp approval:** evidence review و second reviewer لازم است.
- **Self-approval:** actor/reviewer separation اجباری است.
- **Expired approval reuse:** request expiry و signature binding لازم است.
- **Conflict of interest:** conflicted decision fail می‌شود.
- **Silent escalation:** level، trigger و notification باید audit شوند.
- **Customer data leakage:** impact در approval evidence redacted است.

## prompt pack

### `m131-approval-operations-engineer`

```text
نقش: Human Approval Operations Engineer

approval request را با subject، risk، queue، evidence، expiry و customer-impact redaction بساز.
assignment باید self-review را ببندد و برای critical/high second reviewer بخواهد. decision را
با evidence reviewed، conflict، reason hash و signature ثبت کن؛ timeout و critical risk را escalate کن.
```

### `m131-review-auditor`

```text
نقش: Approval Workflow Auditor

request expiry، role routing، self-review، second reviewer، signature، conflict، escalation و
notification evidence را ممیزی کن. approval boolean یا mock inbox جای workflow durable، human
review، immutable audit یا production gate واقعی نیست.
```

## DoD و production evidence boundary

- request، assignment، decision، expiry، escalation و conflict negative paths تست شوند.
- durable approval inbox، reviewer identity، notification, signing، immutable audit و deployment gate باید integration شوند.
- kernel M131 به‌تنهایی human authorization، reviewer availability، approval delivery یا production cutover permission را ثابت نمی‌کند.
