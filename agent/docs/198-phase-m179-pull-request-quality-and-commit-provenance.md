# فاز M179: Pull-request Quality و Commit Provenance

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/change-governance-runtime.ts`
**تست:** `test/next-platform-hardening-phases-11.test.ts`
**gap:** `GAP-PO-14`

## هدف و مرز

M179 تغییر کد را از یک diff بی‌زمینه به commit provenance، PR summary، test evidence، risk summary،
review approval، merge guard و changelog قابل‌ردیابی تبدیل می‌کند. direct push به branch محافظت‌شده،
commit دارای secret یا merge بدون rollback reference رد می‌شود. این فاز Git server، code-owner
service، secret scanner، CI provider یا release manager واقعی نیست.

## معماری

- `validateM179Commit`: conventional message، parent provenance، signature، secret scan و branch guard.
- `validateM179PullRequest`: summary، risk، test evidence، reviewer، conflict و tenant boundary.
- `decideM179Merge`: approval، checks، conflict، direct-push denial و rollback reference.
- `validateM179Changelog`: semantic version، change evidence، migration/security notes و approval.

Local-first می‌تواند git metadata را محلی تحلیل کند؛ BYOK/free-tier model فقط پیشنهاد message یا
summary می‌دهد و authority merge نیست. raw password، token و secret در commit، PR summary یا changelog
ذخیره نمی‌شود.

## Sprint plan

### Sprint A — Commit provenance

parent chain، author reference، conventional message، signature و diff/test hash.

### Sprint B — PR quality

title، what/why، tests، risk، changed-files، conflict و reviewer separation.

### Sprint C — Merge guard

checks، approval، protected branch، direct-push denial و rollback reference.

### Sprint D — Release notes

semantic version، migration/security note، evidence-based changelog و audit.

## Threat Model

- **Direct protected-branch mutation:** branch guard و merge-only path.
- **Unreviewed code:** reviewer، approval و checks evidence.
- **Secret in diff/description:** no-secrets gate و redaction.
- **Provenance forgery:** parent/diff/test hashes و signature.
- **False release note:** changelog فقط از change evidence.
- **Unrecoverable merge:** rollback reference پیش از merge.

## prompt pack

### `m179-change-governance-engineer`

```text
نقش: Change Governance Engineer

هر commit را با parent، author، branch، diff hash، test hash و signature ثبت کن. PR باید what/why، risk،
test evidence و reviewer داشته باشد. merge فقط با approval، checks، conflict-free proof و rollback
reference مجاز است؛ direct push به protected branch ممنوع است.
```

### `m179-change-auditor`

```text
نقش: Change Governance Auditor

secret در diff، commit بدون parent، message مبهم، self-approval، direct main push، false test claim و
changelog بدون evidence را بررسی کن. PR template یا git mock جای protected merge و provenance verifier واقعی نیست.
```

## DoD و production evidence boundary

- commit، PR، merge approval، protected-branch denial و semantic changelog تست شوند.
- Git provider، code-owner/reviewer service، secret scanner، CI checks، merge controller و release registry باید متصل شوند.
- kernel M179 به‌تنهایی code review completeness، secret-free repository، merge safety یا release integrity production claim نیست.
