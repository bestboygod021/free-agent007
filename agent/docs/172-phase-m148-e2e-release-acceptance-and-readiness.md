# فاز M148: E2E Release Acceptance و Readiness

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/release-acceptance-runtime.ts`
**تست:** `test/next-platform-hardening-phases-4.test.ts`
**gap:** `GAP-QA-09`

## هدف و مرز

M148 آخرین مرحله release را از checklist غیرقابل‌ردیابی به acceptance plan، deterministic gates،
go/no-go و independent readiness review تبدیل می‌کند. plan باید test matrix، security، accessibility،
product E2E، rollback، approval، local fallback و tenant migration readiness داشته باشد. gate result
باید evidence، blocking/severity، owner و deterministic status داشته باشد. go/no-go فقط با blocker صفر،
error budget، rollback، approval، support runbook و fallback اجازه دارد. این فاز product E2E runner،
security/accessibility scanner، release orchestrator، canary controller یا support platform واقعی نیست.

## معماری و قراردادها

- `validateM148AcceptancePlan`: matrix/evidence hashes، approval، fallback و tenant migration.
- `validateM148GateResult`: deterministic gate، status، blocker، severity و evidence.
- `decideM148GoNoGo`: blockers، error budget، rollback، approval، migration، runbook و fallback.
- `validateM148ReadinessReview`: independent review، production evidence، exception expiry و rollback.

waiver برای critical gate مجاز نیست؛ production deploy بدون approval یا بدون rollback/fallback fail-closed است.

## sprint plan

### Sprint A — Acceptance matrix

product E2E، security، accessibility، load، tenant و rollback evidence.

### Sprint B — Deterministic gates

gate schema، blocking/severity، owner، waiver policy و evidence hash.

### Sprint C — Go/no-go

canary، blocker count، error budget، migration readiness، support runbook و fallback.

### Sprint D — Readiness review

independent reviewer، exception expiry، rollback reference و release decision audit.

## Threat Model

- **False green release:** deterministic evidence و blocking gate لازم است.
- **Critical waiver abuse:** critical waiver رد می‌شود.
- **Missing tenant migration:** readiness بدون migration fail می‌شود.
- **Unsafe promotion:** rollback، error budget، approval و fallback اجباری است.
- **Unreviewed exception:** exception expiry و independent review لازم است.
- **Test theater:** kernel gate بدون product E2E evidence production claim نیست.

## prompt pack

### `m148-release-acceptance-engineer`

```text
نقش: E2E Release Acceptance Engineer

acceptance plan را با test matrix، security، accessibility، product E2E، rollback، approval، local
fallback و tenant migration بساز. gateها deterministic و evidence-hashed باشند. go/no-go فقط با
blocker صفر، error budget، rollback، runbook، migration readiness و approval مجاز است.
```

### `m148-readiness-auditor`

```text
نقش: Release Readiness Auditor

E2E، security، accessibility، blocker severity، waiver، error budget، rollback، support runbook،
tenant migration، exception expiry و independent review را بررسی کن. test fixture یا green unit
suite جای product E2E، canary و production rollback evidence واقعی نیست.
```

## DoD و production evidence boundary

- acceptance plan، pass/fail/waiver، go/no-go denial و readiness review negative paths تست شوند.
- product E2E runner، security/accessibility/load matrix، release orchestrator، canary/rollback و support evidence باید integration شوند.
- kernel M148 به‌تنهایی release readiness، product quality، rollback safety یا production deployment approval claim نیست.
