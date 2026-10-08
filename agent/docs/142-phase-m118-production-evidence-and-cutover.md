# فاز M118: Production Evidence، Readiness و Cross-phase Cutover

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-PO-02`، `GAP-PO-06`، `GAP-OB-05`، `GAP-OB-06`، `GAP-QA-03`، `GAP-QA-04`
**کد kernel:** `src/core/production-evidence-runtime.ts`
**تست:** `test/next-governance-integration-phases.test.ts`

## هدف و مرز

M118 تفاوت design، kernel، integration و production evidence را یک contract مشترک می‌کند و
readiness/canary/cutover را gate می‌کند. integration envelope باید command، artifact، tests،
security، tenant probe، redaction و operator داشته باشد. readiness با open gap/incident، approval و
rollback بسته می‌شود. canary باید baseline error/latency، duration، traffic، rollback و redaction
داشته باشد. این فاز CI/CD، release orchestrator، traffic switch، production monitoring، backup
restore یا actual deployment را اجرا نمی‌کند.

## معماری

`M118IntegrationEvidenceEnvelope` phase/layer/environment و evidence hashes را نگه می‌دارد.
`M118ReadinessAssessment` required/completed evidence، gap/incident، approval، rollback و production
claim boundary را ثبت می‌کند. `M118CanaryEvidence` traffic، duration، error/latency baseline،
state، rollback و impact redaction را gate می‌کند. `M118CutoverDecisionRequest` readiness، canary،
approval، incident، rollback و fallback را enforce می‌کند.

## قراردادهای اصلی

- `validateM118EvidenceEnvelope`: layer/environment، command/artifact/test/security، tenant probe و redaction را validate می‌کند.
- `decideM118Readiness`: evidence completeness، gaps/incidents، approval، rollback و production claim boundary را بررسی می‌کند.
- `validateM118CanaryEvidence`: traffic/duration، error/latency tolerance، state، rollback و impact redaction را gate می‌کند.
- `decideM118Cutover`: ready state، canary، approval، incidents، rollback و fallback را enforce می‌کند.

## sprintها

### Sprint A — Evidence Model

- design/kernel/integration/production layers
- command/artifact hashes
- redaction و operator identity
- tenant/security probes

### Sprint B — Readiness

- required evidence registry
- open gaps/incidents
- approval
- rollback readiness

### Sprint C — Canary

- baseline comparison
- traffic/duration
- error/latency threshold
- rollback and customer impact

### Sprint D — Cutover

- plan/canary/promote/rollback
- local/read-only fallback
- release decision
- post-cutover audit

## Threat Model

- **Production claim inflation:** layer/environment و independent evidence جدا می‌شوند.
- **Canary blind spot:** baseline error/latency و duration اجباری است.
- **Deploy during incident:** open incidents readiness/cutover را block می‌کنند.
- **No rollback:** rollback tested و fallback پیش‌شرط promotion است.
- **Unredacted evidence:** artifact/customer impact قبل از audit redacted می‌شود.

## Prompt pack

### `m118-production-evidence-engineer`

```text
نقش: Production Evidence and Cutover Engineer

evidence را بین design/kernel/integration/production جدا نگه دار. envelope باید command، artifact،
test، security، tenant probe، redaction و operator داشته باشد. readiness open gaps/incidents،
approval و rollback را بررسی کند. canary با baseline، duration، traffic، error/latency و fallback gate شود.
```

### `m118-cutover-evidence-gate`

```text
نقش: Cross-phase Evidence Gate

برای هر phase layer/environment، evidence hash، command، test/security/tenant result، gap/incident،
canary baseline، rollback، approval و exit code ثبت کن. passing unit test یا canary mock جای CI،
production monitor، traffic switch، restore drill و deployment evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای evidence envelope، readiness، canary و cutover.
- CI/CD، evidence store، release orchestrator، traffic switch، production monitor، restore drill و deployment approval باید integration شوند.
- kernel M118 به‌تنهایی production readiness، deployment یا cutover certification را ثابت نمی‌کند و `done_tested` نیست.
