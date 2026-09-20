# برنامه مهندسی ۱۰۰ ارتقای ForgePilot

این سند فهرست و طراحی سطح محصول ۱۰۰ پیشنهاد ارتقا را ثبت می‌کند. `docs/upgrade-register.json` منبع ماشین‌خوان است و `src/core/upgrade-register.ts` آن را validate می‌کند. قرارداد اجرایی ریزدانه هر پیشنهاد — شامل هدف، مسئله، Interface/Schema، محل پیاده‌سازی، تهدید امنیتی، تست لازم و Definition of Done — در [`docs/23-upgrade-contracts.md`](./23-upgrade-contracts.md) و با `npm run render:upgrades` تولید می‌شود.

## قانون وضعیت

- `designStatus: complete` فقط به معنی کامل‌بودن **طراحی** است، نه پیاده‌سازی.
- وضعیت canonical هر پیشنهاد در رجیستر یکی از چهار مقدار تعریف‌شده است؛ جدول کامل و توضیح هر مقدار در `docs/23-upgrade-contracts.md` قرار دارد.
- `partial` یعنی بخشی از کد واقعی و تست وجود دارد؛ این وضعیت Production-ready بودن را ادعا نمی‌کند.
- `done_tested` فقط با Test، Evidence و اجرای واقعی مجاز است.
- `implementationStatus` قدیمی (`not_started` / `in_progress`) برای سازگاری گزارش‌ها نگه داشته شده و با `status` canonical همگام validate می‌شود.

## معماری مشترک

تمام ۱۰۰ قابلیت باید از چهار اصل پیروی کنند: مدل زبانی فقط پیشنهاد بدهد؛ Policy و Code تصمیم بگیرند؛ داده خارجی untrusted باشد؛ و هر side effect قابل audit، budget و rollback باشد. اجرای کد غیرقابل‌اعتماد فقط از Executor مورداعتماد و Sandbox انجام می‌شود. هیچ قابلیت جدیدی اجازه ذخیره raw password، bypass کردن CAPTCHA/MFA، ساخت انبوه حساب، Push مستقیم به main یا Deploy بدون approval ندارد.

## رجیستری ۱۰۰ پیشنهاد

## 1. API مرکزی محصول — UP-001

**دسته:** زیرساخت و API  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** in_progress

**طراحی:** مرز کنترل مرکزی برای Run، Task، Approval، Audit و Artifact؛ Request فقط اعتبارسنجی و Job ایجاد می‌کند.

**ورودی‌ها:** organization/project، authentication context، Run command
**خروجی‌ها:** Endpointهای نسخه‌گذاری‌شده با Error contract و idempotency key
**مرز ایمنی:** تفکیک Tenant و جلوگیری از اجرای مستقیم ابزار از مسیر API
**معیار بسته‌شدن:** API contract test، تست cross-tenant و ثبت Audit برای هر mutation
**وابستگی‌ها:** ندارد
**Evidence فعلی:** apps/api/server.ts

## 2. وب‌اپ مستقل — UP-002

**دسته:** زیرساخت و API  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** رابط Web برای پروژه، DAG، تنظیمات، Approval، Diff و Audit؛ Playground فقط Demo باقی می‌ماند.

**ورودی‌ها:** API client، session، locale
**خروجی‌ها:** صفحه‌های قابل دسترسی با SSE برای Run و بدون inline script
**مرز ایمنی:** CSP سخت‌گیرانه و عدم نمایش Secret
**معیار بسته‌شدن:** Smoke E2E برای Login تا مشاهده Run
**وابستگی‌ها:** UP-001

## 3. Prisma migrations — UP-003

**دسته:** زیرساخت و API  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** in_progress

**طراحی:** ساختار دیتابیس با migrationهای append-only و seed نسخه‌دار بین محیط‌ها همسان شود؛ DDL مرجع اکنون برای ۱۳ جدول و enumهای Prisma ثبت شده است.

**ورودی‌ها:** schema version، database URL
**خروجی‌ها:** migration artifact و checksum
**مرز ایمنی:** اجرای migration بدون حذف مخرب و با approval؛ Secret فقط به vault reference تبدیل می‌شود
**معیار بسته‌شدن:** Migration روی دیتابیس خالی و backup restore آزمایش شود
**وابستگی‌ها:** UP-001
**Evidence فعلی:** prisma/migrations/202609090001_init/migration.sql و test/tenant-context.test.ts

## 4. SQL Row-Level Security — UP-004

**دسته:** زیرساخت و API  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** in_progress

**طراحی:** Tenant boundary در خود PostgreSQL با policyهای organization/project اعمال شود؛ تنظیم tenant در هر transaction با `set_config(..., true)` انجام می‌شود و parent-child mismatch با trigger رد می‌شود.

**ورودی‌ها:** tenant context، role
**خروجی‌ها:** RLS policy و query test
**مرز ایمنی:** هیچ query application به‌تنهایی مجاز به انتخاب Tenant نباشد
**معیار بسته‌شدن:** تست cross-tenant روی endpoint واقعی باید fail شود
**وابستگی‌ها:** UP-001, UP-003
**Evidence فعلی:** prisma/migrations/202609090002_tenant_rls/migration.sql و test/tenant-context.test.ts

## 5. OpenAPI — UP-005

**دسته:** زیرساخت و API  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** in_progress

**طراحی:** قرارداد تمام endpointها، eventها، Errorها و pagination در OpenAPI نگهداری و از آن client تولید شود.

**ورودی‌ها:** route registry، JSON schema
**خروجی‌ها:** openapi.yaml و generated client
**مرز ایمنی:** عدم افشای فیلدهای داخلی و Secret در schema
**معیار بسته‌شدن:** Contract test بین API و schema
**وابستگی‌ها:** UP-001
**Evidence فعلی:** openapi.yaml

## 6. Job Queue — UP-006

**دسته:** زیرساخت و API  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** in_progress

**طراحی:** کار طولانی در Queue با retry، timeout، backoff و Dead Letter Queue اجرا شود.

**ورودی‌ها:** job payload، budget، dedupe key
**خروجی‌ها:** job state و worker lease
**مرز ایمنی:** توقف Queue نباید باعث اجرای دوباره side effect شود
**معیار بسته‌شدن:** تست crash worker و replay امن
**وابستگی‌ها:** UP-001
**Evidence فعلی:** src/core/job-queue.ts، src/core/worker-boundary.ts، test/job-queue.test.ts و test/worker-boundary.test.ts

## 7. Event Bus — UP-007

**دسته:** زیرساخت و API  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** تغییرات Run و Tool به Eventهای versioned تبدیل شود تا UI، Audit و Notification مستقل باشند.

