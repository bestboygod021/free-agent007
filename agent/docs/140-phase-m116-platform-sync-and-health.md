# فاز M116: Platform Sync، Conflict Resolution و Connection Health

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IG-04`، `GAP-IG-07`، `GAP-IG-08`، `GAP-IG-09`، `GAP-PO-01`
**کد kernel:** `src/core/platform-sync-health-runtime.ts`
**تست:** `test/next-governance-integration-phases.test.ts`

## هدف و مرز

M116 sync connection، cursor/dedupe، conflict resolution و health/fallback را formalize می‌کند.
connection باید consent، scope، webhook signature، cursor namespace و local fallback داشته باشد.
cursor monotonic و dedupe-aware است. conflict permission به auto-merge سپرده نمی‌شود. degraded یا
revoked connection باید fallback و reconnect evidence بدهد. این فاز sync worker، outbox، conflict
UI، webhook receiver، persistent cursor store یا provider connector واقعی را اجرا نمی‌کند.

## معماری

`M116SyncConnectionContract` direction، scope، credential reference، consent، webhook، cursor و
fallback را نگه می‌دارد. `M116SyncCursorContract` provider cursor، local sequence، event hash، dedupe
window و monotonicity را ثبت می‌کند. `M116ConflictRecord` versions/hashes، kind، resolution، human
review و redaction را gate می‌کند. `M116ConnectionHealthEvidence` state، failures، latency، retry و
fallback را جمع می‌کند.

## قراردادهای اصلی

- `validateM116Connection`: consent، webhook، opaque credential، revoke و bidirectional fallback را validate می‌کند.
- `validateM116Cursor`: provider/local cursor، sequence، dedupe و monotonicity را بررسی می‌کند.
- `decideM116Conflict`: version/hash، redaction، human review و permission merge را gate می‌کند.
- `validateM116Health`: state، latency، failures، Retry-After، revoke و fallback را enforce می‌کند.

## sprintها

### Sprint A — Sync Contract

- pull/push/bidirectional direction
- scope/consent
- cursor namespace
- webhook signature

### Sprint B — Cursor/Outbox

- monotonic cursor
- sequence
- dedupe window
- retry/outbox

### Sprint C — Conflicts

- version conflict
- permission/delete conflict
- merge review
- audit resolution

### Sprint D — Health

- latency/failure probe
- reconnect/cooldown
- revoke confirmation
- local/read-only fallback

## Threat Model

- **Duplicate sync:** cursor monotonic و dedupe window اجباری است.
- **Conflict data leak:** conflict data redacted می‌شود.
- **Permission overreach:** permission conflict auto-merge نمی‌شود.
- **Stale connection:** health state و revoke confirmation قبل از write لازم است.
- **Outage data loss:** fallback و retry evidence باید ثبت شود.

## Prompt pack

### `m116-sync-health-engineer`

```text
نقش: Platform Sync and Health Engineer

connection را با direction، scope، consent، webhook verification، cursor namespace، opaque
credential و fallback بساز. cursor باید provider/local sequence، event hash، dedupe و monotonicity
داشته باشد. conflict permission را auto-merge نکن؛ health، retry/revoke و fallback را ثبت کن.
```

### `m116-sync-evidence-gate`

```text
نقش: Sync Evidence Gate

برای connection، cursor، conflict و health، scope/consent، sequence/hash، dedupe، versions،
resolution، latency، Retry-After، fallback، command و exit code ثبت کن. fake cursor یا one-shot webhook
جای outbox، sync worker، conflict UI و provider E2E evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای connection، cursor، conflict و health.
- webhook receiver، sync worker/outbox، persistent cursor/dedupe store، conflict UI و connector E2E باید integration شوند.
- kernel M116 به‌تنهایی cross-platform sync، conflict safety یا connection recovery production را ثابت نمی‌کند و `done_tested` نیست.
