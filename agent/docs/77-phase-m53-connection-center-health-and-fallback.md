# فاز M53: Connection Center، Health، Recovery و Honest Fallback

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-UX-02`، `GAP-UX-05`، `GAP-IG-08`، `GAP-PO-01`، `GAP-SE-08`
**کد kernel:** `src/core/connection-health-runtime.ts`
**تست:** `test/platform-connection-phases.test.ts`

## هدف و مرز

M53 تجربه کاربر را بعد از اتصال کامل می‌کند: connection center، health، scope visibility،
expiry/reconnect، revoke و fallback شفاف. اگر platform unavailable باشد، سیستم باید دقیقاً
بگوید چه چیزی local، BYOK، free-tier، read-only یا deny شده است؛ نباید وانمود کند اتصال خارجی
موفق بوده. این فاز UI، monitoring backend، token refresh worker، real provider health check یا
production incident automation را اجرا نمی‌کند.

## معماری

`ConnectionHealthReport` یک status قابل نمایش با error class، آخرین operation موفق، scope و
userVisibleMessage تولید می‌کند. `FallbackRequest` route را از mode و egress policy جدا می‌کند:
local فقط بدون egress، BYOK/free فقط با consent، و read-only به‌عنوان مسیر محدود. reconnect
relative redirect، user initiation و preserveLocalContext دارد. connection center فقط
connectionهای visible در organization را نشان می‌دهد.

## قراردادهای اصلی

- `decideConnectionHealth`، status، timestamp، error class و reauthorization را به پیام کاربر تبدیل می‌کند.
- `decideFallbackRoute`، local/BYOK/free/read-only/deny را با egress و capability موجود انتخاب می‌کند.
- `planConnectionReconnect`، user initiation، relative redirect و حفظ context را gate می‌کند.
- `validateConnectionCenterScope`، visibility و tenant scope لیست connectionها را بررسی می‌کند.

## sprintها

### Sprint A — Connection Center UX

- list/detail برای platform، owner، scope، mode و last sync
- status healthy/degraded/expired/revoked
- scope diff و user-visible error
- keyboard/RTL/degraded client integration

### Sprint B — Health و Recovery

- provider health probe و timeout
- token expiry/reconnect flow
- revoke/delete propagation
- incident و audit timeline

### Sprint C — Fallback Routing

- local runtime و read-only projection
- BYOK provider با explicit consent
- free-tier provider با quota/cooldown
- deny و honest user messaging

### Sprint D — Operational Integration

- background refresh/check scheduler
- metrics، alert و connection SLO
- migration/export/reconnect drill
- E2E از connection تا action و recovery

## Threat Model

- **False success:** health status فقط با observed evidence healthy می‌شود؛ expired/revoked به‌عنوان connected نمایش داده نمی‌شوند.
- **Hidden egress:** local mode هیچ remote fallback پنهانی ندارد؛ BYOK/free route بدون egress consent انتخاب نمی‌شود.
- **Tenant leakage:** connection center درخواست خارج از visible organization scope را رد می‌کند.
- **Reconnect phishing:** reconnect فقط relative allowlisted redirect و user initiation دارد.
- **Provider outage data loss:** read-only/local context و explicit unavailable state جای retry بی‌نهایت یا ادعای success را می‌گیرد.

## Prompt pack

### `m53-connection-center-engineer`

```text
نقش: Connection Center and Recovery Engineer

status را از observed health evidence بساز و expired/revoked را connected نشان نده. برای
هر platform scope، owner، last sync و خطای قابل‌فهم نمایش بده. local fallback فقط بدون
egress است؛ BYOK/free فقط با consent. reconnect را user-initiated و relative نگه دار و
context محلی را حفظ کن. هیچ failure را با fake success پنهان نکن.
```

### `m53-connection-evidence-gate`

```text
نقش: Connection Health Evidence Gate

برای healthy/degraded/expired/revoked، reconnect، revoke، tenant scope، local/BYOK/free
fallback و read-only degradation، probe output، timestamp، route decision، user-visible
message، command و exit code ثبت کن. kernel decision جای provider monitoring و UI E2E evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای status، expiry، reauth، fallback egress، reconnect، revoke و connection center scope.
- Connection Center UI، provider health check، scheduler، token refresh، monitoring، quota و E2E باید integration شوند.
- fallback route فقط یک تصمیم deterministic است؛ اتصال واقعی، health واقعی، recovery موفق یا UX قابل‌استفاده بدون evidence مستقل `done_tested` نیست.