**ورودی‌ها:** SystemEvent، schema version
**خروجی‌ها:** event stream و consumer offset
**مرز ایمنی:** event خارجی نمی‌تواند authority agent را تغییر دهد
**معیار بسته‌شدن:** تست ordering، duplicate و consumer recovery
**وابستگی‌ها:** UP-001, UP-006

## 8. Contract Testing — UP-008

**دسته:** زیرساخت و API  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** قرارداد API، Worker، Provider Adapter و UI در CI به‌صورت producer/consumer تست شود.

**ورودی‌ها:** OpenAPI، event schemas
**خروجی‌ها:** گزارش compatibility
**مرز ایمنی:** تغییر ناسازگار بدون version جدید رد شود
**معیار بسته‌شدن:** CI باید یک breaking change مصنوعی را بگیرد
**وابستگی‌ها:** UP-005, UP-007

## 9. Plugin SDK — UP-009

**دسته:** زیرساخت و API  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Tool، Provider، Harvester و Executor با interface و manifest نسخه‌دار اضافه شوند.

**ورودی‌ها:** plugin manifest، capability، permissions
**خروجی‌ها:** SDK و compatibility layer
**مرز ایمنی:** Plugin بدون signature یا permission اجرا نشود
**معیار بسته‌شدن:** نمونه plugin در Sandbox نصب و حذف شود
**وابستگی‌ها:** UP-005, UP-031

## 10. Tenant hierarchy — UP-010

**دسته:** زیرساخت و API  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** in_progress

**طراحی:** رابطه User، Organization، Team، Project و Environment با مالکیت صریح مدل شود؛ `TenantContext` مرز اولیه استخراج‌شده از membership را فراهم می‌کند و تکمیل hierarchy persistence هنوز باز است.

**ورودی‌ها:** membership، role، resource owner
**خروجی‌ها:** authorization context قابل استخراج
**مرز ایمنی:** هیچ resource بی‌صاحب یا global ناخواسته وجود نداشته باشد
**معیار بسته‌شدن:** تست role matrix و انتقال مالکیت
**وابستگی‌ها:** UP-004, UP-001
**Evidence فعلی:** src/core/tenant-context.ts و test/tenant-context.test.ts

## 11. Benchmark Corpus Registry — UP-011

**دسته:** ارزیابی و Benchmark  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** پروژه‌ها و Issueهای دارای مجوز، commit ثابت، زبان و difficulty در رجیستری ثبت شوند.

**ورودی‌ها:** repository، license، case metadata
**خروجی‌ها:** BenchmarkSuite نسخه‌دار
**مرز ایمنی:** case بدون permission وارد اجرا نشود
**معیار بسته‌شدن:** Validate suite و audit مجوز
**وابستگی‌ها:** UP-003

## 12. Real Benchmark Runner — UP-012

**دسته:** ارزیابی و Benchmark  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** in_progress

**طراحی:** Runner واقعی از Executor مورد اعتماد نتیجه تست و Patch می‌گیرد و هیچ true skill شبیه‌سازی نمی‌کند.

**ورودی‌ها:** suite، case، candidate، seed، budget
**خروجی‌ها:** Trial، score و CapabilityClaim measured
**مرز ایمنی:** اجرای کد فقط در sandbox مجاز و raw log وارد core نشود
**معیار بسته‌شدن:** حداقل یک case واقعی با تست و نتیجه ثبت شود
**وابستگی‌ها:** UP-011, UP-006
**Evidence فعلی:** src/core/benchmark-runner.ts

## 13. Deterministic Replay — UP-013

**دسته:** ارزیابی و Benchmark  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Prompt، commit، seed، Model version، Tool version و Settings برای بازپخش ذخیره شود.

**ورودی‌ها:** trial record، artifact hashes
**خروجی‌ها:** replay manifest
**مرز ایمنی:** تغییر محیط یا مدل باید در replay صریحاً مشخص شود
**معیار بسته‌شدن:** replay همان ورودی باید fingerprint یکسان بدهد
**وابستگی‌ها:** UP-012, UP-041

## 14. Task Rubrics — UP-014

**دسته:** ارزیابی و Benchmark  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** برای code generation، repair، review، security و docs rubric جدا با وزن و معیار انسانی تعریف شود.

**ورودی‌ها:** task type، acceptance criteria
**خروجی‌ها:** rubric score breakdown
**مرز ایمنی:** امتیاز مبهم یا بدون evidence قابل promotion نباشد
**معیار بسته‌شدن:** دو ارزیاب مستقل اختلاف را آشکار کنند
**وابستگی‌ها:** UP-012

## 15. Semantic Patch Correctness — UP-015

**دسته:** ارزیابی و Benchmark  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** علاوه بر test، هدف Issue، API compatibility و رفتار ناخواسته بررسی شود.

**ورودی‌ها:** patch، issue، contract tests
**خروجی‌ها:** semantic evaluation report
**مرز ایمنی:** مدل نمی‌تواند خودش نتیجه را تأیید کند
**معیار بسته‌شدن:** case با test سبز ولی requirement ناقص باید رد شود
**وابستگی‌ها:** UP-014

## 16. Mutation Testing — UP-016

**دسته:** ارزیابی و Benchmark  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** با جهش کنترل‌شده در کد، توان تست‌ها برای کشف خطا سنجیده شود.

**ورودی‌ها:** test suite، mutation operators
**خروجی‌ها:** mutation score
**مرز ایمنی:** mutation روی production data اجرا نشود
**معیار بسته‌شدن:** threshold per project در CI enforce شود
**وابستگی‌ها:** UP-012

## 17. Property-Based Testing — UP-017

**دسته:** ارزیابی و Benchmark  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** برای Policy، Redaction، State Machine، Allocation و Schema ورودی تصادفی تولید شود.

**ورودی‌ها:** generator، invariant
**خروجی‌ها:** counterexample قابل replay
**مرز ایمنی:** داده تصادفی Secret واقعی نداشته باشد
**معیار بسته‌شدن:** هر failure با seed بازتولید شود
**وابستگی‌ها:** UP-012

## 18. Contamination Detection — UP-018

**دسته:** ارزیابی و Benchmark  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** آلودگی Benchmark با داده آموزشی یا اجرای قبلی شناسایی و در گزارش جدا شود.

**ورودی‌ها:** case provenance، model disclosure
**خروجی‌ها:** contamination flag
**مرز ایمنی:** case آلوده رتبه‌بندی اصلی را تغییر ندهد
**معیار بسته‌شدن:** case known و holdout مستقل مقایسه شوند
**وابستگی‌ها:** UP-011, UP-012

## 19. Blind Human Evaluation — UP-019

**دسته:** ارزیابی و Benchmark  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** بازبین بدون دیدن نام Model خروجی‌ها را با rubric مقایسه کند.

