# فاز M192: Recovery، Chaos و Failover Evidence

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/recovery-chaos-runtime.ts`
**تست:** `test/next-platform-hardening-phases-13.test.ts`
**gap:** `GAP-OB-12`

## هدف و مرز

M192 failure drill را به scenario، target، blast radius، duration/budget، sandbox، rollback، observability
و tenant bound محدود می‌کند و recovery را با RTO/RPO، checkpoint، data loss، runbook، failover fencing،
quorum و restore/replay proof می‌سنجد. production chaos بدون approval هرگز مجاز نیست. این فاز chaos
controller، multi-region coordinator، backup restore engine، fencing service یا incident platform واقعی نیست.

## معماری

- `validateM192ChaosPlan`: scenario، target، blast radius، budget، sandbox، rollback و non-production.
- `validateM192RecoveryEvidence`: timeline، RTO/RPO، checkpoint، data loss، runbook و approval.
- `decideM192Failover`: primary/secondary، health، consistency، fencing، quorum، approval و bound.
- `validateM192RestoreProof`: backup/restored hash، schema، integrity، tenant isolation، replay و rollback.

Local-first staging drill مسیر اصلی است؛ free-tier/BYOK provider failure باید با honest degraded disclosure
و بدون failover claim جعلی ثبت شود. blast radius محدود و evidence redacted باقی می‌ماند.

## Sprint plan

### Sprint A — Drill planning

scenario catalog، target، blast radius، budget، sandbox و rollback.

### Sprint B — Recovery measurement

failure/detect/recover timeline، RTO/RPO، checkpoint و data loss.

### Sprint C — Failover

health، consistency، fencing، quorum، secondary admission و approval.

### Sprint D — Restore proof

backup hash، restored hash، schema/integrity، tenant isolation، replay و rollback.

## Threat Model

- **Chaos به production:** non-production gate و sandbox.
- **Split brain:** fencing، consistency hash و quorum.
- **Data loss پوشانده‌شده:** checkpoint، RPO و data-loss counter.
- **False recovery claim:** timeline، runbook و evidence approval.
- **Cross-tenant restore:** tenant isolation proof.
- **Unbounded cost/impact:** duration، budget و blast radius.

## prompt pack

### `m192-recovery-engineer`

```text
نقش: Recovery and Chaos Engineer

drill را با scenario، target، blast radius، duration، budget، sandbox، observability و rollback ثبت کن.
recovery باید timeline، RTO/RPO، checkpoint، data loss و runbook evidence بدهد. failover فقط با fencing،
consistency، quorum و approval مجاز است.
```

### `m192-recovery-auditor`

```text
نقش: Recovery Auditor

production chaos، split brain، false RTO/RPO، hidden data loss، cross-tenant restore و unbounded blast
radius را بررسی کن. sleep/mock یا یک health ping جای failover، restore، replay و fencing evidence واقعی نیست.
```

## DoD و production evidence boundary

- non-production plan، production denial، recovery timing، failover fencing/quorum و restore proof تست شوند.
- chaos controller، fault injector، checkpoint/backup store، failover coordinator، fencing و incident evidence باید متصل شوند.
- kernel M192 به‌تنهایی RTO/RPO guarantee، multi-region resilience، zero data loss یا disaster-recovery production claim نیست.
