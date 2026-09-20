# قرارداد اجرایی ۱۰۰ پیشنهاد ارتقای ForgePilot

این سند از [docs/upgrade-register.json](./upgrade-register.json) ساخته می‌شود؛ منبع حقیقت ماشین‌خوان همان رجیستر است و این فایل با `npm run render:upgrades` بازتولید می‌شود. هر پیشنهاد باید هدف، مسئله، ورودی/خروجی، Interface یا Schema، محل پیاده‌سازی، وابستگی، مرز و تهدید امنیتی، تست و Definition of Done داشته باشد.

**نسخه رجیستر:** 1.3.0

**تاریخ رجیستر:** 2026-09-10

**تعداد:** 100

## واژگان وضعیت

| وضعیت | معنی |
|---|---|
| `designed_only` | طراحی اجرایی کامل است؛ کدنویسی شروع نشده |
| `scaffolded` | اسکلت/قرارداد کد وجود دارد؛ رفتار کامل و production-ready نیست |
| `partial` | بخشی از کد واقعی و تست وجود دارد؛ قابلیت کامل یا durable نیست |
| `done_tested` | قابلیت کامل با تست و evidence واقعی تأیید شده است |

### 1. API مرکزی محصول — UP-001

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| زیرساخت و API | P0 | `partial` | `in_progress` |

**هدف:**
- مرز کنترل مرکزی برای Run، Task، Approval، Audit و Artifact؛ Request فقط اعتبارسنجی و Job ایجاد می‌کند.

**مسئله‌ای که حل می‌کند:**
- قرارداد و مرز اجرایی این قابلیت بین API، worker و persistence صریح نیست؛ در نتیجه تغییرات ناسازگار، نشت tenant یا side effect بدون audit ممکن می‌شود. موضوع این پیشنهاد، «API مرکزی محصول»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- مرز کنترل مرکزی برای Run، Task، Approval، Audit و Artifact؛ Request فقط اعتبارسنجی و Job ایجاد می‌کند.

**ورودی‌ها:**
- organization/project، authentication context، Run command

**خروجی‌ها:**
- Endpointهای نسخه‌گذاری‌شده با Error contract و idempotency key

**Interface / Schema:**
- UP-001 / API مرکزی محصول: TypeScript interface versioned با ورودی tenant/auth، payload محدود، result envelope و RFC 7807 error؛ JSON Schema متناظر باید در schema/ نگهداری شود.
- Schema باید inputs=organization/project، authentication context، Run command و outputs=Endpointهای نسخه‌گذاری‌شده با Error contract و idempotency key را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- apps/api/ برای transport؛ src/core/ برای invariant؛ schema/ برای قرارداد؛ prisma/ برای persistence؛ test/ برای contract و isolation.
- ماژول اختصاصی planned: src/core/upgrades/up-001.ts؛ fixture و تست: test/up-001.test.ts

**وابستگی‌ها:** ندارد

**مرزهای امنیتی:**
- تفکیک Tenant و جلوگیری از اجرای مستقیم ابزار از مسیر API

**تهدیدهای امنیتی:**
- تجاوز tenant، replay mutation، افشای secret در response، و اجرای مستقیم کد غیرقابل‌اعتماد از مسیر control plane.
- تهدید اختصاصی UP-001: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «API مرکزی محصول» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای validation و state؛ contract برای OpenAPI/event؛ integration با دو tenant؛ negative برای auth، idempotency و audit.
- تست اختصاصی UP-001: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- API contract test، تست cross-tenant و ثبت Audit برای هر mutation

**Definition of Done:**
- Interface و schema versioned merge شده، مسیر موفق و خطا evidence واقعی دارد، تست cross-tenant و replay پاس است، و هیچ raw password یا deploy بدون approval وجود ندارد.
- UP-001 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- apps/api/server.ts

### 2. وب‌اپ مستقل — UP-002

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| زیرساخت و API | P0 | `partial` | `in_progress` |

**هدف:**
- رابط Web برای پروژه، DAG، تنظیمات، Approval، Diff و Audit؛ Playground فقط Demo باقی می‌ماند.

**مسئله‌ای که حل می‌کند:**
- قرارداد و مرز اجرایی این قابلیت بین API، worker و persistence صریح نیست؛ در نتیجه تغییرات ناسازگار، نشت tenant یا side effect بدون audit ممکن می‌شود. موضوع این پیشنهاد، «وب‌اپ مستقل»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- رابط Web برای پروژه، DAG، تنظیمات، Approval، Diff و Audit؛ Playground فقط Demo باقی می‌ماند.

**ورودی‌ها:**
- API client، session، locale

**خروجی‌ها:**
- صفحه‌های قابل دسترسی با SSE برای Run و بدون inline script

**Interface / Schema:**
- UP-002 / وب‌اپ مستقل: TypeScript interface versioned با ورودی tenant/auth، payload محدود، result envelope و RFC 7807 error؛ JSON Schema متناظر باید در schema/ نگهداری شود.
- Schema باید inputs=API client، session، locale و outputs=صفحه‌های قابل دسترسی با SSE برای Run و بدون inline script را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- apps/api/ برای transport؛ src/core/ برای invariant؛ schema/ برای قرارداد؛ prisma/ برای persistence؛ test/ برای contract و isolation.
- ماژول اختصاصی planned: src/core/upgrades/up-002.ts؛ fixture و تست: test/up-002.test.ts

**وابستگی‌ها:** UP-001

**مرزهای امنیتی:**
- CSP سخت‌گیرانه و عدم نمایش Secret

**تهدیدهای امنیتی:**
- تجاوز tenant، replay mutation، افشای secret در response، و اجرای مستقیم کد غیرقابل‌اعتماد از مسیر control plane.
- تهدید اختصاصی UP-002: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «وب‌اپ مستقل» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای validation و state؛ contract برای OpenAPI/event؛ integration با دو tenant؛ negative برای auth، idempotency و audit.
- تست اختصاصی UP-002: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- Smoke E2E برای Login تا مشاهده Run

**Definition of Done:**
- Interface و schema versioned merge شده، مسیر موفق و خطا evidence واقعی دارد، تست cross-tenant و replay پاس است، و هیچ raw password یا deploy بدون approval وجود ندارد.
- UP-002 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/control-plane-contract.ts
- test/audit-next-phases.test.ts

### 3. Prisma migrations — UP-003

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| زیرساخت و API | P0 | `partial` | `in_progress` |

**هدف:**
- ساختار دیتابیس با migrationهای append-only و seed نسخه‌دار بین محیط‌ها همسان شود.

**مسئله‌ای که حل می‌کند:**
- قرارداد و مرز اجرایی این قابلیت بین API، worker و persistence صریح نیست؛ در نتیجه تغییرات ناسازگار، نشت tenant یا side effect بدون audit ممکن می‌شود. موضوع این پیشنهاد، «Prisma migrations»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- ساختار دیتابیس با migrationهای append-only و seed نسخه‌دار بین محیط‌ها همسان شود.

**ورودی‌ها:**
- schema version، database URL

**خروجی‌ها:**
- migration artifact و checksum

**Interface / Schema:**
- UP-003 / Prisma migrations: TypeScript interface versioned با ورودی tenant/auth، payload محدود، result envelope و RFC 7807 error؛ JSON Schema متناظر باید در schema/ نگهداری شود.
- Schema باید inputs=schema version، database URL و outputs=migration artifact و checksum را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- apps/api/ برای transport؛ src/core/ برای invariant؛ schema/ برای قرارداد؛ prisma/ برای persistence؛ test/ برای contract و isolation.
- ماژول اختصاصی planned: src/core/upgrades/up-003.ts؛ fixture و تست: test/up-003.test.ts

**وابستگی‌ها:** UP-001

**مرزهای امنیتی:**
- اجرای migration بدون حذف مخرب و با approval

**تهدیدهای امنیتی:**
- تجاوز tenant، replay mutation، افشای secret در response، و اجرای مستقیم کد غیرقابل‌اعتماد از مسیر control plane.
- تهدید اختصاصی UP-003: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Prisma migrations» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای validation و state؛ contract برای OpenAPI/event؛ integration با دو tenant؛ negative برای auth، idempotency و audit.
- تست اختصاصی UP-003: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- Migration روی دیتابیس خالی و backup restore آزمایش شود

**Definition of Done:**
- Interface و schema versioned merge شده، مسیر موفق و خطا evidence واقعی دارد، تست cross-tenant و replay پاس است، و هیچ raw password یا deploy بدون approval وجود ندارد.
- UP-003 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- prisma/migrations/202609090001_init/migration.sql
- test/tenant-context.test.ts

### 4. SQL Row-Level Security — UP-004

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| زیرساخت و API | P0 | `partial` | `in_progress` |

**هدف:**
- Tenant boundary در خود PostgreSQL با policyهای organization/project اعمال شود.

**مسئله‌ای که حل می‌کند:**
- قرارداد و مرز اجرایی این قابلیت بین API، worker و persistence صریح نیست؛ در نتیجه تغییرات ناسازگار، نشت tenant یا side effect بدون audit ممکن می‌شود. موضوع این پیشنهاد، «SQL Row-Level Security»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Tenant boundary در خود PostgreSQL با policyهای organization/project اعمال شود.

**ورودی‌ها:**
- tenant context، role

**خروجی‌ها:**
- RLS policy و query test

**Interface / Schema:**
- UP-004 / SQL Row-Level Security: TypeScript interface versioned با ورودی tenant/auth، payload محدود، result envelope و RFC 7807 error؛ JSON Schema متناظر باید در schema/ نگهداری شود.
- Schema باید inputs=tenant context، role و outputs=RLS policy و query test را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- apps/api/ برای transport؛ src/core/ برای invariant؛ schema/ برای قرارداد؛ prisma/ برای persistence؛ test/ برای contract و isolation.
- ماژول اختصاصی planned: src/core/upgrades/up-004.ts؛ fixture و تست: test/up-004.test.ts

**وابستگی‌ها:** UP-001, UP-003

**مرزهای امنیتی:**
- هیچ query application به‌تنهایی مجاز به انتخاب Tenant نباشد

**تهدیدهای امنیتی:**
- تجاوز tenant، replay mutation، افشای secret در response، و اجرای مستقیم کد غیرقابل‌اعتماد از مسیر control plane.
- تهدید اختصاصی UP-004: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «SQL Row-Level Security» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای validation و state؛ contract برای OpenAPI/event؛ integration با دو tenant؛ negative برای auth، idempotency و audit.
- تست اختصاصی UP-004: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- تست cross-tenant روی endpoint واقعی باید fail شود

**Definition of Done:**
- Interface و schema versioned merge شده، مسیر موفق و خطا evidence واقعی دارد، تست cross-tenant و replay پاس است، و هیچ raw password یا deploy بدون approval وجود ندارد.
- UP-004 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- prisma/migrations/202609090002_tenant_rls/migration.sql
- test/tenant-context.test.ts

### 5. OpenAPI — UP-005

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| زیرساخت و API | P0 | `partial` | `in_progress` |

**هدف:**
- قرارداد تمام endpointها، eventها، Errorها و pagination در OpenAPI نگهداری و از آن client تولید شود.

**مسئله‌ای که حل می‌کند:**
- قرارداد و مرز اجرایی این قابلیت بین API، worker و persistence صریح نیست؛ در نتیجه تغییرات ناسازگار، نشت tenant یا side effect بدون audit ممکن می‌شود. موضوع این پیشنهاد، «OpenAPI»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- قرارداد تمام endpointها، eventها، Errorها و pagination در OpenAPI نگهداری و از آن client تولید شود.

**ورودی‌ها:**
- route registry، JSON schema

**خروجی‌ها:**
- openapi.yaml و generated client

**Interface / Schema:**
- UP-005 / OpenAPI: TypeScript interface versioned با ورودی tenant/auth، payload محدود، result envelope و RFC 7807 error؛ JSON Schema متناظر باید در schema/ نگهداری شود.
- Schema باید inputs=route registry، JSON schema و outputs=openapi.yaml و generated client را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- apps/api/ برای transport؛ src/core/ برای invariant؛ schema/ برای قرارداد؛ prisma/ برای persistence؛ test/ برای contract و isolation.
- ماژول اختصاصی planned: src/core/upgrades/up-005.ts؛ fixture و تست: test/up-005.test.ts

**وابستگی‌ها:** UP-001

**مرزهای امنیتی:**
- عدم افشای فیلدهای داخلی و Secret در schema

**تهدیدهای امنیتی:**
- تجاوز tenant، replay mutation، افشای secret در response، و اجرای مستقیم کد غیرقابل‌اعتماد از مسیر control plane.
- تهدید اختصاصی UP-005: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «OpenAPI» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای validation و state؛ contract برای OpenAPI/event؛ integration با دو tenant؛ negative برای auth، idempotency و audit.
- تست اختصاصی UP-005: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- Contract test بین API و schema

**Definition of Done:**
- Interface و schema versioned merge شده، مسیر موفق و خطا evidence واقعی دارد، تست cross-tenant و replay پاس است، و هیچ raw password یا deploy بدون approval وجود ندارد.
- UP-005 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- openapi.yaml

### 6. Job Queue — UP-006

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| زیرساخت و API | P0 | `partial` | `in_progress` |

**هدف:**
- کار طولانی در Queue با retry، timeout، backoff و Dead Letter Queue اجرا شود.

**مسئله‌ای که حل می‌کند:**
- قرارداد و مرز اجرایی این قابلیت بین API، worker و persistence صریح نیست؛ در نتیجه تغییرات ناسازگار، نشت tenant یا side effect بدون audit ممکن می‌شود. موضوع این پیشنهاد، «Job Queue»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- کار طولانی در Queue با retry، timeout، backoff و Dead Letter Queue اجرا شود.

**ورودی‌ها:**
- job payload، budget، dedupe key

**خروجی‌ها:**
- job state و worker lease

**Interface / Schema:**
- UP-006 / Job Queue: TypeScript interface versioned با ورودی tenant/auth، payload محدود، result envelope و RFC 7807 error؛ JSON Schema متناظر باید در schema/ نگهداری شود.
- Schema باید inputs=job payload، budget، dedupe key و outputs=job state و worker lease را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- apps/api/ برای transport؛ src/core/ برای invariant؛ schema/ برای قرارداد؛ prisma/ برای persistence؛ test/ برای contract و isolation.
- ماژول اختصاصی planned: src/core/upgrades/up-006.ts؛ fixture و تست: test/up-006.test.ts

**وابستگی‌ها:** UP-001

**مرزهای امنیتی:**
- توقف Queue نباید باعث اجرای دوباره side effect شود

**تهدیدهای امنیتی:**
- تجاوز tenant، replay mutation، افشای secret در response، و اجرای مستقیم کد غیرقابل‌اعتماد از مسیر control plane.
- تهدید اختصاصی UP-006: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Job Queue» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای validation و state؛ contract برای OpenAPI/event؛ integration با دو tenant؛ negative برای auth، idempotency و audit.
- تست اختصاصی UP-006: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- تست crash worker و replay امن

**Definition of Done:**
- Interface و schema versioned merge شده، مسیر موفق و خطا evidence واقعی دارد، تست cross-tenant و replay پاس است، و هیچ raw password یا deploy بدون approval وجود ندارد.
- UP-006 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/job-queue.ts
- src/core/worker-boundary.ts
- test/job-queue.test.ts
- test/worker-boundary.test.ts

### 7. Event Bus — UP-007

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| زیرساخت و API | P1 | `partial` | `in_progress` |

**هدف:**
- تغییرات Run و Tool به Eventهای versioned تبدیل شود تا UI، Audit و Notification مستقل باشند.

**مسئله‌ای که حل می‌کند:**
- قرارداد و مرز اجرایی این قابلیت بین API، worker و persistence صریح نیست؛ در نتیجه تغییرات ناسازگار، نشت tenant یا side effect بدون audit ممکن می‌شود. موضوع این پیشنهاد، «Event Bus»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- تغییرات Run و Tool به Eventهای versioned تبدیل شود تا UI، Audit و Notification مستقل باشند.

**ورودی‌ها:**
- SystemEvent، schema version

**خروجی‌ها:**
- event stream و consumer offset

**Interface / Schema:**
- UP-007 / Event Bus: TypeScript interface versioned با ورودی tenant/auth، payload محدود، result envelope و RFC 7807 error؛ JSON Schema متناظر باید در schema/ نگهداری شود.
- Schema باید inputs=SystemEvent، schema version و outputs=event stream و consumer offset را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- apps/api/ برای transport؛ src/core/ برای invariant؛ schema/ برای قرارداد؛ prisma/ برای persistence؛ test/ برای contract و isolation.
- ماژول اختصاصی planned: src/core/upgrades/up-007.ts؛ fixture و تست: test/up-007.test.ts

**وابستگی‌ها:** UP-001, UP-006

**مرزهای امنیتی:**
- event خارجی نمی‌تواند authority agent را تغییر دهد

**تهدیدهای امنیتی:**
- تجاوز tenant، replay mutation، افشای secret در response، و اجرای مستقیم کد غیرقابل‌اعتماد از مسیر control plane.
- تهدید اختصاصی UP-007: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Event Bus» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای validation و state؛ contract برای OpenAPI/event؛ integration با دو tenant؛ negative برای auth، idempotency و audit.
- تست اختصاصی UP-007: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- تست ordering، duplicate و consumer recovery

**Definition of Done:**
- Interface و schema versioned merge شده، مسیر موفق و خطا evidence واقعی دارد، تست cross-tenant و replay پاس است، و هیچ raw password یا deploy بدون approval وجود ندارد.
- UP-007 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/control-plane-contract.ts
- test/audit-next-phases.test.ts

### 8. Contract Testing — UP-008

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| زیرساخت و API | P1 | `partial` | `in_progress` |

**هدف:**
- قرارداد API، Worker، Provider Adapter و UI در CI به‌صورت producer/consumer تست شود.

**مسئله‌ای که حل می‌کند:**
- قرارداد و مرز اجرایی این قابلیت بین API، worker و persistence صریح نیست؛ در نتیجه تغییرات ناسازگار، نشت tenant یا side effect بدون audit ممکن می‌شود. موضوع این پیشنهاد، «Contract Testing»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- قرارداد API، Worker، Provider Adapter و UI در CI به‌صورت producer/consumer تست شود.

**ورودی‌ها:**
- OpenAPI، event schemas

**خروجی‌ها:**
- گزارش compatibility

**Interface / Schema:**
- UP-008 / Contract Testing: TypeScript interface versioned با ورودی tenant/auth، payload محدود، result envelope و RFC 7807 error؛ JSON Schema متناظر باید در schema/ نگهداری شود.
- Schema باید inputs=OpenAPI، event schemas و outputs=گزارش compatibility را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- apps/api/ برای transport؛ src/core/ برای invariant؛ schema/ برای قرارداد؛ prisma/ برای persistence؛ test/ برای contract و isolation.
- ماژول اختصاصی planned: src/core/upgrades/up-008.ts؛ fixture و تست: test/up-008.test.ts

**وابستگی‌ها:** UP-005, UP-007

**مرزهای امنیتی:**
- تغییر ناسازگار بدون version جدید رد شود

**تهدیدهای امنیتی:**
- تجاوز tenant، replay mutation، افشای secret در response، و اجرای مستقیم کد غیرقابل‌اعتماد از مسیر control plane.
- تهدید اختصاصی UP-008: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Contract Testing» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای validation و state؛ contract برای OpenAPI/event؛ integration با دو tenant؛ negative برای auth، idempotency و audit.
- تست اختصاصی UP-008: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- CI باید یک breaking change مصنوعی را بگیرد

**Definition of Done:**
- Interface و schema versioned merge شده، مسیر موفق و خطا evidence واقعی دارد، تست cross-tenant و replay پاس است، و هیچ raw password یا deploy بدون approval وجود ندارد.
- UP-008 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/control-plane-contract.ts
- test/audit-next-phases.test.ts

### 9. Plugin SDK — UP-009

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| زیرساخت و API | P1 | `partial` | `in_progress` |

**هدف:**
- Tool، Provider، Harvester و Executor با interface و manifest نسخه‌دار اضافه شوند.

**مسئله‌ای که حل می‌کند:**
- قرارداد و مرز اجرایی این قابلیت بین API، worker و persistence صریح نیست؛ در نتیجه تغییرات ناسازگار، نشت tenant یا side effect بدون audit ممکن می‌شود. موضوع این پیشنهاد، «Plugin SDK»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Tool، Provider، Harvester و Executor با interface و manifest نسخه‌دار اضافه شوند.

**ورودی‌ها:**
- plugin manifest، capability، permissions

**خروجی‌ها:**
- SDK و compatibility layer

**Interface / Schema:**
- UP-009 / Plugin SDK: TypeScript interface versioned با ورودی tenant/auth، payload محدود، result envelope و RFC 7807 error؛ JSON Schema متناظر باید در schema/ نگهداری شود.
- Schema باید inputs=plugin manifest، capability، permissions و outputs=SDK و compatibility layer را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- apps/api/ برای transport؛ src/core/ برای invariant؛ schema/ برای قرارداد؛ prisma/ برای persistence؛ test/ برای contract و isolation.
- ماژول اختصاصی planned: src/core/upgrades/up-009.ts؛ fixture و تست: test/up-009.test.ts

**وابستگی‌ها:** UP-005, UP-031

**مرزهای امنیتی:**
- Plugin بدون signature یا permission اجرا نشود

**تهدیدهای امنیتی:**
- تجاوز tenant، replay mutation، افشای secret در response، و اجرای مستقیم کد غیرقابل‌اعتماد از مسیر control plane.
- تهدید اختصاصی UP-009: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Plugin SDK» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای validation و state؛ contract برای OpenAPI/event؛ integration با دو tenant؛ negative برای auth، idempotency و audit.
- تست اختصاصی UP-009: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- نمونه plugin در Sandbox نصب و حذف شود

**Definition of Done:**
- Interface و schema versioned merge شده، مسیر موفق و خطا evidence واقعی دارد، تست cross-tenant و replay پاس است، و هیچ raw password یا deploy بدون approval وجود ندارد.
- UP-009 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/intake-and-collaboration.ts
- test/audit-next-phases-2.test.ts

### 10. Tenant hierarchy — UP-010

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| زیرساخت و API | P0 | `partial` | `in_progress` |

**هدف:**
- رابطه User، Organization، Team، Project و Environment با مالکیت صریح مدل شود.

**مسئله‌ای که حل می‌کند:**
- قرارداد و مرز اجرایی این قابلیت بین API، worker و persistence صریح نیست؛ در نتیجه تغییرات ناسازگار، نشت tenant یا side effect بدون audit ممکن می‌شود. موضوع این پیشنهاد، «Tenant hierarchy»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- رابطه User، Organization، Team، Project و Environment با مالکیت صریح مدل شود.

**ورودی‌ها:**
- membership، role، resource owner

**خروجی‌ها:**
- authorization context قابل استخراج

**Interface / Schema:**
- UP-010 / Tenant hierarchy: TypeScript interface versioned با ورودی tenant/auth، payload محدود، result envelope و RFC 7807 error؛ JSON Schema متناظر باید در schema/ نگهداری شود.
- Schema باید inputs=membership، role، resource owner و outputs=authorization context قابل استخراج را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- apps/api/ برای transport؛ src/core/ برای invariant؛ schema/ برای قرارداد؛ prisma/ برای persistence؛ test/ برای contract و isolation.
- ماژول اختصاصی planned: src/core/upgrades/up-010.ts؛ fixture و تست: test/up-010.test.ts

**وابستگی‌ها:** UP-004, UP-001

**مرزهای امنیتی:**
- هیچ resource بی‌صاحب یا global ناخواسته وجود نداشته باشد

**تهدیدهای امنیتی:**
- تجاوز tenant، replay mutation، افشای secret در response، و اجرای مستقیم کد غیرقابل‌اعتماد از مسیر control plane.
- تهدید اختصاصی UP-010: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Tenant hierarchy» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای validation و state؛ contract برای OpenAPI/event؛ integration با دو tenant؛ negative برای auth، idempotency و audit.
- تست اختصاصی UP-010: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- تست role matrix و انتقال مالکیت

**Definition of Done:**
- Interface و schema versioned merge شده، مسیر موفق و خطا evidence واقعی دارد، تست cross-tenant و replay پاس است، و هیچ raw password یا deploy بدون approval وجود ندارد.
- UP-010 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/tenant-context.ts
- test/tenant-context.test.ts

### 11. Benchmark Corpus Registry — UP-011

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| ارزیابی و Benchmark | P0 | `partial` | `in_progress` |

**هدف:**
- پروژه‌ها و Issueهای دارای مجوز، commit ثابت، زبان و difficulty در رجیستری ثبت شوند.

**مسئله‌ای که حل می‌کند:**
- بدون ارزیابی قابل‌بازپخش، ادعای کیفیت مدل/agent ممکن است از شبیه‌سازی، benchmark آلوده یا معیار مبهم بیاید. موضوع این پیشنهاد، «Benchmark Corpus Registry»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- پروژه‌ها و Issueهای دارای مجوز، commit ثابت، زبان و difficulty در رجیستری ثبت شوند.

**ورودی‌ها:**
- repository، license، case metadata

**خروجی‌ها:**
- BenchmarkSuite نسخه‌دار

**Interface / Schema:**
- UP-011 / Benchmark Corpus Registry: BenchmarkSuite، TrialRecord، Rubric و ScoreReport با schema نسخه‌دار؛ هر رکورد شامل case، seed، model/tool versions، evidence hashes و budget است.
- Schema باید inputs=repository، license، case metadata و outputs=BenchmarkSuite نسخه‌دار را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/benchmark-*.ts و src/core/evidence.ts؛ schema/ و examples/ برای fixture؛ test/ برای corpus، replay و quality gate.
- ماژول اختصاصی planned: src/core/upgrades/up-011.ts؛ fixture و تست: test/up-011.test.ts

**وابستگی‌ها:** UP-003

**مرزهای امنیتی:**
- case بدون permission وارد اجرا نشود

**تهدیدهای امنیتی:**
- دست‌کاری score، آلودگی داده، اجرای کد benchmark خارج از sandbox، و ارسال secret یا مالکیت case به ارزیاب.
- تهدید اختصاصی UP-011: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Benchmark Corpus Registry» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای score/invariant؛ replay با seed ثابت؛ sandbox integration؛ holdout/contamination؛ regression با افت عمدی؛ property tests برای rubric.
- تست اختصاصی UP-011: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- Validate suite و audit مجوز

**Definition of Done:**
- یک case واقعی در sandbox با artifact hash و گزارش قابل‌بازپخش ثبت شده، quality gate افت را رد می‌کند، و هیچ ادعای measured بدون evidence پذیرفته نمی‌شود.
- UP-011 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/evaluation-integrity.ts
- test/audit-next-phases.test.ts

### 12. Real Benchmark Runner — UP-012

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| ارزیابی و Benchmark | P0 | `partial` | `in_progress` |

**هدف:**
- Runner واقعی از Executor مورد اعتماد نتیجه تست و Patch می‌گیرد و هیچ true skill شبیه‌سازی نمی‌کند.

**مسئله‌ای که حل می‌کند:**
- بدون ارزیابی قابل‌بازپخش، ادعای کیفیت مدل/agent ممکن است از شبیه‌سازی، benchmark آلوده یا معیار مبهم بیاید. موضوع این پیشنهاد، «Real Benchmark Runner»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Runner واقعی از Executor مورد اعتماد نتیجه تست و Patch می‌گیرد و هیچ true skill شبیه‌سازی نمی‌کند.

**ورودی‌ها:**
- suite، case، candidate، seed، budget

**خروجی‌ها:**
- Trial، score و CapabilityClaim measured

**Interface / Schema:**
- UP-012 / Real Benchmark Runner: BenchmarkSuite، TrialRecord، Rubric و ScoreReport با schema نسخه‌دار؛ هر رکورد شامل case، seed، model/tool versions، evidence hashes و budget است.
- Schema باید inputs=suite، case، candidate، seed، budget و outputs=Trial، score و CapabilityClaim measured را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/benchmark-*.ts و src/core/evidence.ts؛ schema/ و examples/ برای fixture؛ test/ برای corpus، replay و quality gate.
- ماژول اختصاصی planned: src/core/upgrades/up-012.ts؛ fixture و تست: test/up-012.test.ts

**وابستگی‌ها:** UP-011, UP-006

**مرزهای امنیتی:**
- اجرای کد فقط در sandbox مجاز و raw log وارد core نشود

**تهدیدهای امنیتی:**
- دست‌کاری score، آلودگی داده، اجرای کد benchmark خارج از sandbox، و ارسال secret یا مالکیت case به ارزیاب.
- تهدید اختصاصی UP-012: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Real Benchmark Runner» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای score/invariant؛ replay با seed ثابت؛ sandbox integration؛ holdout/contamination؛ regression با افت عمدی؛ property tests برای rubric.
- تست اختصاصی UP-012: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- حداقل یک case واقعی با تست و نتیجه ثبت شود

**Definition of Done:**
- یک case واقعی در sandbox با artifact hash و گزارش قابل‌بازپخش ثبت شده، quality gate افت را رد می‌کند، و هیچ ادعای measured بدون evidence پذیرفته نمی‌شود.
- UP-012 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/benchmark-runner.ts

### 13. Deterministic Replay — UP-013

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| ارزیابی و Benchmark | P0 | `partial` | `in_progress` |

**هدف:**
- Prompt، commit، seed، Model version، Tool version و Settings برای بازپخش ذخیره شود.

**مسئله‌ای که حل می‌کند:**
- بدون ارزیابی قابل‌بازپخش، ادعای کیفیت مدل/agent ممکن است از شبیه‌سازی، benchmark آلوده یا معیار مبهم بیاید. موضوع این پیشنهاد، «Deterministic Replay»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Prompt، commit، seed، Model version، Tool version و Settings برای بازپخش ذخیره شود.

**ورودی‌ها:**
- trial record، artifact hashes

**خروجی‌ها:**
- replay manifest

**Interface / Schema:**
- UP-013 / Deterministic Replay: BenchmarkSuite، TrialRecord، Rubric و ScoreReport با schema نسخه‌دار؛ هر رکورد شامل case، seed، model/tool versions، evidence hashes و budget است.
- Schema باید inputs=trial record، artifact hashes و outputs=replay manifest را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/benchmark-*.ts و src/core/evidence.ts؛ schema/ و examples/ برای fixture؛ test/ برای corpus، replay و quality gate.
- ماژول اختصاصی planned: src/core/upgrades/up-013.ts؛ fixture و تست: test/up-013.test.ts