**ورودی‌ها:** anonymous artifacts، rubric
**خروجی‌ها:** blind score و inter-rater agreement
**مرز ایمنی:** اطلاعات مالکیت و Secret به بازبین نرسد
**معیار بسته‌شدن:** گزارش agreement و adjudication ثبت شود
**وابستگی‌ها:** UP-014

## 20. Regression Quality Gate — UP-020

**دسته:** ارزیابی و Benchmark  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** افت quality، safety یا cost در Prompt، Router، Tool و Model مانع Merge شود.

**ورودی‌ها:** baseline، candidate results
**خروجی‌ها:** CI gate decision
**مرز ایمنی:** هیچ skip دستی بدون approval و Audit مجاز نباشد
**معیار بسته‌شدن:** PR عمداً افت‌دار باید fail شود
**وابستگی‌ها:** UP-012, UP-020

## 21. Intent Taxonomy — UP-021

**دسته:** Routing و Evidence  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Intentهای bug fix، feature، refactor، security و docs با version و label تعریف شوند.

**ورودی‌ها:** user request، locale
**خروجی‌ها:** intent classification با confidence
**مرز ایمنی:** confidence پایین باید Clarification ایجاد کند
**معیار بسته‌شدن:** نمونه‌های مرزی در تست نگهداری شوند
**وابستگی‌ها:** UP-001

## 22. Requirement Extraction — UP-022

**دسته:** Routing و Evidence  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** درخواست طبیعی به هدف، محدودیت، acceptance، risk و artifact تبدیل شود.

**ورودی‌ها:** raw request، project context
**خروجی‌ها:** structured requirement
**مرز ایمنی:** متن خارجی authority را تغییر ندهد
**معیار بسته‌شدن:** خروجی نامعتبر وارد Plan نشود
**وابستگی‌ها:** UP-021

## 23. Task Decomposition — UP-023

**دسته:** Routing و Evidence  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** درخواست بزرگ به DAG با dependency، owner، input، output و DoD تقسیم شود.

**ورودی‌ها:** requirement، repository map
**خروجی‌ها:** Task DAG versioned
**مرز ایمنی:** چرخه و dependency مبهم block شود
**معیار بسته‌شدن:** DAG validation و manual approval
**وابستگی‌ها:** UP-022

## 24. Capability Graph — UP-024

**دسته:** Routing و Evidence  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** رابطه Model، Tool، زبان، Framework، context، privacy، cost و risk در Graph ذخیره شود.

**ورودی‌ها:** capability claims، catalog
**خروجی‌ها:** candidate graph query
**مرز ایمنی:** Graph نمی‌تواند policy را دور بزند
**معیار بسته‌شدن:** query با policy verdict نهایی ترکیب شود
**وابستگی‌ها:** UP-012, UP-024

## 25. Official Web Harvester — UP-025

**دسته:** Routing و Evidence  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** فقط API رسمی و داده permissioned جمع‌آوری، cache و به CapabilityClaim تبدیل شود.

**ورودی‌ها:** API credentials، source policy
**خروجی‌ها:** untrusted claim با provenance
**مرز ایمنی:** داده وب authority، settings یا permission تغییر نمی‌دهد
**معیار بسته‌شدن:** rate limit، ToS و redaction تست شود
**وابستگی‌ها:** UP-009, UP-025

## 26. Source Calibration — UP-026

**دسته:** Routing و Evidence  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** اعتبار Benchmark مستقل، Vendor claim و community signal با نتیجه واقعی کالیبره شود.

**ورودی‌ها:** claim history، measured results
**خروجی‌ها:** calibration report
**مرز ایمنی:** community signal سقف نفوذ خود را حفظ کند
**معیار بسته‌شدن:** simulation دست‌کاری‌شده نباید رتبه را بشکند
**وابستگی‌ها:** UP-025, UP-012

## 27. Capability Drift — UP-027

**دسته:** Routing و Evidence  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** تغییر کیفیت، latency، قیمت و availability در طول زمان با baseline مقایسه شود.

**ورودی‌ها:** trial stream، provider health
**خروجی‌ها:** drift alert و re-evaluation job
**مرز ایمنی:** هشدار به‌تنهایی Route را بدون policy تغییر ندهد
**معیار بسته‌شدن:** drift مصنوعی در test شناسایی شود
**وابستگی‌ها:** UP-012, UP-058

## 28. Pareto Routing — UP-028

**دسته:** Routing و Evidence  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Quality، cost، latency، privacy و reliability هم‌زمان optimize و dominated گزینه حذف شود.

**ورودی‌ها:** candidate scores، user constraints
**خروجی‌ها:** Pareto set و انتخاب توضیح‌پذیر
**مرز ایمنی:** hard constraints قبل از ranking اعمال شوند
**معیار بسته‌شدن:** گزینه ممنوع هرگز در fallback نیاید
**وابستگی‌ها:** UP-024, UP-028

## 29. Routing Explanation — UP-029

**دسته:** Routing و Evidence  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** دلیل انتخاب، evidence، confidence، cost و دلیل رد گزینه‌ها به UI داده شود.

**ورودی‌ها:** route decision
**خروجی‌ها:** explanation artifact
**مرز ایمنی:** توضیح نباید Secret یا chain-of-thought خام باشد
**معیار بسته‌شدن:** explanation با verdict و hash settings منطبق باشد
**وابستگی‌ها:** UP-027

## 30. Shadow Routing — UP-030

**دسته:** Routing و Evidence  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Router جدید کنار فعلی تصمیم می‌دهد ولی side effect یا cost ایجاد نمی‌کند.

**ورودی‌ها:** request، candidate routers
**خروجی‌ها:** comparison report
**مرز ایمنی:** shadow به provider پولی یا external write دسترسی نداشته باشد
**معیار بسته‌شدن:** اختلاف route و کیفیت گزارش شود
**وابستگی‌ها:** UP-020, UP-029

## 31. Egress Proxy — UP-031

**دسته:** امنیت و Supply Chain  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** خروجی شبکه Agent و Tool از Proxy با allowlist، حجم، مقصد و دلیل عبور کند.

**ورودی‌ها:** destination، capability، tenant
**خروجی‌ها:** egress decision و log
**مرز ایمنی:** Default deny و عدم دور زدن با DNS یا IP جایگزین
**معیار بسته‌شدن:** تلاش به مقصد ممنوع block شود
**وابستگی‌ها:** UP-009

## 32. Ephemeral Secret Broker — UP-032

**دسته:** امنیت و Supply Chain  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Secret کوتاه‌عمر و scope-limited از Broker گرفته شود، نه raw env دائمی.

