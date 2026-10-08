# فاز M160: Feature Flags و Progressive Rollout

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/feature-rollout-runtime.ts`
**تست:** `test/next-platform-hardening-phases-7.test.ts`
**gap:** `GAP-CP-18`

## هدف و مرز

M160 تغییر قابلیت را از deploy جدا می‌کند: flag versioned، owner، expiry، rollout percentage، cohort،
canary evidence، SLO guardrail، kill switch و rollback. flag مقدار secret یا محل دورزدن policy نیست؛
همه exposureها tenant-bound و deterministic هستند. این فاز flag store، evaluator، propagation bus،
metrics backend یا rollback controller واقعی نیست.

## معماری

- `validateM160Flag`: key، owner، expiry، approval، no-secret و tenant scope.
- `decideM160Rollout`: percentage، monotonicity، canary evidence، SLO guardrail و rollback.
- `validateM160KillSwitch`: operator، reason، propagation deadline و tenant match.
- `decideM160Exposure`: deterministic key، rule version، redaction و tenant.

Local-first باید flag store محلی و default-safe داشته باشد. rollout paid/provider feature بدون approval
و evidence فعال نمی‌شود. kill switch برای safety باید سریع باشد اما خودش audit می‌شود؛ feature flag هرگز
جای authorization، MFA یا CAPTCHA stop rule نیست.

## sprint plan

### Sprint A — Flag registry

key schema، owner، expiry، lifecycle و default-safe behavior.

### Sprint B — Evaluation

tenant-aware targeting، deterministic cohort، cache invalidation و exposure event.

### Sprint C — Progressive delivery

canary، percentage monotonic، SLO guardrail، approval و rollback.

### Sprint D — Kill switch

propagation SLA، audit، stale-cache probe و incident exercise.

## Threat Model

- **Stale flag:** TTL، version و propagation probe.
- **Unauthorized exposure:** tenant evaluator، owner و approval.
- **Rollout blast radius:** monotonic ramp، cohort و SLO guardrail.
- **Secret in flag:** no-secret validation و schema restriction.
- **Kill-switch failure:** bounded propagation و default-safe client.
- **Authorization bypass:** evaluator از policy/identity مستقل و پایین‌تر از authz است.

## prompt pack

### `m160-rollout-engineer`

```text
نقش: Progressive Delivery Engineer

flag را با key معتبر، owner، expiry، default-safe، tenant scope و no-secret بساز. rollout را با
cohort، canary evidence، SLO guardrail، approval و rollback محدود کن. kill switch باید سریع، redacted و audit‌شده باشد.
```

### `m160-rollout-auditor`

```text
نقش: Feature Flag Auditor

stale cache، targeting leak، percentage jump، missing rollback، secret value، kill propagation و
confusion با authorization را بررسی کن. mock evaluator جای flag store، propagation و SLO telemetry واقعی نیست.
```

## DoD و production evidence boundary

- flag lifecycle، rollout افزایشی، rollback denial، kill switch و deterministic exposure تست شوند.
- signed flag store، evaluator، propagation/cache، telemetry/SLO، kill switch controller و approval workflow باید متصل شوند.
- kernel M160 به‌تنهایی rollout safety، SLO correctness، propagation SLA یا authorization production claim نیست.
