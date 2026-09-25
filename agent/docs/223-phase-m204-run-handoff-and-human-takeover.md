# فاز M204: Run Handoff و Human Takeover

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/run-handoff-runtime.ts`
**تست:** `test/next-platform-hardening-phases-16.test.ts`
**gap:** `GAP-CP-24`

## هدف و مرز

M204 کنترل امن pause/resume، انتقال کنترل از agent به انسان، checkpoint identity، lease محدود،
replay-safe resume و termination cleanup را gate می‌کند. این kernel scheduler، checkpoint store،
UI takeover، worker lease یا cleanup coordinator واقعی نیست و به‌تنهایی ادعای human-in-the-loop
production ایجاد نمی‌کند.

## معماری و قرارداد

- `validateM204Control`: state زنده، checkpoint، actor، دلیل، approval، expiry و tenant.
- `decideM204Handoff`: actor مبدأ/مقصد، authority، consent، secret-free state، state match و lease.
- `decideM204Resume`: checkpoint/state، lease، precondition، replay safety و no-duplicate effects.
- `validateM204Termination`: cleanup evidence، نبود lease و zero residual worker.

حالت پیش‌فرض Local-first است؛ handoff فقط capability محدود می‌گیرد و raw password، token یا
secret در checkpoint/receipt ذخیره نمی‌شود. Resume باید idempotent باشد و کد untrusted فقط داخل
sandbox ادامه پیدا کند.

## Threat model

- **Takeover جعلی:** authority hash، consent و tenant match.
- **Resume قدیمی یا replay:** checkpoint/state hash، lease expiry و precondition.
- **اجرای دوباره side effect:** `replaySafe` و `noDuplicateEffects`.
- **نشت secret در checkpoint:** `secretFree` و redaction در integration.
- **رهاشدن worker:** termination proof و zero residual worker.
- **اختیار بی‌انتها:** expiry و `noUnboundedResume`.

## Sprint plan

### Sprint A — Control state

state machine، checkpoint reference، pause request، expiry و audit receipt.

### Sprint B — Handoff

authority، consent، human takeover UI، lease issuance و revoke.

### Sprint C — Resume

replay-safe worker، precondition check، idempotency و bounded continuation.

### Sprint D — Termination

cleanup coordinator، residual scan، lease fencing و evidence replay.

## prompt pack

### `m204-run-controller`

```text
نقش: Run Continuity Engineer
pause/resume را فقط با checkpoint/state hash، lease محدود، approval و tenant proof اجرا کن. handoff
باید consent، authority و secret-free state داشته باشد. resume باید replay-safe و بدون duplicate side effect
باشد و termination باید نبود lease و zero residual worker را اثبات کند.
```

### `m204-takeover-auditor`

```text
نقش: Human Takeover Auditor
fake takeover، stale resume، replay side effect، secret در checkpoint، orphan worker و unbounded autonomy
را بررسی کن. mock checkpoint یا callback جای durable lease، fencing، worker cleanup و UI evidence واقعی نیست.
```

## DoD و production evidence boundary

- pause، invalid handoff، stale resume، duplicate-effect denial و cleanup proof تست شوند.
- run-control store، takeover UI، lease/authority service، checkpoint resume worker و cleanup coordinator متصل شوند.
- kernel M204 به‌تنهایی human approval، resumability، exactly-once، cleanup یا production continuity claim نیست.