**ورودی‌ها:** identity، scope، ttl
**خروجی‌ها:** ephemeral token
**مرز ایمنی:** password خام ذخیره نشود و Token در log/redaction نیاید
**معیار بسته‌شدن:** expiry، revocation و scope test
**وابستگی‌ها:** UP-010

## 33. Signed Tool Manifest — UP-033

**دسته:** امنیت و Supply Chain  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Manifest ابزار شامل version، permissions، hash و maintainer امضا شود.

**ورودی‌ها:** plugin package، signing key
**خروجی‌ها:** verified manifest
**مرز ایمنی:** کلید امضا در repo نگهداری نشود
**معیار بسته‌شدن:** package tamper باید fail شود
**وابستگی‌ها:** UP-009

## 34. SBOM — UP-034

**دسته:** امنیت و Supply Chain  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** تمام Buildها فهرست dependency، version، license و hash تولید کنند.

**ورودی‌ها:** build artifact
**خروجی‌ها:** SBOM و provenance
**مرز ایمنی:** artifact بدون SBOM وارد production نشود
**معیار بسته‌شدن:** reproducible build با SBOM مقایسه شود
**وابستگی‌ها:** UP-033

## 35. Dependency Policy — UP-035

**دسته:** امنیت و Supply Chain  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Dependency آسیب‌پذیر، license ناسازگار یا maintainer ناشناس block شود.

**ورودی‌ها:** SBOM، advisory feed، license policy
**خروجی‌ها:** policy verdict
**مرز ایمنی:** exception تاریخ انقضا و approval داشته باشد
**معیار بسته‌شدن:** dependency پرریسک CI را متوقف کند
**وابستگی‌ها:** UP-034

## 36. Prompt Injection Firewall — UP-036

**دسته:** امنیت و Supply Chain  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** محتوای Repository، Issue، Web و Social به‌عنوان untrusted data با authority جدا پردازش شود.

**ورودی‌ها:** external content، agent policy
**خروجی‌ها:** tainted context و block decision
**مرز ایمنی:** محتوا نمی‌تواند system instruction یا permission را overwrite کند
**معیار بسته‌شدن:** fixture injection باید بی‌اثر بماند
**وابستگی‌ها:** UP-022, UP-031

## 37. Taint Tracking — UP-037

**دسته:** امنیت و Supply Chain  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** منشأ user، repo، web، secret و provider روی داده تا خروجی دنبال شود.

**ورودی‌ها:** content chunks، transformations
**خروجی‌ها:** taint labels و sink policy
**مرز ایمنی:** Secret به prompt خارجی و log عمومی نرسد
**معیار بسته‌شدن:** tainted sink بدون approval رد شود
**وابستگی‌ها:** UP-036, UP-032

## 38. MicroVM Sandbox — UP-038

**دسته:** امنیت و Supply Chain  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** کد untrusted در مرز Kernel قوی‌تر از container، با filesystem و network محدود اجرا شود.

**ورودی‌ها:** artifact، resource limits
**خروجی‌ها:** execution result و attestation
**مرز ایمنی:** no host mount، no credential inheritance، timeout سخت
**معیار بسته‌شدن:** escape، network و resource abuse تست شود
**وابستگی‌ها:** UP-031, UP-032

## 39. DLP Before Egress — UP-039

**دسته:** امنیت و Supply Chain  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** PII، private key، token و داده محرمانه قبل از Provider خارجی mask یا block شود.

**ورودی‌ها:** payload، privacy level
**خروجی‌ها:** redacted payload و findings
**مرز ایمنی:** false negative حساس‌تر از false positive گزارش شود
**معیار بسته‌شدن:** fixtureهای credential و PII رد شوند
**وابستگی‌ها:** UP-032, UP-037

## 40. Incident Response — UP-040

**دسته:** امنیت و Supply Chain  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** برای leak، injection، exfiltration، provider compromise و audit tamper playbook و تمرین دوره‌ای تعریف شود.

**ورودی‌ها:** incident signal، severity
**خروجی‌ها:** containment، notification و postmortem
**مرز ایمنی:** پاسخ اضطراری بدون حذف Audit انجام شود
**معیار بسته‌شدن:** tabletop exercise و زمان واکنش اندازه‌گیری شود
**وابستگی‌ها:** UP-031, UP-039

## 41. Run Checkpoints — UP-041

**دسته:** پایداری و عملیات  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** in_progress

**طراحی:** بعد از هر stage و side effect snapshot immutable ذخیره شود.

**ورودی‌ها:** run state، event، artifacts
**خروجی‌ها:** checkpoint chain
**مرز ایمنی:** checkpoint قابل update/delete نباشد
**معیار بسته‌شدن:** hash chain و append-only test
**وابستگی‌ها:** UP-007
**Evidence فعلی:** src/core/checkpoint-store.ts

## 42. Crash Resume — UP-042

**دسته:** پایداری و عملیات  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Worker پس از crash از آخرین checkpoint امن ادامه دهد.

**ورودی‌ها:** checkpoint، lease، retry policy
**خروجی‌ها:** resumed run و event continuity
**مرز ایمنی:** side effect idempotency قبل از resume بررسی شود
**معیار بسته‌شدن:** kill worker وسط stage و resume موفق
**وابستگی‌ها:** UP-041, UP-043

## 43. End-to-End Idempotency — UP-043

**دسته:** پایداری و عملیات  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** in_progress

**طراحی:** Run، Job، Tool و external write با key و result replay کنترل شوند.

**ورودی‌ها:** idempotency key، request hash
**خروجی‌ها:** new/replay/conflict decision
**مرز ایمنی:** conflict هرگز side effect دوم ایجاد نکند
**معیار بسته‌شدن:** duplicate delivery test
**وابستگی‌ها:** UP-006, UP-041
**Evidence فعلی:** src/core/idempotency.ts, apps/api/server.ts

## 44. Provider Circuit Breaker — UP-044

**دسته:** پایداری و عملیات  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Error، timeout و quota باعث open شدن circuit و failover policy شوند.

**ورودی‌ها:** health sample، threshold، cooldown
**خروجی‌ها:** circuit state
**مرز ایمنی:** failover از privacy و budget عبور نکند
**معیار بسته‌شدن:** provider outage simulation
**وابستگی‌ها:** UP-058

## 45. Distributed Tracing — UP-045

**دسته:** پایداری و عملیات  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Run تا DB query و Provider call با Trace/Span مشترک دنبال شود.

**ورودی‌ها:** correlation IDs، events
**خروجی‌ها:** trace timeline
**مرز ایمنی:** Secret در attribute trace نباشد
**معیار بسته‌شدن:** trace completeness test
**وابستگی‌ها:** UP-007

## 46. SLO و Error Budget — UP-046