**وابستگی‌ها:** UP-012, UP-041

**مرزهای امنیتی:**
- تغییر محیط یا مدل باید در replay صریحاً مشخص شود

**تهدیدهای امنیتی:**
- دست‌کاری score، آلودگی داده، اجرای کد benchmark خارج از sandbox، و ارسال secret یا مالکیت case به ارزیاب.
- تهدید اختصاصی UP-013: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Deterministic Replay» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای score/invariant؛ replay با seed ثابت؛ sandbox integration؛ holdout/contamination؛ regression با افت عمدی؛ property tests برای rubric.
- تست اختصاصی UP-013: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- replay همان ورودی باید fingerprint یکسان بدهد

**Definition of Done:**
- یک case واقعی در sandbox با artifact hash و گزارش قابل‌بازپخش ثبت شده، quality gate افت را رد می‌کند، و هیچ ادعای measured بدون evidence پذیرفته نمی‌شود.
- UP-013 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/evaluation-integrity.ts
- test/audit-next-phases.test.ts

### 14. Task Rubrics — UP-014

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| ارزیابی و Benchmark | P1 | `partial` | `in_progress` |

**هدف:**
- برای code generation، repair، review، security و docs rubric جدا با وزن و معیار انسانی تعریف شود.

**مسئله‌ای که حل می‌کند:**
- بدون ارزیابی قابل‌بازپخش، ادعای کیفیت مدل/agent ممکن است از شبیه‌سازی، benchmark آلوده یا معیار مبهم بیاید. موضوع این پیشنهاد، «Task Rubrics»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- برای code generation، repair، review، security و docs rubric جدا با وزن و معیار انسانی تعریف شود.

**ورودی‌ها:**
- task type، acceptance criteria

**خروجی‌ها:**
- rubric score breakdown

**Interface / Schema:**
- UP-014 / Task Rubrics: BenchmarkSuite، TrialRecord، Rubric و ScoreReport با schema نسخه‌دار؛ هر رکورد شامل case، seed، model/tool versions، evidence hashes و budget است.
- Schema باید inputs=task type، acceptance criteria و outputs=rubric score breakdown را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/benchmark-*.ts و src/core/evidence.ts؛ schema/ و examples/ برای fixture؛ test/ برای corpus، replay و quality gate.
- ماژول اختصاصی planned: src/core/upgrades/up-014.ts؛ fixture و تست: test/up-014.test.ts

**وابستگی‌ها:** UP-012

**مرزهای امنیتی:**
- امتیاز مبهم یا بدون evidence قابل promotion نباشد

**تهدیدهای امنیتی:**
- دست‌کاری score، آلودگی داده، اجرای کد benchmark خارج از sandbox، و ارسال secret یا مالکیت case به ارزیاب.
- تهدید اختصاصی UP-014: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Task Rubrics» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای score/invariant؛ replay با seed ثابت؛ sandbox integration؛ holdout/contamination؛ regression با افت عمدی؛ property tests برای rubric.
- تست اختصاصی UP-014: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- دو ارزیاب مستقل اختلاف را آشکار کنند

**Definition of Done:**
- یک case واقعی در sandbox با artifact hash و گزارش قابل‌بازپخش ثبت شده، quality gate افت را رد می‌کند، و هیچ ادعای measured بدون evidence پذیرفته نمی‌شود.
- UP-014 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/evaluation-integrity.ts
- test/audit-next-phases.test.ts

### 15. Semantic Patch Correctness — UP-015

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| ارزیابی و Benchmark | P1 | `partial` | `in_progress` |

**هدف:**
- علاوه بر test، هدف Issue، API compatibility و رفتار ناخواسته بررسی شود.

**مسئله‌ای که حل می‌کند:**
- بدون ارزیابی قابل‌بازپخش، ادعای کیفیت مدل/agent ممکن است از شبیه‌سازی، benchmark آلوده یا معیار مبهم بیاید. موضوع این پیشنهاد، «Semantic Patch Correctness»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- علاوه بر test، هدف Issue، API compatibility و رفتار ناخواسته بررسی شود.

**ورودی‌ها:**
- patch، issue، contract tests

**خروجی‌ها:**
- semantic evaluation report

**Interface / Schema:**
- UP-015 / Semantic Patch Correctness: BenchmarkSuite، TrialRecord، Rubric و ScoreReport با schema نسخه‌دار؛ هر رکورد شامل case، seed، model/tool versions، evidence hashes و budget است.
- Schema باید inputs=patch، issue، contract tests و outputs=semantic evaluation report را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/benchmark-*.ts و src/core/evidence.ts؛ schema/ و examples/ برای fixture؛ test/ برای corpus، replay و quality gate.
- ماژول اختصاصی planned: src/core/upgrades/up-015.ts؛ fixture و تست: test/up-015.test.ts

**وابستگی‌ها:** UP-014

**مرزهای امنیتی:**
- مدل نمی‌تواند خودش نتیجه را تأیید کند

**تهدیدهای امنیتی:**
- دست‌کاری score، آلودگی داده، اجرای کد benchmark خارج از sandbox، و ارسال secret یا مالکیت case به ارزیاب.
- تهدید اختصاصی UP-015: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Semantic Patch Correctness» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای score/invariant؛ replay با seed ثابت؛ sandbox integration؛ holdout/contamination؛ regression با افت عمدی؛ property tests برای rubric.
- تست اختصاصی UP-015: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- case با test سبز ولی requirement ناقص باید رد شود

**Definition of Done:**
- یک case واقعی در sandbox با artifact hash و گزارش قابل‌بازپخش ثبت شده، quality gate افت را رد می‌کند، و هیچ ادعای measured بدون evidence پذیرفته نمی‌شود.
- UP-015 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/evaluation-integrity.ts
- test/audit-next-phases.test.ts

### 16. Mutation Testing — UP-016

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| ارزیابی و Benchmark | P1 | `partial` | `in_progress` |

**هدف:**
- با جهش کنترل‌شده در کد، توان تست‌ها برای کشف خطا سنجیده شود.

**مسئله‌ای که حل می‌کند:**
- بدون ارزیابی قابل‌بازپخش، ادعای کیفیت مدل/agent ممکن است از شبیه‌سازی، benchmark آلوده یا معیار مبهم بیاید. موضوع این پیشنهاد، «Mutation Testing»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- با جهش کنترل‌شده در کد، توان تست‌ها برای کشف خطا سنجیده شود.

**ورودی‌ها:**
- test suite، mutation operators

**خروجی‌ها:**
- mutation score

**Interface / Schema:**
- UP-016 / Mutation Testing: BenchmarkSuite، TrialRecord، Rubric و ScoreReport با schema نسخه‌دار؛ هر رکورد شامل case، seed، model/tool versions، evidence hashes و budget است.
- Schema باید inputs=test suite، mutation operators و outputs=mutation score را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/benchmark-*.ts و src/core/evidence.ts؛ schema/ و examples/ برای fixture؛ test/ برای corpus، replay و quality gate.
- ماژول اختصاصی planned: src/core/upgrades/up-016.ts؛ fixture و تست: test/up-016.test.ts

**وابستگی‌ها:** UP-012

**مرزهای امنیتی:**
- mutation روی production data اجرا نشود

**تهدیدهای امنیتی:**
- دست‌کاری score، آلودگی داده، اجرای کد benchmark خارج از sandbox، و ارسال secret یا مالکیت case به ارزیاب.
- تهدید اختصاصی UP-016: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Mutation Testing» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای score/invariant؛ replay با seed ثابت؛ sandbox integration؛ holdout/contamination؛ regression با افت عمدی؛ property tests برای rubric.
- تست اختصاصی UP-016: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- threshold per project در CI enforce شود

**Definition of Done:**
- یک case واقعی در sandbox با artifact hash و گزارش قابل‌بازپخش ثبت شده، quality gate افت را رد می‌کند، و هیچ ادعای measured بدون evidence پذیرفته نمی‌شود.
- UP-016 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/evaluation-integrity.ts
- test/audit-next-phases.test.ts

### 17. Property-Based Testing — UP-017

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| ارزیابی و Benchmark | P1 | `partial` | `in_progress` |

**هدف:**
- برای Policy، Redaction، State Machine، Allocation و Schema ورودی تصادفی تولید شود.

**مسئله‌ای که حل می‌کند:**
- بدون ارزیابی قابل‌بازپخش، ادعای کیفیت مدل/agent ممکن است از شبیه‌سازی، benchmark آلوده یا معیار مبهم بیاید. موضوع این پیشنهاد، «Property-Based Testing»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- برای Policy، Redaction، State Machine، Allocation و Schema ورودی تصادفی تولید شود.

**ورودی‌ها:**
- generator، invariant

**خروجی‌ها:**
- counterexample قابل replay

**Interface / Schema:**
- UP-017 / Property-Based Testing: BenchmarkSuite، TrialRecord، Rubric و ScoreReport با schema نسخه‌دار؛ هر رکورد شامل case، seed، model/tool versions، evidence hashes و budget است.
- Schema باید inputs=generator، invariant و outputs=counterexample قابل replay را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/benchmark-*.ts و src/core/evidence.ts؛ schema/ و examples/ برای fixture؛ test/ برای corpus، replay و quality gate.
- ماژول اختصاصی planned: src/core/upgrades/up-017.ts؛ fixture و تست: test/up-017.test.ts

**وابستگی‌ها:** UP-012

**مرزهای امنیتی:**
- داده تصادفی Secret واقعی نداشته باشد

**تهدیدهای امنیتی:**
- دست‌کاری score، آلودگی داده، اجرای کد benchmark خارج از sandbox، و ارسال secret یا مالکیت case به ارزیاب.
- تهدید اختصاصی UP-017: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Property-Based Testing» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای score/invariant؛ replay با seed ثابت؛ sandbox integration؛ holdout/contamination؛ regression با افت عمدی؛ property tests برای rubric.
- تست اختصاصی UP-017: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- هر failure با seed بازتولید شود

**Definition of Done:**
- یک case واقعی در sandbox با artifact hash و گزارش قابل‌بازپخش ثبت شده، quality gate افت را رد می‌کند، و هیچ ادعای measured بدون evidence پذیرفته نمی‌شود.
- UP-017 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/evaluation-integrity.ts
- test/audit-next-phases.test.ts

### 18. Contamination Detection — UP-018

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| ارزیابی و Benchmark | P0 | `partial` | `in_progress` |

**هدف:**
- آلودگی Benchmark با داده آموزشی یا اجرای قبلی شناسایی و در گزارش جدا شود.

**مسئله‌ای که حل می‌کند:**
- بدون ارزیابی قابل‌بازپخش، ادعای کیفیت مدل/agent ممکن است از شبیه‌سازی، benchmark آلوده یا معیار مبهم بیاید. موضوع این پیشنهاد، «Contamination Detection»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- آلودگی Benchmark با داده آموزشی یا اجرای قبلی شناسایی و در گزارش جدا شود.

**ورودی‌ها:**
- case provenance، model disclosure

**خروجی‌ها:**
- contamination flag

**Interface / Schema:**
- UP-018 / Contamination Detection: BenchmarkSuite، TrialRecord، Rubric و ScoreReport با schema نسخه‌دار؛ هر رکورد شامل case، seed، model/tool versions، evidence hashes و budget است.
- Schema باید inputs=case provenance، model disclosure و outputs=contamination flag را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/benchmark-*.ts و src/core/evidence.ts؛ schema/ و examples/ برای fixture؛ test/ برای corpus، replay و quality gate.
- ماژول اختصاصی planned: src/core/upgrades/up-018.ts؛ fixture و تست: test/up-018.test.ts

**وابستگی‌ها:** UP-011, UP-012

**مرزهای امنیتی:**
- case آلوده رتبه‌بندی اصلی را تغییر ندهد

**تهدیدهای امنیتی:**
- دست‌کاری score، آلودگی داده، اجرای کد benchmark خارج از sandbox، و ارسال secret یا مالکیت case به ارزیاب.
- تهدید اختصاصی UP-018: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Contamination Detection» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای score/invariant؛ replay با seed ثابت؛ sandbox integration؛ holdout/contamination؛ regression با افت عمدی؛ property tests برای rubric.
- تست اختصاصی UP-018: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- case known و holdout مستقل مقایسه شوند

**Definition of Done:**
- یک case واقعی در sandbox با artifact hash و گزارش قابل‌بازپخش ثبت شده، quality gate افت را رد می‌کند، و هیچ ادعای measured بدون evidence پذیرفته نمی‌شود.
- UP-018 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/evaluation-integrity.ts
- test/audit-next-phases.test.ts

### 19. Blind Human Evaluation — UP-019

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| ارزیابی و Benchmark | P1 | `partial` | `in_progress` |

**هدف:**
- بازبین بدون دیدن نام Model خروجی‌ها را با rubric مقایسه کند.

**مسئله‌ای که حل می‌کند:**
- بدون ارزیابی قابل‌بازپخش، ادعای کیفیت مدل/agent ممکن است از شبیه‌سازی، benchmark آلوده یا معیار مبهم بیاید. موضوع این پیشنهاد، «Blind Human Evaluation»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- بازبین بدون دیدن نام Model خروجی‌ها را با rubric مقایسه کند.

**ورودی‌ها:**
- anonymous artifacts، rubric

**خروجی‌ها:**
- blind score و inter-rater agreement

**Interface / Schema:**
- UP-019 / Blind Human Evaluation: BenchmarkSuite، TrialRecord، Rubric و ScoreReport با schema نسخه‌دار؛ هر رکورد شامل case، seed، model/tool versions، evidence hashes و budget است.
- Schema باید inputs=anonymous artifacts، rubric و outputs=blind score و inter-rater agreement را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/benchmark-*.ts و src/core/evidence.ts؛ schema/ و examples/ برای fixture؛ test/ برای corpus، replay و quality gate.
- ماژول اختصاصی planned: src/core/upgrades/up-019.ts؛ fixture و تست: test/up-019.test.ts

**وابستگی‌ها:** UP-014

**مرزهای امنیتی:**
- اطلاعات مالکیت و Secret به بازبین نرسد

**تهدیدهای امنیتی:**
- دست‌کاری score، آلودگی داده، اجرای کد benchmark خارج از sandbox، و ارسال secret یا مالکیت case به ارزیاب.
- تهدید اختصاصی UP-019: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Blind Human Evaluation» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای score/invariant؛ replay با seed ثابت؛ sandbox integration؛ holdout/contamination؛ regression با افت عمدی؛ property tests برای rubric.
- تست اختصاصی UP-019: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- گزارش agreement و adjudication ثبت شود

**Definition of Done:**
- یک case واقعی در sandbox با artifact hash و گزارش قابل‌بازپخش ثبت شده، quality gate افت را رد می‌کند، و هیچ ادعای measured بدون evidence پذیرفته نمی‌شود.
- UP-019 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/evaluation-integrity.ts
- test/audit-next-phases.test.ts

### 20. Regression Quality Gate — UP-020

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| ارزیابی و Benchmark | P0 | `partial` | `in_progress` |

**هدف:**
- افت quality، safety یا cost در Prompt، Router، Tool و Model مانع Merge شود.

**مسئله‌ای که حل می‌کند:**
- بدون ارزیابی قابل‌بازپخش، ادعای کیفیت مدل/agent ممکن است از شبیه‌سازی، benchmark آلوده یا معیار مبهم بیاید. موضوع این پیشنهاد، «Regression Quality Gate»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- افت quality، safety یا cost در Prompt، Router، Tool و Model مانع Merge شود.

**ورودی‌ها:**
- baseline، candidate results

**خروجی‌ها:**
- CI gate decision

**Interface / Schema:**
- UP-020 / Regression Quality Gate: BenchmarkSuite، TrialRecord، Rubric و ScoreReport با schema نسخه‌دار؛ هر رکورد شامل case، seed، model/tool versions، evidence hashes و budget است.
- Schema باید inputs=baseline، candidate results و outputs=CI gate decision را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/benchmark-*.ts و src/core/evidence.ts؛ schema/ و examples/ برای fixture؛ test/ برای corpus، replay و quality gate.
- ماژول اختصاصی planned: src/core/upgrades/up-020.ts؛ fixture و تست: test/up-020.test.ts

**وابستگی‌ها:** UP-012, UP-020

**مرزهای امنیتی:**
- هیچ skip دستی بدون approval و Audit مجاز نباشد

**تهدیدهای امنیتی:**
- دست‌کاری score، آلودگی داده، اجرای کد benchmark خارج از sandbox، و ارسال secret یا مالکیت case به ارزیاب.
- تهدید اختصاصی UP-020: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Regression Quality Gate» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای score/invariant؛ replay با seed ثابت؛ sandbox integration؛ holdout/contamination؛ regression با افت عمدی؛ property tests برای rubric.
- تست اختصاصی UP-020: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- PR عمداً افت‌دار باید fail شود

**Definition of Done:**
- یک case واقعی در sandbox با artifact hash و گزارش قابل‌بازپخش ثبت شده، quality gate افت را رد می‌کند، و هیچ ادعای measured بدون evidence پذیرفته نمی‌شود.
- UP-020 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/evaluation-integrity.ts
- test/audit-next-phases.test.ts

### 21. Intent Taxonomy — UP-021

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Routing و Evidence | P1 | `partial` | `in_progress` |

**هدف:**
- Intentهای bug fix، feature، refactor، security و docs با version و label تعریف شوند.

**مسئله‌ای که حل می‌کند:**
- انتخاب model/tool بر اساس claim خام یا confidence بی‌پشتوانه می‌تواند هزینه، کیفیت، privacy و safety را هم‌زمان نقض کند. موضوع این پیشنهاد، «Intent Taxonomy»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Intentهای bug fix، feature، refactor، security و docs با version و label تعریف شوند.

**ورودی‌ها:**
- user request، locale

**خروجی‌ها:**
- intent classification با confidence

**Interface / Schema:**
- UP-021 / Intent Taxonomy: RouteRequest، CandidateEvidence، PolicyVerdict و RouteDecision با reason codes؛ hard constraints پیش از ranking و explanation بدون chain-of-thought خام.
- Schema باید inputs=user request، locale و outputs=intent classification با confidence را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/model-router.ts، capability-evidence.ts و policy-engine.ts؛ schema/ برای route/evidence؛ test/ برای ranking و adversarial claims.
- ماژول اختصاصی planned: src/core/upgrades/up-021.ts؛ fixture و تست: test/up-021.test.ts

**وابستگی‌ها:** UP-001

**مرزهای امنیتی:**
- confidence پایین باید Clarification ایجاد کند

**تهدیدهای امنیتی:**
- تزریق در محتوای خارجی، astroturfing، دورزدن privacy/cost ceiling، و تغییر route با داده stale یا untrusted.
- تهدید اختصاصی UP-021: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Intent Taxonomy» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای filter/rank/calibration؛ adversarial fixture برای claim؛ shadow comparison؛ property test برای hard constraints؛ replay تصمیم.
- تست اختصاصی UP-021: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- نمونه‌های مرزی در تست نگهداری شوند

**Definition of Done:**
- هر تصمیم route با evidence، policy verdict، hash تنظیمات و دلیل رد نامزدها قابل توضیح است؛ گزینه ممنوع هرگز fallback نمی‌شود و تست adversarial پاس است.
- UP-021 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/intake-and-collaboration.ts
- test/audit-next-phases-2.test.ts

### 22. Requirement Extraction — UP-022

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Routing و Evidence | P1 | `partial` | `in_progress` |

**هدف:**
- درخواست طبیعی به هدف، محدودیت، acceptance، risk و artifact تبدیل شود.

**مسئله‌ای که حل می‌کند:**
- انتخاب model/tool بر اساس claim خام یا confidence بی‌پشتوانه می‌تواند هزینه، کیفیت، privacy و safety را هم‌زمان نقض کند. موضوع این پیشنهاد، «Requirement Extraction»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- درخواست طبیعی به هدف، محدودیت، acceptance، risk و artifact تبدیل شود.

**ورودی‌ها:**
- raw request، project context

**خروجی‌ها:**
- structured requirement

**Interface / Schema:**
- UP-022 / Requirement Extraction: RouteRequest، CandidateEvidence، PolicyVerdict و RouteDecision با reason codes؛ hard constraints پیش از ranking و explanation بدون chain-of-thought خام.
- Schema باید inputs=raw request، project context و outputs=structured requirement را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/model-router.ts، capability-evidence.ts و policy-engine.ts؛ schema/ برای route/evidence؛ test/ برای ranking و adversarial claims.
- ماژول اختصاصی planned: src/core/upgrades/up-022.ts؛ fixture و تست: test/up-022.test.ts

**وابستگی‌ها:** UP-021

**مرزهای امنیتی:**
- متن خارجی authority را تغییر ندهد

**تهدیدهای امنیتی:**
- تزریق در محتوای خارجی، astroturfing، دورزدن privacy/cost ceiling، و تغییر route با داده stale یا untrusted.
- تهدید اختصاصی UP-022: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Requirement Extraction» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای filter/rank/calibration؛ adversarial fixture برای claim؛ shadow comparison؛ property test برای hard constraints؛ replay تصمیم.
- تست اختصاصی UP-022: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- خروجی نامعتبر وارد Plan نشود

**Definition of Done:**
- هر تصمیم route با evidence، policy verdict، hash تنظیمات و دلیل رد نامزدها قابل توضیح است؛ گزینه ممنوع هرگز fallback نمی‌شود و تست adversarial پاس است.
- UP-022 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/intake-and-collaboration.ts
- test/audit-next-phases-2.test.ts

### 23. Task Decomposition — UP-023

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Routing و Evidence | P1 | `partial` | `in_progress` |

**هدف:**
- درخواست بزرگ به DAG با dependency، owner، input، output و DoD تقسیم شود.

**مسئله‌ای که حل می‌کند:**
- انتخاب model/tool بر اساس claim خام یا confidence بی‌پشتوانه می‌تواند هزینه، کیفیت، privacy و safety را هم‌زمان نقض کند. موضوع این پیشنهاد، «Task Decomposition»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- درخواست بزرگ به DAG با dependency، owner، input، output و DoD تقسیم شود.

**ورودی‌ها:**
- requirement، repository map

**خروجی‌ها:**
- Task DAG versioned

**Interface / Schema:**
- UP-023 / Task Decomposition: RouteRequest، CandidateEvidence، PolicyVerdict و RouteDecision با reason codes؛ hard constraints پیش از ranking و explanation بدون chain-of-thought خام.
- Schema باید inputs=requirement، repository map و outputs=Task DAG versioned را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/model-router.ts، capability-evidence.ts و policy-engine.ts؛ schema/ برای route/evidence؛ test/ برای ranking و adversarial claims.
- ماژول اختصاصی planned: src/core/upgrades/up-023.ts؛ fixture و تست: test/up-023.test.ts

**وابستگی‌ها:** UP-022

**مرزهای امنیتی:**
- چرخه و dependency مبهم block شود

**تهدیدهای امنیتی:**
- تزریق در محتوای خارجی، astroturfing، دورزدن privacy/cost ceiling، و تغییر route با داده stale یا untrusted.
- تهدید اختصاصی UP-023: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Task Decomposition» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای filter/rank/calibration؛ adversarial fixture برای claim؛ shadow comparison؛ property test برای hard constraints؛ replay تصمیم.
- تست اختصاصی UP-023: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- DAG validation و manual approval

**Definition of Done:**
- هر تصمیم route با evidence، policy verdict، hash تنظیمات و دلیل رد نامزدها قابل توضیح است؛ گزینه ممنوع هرگز fallback نمی‌شود و تست adversarial پاس است.
- UP-023 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/intake-and-collaboration.ts
- test/audit-next-phases-2.test.ts

### 24. Capability Graph — UP-024

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Routing و Evidence | P1 | `partial` | `in_progress` |

**هدف:**
- رابطه Model، Tool، زبان، Framework، context، privacy، cost و risk در Graph ذخیره شود.

**مسئله‌ای که حل می‌کند:**
- انتخاب model/tool بر اساس claim خام یا confidence بی‌پشتوانه می‌تواند هزینه، کیفیت، privacy و safety را هم‌زمان نقض کند. موضوع این پیشنهاد، «Capability Graph»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- رابطه Model، Tool، زبان، Framework، context، privacy، cost و risk در Graph ذخیره شود.

**ورودی‌ها:**
- capability claims، catalog

**خروجی‌ها:**
- candidate graph query

**Interface / Schema:**
- UP-024 / Capability Graph: RouteRequest، CandidateEvidence، PolicyVerdict و RouteDecision با reason codes؛ hard constraints پیش از ranking و explanation بدون chain-of-thought خام.
- Schema باید inputs=capability claims، catalog و outputs=candidate graph query را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/model-router.ts، capability-evidence.ts و policy-engine.ts؛ schema/ برای route/evidence؛ test/ برای ranking و adversarial claims.
- ماژول اختصاصی planned: src/core/upgrades/up-024.ts؛ fixture و تست: test/up-024.test.ts

**وابستگی‌ها:** UP-012, UP-024

**مرزهای امنیتی:**
- Graph نمی‌تواند policy را دور بزند

**تهدیدهای امنیتی:**
- تزریق در محتوای خارجی، astroturfing، دورزدن privacy/cost ceiling، و تغییر route با داده stale یا untrusted.
- تهدید اختصاصی UP-024: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Capability Graph» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای filter/rank/calibration؛ adversarial fixture برای claim؛ shadow comparison؛ property test برای hard constraints؛ replay تصمیم.
- تست اختصاصی UP-024: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- query با policy verdict نهایی ترکیب شود

**Definition of Done:**
- هر تصمیم route با evidence، policy verdict، hash تنظیمات و دلیل رد نامزدها قابل توضیح است؛ گزینه ممنوع هرگز fallback نمی‌شود و تست adversarial پاس است.
- UP-024 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/intake-and-collaboration.ts
- test/audit-next-phases-2.test.ts

### 25. Official Web Harvester — UP-025

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Routing و Evidence | P0 | `partial` | `in_progress` |

**هدف:**
- فقط API رسمی و داده permissioned جمع‌آوری، cache و به CapabilityClaim تبدیل شود.

**مسئله‌ای که حل می‌کند:**
- انتخاب model/tool بر اساس claim خام یا confidence بی‌پشتوانه می‌تواند هزینه، کیفیت، privacy و safety را هم‌زمان نقض کند. موضوع این پیشنهاد، «Official Web Harvester»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- فقط API رسمی و داده permissioned جمع‌آوری، cache و به CapabilityClaim تبدیل شود.

**ورودی‌ها:**
- API credentials، source policy

**خروجی‌ها:**
- untrusted claim با provenance

**Interface / Schema:**
- UP-025 / Official Web Harvester: RouteRequest، CandidateEvidence، PolicyVerdict و RouteDecision با reason codes؛ hard constraints پیش از ranking و explanation بدون chain-of-thought خام.
- Schema باید inputs=API credentials، source policy و outputs=untrusted claim با provenance را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/model-router.ts، capability-evidence.ts و policy-engine.ts؛ schema/ برای route/evidence؛ test/ برای ranking و adversarial claims.
- ماژول اختصاصی planned: src/core/upgrades/up-025.ts؛ fixture و تست: test/up-025.test.ts

**وابستگی‌ها:** UP-009, UP-025

**مرزهای امنیتی:**
- داده وب authority، settings یا permission تغییر نمی‌دهد

**تهدیدهای امنیتی:**
- تزریق در محتوای خارجی، astroturfing، دورزدن privacy/cost ceiling، و تغییر route با داده stale یا untrusted.
- تهدید اختصاصی UP-025: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Official Web Harvester» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای filter/rank/calibration؛ adversarial fixture برای claim؛ shadow comparison؛ property test برای hard constraints؛ replay تصمیم.
- تست اختصاصی UP-025: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- rate limit، ToS و redaction تست شود

**Definition of Done:**
- هر تصمیم route با evidence، policy verdict، hash تنظیمات و دلیل رد نامزدها قابل توضیح است؛ گزینه ممنوع هرگز fallback نمی‌شود و تست adversarial پاس است.
- UP-025 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/evidence-routing-operations.ts
- test/audit-next-phases-2.test.ts

### 26. Source Calibration — UP-026

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Routing و Evidence | P1 | `partial` | `in_progress` |

**هدف:**
- اعتبار Benchmark مستقل، Vendor claim و community signal با نتیجه واقعی کالیبره شود.

**مسئله‌ای که حل می‌کند:**
- انتخاب model/tool بر اساس claim خام یا confidence بی‌پشتوانه می‌تواند هزینه، کیفیت، privacy و safety را هم‌زمان نقض کند. موضوع این پیشنهاد، «Source Calibration»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- اعتبار Benchmark مستقل، Vendor claim و community signal با نتیجه واقعی کالیبره شود.

**ورودی‌ها:**
- claim history، measured results

**خروجی‌ها:**
- calibration report

**Interface / Schema:**
- UP-026 / Source Calibration: RouteRequest، CandidateEvidence، PolicyVerdict و RouteDecision با reason codes؛ hard constraints پیش از ranking و explanation بدون chain-of-thought خام.
- Schema باید inputs=claim history، measured results و outputs=calibration report را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/model-router.ts، capability-evidence.ts و policy-engine.ts؛ schema/ برای route/evidence؛ test/ برای ranking و adversarial claims.
- ماژول اختصاصی planned: src/core/upgrades/up-026.ts؛ fixture و تست: test/up-026.test.ts

**وابستگی‌ها:** UP-025, UP-012

**مرزهای امنیتی:**
- community signal سقف نفوذ خود را حفظ کند

**تهدیدهای امنیتی:**
- تزریق در محتوای خارجی، astroturfing، دورزدن privacy/cost ceiling، و تغییر route با داده stale یا untrusted.
- تهدید اختصاصی UP-026: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Source Calibration» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای filter/rank/calibration؛ adversarial fixture برای claim؛ shadow comparison؛ property test برای hard constraints؛ replay تصمیم.
- تست اختصاصی UP-026: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- simulation دست‌کاری‌شده نباید رتبه را بشکند

**Definition of Done:**
- هر تصمیم route با evidence، policy verdict، hash تنظیمات و دلیل رد نامزدها قابل توضیح است؛ گزینه ممنوع هرگز fallback نمی‌شود و تست adversarial پاس است.
- UP-026 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/evidence-routing-operations.ts
- test/audit-next-phases-2.test.ts

### 27. Capability Drift — UP-027

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Routing و Evidence | P1 | `partial` | `in_progress` |

