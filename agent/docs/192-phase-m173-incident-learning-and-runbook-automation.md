# فاز M173: Incident Learning و Runbook Automation

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/incident-learning-runtime.ts`
**تست:** `test/next-platform-hardening-phases-9.test.ts`
**gap:** `GAP-PO-12`

## هدف و مرز

M173 signal را به deduped incident case، commander، customer-impact redaction، bounded containment،
approved runbook و corrective learning تبدیل می‌کند. runbook command خام یا secret‌دار اجرا نمی‌شود و
هر action باید reversible یا approval‌دار باشد. این فاز alert manager، case store، on-call router،
runbook executor، postmortem UI یا learning-to-CI integration واقعی نیست.

## معماری

- `validateM173Signal`: source، severity، fingerprint، evidence، dedupe، tenant و redaction.
- `decideM173Case`: signal linkage، commander، containment، impact hash، state و approval.
- `validateM173RunbookStep`: action، order، reversible، approval، evidence و no-raw-secrets.
- `decideM173Learning`: root cause، corrective action، regression test، owner، due date و privacy review.

در Local-first، signal و case store محلی/append-only است و on-call خارجی optional و consent-aware باقی
می‌ماند. containment نباید خودکار به destructive action، account creation یا production deploy تبدیل
شود. corrective action تا وقتی regression test و owner ندارد، closed اعلام نمی‌شود.

## sprint plan

### Sprint A — Signal و case

normalization، fingerprint، dedupe، severity و customer-impact redaction.

### Sprint B — Command

incident commander، escalation، containment plan و approval separation.

### Sprint C — Runbook

safe action adapter، reversible step، evidence، timeout و rollback.

### Sprint D — Learning loop

postmortem، corrective owner، regression test، due date و closure review.

## Threat Model

- **Alert flooding:** fingerprint، dedupe و bounded escalation.
- **Unauthorized containment:** approval، reversible action و protected-target policy.
- **Secret in runbook:** command hash، no-raw-secrets و sandbox.
- **False incident closure:** resolution evidence و regression learning.
- **Customer privacy leak:** impact hash/redaction و tenant boundary.
- **Learning theater:** owner، due date، regression test و review gate.

## prompt pack

### `m173-incident-engineer`

```text
نقش: Incident Learning Engineer

signal را با fingerprint، severity، tenant و redacted evidence normalize کن. case را با commander و
containment plan بساز. هر runbook step باید reversible یا approval‌دار، بدون raw secret و evidence-bound
باشد. postmortem را فقط با root cause، corrective owner، due date و regression test ببند.
```

### `m173-incident-auditor`

```text
نقش: Incident Auditor

noise/dedupe، containment approval، destructive action، secret leakage، customer impact، false closure
و missing regression test را بررسی کن. یک incident markdown یا alert mock جای case store، executor و learning loop واقعی نیست.
```

## DoD و production evidence boundary

- signal، case، runbook approval، containment، resolution و corrective learning تست شوند.
- signal/case store، on-call router، reversible executor، evidence timeline، postmortem workflow و CI regression integration باید متصل شوند.
- kernel M173 به‌تنهایی incident response SLA، containment safety، root-cause correctness یا operational resilience production claim نیست.