**دسته:** پایداری و عملیات  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Availability، latency، queue wait و quality SLO و budget داشته باشند.

**ورودی‌ها:** metrics، service tier
**خروجی‌ها:** SLO report و deployment gate
**مرز ایمنی:** SLO بدون measurement claim پذیرفته نشود
**معیار بسته‌شدن:** burn-rate alert و gate test
**وابستگی‌ها:** UP-045

## 47. Error Taxonomy — UP-047

**دسته:** پایداری و عملیات  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** خطاها به user، provider، tool، policy، security و platform تفکیک شوند.

**ورودی‌ها:** raw error، context
**خروجی‌ها:** stable error code و safe message
**مرز ایمنی:** raw stack به user نرسد
**معیار بسته‌شدن:** mapping coverage test
**وابستگی‌ها:** UP-001, UP-045

## 48. Chaos Testing — UP-048

**دسته:** پایداری و عملیات  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** قطع Provider، Queue، DB، شبکه و Worker کنترل‌شده آزمایش شود.

**ورودی‌ها:** fault plan، blast radius
**خروجی‌ها:** resilience report
**مرز ایمنی:** Chaos فقط در محیط non-production یا با approval اجرا شود
**معیار بسته‌شدن:** fault injection recovery criteria
**وابستگی‌ها:** UP-041, UP-044

## 49. Backup Restore Drill — UP-049

**دسته:** پایداری و عملیات  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Backup واقعی restore شود و RTO/RPO اندازه‌گیری شود.

**ورودی‌ها:** backup، target environment
**خروجی‌ها:** restore evidence
**مرز ایمنی:** داده واقعی در target عمومی افشا نشود
**معیار بسته‌شدن:** دوره‌ای restore و checksum مقایسه شود
**وابستگی‌ها:** UP-003, UP-004

## 50. Multi-Region — UP-050

**دسته:** پایداری و عملیات  |  **اولویت:** P2  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Region ثانویه، failover، replication و data residency طراحی شود.

**ورودی‌ها:** region policy، replication lag
**خروجی‌ها:** DR plan و routing
**مرز ایمنی:** residency و tenant policy مقدم بر latency است
**معیار بسته‌شدن:** regional outage exercise
**وابستگی‌ها:** UP-049

## 51. Usage Ledger — UP-051

**دسته:** هزینه و Compute  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** in_progress

**طراحی:** Token، CPU، GPU، storage، network و provider cost به Tenant/Project/Run نسبت داده شود.

**ورودی‌ها:** provider usage، run context
**خروجی‌ها:** append-only usage entries
**مرز ایمنی:** currency و Tenant mix نشود؛ raw key ذخیره نشود
**معیار بسته‌شدن:** ledger reconciliation با فاکتور fixture
**وابستگی‌ها:** UP-001, UP-006
**Evidence فعلی:** src/core/usage-ledger.ts

## 52. Pre-Run Budget — UP-052

**دسته:** هزینه و Compute  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** قبل از Model/Tool call هزینه و Token projection با ceiling مقایسه شود.

**ورودی‌ها:** budget policy، projection، current ledger
**خروجی‌ها:** allow/deny decision
**مرز ایمنی:** budget deny باید قبل از side effect باشد
**معیار بسته‌شدن:** over-budget call هرگز اجرا نشود
**وابستگی‌ها:** UP-051

## 53. Token Preflight — UP-053

**دسته:** هزینه و Compute  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** اندازه Context، input/output و احتمال overflow قبل از provider محاسبه شود.

**ورودی‌ها:** messages، model context window
**خروجی‌ها:** preflight estimate
**مرز ایمنی:** estimate محافظه‌کارانه و عدم ارسال Secret
**معیار بسته‌شدن:** boundary tests برای context limit
**وابستگی‌ها:** UP-051, UP-083

## 54. Cost-Quality Optimizer — UP-054

**دسته:** هزینه و Compute  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** با توجه به کیفیت، هزینه، latency، privacy و Local availability مسیر انتخاب شود.

**ورودی‌ها:** Pareto scores، budget
**خروجی‌ها:** route recommendation
**مرز ایمنی:** ارزان‌تر نمی‌تواند hard privacy را بشکند
**معیار بسته‌شدن:** budget/quality tradeoff report
**وابستگی‌ها:** UP-028, UP-052

## 55. Provider Quota Scheduler — UP-055

**دسته:** هزینه و Compute  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** RPM، RPD، TPM، TPD و monthly quota در Scheduler اعمال شود.

**ورودی‌ها:** quota catalog، usage ledger
**خروجی‌ها:** admission decision و next retry
**مرز ایمنی:** درخواست بیشتر از quota ارسال نشود
**معیار بسته‌شدن:** quota exhaustion و rollover test
**وابستگی‌ها:** UP-051, UP-055

## 56. Local Model Catalog — UP-056

**دسته:** هزینه و Compute  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** مدل Local با VRAM، quantization، زبان، context و benchmark ثبت شود.

**ورودی‌ها:** local runtime discovery، model metadata
**خروجی‌ها:** capability catalog
**مرز ایمنی:** مدل ناشناخته بدون scan اجرا نشود
**معیار بسته‌شدن:** catalog-to-router integration test
**وابستگی‌ها:** UP-012, UP-024

## 57. Quantization Profiles — UP-057

**دسته:** هزینه و Compute  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** FP16/INT8/INT4 با کیفیت، memory و latency قابل مقایسه باشند.

**ورودی‌ها:** model artifact، runtime
**خروجی‌ها:** profile benchmark
**مرز ایمنی:** profile فاقد provenance قابل promotion نیست
**معیار بسته‌شدن:** same suite across profiles
**وابستگی‌ها:** UP-056

## 58. Provider Health Score — UP-058

**دسته:** هزینه و Compute  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Availability، latency، error، quality، cost و privacy به Score تبدیل شود.

**ورودی‌ها:** health events، trial results
**خروجی‌ها:** health score با decay
**مرز ایمنی:** score فقط advisory است و policy را دور نمی‌زند
**معیار بسته‌شدن:** outage و recovery test
**وابستگی‌ها:** UP-026, UP-044

## 59. Tenant-Safe Response Cache — UP-059

**دسته:** هزینه و Compute  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Cache با tenant key، settings hash، TTL و حذف‌پذیری به کار رود.

**ورودی‌ها:** request fingerprint، tenant، response
**خروجی‌ها:** cache hit/miss audit
**مرز ایمنی:** cross-tenant hit و Secret cache ممنوع
**معیار بسته‌شدن:** poisoning و isolation test
**وابستگی‌ها:** UP-004, UP-039

## 60. Energy Metering — UP-060

**دسته:** هزینه و Compute  |  **اولویت:** P2  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** مصرف انرژی و carbon تقریبی Local و Cloud با caveat گزارش شود.

