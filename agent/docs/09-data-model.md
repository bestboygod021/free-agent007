# مدل داده

فایل: `prisma/schema.prisma` — تست ساختاری: `test/data-model.test.ts`

> **وضعیت اعتبارسنجی Prisma:** دستور `prisma validate` در این محیط اجرا **نشده**
> است. CLI هنگام اجرا باینری `schema-engine` را از `binaries.prisma.sh` دانلود
> می‌کند و آن دامنه از این sandbox در دسترس نیست (خطای دقیق:
> `Client network socket disconnected before secure TLS connection was established`).
> بنابراین صحت دستوری اسکیم به‌صورت ماشین‌بررسی‌شده تأیید نشده است.
>
> به‌جای آن، `test/data-model.test.ts` **قواعد طراحی** اسکیم را با خواندن مستقیم
> فایل بررسی می‌کند (tenant key روی همه جداول، نبود secret خام، `@@map` روی همه
> جدول‌ها، `payloadHash` و انقضای Approval، `promptVersion` و `idempotencyKey` روی
> ToolCall، append-only بودن AuditLog، یکتایی نام پروژه در سطح tenant، و همگامی
> enum `RunState` با `RUN_STATES` در کد).
>
> برای اعتبارسنجی کامل، روی ماشین خودتان:
>
> ```bash
> npm i -D prisma
> npm run prisma:validate
> ```

## شش قاعده طراحی

1. هر جدول tenant-scoped ستون `organizationId` دارد — حتی اگر از طریق join هم
   قابل رسیدن باشد. Row-Level Security به ستون روی همان ردیف نیاز دارد.
2. هیچ secret خامی ذخیره نمی‌شود. `SecretReference` فقط مسیر vault را نگه می‌دارد.
3. هر تغییر وضعیت یک رویداد تغییرناپذیر است؛ جداول فقط وضعیت فعلی را دارند.
4. هر Approval به hash دقیق چیزی که تأیید شده گره خورده و تاریخ انقضا دارد.
5. هر Tool Call نسخه پرامپت را ثبت می‌کند تا Run قابل بازتولید باشد.
6. Audit Log فقط افزودنی است و مسیر حذف برای کاربر عادی ندارد.

## نمودار

```
User ──< OrganizationMember >── Organization
                                    │
              ┌─────────────────────┼──────────────────────┐
              ▼                     ▼                      ▼
           Project              Connector            SecretReference
              │                     │                      │
              ▼                     │                      │
          AgentRun ─────────────────┴──────────────────────┘
              │
    ┌─────────┼──────────┬───────────┬──────────────┐
    ▼         ▼          ▼           ▼              ▼
AgentTask  Approval  ToolCall    TestRun      SystemEvent
              │         │
              ▼         ▼
            User     AuditLog  (append-only)
```

## جدول‌ها

| جدول | نقش | نکته کلیدی |
|---|---|---|
| `users` | هویت | `passwordHash` فقط argon2id؛ برای ورود OAuth-only تهی است |
| `organizations` | tenant | `privacyLevel` و `autonomy` پیش‌فرض کل Workspace |
| `organization_members` | نقش‌ها | `@@id([organizationId, userId])` |
| `projects` | پروژه | `@@unique([organizationId, name])` — یکتایی در tenant، نه سراسری |
| `agent_runs` | یک اجرا | `planHash`، `repairAttempts`، `hardStopTokens`، `workingBranch` |
| `agent_tasks` | تسک | `allowedPaths`، `lockedPaths`، `definitionOfDone`، `assignedAgent` |
| `connectors` | اتصال | `scopes`، `expiresAt`، `commercialLicense` |
| `secret_references` | ارجاع به vault | **هیچ ستون value ندارد** |
| `approvals` | تأیید انسانی | `payloadHash`، `expiresAt`، `decidedBy` |
| `tool_calls` | هر فراخوانی ابزار | `promptVersion`، `inputHash`، `idempotencyKey @unique` |
| `audit_logs` | رد پای تغییرناپذیر | `ipHash` نه آدرس خام؛ بدون relation به User |
| `test_runs` | شواهد اجرا | `command`، `exitCode`، `logsRef` |
| `system_events` | جریان رویداد | `eventId @unique`، `schemaVersion`، `redacted` |

## چرا `planHash`

تأیید کاربر باید به **همان نسخه‌ای** از Plan گره بخورد که دیده است. اگر
Orchestrator پس از تأیید Plan را تغییر دهد، hash عوض می‌شود و تأیید قبلی
بی‌اعتبار است. بدون این، «کاربر تأیید کرد» یک ادعای بی‌معناست.

## چرا `idempotencyKey` روی ToolCall

Worker ممکن است بمیرد و دوباره همان کار را از صف بردارد. بدون کلید یکتا، نتیجه
دو Pull Request، دو پیام یا دو پرداخت است. کلید از
`runId + taskId + tool + inputHash` ساخته می‌شود.

## چرا `promptVersion`

یک Run قدیمی باید قابل بازتولید باشد. بدون نسخه پرامپت، نمی‌توان فهمید کدام
نسخه از پرامپت این خروجی را تولید کرده و یک regression در پرامپت قابل ردیابی
نیست.

## چرا `AuditLog` به `User` وصل نیست

حذف یک حساب کاربری نباید شواهد را پاک کند. `audit_logs` فقط `actorType` و
`actorId` را به‌صورت مقدار نگه می‌دارد، بدون رابطه و بدون cascade. این در تست
بررسی می‌شود.

## Enumها

`RunState` دقیقاً با `RUN_STATES` در `src/core/state-machine.ts` همگام است و این
همگامی در تست اثبات می‌شود — اگر یک حالت به ماشین حالت اضافه شود و به اسکیم
اضافه نشود، تست می‌شکند.

## RLS و migration مرجع

دو migration مرجع اکنون در `prisma/migrations/` وجود دارد:

- `202609090001_init/migration.sql`: DDL کامل ۱۳ جدول، enumها، indexها، FKها و trigger مربوط به `updated_at`.
- `202609090002_tenant_rls/migration.sql`: RLS برای `organizations` و همه جدول‌های tenant-scoped، parent-child same-tenant trigger و streamهای append-only.

API باید بلافاصله بعد از گرفتن connection و در همان transaction این setting را با
پارامتر، نه interpolation، تنظیم کند:

```sql
select set_config('app.organization_id', $1, true);
```

پارامتر `true` باعث می‌شود setting در پایان transaction حذف شود و از pool به
درخواست tenant بعدی نشت نکند. `src/core/tenant-context.ts` فقط command
پارامتری‌شده تولید می‌کند؛ هویت tenant باید از membership احراز‌شده بیاید و
هرگز از body یا README خارجی پذیرفته نشود.

RLS در این مرحله reference و static-contract tested است؛ اجرای واقعی migration و
cross-tenant probe روی PostgreSQL هنوز به CI و database adapter متصل نشده است.
RLS لایه دوم دفاع است و جایگزین authorization، audit و policy engine نیست.

## نگهداری و حذف داده

| رویداد | رفتار |
|---|---|
| حذف کاربر | PII از `users` پاک می‌شود؛ `audit_logs` بی‌نام باقی می‌ماند |
| حذف سازمان | cascade کامل روی همه جداول tenant-scoped |
| پایان Run | artifactها پس از دوره نگهداری (پیش‌فرض ۹۰ روز) حذف می‌شوند |
| لغو اتصال کانکتور | توکن همان لحظه باطل و `SecretReference` حذف می‌شود |
| درخواست کاربر برای حذف | صف حذف با تأیید دو مرحله‌ای و گزارش انجام |
