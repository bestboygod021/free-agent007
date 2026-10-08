# فاز M92: Human Approval، Review Queue و Escalation

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-CP-04`، `GAP-CP-05`، `GAP-CP-08`، `GAP-PO-06`، `GAP-SE-08`
**کد kernel:** `src/core/approval-review-runtime.ts`
**تست:** `test/next-operations-and-enterprise-phases.test.ts`

## هدف و مرز

M92 approval را از یک boolean به review request، assignment، human decision و escalation
قابل audit تبدیل می‌کند. separation of duties، self-review prevention، evidence acknowledgement،
signature reference، expiry و critical-risk escalation باید explicit باشند. این فاز approval UI،
notification service، identity directory، signature provider یا case-management system واقعی را اجرا نمی‌کند.

## معماری

`ApprovalRequestEnvelope` subject/queue/risk/evidence/expiry را نگه می‌دارد. `ReviewAssignment`
self-review و second reviewer را gate می‌کند. `HumanDecisionRecord` reason hash، evidence review،
conflict of interest و signature reference را ثبت می‌کند. escalation level باید افزایش یابد و
critical risk approval evidence داشته باشد.

## قراردادهای اصلی

- `validateApprovalRequestEnvelope` expiry، evidence و separation را validate می‌کند.
- `decideReviewAssignment` reviewer، self-review و second reviewer را gate می‌کند.
- `validateHumanDecisionRecord` evidence، conflict، reason و signature را enforce می‌کند.
- `decideApprovalEscalation` timeout/risk، level و notification evidence را بررسی می‌کند.

## sprintها

### Sprint A — Review Request

- request subject/type
- queue/risk
- evidence bundle
- TTL و expiry

### Sprint B — Assignment

- role-based reviewer
- self-review prevention
- second reviewer
- availability/fallback

### Sprint C — Human Decision

- approve/reject/request changes
- reason/signature
- conflict of interest
- immutable audit

### Sprint D — Escalation

- timeout
- critical risk
- policy conflict
- owner/security notification

## Threat Model

- **Self-approval:** requester و reviewer separation و self-review forbidden است.
- **Rubber stamp:** reviewer باید evidence review و reason ثبت کند.
- **Expired approval:** request بعد از expiry قابل قبول نیست.
- **Conflict of interest:** conflicted reviewer نمی‌تواند تصمیم بدهد.
- **Critical bypass:** critical escalation بدون approval evidence عبور نمی‌کند.

## Prompt pack

### `m92-human-review-engineer`

```text
نقش: Human Review and Approval Engineer

approval را با subject hash، queue، risk، evidence و expiry بساز. self-review را ممنوع کن و برای
critical action second reviewer بخواه. decision باید reason hash، evidence-reviewed، conflict check
و signature reference داشته باشد. timeout و critical risk escalation را audit کن.
```

### `m92-approval-evidence-gate`

```text
نقش: Approval Evidence Gate

برای request، assignment، review، approve/reject، conflict، escalation و expiry، subject/evidence
hash، reviewer role، timestamp، signature، command و exit code ثبت کن. boolean approval یا screenshot
جای review queue، separation و human decision evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای request، expiry، assignment، separation، decision و escalation.
- approval UI، identity/role lookup، notification، signature service و case-management باید integration شوند.
- kernel M92 به‌تنهایی human approval operations یا governance production را ثابت نمی‌کند و `done_tested` نیست.