**ورودی‌ها:** GPU time، provider factor
**خروجی‌ها:** energy estimate
**مرز ایمنی:** عدد تقریبی به‌عنوان اندازه‌گیری قطعی ارائه نشود
**معیار بسته‌شدن:** factor provenance و uncertainty test
**وابستگی‌ها:** UP-051

## 61. Visual DAG Editor — UP-061

**دسته:** UX و همکاری  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** کاربر DAG، dependency، Model، Approval و output را ببیند و با validation ویرایش کند.

**ورودی‌ها:** Task DAG، permissions
**خروجی‌ها:** versioned plan و validation errors
**مرز ایمنی:** ویرایش UI نمی‌تواند policy را bypass کند
**معیار بسته‌شدن:** cycle و unauthorized edit test
**وابستگی‌ها:** UP-023, UP-002

## 62. Time-Travel Timeline — UP-062

**دسته:** UX و همکاری  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** از event/checkpoint وضعیت Run در زمان گذشته بازسازی شود.

**ورودی‌ها:** event stream، checkpoints
**خروجی‌ها:** read-only historical projection
**مرز ایمنی:** گذشته قابل ویرایش یا اجرای side effect نیست
**معیار بسته‌شدن:** replay snapshot comparison
**وابستگی‌ها:** UP-041, UP-007

## 63. Live Diff — UP-063

**دسته:** UX و همکاری  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Diff لحظه‌ای با فایل، دلیل، Task، Test و author نمایش داده شود.

**ورودی‌ها:** patch events، test events
**خروجی‌ها:** reviewable diff
**مرز ایمنی:** Secret و فایل خارج از allowlist نمایش داده نشود
**معیار بسته‌شدن:** large diff و binary behavior
**وابستگی‌ها:** UP-063

## 64. Explainable Routing UI — UP-064

**دسته:** UX و همکاری  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Explanation امن، evidence، confidence، cost و rejected candidates نمایش داده شود.

**ورودی‌ها:** route result، evidence digest
**خروجی‌ها:** decision card
**مرز ایمنی:** chain-of-thought خام نمایش داده نشود
**معیار بسته‌شدن:** UI explanation matches core hash
**وابستگی‌ها:** UP-029, UP-064

## 65. Approval Inbox — UP-065

**دسته:** UX و همکاری  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Approval حساس با Diff، Risk، Cost، Expiry و دلیل در Inbox جمع شود.

**ورودی‌ها:** approval request، approver identity
**خروجی‌ها:** approval decision و audit
**مرز ایمنی:** self-approval، stale MFA و agent approval رد شود
**معیار بسته‌شدن:** expired and delegated approval test
**وابستگی‌ها:** UP-001, UP-065

## 66. GitHub Integration — UP-066

**دسته:** UX و همکاری  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Branch، commit، PR و review با App/OAuth محدود و audit شده انجام شود.

**ورودی‌ها:** repo permission، branch policy، patch
**خروجی‌ها:** PR artifact
**مرز ایمنی:** هیچ push مستقیم به main و deploy بدون approval
**معیار بسته‌شدن:** real test repo integration
**وابستگی‌ها:** UP-001, UP-031

## 67. Issue Tracker Integration — UP-067

**دسته:** UX و همکاری  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Issue با Task DAG لینک شود و status sync با mapping محدود انجام شود.

**ورودی‌ها:** issue ID، project mapping
**خروجی‌ها:** linked task/event
**مرز ایمنی:** متن Issue untrusted است و command محسوب نمی‌شود
**معیار بسته‌شدن:** duplicate webhook and replay test
**وابستگی‌ها:** UP-007, UP-036

## 68. Team Collaboration — UP-068

**دسته:** UX و همکاری  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Comment، handoff، delegation و review روی Run immutable ثبت شود.

**ورودی‌ها:** membership، run artifact
**خروجی‌ها:** comment thread و delegation audit
**مرز ایمنی:** delegation permission و separation of duties حفظ شود
**معیار بسته‌شدن:** two-user approval scenario
**وابستگی‌ها:** UP-010, UP-065

## 69. Rollback — UP-069

**دسته:** UX و همکاری  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** هر side effect قابل برگشت با commit/checkpoint و approval مشخص باشد.

**ورودی‌ها:** artifact، checkpoint، target
**خروجی‌ها:** rollback plan و result
**مرز ایمنی:** rollback production بدون approval ممنوع
**معیار بسته‌شدن:** rollback after partial failure
**وابستگی‌ها:** UP-041, UP-066

## 70. Progressive Onboarding — UP-070

**دسته:** UX و همکاری  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Demo/Local-first wizard از account تا اولین Run با Budget و Permission شفاف ارائه شود.

**ورودی‌ها:** user profile، compute mode
**خروجی‌ها:** onboarding state
**مرز ایمنی:** بدون raw password و بدون فعال‌سازی ناخواسته paid provider
**معیار بسته‌شدن:** new user funnel E2E
**وابستگی‌ها:** UP-002, UP-051

## 71. Run Worktrees — UP-071

**دسته:** Execution و Developer Workflow  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** هر Run Worktree مستقل و feature branch غیرمحافظت‌شده داشته باشد.

**ورودی‌ها:** repo، branch، run id
**خروجی‌ها:** workspace manifest
**مرز ایمنی:** protected branch writable نباشد
**معیار بسته‌شدن:** parallel run isolation test
**وابستگی‌ها:** UP-001, UP-066

## 72. Toolchain Registry — UP-072

**دسته:** Execution و Developer Workflow  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Runtime، OS، package manager و system library به‌صورت reproducible تعریف شود.

**ورودی‌ها:** repo manifest، image digest
**خروجی‌ها:** toolchain lock
**مرز ایمنی:** image unpinned اجرا نشود
**معیار بسته‌شدن:** same manifest reproducibility
**وابستگی‌ها:** UP-034, UP-071

## 73. Test Matrix — UP-073

**دسته:** Execution و Developer Workflow  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** تست روی Runtime، OS، DB، Framework و Provider انتخابی اجرا شود.

**ورودی‌ها:** matrix axes، budget
**خروجی‌ها:** matrix result
**مرز ایمنی:** هر axis policy و resource ceiling داشته باشد
**معیار بسته‌شدن:** partial matrix retry and summary
**وابستگی‌ها:** UP-012, UP-072

## 74. Fixture Projects — UP-074

**دسته:** Execution و Developer Workflow  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** پروژه‌های کوچک دارای مجوز برای Bug Fix، Refactor، API، Security و Frontend آماده شود.