**هدف:**
- تغییر کیفیت، latency، قیمت و availability در طول زمان با baseline مقایسه شود.

**مسئله‌ای که حل می‌کند:**
- انتخاب model/tool بر اساس claim خام یا confidence بی‌پشتوانه می‌تواند هزینه، کیفیت، privacy و safety را هم‌زمان نقض کند. موضوع این پیشنهاد، «Capability Drift»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- تغییر کیفیت، latency، قیمت و availability در طول زمان با baseline مقایسه شود.

**ورودی‌ها:**
- trial stream، provider health

**خروجی‌ها:**
- drift alert و re-evaluation job

**Interface / Schema:**
- UP-027 / Capability Drift: RouteRequest، CandidateEvidence، PolicyVerdict و RouteDecision با reason codes؛ hard constraints پیش از ranking و explanation بدون chain-of-thought خام.
- Schema باید inputs=trial stream، provider health و outputs=drift alert و re-evaluation job را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/model-router.ts، capability-evidence.ts و policy-engine.ts؛ schema/ برای route/evidence؛ test/ برای ranking و adversarial claims.
- ماژول اختصاصی planned: src/core/upgrades/up-027.ts؛ fixture و تست: test/up-027.test.ts

**وابستگی‌ها:** UP-012, UP-058

**مرزهای امنیتی:**
- هشدار به‌تنهایی Route را بدون policy تغییر ندهد

**تهدیدهای امنیتی:**
- تزریق در محتوای خارجی، astroturfing، دورزدن privacy/cost ceiling، و تغییر route با داده stale یا untrusted.
- تهدید اختصاصی UP-027: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Capability Drift» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای filter/rank/calibration؛ adversarial fixture برای claim؛ shadow comparison؛ property test برای hard constraints؛ replay تصمیم.
- تست اختصاصی UP-027: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- drift مصنوعی در test شناسایی شود

**Definition of Done:**
- هر تصمیم route با evidence، policy verdict، hash تنظیمات و دلیل رد نامزدها قابل توضیح است؛ گزینه ممنوع هرگز fallback نمی‌شود و تست adversarial پاس است.
- UP-027 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/evidence-routing-operations.ts
- test/audit-next-phases-2.test.ts

### 28. Pareto Routing — UP-028

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Routing و Evidence | P1 | `partial` | `in_progress` |

**هدف:**
- Quality، cost، latency، privacy و reliability هم‌زمان optimize و dominated گزینه حذف شود.

**مسئله‌ای که حل می‌کند:**
- انتخاب model/tool بر اساس claim خام یا confidence بی‌پشتوانه می‌تواند هزینه، کیفیت، privacy و safety را هم‌زمان نقض کند. موضوع این پیشنهاد، «Pareto Routing»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Quality، cost، latency، privacy و reliability هم‌زمان optimize و dominated گزینه حذف شود.

**ورودی‌ها:**
- candidate scores، user constraints

**خروجی‌ها:**
- Pareto set و انتخاب توضیح‌پذیر

**Interface / Schema:**
- UP-028 / Pareto Routing: RouteRequest، CandidateEvidence، PolicyVerdict و RouteDecision با reason codes؛ hard constraints پیش از ranking و explanation بدون chain-of-thought خام.
- Schema باید inputs=candidate scores، user constraints و outputs=Pareto set و انتخاب توضیح‌پذیر را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/model-router.ts، capability-evidence.ts و policy-engine.ts؛ schema/ برای route/evidence؛ test/ برای ranking و adversarial claims.
- ماژول اختصاصی planned: src/core/upgrades/up-028.ts؛ fixture و تست: test/up-028.test.ts

**وابستگی‌ها:** UP-024, UP-028

**مرزهای امنیتی:**
- hard constraints قبل از ranking اعمال شوند

**تهدیدهای امنیتی:**
- تزریق در محتوای خارجی، astroturfing، دورزدن privacy/cost ceiling، و تغییر route با داده stale یا untrusted.
- تهدید اختصاصی UP-028: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Pareto Routing» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای filter/rank/calibration؛ adversarial fixture برای claim؛ shadow comparison؛ property test برای hard constraints؛ replay تصمیم.
- تست اختصاصی UP-028: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- گزینه ممنوع هرگز در fallback نیاید

**Definition of Done:**
- هر تصمیم route با evidence، policy verdict، hash تنظیمات و دلیل رد نامزدها قابل توضیح است؛ گزینه ممنوع هرگز fallback نمی‌شود و تست adversarial پاس است.
- UP-028 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/evidence-routing-operations.ts
- test/audit-next-phases-2.test.ts

### 29. Routing Explanation — UP-029

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Routing و Evidence | P1 | `partial` | `in_progress` |

**هدف:**
- دلیل انتخاب، evidence، confidence، cost و دلیل رد گزینه‌ها به UI داده شود.

**مسئله‌ای که حل می‌کند:**
- انتخاب model/tool بر اساس claim خام یا confidence بی‌پشتوانه می‌تواند هزینه، کیفیت، privacy و safety را هم‌زمان نقض کند. موضوع این پیشنهاد، «Routing Explanation»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- دلیل انتخاب، evidence، confidence، cost و دلیل رد گزینه‌ها به UI داده شود.

**ورودی‌ها:**
- route decision

**خروجی‌ها:**
- explanation artifact

**Interface / Schema:**
- UP-029 / Routing Explanation: RouteRequest، CandidateEvidence، PolicyVerdict و RouteDecision با reason codes؛ hard constraints پیش از ranking و explanation بدون chain-of-thought خام.
- Schema باید inputs=route decision و outputs=explanation artifact را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/model-router.ts، capability-evidence.ts و policy-engine.ts؛ schema/ برای route/evidence؛ test/ برای ranking و adversarial claims.
- ماژول اختصاصی planned: src/core/upgrades/up-029.ts؛ fixture و تست: test/up-029.test.ts

**وابستگی‌ها:** UP-027

**مرزهای امنیتی:**
- توضیح نباید Secret یا chain-of-thought خام باشد

**تهدیدهای امنیتی:**
- تزریق در محتوای خارجی، astroturfing، دورزدن privacy/cost ceiling، و تغییر route با داده stale یا untrusted.
- تهدید اختصاصی UP-029: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Routing Explanation» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای filter/rank/calibration؛ adversarial fixture برای claim؛ shadow comparison؛ property test برای hard constraints؛ replay تصمیم.
- تست اختصاصی UP-029: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- explanation با verdict و hash settings منطبق باشد

**Definition of Done:**
- هر تصمیم route با evidence، policy verdict، hash تنظیمات و دلیل رد نامزدها قابل توضیح است؛ گزینه ممنوع هرگز fallback نمی‌شود و تست adversarial پاس است.
- UP-029 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/evidence-routing-operations.ts
- test/audit-next-phases-2.test.ts

### 30. Shadow Routing — UP-030

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Routing و Evidence | P1 | `partial` | `in_progress` |

**هدف:**
- Router جدید کنار فعلی تصمیم می‌دهد ولی side effect یا cost ایجاد نمی‌کند.

**مسئله‌ای که حل می‌کند:**
- انتخاب model/tool بر اساس claim خام یا confidence بی‌پشتوانه می‌تواند هزینه، کیفیت، privacy و safety را هم‌زمان نقض کند. موضوع این پیشنهاد، «Shadow Routing»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Router جدید کنار فعلی تصمیم می‌دهد ولی side effect یا cost ایجاد نمی‌کند.

**ورودی‌ها:**
- request، candidate routers

**خروجی‌ها:**
- comparison report

**Interface / Schema:**
- UP-030 / Shadow Routing: RouteRequest، CandidateEvidence، PolicyVerdict و RouteDecision با reason codes؛ hard constraints پیش از ranking و explanation بدون chain-of-thought خام.
- Schema باید inputs=request، candidate routers و outputs=comparison report را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/model-router.ts، capability-evidence.ts و policy-engine.ts؛ schema/ برای route/evidence؛ test/ برای ranking و adversarial claims.
- ماژول اختصاصی planned: src/core/upgrades/up-030.ts؛ fixture و تست: test/up-030.test.ts

**وابستگی‌ها:** UP-020, UP-029

**مرزهای امنیتی:**
- shadow به provider پولی یا external write دسترسی نداشته باشد

**تهدیدهای امنیتی:**
- تزریق در محتوای خارجی، astroturfing، دورزدن privacy/cost ceiling، و تغییر route با داده stale یا untrusted.
- تهدید اختصاصی UP-030: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Shadow Routing» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای filter/rank/calibration؛ adversarial fixture برای claim؛ shadow comparison؛ property test برای hard constraints؛ replay تصمیم.
- تست اختصاصی UP-030: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- اختلاف route و کیفیت گزارش شود

**Definition of Done:**
- هر تصمیم route با evidence، policy verdict، hash تنظیمات و دلیل رد نامزدها قابل توضیح است؛ گزینه ممنوع هرگز fallback نمی‌شود و تست adversarial پاس است.
- UP-030 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/evidence-routing-operations.ts
- test/audit-next-phases-2.test.ts

### 31. Egress Proxy — UP-031

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| امنیت و Supply Chain | P0 | `partial` | `in_progress` |

**هدف:**
- خروجی شبکه Agent و Tool از Proxy با allowlist، حجم، مقصد و دلیل عبور کند.

**مسئله‌ای که حل می‌کند:**
- agent و plugin به شبکه، secret و dependency دسترسی دارند و بدون زنجیره اعتماد صریح، یک محتوای untrusted می‌تواند authority یا محیط را تصاحب کند. موضوع این پیشنهاد، «Egress Proxy»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- خروجی شبکه Agent و Tool از Proxy با allowlist، حجم، مقصد و دلیل عبور کند.

**ورودی‌ها:**
- destination، capability، tenant

**خروجی‌ها:**
- egress decision و log

**Interface / Schema:**
- UP-031 / Egress Proxy: SecurityDecision، PermissionManifest، TaintLabel، EgressRequest و Attestation با default-deny، expiry، provenance و audit event.
- Schema باید inputs=destination، capability، tenant و outputs=egress decision و log را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/security-baseline.ts، policy-engine.ts و redaction.ts؛ schema/ برای manifest/decision؛ sandbox و CI policy کنار apps/ و scripts/.
- ماژول اختصاصی planned: src/core/upgrades/up-031.ts؛ fixture و تست: test/up-031.test.ts

**وابستگی‌ها:** UP-009

**مرزهای امنیتی:**
- Default deny و عدم دور زدن با DNS یا IP جایگزین

**تهدیدهای امنیتی:**
- prompt injection، exfiltration، secret persistence، dependency confusion، malware، DNS bypass و اجرای خارج از sandbox.
- تهدید اختصاصی UP-031: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Egress Proxy» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- negative security fixtures؛ signature/tamper؛ egress allowlist؛ redaction؛ dependency/license gates؛ sandbox escape؛ property test روی taint و policy.
- تست اختصاصی UP-031: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- تلاش به مقصد ممنوع block شود

**Definition of Done:**
- default-deny و approval برای privilege برقرار است، artifact/decision audit می‌شود، secret خام ذخیره یا log نمی‌شود، و CAPTCHA/MFA/bulk-account bypass وجود ندارد.
- UP-031 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/secure-supply-chain.ts
- test/audit-next-phases.test.ts

### 32. Ephemeral Secret Broker — UP-032

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| امنیت و Supply Chain | P0 | `partial` | `in_progress` |

**هدف:**
- Secret کوتاه‌عمر و scope-limited از Broker گرفته شود، نه raw env دائمی.

**مسئله‌ای که حل می‌کند:**
- agent و plugin به شبکه، secret و dependency دسترسی دارند و بدون زنجیره اعتماد صریح، یک محتوای untrusted می‌تواند authority یا محیط را تصاحب کند. موضوع این پیشنهاد، «Ephemeral Secret Broker»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Secret کوتاه‌عمر و scope-limited از Broker گرفته شود، نه raw env دائمی.

**ورودی‌ها:**
- identity، scope، ttl

**خروجی‌ها:**
- ephemeral token

**Interface / Schema:**
- UP-032 / Ephemeral Secret Broker: SecurityDecision، PermissionManifest، TaintLabel، EgressRequest و Attestation با default-deny، expiry، provenance و audit event.
- Schema باید inputs=identity، scope، ttl و outputs=ephemeral token را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/security-baseline.ts، policy-engine.ts و redaction.ts؛ schema/ برای manifest/decision؛ sandbox و CI policy کنار apps/ و scripts/.
- ماژول اختصاصی planned: src/core/upgrades/up-032.ts؛ fixture و تست: test/up-032.test.ts

**وابستگی‌ها:** UP-010

**مرزهای امنیتی:**
- password خام ذخیره نشود و Token در log/redaction نیاید

**تهدیدهای امنیتی:**
- prompt injection، exfiltration، secret persistence، dependency confusion، malware، DNS bypass و اجرای خارج از sandbox.
- تهدید اختصاصی UP-032: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Ephemeral Secret Broker» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- negative security fixtures؛ signature/tamper؛ egress allowlist؛ redaction؛ dependency/license gates؛ sandbox escape؛ property test روی taint و policy.
- تست اختصاصی UP-032: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- expiry، revocation و scope test

**Definition of Done:**
- default-deny و approval برای privilege برقرار است، artifact/decision audit می‌شود، secret خام ذخیره یا log نمی‌شود، و CAPTCHA/MFA/bulk-account bypass وجود ندارد.
- UP-032 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/secure-supply-chain.ts
- test/audit-next-phases.test.ts

### 33. Signed Tool Manifest — UP-033

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| امنیت و Supply Chain | P0 | `partial` | `in_progress` |

**هدف:**
- Manifest ابزار شامل version، permissions، hash و maintainer امضا شود.

**مسئله‌ای که حل می‌کند:**
- agent و plugin به شبکه، secret و dependency دسترسی دارند و بدون زنجیره اعتماد صریح، یک محتوای untrusted می‌تواند authority یا محیط را تصاحب کند. موضوع این پیشنهاد، «Signed Tool Manifest»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Manifest ابزار شامل version، permissions، hash و maintainer امضا شود.

**ورودی‌ها:**
- plugin package، signing key

**خروجی‌ها:**
- verified manifest

**Interface / Schema:**
- UP-033 / Signed Tool Manifest: SecurityDecision، PermissionManifest، TaintLabel، EgressRequest و Attestation با default-deny، expiry، provenance و audit event.
- Schema باید inputs=plugin package، signing key و outputs=verified manifest را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/security-baseline.ts، policy-engine.ts و redaction.ts؛ schema/ برای manifest/decision؛ sandbox و CI policy کنار apps/ و scripts/.
- ماژول اختصاصی planned: src/core/upgrades/up-033.ts؛ fixture و تست: test/up-033.test.ts

**وابستگی‌ها:** UP-009

**مرزهای امنیتی:**
- کلید امضا در repo نگهداری نشود

**تهدیدهای امنیتی:**
- prompt injection، exfiltration، secret persistence، dependency confusion، malware، DNS bypass و اجرای خارج از sandbox.
- تهدید اختصاصی UP-033: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Signed Tool Manifest» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- negative security fixtures؛ signature/tamper؛ egress allowlist؛ redaction؛ dependency/license gates؛ sandbox escape؛ property test روی taint و policy.
- تست اختصاصی UP-033: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- package tamper باید fail شود

**Definition of Done:**
- default-deny و approval برای privilege برقرار است، artifact/decision audit می‌شود، secret خام ذخیره یا log نمی‌شود، و CAPTCHA/MFA/bulk-account bypass وجود ندارد.
- UP-033 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/secure-supply-chain.ts
- test/audit-next-phases.test.ts

### 34. SBOM — UP-034

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| امنیت و Supply Chain | P0 | `partial` | `in_progress` |

**هدف:**
- تمام Buildها فهرست dependency، version، license و hash تولید کنند.

**مسئله‌ای که حل می‌کند:**
- agent و plugin به شبکه، secret و dependency دسترسی دارند و بدون زنجیره اعتماد صریح، یک محتوای untrusted می‌تواند authority یا محیط را تصاحب کند. موضوع این پیشنهاد، «SBOM»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- تمام Buildها فهرست dependency، version، license و hash تولید کنند.

**ورودی‌ها:**
- build artifact

**خروجی‌ها:**
- SBOM و provenance

**Interface / Schema:**
- UP-034 / SBOM: SecurityDecision، PermissionManifest، TaintLabel، EgressRequest و Attestation با default-deny، expiry، provenance و audit event.
- Schema باید inputs=build artifact و outputs=SBOM و provenance را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/security-baseline.ts، policy-engine.ts و redaction.ts؛ schema/ برای manifest/decision؛ sandbox و CI policy کنار apps/ و scripts/.
- ماژول اختصاصی planned: src/core/upgrades/up-034.ts؛ fixture و تست: test/up-034.test.ts

**وابستگی‌ها:** UP-033

**مرزهای امنیتی:**
- artifact بدون SBOM وارد production نشود

**تهدیدهای امنیتی:**
- prompt injection، exfiltration، secret persistence، dependency confusion، malware، DNS bypass و اجرای خارج از sandbox.
- تهدید اختصاصی UP-034: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «SBOM» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- negative security fixtures؛ signature/tamper؛ egress allowlist؛ redaction؛ dependency/license gates؛ sandbox escape؛ property test روی taint و policy.
- تست اختصاصی UP-034: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- reproducible build با SBOM مقایسه شود

**Definition of Done:**
- default-deny و approval برای privilege برقرار است، artifact/decision audit می‌شود، secret خام ذخیره یا log نمی‌شود، و CAPTCHA/MFA/bulk-account bypass وجود ندارد.
- UP-034 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/secure-supply-chain.ts
- test/audit-next-phases.test.ts

### 35. Dependency Policy — UP-035

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| امنیت و Supply Chain | P0 | `partial` | `in_progress` |

**هدف:**
- Dependency آسیب‌پذیر، license ناسازگار یا maintainer ناشناس block شود.

**مسئله‌ای که حل می‌کند:**
- agent و plugin به شبکه، secret و dependency دسترسی دارند و بدون زنجیره اعتماد صریح، یک محتوای untrusted می‌تواند authority یا محیط را تصاحب کند. موضوع این پیشنهاد، «Dependency Policy»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Dependency آسیب‌پذیر، license ناسازگار یا maintainer ناشناس block شود.

**ورودی‌ها:**
- SBOM، advisory feed، license policy

**خروجی‌ها:**
- policy verdict

**Interface / Schema:**
- UP-035 / Dependency Policy: SecurityDecision، PermissionManifest، TaintLabel، EgressRequest و Attestation با default-deny، expiry، provenance و audit event.
- Schema باید inputs=SBOM، advisory feed، license policy و outputs=policy verdict را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/security-baseline.ts، policy-engine.ts و redaction.ts؛ schema/ برای manifest/decision؛ sandbox و CI policy کنار apps/ و scripts/.
- ماژول اختصاصی planned: src/core/upgrades/up-035.ts؛ fixture و تست: test/up-035.test.ts

**وابستگی‌ها:** UP-034

**مرزهای امنیتی:**
- exception تاریخ انقضا و approval داشته باشد

**تهدیدهای امنیتی:**
- prompt injection، exfiltration، secret persistence، dependency confusion، malware، DNS bypass و اجرای خارج از sandbox.
- تهدید اختصاصی UP-035: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Dependency Policy» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- negative security fixtures؛ signature/tamper؛ egress allowlist؛ redaction؛ dependency/license gates؛ sandbox escape؛ property test روی taint و policy.
- تست اختصاصی UP-035: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- dependency پرریسک CI را متوقف کند

**Definition of Done:**
- default-deny و approval برای privilege برقرار است، artifact/decision audit می‌شود، secret خام ذخیره یا log نمی‌شود، و CAPTCHA/MFA/bulk-account bypass وجود ندارد.
- UP-035 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/secure-supply-chain.ts
- test/audit-next-phases.test.ts

### 36. Prompt Injection Firewall — UP-036

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| امنیت و Supply Chain | P0 | `partial` | `in_progress` |

**هدف:**
- محتوای Repository، Issue، Web و Social به‌عنوان untrusted data با authority جدا پردازش شود.

**مسئله‌ای که حل می‌کند:**
- agent و plugin به شبکه، secret و dependency دسترسی دارند و بدون زنجیره اعتماد صریح، یک محتوای untrusted می‌تواند authority یا محیط را تصاحب کند. موضوع این پیشنهاد، «Prompt Injection Firewall»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- محتوای Repository، Issue، Web و Social به‌عنوان untrusted data با authority جدا پردازش شود.

**ورودی‌ها:**
- external content، agent policy

**خروجی‌ها:**
- tainted context و block decision

**Interface / Schema:**
- UP-036 / Prompt Injection Firewall: SecurityDecision، PermissionManifest، TaintLabel، EgressRequest و Attestation با default-deny، expiry، provenance و audit event.
- Schema باید inputs=external content، agent policy و outputs=tainted context و block decision را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/security-baseline.ts، policy-engine.ts و redaction.ts؛ schema/ برای manifest/decision؛ sandbox و CI policy کنار apps/ و scripts/.
- ماژول اختصاصی planned: src/core/upgrades/up-036.ts؛ fixture و تست: test/up-036.test.ts

**وابستگی‌ها:** UP-022, UP-031

**مرزهای امنیتی:**
- محتوا نمی‌تواند system instruction یا permission را overwrite کند

**تهدیدهای امنیتی:**
- prompt injection، exfiltration، secret persistence، dependency confusion، malware، DNS bypass و اجرای خارج از sandbox.
- تهدید اختصاصی UP-036: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Prompt Injection Firewall» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- negative security fixtures؛ signature/tamper؛ egress allowlist؛ redaction؛ dependency/license gates؛ sandbox escape؛ property test روی taint و policy.
- تست اختصاصی UP-036: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- fixture injection باید بی‌اثر بماند

**Definition of Done:**
- default-deny و approval برای privilege برقرار است، artifact/decision audit می‌شود، secret خام ذخیره یا log نمی‌شود، و CAPTCHA/MFA/bulk-account bypass وجود ندارد.
- UP-036 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/secure-supply-chain.ts
- test/audit-next-phases.test.ts

### 37. Taint Tracking — UP-037

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| امنیت و Supply Chain | P1 | `partial` | `in_progress` |

**هدف:**
- منشأ user، repo، web، secret و provider روی داده تا خروجی دنبال شود.

**مسئله‌ای که حل می‌کند:**
- agent و plugin به شبکه، secret و dependency دسترسی دارند و بدون زنجیره اعتماد صریح، یک محتوای untrusted می‌تواند authority یا محیط را تصاحب کند. موضوع این پیشنهاد، «Taint Tracking»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- منشأ user، repo، web، secret و provider روی داده تا خروجی دنبال شود.

**ورودی‌ها:**
- content chunks، transformations

**خروجی‌ها:**
- taint labels و sink policy

**Interface / Schema:**
- UP-037 / Taint Tracking: SecurityDecision، PermissionManifest، TaintLabel، EgressRequest و Attestation با default-deny، expiry، provenance و audit event.
- Schema باید inputs=content chunks، transformations و outputs=taint labels و sink policy را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/security-baseline.ts، policy-engine.ts و redaction.ts؛ schema/ برای manifest/decision؛ sandbox و CI policy کنار apps/ و scripts/.
- ماژول اختصاصی planned: src/core/upgrades/up-037.ts؛ fixture و تست: test/up-037.test.ts

**وابستگی‌ها:** UP-036, UP-032

**مرزهای امنیتی:**
- Secret به prompt خارجی و log عمومی نرسد

**تهدیدهای امنیتی:**
- prompt injection، exfiltration، secret persistence، dependency confusion، malware، DNS bypass و اجرای خارج از sandbox.
- تهدید اختصاصی UP-037: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Taint Tracking» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- negative security fixtures؛ signature/tamper؛ egress allowlist؛ redaction؛ dependency/license gates؛ sandbox escape؛ property test روی taint و policy.
- تست اختصاصی UP-037: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- tainted sink بدون approval رد شود

**Definition of Done:**
- default-deny و approval برای privilege برقرار است، artifact/decision audit می‌شود، secret خام ذخیره یا log نمی‌شود، و CAPTCHA/MFA/bulk-account bypass وجود ندارد.
- UP-037 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/secure-supply-chain.ts
- test/audit-next-phases.test.ts

### 38. MicroVM Sandbox — UP-038

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| امنیت و Supply Chain | P0 | `partial` | `in_progress` |

**هدف:**
- کد untrusted در مرز Kernel قوی‌تر از container، با filesystem و network محدود اجرا شود.

**مسئله‌ای که حل می‌کند:**
- agent و plugin به شبکه، secret و dependency دسترسی دارند و بدون زنجیره اعتماد صریح، یک محتوای untrusted می‌تواند authority یا محیط را تصاحب کند. موضوع این پیشنهاد، «MicroVM Sandbox»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- کد untrusted در مرز Kernel قوی‌تر از container، با filesystem و network محدود اجرا شود.

**ورودی‌ها:**
- artifact، resource limits

**خروجی‌ها:**
- execution result و attestation

**Interface / Schema:**
- UP-038 / MicroVM Sandbox: SecurityDecision، PermissionManifest، TaintLabel، EgressRequest و Attestation با default-deny، expiry، provenance و audit event.
- Schema باید inputs=artifact، resource limits و outputs=execution result و attestation را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/security-baseline.ts، policy-engine.ts و redaction.ts؛ schema/ برای manifest/decision؛ sandbox و CI policy کنار apps/ و scripts/.
- ماژول اختصاصی planned: src/core/upgrades/up-038.ts؛ fixture و تست: test/up-038.test.ts

**وابستگی‌ها:** UP-031, UP-032

**مرزهای امنیتی:**
- no host mount، no credential inheritance، timeout سخت

**تهدیدهای امنیتی:**
- prompt injection، exfiltration، secret persistence، dependency confusion، malware، DNS bypass و اجرای خارج از sandbox.
- تهدید اختصاصی UP-038: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «MicroVM Sandbox» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- negative security fixtures؛ signature/tamper؛ egress allowlist؛ redaction؛ dependency/license gates؛ sandbox escape؛ property test روی taint و policy.
- تست اختصاصی UP-038: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- escape، network و resource abuse تست شود

**Definition of Done:**
- default-deny و approval برای privilege برقرار است، artifact/decision audit می‌شود، secret خام ذخیره یا log نمی‌شود، و CAPTCHA/MFA/bulk-account bypass وجود ندارد.
- UP-038 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/secure-supply-chain.ts
- test/audit-next-phases.test.ts

### 39. DLP Before Egress — UP-039

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| امنیت و Supply Chain | P0 | `partial` | `in_progress` |

**هدف:**
- PII، private key، token و داده محرمانه قبل از Provider خارجی mask یا block شود.

**مسئله‌ای که حل می‌کند:**
- agent و plugin به شبکه، secret و dependency دسترسی دارند و بدون زنجیره اعتماد صریح، یک محتوای untrusted می‌تواند authority یا محیط را تصاحب کند. موضوع این پیشنهاد، «DLP Before Egress»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- PII، private key، token و داده محرمانه قبل از Provider خارجی mask یا block شود.

**ورودی‌ها:**
- payload، privacy level

**خروجی‌ها:**
- redacted payload و findings

**Interface / Schema:**
- UP-039 / DLP Before Egress: SecurityDecision، PermissionManifest، TaintLabel، EgressRequest و Attestation با default-deny، expiry، provenance و audit event.
- Schema باید inputs=payload، privacy level و outputs=redacted payload و findings را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/security-baseline.ts، policy-engine.ts و redaction.ts؛ schema/ برای manifest/decision؛ sandbox و CI policy کنار apps/ و scripts/.
- ماژول اختصاصی planned: src/core/upgrades/up-039.ts؛ fixture و تست: test/up-039.test.ts

**وابستگی‌ها:** UP-032, UP-037

**مرزهای امنیتی:**
- false negative حساس‌تر از false positive گزارش شود

**تهدیدهای امنیتی:**
- prompt injection، exfiltration، secret persistence، dependency confusion، malware، DNS bypass و اجرای خارج از sandbox.
- تهدید اختصاصی UP-039: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «DLP Before Egress» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- negative security fixtures؛ signature/tamper؛ egress allowlist؛ redaction؛ dependency/license gates؛ sandbox escape؛ property test روی taint و policy.
- تست اختصاصی UP-039: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- fixtureهای credential و PII رد شوند

**Definition of Done:**
- default-deny و approval برای privilege برقرار است، artifact/decision audit می‌شود، secret خام ذخیره یا log نمی‌شود، و CAPTCHA/MFA/bulk-account bypass وجود ندارد.
- UP-039 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/secure-supply-chain.ts
- test/audit-next-phases.test.ts

### 40. Incident Response — UP-040

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| امنیت و Supply Chain | P0 | `partial` | `in_progress` |

**هدف:**
- برای leak، injection، exfiltration، provider compromise و audit tamper playbook و تمرین دوره‌ای تعریف شود.

**مسئله‌ای که حل می‌کند:**
- agent و plugin به شبکه، secret و dependency دسترسی دارند و بدون زنجیره اعتماد صریح، یک محتوای untrusted می‌تواند authority یا محیط را تصاحب کند. موضوع این پیشنهاد، «Incident Response»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- برای leak، injection، exfiltration، provider compromise و audit tamper playbook و تمرین دوره‌ای تعریف شود.

**ورودی‌ها:**
- incident signal، severity

**خروجی‌ها:**
- containment، notification و postmortem

**Interface / Schema:**
- UP-040 / Incident Response: SecurityDecision، PermissionManifest، TaintLabel، EgressRequest و Attestation با default-deny، expiry، provenance و audit event.
- Schema باید inputs=incident signal، severity و outputs=containment، notification و postmortem را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/security-baseline.ts، policy-engine.ts و redaction.ts؛ schema/ برای manifest/decision؛ sandbox و CI policy کنار apps/ و scripts/.
- ماژول اختصاصی planned: src/core/upgrades/up-040.ts؛ fixture و تست: test/up-040.test.ts

**وابستگی‌ها:** UP-031, UP-039

**مرزهای امنیتی:**
- پاسخ اضطراری بدون حذف Audit انجام شود

**تهدیدهای امنیتی:**
- prompt injection، exfiltration، secret persistence، dependency confusion، malware، DNS bypass و اجرای خارج از sandbox.
- تهدید اختصاصی UP-040: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Incident Response» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- negative security fixtures؛ signature/tamper؛ egress allowlist؛ redaction؛ dependency/license gates؛ sandbox escape؛ property test روی taint و policy.
- تست اختصاصی UP-040: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- tabletop exercise و زمان واکنش اندازه‌گیری شود

