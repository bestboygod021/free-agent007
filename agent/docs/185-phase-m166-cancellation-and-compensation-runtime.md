# فاز M166: Cancellation و Compensation Runtime

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/cancellation-compensation-runtime.ts`
**تست:** `test/next-platform-hardening-phases-8.test.ts`
**gap:** `GAP-EX-19`

## هدف و مرز

M166 cancellation را از یک flag UI به request tenant-bound، task checkpoint، lease revoke،
compensation plan، cleanup evidence و external-side-effect boundary تبدیل می‌کند. لغو به‌معنای بازگردانی
جادویی side effect خارجی نیست؛ برای external action مسیر reconciliation و approval لازم است. این فاز
cancellation controller، signal bus، saga worker، process cleanup یا provider reconciliation واقعی نیست.

## معماری

- `validateM166Cancellation`: requester، reason، state، tenant، approval و force.
- `decideM166Checkpoint`: task state، checkpoint، side-effect class، cancel-safe و lease revoke.
- `decideM166Compensation`: action، idempotency، no-new-side-effects و rollback evidence.
- `validateM166Cleanup`: process/volume/network counts، secret purge، tenant و evidence.

Local-first cleanup باید process، volume، network lease و artifact را enumerate کند؛ untrusted code فقط
در sandbox لغو می‌شود. force cancellation برای side effect خارجی بدون approval مجاز نیست و production
deploy یا remote mutation با cancellation خودکار rollback فرض نمی‌شود.

## sprint plan

### Sprint A — Cancellation protocol

request، authorization، state machine، signal و idempotency.

### Sprint B — Checkpoint/lease

checkpoint، worker fencing، lease revoke و safe-point.

### Sprint C — Compensation

reversible action، saga step، external reconciliation و approval.

### Sprint D — Cleanup evidence

process/volume/network sweep، secret purge، artifact manifest و failure drill.

## Threat Model

- **Cancellation race:** state machine، fencing و idempotency.
- **Partial side effect:** checkpoint، compensation و reconciliation.
- **Force abuse:** approval و external-side-effect gate.
- **Cleanup omission:** enumerated resource evidence و secret purge.
- **Tenant cross-talk:** run/task/checkpoint/cleanup tenant match.
- **False rollback claim:** external action فقط با provider evidence reversible اعلام می‌شود.

## prompt pack

### `m166-cancellation-engineer`

```text
نقش: Cancellation و Compensation Engineer

cancel request را با tenant، requester، reason، approval و state معتبر admit کن. قبل از توقف task،
checkpoint و lease revoke را ثبت کن. برای side effect reversible compensation idempotent بساز؛ برای
external effect rollback را فرض نکن و cleanup process/volume/network/secret را evidence کن.
```

### `m166-cancellation-auditor`

```text
نقش: Cancellation Auditor

race، stale worker، partial side effect، force abuse، cleanup leak، secret residue و fake rollback را
بررسی کن. تغییر state در memory یا kill process بدون resource evidence جای cancellation runtime واقعی نیست.
```

## DoD و production evidence boundary

- cancellation request، running checkpoint، compensation، external-side-effect denial و cleanup تست شوند.
- controller، signal bus، lease/checkpoint store، compensation worker، sandbox cleanup و provider reconciliation باید متصل شوند.
- kernel M166 به‌تنهایی cancellation latency، no-data-loss، rollback completeness یا cleanup production claim نیست.
