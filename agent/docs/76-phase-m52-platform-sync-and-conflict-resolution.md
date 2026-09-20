# فاز M52: Platform Sync، Webhook و Conflict Resolution

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IG-04`، `GAP-IG-08`، `GAP-IG-09`، `GAP-OB-01`
**کد kernel:** `src/core/platform-sync-runtime.ts`
**تست:** `test/platform-connection-phases.test.ts`

## هدف و مرز

M52 اتصال را از یک لینک یک‌طرفه به integration پایدار تبدیل می‌کند: inbound webhook، cursor،
deduplication، outbound delivery، retry و conflict resolution. event هرگز صرفاً به‌دلیل
رسیدن از platform قابل‌اعتماد نیست و باید signature، tenant، provider event ID و cursor
داشته باشد. این فاز webhook receiver، queue، event store و live sync واقعی را اجرا نمی‌کند.

## معماری

`PlatformInboundEvent` یک envelope با providerEventId، payload hash، verified signature،
receivedAt، cursor و attempt است. cursor فقط در همان organization/connection و به‌صورت
monotonic جلو می‌رود. conflict بین source/target با source_wins، target_wins، manual_review
یا merge_preview مشخص می‌شود. outbound event، idempotency، retry bound، Retry-After و egress
consent دارد.

## قراردادهای اصلی

- `decidePlatformInboundEvent`، signature، scope، payload، timestamp، attempt و replay را بررسی می‌کند.
- `advancePlatformCursor`، cursor scope، monotonicity و timestamp ordering را enforce می‌کند.
- `resolvePlatformConflict`، hash/version difference و approval برای manual review را gate می‌کند.
- `validatePlatformOutboundDelivery`، idempotency، retry، Retry-After و egress consent را validate می‌کند.

## sprintها

### Sprint A — Webhook Ingress

- provider signature verification
- event envelope و payload digest
- receiver rate limit و replay dedupe
- quarantine برای event نامعتبر

### Sprint B — Cursor و Sync Engine

- provider cursor storage
- monotonic checkpoint و resume
- backfill و partial outage recovery
- per-connection rate/backoff

### Sprint C — Conflict Model

- source/target version و diff preview
- manual review و approval
- deterministic merge policy
- user notification و audit trail

### Sprint D — Outbound Delivery

- signed customer webhook
- outbox، retry و dead-letter queue
- idempotency و delivery status
- provider contract/E2E tests

## Threat Model

- **Webhook spoofing:** event بدون signature verification وارد sync نمی‌شود؛ provider secret reference raw نیست.
- **Replay و duplicate:** providerEventId، payload hash و cursor برای dedupe لازم است؛ replay دوباره side effect ایجاد نمی‌کند.
- **Cursor rollback:** تغییر organization/connection یا cursor غیر-monotonic رد می‌شود.
- **Conflict overwrite:** source یا target بدون policy/approval جایگزین نمی‌شود؛ manual review مسیر صریح دارد.
- **Webhook abuse:** rate limit، retry bound، max attempts و dead-letter جلوی loop و هزینه ناخواسته را می‌گیرند.

## Prompt pack

### `m52-platform-sync-engineer`

```text
نقش: Platform Sync and Conflict Engineer

هر inbound webhook را untrusted بگیر؛ signature، tenant، providerEventId، payload hash و
cursor را verify کن. cursor فقط monotonic و per-connection جلو برود. duplicate را dedupe
کن. conflict را silent overwrite نکن؛ diff و manual review بده. outbound را با idempotency،
retry bound، egress consent و signed delivery اجرا کن.
```

### `m52-sync-evidence-gate`

```text
نقش: Sync Evidence Gate

برای signature failure، replay dedupe، cursor resume، rate-limit، conflict preview، manual
approval، outbox retry و dead-letter، event fixture، signature artifact، cursor snapshot،
command و exit code ثبت کن. unit event reducer جای webhook/queue/provider evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای signature boundary، dedupe، cursor monotonicity، conflict policy، retry و outbound consent.
- webhook receiver، durable queue/store، provider event replay، backfill و notification باید integration شوند.
- sync سالم، no-loss، exactly-once یا conflict-free بودن بدون evidence بازپخش‌پذیر production `done_tested` نیست.
