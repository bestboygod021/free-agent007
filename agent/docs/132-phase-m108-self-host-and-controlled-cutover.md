# فاز M108: Self-host، Backup/Restore و Controlled Cutover

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-PO-01`، `GAP-PO-02`، `GAP-PO-03`، `GAP-PO-05`، `GAP-PO-06`، `GAP-OB-05`، `GAP-OB-06`
**کد kernel:** `src/core/release-cutover-runtime.ts`
**تست:** `test/next-control-plane-phases.test.ts`

## هدف و مرز

M108 self-host release plan، encrypted backup/restore، canary/cutover و bounded chaos evidence را
در مرز release جمع می‌کند. release باید image digest، config schema، SBOM، signature، TLS،
no-clobber، migration و rollback plan داشته باشد. restore باید encryption، checksum، retention،
RTO/RPO و exit code ثبت کند. cutover با incident/error budget/rollback hold می‌شود. chaos فقط با
blast radius محدود، sandbox و recovery budget انجام می‌شود. این فاز Compose/Kubernetes installer،
CI runner، backup store، migration executor، traffic switch یا chaos platform واقعی را اجرا نمی‌کند.

## معماری

`M108SelfHostReleasePlan` target، artifact/config/SBOM/signature، TLS، no-clobber، migration و
rollback را نگه می‌دارد. `M108BackupRestoreEvidence` backup encryption، checksum، retention، restore
و RTO/RPO را ثبت می‌کند. `M108ReleaseCutoverRequest` stage، canary، smoke، incident، budget و
rollback readiness را gate می‌کند. `ChaosEvidence` نوع آزمایش، blast radius، approval، recovery
و no-data-loss را نگه می‌دارد.

## قراردادهای اصلی

- `validateM108SelfHostPlan`: release artifact، TLS، no-clobber، migration/rollback و approval را validate می‌کند.
- `validateM108BackupRestore`: encryption، checksum، retention، restore، RTO/RPO و exit code را gate می‌کند.
- `decideM108Cutover`: canary، smoke، incident، error budget، approval و rollback readiness را enforce می‌کند.
- `validateM108ChaosEvidence`: blast radius، sandbox، recovery budget و no-data-loss را بررسی می‌کند.

## sprintها

### Sprint A — Packaging

- Compose/Kubernetes/binary target
- image digest و SBOM
- config migration
- TLS و no-clobber

### Sprint B — Backup/Restore

- encrypted backup
- checksum و retention
- restore rehearsal
- RTO/RPO report

### Sprint C — Cutover

- plan/canary/promote/rollback
- smoke و error budget
- traffic switch
- release approval و changelog

### Sprint D — Resilience

- bounded chaos
- process/network/dependency failure
- recovery evidence
- no-data-loss و postmortem

## Threat Model

- **Config clobber:** no-clobber و backup پیش از تغییر اجباری است.
- **Unsigned release:** digest، SBOM و signature بدون استثنا لازم‌اند.
- **Unrecoverable upgrade:** migration و rollback plan هر دو لازم‌اند.
- **Premature cutover:** incident، error budget و rollback readiness gate هستند.
- **Chaos harm:** blast radius، sandbox، approval و recovery budget محدود می‌شوند.

## Prompt pack

### `m108-release-engineer`

```text
نقش: Self-host and Release Engineer

release را با target، image digest، config schema، SBOM، signature، TLS، no-clobber، migration و
rollback plan بساز. backup باید encrypted، checksum‌دار و restore-tested باشد. cutover از plan به
canary و promote فقط با smoke، error budget، rollback readiness و approval پیش برود.
```

### `m108-cutover-evidence-gate`

```text
نقش: Cutover Evidence Gate

برای package، backup/restore، canary، promote، rollback و chaos، digest/signature، checksum،
RTO/RPO، canary percent، smoke، error budget، blast radius، recovery، command و exit code ثبت کن.
compose محلی یا chaos mock جای installer، CI، backup store، traffic switch و recovery drill واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای self-host plan، backup/restore، cutover و chaos evidence.
- packaging/installer، CI، backup store، migration executor، traffic switch، rollback automation و chaos runner باید integration شوند.
- kernel M108 به‌تنهایی self-host production، DR، controlled cutover یا chaos resilience را ثابت نمی‌کند و `done_tested` نیست.