**ورودی‌ها:** fixture repo، license، expected result
**خروجی‌ها:** fixture registry
**مرز ایمنی:** fixture شامل Secret یا code غیرمجاز نباشد
**معیار بسته‌شدن:** fixture validation و reset
**وابستگی‌ها:** UP-011, UP-072

## 75. Transactional Patch Apply — UP-075

**دسته:** Execution و Developer Workflow  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Patch در Sandbox validate شود و سپس atomic وارد Worktree شود.

**ورودی‌ها:** patch، allowlist، tests
**خروجی‌ها:** apply result و rollback point
**مرز ایمنی:** partial write و path traversal block شود
**معیار بسته‌شدن:** invalid patch leaves workspace unchanged
**وابستگی‌ها:** UP-038, UP-071

## 76. Static Analysis — UP-076

**دسته:** Execution و Developer Workflow  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Typecheck، lint، SAST و formatter به‌صورت مرحله‌ای و قابل مشاهده اجرا شوند.

**ورودی‌ها:** project toolchain، policy
**خروجی‌ها:** analysis findings
**مرز ایمنی:** finding severity و waiver audit شود
**معیار بسته‌شدن:** known vulnerable fixture is found
**وابستگی‌ها:** UP-072, UP-077

## 77. License Scanner — UP-077

**دسته:** Execution و Developer Workflow  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** License ناسازگار در Dependency و Artifact قبل از Merge شناخته شود.

**ورودی‌ها:** SBOM، legal policy
**خروجی‌ها:** license verdict
**مرز ایمنی:** exception owner و expiry داشته باشد
**معیار بسته‌شدن:** incompatible license gate
**وابستگی‌ها:** UP-034, UP-077

## 78. Git Secret Scan — UP-078

**دسته:** Execution و Developer Workflow  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Commit، patch، log و artifact قبل از ذخیره از Secret Scanner عبور کند.

**ورودی‌ها:** diff، artifact، patterns
**خروجی‌ها:** finding و block decision
**مرز ایمنی:** raw match در log چاپ نشود
**معیار بسته‌شدن:** fixture private key test
**وابستگی‌ها:** UP-039, UP-078

## 79. Artifact Attestation — UP-079

**دسته:** Execution و Developer Workflow  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Artifact به Source commit، Build ID، Dependency hash و Generator متصل و امضا شود.

**ورودی‌ها:** build inputs، artifact، signer
**خروجی‌ها:** attestation
**مرز ایمنی:** unsigned artifact قابل promotion نیست
**معیار بسته‌شدن:** tampered artifact verification
**وابستگی‌ها:** UP-034, UP-079

## 80. CLI و IDE Extension — UP-080

**دسته:** Execution و Developer Workflow  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Run، Approval، Diff، Log و Test از CLI و IDE بدون اتصال localhost در browser قابل استفاده شود.

**ورودی‌ها:** API، auth، workspace
**خروجی‌ها:** client packages
**مرز ایمنی:** client permission محدود و secret-safe باشد
**معیار بسته‌شدن:** CLI/API contract و IDE smoke
**وابستگی‌ها:** UP-001, UP-005

## 81. Code Knowledge Graph — UP-081

**دسته:** Knowledge و Data  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** File، Function، Class، API، Test، Owner و Dependency به graph تبدیل شود.

**ورودی‌ها:** AST، git history، manifests
**خروجی‌ها:** versioned code graph
**مرز ایمنی:** فقط داده مجاز Tenant index شود
**معیار بسته‌شدن:** incremental update and query test
**وابستگی‌ها:** UP-004, UP-081

## 82. ACL-Aware Connectors — UP-082

**دسته:** Knowledge و Data  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Connector اجازه منبع اصلی را عیناً در Index و Retrieval enforce کند.

**ورودی‌ها:** OAuth scope، source ACL، document
**خروجی‌ها:** permission-aware document
**مرز ایمنی:** داده private با public user retrieval نشود
**معیار بسته‌شدن:** revoked access removes result
**وابستگی‌ها:** UP-010, UP-082

## 83. Context Packing — UP-083

**دسته:** Knowledge و Data  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Context با dependency، recent diff، requirement و token budget انتخاب شود.

**ورودی‌ها:** repo graph، query، budget
**خروجی‌ها:** ranked context manifest
**مرز ایمنی:** content خارج از ACL و tainted sink وارد نشود
**معیار بسته‌شدن:** context boundary and relevance test
**وابستگی‌ها:** UP-081, UP-083

## 84. Tiered Memory — UP-084

**دسته:** Knowledge و Data  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** حافظه Run، Project، Organization و General با TTL، consent و permission جدا شود.

**ورودی‌ها:** memory event، scope، TTL
**خروجی‌ها:** memory record و retention decision
**مرز ایمنی:** memory scope به‌صورت پیش‌فرض کمینه باشد
**معیار بسته‌شدن:** cross-scope leak test
**وابستگی‌ها:** UP-082, UP-088

## 85. Stale Documentation — UP-085

**دسته:** Knowledge و Data  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Docs با Code، API و Schema مقایسه و stale علامت‌گذاری شود.

**ورودی‌ها:** git diff، docs links، API schema
**خروجی‌ها:** staleness report
**مرز ایمنی:** report پیشنهاد است و code authority را تغییر نمی‌دهد
**معیار بسته‌شدن:** known stale fixture
**وابستگی‌ها:** UP-005, UP-081

## 86. Data Lineage — UP-086

**دسته:** Knowledge و Data  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** منشأ هر خروجی از File، Prompt، Evidence، Model، Tool و External source ثبت شود.

**ورودی‌ها:** events، artifacts، claims
**خروجی‌ها:** lineage graph
**مرز ایمنی:** lineage خودش Secret ذخیره نکند
**معیار بسته‌شدن:** output traces to source hashes
**وابستگی‌ها:** UP-007, UP-037

## 87. PII Classification — UP-087

**دسته:** Knowledge و Data  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Email، phone، address، identity و medical data قبل از Index/Egress دسته‌بندی شود.

**ورودی‌ها:** content، locale، policy
**خروجی‌ها:** PII findings و action
**مرز ایمنی:** classifier uncertainty باعث safe fallback شود
**معیار بسته‌شدن:** multilingual PII fixtures
**وابستگی‌ها:** UP-039, UP-087

## 88. Data Deletion Propagation — UP-088

**دسته:** Knowledge و Data  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** حذف User/Project به DB، Vector Index، Cache، Log، Artifact و Backup policy propagate شود.

**ورودی‌ها:** deletion request، retention policy
**خروجی‌ها:** deletion receipt و tombstone
**مرز ایمنی:** backup retention و legal hold صریح باشد
**معیار بسته‌شدن:** deletion audit and reappearance test
**وابستگی‌ها:** UP-082, UP-088

## 89. Retrieval Evaluation — UP-089