**Definition of Done:**
- default-deny و approval برای privilege برقرار است، artifact/decision audit می‌شود، secret خام ذخیره یا log نمی‌شود، و CAPTCHA/MFA/bulk-account bypass وجود ندارد.
- UP-040 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/secure-supply-chain.ts
- test/audit-next-phases.test.ts

### 41. Run Checkpoints — UP-041

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| پایداری و عملیات | P0 | `partial` | `in_progress` |

**هدف:**
- بعد از هر stage و side effect snapshot immutable ذخیره شود.

**مسئله‌ای که حل می‌کند:**
- خرابی provider، worker یا storage می‌تواند Run را duplicate، گم‌شده یا غیرقابل‌برگشت کند و operator بدون SLO و drill شواهد ندارد. موضوع این پیشنهاد، «Run Checkpoints»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- بعد از هر stage و side effect snapshot immutable ذخیره شود.

**ورودی‌ها:**
- run state، event، artifacts

**خروجی‌ها:**
- checkpoint chain

**Interface / Schema:**
- UP-041 / Run Checkpoints: RunCheckpoint، Lease، RetryPolicy، HealthSignal، SLO و IncidentEvent با idempotency key و monotonic version.
- Schema باید inputs=run state، event، artifacts و outputs=checkpoint chain را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/job-queue.ts، checkpoint-store.ts، usage-ledger.ts و planned src/infra/؛ docs/runbooks/ برای عملیات؛ test/ برای crash/chaos/restore.
- ماژول اختصاصی planned: src/core/upgrades/up-041.ts؛ fixture و تست: test/up-041.test.ts

**وابستگی‌ها:** UP-007

**مرزهای امنیتی:**
- checkpoint قابل update/delete نباشد

**تهدیدهای امنیتی:**
- double side effect، stale worker، حذف شواهد، failover حلقه‌ای و دسترسی operator خارج از audit.
- تهدید اختصاصی UP-041: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Run Checkpoints» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- crash/restart و lease reclaim؛ chaos برای timeout/partition؛ backup restore drill؛ load/SLO؛ property برای state monotonic و idempotency.
- تست اختصاصی UP-041: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- hash chain و append-only test

**Definition of Done:**
- failure modeها runbook و alert دارند، restore با RPO/RTO اندازه‌گیری شده، retry side effect را duplicate نمی‌کند، و هر عملیات حساس approval/audit دارد.
- UP-041 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/checkpoint-store.ts

### 42. Crash Resume — UP-042

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| پایداری و عملیات | P0 | `partial` | `in_progress` |

**هدف:**
- Worker پس از crash از آخرین checkpoint امن ادامه دهد.

**مسئله‌ای که حل می‌کند:**
- خرابی provider، worker یا storage می‌تواند Run را duplicate، گم‌شده یا غیرقابل‌برگشت کند و operator بدون SLO و drill شواهد ندارد. موضوع این پیشنهاد، «Crash Resume»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Worker پس از crash از آخرین checkpoint امن ادامه دهد.

**ورودی‌ها:**
- checkpoint، lease، retry policy

**خروجی‌ها:**
- resumed run و event continuity

**Interface / Schema:**
- UP-042 / Crash Resume: RunCheckpoint، Lease، RetryPolicy، HealthSignal، SLO و IncidentEvent با idempotency key و monotonic version.
- Schema باید inputs=checkpoint، lease، retry policy و outputs=resumed run و event continuity را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/job-queue.ts، checkpoint-store.ts، usage-ledger.ts و planned src/infra/؛ docs/runbooks/ برای عملیات؛ test/ برای crash/chaos/restore.
- ماژول اختصاصی planned: src/core/upgrades/up-042.ts؛ fixture و تست: test/up-042.test.ts

**وابستگی‌ها:** UP-041, UP-043

**مرزهای امنیتی:**
- side effect idempotency قبل از resume بررسی شود

**تهدیدهای امنیتی:**
- double side effect، stale worker، حذف شواهد، failover حلقه‌ای و دسترسی operator خارج از audit.
- تهدید اختصاصی UP-042: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Crash Resume» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- crash/restart و lease reclaim؛ chaos برای timeout/partition؛ backup restore drill؛ load/SLO؛ property برای state monotonic و idempotency.
- تست اختصاصی UP-042: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- kill worker وسط stage و resume موفق

**Definition of Done:**
- failure modeها runbook و alert دارند، restore با RPO/RTO اندازه‌گیری شده، retry side effect را duplicate نمی‌کند، و هر عملیات حساس approval/audit دارد.
- UP-042 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/resilience-operations.ts
- test/audit-next-phases.test.ts

### 43. End-to-End Idempotency — UP-043

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| پایداری و عملیات | P0 | `partial` | `in_progress` |

**هدف:**
- Run، Job، Tool و external write با key و result replay کنترل شوند.

**مسئله‌ای که حل می‌کند:**
- خرابی provider، worker یا storage می‌تواند Run را duplicate، گم‌شده یا غیرقابل‌برگشت کند و operator بدون SLO و drill شواهد ندارد. موضوع این پیشنهاد، «End-to-End Idempotency»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Run، Job، Tool و external write با key و result replay کنترل شوند.

**ورودی‌ها:**
- idempotency key، request hash

**خروجی‌ها:**
- new/replay/conflict decision

**Interface / Schema:**
- UP-043 / End-to-End Idempotency: RunCheckpoint، Lease، RetryPolicy، HealthSignal، SLO و IncidentEvent با idempotency key و monotonic version.
- Schema باید inputs=idempotency key، request hash و outputs=new/replay/conflict decision را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/job-queue.ts، checkpoint-store.ts، usage-ledger.ts و planned src/infra/؛ docs/runbooks/ برای عملیات؛ test/ برای crash/chaos/restore.
- ماژول اختصاصی planned: src/core/upgrades/up-043.ts؛ fixture و تست: test/up-043.test.ts

**وابستگی‌ها:** UP-006, UP-041

**مرزهای امنیتی:**
- conflict هرگز side effect دوم ایجاد نکند

**تهدیدهای امنیتی:**
- double side effect، stale worker، حذف شواهد، failover حلقه‌ای و دسترسی operator خارج از audit.
- تهدید اختصاصی UP-043: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «End-to-End Idempotency» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- crash/restart و lease reclaim؛ chaos برای timeout/partition؛ backup restore drill؛ load/SLO؛ property برای state monotonic و idempotency.
- تست اختصاصی UP-043: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- duplicate delivery test

**Definition of Done:**
- failure modeها runbook و alert دارند، restore با RPO/RTO اندازه‌گیری شده، retry side effect را duplicate نمی‌کند، و هر عملیات حساس approval/audit دارد.
- UP-043 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/idempotency.ts
- apps/api/server.ts

### 44. Provider Circuit Breaker — UP-044

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| پایداری و عملیات | P0 | `partial` | `in_progress` |

**هدف:**
- Error، timeout و quota باعث open شدن circuit و failover policy شوند.

**مسئله‌ای که حل می‌کند:**
- خرابی provider، worker یا storage می‌تواند Run را duplicate، گم‌شده یا غیرقابل‌برگشت کند و operator بدون SLO و drill شواهد ندارد. موضوع این پیشنهاد، «Provider Circuit Breaker»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Error، timeout و quota باعث open شدن circuit و failover policy شوند.

**ورودی‌ها:**
- health sample، threshold، cooldown

**خروجی‌ها:**
- circuit state

**Interface / Schema:**
- UP-044 / Provider Circuit Breaker: RunCheckpoint، Lease، RetryPolicy، HealthSignal، SLO و IncidentEvent با idempotency key و monotonic version.
- Schema باید inputs=health sample، threshold، cooldown و outputs=circuit state را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/job-queue.ts، checkpoint-store.ts، usage-ledger.ts و planned src/infra/؛ docs/runbooks/ برای عملیات؛ test/ برای crash/chaos/restore.
- ماژول اختصاصی planned: src/core/upgrades/up-044.ts؛ fixture و تست: test/up-044.test.ts

**وابستگی‌ها:** UP-058

**مرزهای امنیتی:**
- failover از privacy و budget عبور نکند

**تهدیدهای امنیتی:**
- double side effect، stale worker، حذف شواهد، failover حلقه‌ای و دسترسی operator خارج از audit.
- تهدید اختصاصی UP-044: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Provider Circuit Breaker» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- crash/restart و lease reclaim؛ chaos برای timeout/partition؛ backup restore drill؛ load/SLO؛ property برای state monotonic و idempotency.
- تست اختصاصی UP-044: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- provider outage simulation

**Definition of Done:**
- failure modeها runbook و alert دارند، restore با RPO/RTO اندازه‌گیری شده، retry side effect را duplicate نمی‌کند، و هر عملیات حساس approval/audit دارد.
- UP-044 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/resilience-operations.ts
- test/audit-next-phases.test.ts

### 45. Distributed Tracing — UP-045

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| پایداری و عملیات | P1 | `partial` | `in_progress` |

**هدف:**
- Run تا DB query و Provider call با Trace/Span مشترک دنبال شود.

**مسئله‌ای که حل می‌کند:**
- خرابی provider، worker یا storage می‌تواند Run را duplicate، گم‌شده یا غیرقابل‌برگشت کند و operator بدون SLO و drill شواهد ندارد. موضوع این پیشنهاد، «Distributed Tracing»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Run تا DB query و Provider call با Trace/Span مشترک دنبال شود.

**ورودی‌ها:**
- correlation IDs، events

**خروجی‌ها:**
- trace timeline

**Interface / Schema:**
- UP-045 / Distributed Tracing: RunCheckpoint، Lease، RetryPolicy، HealthSignal، SLO و IncidentEvent با idempotency key و monotonic version.
- Schema باید inputs=correlation IDs، events و outputs=trace timeline را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/job-queue.ts، checkpoint-store.ts، usage-ledger.ts و planned src/infra/؛ docs/runbooks/ برای عملیات؛ test/ برای crash/chaos/restore.
- ماژول اختصاصی planned: src/core/upgrades/up-045.ts؛ fixture و تست: test/up-045.test.ts

**وابستگی‌ها:** UP-007

**مرزهای امنیتی:**
- Secret در attribute trace نباشد

**تهدیدهای امنیتی:**
- double side effect، stale worker، حذف شواهد، failover حلقه‌ای و دسترسی operator خارج از audit.
- تهدید اختصاصی UP-045: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Distributed Tracing» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- crash/restart و lease reclaim؛ chaos برای timeout/partition؛ backup restore drill؛ load/SLO؛ property برای state monotonic و idempotency.
- تست اختصاصی UP-045: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- trace completeness test

**Definition of Done:**
- failure modeها runbook و alert دارند، restore با RPO/RTO اندازه‌گیری شده، retry side effect را duplicate نمی‌کند، و هر عملیات حساس approval/audit دارد.
- UP-045 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/evidence-routing-operations.ts
- test/audit-next-phases-2.test.ts

### 46. SLO و Error Budget — UP-046

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| پایداری و عملیات | P0 | `partial` | `in_progress` |

**هدف:**
- Availability، latency، queue wait و quality SLO و budget داشته باشند.

**مسئله‌ای که حل می‌کند:**
- خرابی provider، worker یا storage می‌تواند Run را duplicate، گم‌شده یا غیرقابل‌برگشت کند و operator بدون SLO و drill شواهد ندارد. موضوع این پیشنهاد، «SLO و Error Budget»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Availability، latency، queue wait و quality SLO و budget داشته باشند.

**ورودی‌ها:**
- metrics، service tier

**خروجی‌ها:**
- SLO report و deployment gate

**Interface / Schema:**
- UP-046 / SLO و Error Budget: RunCheckpoint، Lease، RetryPolicy، HealthSignal، SLO و IncidentEvent با idempotency key و monotonic version.
- Schema باید inputs=metrics، service tier و outputs=SLO report و deployment gate را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/job-queue.ts، checkpoint-store.ts، usage-ledger.ts و planned src/infra/؛ docs/runbooks/ برای عملیات؛ test/ برای crash/chaos/restore.
- ماژول اختصاصی planned: src/core/upgrades/up-046.ts؛ fixture و تست: test/up-046.test.ts

**وابستگی‌ها:** UP-045

**مرزهای امنیتی:**
- SLO بدون measurement claim پذیرفته نشود

**تهدیدهای امنیتی:**
- double side effect، stale worker، حذف شواهد، failover حلقه‌ای و دسترسی operator خارج از audit.
- تهدید اختصاصی UP-046: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «SLO و Error Budget» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- crash/restart و lease reclaim؛ chaos برای timeout/partition؛ backup restore drill؛ load/SLO؛ property برای state monotonic و idempotency.
- تست اختصاصی UP-046: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- burn-rate alert و gate test

**Definition of Done:**
- failure modeها runbook و alert دارند، restore با RPO/RTO اندازه‌گیری شده، retry side effect را duplicate نمی‌کند، و هر عملیات حساس approval/audit دارد.
- UP-046 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/resilience-operations.ts
- test/audit-next-phases.test.ts

### 47. Error Taxonomy — UP-047

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| پایداری و عملیات | P1 | `partial` | `in_progress` |

**هدف:**
- خطاها به user، provider، tool، policy، security و platform تفکیک شوند.

**مسئله‌ای که حل می‌کند:**
- خرابی provider، worker یا storage می‌تواند Run را duplicate، گم‌شده یا غیرقابل‌برگشت کند و operator بدون SLO و drill شواهد ندارد. موضوع این پیشنهاد، «Error Taxonomy»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- خطاها به user، provider، tool، policy، security و platform تفکیک شوند.

**ورودی‌ها:**
- raw error، context

**خروجی‌ها:**
- stable error code و safe message

**Interface / Schema:**
- UP-047 / Error Taxonomy: RunCheckpoint، Lease، RetryPolicy، HealthSignal، SLO و IncidentEvent با idempotency key و monotonic version.
- Schema باید inputs=raw error، context و outputs=stable error code و safe message را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/job-queue.ts، checkpoint-store.ts، usage-ledger.ts و planned src/infra/؛ docs/runbooks/ برای عملیات؛ test/ برای crash/chaos/restore.
- ماژول اختصاصی planned: src/core/upgrades/up-047.ts؛ fixture و تست: test/up-047.test.ts

**وابستگی‌ها:** UP-001, UP-045

**مرزهای امنیتی:**
- raw stack به user نرسد

**تهدیدهای امنیتی:**
- double side effect، stale worker، حذف شواهد، failover حلقه‌ای و دسترسی operator خارج از audit.
- تهدید اختصاصی UP-047: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Error Taxonomy» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- crash/restart و lease reclaim؛ chaos برای timeout/partition؛ backup restore drill؛ load/SLO؛ property برای state monotonic و idempotency.
- تست اختصاصی UP-047: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- mapping coverage test

**Definition of Done:**
- failure modeها runbook و alert دارند، restore با RPO/RTO اندازه‌گیری شده، retry side effect را duplicate نمی‌کند، و هر عملیات حساس approval/audit دارد.
- UP-047 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/evidence-routing-operations.ts
- test/audit-next-phases-2.test.ts

### 48. Chaos Testing — UP-048

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| پایداری و عملیات | P1 | `partial` | `in_progress` |

**هدف:**
- قطع Provider، Queue، DB، شبکه و Worker کنترل‌شده آزمایش شود.

**مسئله‌ای که حل می‌کند:**
- خرابی provider، worker یا storage می‌تواند Run را duplicate، گم‌شده یا غیرقابل‌برگشت کند و operator بدون SLO و drill شواهد ندارد. موضوع این پیشنهاد، «Chaos Testing»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- قطع Provider، Queue، DB، شبکه و Worker کنترل‌شده آزمایش شود.

**ورودی‌ها:**
- fault plan، blast radius

**خروجی‌ها:**
- resilience report

**Interface / Schema:**
- UP-048 / Chaos Testing: RunCheckpoint، Lease، RetryPolicy، HealthSignal، SLO و IncidentEvent با idempotency key و monotonic version.
- Schema باید inputs=fault plan، blast radius و outputs=resilience report را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/job-queue.ts، checkpoint-store.ts، usage-ledger.ts و planned src/infra/؛ docs/runbooks/ برای عملیات؛ test/ برای crash/chaos/restore.
- ماژول اختصاصی planned: src/core/upgrades/up-048.ts؛ fixture و تست: test/up-048.test.ts

**وابستگی‌ها:** UP-041, UP-044

**مرزهای امنیتی:**
- Chaos فقط در محیط non-production یا با approval اجرا شود

**تهدیدهای امنیتی:**
- double side effect، stale worker، حذف شواهد، failover حلقه‌ای و دسترسی operator خارج از audit.
- تهدید اختصاصی UP-048: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Chaos Testing» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- crash/restart و lease reclaim؛ chaos برای timeout/partition؛ backup restore drill؛ load/SLO؛ property برای state monotonic و idempotency.
- تست اختصاصی UP-048: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- fault injection recovery criteria

**Definition of Done:**
- failure modeها runbook و alert دارند، restore با RPO/RTO اندازه‌گیری شده، retry side effect را duplicate نمی‌کند، و هر عملیات حساس approval/audit دارد.
- UP-048 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/resilience-operations.ts
- test/audit-next-phases.test.ts

### 49. Backup Restore Drill — UP-049

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| پایداری و عملیات | P0 | `partial` | `in_progress` |

**هدف:**
- Backup واقعی restore شود و RTO/RPO اندازه‌گیری شود.

**مسئله‌ای که حل می‌کند:**
- خرابی provider، worker یا storage می‌تواند Run را duplicate، گم‌شده یا غیرقابل‌برگشت کند و operator بدون SLO و drill شواهد ندارد. موضوع این پیشنهاد، «Backup Restore Drill»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Backup واقعی restore شود و RTO/RPO اندازه‌گیری شود.

**ورودی‌ها:**
- backup، target environment

**خروجی‌ها:**
- restore evidence

**Interface / Schema:**
- UP-049 / Backup Restore Drill: RunCheckpoint، Lease، RetryPolicy، HealthSignal، SLO و IncidentEvent با idempotency key و monotonic version.
- Schema باید inputs=backup، target environment و outputs=restore evidence را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/job-queue.ts، checkpoint-store.ts، usage-ledger.ts و planned src/infra/؛ docs/runbooks/ برای عملیات؛ test/ برای crash/chaos/restore.
- ماژول اختصاصی planned: src/core/upgrades/up-049.ts؛ fixture و تست: test/up-049.test.ts

**وابستگی‌ها:** UP-003, UP-004

**مرزهای امنیتی:**
- داده واقعی در target عمومی افشا نشود

**تهدیدهای امنیتی:**
- double side effect، stale worker، حذف شواهد، failover حلقه‌ای و دسترسی operator خارج از audit.
- تهدید اختصاصی UP-049: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Backup Restore Drill» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- crash/restart و lease reclaim؛ chaos برای timeout/partition؛ backup restore drill؛ load/SLO؛ property برای state monotonic و idempotency.
- تست اختصاصی UP-049: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- دوره‌ای restore و checksum مقایسه شود

**Definition of Done:**
- failure modeها runbook و alert دارند، restore با RPO/RTO اندازه‌گیری شده، retry side effect را duplicate نمی‌کند، و هر عملیات حساس approval/audit دارد.
- UP-049 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/resilience-operations.ts
- test/audit-next-phases.test.ts

### 50. Multi-Region — UP-050

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| پایداری و عملیات | P2 | `partial` | `in_progress` |

**هدف:**
- Region ثانویه، failover، replication و data residency طراحی شود.

**مسئله‌ای که حل می‌کند:**
- خرابی provider، worker یا storage می‌تواند Run را duplicate، گم‌شده یا غیرقابل‌برگشت کند و operator بدون SLO و drill شواهد ندارد. موضوع این پیشنهاد، «Multi-Region»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Region ثانویه، failover، replication و data residency طراحی شود.

**ورودی‌ها:**
- region policy، replication lag

**خروجی‌ها:**
- DR plan و routing

**Interface / Schema:**
- UP-050 / Multi-Region: RunCheckpoint، Lease، RetryPolicy، HealthSignal، SLO و IncidentEvent با idempotency key و monotonic version.
- Schema باید inputs=region policy، replication lag و outputs=DR plan و routing را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/job-queue.ts، checkpoint-store.ts، usage-ledger.ts و planned src/infra/؛ docs/runbooks/ برای عملیات؛ test/ برای crash/chaos/restore.
- ماژول اختصاصی planned: src/core/upgrades/up-050.ts؛ fixture و تست: test/up-050.test.ts

**وابستگی‌ها:** UP-049

**مرزهای امنیتی:**
- residency و tenant policy مقدم بر latency است

**تهدیدهای امنیتی:**
- double side effect، stale worker، حذف شواهد، failover حلقه‌ای و دسترسی operator خارج از audit.
- تهدید اختصاصی UP-050: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Multi-Region» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- crash/restart و lease reclaim؛ chaos برای timeout/partition؛ backup restore drill؛ load/SLO؛ property برای state monotonic و idempotency.
- تست اختصاصی UP-050: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- regional outage exercise

**Definition of Done:**
- failure modeها runbook و alert دارند، restore با RPO/RTO اندازه‌گیری شده، retry side effect را duplicate نمی‌کند، و هر عملیات حساس approval/audit دارد.
- UP-050 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/resilience-operations.ts
- test/audit-next-phases.test.ts

### 51. Usage Ledger — UP-051

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| هزینه و Compute | P0 | `partial` | `in_progress` |

**هدف:**
- Token، CPU، GPU، storage، network و provider cost به Tenant/Project/Run نسبت داده شود.

**مسئله‌ای که حل می‌کند:**
- انتخاب free/paid/local اگر فقط model را عوض کند، سقف هزینه، privacy، quota و parallelism واقعاً کنترل نمی‌شوند. موضوع این پیشنهاد، «Usage Ledger»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Token، CPU، GPU، storage، network و provider cost به Tenant/Project/Run نسبت داده شود.

**ورودی‌ها:**
- provider usage، run context

**خروجی‌ها:**
- append-only usage entries

**Interface / Schema:**
- UP-051 / Usage Ledger: ComputePlan، BudgetReservation، TokenUsage، ProviderQuota و CostQualityDecision با واحد token/request/time و currency مشخص.
- Schema باید inputs=provider usage، run context و outputs=append-only usage entries را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/compute-mode.ts، usage-ledger.ts و free-provider-pool.ts؛ schema/ برای ledger/budget؛ test/ برای hard stop و quota.
- ماژول اختصاصی planned: src/core/upgrades/up-051.ts؛ fixture و تست: test/up-051.test.ts

**وابستگی‌ها:** UP-001, UP-006

**مرزهای امنیتی:**
- currency و Tenant mix نشود؛ raw key ذخیره نشود

**تهدیدهای امنیتی:**
- عبور از budget، شمارش ناقص cached tokens، ارسال داده local به cloud، quota exhaustion و گزارش هزینه جعلی.
- تهدید اختصاصی UP-051: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Usage Ledger» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای accounting/reservation؛ provider integration با reported usage؛ concurrent overspend؛ hard-stop؛ local egress denial؛ property برای conservation.
- تست اختصاصی UP-051: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- ledger reconciliation با فاکتور fixture

**Definition of Done:**
- تمام compute config از mode انتخابی مشتق می‌شود، reserve قبل از call انجام می‌شود، توقف سخت قابل مشاهده است، و discrepancy هزینه evidence دارد.
- UP-051 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/usage-ledger.ts

### 52. Pre-Run Budget — UP-052

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| هزینه و Compute | P0 | `partial` | `in_progress` |

**هدف:**
- قبل از Model/Tool call هزینه و Token projection با ceiling مقایسه شود.

**مسئله‌ای که حل می‌کند:**
- انتخاب free/paid/local اگر فقط model را عوض کند، سقف هزینه، privacy، quota و parallelism واقعاً کنترل نمی‌شوند. موضوع این پیشنهاد، «Pre-Run Budget»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- قبل از Model/Tool call هزینه و Token projection با ceiling مقایسه شود.

**ورودی‌ها:**
- budget policy، projection، current ledger

**خروجی‌ها:**
- allow/deny decision

**Interface / Schema:**
- UP-052 / Pre-Run Budget: ComputePlan، BudgetReservation، TokenUsage، ProviderQuota و CostQualityDecision با واحد token/request/time و currency مشخص.
- Schema باید inputs=budget policy، projection، current ledger و outputs=allow/deny decision را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/compute-mode.ts، usage-ledger.ts و free-provider-pool.ts؛ schema/ برای ledger/budget؛ test/ برای hard stop و quota.
- ماژول اختصاصی planned: src/core/upgrades/up-052.ts؛ fixture و تست: test/up-052.test.ts

**وابستگی‌ها:** UP-051

**مرزهای امنیتی:**
- budget deny باید قبل از side effect باشد

**تهدیدهای امنیتی:**
- عبور از budget، شمارش ناقص cached tokens، ارسال داده local به cloud، quota exhaustion و گزارش هزینه جعلی.
- تهدید اختصاصی UP-052: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Pre-Run Budget» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای accounting/reservation؛ provider integration با reported usage؛ concurrent overspend؛ hard-stop؛ local egress denial؛ property برای conservation.
- تست اختصاصی UP-052: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- over-budget call هرگز اجرا نشود

**Definition of Done:**
- تمام compute config از mode انتخابی مشتق می‌شود، reserve قبل از call انجام می‌شود، توقف سخت قابل مشاهده است، و discrepancy هزینه evidence دارد.
- UP-052 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/resilience-operations.ts
- test/audit-next-phases.test.ts

### 53. Token Preflight — UP-053

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| هزینه و Compute | P1 | `partial` | `in_progress` |

**هدف:**
- اندازه Context، input/output و احتمال overflow قبل از provider محاسبه شود.

**مسئله‌ای که حل می‌کند:**
- انتخاب free/paid/local اگر فقط model را عوض کند، سقف هزینه، privacy، quota و parallelism واقعاً کنترل نمی‌شوند. موضوع این پیشنهاد، «Token Preflight»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- اندازه Context، input/output و احتمال overflow قبل از provider محاسبه شود.

**ورودی‌ها:**
- messages، model context window

**خروجی‌ها:**
- preflight estimate

**Interface / Schema:**
- UP-053 / Token Preflight: ComputePlan، BudgetReservation، TokenUsage، ProviderQuota و CostQualityDecision با واحد token/request/time و currency مشخص.
- Schema باید inputs=messages، model context window و outputs=preflight estimate را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/compute-mode.ts، usage-ledger.ts و free-provider-pool.ts؛ schema/ برای ledger/budget؛ test/ برای hard stop و quota.
- ماژول اختصاصی planned: src/core/upgrades/up-053.ts؛ fixture و تست: test/up-053.test.ts

**وابستگی‌ها:** UP-051, UP-083

**مرزهای امنیتی:**
- estimate محافظه‌کارانه و عدم ارسال Secret

**تهدیدهای امنیتی:**
- عبور از budget، شمارش ناقص cached tokens، ارسال داده local به cloud، quota exhaustion و گزارش هزینه جعلی.
- تهدید اختصاصی UP-053: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Token Preflight» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای accounting/reservation؛ provider integration با reported usage؛ concurrent overspend؛ hard-stop؛ local egress denial؛ property برای conservation.
- تست اختصاصی UP-053: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- boundary tests برای context limit

**Definition of Done:**
- تمام compute config از mode انتخابی مشتق می‌شود، reserve قبل از call انجام می‌شود، توقف سخت قابل مشاهده است، و discrepancy هزینه evidence دارد.
- UP-053 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/resilience-operations.ts
- test/audit-next-phases.test.ts

### 54. Cost-Quality Optimizer — UP-054

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| هزینه و Compute | P1 | `partial` | `in_progress` |

**هدف:**
- با توجه به کیفیت، هزینه، latency، privacy و Local availability مسیر انتخاب شود.

**مسئله‌ای که حل می‌کند:**
- انتخاب free/paid/local اگر فقط model را عوض کند، سقف هزینه، privacy، quota و parallelism واقعاً کنترل نمی‌شوند. موضوع این پیشنهاد، «Cost-Quality Optimizer»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- با توجه به کیفیت، هزینه، latency، privacy و Local availability مسیر انتخاب شود.

**ورودی‌ها:**
- Pareto scores، budget

**خروجی‌ها:**
- route recommendation

**Interface / Schema:**
- UP-054 / Cost-Quality Optimizer: ComputePlan، BudgetReservation، TokenUsage، ProviderQuota و CostQualityDecision با واحد token/request/time و currency مشخص.
- Schema باید inputs=Pareto scores، budget و outputs=route recommendation را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/compute-mode.ts، usage-ledger.ts و free-provider-pool.ts؛ schema/ برای ledger/budget؛ test/ برای hard stop و quota.
- ماژول اختصاصی planned: src/core/upgrades/up-054.ts؛ fixture و تست: test/up-054.test.ts

**وابستگی‌ها:** UP-028, UP-052

**مرزهای امنیتی:**
- ارزان‌تر نمی‌تواند hard privacy را بشکند

**تهدیدهای امنیتی:**
- عبور از budget، شمارش ناقص cached tokens، ارسال داده local به cloud، quota exhaustion و گزارش هزینه جعلی.
- تهدید اختصاصی UP-054: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Cost-Quality Optimizer» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای accounting/reservation؛ provider integration با reported usage؛ concurrent overspend؛ hard-stop؛ local egress denial؛ property برای conservation.
- تست اختصاصی UP-054: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- budget/quality tradeoff report

**Definition of Done:**
- تمام compute config از mode انتخابی مشتق می‌شود، reserve قبل از call انجام می‌شود، توقف سخت قابل مشاهده است، و discrepancy هزینه evidence دارد.
- UP-054 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/resilience-operations.ts
- test/audit-next-phases.test.ts

### 55. Provider Quota Scheduler — UP-055

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| هزینه و Compute | P0 | `partial` | `in_progress` |

**هدف:**
- RPM، RPD، TPM، TPD و monthly quota در Scheduler اعمال شود.

**مسئله‌ای که حل می‌کند:**
- انتخاب free/paid/local اگر فقط model را عوض کند، سقف هزینه، privacy، quota و parallelism واقعاً کنترل نمی‌شوند. موضوع این پیشنهاد، «Provider Quota Scheduler»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- RPM، RPD، TPM، TPD و monthly quota در Scheduler اعمال شود.

**ورودی‌ها:**
- quota catalog، usage ledger

**خروجی‌ها:**
- admission decision و next retry

