# فاز M48: Production Integration Evidence و Controlled Cutover

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** cross-phase boundary برای M29 تا M47، با تمرکز بر `GAP-PO-02`، `GAP-PO-06`، `GAP-OB-01`، `GAP-OB-03`، `GAP-OB-05` و `GAP-QA-04`
**کد kernel:** `src/core/production-cutover-evidence.ts`
**تست:** `test/future-runtime-phases.test.ts`

## هدف و مرز

M48 آخرین لایه تصمیم‌گیری پیش از integration production را تعریف می‌کند: integration
command evidence، tenant probe، readiness gate، canary، cutover و rollback evidence.
این فاز هیچ production deploy، canary traffic، backup restore، CI provider، monitoring
backend یا external adapter را اجرا نمی‌کند و هیچ phase قبلی را `done_tested` فرض نمی‌کند.

## معماری

هر adapter یک evidence envelope با organization، capability، environment، command hash،
artifact hash، exit code و tenant probe می‌فرستد. readiness gate evidence levelهای لازم،
security findings، open incidents و rollback plan را جمع می‌کند. canary planner درصد/مدت،
success metric و abort metric را محدود می‌کند. cutover فقط با dependency evidence و برای
production با approval ساخته می‌شود؛ rollback evidence می‌تواند metric breach/incident را
خودکار یا manual با approval فعال کند.

## قراردادهای اصلی

- `validateIntegrationEvidence` command، artifact، exit code، tenant probe، environment و evidence level را validate می‌کند.
- `decideReadinessGate` evidence level، incident، security finding، rollback plan و approval را gate می‌کند.
- `planCanary` درصد، duration، success/abort metric و approval را محدود می‌کند.
- `planCutover` dependency evidence hash/level، change hash، rollback plan و برای production integration evidence و approval را الزام می‌کند.
- `validateRollbackEvidence` trigger، identity، rollback hash و manual approval را بررسی می‌کند.

## sprintها

### Sprint A — Evidence Envelope

- command/exit/artifact/digest schema
- tenant isolation probe و environment identity
- evidence level design/kernel/integration/production
- audit chain و retention

### Sprint B — Readiness و Runbook

- dependency graph و evidence matrix
- security finding/open incident gate
- RTO/RPO/rollback readiness
- runbook، owner و escalation

### Sprint C — Canary و Cutover

- staging/canary/production promotion
- success/abort metric و automatic stop
- approval/separation of duties
- change notice و release evidence

### Sprint D — Integration Drills

- PostgreSQL/RLS، queue، sandbox، provider، browser و UI probes
- backup/restore و chaos evidence
- load/security/a11y cross-phase checks
- rollback and post-cutover verification

## Threat Model

- **Evidence laundering:** design/kernel output به‌تنهایی integration یا production نیست؛
  environment، exit code، artifact hash و tenant probe باید با هم وجود داشته باشند.
- **False readiness:** open incident، security finding، dependency evidence یا rollback plan
  ناقص readiness را deny می‌کند.
- **Canary blast radius:** percentage، duration، abort metric و approval محدودیت سخت دارند؛
  canary بدون stop condition به production تبدیل نمی‌شود.
- **Unauthorized cutover:** production target و manual rollback به approval و separation of
  duties نیاز دارند؛ push به `main` یا deploy بدون approval ممنوع است.

## Prompt pack

### `m48-cutover-evidence-architect`

```text
نقش: Production Integration Evidence Architect

design، kernel، integration و production evidence را جدا نگه دار. هر claim باید command،
exit code، artifact hash، tenant probe، environment و owner داشته باشد. readiness بدون
security/incident/rollback evidence مجاز نیست. canary را bounded و abort metricدار کن و
production cutover/rollback را همیشه به approval بسپار.
```

### `m48-cutover-evidence-gate`

```text
نقش: Cutover Evidence Gate

برای هر adapter dependency matrix، command، exit code، duration، digest، tenant probe،
security report، RPO/RTO، canary metric و rollback output ثبت کن. mock, plan, unit test یا
staging success به‌تنهایی production evidence نیست و نباید status را done_tested کند.
```

## DoD و production evidence boundary

- unit/contract برای evidence level، tenant probe، readiness blocking، canary bounds،
  dependency evidence و rollback trigger.
- integration matrix برای persistence، queue، sandbox، provider، browser، UI، CI، backup،
  load و security باید مستقل و قابل بازپخش اجرا شود.
- M48 فقط cutover decision contract می‌سازد؛ production deploy یا capability completion
  بدون evidence واقعی و approval انسانی انجام یا ادعا نمی‌شود.
