# فاز M143: Operator Console و Live Run UX

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/operator-console-runtime.ts`
**تست:** `test/next-platform-hardening-phases-3.test.ts`
**gap:** `GAP-UX-10`

## هدف و مرز

M143 console عملیاتی را به Run view، live event، safe action و UI evidence تبدیل می‌کند. view باید
role، field allowlist، timeline hash، expiry، tenant match و redaction داشته باشد. live event باید
sequence، replayability، payload hash و PII redaction داشته باشد. action باید role authorization،
confirmation، idempotency، reversibility و approval را enforce کند. UI evidence باید RTL، keyboard,
focus، error recovery و redaction را ثبت کند. این فاز Web UI، realtime transport، accessibility
runner، browser automation یا action backend واقعی نیست.

## معماری و قراردادها

- `validateM143RunView`: role، field allowlist، timeline، expiry، tenant و redaction.
- `decideM143LiveEvent`: sequence، replay، event hash، tenant و PII redaction.
- `decideM143Action`: role، confirmation، idempotency، reversibility و approval.
- `validateM143UiEvidence`: route، state، RTL، keyboard، focus، recovery و redaction.

viewer operational live stream دریافت نمی‌کند؛ actionهای mutating بدون approval یا بدون idempotency رد می‌شوند.

## sprint plan

### Sprint A — Run view

role matrix، field allowlist، timeline، loading/empty/error state و expiry.

### Sprint B — Live stream

sequence، replay cursor، redaction، reconnect و event hash.

### Sprint C — Safe actions

pause/resume/cancel/retry، confirmation، idempotency، approval و rollback.

### Sprint D — Inclusive UX evidence

RTL، keyboard/focus، responsive state، error recovery و screen evidence.

## Threat Model

- **Cross-tenant console leak:** view/event/action tenant match لازم است.
- **Role escalation:** field/action allowlist و role check اجباری است.
- **Duplicate mutating action:** idempotency key و confirmation لازم است.
- **Live PII leak:** event payload hash و redaction لازم است.
- **Viewer privilege creep:** viewer live stream و mutating action ندارد.
- **Inaccessible failure state:** keyboard، focus، RTL و recovery evidence لازم است.

## prompt pack

### `m143-operator-console-engineer`

```text
نقش: Operator Console Engineer

Run view را با role، field allowlist، timeline hash، expiry، tenant match و redaction بساز. live
event باید sequence، replay، payload hash و PII redaction داشته باشد. action را با role، confirmation،
idempotency، reversibility و approval gate کن؛ UI evidence شامل RTL، keyboard، focus و recovery باشد.
```

### `m143-console-auditor`

```text
نقش: Operator UX Auditor

view expiry، field leakage، live sequence، tenant، role، duplicate action، approval، RTL، keyboard
و error recovery را ممیزی کن. screenshot یا mocked event جای Web UI، realtime transport و action
backend integration واقعی نیست.
```

## DoD و production evidence boundary

- view، live event، action denial، duplicate protection و UI accessibility evidence تست شوند.
- Web UI، realtime gateway، RBAC/API، action executor، accessibility automation و browser E2E باید integration شوند.
- kernel M143 به‌تنهایی operator safety، live delivery، accessibility compliance یا production UI readiness claim نیست.