**Interface / Schema:**
- UP-055 / Provider Quota Scheduler: ComputePlan، BudgetReservation، TokenUsage، ProviderQuota و CostQualityDecision با واحد token/request/time و currency مشخص.
- Schema باید inputs=quota catalog، usage ledger و outputs=admission decision و next retry را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/compute-mode.ts، usage-ledger.ts و free-provider-pool.ts؛ schema/ برای ledger/budget؛ test/ برای hard stop و quota.
- ماژول اختصاصی planned: src/core/upgrades/up-055.ts؛ fixture و تست: test/up-055.test.ts

**وابستگی‌ها:** UP-051, UP-055

**مرزهای امنیتی:**
- درخواست بیشتر از quota ارسال نشود

**تهدیدهای امنیتی:**
- عبور از budget، شمارش ناقص cached tokens، ارسال داده local به cloud، quota exhaustion و گزارش هزینه جعلی.
- تهدید اختصاصی UP-055: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Provider Quota Scheduler» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای accounting/reservation؛ provider integration با reported usage؛ concurrent overspend؛ hard-stop؛ local egress denial؛ property برای conservation.
- تست اختصاصی UP-055: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- quota exhaustion و rollover test

**Definition of Done:**
- تمام compute config از mode انتخابی مشتق می‌شود، reserve قبل از call انجام می‌شود، توقف سخت قابل مشاهده است، و discrepancy هزینه evidence دارد.
- UP-055 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/resilience-operations.ts
- test/audit-next-phases.test.ts

### 56. Local Model Catalog — UP-056

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| هزینه و Compute | P1 | `partial` | `in_progress` |

**هدف:**
- مدل Local با VRAM، quantization، زبان، context و benchmark ثبت شود.

**مسئله‌ای که حل می‌کند:**
- انتخاب free/paid/local اگر فقط model را عوض کند، سقف هزینه، privacy، quota و parallelism واقعاً کنترل نمی‌شوند. موضوع این پیشنهاد، «Local Model Catalog»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- مدل Local با VRAM، quantization، زبان، context و benchmark ثبت شود.

**ورودی‌ها:**
- local runtime discovery، model metadata

**خروجی‌ها:**
- capability catalog

**Interface / Schema:**
- UP-056 / Local Model Catalog: ComputePlan، BudgetReservation، TokenUsage، ProviderQuota و CostQualityDecision با واحد token/request/time و currency مشخص.
- Schema باید inputs=local runtime discovery، model metadata و outputs=capability catalog را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/compute-mode.ts، usage-ledger.ts و free-provider-pool.ts؛ schema/ برای ledger/budget؛ test/ برای hard stop و quota.
- ماژول اختصاصی planned: src/core/upgrades/up-056.ts؛ fixture و تست: test/up-056.test.ts

**وابستگی‌ها:** UP-012, UP-024

**مرزهای امنیتی:**
- مدل ناشناخته بدون scan اجرا نشود

**تهدیدهای امنیتی:**
- عبور از budget، شمارش ناقص cached tokens، ارسال داده local به cloud، quota exhaustion و گزارش هزینه جعلی.
- تهدید اختصاصی UP-056: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Local Model Catalog» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای accounting/reservation؛ provider integration با reported usage؛ concurrent overspend؛ hard-stop؛ local egress denial؛ property برای conservation.
- تست اختصاصی UP-056: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- catalog-to-router integration test

**Definition of Done:**
- تمام compute config از mode انتخابی مشتق می‌شود، reserve قبل از call انجام می‌شود، توقف سخت قابل مشاهده است، و discrepancy هزینه evidence دارد.
- UP-056 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/resilience-operations.ts
- test/audit-next-phases.test.ts

### 57. Quantization Profiles — UP-057

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| هزینه و Compute | P1 | `partial` | `in_progress` |

**هدف:**
- FP16/INT8/INT4 با کیفیت، memory و latency قابل مقایسه باشند.

**مسئله‌ای که حل می‌کند:**
- انتخاب free/paid/local اگر فقط model را عوض کند، سقف هزینه، privacy، quota و parallelism واقعاً کنترل نمی‌شوند. موضوع این پیشنهاد، «Quantization Profiles»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- FP16/INT8/INT4 با کیفیت، memory و latency قابل مقایسه باشند.

**ورودی‌ها:**
- model artifact، runtime

**خروجی‌ها:**
- profile benchmark

**Interface / Schema:**
- UP-057 / Quantization Profiles: ComputePlan، BudgetReservation، TokenUsage، ProviderQuota و CostQualityDecision با واحد token/request/time و currency مشخص.
- Schema باید inputs=model artifact، runtime و outputs=profile benchmark را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/compute-mode.ts، usage-ledger.ts و free-provider-pool.ts؛ schema/ برای ledger/budget؛ test/ برای hard stop و quota.
- ماژول اختصاصی planned: src/core/upgrades/up-057.ts؛ fixture و تست: test/up-057.test.ts

**وابستگی‌ها:** UP-056

**مرزهای امنیتی:**
- profile فاقد provenance قابل promotion نیست

**تهدیدهای امنیتی:**
- عبور از budget، شمارش ناقص cached tokens، ارسال داده local به cloud، quota exhaustion و گزارش هزینه جعلی.
- تهدید اختصاصی UP-057: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Quantization Profiles» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای accounting/reservation؛ provider integration با reported usage؛ concurrent overspend؛ hard-stop؛ local egress denial؛ property برای conservation.
- تست اختصاصی UP-057: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- same suite across profiles

**Definition of Done:**
- تمام compute config از mode انتخابی مشتق می‌شود، reserve قبل از call انجام می‌شود، توقف سخت قابل مشاهده است، و discrepancy هزینه evidence دارد.
- UP-057 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/resilience-operations.ts
- test/audit-next-phases.test.ts

### 58. Provider Health Score — UP-058

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| هزینه و Compute | P1 | `partial` | `in_progress` |

**هدف:**
- Availability، latency، error، quality، cost و privacy به Score تبدیل شود.

**مسئله‌ای که حل می‌کند:**
- انتخاب free/paid/local اگر فقط model را عوض کند، سقف هزینه، privacy، quota و parallelism واقعاً کنترل نمی‌شوند. موضوع این پیشنهاد، «Provider Health Score»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Availability، latency، error، quality، cost و privacy به Score تبدیل شود.

**ورودی‌ها:**
- health events، trial results

**خروجی‌ها:**
- health score با decay

**Interface / Schema:**
- UP-058 / Provider Health Score: ComputePlan، BudgetReservation، TokenUsage، ProviderQuota و CostQualityDecision با واحد token/request/time و currency مشخص.
- Schema باید inputs=health events، trial results و outputs=health score با decay را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/compute-mode.ts، usage-ledger.ts و free-provider-pool.ts؛ schema/ برای ledger/budget؛ test/ برای hard stop و quota.
- ماژول اختصاصی planned: src/core/upgrades/up-058.ts؛ fixture و تست: test/up-058.test.ts

**وابستگی‌ها:** UP-026, UP-044

**مرزهای امنیتی:**
- score فقط advisory است و policy را دور نمی‌زند

**تهدیدهای امنیتی:**
- عبور از budget، شمارش ناقص cached tokens، ارسال داده local به cloud، quota exhaustion و گزارش هزینه جعلی.
- تهدید اختصاصی UP-058: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Provider Health Score» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای accounting/reservation؛ provider integration با reported usage؛ concurrent overspend؛ hard-stop؛ local egress denial؛ property برای conservation.
- تست اختصاصی UP-058: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- outage و recovery test

**Definition of Done:**
- تمام compute config از mode انتخابی مشتق می‌شود، reserve قبل از call انجام می‌شود، توقف سخت قابل مشاهده است، و discrepancy هزینه evidence دارد.
- UP-058 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/resilience-operations.ts
- test/audit-next-phases.test.ts

### 59. Tenant-Safe Response Cache — UP-059

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| هزینه و Compute | P1 | `partial` | `in_progress` |

**هدف:**
- Cache با tenant key، settings hash، TTL و حذف‌پذیری به کار رود.

**مسئله‌ای که حل می‌کند:**
- انتخاب free/paid/local اگر فقط model را عوض کند، سقف هزینه، privacy، quota و parallelism واقعاً کنترل نمی‌شوند. موضوع این پیشنهاد، «Tenant-Safe Response Cache»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Cache با tenant key، settings hash، TTL و حذف‌پذیری به کار رود.

**ورودی‌ها:**
- request fingerprint، tenant، response

**خروجی‌ها:**
- cache hit/miss audit

**Interface / Schema:**
- UP-059 / Tenant-Safe Response Cache: ComputePlan، BudgetReservation، TokenUsage، ProviderQuota و CostQualityDecision با واحد token/request/time و currency مشخص.
- Schema باید inputs=request fingerprint، tenant، response و outputs=cache hit/miss audit را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/compute-mode.ts، usage-ledger.ts و free-provider-pool.ts؛ schema/ برای ledger/budget؛ test/ برای hard stop و quota.
- ماژول اختصاصی planned: src/core/upgrades/up-059.ts؛ fixture و تست: test/up-059.test.ts

**وابستگی‌ها:** UP-004, UP-039

**مرزهای امنیتی:**
- cross-tenant hit و Secret cache ممنوع

**تهدیدهای امنیتی:**
- عبور از budget، شمارش ناقص cached tokens، ارسال داده local به cloud، quota exhaustion و گزارش هزینه جعلی.
- تهدید اختصاصی UP-059: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Tenant-Safe Response Cache» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای accounting/reservation؛ provider integration با reported usage؛ concurrent overspend؛ hard-stop؛ local egress denial؛ property برای conservation.
- تست اختصاصی UP-059: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- poisoning و isolation test

**Definition of Done:**
- تمام compute config از mode انتخابی مشتق می‌شود، reserve قبل از call انجام می‌شود، توقف سخت قابل مشاهده است، و discrepancy هزینه evidence دارد.
- UP-059 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/resilience-operations.ts
- test/audit-next-phases.test.ts

### 60. Energy Metering — UP-060

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| هزینه و Compute | P2 | `partial` | `in_progress` |

**هدف:**
- مصرف انرژی و carbon تقریبی Local و Cloud با caveat گزارش شود.

**مسئله‌ای که حل می‌کند:**
- انتخاب free/paid/local اگر فقط model را عوض کند، سقف هزینه، privacy، quota و parallelism واقعاً کنترل نمی‌شوند. موضوع این پیشنهاد، «Energy Metering»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- مصرف انرژی و carbon تقریبی Local و Cloud با caveat گزارش شود.

**ورودی‌ها:**
- GPU time، provider factor

**خروجی‌ها:**
- energy estimate

**Interface / Schema:**
- UP-060 / Energy Metering: ComputePlan، BudgetReservation، TokenUsage، ProviderQuota و CostQualityDecision با واحد token/request/time و currency مشخص.
- Schema باید inputs=GPU time، provider factor و outputs=energy estimate را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/compute-mode.ts، usage-ledger.ts و free-provider-pool.ts؛ schema/ برای ledger/budget؛ test/ برای hard stop و quota.
- ماژول اختصاصی planned: src/core/upgrades/up-060.ts؛ fixture و تست: test/up-060.test.ts

**وابستگی‌ها:** UP-051

**مرزهای امنیتی:**
- عدد تقریبی به‌عنوان اندازه‌گیری قطعی ارائه نشود

**تهدیدهای امنیتی:**
- عبور از budget، شمارش ناقص cached tokens، ارسال داده local به cloud، quota exhaustion و گزارش هزینه جعلی.
- تهدید اختصاصی UP-060: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Energy Metering» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- unit برای accounting/reservation؛ provider integration با reported usage؛ concurrent overspend؛ hard-stop؛ local egress denial؛ property برای conservation.
- تست اختصاصی UP-060: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- factor provenance و uncertainty test

**Definition of Done:**
- تمام compute config از mode انتخابی مشتق می‌شود، reserve قبل از call انجام می‌شود، توقف سخت قابل مشاهده است، و discrepancy هزینه evidence دارد.
- UP-060 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/resilience-operations.ts
- test/audit-next-phases.test.ts

### 61. Visual DAG Editor — UP-061

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| UX و همکاری | P1 | `partial` | `in_progress` |

**هدف:**
- کاربر DAG، dependency، Model، Approval و output را ببیند و با validation ویرایش کند.

**مسئله‌ای که حل می‌کند:**
- کاربر بدون timeline، approval، diff و rollback قابل فهم نمی‌تواند اثر تصمیم agent را قبل از side effect بازبینی کند. موضوع این پیشنهاد، «Visual DAG Editor»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- کاربر DAG، dependency، Model، Approval و output را ببیند و با validation ویرایش کند.

**ورودی‌ها:**
- Task DAG، permissions

**خروجی‌ها:**
- versioned plan و validation errors

**Interface / Schema:**
- UP-061 / Visual DAG Editor: UI view-model و event stream versioned برای Run/DAG/Diff/Approval؛ optimistic update ممنوع مگر با server revision.
- Schema باید inputs=Task DAG، permissions و outputs=versioned plan و validation errors را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- apps/web/ (planned) و apps/playground/ برای reference؛ src/core/ state/evidence؛ schema/ برای SSE/event؛ test/ و e2e/.
- ماژول اختصاصی planned: src/core/upgrades/up-061.ts؛ fixture و تست: test/up-061.test.ts

**وابستگی‌ها:** UP-023, UP-002

**مرزهای امنیتی:**
- ویرایش UI نمی‌تواند policy را bypass کند

**تهدیدهای امنیتی:**
- افشای tenant در UI، clickjacking، approval اشتباه، XSS از محتوای خارجی و نمایش secret در diff/log.
- تهدید اختصاصی UP-061: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Visual DAG Editor» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- component accessibility؛ E2E از login تا approval؛ SSE reconnect/replay؛ cross-tenant UI؛ XSS/CSP؛ keyboard/RTL و visual regression.
- تست اختصاصی UP-061: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- cycle و unauthorized edit test

**Definition of Done:**
- هر side effect قبل از approval نمایش داده می‌شود، eventها replay می‌شوند، UI secret را redact می‌کند، و جریان اصلی با تست accessibility و isolation پاس است.
- UP-061 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/delivery-trust.ts
- test/audit-next-phases.test.ts

### 62. Time-Travel Timeline — UP-062

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| UX و همکاری | P1 | `partial` | `in_progress` |

**هدف:**
- از event/checkpoint وضعیت Run در زمان گذشته بازسازی شود.

**مسئله‌ای که حل می‌کند:**
- کاربر بدون timeline، approval، diff و rollback قابل فهم نمی‌تواند اثر تصمیم agent را قبل از side effect بازبینی کند. موضوع این پیشنهاد، «Time-Travel Timeline»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- از event/checkpoint وضعیت Run در زمان گذشته بازسازی شود.

**ورودی‌ها:**
- event stream، checkpoints

**خروجی‌ها:**
- read-only historical projection

**Interface / Schema:**
- UP-062 / Time-Travel Timeline: UI view-model و event stream versioned برای Run/DAG/Diff/Approval؛ optimistic update ممنوع مگر با server revision.
- Schema باید inputs=event stream، checkpoints و outputs=read-only historical projection را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- apps/web/ (planned) و apps/playground/ برای reference؛ src/core/ state/evidence؛ schema/ برای SSE/event؛ test/ و e2e/.
- ماژول اختصاصی planned: src/core/upgrades/up-062.ts؛ fixture و تست: test/up-062.test.ts

**وابستگی‌ها:** UP-041, UP-007

**مرزهای امنیتی:**
- گذشته قابل ویرایش یا اجرای side effect نیست

**تهدیدهای امنیتی:**
- افشای tenant در UI، clickjacking، approval اشتباه، XSS از محتوای خارجی و نمایش secret در diff/log.
- تهدید اختصاصی UP-062: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Time-Travel Timeline» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- component accessibility؛ E2E از login تا approval؛ SSE reconnect/replay؛ cross-tenant UI؛ XSS/CSP؛ keyboard/RTL و visual regression.
- تست اختصاصی UP-062: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- replay snapshot comparison

**Definition of Done:**
- هر side effect قبل از approval نمایش داده می‌شود، eventها replay می‌شوند، UI secret را redact می‌کند، و جریان اصلی با تست accessibility و isolation پاس است.
- UP-062 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/delivery-trust.ts
- test/audit-next-phases.test.ts

### 63. Live Diff — UP-063

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| UX و همکاری | P1 | `partial` | `in_progress` |

**هدف:**
- Diff لحظه‌ای با فایل، دلیل، Task، Test و author نمایش داده شود.

**مسئله‌ای که حل می‌کند:**
- کاربر بدون timeline، approval، diff و rollback قابل فهم نمی‌تواند اثر تصمیم agent را قبل از side effect بازبینی کند. موضوع این پیشنهاد، «Live Diff»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Diff لحظه‌ای با فایل، دلیل، Task، Test و author نمایش داده شود.

**ورودی‌ها:**
- patch events، test events

**خروجی‌ها:**
- reviewable diff

**Interface / Schema:**
- UP-063 / Live Diff: UI view-model و event stream versioned برای Run/DAG/Diff/Approval؛ optimistic update ممنوع مگر با server revision.
- Schema باید inputs=patch events، test events و outputs=reviewable diff را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- apps/web/ (planned) و apps/playground/ برای reference؛ src/core/ state/evidence؛ schema/ برای SSE/event؛ test/ و e2e/.
- ماژول اختصاصی planned: src/core/upgrades/up-063.ts؛ fixture و تست: test/up-063.test.ts

**وابستگی‌ها:** UP-063

**مرزهای امنیتی:**
- Secret و فایل خارج از allowlist نمایش داده نشود

**تهدیدهای امنیتی:**
- افشای tenant در UI، clickjacking، approval اشتباه، XSS از محتوای خارجی و نمایش secret در diff/log.
- تهدید اختصاصی UP-063: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Live Diff» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- component accessibility؛ E2E از login تا approval؛ SSE reconnect/replay؛ cross-tenant UI؛ XSS/CSP؛ keyboard/RTL و visual regression.
- تست اختصاصی UP-063: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- large diff و binary behavior

**Definition of Done:**
- هر side effect قبل از approval نمایش داده می‌شود، eventها replay می‌شوند، UI secret را redact می‌کند، و جریان اصلی با تست accessibility و isolation پاس است.
- UP-063 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/delivery-trust.ts
- test/audit-next-phases.test.ts

### 64. Explainable Routing UI — UP-064

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| UX و همکاری | P1 | `partial` | `in_progress` |

**هدف:**
- Explanation امن، evidence، confidence، cost و rejected candidates نمایش داده شود.

**مسئله‌ای که حل می‌کند:**
- کاربر بدون timeline، approval، diff و rollback قابل فهم نمی‌تواند اثر تصمیم agent را قبل از side effect بازبینی کند. موضوع این پیشنهاد، «Explainable Routing UI»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Explanation امن، evidence، confidence، cost و rejected candidates نمایش داده شود.

**ورودی‌ها:**
- route result، evidence digest

**خروجی‌ها:**
- decision card

**Interface / Schema:**
- UP-064 / Explainable Routing UI: UI view-model و event stream versioned برای Run/DAG/Diff/Approval؛ optimistic update ممنوع مگر با server revision.
- Schema باید inputs=route result، evidence digest و outputs=decision card را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- apps/web/ (planned) و apps/playground/ برای reference؛ src/core/ state/evidence؛ schema/ برای SSE/event؛ test/ و e2e/.
- ماژول اختصاصی planned: src/core/upgrades/up-064.ts؛ fixture و تست: test/up-064.test.ts

**وابستگی‌ها:** UP-029, UP-064

**مرزهای امنیتی:**
- chain-of-thought خام نمایش داده نشود

**تهدیدهای امنیتی:**
- افشای tenant در UI، clickjacking، approval اشتباه، XSS از محتوای خارجی و نمایش secret در diff/log.
- تهدید اختصاصی UP-064: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Explainable Routing UI» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- component accessibility؛ E2E از login تا approval؛ SSE reconnect/replay؛ cross-tenant UI؛ XSS/CSP؛ keyboard/RTL و visual regression.
- تست اختصاصی UP-064: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- UI explanation matches core hash

**Definition of Done:**
- هر side effect قبل از approval نمایش داده می‌شود، eventها replay می‌شوند، UI secret را redact می‌کند، و جریان اصلی با تست accessibility و isolation پاس است.
- UP-064 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/delivery-trust.ts
- test/audit-next-phases.test.ts

### 65. Approval Inbox — UP-065

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| UX و همکاری | P0 | `partial` | `in_progress` |

**هدف:**
- Approval حساس با Diff، Risk، Cost، Expiry و دلیل در Inbox جمع شود.

**مسئله‌ای که حل می‌کند:**
- کاربر بدون timeline، approval، diff و rollback قابل فهم نمی‌تواند اثر تصمیم agent را قبل از side effect بازبینی کند. موضوع این پیشنهاد، «Approval Inbox»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Approval حساس با Diff، Risk، Cost، Expiry و دلیل در Inbox جمع شود.

**ورودی‌ها:**
- approval request، approver identity

**خروجی‌ها:**
- approval decision و audit

**Interface / Schema:**
- UP-065 / Approval Inbox: UI view-model و event stream versioned برای Run/DAG/Diff/Approval؛ optimistic update ممنوع مگر با server revision.
- Schema باید inputs=approval request، approver identity و outputs=approval decision و audit را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- apps/web/ (planned) و apps/playground/ برای reference؛ src/core/ state/evidence؛ schema/ برای SSE/event؛ test/ و e2e/.
- ماژول اختصاصی planned: src/core/upgrades/up-065.ts؛ fixture و تست: test/up-065.test.ts

**وابستگی‌ها:** UP-001, UP-065

**مرزهای امنیتی:**
- self-approval، stale MFA و agent approval رد شود

**تهدیدهای امنیتی:**
- افشای tenant در UI، clickjacking، approval اشتباه، XSS از محتوای خارجی و نمایش secret در diff/log.
- تهدید اختصاصی UP-065: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Approval Inbox» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- component accessibility؛ E2E از login تا approval؛ SSE reconnect/replay؛ cross-tenant UI؛ XSS/CSP؛ keyboard/RTL و visual regression.
- تست اختصاصی UP-065: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- expired and delegated approval test

**Definition of Done:**
- هر side effect قبل از approval نمایش داده می‌شود، eventها replay می‌شوند، UI secret را redact می‌کند، و جریان اصلی با تست accessibility و isolation پاس است.
- UP-065 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/delivery-trust.ts
- test/audit-next-phases.test.ts

### 66. GitHub Integration — UP-066

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| UX و همکاری | P1 | `partial` | `in_progress` |

**هدف:**
- Branch، commit، PR و review با App/OAuth محدود و audit شده انجام شود.

**مسئله‌ای که حل می‌کند:**
- کاربر بدون timeline، approval، diff و rollback قابل فهم نمی‌تواند اثر تصمیم agent را قبل از side effect بازبینی کند. موضوع این پیشنهاد، «GitHub Integration»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Branch، commit، PR و review با App/OAuth محدود و audit شده انجام شود.

**ورودی‌ها:**
- repo permission، branch policy، patch

**خروجی‌ها:**
- PR artifact

**Interface / Schema:**
- UP-066 / GitHub Integration: UI view-model و event stream versioned برای Run/DAG/Diff/Approval؛ optimistic update ممنوع مگر با server revision.
- Schema باید inputs=repo permission، branch policy، patch و outputs=PR artifact را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- apps/web/ (planned) و apps/playground/ برای reference؛ src/core/ state/evidence؛ schema/ برای SSE/event؛ test/ و e2e/.
- ماژول اختصاصی planned: src/core/upgrades/up-066.ts؛ fixture و تست: test/up-066.test.ts

**وابستگی‌ها:** UP-001, UP-031

**مرزهای امنیتی:**
- هیچ push مستقیم به main و deploy بدون approval

**تهدیدهای امنیتی:**
- افشای tenant در UI، clickjacking، approval اشتباه، XSS از محتوای خارجی و نمایش secret در diff/log.
- تهدید اختصاصی UP-066: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «GitHub Integration» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- component accessibility؛ E2E از login تا approval؛ SSE reconnect/replay؛ cross-tenant UI؛ XSS/CSP؛ keyboard/RTL و visual regression.
- تست اختصاصی UP-066: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- real test repo integration

**Definition of Done:**
- هر side effect قبل از approval نمایش داده می‌شود، eventها replay می‌شوند، UI secret را redact می‌کند، و جریان اصلی با تست accessibility و isolation پاس است.
- UP-066 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/delivery-trust.ts
- test/audit-next-phases.test.ts

### 67. Issue Tracker Integration — UP-067

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| UX و همکاری | P1 | `partial` | `in_progress` |

**هدف:**
- Issue با Task DAG لینک شود و status sync با mapping محدود انجام شود.

**مسئله‌ای که حل می‌کند:**
- کاربر بدون timeline، approval، diff و rollback قابل فهم نمی‌تواند اثر تصمیم agent را قبل از side effect بازبینی کند. موضوع این پیشنهاد، «Issue Tracker Integration»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Issue با Task DAG لینک شود و status sync با mapping محدود انجام شود.

**ورودی‌ها:**
- issue ID، project mapping

**خروجی‌ها:**
- linked task/event

**Interface / Schema:**
- UP-067 / Issue Tracker Integration: UI view-model و event stream versioned برای Run/DAG/Diff/Approval؛ optimistic update ممنوع مگر با server revision.
- Schema باید inputs=issue ID، project mapping و outputs=linked task/event را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- apps/web/ (planned) و apps/playground/ برای reference؛ src/core/ state/evidence؛ schema/ برای SSE/event؛ test/ و e2e/.
- ماژول اختصاصی planned: src/core/upgrades/up-067.ts؛ fixture و تست: test/up-067.test.ts

**وابستگی‌ها:** UP-007, UP-036

**مرزهای امنیتی:**
- متن Issue untrusted است و command محسوب نمی‌شود

**تهدیدهای امنیتی:**
- افشای tenant در UI، clickjacking، approval اشتباه، XSS از محتوای خارجی و نمایش secret در diff/log.
- تهدید اختصاصی UP-067: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Issue Tracker Integration» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- component accessibility؛ E2E از login تا approval؛ SSE reconnect/replay؛ cross-tenant UI؛ XSS/CSP؛ keyboard/RTL و visual regression.
- تست اختصاصی UP-067: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- duplicate webhook and replay test

**Definition of Done:**
- هر side effect قبل از approval نمایش داده می‌شود، eventها replay می‌شوند، UI secret را redact می‌کند، و جریان اصلی با تست accessibility و isolation پاس است.
- UP-067 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/delivery-trust.ts
- test/audit-next-phases.test.ts

### 68. Team Collaboration — UP-068

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| UX و همکاری | P1 | `partial` | `in_progress` |

**هدف:**
- Comment، handoff، delegation و review روی Run immutable ثبت شود.

**مسئله‌ای که حل می‌کند:**
- کاربر بدون timeline، approval، diff و rollback قابل فهم نمی‌تواند اثر تصمیم agent را قبل از side effect بازبینی کند. موضوع این پیشنهاد، «Team Collaboration»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Comment، handoff، delegation و review روی Run immutable ثبت شود.

**ورودی‌ها:**
- membership، run artifact

**خروجی‌ها:**
- comment thread و delegation audit

**Interface / Schema:**
- UP-068 / Team Collaboration: UI view-model و event stream versioned برای Run/DAG/Diff/Approval؛ optimistic update ممنوع مگر با server revision.
- Schema باید inputs=membership، run artifact و outputs=comment thread و delegation audit را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- apps/web/ (planned) و apps/playground/ برای reference؛ src/core/ state/evidence؛ schema/ برای SSE/event؛ test/ و e2e/.
- ماژول اختصاصی planned: src/core/upgrades/up-068.ts؛ fixture و تست: test/up-068.test.ts

**وابستگی‌ها:** UP-010, UP-065

**مرزهای امنیتی:**
- delegation permission و separation of duties حفظ شود

**تهدیدهای امنیتی:**
- افشای tenant در UI، clickjacking، approval اشتباه، XSS از محتوای خارجی و نمایش secret در diff/log.
- تهدید اختصاصی UP-068: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Team Collaboration» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- component accessibility؛ E2E از login تا approval؛ SSE reconnect/replay؛ cross-tenant UI؛ XSS/CSP؛ keyboard/RTL و visual regression.
- تست اختصاصی UP-068: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- two-user approval scenario

**Definition of Done:**
- هر side effect قبل از approval نمایش داده می‌شود، eventها replay می‌شوند، UI secret را redact می‌کند، و جریان اصلی با تست accessibility و isolation پاس است.
- UP-068 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/intake-and-collaboration.ts
- test/audit-next-phases-2.test.ts

### 69. Rollback — UP-069

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| UX و همکاری | P0 | `partial` | `in_progress` |

**هدف:**
- هر side effect قابل برگشت با commit/checkpoint و approval مشخص باشد.

**مسئله‌ای که حل می‌کند:**
- کاربر بدون timeline، approval، diff و rollback قابل فهم نمی‌تواند اثر تصمیم agent را قبل از side effect بازبینی کند. موضوع این پیشنهاد، «Rollback»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- هر side effect قابل برگشت با commit/checkpoint و approval مشخص باشد.

**ورودی‌ها:**
- artifact، checkpoint، target

**خروجی‌ها:**
- rollback plan و result

**Interface / Schema:**
- UP-069 / Rollback: UI view-model و event stream versioned برای Run/DAG/Diff/Approval؛ optimistic update ممنوع مگر با server revision.
- Schema باید inputs=artifact، checkpoint، target و outputs=rollback plan و result را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- apps/web/ (planned) و apps/playground/ برای reference؛ src/core/ state/evidence؛ schema/ برای SSE/event؛ test/ و e2e/.
- ماژول اختصاصی planned: src/core/upgrades/up-069.ts؛ fixture و تست: test/up-069.test.ts

**وابستگی‌ها:** UP-041, UP-066

**مرزهای امنیتی:**
- rollback production بدون approval ممنوع

**تهدیدهای امنیتی:**
- افشای tenant در UI، clickjacking، approval اشتباه، XSS از محتوای خارجی و نمایش secret در diff/log.
- تهدید اختصاصی UP-069: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Rollback» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- component accessibility؛ E2E از login تا approval؛ SSE reconnect/replay؛ cross-tenant UI؛ XSS/CSP؛ keyboard/RTL و visual regression.
- تست اختصاصی UP-069: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- rollback after partial failure

