# فاز M137: Incident Case، Containment و Postmortem

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/incident-case-runtime.ts`
**تست:** `test/next-platform-hardening-phases-2.test.ts`
**gap:** `GAP-PO-09`

## هدف و مرز

M137 از alert خام به incident case قابل‌ممیزی می‌رسد. signal باید tenant-bound، deduplicated،
redacted و evidence-linked باشد. case باید owner، severity، impact summary، state و evidence داشته
باشد. containment فقط با blast radius محدود، reversibility، sandbox، approval و no-data-deletion
مجاز است. postmortem باید timeline، root cause، action items، review و follow-up داشته باشد. این
فاز alert provider، on-call scheduler، case-management UI، traffic controller یا incident commander
واقعی نیست.

## معماری و قراردادها

- `validateM137Signal`: signal identity، severity، dedupe، evidence، tenant و redaction.
- `decideM137Case`: owner، state، evidence، impact redaction و critical approval.
- `decideM137Containment`: action، blast radius، reversible/sandboxed، approval و non-destructive guard.
- `validateM137Postmortem`: timeline، root cause، action items، review و follow-up evidence.

containment نباید برای حذف شواهد، دورزدن approval، خاموش‌کردن audit یا حذف داده tenant استفاده شود.

## sprint plan

### Sprint A — Intake

signal normalization، dedupe، severity، tenant binding و evidence link.

### Sprint B — Case management

owner، state machine، impact summary، escalation و evidence timeline.

### Sprint C — Containment

pause/revoke/disable/isolate/read-only با blast radius، approval و rollback.

### Sprint D — Learning loop

postmortem، root cause، action item، review، follow-up و audit retention.

## Threat Model

- **Alert flood:** dedupe key و bounded case intake لازم است.
- **Containment abuse:** reversibility، scope، approval و no-data-deletion gate می‌شوند.
- **Customer data leakage:** signal/case/postmortem impact redacted است.
- **Evidence destruction:** containment destructive نیست و hashes نگه داشته می‌شوند.
- **Unowned critical incident:** critical case owner و approval لازم دارد.
- **False closure:** postmortem evidence، review و follow-up اجباری است.

## prompt pack

### `m137-incident-operator`

```text
نقش: Incident Operations Engineer

signal را dedupe، tenant-bound، redacted و evidence-linked کن. case باید severity، owner، state و
impact hash داشته باشد. containment را bounded، reversible، sandboxed، approved و non-destructive
اجرا کن؛ postmortem را با timeline، root cause، action items، review و follow-up ثبت کن.
```

### `m137-incident-auditor`

```text
نقش: Incident Case Auditor

intake، dedupe، ownership، critical approval، blast radius، reversibility، no-data-loss، evidence
retention و postmortem review را بررسی کن. mock alert یا case fixture جای on-call، case store،
traffic controller و incident drill واقعی نیست.
```

## DoD و production evidence boundary

- signal، case، containment، destructive denial و postmortem incomplete path تست شوند.
- alert integration، durable case store، on-call routing، containment controller، audit timeline و drill باید integration شوند.
- kernel M137 به‌تنهایی incident detection، response speed، containment safety یا operational resilience production claim نیست.
