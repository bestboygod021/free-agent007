# گراف تسک و زمان‌بندی

پیاده‌سازی: `src/core/task-dag.ts` — تست: `test/task-dag.test.ts`

## ساختار تسک

`schema/task.schema.json` — نمونه: `examples/task.backend-auth.json`

```jsonc
{
  "taskId": "task_backend_auth",
  "title": "Implement authenticated project creation API",
  "type": "backend",
  "objective": "…",
  "acceptanceCriteria": ["…"],          // حداقل یک مورد، الزامی
  "allowedPaths": ["apps/api/**", "tests/api/**"],
  "forbiddenActions": ["push to main", "modify production secrets"],
  "dependencies": ["task_database_schema"],
  "riskLevel": "medium",
  "approvalRequired": false,
  "definitionOfDone": ["lint", "typecheck", "test:unit", "secret-scan"],
  "estimatedTokens": 24000
}
```

`taskId` باید با `^task_[a-z0-9_]{1,64}$` مطابقت کند. این محدودیت عمدی است:
شناسه‌ها در لاگ، در قفل فایل و در diff دیده می‌شوند و باید قابل جست‌وجو باشند.

## اعتبارسنجی گراف

`validateDag` چهار خطا را تشخیص می‌دهد:

| کد | معنا |
|---|---|
| `unknown_dependency` | ارجاع به تسکی که وجود ندارد |
| `self_dependency` | تسک به خودش وابسته است |
| `cycle` | دور — با نام تسک‌های درگیر |
| `duplicate_task_id` | شناسه تکراری |

یک Plan با هرکدام از این خطاها **اجرا نمی‌شود**. این بررسی قبل از هر نوشتن روی
مخزن انجام می‌شود.

## زمان‌بندی

`computeWaves` تسک‌ها را به موج‌های موازی تقسیم می‌کند: موج ۰ بدون وابستگی، موج n
فقط به موج‌های قبلی وابسته. اگر گراف دور داشته باشد، تابع آرایه خالی برمی‌گرداند
و هرگز حلقه بی‌نهایت نمی‌زند.

## قفل فایل

دو تسک در یک موج نباید مسیر هم‌پوشان داشته باشند. `patternsOverlap` الگوها را به
پیشوند معنادار تجزیه می‌کند:

```
apps/web/app/(auth)/**  →  [apps, web, app, (auth)]
packages/ui/**          →  [packages, ui]
README.md               →  [README.md]
```

و رابطه پیشوندی را می‌سنجد. این سنجش **عمداً محافظه‌کار** است:

| الگو A | الگو B | تداخل؟ |
|---|---|---|
| `apps/api/**` | `apps/api/src/modules/payments/**` | بله |
| `packages/ui/**` | `packages/ui/button.tsx` | بله |
| `**` | هر چیزی | بله |
| `apps/web/**` | `apps/api/**` | خیر |
| `tests/**` | `docs/**` | خیر |

گزارش تداخل بیش از حد واقعی، یک مرحله سریال اضافه می‌کند. گزارش نکردن تداخل،
یک branch خراب تحویل می‌دهد.

## رفع تداخل

`serializeConflicts` تسک بزرگ‌تر (از نظر ترتیب واژه‌نامه‌ای) را به موج بعدی
منتقل می‌کند و آن‌قدر تکرار می‌کند تا هیچ تداخلی نماند. خروجی قطعی است و هیچ
تسکی گم نمی‌شود.

### نمونه واقعی از `examples/plan.json`

در موج ۴ این دو تسک قرار می‌گیرند:

- `task_backend_catalog_api` با `["apps/api/src/modules/catalog/**", "tests/api/**"]`
- `task_integration_payment` با `["apps/api/src/modules/payments/**", "tests/api/**"]`

مسیرهای `apps/api/src/modules/catalog` و `.../payments` جدا هستند، اما هر دو
`tests/api/**` را قفل کرده‌اند. `findWaveConflicts` این را می‌گیرد و
`serializeConflicts` تسک `task_integration_payment` را به موج بعد منتقل می‌کند.
این رفتار در `test/task-dag.test.ts` روی همان فایل example اجرا و اثبات شده است.

## موازی در برابر ترتیبی

**قابل موازی‌سازی:**

- UI اولیه و مدل دیتابیس (اگر مسیرها جدا باشند)
- تست‌های مستقل
- مستندات API و مستندات کاربر
- scaffold بخش‌های جدا

**حتماً ترتیبی:**

- تحلیل مخزن قبل از هر تغییر
- migration قبل از تست دیتابیس
- backend API قبل از integration نهایی
- build قبل از deploy
- security review قبل از production

## حد بودجه

هر تسک `estimatedTokens` دارد و هر Plan یک `hardStopAtTokens`. وقتی مصرف Run از
حد سخت بگذرد، Run متوقف می‌شود و رویداد `quota.exhausted` منتشر می‌شود. ایجنت
اجازه ندارد برای «تمام کردن کار» از حد بگذرد.