**Definition of Done:**
- هر side effect قبل از approval نمایش داده می‌شود، eventها replay می‌شوند، UI secret را redact می‌کند، و جریان اصلی با تست accessibility و isolation پاس است.
- UP-069 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/delivery-trust.ts
- test/audit-next-phases.test.ts

### 70. Progressive Onboarding — UP-070

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| UX و همکاری | P1 | `partial` | `in_progress` |

**هدف:**
- Demo/Local-first wizard از account تا اولین Run با Budget و Permission شفاف ارائه شود.

**مسئله‌ای که حل می‌کند:**
- کاربر بدون timeline، approval، diff و rollback قابل فهم نمی‌تواند اثر تصمیم agent را قبل از side effect بازبینی کند. موضوع این پیشنهاد، «Progressive Onboarding»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Demo/Local-first wizard از account تا اولین Run با Budget و Permission شفاف ارائه شود.

**ورودی‌ها:**
- user profile، compute mode

**خروجی‌ها:**
- onboarding state

**Interface / Schema:**
- UP-070 / Progressive Onboarding: UI view-model و event stream versioned برای Run/DAG/Diff/Approval؛ optimistic update ممنوع مگر با server revision.
- Schema باید inputs=user profile، compute mode و outputs=onboarding state را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- apps/web/ (planned) و apps/playground/ برای reference؛ src/core/ state/evidence؛ schema/ برای SSE/event؛ test/ و e2e/.
- ماژول اختصاصی planned: src/core/upgrades/up-070.ts؛ fixture و تست: test/up-070.test.ts

**وابستگی‌ها:** UP-002, UP-051

**مرزهای امنیتی:**
- بدون raw password و بدون فعال‌سازی ناخواسته paid provider

**تهدیدهای امنیتی:**
- افشای tenant در UI، clickjacking، approval اشتباه، XSS از محتوای خارجی و نمایش secret در diff/log.
- تهدید اختصاصی UP-070: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Progressive Onboarding» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- component accessibility؛ E2E از login تا approval؛ SSE reconnect/replay؛ cross-tenant UI؛ XSS/CSP؛ keyboard/RTL و visual regression.
- تست اختصاصی UP-070: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- new user funnel E2E

**Definition of Done:**
- هر side effect قبل از approval نمایش داده می‌شود، eventها replay می‌شوند، UI secret را redact می‌کند، و جریان اصلی با تست accessibility و isolation پاس است.
- UP-070 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/delivery-trust.ts
- test/audit-next-phases.test.ts

### 71. Run Worktrees — UP-071

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Execution و Developer Workflow | P0 | `partial` | `in_progress` |

**هدف:**
- هر Run Worktree مستقل و feature branch غیرمحافظت‌شده داشته باشد.

**مسئله‌ای که حل می‌کند:**
- تغییر agent بدون workspace ایزوله، test matrix و transaction می‌تواند branch کاربر را خراب یا artifact غیرقابل‌اعتماد تولید کند. موضوع این پیشنهاد، «Run Worktrees»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- هر Run Worktree مستقل و feature branch غیرمحافظت‌شده داشته باشد.

**ورودی‌ها:**
- repo، branch، run id

**خروجی‌ها:**
- workspace manifest

**Interface / Schema:**
- UP-071 / Run Worktrees: WorkspaceLease، PatchPlan، ApplyTransaction، TestMatrix و ArtifactAttestation؛ هر عملیات با base commit و diff hash مرتبط است.
- Schema باید inputs=repo، branch، run id و outputs=workspace manifest را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/task-dag.ts و planned src/execution/؛ schema/ برای patch/test/attestation؛ scripts/ برای adapter؛ test/ با fixture project.
- ماژول اختصاصی planned: src/core/upgrades/up-071.ts؛ fixture و تست: test/up-071.test.ts

**وابستگی‌ها:** UP-001, UP-066

**مرزهای امنیتی:**
- protected branch writable نباشد

**تهدیدهای امنیتی:**
- overwrite تغییر کاربر، merge conflict پنهان، اجرای command مخرب، artifact بدون provenance و push/deploy ناخواسته.
- تهدید اختصاصی UP-071: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Run Worktrees» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- fixture projects per language؛ transactional rollback؛ merge conflict؛ static/license/secret scan؛ test matrix؛ integration با protected main.
- تست اختصاصی UP-071: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- parallel run isolation test

**Definition of Done:**
- patch atomic و قابل rollback است، branch/worktree کاربر ایزوله است، test evidence ثبت شده، main هرگز مستقیم push نمی‌شود و deploy approval دارد.
- UP-071 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/delivery-trust.ts
- test/audit-next-phases.test.ts

### 72. Toolchain Registry — UP-072

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Execution و Developer Workflow | P1 | `partial` | `in_progress` |

**هدف:**
- Runtime، OS، package manager و system library به‌صورت reproducible تعریف شود.

**مسئله‌ای که حل می‌کند:**
- تغییر agent بدون workspace ایزوله، test matrix و transaction می‌تواند branch کاربر را خراب یا artifact غیرقابل‌اعتماد تولید کند. موضوع این پیشنهاد، «Toolchain Registry»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Runtime، OS، package manager و system library به‌صورت reproducible تعریف شود.

**ورودی‌ها:**
- repo manifest، image digest

**خروجی‌ها:**
- toolchain lock

**Interface / Schema:**
- UP-072 / Toolchain Registry: WorkspaceLease، PatchPlan، ApplyTransaction، TestMatrix و ArtifactAttestation؛ هر عملیات با base commit و diff hash مرتبط است.
- Schema باید inputs=repo manifest، image digest و outputs=toolchain lock را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/task-dag.ts و planned src/execution/؛ schema/ برای patch/test/attestation؛ scripts/ برای adapter؛ test/ با fixture project.
- ماژول اختصاصی planned: src/core/upgrades/up-072.ts؛ fixture و تست: test/up-072.test.ts

**وابستگی‌ها:** UP-034, UP-071

**مرزهای امنیتی:**
- image unpinned اجرا نشود

**تهدیدهای امنیتی:**
- overwrite تغییر کاربر، merge conflict پنهان، اجرای command مخرب، artifact بدون provenance و push/deploy ناخواسته.
- تهدید اختصاصی UP-072: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Toolchain Registry» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- fixture projects per language؛ transactional rollback؛ merge conflict؛ static/license/secret scan؛ test matrix؛ integration با protected main.
- تست اختصاصی UP-072: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- same manifest reproducibility

**Definition of Done:**
- patch atomic و قابل rollback است، branch/worktree کاربر ایزوله است، test evidence ثبت شده، main هرگز مستقیم push نمی‌شود و deploy approval دارد.
- UP-072 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/delivery-trust.ts
- test/audit-next-phases.test.ts

### 73. Test Matrix — UP-073

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Execution و Developer Workflow | P1 | `partial` | `in_progress` |

**هدف:**
- تست روی Runtime، OS، DB، Framework و Provider انتخابی اجرا شود.

**مسئله‌ای که حل می‌کند:**
- تغییر agent بدون workspace ایزوله، test matrix و transaction می‌تواند branch کاربر را خراب یا artifact غیرقابل‌اعتماد تولید کند. موضوع این پیشنهاد، «Test Matrix»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- تست روی Runtime، OS، DB، Framework و Provider انتخابی اجرا شود.

**ورودی‌ها:**
- matrix axes، budget

**خروجی‌ها:**
- matrix result

**Interface / Schema:**
- UP-073 / Test Matrix: WorkspaceLease، PatchPlan، ApplyTransaction، TestMatrix و ArtifactAttestation؛ هر عملیات با base commit و diff hash مرتبط است.
- Schema باید inputs=matrix axes، budget و outputs=matrix result را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/task-dag.ts و planned src/execution/؛ schema/ برای patch/test/attestation؛ scripts/ برای adapter؛ test/ با fixture project.
- ماژول اختصاصی planned: src/core/upgrades/up-073.ts؛ fixture و تست: test/up-073.test.ts

**وابستگی‌ها:** UP-012, UP-072

**مرزهای امنیتی:**
- هر axis policy و resource ceiling داشته باشد

**تهدیدهای امنیتی:**
- overwrite تغییر کاربر، merge conflict پنهان، اجرای command مخرب، artifact بدون provenance و push/deploy ناخواسته.
- تهدید اختصاصی UP-073: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Test Matrix» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- fixture projects per language؛ transactional rollback؛ merge conflict؛ static/license/secret scan؛ test matrix؛ integration با protected main.
- تست اختصاصی UP-073: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- partial matrix retry and summary

**Definition of Done:**
- patch atomic و قابل rollback است، branch/worktree کاربر ایزوله است، test evidence ثبت شده، main هرگز مستقیم push نمی‌شود و deploy approval دارد.
- UP-073 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/delivery-trust.ts
- test/audit-next-phases.test.ts

### 74. Fixture Projects — UP-074

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Execution و Developer Workflow | P1 | `partial` | `in_progress` |

**هدف:**
- پروژه‌های کوچک دارای مجوز برای Bug Fix، Refactor، API، Security و Frontend آماده شود.

**مسئله‌ای که حل می‌کند:**
- تغییر agent بدون workspace ایزوله، test matrix و transaction می‌تواند branch کاربر را خراب یا artifact غیرقابل‌اعتماد تولید کند. موضوع این پیشنهاد، «Fixture Projects»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- پروژه‌های کوچک دارای مجوز برای Bug Fix، Refactor، API، Security و Frontend آماده شود.

**ورودی‌ها:**
- fixture repo، license، expected result

**خروجی‌ها:**
- fixture registry

**Interface / Schema:**
- UP-074 / Fixture Projects: WorkspaceLease، PatchPlan، ApplyTransaction، TestMatrix و ArtifactAttestation؛ هر عملیات با base commit و diff hash مرتبط است.
- Schema باید inputs=fixture repo، license، expected result و outputs=fixture registry را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/task-dag.ts و planned src/execution/؛ schema/ برای patch/test/attestation؛ scripts/ برای adapter؛ test/ با fixture project.
- ماژول اختصاصی planned: src/core/upgrades/up-074.ts؛ fixture و تست: test/up-074.test.ts

**وابستگی‌ها:** UP-011, UP-072

**مرزهای امنیتی:**
- fixture شامل Secret یا code غیرمجاز نباشد

**تهدیدهای امنیتی:**
- overwrite تغییر کاربر، merge conflict پنهان، اجرای command مخرب، artifact بدون provenance و push/deploy ناخواسته.
- تهدید اختصاصی UP-074: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Fixture Projects» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- fixture projects per language؛ transactional rollback؛ merge conflict؛ static/license/secret scan؛ test matrix؛ integration با protected main.
- تست اختصاصی UP-074: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- fixture validation و reset

**Definition of Done:**
- patch atomic و قابل rollback است، branch/worktree کاربر ایزوله است، test evidence ثبت شده، main هرگز مستقیم push نمی‌شود و deploy approval دارد.
- UP-074 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/delivery-trust.ts
- test/audit-next-phases.test.ts

### 75. Transactional Patch Apply — UP-075

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Execution و Developer Workflow | P0 | `partial` | `in_progress` |

**هدف:**
- Patch در Sandbox validate شود و سپس atomic وارد Worktree شود.

**مسئله‌ای که حل می‌کند:**
- تغییر agent بدون workspace ایزوله، test matrix و transaction می‌تواند branch کاربر را خراب یا artifact غیرقابل‌اعتماد تولید کند. موضوع این پیشنهاد، «Transactional Patch Apply»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Patch در Sandbox validate شود و سپس atomic وارد Worktree شود.

**ورودی‌ها:**
- patch، allowlist، tests

**خروجی‌ها:**
- apply result و rollback point

**Interface / Schema:**
- UP-075 / Transactional Patch Apply: WorkspaceLease، PatchPlan، ApplyTransaction، TestMatrix و ArtifactAttestation؛ هر عملیات با base commit و diff hash مرتبط است.
- Schema باید inputs=patch، allowlist، tests و outputs=apply result و rollback point را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/task-dag.ts و planned src/execution/؛ schema/ برای patch/test/attestation؛ scripts/ برای adapter؛ test/ با fixture project.
- ماژول اختصاصی planned: src/core/upgrades/up-075.ts؛ fixture و تست: test/up-075.test.ts

**وابستگی‌ها:** UP-038, UP-071

**مرزهای امنیتی:**
- partial write و path traversal block شود

**تهدیدهای امنیتی:**
- overwrite تغییر کاربر، merge conflict پنهان، اجرای command مخرب، artifact بدون provenance و push/deploy ناخواسته.
- تهدید اختصاصی UP-075: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Transactional Patch Apply» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- fixture projects per language؛ transactional rollback؛ merge conflict؛ static/license/secret scan؛ test matrix؛ integration با protected main.
- تست اختصاصی UP-075: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- invalid patch leaves workspace unchanged

**Definition of Done:**
- patch atomic و قابل rollback است، branch/worktree کاربر ایزوله است، test evidence ثبت شده، main هرگز مستقیم push نمی‌شود و deploy approval دارد.
- UP-075 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/delivery-trust.ts
- test/audit-next-phases.test.ts

### 76. Static Analysis — UP-076

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Execution و Developer Workflow | P1 | `partial` | `in_progress` |

**هدف:**
- Typecheck، lint، SAST و formatter به‌صورت مرحله‌ای و قابل مشاهده اجرا شوند.

**مسئله‌ای که حل می‌کند:**
- تغییر agent بدون workspace ایزوله، test matrix و transaction می‌تواند branch کاربر را خراب یا artifact غیرقابل‌اعتماد تولید کند. موضوع این پیشنهاد، «Static Analysis»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Typecheck، lint، SAST و formatter به‌صورت مرحله‌ای و قابل مشاهده اجرا شوند.

**ورودی‌ها:**
- project toolchain، policy

**خروجی‌ها:**
- analysis findings

**Interface / Schema:**
- UP-076 / Static Analysis: WorkspaceLease، PatchPlan، ApplyTransaction، TestMatrix و ArtifactAttestation؛ هر عملیات با base commit و diff hash مرتبط است.
- Schema باید inputs=project toolchain، policy و outputs=analysis findings را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/task-dag.ts و planned src/execution/؛ schema/ برای patch/test/attestation؛ scripts/ برای adapter؛ test/ با fixture project.
- ماژول اختصاصی planned: src/core/upgrades/up-076.ts؛ fixture و تست: test/up-076.test.ts

**وابستگی‌ها:** UP-072, UP-077

**مرزهای امنیتی:**
- finding severity و waiver audit شود

**تهدیدهای امنیتی:**
- overwrite تغییر کاربر، merge conflict پنهان، اجرای command مخرب، artifact بدون provenance و push/deploy ناخواسته.
- تهدید اختصاصی UP-076: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Static Analysis» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- fixture projects per language؛ transactional rollback؛ merge conflict؛ static/license/secret scan؛ test matrix؛ integration با protected main.
- تست اختصاصی UP-076: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- known vulnerable fixture is found

**Definition of Done:**
- patch atomic و قابل rollback است، branch/worktree کاربر ایزوله است، test evidence ثبت شده، main هرگز مستقیم push نمی‌شود و deploy approval دارد.
- UP-076 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/delivery-trust.ts
- test/audit-next-phases.test.ts

### 77. License Scanner — UP-077

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Execution و Developer Workflow | P0 | `partial` | `in_progress` |

**هدف:**
- License ناسازگار در Dependency و Artifact قبل از Merge شناخته شود.

**مسئله‌ای که حل می‌کند:**
- تغییر agent بدون workspace ایزوله، test matrix و transaction می‌تواند branch کاربر را خراب یا artifact غیرقابل‌اعتماد تولید کند. موضوع این پیشنهاد، «License Scanner»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- License ناسازگار در Dependency و Artifact قبل از Merge شناخته شود.

**ورودی‌ها:**
- SBOM، legal policy

**خروجی‌ها:**
- license verdict

**Interface / Schema:**
- UP-077 / License Scanner: WorkspaceLease، PatchPlan، ApplyTransaction، TestMatrix و ArtifactAttestation؛ هر عملیات با base commit و diff hash مرتبط است.
- Schema باید inputs=SBOM، legal policy و outputs=license verdict را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/task-dag.ts و planned src/execution/؛ schema/ برای patch/test/attestation؛ scripts/ برای adapter؛ test/ با fixture project.
- ماژول اختصاصی planned: src/core/upgrades/up-077.ts؛ fixture و تست: test/up-077.test.ts

**وابستگی‌ها:** UP-034, UP-077

**مرزهای امنیتی:**
- exception owner و expiry داشته باشد

**تهدیدهای امنیتی:**
- overwrite تغییر کاربر، merge conflict پنهان، اجرای command مخرب، artifact بدون provenance و push/deploy ناخواسته.
- تهدید اختصاصی UP-077: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «License Scanner» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- fixture projects per language؛ transactional rollback؛ merge conflict؛ static/license/secret scan؛ test matrix؛ integration با protected main.
- تست اختصاصی UP-077: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- incompatible license gate

**Definition of Done:**
- patch atomic و قابل rollback است، branch/worktree کاربر ایزوله است، test evidence ثبت شده، main هرگز مستقیم push نمی‌شود و deploy approval دارد.
- UP-077 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/delivery-trust.ts
- test/audit-next-phases.test.ts

### 78. Git Secret Scan — UP-078

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Execution و Developer Workflow | P0 | `partial` | `in_progress` |

**هدف:**
- Commit، patch، log و artifact قبل از ذخیره از Secret Scanner عبور کند.

**مسئله‌ای که حل می‌کند:**
- تغییر agent بدون workspace ایزوله، test matrix و transaction می‌تواند branch کاربر را خراب یا artifact غیرقابل‌اعتماد تولید کند. موضوع این پیشنهاد، «Git Secret Scan»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Commit، patch، log و artifact قبل از ذخیره از Secret Scanner عبور کند.

**ورودی‌ها:**
- diff، artifact، patterns

**خروجی‌ها:**
- finding و block decision

**Interface / Schema:**
- UP-078 / Git Secret Scan: WorkspaceLease، PatchPlan، ApplyTransaction، TestMatrix و ArtifactAttestation؛ هر عملیات با base commit و diff hash مرتبط است.
- Schema باید inputs=diff، artifact، patterns و outputs=finding و block decision را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/task-dag.ts و planned src/execution/؛ schema/ برای patch/test/attestation؛ scripts/ برای adapter؛ test/ با fixture project.
- ماژول اختصاصی planned: src/core/upgrades/up-078.ts؛ fixture و تست: test/up-078.test.ts

**وابستگی‌ها:** UP-039, UP-078

**مرزهای امنیتی:**
- raw match در log چاپ نشود

**تهدیدهای امنیتی:**
- overwrite تغییر کاربر، merge conflict پنهان، اجرای command مخرب، artifact بدون provenance و push/deploy ناخواسته.
- تهدید اختصاصی UP-078: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Git Secret Scan» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- fixture projects per language؛ transactional rollback؛ merge conflict؛ static/license/secret scan؛ test matrix؛ integration با protected main.
- تست اختصاصی UP-078: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- fixture private key test

**Definition of Done:**
- patch atomic و قابل rollback است، branch/worktree کاربر ایزوله است، test evidence ثبت شده، main هرگز مستقیم push نمی‌شود و deploy approval دارد.
- UP-078 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/delivery-trust.ts
- test/audit-next-phases.test.ts

### 79. Artifact Attestation — UP-079

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Execution و Developer Workflow | P0 | `partial` | `in_progress` |

**هدف:**
- Artifact به Source commit، Build ID، Dependency hash و Generator متصل و امضا شود.

**مسئله‌ای که حل می‌کند:**
- تغییر agent بدون workspace ایزوله، test matrix و transaction می‌تواند branch کاربر را خراب یا artifact غیرقابل‌اعتماد تولید کند. موضوع این پیشنهاد، «Artifact Attestation»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Artifact به Source commit، Build ID، Dependency hash و Generator متصل و امضا شود.

**ورودی‌ها:**
- build inputs، artifact، signer

**خروجی‌ها:**
- attestation

**Interface / Schema:**
- UP-079 / Artifact Attestation: WorkspaceLease، PatchPlan، ApplyTransaction، TestMatrix و ArtifactAttestation؛ هر عملیات با base commit و diff hash مرتبط است.
- Schema باید inputs=build inputs، artifact، signer و outputs=attestation را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/task-dag.ts و planned src/execution/؛ schema/ برای patch/test/attestation؛ scripts/ برای adapter؛ test/ با fixture project.
- ماژول اختصاصی planned: src/core/upgrades/up-079.ts؛ fixture و تست: test/up-079.test.ts

**وابستگی‌ها:** UP-034, UP-079

**مرزهای امنیتی:**
- unsigned artifact قابل promotion نیست

**تهدیدهای امنیتی:**
- overwrite تغییر کاربر، merge conflict پنهان، اجرای command مخرب، artifact بدون provenance و push/deploy ناخواسته.
- تهدید اختصاصی UP-079: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «Artifact Attestation» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- fixture projects per language؛ transactional rollback؛ merge conflict؛ static/license/secret scan؛ test matrix؛ integration با protected main.
- تست اختصاصی UP-079: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- tampered artifact verification

**Definition of Done:**
- patch atomic و قابل rollback است، branch/worktree کاربر ایزوله است، test evidence ثبت شده، main هرگز مستقیم push نمی‌شود و deploy approval دارد.
- UP-079 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/delivery-trust.ts
- test/audit-next-phases.test.ts

### 80. CLI و IDE Extension — UP-080

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Execution و Developer Workflow | P1 | `partial` | `in_progress` |

**هدف:**
- Run، Approval، Diff، Log و Test از CLI و IDE بدون اتصال localhost در browser قابل استفاده شود.

**مسئله‌ای که حل می‌کند:**
- تغییر agent بدون workspace ایزوله، test matrix و transaction می‌تواند branch کاربر را خراب یا artifact غیرقابل‌اعتماد تولید کند. موضوع این پیشنهاد، «CLI و IDE Extension»، بدون این مرز به‌صورت قابل اندازه‌گیری قابل اتکا نیست.

**طراحی اجرایی:**
- Run، Approval، Diff، Log و Test از CLI و IDE بدون اتصال localhost در browser قابل استفاده شود.

**ورودی‌ها:**
- API، auth، workspace

**خروجی‌ها:**
- client packages

**Interface / Schema:**
- UP-080 / CLI و IDE Extension: WorkspaceLease، PatchPlan، ApplyTransaction، TestMatrix و ArtifactAttestation؛ هر عملیات با base commit و diff hash مرتبط است.
- Schema باید inputs=API، auth، workspace و outputs=client packages را با version، tenant scope، error و evidence hash بیان کند.

**محل پیاده‌سازی:**
- src/core/task-dag.ts و planned src/execution/؛ schema/ برای patch/test/attestation؛ scripts/ برای adapter؛ test/ با fixture project.
- ماژول اختصاصی planned: src/core/upgrades/up-080.ts؛ fixture و تست: test/up-080.test.ts

**وابستگی‌ها:** UP-001, UP-005

**مرزهای امنیتی:**
- client permission محدود و secret-safe باشد

**تهدیدهای امنیتی:**
- overwrite تغییر کاربر، merge conflict پنهان، اجرای command مخرب، artifact بدون provenance و push/deploy ناخواسته.
- تهدید اختصاصی UP-080: ورودی یا artifact نامعتبر می‌تواند به‌جای policy code تصمیم «CLI و IDE Extension» را جعل یا دور بزند؛ default-deny و audit لازم است.

**تست‌های لازم:**
- fixture projects per language؛ transactional rollback؛ merge conflict؛ static/license/secret scan؛ test matrix؛ integration با protected main.
- تست اختصاصی UP-080: مسیر موفق، ورودی ناقص، cross-tenant/permission denial، replay و failure باید با evidence واقعی اجرا شود.

**معیار پذیرش:**
- CLI/API contract و IDE smoke

**Definition of Done:**
- patch atomic و قابل rollback است، branch/worktree کاربر ایزوله است، test evidence ثبت شده، main هرگز مستقیم push نمی‌شود و deploy approval دارد.
- UP-080 فقط وقتی بسته می‌شود که interface/schema، محل پیاده‌سازی، threat model، تست‌های مثبت و منفی و evidence اجرای واقعی در همان نسخه ثبت شوند؛ صرفاً تغییر prompt یا ادعای مدل کافی نیست.

**Evidence کد فعلی:**
- src/core/delivery-trust.ts
- test/audit-next-phases.test.ts

### 81. Code Knowledge Graph — UP-081

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Knowledge و Data | P1 | `partial` | `in_progress` |

**هدف:**
- File، Function، Class، API، Test، Owner و Dependency به graph تبدیل شود.

**مسئله‌ای که حل می‌کند:**
- context، lineage و persistence برای «Code Knowledge Graph» بدون مرز داده و retention صریح است؛ در نتیجه بازیابی stale، نشت PII یا حذف ناقص ممکن می‌شود.

**طراحی اجرایی:**
- File، Function، Class، API، Test، Owner و Dependency به graph تبدیل شود.

**ورودی‌ها:**
- AST، git history، manifests

**خروجی‌ها:**
- versioned code graph

**Interface / Schema:**
- UP-081 / Code Knowledge Graph: ContextItem، RetrievalQuery، PackingPlan، MemoryTier و LineageRef با token budget و taint label؛ JSON Schema متناظر در schema/.
- Schema باید inputs=AST، git history، manifests و outputs=versioned code graph را با provenance، tenant scope و deletion marker بیان کند.

**محل پیاده‌سازی:**
- src/core/ planned memory/context modules و src/core/model-router.ts؛ schema/ برای context و lineage؛ test/ برای retrieval، PII و deletion.
- ماژول اختصاصی planned: src/core/knowledge/up-081.ts؛ fixture و تست: test/up-081.test.ts

**وابستگی‌ها:** UP-004, UP-081

**مرزهای امنیتی:**
- فقط داده مجاز Tenant index شود

**تهدیدهای امنیتی:**
- prompt injection، leakage از memory مشترک، context overflow، استفاده از داده حذف‌شده و نقض tenant boundary.
- تهدید اختصاصی UP-081: artifact یا embedding stale می‌تواند به‌جای policy داده قدیمی را برگرداند؛ provenance، TTL و default-deny لازم است.

**تست‌های لازم:**
- retrieval precision/recall، token budget، tenant isolation، deletion propagation، stale-data و injection fixtures.
- تست اختصاصی UP-081: مسیر موفق، ورودی ناقص، tenant mismatch، داده حذف‌شده و replay با evidence واقعی.

**معیار پذیرش:**
- incremental update and query test

**Definition of Done:**
- هر context provenance و budget دارد، taint/privacy gate قبل از egress اجرا می‌شود، و حذف داده در retrieval بعدی منعکس است.
- UP-081 فقط با interface/schema، محل پیاده‌سازی، threat model، تست مثبت/منفی و evidence واقعی بسته می‌شود؛ ادعای مدل جایگزین retrieval evaluation نیست.

**Evidence کد فعلی:**
- src/core/knowledge-fabric.ts
- test/audit-next-phases-2.test.ts

### 82. ACL-Aware Connectors — UP-082

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Knowledge و Data | P0 | `partial` | `in_progress` |

**هدف:**
- Connector اجازه منبع اصلی را عیناً در Index و Retrieval enforce کند.

**مسئله‌ای که حل می‌کند:**
- context، lineage و persistence برای «ACL-Aware Connectors» بدون مرز داده و retention صریح است؛ در نتیجه بازیابی stale، نشت PII یا حذف ناقص ممکن می‌شود.

**طراحی اجرایی:**
- Connector اجازه منبع اصلی را عیناً در Index و Retrieval enforce کند.

**ورودی‌ها:**
- OAuth scope، source ACL، document

**خروجی‌ها:**
- permission-aware document

**Interface / Schema:**
- UP-082 / ACL-Aware Connectors: ContextItem، RetrievalQuery، PackingPlan، MemoryTier و LineageRef با token budget و taint label؛ JSON Schema متناظر در schema/.
- Schema باید inputs=OAuth scope، source ACL، document و outputs=permission-aware document را با provenance، tenant scope و deletion marker بیان کند.

**محل پیاده‌سازی:**
- src/core/ planned memory/context modules و src/core/model-router.ts؛ schema/ برای context و lineage؛ test/ برای retrieval، PII و deletion.
- ماژول اختصاصی planned: src/core/knowledge/up-082.ts؛ fixture و تست: test/up-082.test.ts

**وابستگی‌ها:** UP-010, UP-082

**مرزهای امنیتی:**
- داده private با public user retrieval نشود

**تهدیدهای امنیتی:**
- prompt injection، leakage از memory مشترک، context overflow، استفاده از داده حذف‌شده و نقض tenant boundary.
- تهدید اختصاصی UP-082: artifact یا embedding stale می‌تواند به‌جای policy داده قدیمی را برگرداند؛ provenance، TTL و default-deny لازم است.

**تست‌های لازم:**
- retrieval precision/recall، token budget، tenant isolation، deletion propagation، stale-data و injection fixtures.
- تست اختصاصی UP-082: مسیر موفق، ورودی ناقص، tenant mismatch، داده حذف‌شده و replay با evidence واقعی.

**معیار پذیرش:**
- revoked access removes result

**Definition of Done:**
- هر context provenance و budget دارد، taint/privacy gate قبل از egress اجرا می‌شود، و حذف داده در retrieval بعدی منعکس است.
- UP-082 فقط با interface/schema، محل پیاده‌سازی، threat model، تست مثبت/منفی و evidence واقعی بسته می‌شود؛ ادعای مدل جایگزین retrieval evaluation نیست.

**Evidence کد فعلی:**
- src/core/knowledge-fabric.ts
- test/audit-next-phases-2.test.ts

### 83. Context Packing — UP-083

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Knowledge و Data | P1 | `partial` | `in_progress` |

**هدف:**
- Context با dependency، recent diff، requirement و token budget انتخاب شود.

**مسئله‌ای که حل می‌کند:**
- context، lineage و persistence برای «Context Packing» بدون مرز داده و retention صریح است؛ در نتیجه بازیابی stale، نشت PII یا حذف ناقص ممکن می‌شود.

**طراحی اجرایی:**
- Context با dependency، recent diff، requirement و token budget انتخاب شود.

**ورودی‌ها:**
- repo graph، query، budget

**خروجی‌ها:**
- ranked context manifest

**Interface / Schema:**
- UP-083 / Context Packing: ContextItem، RetrievalQuery، PackingPlan، MemoryTier و LineageRef با token budget و taint label؛ JSON Schema متناظر در schema/.
- Schema باید inputs=repo graph، query، budget و outputs=ranked context manifest را با provenance، tenant scope و deletion marker بیان کند.

