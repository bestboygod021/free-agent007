# فاز M68: Pilot Release، E2E و Release Gates

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-QA-03`، `GAP-QA-04`، `GAP-QA-05`، `GAP-PO-02`، `GAP-PO-03`، `GAP-PO-05`، `GAP-PO-06`، `GAP-OB-03`، `GAP-OB-06`
**کد kernel:** `src/core/pilot-release-gate-runtime.ts`
**تست:** `test/next-platform-integration-phases.test.ts`

## هدف و مرز

M68 آخرین gate پیش از pilot کنترل‌شده است: cohort محدود، E2E از اتصال تا run، accessibility،
security، tenant isolation، rollback و release gate. pilot فقط پس از evidence کامل و approval
قابل شروع است و manual/metric/incident abort دارد. این فاز CI/CD، canary traffic، monitoring
backend، deployment executor، rollback executor یا production pilot واقعی را اجرا نمی‌کند.

## معماری

`PilotCohort` organization، tenant list، environment، percentage، duration، approval و
rollback hash را نگه می‌دارد. `EndToEndFlowEvidence` هر step را با evidence hash به exit code،
tenant isolation، accessibility و security وصل می‌کند. `PilotReleaseGate` flowهای اجباری، open
incidents، security findings، rollback evidence و approval را جمع می‌کند. gate بدون یک flow
کامل یا با incident باز block می‌شود.

## قراردادهای اصلی

- `validatePilotCohort` tenant uniqueness، percentage، duration، start، rollback و approval را gate می‌کند.
- `validateEndToEndFlowEvidence` step evidence، exit code، tenant/accessibility/security را validate می‌کند.
- `decidePilotReleaseGate` required flow، incident، security finding، rollback و approval را بررسی می‌کند.
- `decidePilotAbort` metric breach/incident/manual abort و manual approval را enforce می‌کند.

## sprintها

### Sprint A — Product E2E

- sign-up/session
- connection/OAuth
- request/plan/approval
- model/run/workspace/output

### Sprint B — Quality/Security

- accessibility browser runner
- load/security test
- tenant isolation probe
- prompt injection/secret leak test

### Sprint C — Pilot Operations

- cohort/percentage/duration
- canary metric و abort threshold
- incident/runbook/escalation
- rollback rehearsal

### Sprint D — Release Gate

- CI/CD pipeline
- artifact/signature/CHANGELOG
- staging → canary → production approval
- post-pilot review و evidence retention

## Threat Model

- **Blast radius:** cohort tenant-scoped و percentage bounded است؛ pilot بدون rollback hash شروع نمی‌شود.
- **False E2E:** هر step evidence، exit code، tenant isolation، accessibility و security لازم دارد.
- **Release with incidents:** open incident یا security finding gate را block می‌کند.
- **Unauthorized deployment:** approval و environment gate لازم است؛ push/deploy بدون approval مجاز نیست.
- **Rollback failure:** rollback evidence پیش از release لازم است و abort manual approval boundary دارد.

## Prompt pack

### `m68-pilot-release-engineer`

```text
نقش: Pilot and Release Gate Engineer

pilot را محدود، tenant-scoped و درصد/مدت‌دار بساز. E2E باید تمام مسیر connection→request→
approval→model→run→workspace→output را با evidence، tenant isolation، accessibility و
security پوشش دهد. open incident یا security finding release را block کند. canary abort و
rollback را پیش از production تمرین کن.
```

### `m68-release-evidence-gate`

```text
نقش: Release Evidence Gate

برای cohort، E2E step، browser/API output، accessibility/security report، canary metric،
incident، rollback و approval، artifact hash، command و exit code ثبت کن. staging success یا
unit test جای pilot traffic و production release evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای cohort، percentage، E2E evidence، tenant/accessibility/security، incident، rollback و approval.
- CI/CD، browser/API E2E، load/security/a11y runner، canary traffic، monitoring، deployment و rollback باید integration شوند.
- M68 فقط release decision contract می‌سازد؛ pilot موفق یا production readiness بدون evidence واقعی و approval انسانی ادعا نمی‌شود و `done_tested` نیست.
