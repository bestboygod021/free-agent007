# API و رویدادها

## اصل

API عمومی REST + OpenAPI است تا CLI، موبایل و دسکتاپ کلاینت یکسانی داشته باشند.
ارتباط داخلی وب با tRPC. رویدادهای زنده در MVP با SSE.

## پروژه‌ها

```http
POST   /v1/projects
GET    /v1/projects
GET    /v1/projects/:projectId
PATCH  /v1/projects/:projectId
DELETE /v1/projects/:projectId
```

## اجرای ایجنت

```http
POST   /v1/projects/:projectId/runs
GET    /v1/runs/:runId
GET    /v1/runs/:runId/events        # SSE
POST   /v1/runs/:runId/pause
POST   /v1/runs/:runId/resume
POST   /v1/runs/:runId/cancel
GET    /v1/runs/:runId/artifacts
```

بدنه `POST /runs`:

```json
{
  "request": "یک فروشگاه چندزبانه با پنل مدیریت و پرداخت بساز",
  "computeMode": "local",
  "privacyLevel": "private",
  "autonomyLevel": "supervised",
  "budget": { "maxCostPerRun": 0 },
  "modelPreferences": { "localModel": "qwen2.5-coder:14b" },
  "repository": { "provider": "github", "url": "…", "baseBranch": "main" },
  "consents": { "cloudEgress": false, "providerMayTrainOnInput": false }
}
```

`computeMode` اجباری است و یکی از `free | paid | local`. کل Run از روی آن
پیکربندی می‌شود — قرارداد کامل در
[`docs/15-compute-modes.md`](./15-compute-modes.md) و
`schema/run-request.schema.json`.

## تأیید

```http
GET    /v1/runs/:runId/approvals
POST   /v1/approvals/:approvalId/approve
POST   /v1/approvals/:approvalId/reject
```

پاسخ `GET approvals` باید برای هر مورد نشان دهد: چه کاری، با چه scope، چه ریسکی،
آیا برگشت‌پذیر است، چرا لازم است، و **چه زمانی منقضی می‌شود**.

## کانکتورها

```http
GET    /v1/connectors
POST   /v1/connectors/:provider/connect
GET    /v1/connectors/:provider/callback
POST   /v1/connectors/:connectorId/revoke
GET    /v1/connectors/:connectorId/audit
GET    /v1/connectors/:connectorId/health
```

## مخزن

```http
GET    /v1/projects/:projectId/repository/tree
GET    /v1/projects/:projectId/repository/diff?runId=…
POST   /v1/projects/:projectId/branches
POST   /v1/projects/:projectId/pull-requests
```

## Webhook

```http
POST   /v1/webhooks/github
```

با اعتبارسنجی امضا، رد کردن رویداد تکراری با Idempotency-Key، و پاسخ سریع
`202` قبل از پردازش.

## قواعد عمومی

| قاعده | اجرا |
|---|---|
| احراز هویت | همه endpointها جز callback و webhook |
| مالکیت | بررسی در backend؛ `organizationId` از session، نه از body |
| Rate limit | بر اساس user و organization، با هدرهای استاندارد |
| Idempotency | `Idempotency-Key` برای همه POSTهای side-effect دار |
| نسخه | `/v1` در مسیر؛ شکستن قرارداد یعنی `/v2` |
| خطا | RFC 7807 problem+json با کد پایدار و پیام قابل نمایش |
| Pagination | cursor-based، حداکثر ۱۰۰ |
| Validation | zod در مرز، با پیام فارسی برای کاربر |

## واژگان رویداد

`schema/event.schema.json` — نمونه: `examples/event.json`

```
project.created
run.created
run.state_changed
requirements.clarification_requested
spec.generated
plan.generated
approval.requested | approval.granted | approval.rejected
task.created | task.started | task.completed | task.blocked
tool.call.proposed | tool.call.started | tool.call.completed | tool.call.denied
file.changed
commit.created
test.started | test.completed
repair.started | repair.exhausted
security.scan.completed
preview.created
deployment.approval_requested | deployment.started | deployment.completed | deployment.failed
model.routed
quota.exhausted
run.failed | run.completed | run.cancelled
```

## ساختار رویداد

```json
{
  "eventId": "evt_01j8zx4k2m9q",
  "schemaVersion": 1,
  "tenantId": "org_7f3a",
  "runId": "run_8f2c",
  "type": "tool.call.proposed",
  "timestamp": "2026-09-08T10:00:00.000Z",
  "actorType": "agent",
  "actorId": "agent:backend-engineer",
  "parentEventId": "evt_01j8zx4j8p1r",
  "payload": { "…": "…" },
  "redacted": true
}
```

`schemaVersion` با `const: 1` قفل شده است؛ bump کردن آن یعنی یک migration برای
مصرف‌کننده‌ها. `redacted: true` یعنی payload پیش از ذخیره از
`redactPayload` عبور کرده است.

## UI به‌عنوان projection

داشبورد هیچ وضعیت مستقلی ندارد؛ هر چه می‌بینید بازسازی جریان رویداد است. این دو
فایده دارد:

1. اگر اتصال SSE قطع شود، با replay از `lastEventId` دقیقاً همان وضعیت برمی‌گردد
2. هر باگ در UI با نگاه کردن به رویدادها قابل تشخیص است

## خطاها

```json
{
  "type": "https://forgepilot.dev/errors/approval-required",
  "title": "این عملیات نیاز به تأیید دارد",
  "status": 403,
  "detail": "ساخت Pull Request یک نوشتن بیرونی است و در سطح دسترسی supervised به تأیید نیاز دارد.",
  "instance": "/v1/runs/run_8f2c/approvals",
  "code": "approval_required",
  "approvalId": "apr_91kd"
}
```

پیام خطا باید بگوید **چرا** و **چطور حل می‌شود**. «خطای ناشناخته» یک باگ محصول
است، نه یک پاسخ.