**محل پیاده‌سازی:**
- src/core/ planned memory/context modules و src/core/model-router.ts؛ schema/ برای context و lineage؛ test/ برای retrieval، PII و deletion.
- ماژول اختصاصی planned: src/core/knowledge/up-083.ts؛ fixture و تست: test/up-083.test.ts

**وابستگی‌ها:** UP-081, UP-083

**مرزهای امنیتی:**
- content خارج از ACL و tainted sink وارد نشود

**تهدیدهای امنیتی:**
- prompt injection، leakage از memory مشترک، context overflow، استفاده از داده حذف‌شده و نقض tenant boundary.
- تهدید اختصاصی UP-083: artifact یا embedding stale می‌تواند به‌جای policy داده قدیمی را برگرداند؛ provenance، TTL و default-deny لازم است.

**تست‌های لازم:**
- retrieval precision/recall، token budget، tenant isolation، deletion propagation، stale-data و injection fixtures.
- تست اختصاصی UP-083: مسیر موفق، ورودی ناقص، tenant mismatch، داده حذف‌شده و replay با evidence واقعی.

**معیار پذیرش:**
- context boundary and relevance test

**Definition of Done:**
- هر context provenance و budget دارد، taint/privacy gate قبل از egress اجرا می‌شود، و حذف داده در retrieval بعدی منعکس است.
- UP-083 فقط با interface/schema، محل پیاده‌سازی، threat model، تست مثبت/منفی و evidence واقعی بسته می‌شود؛ ادعای مدل جایگزین retrieval evaluation نیست.

**Evidence کد فعلی:**
- src/core/knowledge-fabric.ts
- test/audit-next-phases-2.test.ts

### 84. Tiered Memory — UP-084

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Knowledge و Data | P1 | `partial` | `in_progress` |

**هدف:**
- حافظه Run، Project، Organization و General با TTL، consent و permission جدا شود.

**مسئله‌ای که حل می‌کند:**
- context، lineage و persistence برای «Tiered Memory» بدون مرز داده و retention صریح است؛ در نتیجه بازیابی stale، نشت PII یا حذف ناقص ممکن می‌شود.

**طراحی اجرایی:**
- حافظه Run، Project، Organization و General با TTL، consent و permission جدا شود.

**ورودی‌ها:**
- memory event، scope، TTL

**خروجی‌ها:**
- memory record و retention decision

**Interface / Schema:**
- UP-084 / Tiered Memory: ContextItem، RetrievalQuery، PackingPlan، MemoryTier و LineageRef با token budget و taint label؛ JSON Schema متناظر در schema/.
- Schema باید inputs=memory event، scope، TTL و outputs=memory record و retention decision را با provenance، tenant scope و deletion marker بیان کند.

**محل پیاده‌سازی:**
- src/core/ planned memory/context modules و src/core/model-router.ts؛ schema/ برای context و lineage؛ test/ برای retrieval، PII و deletion.
- ماژول اختصاصی planned: src/core/knowledge/up-084.ts؛ fixture و تست: test/up-084.test.ts

**وابستگی‌ها:** UP-082, UP-088

**مرزهای امنیتی:**
- memory scope به‌صورت پیش‌فرض کمینه باشد

**تهدیدهای امنیتی:**
- prompt injection، leakage از memory مشترک، context overflow، استفاده از داده حذف‌شده و نقض tenant boundary.
- تهدید اختصاصی UP-084: artifact یا embedding stale می‌تواند به‌جای policy داده قدیمی را برگرداند؛ provenance، TTL و default-deny لازم است.

**تست‌های لازم:**
- retrieval precision/recall، token budget، tenant isolation، deletion propagation، stale-data و injection fixtures.
- تست اختصاصی UP-084: مسیر موفق، ورودی ناقص، tenant mismatch، داده حذف‌شده و replay با evidence واقعی.

**معیار پذیرش:**
- cross-scope leak test

**Definition of Done:**
- هر context provenance و budget دارد، taint/privacy gate قبل از egress اجرا می‌شود، و حذف داده در retrieval بعدی منعکس است.
- UP-084 فقط با interface/schema، محل پیاده‌سازی، threat model، تست مثبت/منفی و evidence واقعی بسته می‌شود؛ ادعای مدل جایگزین retrieval evaluation نیست.

**Evidence کد فعلی:**
- src/core/knowledge-fabric.ts
- test/audit-next-phases-2.test.ts

### 85. Stale Documentation — UP-085

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Knowledge و Data | P1 | `partial` | `in_progress` |

**هدف:**
- Docs با Code، API و Schema مقایسه و stale علامت‌گذاری شود.

**مسئله‌ای که حل می‌کند:**
- context، lineage و persistence برای «Stale Documentation» بدون مرز داده و retention صریح است؛ در نتیجه بازیابی stale، نشت PII یا حذف ناقص ممکن می‌شود.

**طراحی اجرایی:**
- Docs با Code، API و Schema مقایسه و stale علامت‌گذاری شود.

**ورودی‌ها:**
- git diff، docs links، API schema

**خروجی‌ها:**
- staleness report

**Interface / Schema:**
- UP-085 / Stale Documentation: ContextItem، RetrievalQuery، PackingPlan، MemoryTier و LineageRef با token budget و taint label؛ JSON Schema متناظر در schema/.
- Schema باید inputs=git diff، docs links، API schema و outputs=staleness report را با provenance، tenant scope و deletion marker بیان کند.

**محل پیاده‌سازی:**
- src/core/ planned memory/context modules و src/core/model-router.ts؛ schema/ برای context و lineage؛ test/ برای retrieval، PII و deletion.
- ماژول اختصاصی planned: src/core/knowledge/up-085.ts؛ fixture و تست: test/up-085.test.ts

**وابستگی‌ها:** UP-005, UP-081

**مرزهای امنیتی:**
- report پیشنهاد است و code authority را تغییر نمی‌دهد

**تهدیدهای امنیتی:**
- prompt injection، leakage از memory مشترک، context overflow، استفاده از داده حذف‌شده و نقض tenant boundary.
- تهدید اختصاصی UP-085: artifact یا embedding stale می‌تواند به‌جای policy داده قدیمی را برگرداند؛ provenance، TTL و default-deny لازم است.

**تست‌های لازم:**
- retrieval precision/recall، token budget، tenant isolation، deletion propagation، stale-data و injection fixtures.
- تست اختصاصی UP-085: مسیر موفق، ورودی ناقص، tenant mismatch، داده حذف‌شده و replay با evidence واقعی.

**معیار پذیرش:**
- known stale fixture

**Definition of Done:**
- هر context provenance و budget دارد، taint/privacy gate قبل از egress اجرا می‌شود، و حذف داده در retrieval بعدی منعکس است.
- UP-085 فقط با interface/schema، محل پیاده‌سازی، threat model، تست مثبت/منفی و evidence واقعی بسته می‌شود؛ ادعای مدل جایگزین retrieval evaluation نیست.

**Evidence کد فعلی:**
- src/core/knowledge-fabric.ts
- test/audit-next-phases-2.test.ts

### 86. Data Lineage — UP-086

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Knowledge و Data | P1 | `partial` | `in_progress` |

**هدف:**
- منشأ هر خروجی از File، Prompt، Evidence، Model، Tool و External source ثبت شود.

**مسئله‌ای که حل می‌کند:**
- context، lineage و persistence برای «Data Lineage» بدون مرز داده و retention صریح است؛ در نتیجه بازیابی stale، نشت PII یا حذف ناقص ممکن می‌شود.

**طراحی اجرایی:**
- منشأ هر خروجی از File، Prompt، Evidence، Model، Tool و External source ثبت شود.

**ورودی‌ها:**
- events، artifacts، claims

**خروجی‌ها:**
- lineage graph

**Interface / Schema:**
- UP-086 / Data Lineage: ContextItem، RetrievalQuery، PackingPlan، MemoryTier و LineageRef با token budget و taint label؛ JSON Schema متناظر در schema/.
- Schema باید inputs=events، artifacts، claims و outputs=lineage graph را با provenance، tenant scope و deletion marker بیان کند.

**محل پیاده‌سازی:**
- src/core/ planned memory/context modules و src/core/model-router.ts؛ schema/ برای context و lineage؛ test/ برای retrieval، PII و deletion.
- ماژول اختصاصی planned: src/core/knowledge/up-086.ts؛ fixture و تست: test/up-086.test.ts

**وابستگی‌ها:** UP-007, UP-037

**مرزهای امنیتی:**
- lineage خودش Secret ذخیره نکند

**تهدیدهای امنیتی:**
- prompt injection، leakage از memory مشترک، context overflow، استفاده از داده حذف‌شده و نقض tenant boundary.
- تهدید اختصاصی UP-086: artifact یا embedding stale می‌تواند به‌جای policy داده قدیمی را برگرداند؛ provenance، TTL و default-deny لازم است.

**تست‌های لازم:**
- retrieval precision/recall، token budget، tenant isolation، deletion propagation، stale-data و injection fixtures.
- تست اختصاصی UP-086: مسیر موفق، ورودی ناقص، tenant mismatch، داده حذف‌شده و replay با evidence واقعی.

**معیار پذیرش:**
- output traces to source hashes

**Definition of Done:**
- هر context provenance و budget دارد، taint/privacy gate قبل از egress اجرا می‌شود، و حذف داده در retrieval بعدی منعکس است.
- UP-086 فقط با interface/schema، محل پیاده‌سازی، threat model، تست مثبت/منفی و evidence واقعی بسته می‌شود؛ ادعای مدل جایگزین retrieval evaluation نیست.

**Evidence کد فعلی:**
- src/core/knowledge-fabric.ts
- test/audit-next-phases-2.test.ts

### 87. PII Classification — UP-087

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Knowledge و Data | P0 | `partial` | `in_progress` |

**هدف:**
- Email، phone، address، identity و medical data قبل از Index/Egress دسته‌بندی شود.

**مسئله‌ای که حل می‌کند:**
- context، lineage و persistence برای «PII Classification» بدون مرز داده و retention صریح است؛ در نتیجه بازیابی stale، نشت PII یا حذف ناقص ممکن می‌شود.

**طراحی اجرایی:**
- Email، phone، address، identity و medical data قبل از Index/Egress دسته‌بندی شود.

**ورودی‌ها:**
- content، locale، policy

**خروجی‌ها:**
- PII findings و action

**Interface / Schema:**
- UP-087 / PII Classification: ContextItem، RetrievalQuery، PackingPlan، MemoryTier و LineageRef با token budget و taint label؛ JSON Schema متناظر در schema/.
- Schema باید inputs=content، locale، policy و outputs=PII findings و action را با provenance، tenant scope و deletion marker بیان کند.

**محل پیاده‌سازی:**
- src/core/ planned memory/context modules و src/core/model-router.ts؛ schema/ برای context و lineage؛ test/ برای retrieval، PII و deletion.
- ماژول اختصاصی planned: src/core/knowledge/up-087.ts؛ fixture و تست: test/up-087.test.ts

**وابستگی‌ها:** UP-039, UP-087

**مرزهای امنیتی:**
- classifier uncertainty باعث safe fallback شود

**تهدیدهای امنیتی:**
- prompt injection، leakage از memory مشترک، context overflow، استفاده از داده حذف‌شده و نقض tenant boundary.
- تهدید اختصاصی UP-087: artifact یا embedding stale می‌تواند به‌جای policy داده قدیمی را برگرداند؛ provenance، TTL و default-deny لازم است.

**تست‌های لازم:**
- retrieval precision/recall، token budget، tenant isolation، deletion propagation، stale-data و injection fixtures.
- تست اختصاصی UP-087: مسیر موفق، ورودی ناقص، tenant mismatch، داده حذف‌شده و replay با evidence واقعی.

**معیار پذیرش:**
- multilingual PII fixtures

**Definition of Done:**
- هر context provenance و budget دارد، taint/privacy gate قبل از egress اجرا می‌شود، و حذف داده در retrieval بعدی منعکس است.
- UP-087 فقط با interface/schema، محل پیاده‌سازی، threat model، تست مثبت/منفی و evidence واقعی بسته می‌شود؛ ادعای مدل جایگزین retrieval evaluation نیست.

**Evidence کد فعلی:**
- src/core/privacy-retrieval.ts
- test/audit-next-phases-2.test.ts

### 88. Data Deletion Propagation — UP-088

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Knowledge و Data | P0 | `partial` | `in_progress` |

**هدف:**
- حذف User/Project به DB، Vector Index، Cache، Log، Artifact و Backup policy propagate شود.

**مسئله‌ای که حل می‌کند:**
- context، lineage و persistence برای «Data Deletion Propagation» بدون مرز داده و retention صریح است؛ در نتیجه بازیابی stale، نشت PII یا حذف ناقص ممکن می‌شود.

**طراحی اجرایی:**
- حذف User/Project به DB، Vector Index، Cache، Log، Artifact و Backup policy propagate شود.

**ورودی‌ها:**
- deletion request، retention policy

**خروجی‌ها:**
- deletion receipt و tombstone

**Interface / Schema:**
- UP-088 / Data Deletion Propagation: ContextItem، RetrievalQuery، PackingPlan، MemoryTier و LineageRef با token budget و taint label؛ JSON Schema متناظر در schema/.
- Schema باید inputs=deletion request، retention policy و outputs=deletion receipt و tombstone را با provenance، tenant scope و deletion marker بیان کند.

**محل پیاده‌سازی:**
- src/core/ planned memory/context modules و src/core/model-router.ts؛ schema/ برای context و lineage؛ test/ برای retrieval، PII و deletion.
- ماژول اختصاصی planned: src/core/knowledge/up-088.ts؛ fixture و تست: test/up-088.test.ts

**وابستگی‌ها:** UP-082, UP-088

**مرزهای امنیتی:**
- backup retention و legal hold صریح باشد

**تهدیدهای امنیتی:**
- prompt injection، leakage از memory مشترک، context overflow، استفاده از داده حذف‌شده و نقض tenant boundary.
- تهدید اختصاصی UP-088: artifact یا embedding stale می‌تواند به‌جای policy داده قدیمی را برگرداند؛ provenance، TTL و default-deny لازم است.

**تست‌های لازم:**
- retrieval precision/recall، token budget، tenant isolation، deletion propagation، stale-data و injection fixtures.
- تست اختصاصی UP-088: مسیر موفق، ورودی ناقص، tenant mismatch، داده حذف‌شده و replay با evidence واقعی.

**معیار پذیرش:**
- deletion audit and reappearance test

**Definition of Done:**
- هر context provenance و budget دارد، taint/privacy gate قبل از egress اجرا می‌شود، و حذف داده در retrieval بعدی منعکس است.
- UP-088 فقط با interface/schema، محل پیاده‌سازی، threat model، تست مثبت/منفی و evidence واقعی بسته می‌شود؛ ادعای مدل جایگزین retrieval evaluation نیست.

**Evidence کد فعلی:**
- src/core/privacy-retrieval.ts
- test/audit-next-phases-2.test.ts

### 89. Retrieval Evaluation — UP-089

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Knowledge و Data | P1 | `partial` | `in_progress` |

**هدف:**
- Recall، Precision، Relevance و Grounding روی Query set اندازه‌گیری شود.

**مسئله‌ای که حل می‌کند:**
- context، lineage و persistence برای «Retrieval Evaluation» بدون مرز داده و retention صریح است؛ در نتیجه بازیابی stale، نشت PII یا حذف ناقص ممکن می‌شود.

**طراحی اجرایی:**
- Recall، Precision، Relevance و Grounding روی Query set اندازه‌گیری شود.

**ورودی‌ها:**
- gold queries، ACL، index

**خروجی‌ها:**
- retrieval eval report

**Interface / Schema:**
- UP-089 / Retrieval Evaluation: ContextItem، RetrievalQuery، PackingPlan، MemoryTier و LineageRef با token budget و taint label؛ JSON Schema متناظر در schema/.
- Schema باید inputs=gold queries، ACL، index و outputs=retrieval eval report را با provenance، tenant scope و deletion marker بیان کند.

**محل پیاده‌سازی:**
- src/core/ planned memory/context modules و src/core/model-router.ts؛ schema/ برای context و lineage؛ test/ برای retrieval، PII و deletion.
- ماژول اختصاصی planned: src/core/knowledge/up-089.ts؛ fixture و تست: test/up-089.test.ts

**وابستگی‌ها:** UP-082, UP-083

**مرزهای امنیتی:**
- gold set مجوز داشته باشد

**تهدیدهای امنیتی:**
- prompt injection، leakage از memory مشترک، context overflow، استفاده از داده حذف‌شده و نقض tenant boundary.
- تهدید اختصاصی UP-089: artifact یا embedding stale می‌تواند به‌جای policy داده قدیمی را برگرداند؛ provenance، TTL و default-deny لازم است.

**تست‌های لازم:**
- retrieval precision/recall، token budget، tenant isolation، deletion propagation، stale-data و injection fixtures.
- تست اختصاصی UP-089: مسیر موفق، ورودی ناقص، tenant mismatch، داده حذف‌شده و replay با evidence واقعی.

**معیار پذیرش:**
- regression gate for retrieval

**Definition of Done:**
- هر context provenance و budget دارد، taint/privacy gate قبل از egress اجرا می‌شود، و حذف داده در retrieval بعدی منعکس است.
- UP-089 فقط با interface/schema، محل پیاده‌سازی، threat model، تست مثبت/منفی و evidence واقعی بسته می‌شود؛ ادعای مدل جایگزین retrieval evaluation نیست.

**Evidence کد فعلی:**
- src/core/privacy-retrieval.ts
- test/audit-next-phases-2.test.ts

### 90. Local Repository Index — UP-090

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Knowledge و Data | P1 | `partial` | `in_progress` |

**هدف:**
- Search و Embedding Local برای کد محرمانه ارائه شود.

**مسئله‌ای که حل می‌کند:**
- context، lineage و persistence برای «Local Repository Index» بدون مرز داده و retention صریح است؛ در نتیجه بازیابی stale، نشت PII یا حذف ناقص ممکن می‌شود.

**طراحی اجرایی:**
- Search و Embedding Local برای کد محرمانه ارائه شود.

**ورودی‌ها:**
- local model، repo، privacy mode

**خروجی‌ها:**
- local index و search result

**Interface / Schema:**
- UP-090 / Local Repository Index: ContextItem، RetrievalQuery، PackingPlan، MemoryTier و LineageRef با token budget و taint label؛ JSON Schema متناظر در schema/.
- Schema باید inputs=local model، repo، privacy mode و outputs=local index و search result را با provenance، tenant scope و deletion marker بیان کند.

**محل پیاده‌سازی:**
- src/core/ planned memory/context modules و src/core/model-router.ts؛ schema/ برای context و lineage؛ test/ برای retrieval، PII و deletion.
- ماژول اختصاصی planned: src/core/knowledge/up-090.ts؛ fixture و تست: test/up-090.test.ts

**وابستگی‌ها:** UP-056, UP-082

**مرزهای امنیتی:**
- network egress در Local mode خاموش بماند

**تهدیدهای امنیتی:**
- prompt injection، leakage از memory مشترک، context overflow، استفاده از داده حذف‌شده و نقض tenant boundary.
- تهدید اختصاصی UP-090: artifact یا embedding stale می‌تواند به‌جای policy داده قدیمی را برگرداند؛ provenance، TTL و default-deny لازم است.

**تست‌های لازم:**
- retrieval precision/recall، token budget، tenant isolation، deletion propagation، stale-data و injection fixtures.
- تست اختصاصی UP-090: مسیر موفق، ورودی ناقص، tenant mismatch، داده حذف‌شده و replay با evidence واقعی.

**معیار پذیرش:**
- network deny integration test

**Definition of Done:**
- هر context provenance و budget دارد، taint/privacy gate قبل از egress اجرا می‌شود، و حذف داده در retrieval بعدی منعکس است.
- UP-090 فقط با interface/schema، محل پیاده‌سازی، threat model، تست مثبت/منفی و evidence واقعی بسته می‌شود؛ ادعای مدل جایگزین retrieval evaluation نیست.

**Evidence کد فعلی:**
- src/core/privacy-retrieval.ts
- test/audit-next-phases-2.test.ts

### 91. Policy as Code — UP-091

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Governance و کیفیت محصول | P0 | `partial` | `in_progress` |

**هدف:**
- Security، Budget، Approval، Residency و Provider rule نسخه‌گذاری و تست شود.

**مسئله‌ای که حل می‌کند:**
- تصمیم محصول یا policy برای «Policy as Code» بدون owner، version، معیار کیفیت و مسیر اعتراض قابل دفاع و قابل بازگشت نیست.

**طراحی اجرایی:**
- Security، Budget، Approval، Residency و Provider rule نسخه‌گذاری و تست شود.

**ورودی‌ها:**
- policy files، settings، context

**خروجی‌ها:**
- policy decision و diff

**Interface / Schema:**
- UP-091 / Policy as Code: PolicyBundle، QualityReport، ChangeRecord، ApprovalRequest و AuditEvent با owner، scope، version، expiry و provenance؛ JSON Schema متناظر در schema/.
- Schema باید inputs=policy files، settings، context و outputs=policy decision و diff را با reason code، approver و rollback reference بیان کند.

**محل پیاده‌سازی:**
- src/core/policy-engine.ts، evidence.ts و planned src/governance/؛ docs/ برای policy/runbook؛ schema/ و test/ برای قرارداد و review.
- ماژول اختصاصی planned: src/core/governance/up-091.ts؛ fixture و تست: test/up-091.test.ts

**وابستگی‌ها:** UP-004, UP-091

**مرزهای امنیتی:**
- policy loosening نیازمند approval و Audit باشد

**تهدیدهای امنیتی:**
- privilege escalation، approval جعلی، policy drift، حذف audit، تبعیض زبانی و ناسازگاری license/privacy.
- تهدید اختصاصی UP-091: تغییر بدون review یا exception منقضی می‌تواند authority و معیار کیفیت «Policy as Code» را دور بزند؛ immutable audit لازم است.

**تست‌های لازم:**
- policy matrix، expiry/revocation، audit immutability، quality regression، compliance fixtures، accessibility و independent review.
- تست اختصاصی UP-091: مسیر موفق، ورودی ناقص، approval denial، rollback و گزارش evidence واقعی.

**معیار پذیرش:**
- policy regression suite

**Definition of Done:**
- policy و معیار کیفیت versioned و review شده‌اند، exception تاریخ انقضا و approver دارد، audit کامل است و مسیر اعتراض/rollback مستند و تست شده است.
- UP-091 فقط با interface/schema، محل پیاده‌سازی، threat model، تست مثبت/منفی و evidence واقعی بسته می‌شود؛ متن تولیدشده به‌تنهایی کافی نیست.

**Evidence کد فعلی:**
- src/core/governance-quality.ts
- test/audit-next-phases-2.test.ts

### 92. Change Management — UP-092

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Governance و کیفیت محصول | P0 | `partial` | `in_progress` |

**هدف:**
- تغییر Prompt، Model، Tool، Router و Security با Change Request، Reviewer و Rollback انجام شود.

**مسئله‌ای که حل می‌کند:**
- تصمیم محصول یا policy برای «Change Management» بدون owner، version، معیار کیفیت و مسیر اعتراض قابل دفاع و قابل بازگشت نیست.

**طراحی اجرایی:**
- تغییر Prompt، Model، Tool، Router و Security با Change Request، Reviewer و Rollback انجام شود.

**ورودی‌ها:**
- change diff، risk، approver

**خروجی‌ها:**
- change record

**Interface / Schema:**
- UP-092 / Change Management: PolicyBundle، QualityReport، ChangeRecord، ApprovalRequest و AuditEvent با owner، scope، version، expiry و provenance؛ JSON Schema متناظر در schema/.
- Schema باید inputs=change diff، risk، approver و outputs=change record را با reason code، approver و rollback reference بیان کند.

**محل پیاده‌سازی:**
- src/core/policy-engine.ts، evidence.ts و planned src/governance/؛ docs/ برای policy/runbook؛ schema/ و test/ برای قرارداد و review.
- ماژول اختصاصی planned: src/core/governance/up-092.ts؛ fixture و تست: test/up-092.test.ts

**وابستگی‌ها:** UP-065, UP-092

**مرزهای امنیتی:**
- self-approval و deployment بدون approval ممنوع

**تهدیدهای امنیتی:**
- privilege escalation، approval جعلی، policy drift، حذف audit، تبعیض زبانی و ناسازگاری license/privacy.
- تهدید اختصاصی UP-092: تغییر بدون review یا exception منقضی می‌تواند authority و معیار کیفیت «Change Management» را دور بزند؛ immutable audit لازم است.

**تست‌های لازم:**
- policy matrix، expiry/revocation، audit immutability، quality regression، compliance fixtures، accessibility و independent review.
- تست اختصاصی UP-092: مسیر موفق، ورودی ناقص، approval denial، rollback و گزارش evidence واقعی.

**معیار پذیرش:**
- change lifecycle E2E

**Definition of Done:**
- policy و معیار کیفیت versioned و review شده‌اند، exception تاریخ انقضا و approver دارد، audit کامل است و مسیر اعتراض/rollback مستند و تست شده است.
- UP-092 فقط با interface/schema، محل پیاده‌سازی، threat model، تست مثبت/منفی و evidence واقعی بسته می‌شود؛ متن تولیدشده به‌تنهایی کافی نیست.

**Evidence کد فعلی:**
- src/core/governance-quality.ts
- test/audit-next-phases-2.test.ts

### 93. Model Cards — UP-093

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Governance و کیفیت محصول | P1 | `partial` | `in_progress` |

**هدف:**
- Model، limitations، language، risk، cost، context و evidence در Registry ثبت شود.

**مسئله‌ای که حل می‌کند:**
- تصمیم محصول یا policy برای «Model Cards» بدون owner، version، معیار کیفیت و مسیر اعتراض قابل دفاع و قابل بازگشت نیست.

**طراحی اجرایی:**
- Model، limitations، language، risk، cost، context و evidence در Registry ثبت شود.

**ورودی‌ها:**
- provider metadata، benchmark

**خروجی‌ها:**
- model card version

**Interface / Schema:**
- UP-093 / Model Cards: PolicyBundle، QualityReport، ChangeRecord، ApprovalRequest و AuditEvent با owner، scope، version، expiry و provenance؛ JSON Schema متناظر در schema/.
- Schema باید inputs=provider metadata، benchmark و outputs=model card version را با reason code، approver و rollback reference بیان کند.

**محل پیاده‌سازی:**
- src/core/policy-engine.ts، evidence.ts و planned src/governance/؛ docs/ برای policy/runbook؛ schema/ و test/ برای قرارداد و review.
- ماژول اختصاصی planned: src/core/governance/up-093.ts؛ fixture و تست: test/up-093.test.ts

**وابستگی‌ها:** UP-012, UP-026

**مرزهای امنیتی:**
- vendor claim از measured جدا بماند

**تهدیدهای امنیتی:**
- privilege escalation، approval جعلی، policy drift، حذف audit، تبعیض زبانی و ناسازگاری license/privacy.
- تهدید اختصاصی UP-093: تغییر بدون review یا exception منقضی می‌تواند authority و معیار کیفیت «Model Cards» را دور بزند؛ immutable audit لازم است.

**تست‌های لازم:**
- policy matrix، expiry/revocation، audit immutability، quality regression، compliance fixtures، accessibility و independent review.
- تست اختصاصی UP-093: مسیر موفق، ورودی ناقص، approval denial، rollback و گزارش evidence واقعی.

**معیار پذیرش:**
- missing field blocks promotion

**Definition of Done:**
- policy و معیار کیفیت versioned و review شده‌اند، exception تاریخ انقضا و approver دارد، audit کامل است و مسیر اعتراض/rollback مستند و تست شده است.
- UP-093 فقط با interface/schema، محل پیاده‌سازی، threat model، تست مثبت/منفی و evidence واقعی بسته می‌شود؛ متن تولیدشده به‌تنهایی کافی نیست.

**Evidence کد فعلی:**
- src/core/governance-quality.ts
- test/audit-next-phases-2.test.ts

### 94. Fairness و Language Eval — UP-094

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Governance و کیفیت محصول | P1 | `partial` | `in_progress` |

**هدف:**
- کیفیت برای زبان، لهجه، سبک کد و گروه‌های کاربر مقایسه شود.

**مسئله‌ای که حل می‌کند:**
- تصمیم محصول یا policy برای «Fairness و Language Eval» بدون owner، version، معیار کیفیت و مسیر اعتراض قابل دفاع و قابل بازگشت نیست.

**طراحی اجرایی:**
- کیفیت برای زبان، لهجه، سبک کد و گروه‌های کاربر مقایسه شود.

**ورودی‌ها:**
- localized benchmark، rubric

**خروجی‌ها:**
- fairness report

**Interface / Schema:**
- UP-094 / Fairness و Language Eval: PolicyBundle، QualityReport، ChangeRecord، ApprovalRequest و AuditEvent با owner، scope، version، expiry و provenance؛ JSON Schema متناظر در schema/.
- Schema باید inputs=localized benchmark، rubric و outputs=fairness report را با reason code، approver و rollback reference بیان کند.

**محل پیاده‌سازی:**
- src/core/policy-engine.ts، evidence.ts و planned src/governance/؛ docs/ برای policy/runbook؛ schema/ و test/ برای قرارداد و review.
- ماژول اختصاصی planned: src/core/governance/up-094.ts؛ fixture و تست: test/up-094.test.ts

**وابستگی‌ها:** UP-014, UP-019

**مرزهای امنیتی:**
- نتیجه aggregate نباید گروه کوچک را پنهان کند

**تهدیدهای امنیتی:**
- privilege escalation، approval جعلی، policy drift، حذف audit، تبعیض زبانی و ناسازگاری license/privacy.
- تهدید اختصاصی UP-094: تغییر بدون review یا exception منقضی می‌تواند authority و معیار کیفیت «Fairness و Language Eval» را دور بزند؛ immutable audit لازم است.

**تست‌های لازم:**
- policy matrix، expiry/revocation، audit immutability، quality regression، compliance fixtures، accessibility و independent review.
- تست اختصاصی UP-094: مسیر موفق، ورودی ناقص، approval denial، rollback و گزارش evidence واقعی.

**معیار پذیرش:**
- language regression fixture