**دسته:** Knowledge و Data  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Recall، Precision، Relevance و Grounding روی Query set اندازه‌گیری شود.

**ورودی‌ها:** gold queries، ACL، index
**خروجی‌ها:** retrieval eval report
**مرز ایمنی:** gold set مجوز داشته باشد
**معیار بسته‌شدن:** regression gate for retrieval
**وابستگی‌ها:** UP-082, UP-083

## 90. Local Repository Index — UP-090

**دسته:** Knowledge و Data  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Search و Embedding Local برای کد محرمانه ارائه شود.

**ورودی‌ها:** local model، repo، privacy mode
**خروجی‌ها:** local index و search result
**مرز ایمنی:** network egress در Local mode خاموش بماند
**معیار بسته‌شدن:** network deny integration test
**وابستگی‌ها:** UP-056, UP-082

## 91. Policy as Code — UP-091

**دسته:** Governance و کیفیت محصول  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Security، Budget، Approval، Residency و Provider rule نسخه‌گذاری و تست شود.

**ورودی‌ها:** policy files، settings، context
**خروجی‌ها:** policy decision و diff
**مرز ایمنی:** policy loosening نیازمند approval و Audit باشد
**معیار بسته‌شدن:** policy regression suite
**وابستگی‌ها:** UP-004, UP-091

## 92. Change Management — UP-092

**دسته:** Governance و کیفیت محصول  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** تغییر Prompt، Model، Tool، Router و Security با Change Request، Reviewer و Rollback انجام شود.

**ورودی‌ها:** change diff، risk، approver
**خروجی‌ها:** change record
**مرز ایمنی:** self-approval و deployment بدون approval ممنوع
**معیار بسته‌شدن:** change lifecycle E2E
**وابستگی‌ها:** UP-065, UP-092

## 93. Model Cards — UP-093

**دسته:** Governance و کیفیت محصول  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Model، limitations، language، risk، cost، context و evidence در Registry ثبت شود.

**ورودی‌ها:** provider metadata، benchmark
**خروجی‌ها:** model card version
**مرز ایمنی:** vendor claim از measured جدا بماند
**معیار بسته‌شدن:** missing field blocks promotion
**وابستگی‌ها:** UP-012, UP-026

## 94. Fairness و Language Eval — UP-094

**دسته:** Governance و کیفیت محصول  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** کیفیت برای زبان، لهجه، سبک کد و گروه‌های کاربر مقایسه شود.

**ورودی‌ها:** localized benchmark، rubric
**خروجی‌ها:** fairness report
**مرز ایمنی:** نتیجه aggregate نباید گروه کوچک را پنهان کند
**معیار بسته‌شدن:** language regression fixture
**وابستگی‌ها:** UP-014, UP-019

## 95. WCAG — UP-095

**دسته:** Governance و کیفیت محصول  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Keyboard، screen reader، contrast، focus و alternative text در UI رعایت شود.

**ورودی‌ها:** web pages، accessibility tree
**خروجی‌ها:** a11y report
**مرز ایمنی:** critical accessibility finding merge را block کند
**معیار بسته‌شدن:** automated plus manual audit
**وابستگی‌ها:** UP-002

## 96. Persian RTL QA — UP-096

**دسته:** Governance و کیفیت محصول  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** عدد، تاریخ، code، path، log، table و mixed-direction text در fa-IR تست شود.

**ورودی‌ها:** locale، UI strings، fixtures
**خروجی‌ها:** RTL QA report
**مرز ایمنی:** identifier و code نباید bidi spoof شوند
**معیار بسته‌شدن:** visual snapshots and text tests
**وابستگی‌ها:** UP-002

## 97. Plugin Marketplace — UP-097

**دسته:** Governance و کیفیت محصول  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Plugin قبل از انتشار review، sandbox test، permission، SBOM و signature داشته باشد.

**ورودی‌ها:** plugin package، manifest، scan
**خروجی‌ها:** publication decision
**مرز ایمنی:** marketplace install بدون verification ممنوع
**معیار بسته‌شدن:** malicious plugin rejection
**وابستگی‌ها:** UP-009, UP-033, UP-038

## 98. Transparency Dashboard — UP-098

**دسته:** Governance و کیفیت محصول  |  **اولویت:** P2  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** Run، cost، error، quality، provider share و security block به کاربر گزارش شود.

**ورودی‌ها:** ledger، metrics، audit projections
**خروجی‌ها:** dashboard metrics
**مرز ایمنی:** اطلاعات Tenant دیگر و Secret هرگز نمایش داده نشود
**معیار بسته‌شدن:** dashboard numbers reconcile with ledger
**وابستگی‌ها:** UP-051, UP-098

## 99. Architecture Decision Records — UP-099

**دسته:** Governance و کیفیت محصول  |  **اولویت:** P1  |  **وضعیت برنامه‌نویسی:** not_started

**طراحی:** تصمیم‌های مهم، trade-off، alternatives و rollback در ADR ثبت شود.

**ورودی‌ها:** decision request، reviewers
**خروجی‌ها:** ADR و link به evidence
**مرز ایمنی:** ADR ادعای بدون evidence نداشته باشد
**معیار بسته‌شدن:** ADR link checker
**وابستگی‌ها:** UP-099

## 100. Gap Register Automation — UP-100

**دسته:** Governance و کیفیت محصول  |  **اولویت:** P0  |  **وضعیت برنامه‌نویسی:** in_progress

**طراحی:** هر proposal owner، status، evidence، dependency و DoD داشته باشد و CI آن را verify کند.

**ورودی‌ها:** upgrade register، files، tests
**خروجی‌ها:** coverage report و stale detection
**مرز ایمنی:** done فقط با evidence واقعی و test accepted شود
**معیار بسته‌شدن:** register count/status/path test
**وابستگی‌ها:** UP-100
**Evidence فعلی:** src/core/upgrade-register.ts, docs/upgrade-register.json

## ترتیب اجرای پیشنهادی

موج اول باید UP-001 تا UP-020، سپس UP-031 تا UP-044 و بعد UP-051 تا UP-059 را پوشش دهد. دلیل این ترتیب آن است که API، Tenant boundary، Benchmark واقعی، Sandbox، Checkpoint و Budget قبل از هوشمندی گسترده لازم‌اند. UP-100 در پایان هر موج رجیستر را با تست‌های واقعی تطبیق می‌دهد.

## معیار ادامه کار

برای هر Proposal، تغییرات باید به کد، تست، مستندات، Evidence و Gap Register متصل شوند. اضافه‌کردن Interface بدون Adapter واقعی، یا شبیه‌سازی نتیجه Provider، به‌عنوان تکمیل قابلیت پذیرفته نمی‌شود.
