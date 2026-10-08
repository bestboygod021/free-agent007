# فاز M207: Action Simulation و Blast-radius Preview

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/action-simulation-runtime.ts`
**تست:** `test/next-platform-hardening-phases-16.test.ts`
**gap:** `GAP-EX-25`

## هدف و مرز

M207 پیش از هر side effect، snapshot قبل، predicted after، diff قابل‌بررسی، affected resources،
blast radius، reversibility، sandbox و precondition را gate می‌کند. این kernel simulator، snapshot store،
preview UI، apply gateway یا rollback runner واقعی نیست و dry-run به‌تنهایی عدم side effect را ثابت نمی‌کند.

## معماری و قرارداد

- `validateM207Simulation`: input/target، before/after، preview، affected resources، bounded radius، reversibility و sandbox.
- `decideM207Apply`: simulation hash، current state، precondition، scope، review، approval و no unexpected diff.
- `validateM207Diff`: changed resources، redaction، secret-free و reviewability.
- `decideM207Rollback`: reversible plan، approval، precondition، bound و cleanup evidence.

برای تغییرات پرریسک preview باید local و sandboxed باشد؛ connector یا API خارجی بدون approval و
precondition apply نمی‌شود. untrusted code هرگز خارج از sandbox اجرا نمی‌شود.

## Threat model

- **False dry-run:** isolated simulator و side-effect monitor.
- **State drift بین preview و apply:** precondition/current state hash.
- **Blast-radius underestimation:** affected-resource inventory و bounded gate.
- **Secret leakage in diff:** redaction و secret-free evidence.
- **Rollback failure:** reversible plan و cleanup proof.
- **Preview-to-production confusion:** distinct approval/apply boundary.

## Sprint plan

### Sprint A — Snapshot and simulator

read-only snapshot، deterministic fixture، predicted state و side-effect monitor.

### Sprint B — Preview

diff renderer، affected resource graph، blast-radius label و user review.

### Sprint C — Apply gate

precondition lock، scope/approval check، transactional applier و receipt.

### Sprint D — Rollback

rollback plan، compensation، cleanup scan و incident evidence.

## prompt pack

### `m207-simulation-engineer`

```text
نقش: Safe Action Simulation Engineer
قبل از apply، snapshot before، predicted after، diff، affected resources و bounded blast radius بساز.
Simulation باید sandboxed، side-effect-free و reversible باشد؛ apply فقط با precondition، review، approval و no unexpected diff مجاز است.
```

### `m207-blast-radius-auditor`

```text
نقش: Blast-radius Auditor
false dry-run، state drift، hidden resource، secret در diff و rollback failure را تست کن. mock preview یا
flag noSideEffect جای isolated runtime، side-effect monitor، precondition lock و rollback evidence واقعی نیست.
```

## DoD و production evidence boundary

- unbounded simulation، secret-bearing diff، stale precondition و unexpected diff deny شوند.
- simulator، snapshot/diff engine، preview UI، apply gateway و rollback runner متصل شوند.
- kernel M207 به‌تنهایی dry-run safety، blast-radius completeness، reversibility یا rollback production claim نیست.