**Definition of Done:**
- policy و معیار کیفیت versioned و review شده‌اند، exception تاریخ انقضا و approver دارد، audit کامل است و مسیر اعتراض/rollback مستند و تست شده است.
- UP-094 فقط با interface/schema، محل پیاده‌سازی، threat model، تست مثبت/منفی و evidence واقعی بسته می‌شود؛ متن تولیدشده به‌تنهایی کافی نیست.

**Evidence کد فعلی:**
- src/core/governance-quality.ts
- test/audit-next-phases-2.test.ts

### 95. WCAG — UP-095

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Governance و کیفیت محصول | P1 | `partial` | `in_progress` |

**هدف:**
- Keyboard، screen reader، contrast، focus و alternative text در UI رعایت شود.

**مسئله‌ای که حل می‌کند:**
- تصمیم محصول یا policy برای «WCAG» بدون owner، version، معیار کیفیت و مسیر اعتراض قابل دفاع و قابل بازگشت نیست.

**طراحی اجرایی:**
- Keyboard، screen reader، contrast، focus و alternative text در UI رعایت شود.

**ورودی‌ها:**
- web pages، accessibility tree

**خروجی‌ها:**
- a11y report

**Interface / Schema:**
- UP-095 / WCAG: PolicyBundle، QualityReport، ChangeRecord، ApprovalRequest و AuditEvent با owner، scope، version، expiry و provenance؛ JSON Schema متناظر در schema/.
- Schema باید inputs=web pages، accessibility tree و outputs=a11y report را با reason code، approver و rollback reference بیان کند.

**محل پیاده‌سازی:**
- src/core/policy-engine.ts، evidence.ts و planned src/governance/؛ docs/ برای policy/runbook؛ schema/ و test/ برای قرارداد و review.
- ماژول اختصاصی planned: src/core/governance/up-095.ts؛ fixture و تست: test/up-095.test.ts

**وابستگی‌ها:** UP-002

**مرزهای امنیتی:**
- critical accessibility finding merge را block کند

**تهدیدهای امنیتی:**
- privilege escalation، approval جعلی، policy drift، حذف audit، تبعیض زبانی و ناسازگاری license/privacy.
- تهدید اختصاصی UP-095: تغییر بدون review یا exception منقضی می‌تواند authority و معیار کیفیت «WCAG» را دور بزند؛ immutable audit لازم است.

**تست‌های لازم:**
- policy matrix، expiry/revocation، audit immutability، quality regression، compliance fixtures، accessibility و independent review.
- تست اختصاصی UP-095: مسیر موفق، ورودی ناقص، approval denial، rollback و گزارش evidence واقعی.

**معیار پذیرش:**
- automated plus manual audit

**Definition of Done:**
- policy و معیار کیفیت versioned و review شده‌اند، exception تاریخ انقضا و approver دارد، audit کامل است و مسیر اعتراض/rollback مستند و تست شده است.
- UP-095 فقط با interface/schema، محل پیاده‌سازی، threat model، تست مثبت/منفی و evidence واقعی بسته می‌شود؛ متن تولیدشده به‌تنهایی کافی نیست.

**Evidence کد فعلی:**
- src/core/governance-quality.ts
- test/audit-next-phases-2.test.ts

### 96. Persian RTL QA — UP-096

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Governance و کیفیت محصول | P1 | `partial` | `in_progress` |

**هدف:**
- عدد، تاریخ، code، path، log، table و mixed-direction text در fa-IR تست شود.

**مسئله‌ای که حل می‌کند:**
- تصمیم محصول یا policy برای «Persian RTL QA» بدون owner، version، معیار کیفیت و مسیر اعتراض قابل دفاع و قابل بازگشت نیست.

**طراحی اجرایی:**
- عدد، تاریخ، code، path، log، table و mixed-direction text در fa-IR تست شود.

**ورودی‌ها:**
- locale، UI strings، fixtures

**خروجی‌ها:**
- RTL QA report

**Interface / Schema:**
- UP-096 / Persian RTL QA: PolicyBundle، QualityReport، ChangeRecord، ApprovalRequest و AuditEvent با owner، scope، version، expiry و provenance؛ JSON Schema متناظر در schema/.
- Schema باید inputs=locale، UI strings، fixtures و outputs=RTL QA report را با reason code، approver و rollback reference بیان کند.

**محل پیاده‌سازی:**
- src/core/policy-engine.ts، evidence.ts و planned src/governance/؛ docs/ برای policy/runbook؛ schema/ و test/ برای قرارداد و review.
- ماژول اختصاصی planned: src/core/governance/up-096.ts؛ fixture و تست: test/up-096.test.ts

**وابستگی‌ها:** UP-002

**مرزهای امنیتی:**
- identifier و code نباید bidi spoof شوند

**تهدیدهای امنیتی:**
- privilege escalation، approval جعلی، policy drift، حذف audit، تبعیض زبانی و ناسازگاری license/privacy.
- تهدید اختصاصی UP-096: تغییر بدون review یا exception منقضی می‌تواند authority و معیار کیفیت «Persian RTL QA» را دور بزند؛ immutable audit لازم است.

**تست‌های لازم:**
- policy matrix، expiry/revocation، audit immutability، quality regression، compliance fixtures، accessibility و independent review.
- تست اختصاصی UP-096: مسیر موفق، ورودی ناقص، approval denial، rollback و گزارش evidence واقعی.

**معیار پذیرش:**
- visual snapshots and text tests

**Definition of Done:**
- policy و معیار کیفیت versioned و review شده‌اند، exception تاریخ انقضا و approver دارد، audit کامل است و مسیر اعتراض/rollback مستند و تست شده است.
- UP-096 فقط با interface/schema، محل پیاده‌سازی، threat model، تست مثبت/منفی و evidence واقعی بسته می‌شود؛ متن تولیدشده به‌تنهایی کافی نیست.

**Evidence کد فعلی:**
- src/core/governance-quality.ts
- test/audit-next-phases-2.test.ts

### 97. Plugin Marketplace — UP-097

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Governance و کیفیت محصول | P0 | `partial` | `in_progress` |

**هدف:**
- Plugin قبل از انتشار review، sandbox test، permission، SBOM و signature داشته باشد.

**مسئله‌ای که حل می‌کند:**
- تصمیم محصول یا policy برای «Plugin Marketplace» بدون owner، version، معیار کیفیت و مسیر اعتراض قابل دفاع و قابل بازگشت نیست.

**طراحی اجرایی:**
- Plugin قبل از انتشار review، sandbox test، permission، SBOM و signature داشته باشد.

**ورودی‌ها:**
- plugin package، manifest، scan

**خروجی‌ها:**
- publication decision

**Interface / Schema:**
- UP-097 / Plugin Marketplace: PolicyBundle، QualityReport، ChangeRecord، ApprovalRequest و AuditEvent با owner، scope، version، expiry و provenance؛ JSON Schema متناظر در schema/.
- Schema باید inputs=plugin package، manifest، scan و outputs=publication decision را با reason code، approver و rollback reference بیان کند.

**محل پیاده‌سازی:**
- src/core/policy-engine.ts، evidence.ts و planned src/governance/؛ docs/ برای policy/runbook؛ schema/ و test/ برای قرارداد و review.
- ماژول اختصاصی planned: src/core/governance/up-097.ts؛ fixture و تست: test/up-097.test.ts

**وابستگی‌ها:** UP-009, UP-033, UP-038

**مرزهای امنیتی:**
- marketplace install بدون verification ممنوع

**تهدیدهای امنیتی:**
- privilege escalation، approval جعلی، policy drift، حذف audit، تبعیض زبانی و ناسازگاری license/privacy.
- تهدید اختصاصی UP-097: تغییر بدون review یا exception منقضی می‌تواند authority و معیار کیفیت «Plugin Marketplace» را دور بزند؛ immutable audit لازم است.

**تست‌های لازم:**
- policy matrix، expiry/revocation، audit immutability، quality regression، compliance fixtures، accessibility و independent review.
- تست اختصاصی UP-097: مسیر موفق، ورودی ناقص، approval denial، rollback و گزارش evidence واقعی.

**معیار پذیرش:**
- malicious plugin rejection

**Definition of Done:**
- policy و معیار کیفیت versioned و review شده‌اند، exception تاریخ انقضا و approver دارد، audit کامل است و مسیر اعتراض/rollback مستند و تست شده است.
- UP-097 فقط با interface/schema، محل پیاده‌سازی، threat model، تست مثبت/منفی و evidence واقعی بسته می‌شود؛ متن تولیدشده به‌تنهایی کافی نیست.

**Evidence کد فعلی:**
- src/core/governance-quality.ts
- test/audit-next-phases-2.test.ts

### 98. Transparency Dashboard — UP-098

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Governance و کیفیت محصول | P2 | `partial` | `in_progress` |

**هدف:**
- Run، cost، error، quality، provider share و security block به کاربر گزارش شود.

**مسئله‌ای که حل می‌کند:**
- تصمیم محصول یا policy برای «Transparency Dashboard» بدون owner، version، معیار کیفیت و مسیر اعتراض قابل دفاع و قابل بازگشت نیست.

**طراحی اجرایی:**
- Run، cost، error، quality، provider share و security block به کاربر گزارش شود.

**ورودی‌ها:**
- ledger، metrics، audit projections

**خروجی‌ها:**
- dashboard metrics

**Interface / Schema:**
- UP-098 / Transparency Dashboard: PolicyBundle، QualityReport، ChangeRecord، ApprovalRequest و AuditEvent با owner، scope، version، expiry و provenance؛ JSON Schema متناظر در schema/.
- Schema باید inputs=ledger، metrics، audit projections و outputs=dashboard metrics را با reason code، approver و rollback reference بیان کند.

**محل پیاده‌سازی:**
- src/core/policy-engine.ts، evidence.ts و planned src/governance/؛ docs/ برای policy/runbook؛ schema/ و test/ برای قرارداد و review.
- ماژول اختصاصی planned: src/core/governance/up-098.ts؛ fixture و تست: test/up-098.test.ts

**وابستگی‌ها:** UP-051, UP-098

**مرزهای امنیتی:**
- اطلاعات Tenant دیگر و Secret هرگز نمایش داده نشود

**تهدیدهای امنیتی:**
- privilege escalation، approval جعلی، policy drift، حذف audit، تبعیض زبانی و ناسازگاری license/privacy.
- تهدید اختصاصی UP-098: تغییر بدون review یا exception منقضی می‌تواند authority و معیار کیفیت «Transparency Dashboard» را دور بزند؛ immutable audit لازم است.

**تست‌های لازم:**
- policy matrix، expiry/revocation، audit immutability، quality regression، compliance fixtures، accessibility و independent review.
- تست اختصاصی UP-098: مسیر موفق، ورودی ناقص، approval denial، rollback و گزارش evidence واقعی.

**معیار پذیرش:**
- dashboard numbers reconcile with ledger

**Definition of Done:**
- policy و معیار کیفیت versioned و review شده‌اند، exception تاریخ انقضا و approver دارد، audit کامل است و مسیر اعتراض/rollback مستند و تست شده است.
- UP-098 فقط با interface/schema، محل پیاده‌سازی، threat model، تست مثبت/منفی و evidence واقعی بسته می‌شود؛ متن تولیدشده به‌تنهایی کافی نیست.

**Evidence کد فعلی:**
- src/core/governance-quality.ts
- test/audit-next-phases-2.test.ts

### 99. Architecture Decision Records — UP-099

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Governance و کیفیت محصول | P1 | `partial` | `in_progress` |

**هدف:**
- تصمیم‌های مهم، trade-off، alternatives و rollback در ADR ثبت شود.

**مسئله‌ای که حل می‌کند:**
- تصمیم محصول یا policy برای «Architecture Decision Records» بدون owner، version، معیار کیفیت و مسیر اعتراض قابل دفاع و قابل بازگشت نیست.

**طراحی اجرایی:**
- تصمیم‌های مهم، trade-off، alternatives و rollback در ADR ثبت شود.

**ورودی‌ها:**
- decision request، reviewers

**خروجی‌ها:**
- ADR و link به evidence

**Interface / Schema:**
- UP-099 / Architecture Decision Records: PolicyBundle، QualityReport، ChangeRecord، ApprovalRequest و AuditEvent با owner، scope، version، expiry و provenance؛ JSON Schema متناظر در schema/.
- Schema باید inputs=decision request، reviewers و outputs=ADR و link به evidence را با reason code، approver و rollback reference بیان کند.

**محل پیاده‌سازی:**
- src/core/policy-engine.ts، evidence.ts و planned src/governance/؛ docs/ برای policy/runbook؛ schema/ و test/ برای قرارداد و review.
- ماژول اختصاصی planned: src/core/governance/up-099.ts؛ fixture و تست: test/up-099.test.ts

**وابستگی‌ها:** UP-099

**مرزهای امنیتی:**
- ADR ادعای بدون evidence نداشته باشد

**تهدیدهای امنیتی:**
- privilege escalation، approval جعلی، policy drift، حذف audit، تبعیض زبانی و ناسازگاری license/privacy.
- تهدید اختصاصی UP-099: تغییر بدون review یا exception منقضی می‌تواند authority و معیار کیفیت «Architecture Decision Records» را دور بزند؛ immutable audit لازم است.

**تست‌های لازم:**
- policy matrix، expiry/revocation، audit immutability، quality regression، compliance fixtures، accessibility و independent review.
- تست اختصاصی UP-099: مسیر موفق، ورودی ناقص، approval denial، rollback و گزارش evidence واقعی.

**معیار پذیرش:**
- ADR link checker

**Definition of Done:**
- policy و معیار کیفیت versioned و review شده‌اند، exception تاریخ انقضا و approver دارد، audit کامل است و مسیر اعتراض/rollback مستند و تست شده است.
- UP-099 فقط با interface/schema، محل پیاده‌سازی، threat model، تست مثبت/منفی و evidence واقعی بسته می‌شود؛ متن تولیدشده به‌تنهایی کافی نیست.

**Evidence کد فعلی:**
- src/core/governance-quality.ts
- test/audit-next-phases-2.test.ts

### 100. Gap Register Automation — UP-100

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| Governance و کیفیت محصول | P0 | `partial` | `in_progress` |

**هدف:**
- هر proposal owner، status، evidence، dependency و DoD داشته باشد و CI آن را verify کند.

**مسئله‌ای که حل می‌کند:**
- تصمیم محصول یا policy برای «Gap Register Automation» بدون owner، version، معیار کیفیت و مسیر اعتراض قابل دفاع و قابل بازگشت نیست.

**طراحی اجرایی:**
- هر proposal owner، status، evidence، dependency و DoD داشته باشد و CI آن را verify کند.

**ورودی‌ها:**
- upgrade register، files، tests

**خروجی‌ها:**
- coverage report و stale detection

**Interface / Schema:**
- UP-100 / Gap Register Automation: PolicyBundle، QualityReport، ChangeRecord، ApprovalRequest و AuditEvent با owner، scope، version، expiry و provenance؛ JSON Schema متناظر در schema/.
- Schema باید inputs=upgrade register، files، tests و outputs=coverage report و stale detection را با reason code، approver و rollback reference بیان کند.

**محل پیاده‌سازی:**
- src/core/policy-engine.ts، evidence.ts و planned src/governance/؛ docs/ برای policy/runbook؛ schema/ و test/ برای قرارداد و review.
- ماژول اختصاصی planned: src/core/governance/up-100.ts؛ fixture و تست: test/up-100.test.ts

**وابستگی‌ها:** UP-100

**مرزهای امنیتی:**
- done فقط با evidence واقعی و test accepted شود

**تهدیدهای امنیتی:**
- privilege escalation، approval جعلی، policy drift، حذف audit، تبعیض زبانی و ناسازگاری license/privacy.
- تهدید اختصاصی UP-100: تغییر بدون review یا exception منقضی می‌تواند authority و معیار کیفیت «Gap Register Automation» را دور بزند؛ immutable audit لازم است.

**تست‌های لازم:**
- policy matrix، expiry/revocation، audit immutability، quality regression، compliance fixtures، accessibility و independent review.
- تست اختصاصی UP-100: مسیر موفق، ورودی ناقص، approval denial، rollback و گزارش evidence واقعی.

**معیار پذیرش:**
- register count/status/path test

**Definition of Done:**
- policy و معیار کیفیت versioned و review شده‌اند، exception تاریخ انقضا و approver دارد، audit کامل است و مسیر اعتراض/rollback مستند و تست شده است.
- UP-100 فقط با interface/schema، محل پیاده‌سازی، threat model، تست مثبت/منفی و evidence واقعی بسته می‌شود؛ متن تولیدشده به‌تنهایی کافی نیست.

**Evidence کد فعلی:**
- src/core/upgrade-register.ts
- docs/upgrade-register.json


## قراردادهای فاز M119 تا M123

این پنج فاز extensionهای جدید به ۱۰۰ proposal هستند و وضعیت آن‌ها مستقل از `done_tested` proposalها، `designed_only` باقی می‌ماند. deterministic kernel و unit test، integration production محسوب نمی‌شوند.

| فاز | قرارداد | dependency/مرز | production evidence لازم |
|---|---|---|---|
| M119 | Durable tenant transaction، RLS، migration safety، transactional outbox | `src/core/durable-tenant-runtime.ts` و `GAP-DA-07` | PostgreSQL/RLS، migration runner، durable outbox worker و دو-tenant replay |
| M120 | Verification matrix، CI، security، accessibility، load | `src/core/verification-matrix-runtime.ts` و `GAP-QA-07` | CI artifacts، scanner، browser/screen-reader و bounded load telemetry |
| M121 | SDK/API compatibility، safe CLI، config bootstrap، handoff | `src/core/developer-sdk-cli-runtime.ts` و `GAP-API-08` | generated SDK، sandbox، secret manager، config store و compatibility run |
| M122 | Key rotation، erasure، deletion proof، backup retention | `src/core/key-rotation-deletion-runtime.ts` و `GAP-SE-12` | KMS/HSM، erasure worker، immutable proof و backup purge/restore |
| M123 | Capacity، circuit breaker، failure injection، resilience alert | `src/core/resilience-capacity-runtime.ts` و `GAP-PO-07` | telemetry، runtime breaker، bounded chaos، alert route و incident drill |

تمام فازها Local-first، BYOK، free-tier fallback، sandbox، audit و approval را حفظ می‌کنند؛ raw password/key material ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است، و production deploy بدون approval انجام نمی‌شود.


## قراردادهای فاز M124 تا M128

این سری پنج فاز جدید را به‌عنوان hardening contracts ثبت می‌کند؛ وضعیت هر پنج فاز مستقل از proposalهای ۱۰۰تایی، `designed_only` از نظر production integration است.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M124 | audit ledger، evidence provenance، replay و retention | `GAP-AUD-01` | WORM/event store، signed evidence، replay worker و legal-hold retention |
| M125 | identity continuity، session revoke، delegation و MFA recovery | `GAP-CP-14` | IdP/passkey، durable revoke، membership persistence و recovery review |
| M126 | connector consent، signed webhook، reconciliation و action safety | `GAP-IG-12` | OAuth/PKCE، ingress، cursor/outbox، provider adapter و conflict UI |
| M127 | corpus، deterministic replay، quality gate و release evidence | `GAP-QA-08` | corpus registry، model runner، CI/browser farm، load و rollback |
| M128 | usage ledger، quota، provider allocation و cost reconciliation | `GAP-OB-07` | durable metering، quota probes، scheduler، billing adapter و FinOps dashboard |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M129 تا M133

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً `designed_only` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M129 | API evolution، schema migration و stream reconnect | `GAP-API-09` | schema registry، consumer CI، durable stream replay و migration runner |
| M130 | artifact supply chain، SBOM، attestation، secret و egress | `GAP-SE-13` | signed registry، scanners، attestation verifier، secret broker و egress proxy |
| M131 | approval operations، human review و escalation | `GAP-CP-15` | durable inbox، reviewer identity، notification، signing و deployment gate |
| M132 | knowledge ACL، freshness، lineage و context | `GAP-IN-19` | indexer، ACL retrieval، freshness worker، lineage store و deletion propagation |
| M133 | self-host upgrade، backup restore و controlled cutover | `GAP-PO-08` | package/controller، encrypted restore، traffic switch، rollback و drill |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M134 تا M138

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً `designed_only` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M134 | data portability و controlled import | `GAP-DA-08` | encrypted export store، schema registry، import worker و rollback |
| M135 | device pairing و local trust | `GAP-CP-16` | IdP/WebAuthn، attestation، device registry و revocation fan-out |
| M136 | policy distribution و configuration drift | `GAP-SE-14` | signed policy service، KMS، fleet agent و runtime enforcement |
| M137 | incident case، bounded containment و postmortem | `GAP-PO-09` | alert/case store، on-call، containment controller و drill |
| M138 | privacy-preserving telemetry و feedback | `GAP-OB-08` | consent store، telemetry SDK، DLP، warehouse و deletion worker |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M139 تا M143

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً `designed_only` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M139 | observability SLO و trace integrity | `GAP-OB-09` | telemetry collector/backend، SLO evaluator، alert router و runbook |
| M140 | full-text search و query governance | `GAP-DA-09` | indexer، ACL search، ranking/freshness و export audit |
| M141 | workflow scheduler و trigger runtime | `GAP-EX-14` | scheduler، durable queue، lease/worker، retry و DLQ |
| M142 | artifact lifecycle و preview isolation | `GAP-EX-15` | artifact store، preview proxy، sandbox، signed URL و cleanup |
| M143 | operator console و live Run UX | `GAP-UX-10` | Web UI، realtime gateway، safe action API و accessibility E2E |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M144 تا M148

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً `designed_only` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M144 | public API surface و OpenAPI compatibility | `GAP-API-10` | OpenAPI registry/gateway، consumer CI، authz و rate limiter |
| M145 | connector SDK و OAuth/PKCE lifecycle | `GAP-IG-13` | connector SDK، OAuth provider، token broker و webhook ingress |
| M146 | workspace VFS و sandbox resource boundary | `GAP-EX-16` | VFS/snapshot، sandbox/cgroup، resource telemetry و diff applier |
| M147 | tenant isolation و RLS proof | `GAP-SE-15` | PostgreSQL RLS، cross-tenant CI probe، transaction replay و signed proof |
| M148 | E2E release acceptance و readiness | `GAP-QA-09` | product E2E، security/accessibility matrix، orchestrator و rollback |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M149 تا M153

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً `designed_only` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M149 | durable worker queue، retry و DLQ | `GAP-EX-17` | queue backend، worker consumer، lease، retry و DLQ store |
| M150 | database migration و schema governance | `GAP-DA-10` | migration runner، schema lock، backfill monitor، RLS و rollback |
| M151 | GitHub App و webhook/action integration | `GAP-IG-14` | GitHub App، token broker، webhook ingress و repository worker |
| M152 | preview environment و deployment routing | `GAP-EX-18` | provisioner، port allocator، TLS/proxy، deployment adapter و cleanup |
| M153 | product E2E orchestration و failure containment | `GAP-QA-10` | scenario runner، isolated test data، E2E runner، evidence و rollback |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M159 تا M163

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً `designed_only` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M159 | data residency و regional routing | `GAP-SE-17` | regional store/router، jurisdiction registry، transfer gateway و deletion worker |
| M160 | feature flags و progressive rollout | `GAP-CP-18` | signed flag store، evaluator، propagation، SLO guardrail و kill switch |
| M161 | workload identity و service-account leases | `GAP-IG-16` | IdP/attestation، lease broker، binding policy و revoke propagation |
| M162 | data rights، export و deletion orchestration | `GAP-DA-11` | rights intake، encrypted export، deletion sweep، legal hold و residual proof |
| M163 | FinOps budget guardrails و usage reconciliation | `GAP-OB-10` | usage ledger، receipt adapter، cost catalog، budget gateway و alerting |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M164 تا M168

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً `designed_only` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M164 | structured output repair و response safety | `GAP-IN-20` | model adapter، schema decoder، repair worker، DLP و response gateway |
| M165 | agent delegation و capability tokens | `GAP-IG-17` | delegation broker، capability store، agent gateway و revoke propagation |
| M166 | cancellation و compensation runtime | `GAP-EX-19` | cancellation controller، checkpoint/lease، compensation worker و cleanup |
| M167 | reproducible build و release manifest | `GAP-PO-11` | hermetic builder، registry، SBOM/provenance verifier و canary gate |
| M168 | outbound webhook و callback delivery | `GAP-IG-18` | endpoint registry، signing service، queue/worker، retry/DLQ و replay store |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M169 تا M173

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً `designed_only` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M169 | context provenance و prompt-injection firewall | `GAP-IN-21` | context assembler، provenance store، classifier، quarantine و response firewall |
| M170 | tool action boundary و transactional approval | `GAP-EX-20` | tool gateway، approval store، precondition lock، action applier و rollback |
| M171 | offline sync و conflict resolution | `GAP-UX-11` | offline client/store، sync API، conflict UI، merge worker و device trust |
| M172 | accessibility و localization verification | `GAP-QA-11` | locale pipeline، browser/a11y runner، screen-reader evidence و CI gate |
| M173 | incident learning و runbook automation | `GAP-PO-12` | case store، on-call router، runbook executor، postmortem و regression CI |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M174 تا M178

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً `designed_only` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M174 | prompt experimentation و rollback | `GAP-IN-22` | variant registry، assignment/router، evaluator، privacy-safe metrics و rollback controller |
| M175 | multi-model consensus و voting | `GAP-IN-23` | panel registry، model fan-out، vote store، calibration و human review |
| M176 | agent-to-agent protocol و interoperability | `GAP-IG-19` | discovery registry، protocol gateway، signature/replay store، schema validator و revoke |
| M177 | prompt cache integrity و privacy | `GAP-SE-18` | cache backend، KMS/BYOK، invalidation، poisoning detector و replica purge |
| M178 | deployment adapter و release target boundary | `GAP-PO-13` | target registry، adapter gateway، artifact verifier، smoke runner و rollback controller |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M179 تا M183

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً `designed_only` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M179 | pull-request quality و commit provenance | `GAP-PO-14` | Git provider، reviewer/code-owner، secret scanner، CI checks، merge controller و release registry |
| M180 | agent graph orchestration و durable checkpoints | `GAP-EX-21` | graph compiler، durable queue/worker، checkpoint store، lease manager، sandbox و replay |
| M181 | performance budget و load shedding | `GAP-OB-11` | telemetry، budget ledger، admission gateway، scheduler، load runner و autoscaler |
| M182 | onboarding و safe first run | `GAP-CP-19` | Web onboarding، auth/session، provider consent، fixture/bootstrap و handoff gateway |
| M183 | service entitlement، SLA و degraded disclosure | `GAP-CP-20` | entitlement/billing adapter، usage ledger، quota gateway، SLA monitor و disclosure UI |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M184 تا M188

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً `designed_only` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M184 | graph engine compatibility و state interop | `GAP-EX-22` | adapter gateway، state/checkpoint store، protocol translator، sandbox و replay |
| M185 | repository intelligence و retrieval evidence | `GAP-IN-24` | commit-bound indexer، ACL retrieval، semantic/AST backend، DLP و deletion worker |
| M186 | human feedback و preference governance | `GAP-QA-12` | feedback store، privacy/bias evaluator، model registry، canary و rollback |
| M187 | dependency risk و vulnerability response | `GAP-SE-19` | package/SCA feed، license/SBOM verifier، patch workflow و quarantine gate |
| M188 | schema evolution و consumer compatibility | `GAP-API-11` | schema registry، migration/backfill runner، consumer CI، gateway و rollback |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M189 تا M193

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً `designed_only` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M189 | release provenance و promotion evidence | `GAP-PO-15` | artifact registry، reproducible builder، SBOM/provenance verifier، canary و rollback |
| M190 | egress policy و destination governance | `GAP-SE-20` | egress proxy، DNS/TLS policy، DLP، vault lease و network evidence |
| M191 | retention، legal hold و secure erasure | `GAP-DA-12` | retention registry، erasure orchestrator، backup sweep، KMS و residual scanner |
| M192 | recovery، chaos و failover evidence | `GAP-OB-12` | fault injector، backup/restore، failover/fencing coordinator، replay و incident evidence |
| M193 | tenant fairness و queue scheduling | `GAP-EX-23` | durable queue، fair scheduler، lease/preemption store، autoscaler و quota adapter |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M194 تا M198

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً `designed_only` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M194 | runtime evidence envelope و claim verification | `GAP-OB-13` | evidence ledger، signer/verifier، claim aggregator، replay runner و evidence surface |
| M195 | provider health و circuit recovery | `GAP-IG-20` | health collector، circuit/quota gateway، route controller، probe worker و fallback disclosure |
| M196 | plugin capability sandbox و extension certification | `GAP-SE-21` | extension registry، artifact verifier، sandbox executor، scanners و revoke propagation |
| M197 | notification delivery و preference governance | `GAP-CP-21` | notification store/router، consent UI، channel adapters، delivery worker و escalation |
| M198 | model catalog freshness و capability disclosure | `GAP-IN-25` | signed catalog، discovery verifier، health/quota probe، activation gate و retirement migrator |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M199 تا M203

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً `designed_only` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M199 | intent normalization و scope freeze | `GAP-CP-22` | intent/requirement store، scope evaluator، plan compiler، freeze store و change workflow |
| M200 | side-effect journal و idempotent commit | `GAP-EX-24` | durable journal، idempotency/outbox، precondition lock، applier، receipt و compensation |
| M201 | connector reconciliation و drift repair | `GAP-IG-21` | snapshot/cursor store، diff engine، conflict UI، repair worker و drift collector |
| M202 | approval integrity و decision expiry | `GAP-CP-23` | approval inbox، signed decision store، expiry/revoke gate و second reviewer workflow |
| M203 | privacy-preserving analytics و aggregation | `GAP-OB-14` | privacy collector، budget ledger، noisy aggregate، cohort gate، export و deletion worker |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M204 تا M208

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً `designed_only` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M204 | run handoff و human takeover | `GAP-CP-24` | run-control store، takeover UI، lease/authority، checkpoint resume و cleanup coordinator |
| M205 | capability attestation و trust-bound activation | `GAP-SE-22` | issuer/verifier، capability registry، environment probe، activation gateway و revoke propagation |
| M206 | region-bound processing و residency enforcement | `GAP-DA-13` | regional router، provider location verifier، transfer gateway، encrypted stores و erasure worker |
| M207 | action simulation و blast-radius preview | `GAP-EX-25` | isolated simulator، snapshot/diff، preview UI، apply gateway و rollback runner |
| M208 | policy change control و rollback | `GAP-SE-23` | policy registry، diff/test evaluator، signed canary gateway، distributor، drift monitor و rollback controller |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.
