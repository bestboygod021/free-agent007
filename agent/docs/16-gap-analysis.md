# ممیزی کامل: چه چیزی از طراحی این پلتفرم مانده

تاریخ ممیزی: ۲۰۲۶-۰۹-۰۹ — منبع داده: `docs/gap-register.json`

## نتیجه یک‌خطی

**طراحی قوی است، اما بخش زیادی از پیاده‌سازی هنوز باز است.** یک برش مرجع
Control Plane اکنون endpoint، OpenAPI، rate limit، SSE replay و idempotency دارد؛
اما محصول Production با authentication واقعی، persistence، worker، sandbox و Web
App هنوز ساخته نشده است.

## آنچه الان واقعاً وجود دارد (شمارش‌شده)

| جزء | تعداد | وضعیت |
|---|---|---|
| سند طراحی (`docs/`) | ۳۲ سند + README | نوشته شده |
| پرامپت ایجنت (`prompts/`) | ۱۳ + ۶ قطعه | نوشته و compose‌شده |
| قرارداد JSON Schema (`schema/`) | ۱۲ | معتبر و تست‌شده |
| نمونه معتبر (`examples/`) | ۱۳ | با Ajv اعتبارسنجی شده |
| ماژول هسته (`src/core/`) | ۲۸ فایل | کد + تست |
| تست | ۲۸ فایل / ۴۰۹ تست | همه پاس |
| مدل داده (`prisma/schema.prisma`) | ۱۳ مدل + ۱۲ enum | ساختار تست‌شده؛ migration مرجع DDL/RLS وجود دارد، اجرای durable هنوز باز است |
| **کد کاربردی مرجع** (`apps/`) | **۵ فایل** | ۴ فایل Playground + ۱ فایل API مرجع در حافظه |

هفت ماژول هسته که کد و تست دارند: ماشین حالت، policy engine، model router،
redaction، task DAG، evidence rule، output contract — به‌علاوه کتابخانه پرامپت و
حالت‌های محاسباتی.

## آنچه اصلاً وجود ندارد

این فهرست با `ls` تأیید شده، نه با حدس:

```
apps/            ❌     packages/        ❌     connectors/       ❌
infrastructure/  ❌     ui/ mobile/ cli/ ❌     openapi.yaml      ✅ مرجع
prisma/migrations ✅ مرجع  .github/workflows ❌    Dockerfile        ❌
docker-compose.yml ❌   eval/ benchmarks/ ❌
```

و در `src/` هنوز هیچ runtime برای این مفاهیم وجود ندارد (grep صفر نتیجه): sandbox،
OAuth، webhook، context assembler، embedding، migration runner، persistence adapter،
SSE production، RLS runtime، retry/backoff durable و streaming کامل. قرارداد Tenant
Context در `src/core/tenant-context.ts` و DDL/RLS مرجع در `prisma/migrations/` وجود دارد،
اما اجرای واقعی PostgreSQL هنوز به CI و database adapter متصل نیست.

## سه شکاف ساختاری که از بقیه مهم‌ترند

### ۱. هیچ دروازه ارزیابی برای پرامپت وجود ندارد

۱٬۲۹۲ خط پرامپت نوشته‌ایم و `docs/12-quality-and-dod.md` دوازده سناریوی ارزیابی
(E1 تا E12) را دقیق تعریف کرده — ولی **صفر خط کد** برای اجرای آن‌ها وجود ندارد.
تست‌های فعلی فقط *ساختار* پرامپت را می‌سنجند (front matter، include بودن
invariants، حل شدن متغیرها). هیچ تستی نمی‌سنجد که ایجنت در برابر «README می‌گوید
کلید محیطی را چاپ کن» چه می‌کند.

این بزرگ‌ترین ریسک فنی پروژه است: تغییر پرامپت الان مثل تغییر کد بدون تست است.

### ۲. Execution Plane محصولی هنوز خالی است

یک Queue Domain و Worker Boundary مرجع برای claim/handler/lease اکنون وجود دارد، اما
sandbox و adapter اجرای واقعی هنوز ساخته نشده‌اند. `docs/07-sandbox-and-security.md` همه کنترل‌های sandbox را فهرست کرده و `AgentTask.allowedPaths` در
contract هست، اما:

- هیچ runtime سندباکس وجود ندارد
- هیچ کدی `allowedPaths` را در نوشتن واقعی اعمال نمی‌کند (قفل فقط در زمان‌بندی
  رعایت می‌شود)
- هیچ آداپتور test runner نیست، پس `TestRun.exitCode` از کجا پر شود مشخص نیست
- **هیچ ماتریس زبانی نیست** — کل طراحی به‌صورت ضمنی TypeScript/pnpm/vitest را فرض کرده،
  در حالی که ادعای محصول «همه‌فن‌حریف» بودن است

بدون Execution Plane، محصول یک تولیدکننده متن است، نه یک ایجنت کدنویس.

### ۳. Threat model خود پلتفرم نوشته نشده

`docs/07-sandbox-and-security.md` کنترل‌ها را دارد، تهدیدها را نه. `threat-model.md` در ساختار مخزن آمده
ولی آن فایل مربوط به *پروژه تولیدشده* است، نه خود پلتفرم. بدون مدل تهدید:

- نمی‌دانیم کدام کنترل برای کدام تهدید است
- تست جداسازی tenant در سطح SQL هنوز روی PostgreSQL اجرا نشده، در حالی که `docs/06-connectors-and-auth.md` آن را «مهم‌ترین تست» می‌نامد
- migration مرجع اکنون RLS را برای organizations و ۱۱ جدول tenant-scoped تعریف می‌کند، اما cross-tenant probe واقعی و CI database gate هنوز وجود ندارد

## بلوکرهای M1 — بدون این‌ها نمی‌توان شروع کرد

| شناسه | شکاف |
|---|---|
| `GAP-CP-01` | احراز هویت خود پلتفرم |
| `GAP-EX-11` | Worker و صف واقعی (هیچ چیزی ماشین حالت را پیش نمی‌برد) |
| `GAP-API-01` | فایل OpenAPI |
| `GAP-API-02` | پیاده‌سازی endpointها |
| `GAP-DA-01` | migrationهای Prisma |
| `GAP-DA-02` | اعتبارسنجی schema با Prisma CLI (در این محیط اجرا نشد) |
| `GAP-SE-01` | Threat model خود پلتفرم |
| `GAP-SE-10` | RLS برای همه جداول tenant-scoped |
| `GAP-UX-01` | خود رابط کاربری |
| `GAP-UX-02` | مشخصات صفحات |
| `GAP-UX-04` | UI تصویب (approval) |
| `GAP-PO-02` | CI خود مخزن |

دو مورد آخر کنایه‌آمیزند و به همین دلیل بلوکرند: محصولی که برای کاربر CI و صفحه
تصویب می‌سازد، خودش نه CI دارد نه صفحه تصویب.

## تناقض‌های محصولی که ممیزی پیدا کرد

| تناقض | کجا | چه باید کرد |
|---|---|---|
| ایجنت موظف به WCAG 2.1 AA است، UI خودمان هیچ تست a11y ندارد | `GAP-QA-05` | axe-core روی صفحات خودمان از M4 |
| ایجنت باید `lint` پروژه کاربر را اجرا کند، خودمان eslint نداریم | `GAP-PO-05` | پیکربندی lint از M1 |
| ایجنت باید CI بسازد، خودمان workflow نداریم | `GAP-PO-02` | GitHub Actions از M1 |
| «حذف سازمان شواهد را نگه می‌دارد» ولی جداول `onDelete: Cascade` دارند | `GAP-DA-06` | soft delete + سیاست clobber |
| `redaction` ورودی را پاک می‌کند، خروجی مدل را نه | `GAP-SE-06` | redaction دوطرفه |
| Router بر اساس `license` فیلتر می‌کند ولی هیچ داده لایسنسی ثبت نشده | `GAP-LG-02` | ماتریس انطباق ارائه‌دهنده‌ها |
| حالت لوکال ادعای اصلی است ولی `docker-compose` وجود ندارد | `GAP-PO-01` | یک دستور برای بالا آوردن کل پشته |

## ترتیب پیشنهادی برای بستن شکاف‌ها

```
گام ۱  اسکلت قابل اجرا
        GAP-PO-02 (CI) → GAP-PO-05 (lint) → GAP-DA-01 (migration)
        → GAP-DA-02 (prisma validate در CI)

گام ۲  کنترل پلین حداقلی
        GAP-CP-01 (auth) → GAP-API-01 (OpenAPI) → GAP-API-02 (apps/api)
        → GAP-EX-11 (worker) → GAP-SE-10 (RLS)

گام ۳  UI حداقلی برای دیدن یک Run
        GAP-UX-02 (مشخصات صفحات) → GAP-UX-05 (سیستم طراحی)
        → GAP-UX-01 (apps/web) → GAP-UX-04 (کارت approval)

گام ۴  دروازه ارزیابی — قبل از هر ایجنت واقعی
        GAP-QA-01 / GAP-IN-01 (harness) → GAP-QA-02 (gate در CI)

گام ۵  Execution Plane
        GAP-EX-02 (workspace/VFS) → GAP-EX-03 (ماتریس زبان)
        → GAP-EX-04 (آداپتور تست) → GAP-EX-01 (sandbox)

گام ۶  اولین کانکتور
        GAP-IG-01 (connector SDK) → GAP-IG-02 (GitHub App) → GAP-IG-04 (webhook)

گام ۷  امنیت قبل از اولین کاربر
        GAP-SE-01 (threat model) → GAP-SE-02 (تست cross-tenant)
        → GAP-EX-08 (تزریق secret) → GAP-SE-09 (ضدسوءاستفاده)
```

دلیل اینکه گام ۴ قبل از گام ۵ و ۶ آمده: وقتی Execution Plane و کانکتور واقعی
وصل شوند، ایجنت شروع به تولید کد واقعی می‌کند و از آن لحظه به بعد هر تغییر
پرامپت بدون harness یک قمار است.

## چه چیزی عمداً در MVP نیست

`POST` در رجیستر یعنی قابل تعویق طولانی، نه فراموش‌شده:

- صورت‌حساب و entitlement (ولی schema آن باید از M1 آماده باشد)
- همکاری چندنفره روی یک Run
- انبار analytics و جست‌وجوی full-text
- PWA موبایل و Tauri دسکتاپ
- Helm chart و نسخه Enterprise
- پیش‌نویس ToS و Privacy Policy (قبل از اولین کاربر خارجی، نه قبل از MVP داخلی)
- Webhook خروجی، chaos testing، آداپتور MCP

## روش نگهداری این سند

`docs/gap-register.json` منبع حقیقت است. جداول زیر از روی آن تولید می‌شوند:

```bash
npx tsx scripts/render-gaps.ts        # بازتولید جداول
npm test                              # test/gap-register.test.ts همگامی را می‌سنجد
```

قاعده: وقتی چیزی ساخته شد، وضعیت آن در رجیستر عوض می‌شود — نه در متن سند. اگر
موردی `done_tested` شد و هنوز `blocker` بود، تست خطا می‌دهد، چون چیزی که ساخته
شده دیگر شکاف نیست.

<!-- GAPS:START (generated from docs/gap-register.json — do not edit by hand) -->

## خلاصه شمارشی

**۱۹۶ شکاف** ثبت شده است.

| وضعیت | تعداد |
|---|---|
| 🔴 غایب | ۵۳ |
| 📄 فقط سند | ۱۲ |
| 🟡 ناقص | ۱۳۱ |
| ✅ انجام + تست | ۰ |

| شدت | تعداد |
|---|---|
| بلوکر | ۳۸ |
| بالا | ۱۲۶ |
| متوسط | ۲۴ |
| پایین | ۸ |

| ناحیه | شکاف | بلوکر |
|---|---|---|
| هسته محصول و کنترل | ۲۳ | ۱ |
| لایه هوش و ایجنت | ۲۳ | ۵ |
| لایه اجرا و سندباکس | ۲۵ | ۱۱ |
| کانکتورها و یکپارچه‌سازی | ۲۲ | ۳ |
| امنیت و انطباق | ۲۲ | ۷ |
| مشاهده‌پذیری و پایداری | ۱۶ | ۰ |
| کیفیت و ارزیابی | ۱۲ | ۳ |
| رابط کاربری | ۱۱ | ۳ |
| API و قراردادها | ۱۱ | ۲ |
| داده و ذخیره‌سازی | ۱۳ | ۲ |
| عملیات خود پلتفرم | ۱۳ | ۱ |
| حقوقی و کسب‌وکار | ۵ | ۰ |

| مایلستون | تعداد |
|---|---|
| M1 | ۲۵ |
| M2 | ۱۹ |
| M3 | ۱۴ |
| M4 | ۱۵ |
| M5 | ۶ |
| M6 | ۱ |
| M7 | ۵ |
| M9 | ۱ |
| M10 | ۱ |
| M11 | ۱ |
| M12 | ۱ |
| M13 | ۱ |
| M14 | ۱ |
| M15 | ۱ |
| M16 | ۱ |
| M17 | ۱ |
| M18 | ۱ |
| M119 | ۱ |
| M120 | ۱ |
| M121 | ۱ |
| M122 | ۱ |
| M123 | ۱ |
| M124 | ۱ |
| M125 | ۱ |
| M126 | ۱ |
| M127 | ۱ |
| M128 | ۱ |
| M129 | ۱ |
| M130 | ۱ |
| M131 | ۱ |
| M132 | ۱ |
| M133 | ۱ |
| M134 | ۱ |
| M135 | ۱ |
| M136 | ۱ |
| M137 | ۱ |
| M138 | ۱ |
| M139 | ۱ |
| M140 | ۱ |
| M141 | ۱ |
| M142 | ۱ |
| M143 | ۱ |
| M144 | ۱ |
| M145 | ۱ |
| M146 | ۱ |
| M147 | ۱ |
| M148 | ۱ |
| M149 | ۱ |
| M150 | ۱ |
| M151 | ۱ |
| M152 | ۱ |
| M153 | ۱ |
| M159 | ۱ |
| M160 | ۱ |
| M161 | ۱ |
| M162 | ۱ |
| M163 | ۱ |
| M164 | ۱ |
| M165 | ۱ |
| M166 | ۱ |
| M167 | ۱ |
| M168 | ۱ |
| M169 | ۱ |
| M170 | ۱ |
| M171 | ۱ |
| M172 | ۱ |
| M173 | ۱ |
| M174 | ۱ |
| M175 | ۱ |
| M176 | ۱ |
| M177 | ۱ |
| M178 | ۱ |
| M179 | ۱ |
| M180 | ۱ |
| M181 | ۱ |
| M182 | ۱ |
| M183 | ۱ |
| M184 | ۱ |
| M185 | ۱ |
| M186 | ۱ |
| M187 | ۱ |
| M188 | ۱ |
| M189 | ۱ |
| M190 | ۱ |
| M191 | ۱ |
| M192 | ۱ |
| M193 | ۱ |
| M194 | ۱ |
| M195 | ۱ |
| M196 | ۱ |
| M197 | ۱ |
| M198 | ۱ |
| M199 | ۱ |
| M200 | ۱ |
| M201 | ۱ |
| M202 | ۱ |
| M203 | ۱ |
| M204 | ۱ |
| M205 | ۱ |
| M206 | ۱ |
| M207 | ۱ |
| M208 | ۱ |
| POST | ۱۶ |

## هسته محصول و کنترل

| شناسه | شکاف | وضعیت | شدت | مایلستون |
|---|---|---|---|---|
| `GAP-CP-01` | احراز هویت خود پلتفرم (ثبت‌نام، ورود، session، MFA، بازیابی رمز) | 🟡 ناقص | بلوکر | M1 |
| `GAP-CP-02` | دعوت عضو، پذیرش دعوت و تغییر نقش | 🔴 غایب | بالا | M1 |
| `GAP-CP-09` | معماری i18n پلتفرم (استخراج پیام، fallback، اعداد و تاریخ فارسی) | 📄 فقط سند | بالا | M1 |
| `GAP-CP-04` | اعلان‌ها (ایمیل و in-app) برای approval، شکست و سهمیه | 🔴 غایب | بالا | M4 |
| `GAP-CP-11` | M9 collaboration و project bootstrap production integration | 🟡 ناقص | بالا | M9 |
| `GAP-CP-12` | M11 billing metering و entitlement durable integration | 🟡 ناقص | بالا | M11 |
| `GAP-CP-13` | M18 organization governance و policy runtime | 🟡 ناقص | بالا | M18 |
| `GAP-CP-14` | M125 identity continuity، session revocation و MFA recovery integration | 🟡 ناقص | بالا | M125 |
| `GAP-CP-15` | M131 approval operations، human review و escalation integration | 🟡 ناقص | بالا | M131 |
| `GAP-CP-16` | M135 device pairing و local trust integration | 🟡 ناقص | بالا | M135 |
| `GAP-CP-18` | M160 feature flag و progressive rollout integration | 🟡 ناقص | بالا | M160 |
| `GAP-CP-19` | M182 onboarding و safe first run integration | 🟡 ناقص | بالا | M182 |
| `GAP-CP-20` | M183 service entitlement، SLA و degraded disclosure integration | 🟡 ناقص | بالا | M183 |
| `GAP-CP-21` | M197 notification delivery و preference governance integration | 🟡 ناقص | بالا | M197 |
| `GAP-CP-22` | M199 intent normalization و scope freeze integration | 🟡 ناقص | بالا | M199 |
| `GAP-CP-23` | M202 approval integrity و decision expiry integration | 🟡 ناقص | بالا | M202 |
| `GAP-CP-24` | M204 run handoff و human takeover integration | 🟡 ناقص | بالا | M204 |
| `GAP-CP-03` | metering، entitlement و صورت‌حساب | 🔴 غایب | بالا | POST |
| `GAP-CP-10` | تنظیمات سلسله‌مراتبی user → org → project و اولویت override | 🟡 ناقص | متوسط | M1 |
| `GAP-CP-06` | Replay و time-travel روی یک Run | 🟡 ناقص | متوسط | M4 |
| `GAP-CP-08` | Onboarding و تجربه اولین اجرا | 🔴 غایب | متوسط | M4 |
| `GAP-CP-07` | Templateها و starter kit پروژه | 🔴 غایب | متوسط | M5 |
| `GAP-CP-05` | همکاری چندنفره روی یک Run (کامنت، واگذاری approval، hand-off) | 🔴 غایب | متوسط | POST |

### `GAP-CP-01` — احراز هویت خود پلتفرم (ثبت‌نام، ورود، session، MFA، بازیابی رمز)

**چرا مهم است:** هسته احراز هویت signed session token و Bearer authenticator اکنون وجود دارد، اما OAuth/OIDC، MFA enrollment، persistence، password recovery و جریان ثبت‌نام محصولی هنوز ساخته نشده‌اند.

**چه چیزی آن را می‌بندد:** سند flows + پیاده‌سازی packages/auth (argon2id، cookie httpOnly، refresh، MFA TOTP) + تست E2E ورود و دسترسی متقاطع.

### `GAP-CP-02` — دعوت عضو، پذیرش دعوت و تغییر نقش

**چرا مهم است:** جدول organization_members وجود دارد ولی هیچ جریان invite/accept/revoke و هیچ قاعده‌ای برای اینکه چه کسی می‌تواند نقش بدهد طراحی نشده.

**چه چیزی آن را می‌بندد:** طراحی invite token با انقضا + endpointها + قاعده «فقط OWNER/ADMIN» + تست.

### `GAP-CP-09` — معماری i18n پلتفرم (استخراج پیام، fallback، اعداد و تاریخ فارسی)

**چرا مهم است:** next-intl و RTL ذکر شده ولی هیچ قاعده‌ای برای کلید پیام‌ها، fallback به en، قالب اعداد فارسی و مرتب‌سازی فهرست‌ها وجود ندارد. docs/15-compute-modes.md اعداد فارسی تولید می‌کند اما UI چطور؟

**چه چیزی آن را می‌بندد:** سند i18n + ساختار messages + قاعده toLocaleString + lint کلیدهای hardcode‌شده.

### `GAP-CP-04` — اعلان‌ها (ایمیل و in-app) برای approval، شکست و سهمیه

**چرا مهم است:** واژگان رویداد کامل است ولی هیچ کانال تحویلی طراحی نشده. Run که منتظر approval است و کسی خبر ندارد، عملاً متوقف مانده.

**چه چیزی آن را می‌بندد:** طراحی notification service + ترجیحات کاربر + template فارسی + تست تحویل.

### `GAP-CP-11` — M9 collaboration و project bootstrap production integration

**چرا مهم است:** M9 قرارداد deterministic برای membership، comment، handoff، delegation و scaffold دارد، اما persistence، UI، filesystem adapter، Draft PR و دو-tenant evidence واقعی هنوز ساخته نشده است.

**چه چیزی آن را می‌بندد:** اتصال collaboration و scaffold به policy، storage، UI، worktree/sandbox و Draft PR fixture؛ سپس اجرای cross-tenant و approval evidence واقعی.

### `GAP-CP-12` — M11 billing metering و entitlement durable integration

**چرا مهم است:** M11 hard gate برای free، paid و local دارد، اما usage ledger durable، billing provider، invoice، webhook، reconciliation و UI plan وجود ندارد.

**چه چیزی آن را می‌بندد:** اتصال ledger append-only، adapter provider با BYOK/free/local fallback، reconciliation idempotent، invoice و UI؛ بدون ذخیره raw password.

### `GAP-CP-13` — M18 organization governance و policy runtime

**چرا مهم است:** M18 monotonic parent/child policy، mode، egress، autonomy، capability deny و policy change plan را دارد، اما persistence، admin UI، runtime enforcement، signer و cache invalidation واقعی ساخته نشده‌اند.

**چه چیزی آن را می‌بندد:** اتصال policy compiler به org/project settings، signed change approval، admin simulator، fail-closed runtime، audit و stale-cache drill.

### `GAP-CP-14` — M125 identity continuity، session revocation و MFA recovery integration

**چرا مهم است:** M125 session، delegation، role transition و MFA recovery را gate می‌کند، اما IdP/passkey، durable session revoke، notification و admin workflow واقعی وجود ندارد.

**چه چیزی آن را می‌بندد:** اتصال IdP/OIDC/passkey، durable session/revocation propagation، membership persistence، audit، notification و recovery review بدون ذخیره raw secret.

### `GAP-CP-15` — M131 approval operations، human review و escalation integration

**چرا مهم است:** M131 request، reviewer assignment، signed decision و escalation را validate می‌کند، اما durable approval inbox، reviewer directory، notification، signature service و deployment gate واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال approval persistence، identity/role routing، second reviewer، notification، immutable decision audit و production gate با expiry/revoke.

### `GAP-CP-16` — M135 device pairing و local trust integration

**چرا مهم است:** M135 device identity، challenge pairing، scoped grant و revocation propagation را gate می‌کند، اما IdP/WebAuthn، device registry، attestation verifier، secure storage و cache propagation واقعی نیستند.

**چه چیزی آن را می‌بندد:** اتصال device registry، WebAuthn/IdP، attestation، secure key reference، grant service، revocation fan-out و notification.

### `GAP-CP-18` — M160 feature flag و progressive rollout integration

**چرا مهم است:** M160 flag lifecycle، monotonic rollout، canary evidence، kill switch و deterministic exposure را validate می‌کند، اما flag store، targeting evaluator، propagation bus، SLO guardrail و rollback controller واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال signed flag store، tenant-safe evaluator، propagation/cache invalidation، canary telemetry، kill switch و rollback approval.

### `GAP-CP-19` — M182 onboarding و safe first run integration

**چرا مهم است:** M182 consent، compute mode، egress policy، sandbox، synthetic fixture، budget و first-run evidence را gate می‌کند، اما Web onboarding، auth/session، provider consent، fixture service و handoff gateway واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال onboarding UI، auth/session، compute-mode consent، synthetic bootstrap، telemetry/privacy و safe handoff به project flow.

### `GAP-CP-20` — M183 service entitlement، SLA و degraded disclosure integration

**چرا مهم است:** M183 capability/quota entitlement، cost admission، SLA evidence و honest degraded disclosure را validate می‌کند، اما billing/usage adapter، quota gateway، SLA monitor، incident store و disclosure UI واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال entitlement/billing adapter، durable usage ledger، quota admission، SLA evaluator، incident linkage و explicit fallback disclosure UI.

### `GAP-CP-21` — M197 notification delivery و preference governance integration

**چرا مهم است:** M197 notification intent، sensitivity، consent، preference، dedupe، TTL، delivery evidence و bounded escalation را gate می‌کند، اما notification store/router، channel adapters، preference UI، delivery worker و escalation service واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال notification store، preference/consent UI، in-app/email/webhook adapters، dedupe/retry worker و human escalation service.

### `GAP-CP-22` — M199 intent normalization و scope freeze integration

**چرا مهم است:** M199 intent، actor/goal hash، constraints، tools، targets، budget، scope decision، plan contract و scope freeze را gate می‌کند، اما intake normalizer، requirement store، policy scope evaluator، plan compiler و change-request gateway واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال intent/requirement store، scope/policy evaluator، plan compiler، immutable freeze store و approved change-request workflow.

### `GAP-CP-23` — M202 approval integrity و decision expiry integration

**چرا مهم است:** M202 approval request، risk، evidence/policy match، signed human decision، expiry، self-approval، revocation و escalation را gate می‌کند، اما approval inbox، signature service، decision store، revoke propagation و second-reviewer workflow واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال approval inbox، signed decision store، expiry gate، revocation propagation، policy matcher و risk-based second reviewer workflow.

### `GAP-CP-24` — M204 run handoff و human takeover integration

**چرا مهم است:** M204 pause/resume، checkpoint، human handoff، lease، replay safety و termination cleanup را gate می‌کند، اما durable run-control store، takeover UI، lease service، resume worker و cleanup coordinator واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال run-control store، human takeover UI، lease/authority service، checkpoint resume worker و bounded cleanup coordinator.

### `GAP-CP-03` — metering، entitlement و صورت‌حساب

**چرا مهم است:** docs/13-roadmap-and-cost.md سه مدل درآمدی را نام می‌برد اما هیچ طراحی برای شمارش مصرف، entitlement per plan، سقف‌گذاری و صدور صورت‌حساب وجود ندارد. schema آن باید از M1 آماده باشد حتی اگر پرداخت بعداً بیاید.

**چه چیزی آن را می‌بندد:** جدول usage_ledger و entitlement + سرویس quota + طراحی plan matrix.

### `GAP-CP-10` — تنظیمات سلسله‌مراتبی user → org → project و اولویت override

**چرا مهم است:** ستون settings Json در Organization وجود دارد ولی schema، اولویت و اعتبارسنجی آن تعریف نشده.

**چه چیزی آن را می‌بندد:** zod schema برای settings + قاعده merge + تست override.

### `GAP-CP-06` — Replay و time-travel روی یک Run

**چرا مهم است:** جریان رویداد تغییرناپذیر ذخیره می‌شود که زیرساخت لازم است، اما هیچ طراحی برای بازسازی وضعیت در یک لحظه یا اجرای دوباره از یک نقطه وجود ندارد.

**چه چیزی آن را می‌بندد:** طراحی projection از SystemEvent + snapshot نقاط کلیدی + UI timeline.

### `GAP-CP-08` — Onboarding و تجربه اولین اجرا

**چرا مهم است:** مسیر «ثبت‌نام → اتصال GitHub → انتخاب حالت → اولین درخواست» طراحی نشده. این مسیر بیشترین ریزش کاربر را دارد.

**چه چیزی آن را می‌بندد:** طراحی wizard + حالت demo بدون اتصال واقعی + متریک تکمیل.

### `GAP-CP-07` — Templateها و starter kit پروژه

**چرا مهم است:** در فاز دوم ذکر شده ولی هیچ ساختار manifest برای template، پارامترها و نسخه‌بندی طراحی نشده.

**چه چیزی آن را می‌بندد:** template manifest schema + registry + scaffold task مخصوص.

### `GAP-CP-05` — همکاری چندنفره روی یک Run (کامنت، واگذاری approval، hand-off)

**چرا مهم است:** مدل داده تک‌کاربر فرض شده. در تیم واقعی approval باید قابل واگذاری باشد و بحث روی diff ممکن شود.

**چه چیزی آن را می‌بندد:** جدول comment و approval delegation + UI + قاعده تفکیک وظایف.

## لایه هوش و ایجنت

| شناسه | شکاف | وضعیت | شدت | مایلستون |
|---|---|---|---|---|
| `GAP-IN-01` | Evaluation harness برای پرامپت‌ها (سناریوهای E1 تا E12) | 📄 فقط سند | بلوکر | M2 |
| `GAP-IN-03` | Context assembler (ساخت context نهایی از چهار لایه حافظه) | 🔴 غایب | بلوکر | M2 |
| `GAP-IN-04` | Repository indexer (نقشه مخزن، symbol، گراف import) و به‌روزرسانی تدریجی | 📄 فقط سند | بلوکر | M2 |
| `GAP-IN-20` | M164 structured output repair و response safety integration | 🟡 ناقص | بلوکر | M164 |
| `GAP-IN-21` | M169 context provenance و prompt-injection firewall integration | 🟡 ناقص | بلوکر | M169 |
| `GAP-IN-06` | کاتالوگ ارائه‌دهندگان مدل + health probe + کشف خودکار مدل‌های محلی | 🟡 ناقص | بالا | M1 |
| `GAP-IN-07` | حسابداری هزینه: ledger هر فراخوانی و جدول قیمت مدل‌ها | 🟡 ناقص | بالا | M1 |
| `GAP-IN-08` | قرارداد delegation بین ایجنت‌ها (schema ورودی/خروجی واگذاری) | 🔴 غایب | بالا | M2 |
| `GAP-IN-09` | سیاست retry برای خطاهای مدل (429، JSON نامعتبر، refusal، timeout) | 🟡 ناقص | بالا | M2 |
| `GAP-IN-12` | Guardrail برای مسیر فایل و API توهم‌زده | 🔴 غایب | بالا | M2 |
| `GAP-IN-02` | Benchmark پروژه‌های مرجع و نرخ موفقیت end-to-end | 🟡 ناقص | بالا | M3 |
| `GAP-IN-15` | Runner کاوش canary برای تولید شواهد اندازه‌گیری‌شده | 🟡 ناقص | بالا | M3 |
| `GAP-IN-16` | M16 durable memory و context retrieval integration | 🟡 ناقص | بالا | M16 |
| `GAP-IN-19` | M132 ACL-aware knowledge، freshness و context lineage integration | 🟡 ناقص | بالا | M132 |
| `GAP-IN-22` | M174 prompt experimentation و rollback integration | 🟡 ناقص | بالا | M174 |
| `GAP-IN-23` | M175 multi-model consensus و voting integration | 🟡 ناقص | بالا | M175 |
| `GAP-IN-24` | M185 repository intelligence و retrieval evidence integration | 🟡 ناقص | بالا | M185 |
| `GAP-IN-25` | M198 model catalog freshness و capability disclosure integration | 🟡 ناقص | بالا | M198 |
| `GAP-IN-10` | fallback برای مدل‌های بدون structured output (grammar-constrained decoding یا repair loop) | 🔴 غایب | متوسط | M3 |
| `GAP-IN-11` | Streaming خروجی مدل و نمایش تدریجی | 🔴 غایب | متوسط | M4 |
| `GAP-IN-05` | حافظه معنایی (pgvector): embedding، بازیابی، invalidation | 📄 فقط سند | متوسط | M5 |
| `GAP-IN-13` | حلقه بازخورد انسانی (امتیاز، اصلاح) و بازگشت آن به eval | 🔴 غایب | متوسط | M5 |
| `GAP-IN-14` | Harvester سیگنال بیرونی (وب، انجمن، شبکه اجتماعی) | 🔴 غایب | پایین | POST |

### `GAP-IN-01` — Evaluation harness برای پرامپت‌ها (سناریوهای E1 تا E12)

**چرا مهم است:** docs/12-quality-and-dod.md دوازده سناریو را دقیق تعریف کرده ولی هیچ runner، دیتاست، تابع امتیاز یا دروازه‌ای وجود ندارد. بدون آن تغییر پرامپت مثل تغییر کد بدون تست است — و پرامپت‌ها همین الان ۱۲۹۲ خط‌اند.

**چه چیزی آن را می‌بندد:** src/eval با فرمت سناریو JSON، scorer (انطباق schema + انطباق invariants)، و npm run eval به‌عنوان gate.

### `GAP-IN-03` — Context assembler (ساخت context نهایی از چهار لایه حافظه)

**چرا مهم است:** docs/08-memory-and-context.md لایه‌ها و ترتیب مونتاژ را مشخص کرده ولی هیچ کدی وجود ندارد (grep برای assembleContext/buildContext در src صفر نتیجه دارد). بدون آن هر فراخوانی مدل یا کم‌اطلاع است یا از پنجره context بیرون می‌زند.

**چه چیزی آن را می‌بندد:** src/core/context.ts با بودجه‌بندی، اولویت حذف و لاگ آنچه واقعاً ارسال شد.

### `GAP-IN-04` — Repository indexer (نقشه مخزن، symbol، گراف import) و به‌روزرسانی تدریجی

**چرا مهم است:** پرامپت repo-analyst وجود دارد ولی خروجی او یک متن آزاد است، نه یک index قابل جست‌وجو. بدون index، انتخاب «فایل‌های مرتبط» حدسی است.

**چه چیزی آن را می‌بندد:** فرمت index + indexer per language + به‌روزرسانی بر اساس diff + تست روی یک مخزن مرجع.

### `GAP-IN-20` — M164 structured output repair و response safety integration

**چرا مهم است:** M164 output contract، bounded repair، refusal و safety scan را fail-closed می‌کند، اما model adapter، structured decoder، repair runner، output DLP و tenant-safe response gateway واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال model adapter، schema decoder، bounded repair worker، output redaction/DLP، safety classifier و response admission gateway.

### `GAP-IN-21` — M169 context provenance و prompt-injection firewall integration

**چرا مهم است:** M169 context envelope، source trust، freshness، citation و injection scan را gate می‌کند، اما context assembler، provenance store، classifier، quarantine و response firewall واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال snapshot-bound context assembler، provenance/freshness store، injection classifier، quarantine و tenant-safe response firewall با regression corpus.

### `GAP-IN-06` — کاتالوگ ارائه‌دهندگان مدل + health probe + کشف خودکار مدل‌های محلی

**چرا مهم است:** ساختار PoolEndpoint + unified group + زنجیره نام‌دار + staleTosReviews پیاده شد (src/core/free-provider-pool.ts، الهام از freellmapi). باقی‌مانده: health probe واقعی، کشف خودکار مدل‌های محلی، و پر کردن کاتالوگ با ارائه‌دهندگان واقعی.

**چه چیزی آن را می‌بندد:** providers/catalog.json + probe (Ollama /api/tags) + UI انتخاب.

### `GAP-IN-07` — حسابداری هزینه: ledger هر فراخوانی و جدول قیمت مدل‌ها

**چرا مهم است:** سهمیه آگاه از توکن (rpm/rpd/tpm/tpd/monthlyTokenBudget) + commitUsage برای آشتی تخمین با عدد واقعی + usageReport پیاده شد. باقی‌مانده: ledger پایدار در دیتابیس و جدول قیمت مدل‌ها.

**چه چیزی آن را می‌بندد:** جدول model_call_ledger + جدول قیمت + رویداد model.routed با مقدار واقعی.

### `GAP-IN-08` — قرارداد delegation بین ایجنت‌ها (schema ورودی/خروجی واگذاری)

**چرا مهم است:** Orchestrator واگذاری می‌کند ولی هیچ artifact تایپ‌شده‌ای برای «این تسک را به این ایجنت با این context دادم و این را گرفتم» وجود ندارد. بدون آن زنجیره تصمیم قابل بازسازی نیست.

**چه چیزی آن را می‌بندد:** schema/delegation.schema.json + ذخیره در SystemEvent + نمایش در timeline.

### `GAP-IN-09` — سیاست retry برای خطاهای مدل (429، JSON نامعتبر، refusal، timeout)

**چرا مهم است:** cooldown رو به رشد per نوع خطا (429/5xx/timeout/invalid) + چرخش کلید پیش از ترک ارائه‌دهنده پیاده شد. باقی‌مانده: اجرای واقعی retry روی HTTP و رفتار refusal.

**چه چیزی آن را می‌بندد:** src/core/model-retry.ts + تست برای هر کلاس خطا.

### `GAP-IN-12` — Guardrail برای مسیر فایل و API توهم‌زده

**چرا مهم است:** هیچ بررسی‌ای وجود ندارد که ایجنت فایلی را ویرایش کند که وجود ندارد یا متدی را صدا بزند که در کتابخانه نیست. این شایع‌ترین خطای ایجنت‌های کدنویس است.

**چه چیزی آن را می‌بندد:** اعتبارسنجی مسیر پیش از write + تطبیق symbol با index + بازگشت خطا به ایجنت.

### `GAP-IN-02` — Benchmark پروژه‌های مرجع و نرخ موفقیت end-to-end

**چرا مهم است:** هیچ معیاری وجود ندارد که بگوید نسخه امروز بهتر از دیروز است. «ایجنت خوب کار می‌کند» بدون benchmark یک ادعاست.

**چه چیزی آن را می‌بندد:** ۱۰ پروژه مرجع با acceptance criteria + اجرای دوره‌ای + داشبورد نرخ موفقیت.

### `GAP-IN-15` — Runner کاوش canary برای تولید شواهد اندازه‌گیری‌شده

**چرا مهم است:** aggregateEvidence برای هر موضوع اندازه‌گیری‌نشده canaryShare تولید می‌کند، ولی هیچ اجراکننده‌ای آن سهم را مصرف نمی‌کند. بدون آن، چرخه «اطمینان پایین → اندازه‌گیری → اطمینان بالاتر» هیچ‌وقت بسته نمی‌شود و پلتفرم هرگز از حدس بیرون نمی‌آید.

**چه چیزی آن را می‌بندد:** scheduler که canaryShare را به ترافیک واقعی روی پروژه‌های مرجع تبدیل کند، نتیجه را به‌عنوان شاهد measured ثبت کند، و بودجه توکن canary را از settings بخواند.

### `GAP-IN-16` — M16 durable memory و context retrieval integration

**چرا مهم است:** M16 memory را با tenant، provenance، trust و expiry تعریف می‌کند و lexical retrieval دارد، اما durable memory، context assembler، vector adapter، contradiction benchmark و deletion واقعی وجود ندارد.

**چه چیزی آن را می‌بندد:** اتصال memory به retention/encryption، context budget، optional local embedding، evaluation benchmark و cross-tenant deletion drill.

### `GAP-IN-19` — M132 ACL-aware knowledge، freshness و context lineage integration

**چرا مهم است:** M132 source trust، ACL context، freshness، lineage و index evidence را gate می‌کند، اما repository indexer، ACL connector، vector/lexical store، freshness worker و deletion propagation واقعی وجود ندارد.

**چه چیزی آن را می‌بندد:** اتصال snapshot-bound indexer، ACL-aware retrieval، freshness/refresh worker، lineage store و deletion propagation به context assembler.

### `GAP-IN-22` — M174 prompt experimentation و rollback integration

**چرا مهم است:** M174 variant registry، deterministic assignment، metric evidence، holdout و rollback approval را gate می‌کند، اما experiment service، traffic router، evaluator و rollback controller واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال prompt variant registry، assignment/router، privacy-safe evaluator، holdout analysis و bounded rollback controller با regression evidence.

### `GAP-IN-23` — M175 multi-model consensus و voting integration

**چرا مهم است:** M175 panel مستقل، vote، quorum، strict threshold، evidence و tie-break را validate می‌کند، اما model fan-out، vote store، calibration و human review واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال panel registry، independent model runner، durable vote/evidence store، calibration، disagreement analysis و human review gate.

### `GAP-IN-24` — M185 repository intelligence و retrieval evidence integration

**چرا مهم است:** M185 repository snapshot، exact-commit retrieval، ACL، path allowlist، code evidence و refresh deletion proof را gate می‌کند، اما indexer، semantic/AST retrieval، ACL gateway، secret scanner و purge worker واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال commit-bound indexer، lexical/AST/semantic retrieval، ACL/tenant gateway، secret/DLP scanner و refresh/deletion worker با citation evidence.

### `GAP-IN-25` — M198 model catalog freshness و capability disclosure integration

**چرا مهم است:** M198 model record، model card، license، data policy، quota، freshness، discovery provenance، activation، fallback و retirement را gate می‌کند، اما catalog registry، discovery verifier، health probe، activation gateway و retirement migration واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال signed catalog، discovery/provenance verifier، model health/quota probe، activation gate، free/local/BYOK disclosure و retirement migrator.

### `GAP-IN-10` — fallback برای مدل‌های بدون structured output (grammar-constrained decoding یا repair loop)

**چرا مهم است:** Router مدل‌های بدون structured output را رد می‌کند، یعنی بخش بزرگی از مدل‌های محلی عملاً غیرقابل استفاده‌اند.

**چه چیزی آن را می‌بندد:** حالت repair-by-schema + اندازه‌گیری نرخ موفقیت هر مدل.

### `GAP-IN-11` — Streaming خروجی مدل و نمایش تدریجی

**چرا مهم است:** SSE برای رویدادها طراحی شده ولی streaming خود مدل نه. کاربر دقایق به صفحه خیره می‌ماند.

**چه چیزی آن را می‌بندد:** قرارداد stream + بافر + قطع‌شدگی + تست.

### `GAP-IN-05` — حافظه معنایی (pgvector): embedding، بازیابی، invalidation

**چرا مهم است:** docs/08-memory-and-context.md به pgvector اشاره می‌کند؛ هیچ schema، pipeline یا سیاست invalidation طراحی نشده. حافظه کهنه خطرناک‌تر از نداشتن حافظه است.

**چه چیزی آن را می‌بندد:** جدول memory_embeddings + pipeline + قاعده «حافظه بازیابی‌شده غیرقابل اعتماد است».

### `GAP-IN-13` — حلقه بازخورد انسانی (امتیاز، اصلاح) و بازگشت آن به eval

**چرا مهم است:** وقتی کاربر یک diff را رد می‌کند، هیچ ساختاری آن را به دیتاست ارزیابی برنمی‌گرداند. محصول یاد نمی‌گیرد.

**چه چیزی آن را می‌بندد:** جدول feedback + pipeline به eval dataset.

### `GAP-IN-14` — Harvester سیگنال بیرونی (وب، انجمن، شبکه اجتماعی)

**چرا مهم است:** src/core/capability-evidence.ts قرارداد ورودی CapabilityClaim را تعریف کرده و لایه community_signal را با سقف نفوذ ۱۵٪، پوسیدگی ۳۰ روزه، سقف per-domain و تشخیص دستکاری پوشش می‌دهد — ولی هیچ کدی آن ورودی را تولید نمی‌کند. این عمدی است: ToS شبکه‌های اجتماعی، هزینه و نرخ محدودیت، و نبود نرمال‌سازی معنایی سه مسئله حل‌نشده‌اند. بدون harvester، لایه وب عملاً خالی است و تصمیم‌ها فقط روی اندازه‌گیری داخلی می‌چرخند.

**چه چیزی آن را می‌بندد:** adapter با نرخ‌محدود و کش که خروجی را به CapabilityClaim نرمال کند، فقط از منابع با API رسمی، با ثبت domain برای سقف‌ها، و بدون هیچ مسیر نوشتاری به تنظیمات یا اختیار ایجنت.

## لایه اجرا و سندباکس

| شناسه | شکاف | وضعیت | شدت | مایلستون |
|---|---|---|---|---|
| `GAP-EX-11` | Worker و صف واقعی (consumer، retry، DLQ، concurrency) | 🟡 ناقص | بلوکر | M1 |
| `GAP-EX-02` | Workspace/VFS: materialize، snapshot، diff، revert و اعمال allowedPaths | 🔴 غایب | بلوکر | M2 |
| `GAP-EX-03` | ماتریس زبان و ابزار (Node، Python، Go، Rust، Java، PHP) | 🔴 غایب | بلوکر | M2 |
| `GAP-EX-01` | Sandbox runtime (قرارداد اجرا، image، network policy، limits، جمع‌آوری artifact) | 🔴 غایب | بلوکر | M3 |
| `GAP-EX-08` | پروتکل تزریق secret به sandbox و جلوگیری از نشت برگشتی | 🟡 ناقص | بلوکر | M3 |
| `GAP-EX-16` | M146 workspace VFS و sandbox resource boundary integration | 🟡 ناقص | بلوکر | M146 |
| `GAP-EX-17` | M149 durable worker queue، retry و DLQ integration | 🟡 ناقص | بلوکر | M149 |
| `GAP-EX-20` | M170 tool action boundary و transactional approval integration | 🟡 ناقص | بلوکر | M170 |
| `GAP-EX-21` | M180 agent graph orchestration و durable checkpoint integration | 🟡 ناقص | بلوکر | M180 |
| `GAP-EX-24` | M200 side-effect journal و idempotent commit integration | 🟡 ناقص | بلوکر | M200 |
| `GAP-EX-25` | M207 action simulation و blast-radius preview integration | 🟡 ناقص | بلوکر | M207 |
| `GAP-EX-04` | آداپتور test runner و نرمال‌سازی نتیجه به TestRun | 🔴 غایب | بالا | M2 |
| `GAP-EX-06` | checkpoint/resume و compensation برای jobهای طولانی | 🟡 ناقص | بالا | M2 |
| `GAP-EX-09` | Migration runner (up/down/dry-run) برای پروژه تولیدشده | 🔴 غایب | بالا | M2 |
| `GAP-EX-12` | اثبات حذف کامل محیط پس از job | 📄 فقط سند | بالا | M3 |
| `GAP-EX-05` | محیط preview: تخصیص پورت، مسیریابی، TLS، انقضا، جداسازی tenant | 🟡 ناقص | بالا | M7 |
| `GAP-EX-10` | آداپتور deploy (Vercel، Fly، Cloud Run، Kubernetes) | 🔴 غایب | بالا | M7 |
| `GAP-EX-13` | M15 workflow scheduler و trigger runtime | 🟡 ناقص | بالا | M15 |
| `GAP-EX-14` | M141 workflow scheduler و trigger runtime integration | 🟡 ناقص | بالا | M141 |
| `GAP-EX-15` | M142 artifact lifecycle و preview isolation integration | 🟡 ناقص | بالا | M142 |
| `GAP-EX-18` | M152 preview environment و deployment routing integration | 🟡 ناقص | بالا | M152 |
| `GAP-EX-19` | M166 cancellation و compensation runtime integration | 🟡 ناقص | بالا | M166 |
| `GAP-EX-22` | M184 graph engine compatibility و state interop integration | 🟡 ناقص | بالا | M184 |
| `GAP-EX-23` | M193 tenant fairness و queue scheduling integration | 🟡 ناقص | بالا | M193 |
| `GAP-EX-07` | Artifact storage: چرخه عمر، signed URL، retention | 🟡 ناقص | متوسط | M4 |

### `GAP-EX-11` — Worker و صف واقعی (consumer، retry، DLQ، concurrency)

**چرا مهم است:** قرارداد InMemory Queue اکنون priority، concurrency، retry، backoff، lease و DLQ و یک Worker Boundary برای claim/handler/heartbeat/complete/fail را پوشش می‌دهد، اما consumer durable، Redis/BullMQ، multi-worker persistence و production scheduling هنوز ساخته نشده‌اند.

**چه چیزی آن را می‌بندد:** apps/worker + صف per tenant + retry/DLQ + تست end-to-end یک Run.

### `GAP-EX-02` — Workspace/VFS: materialize، snapshot، diff، revert و اعمال allowedPaths

**چرا مهم است:** AgentTask.allowedPaths در schema هست ولی هیچ کدی آن را اعمال نمی‌کند. قفل فایل فقط در زمان‌بندی رعایت می‌شود، نه در نوشتن واقعی.

**چه چیزی آن را می‌بندد:** لایه workspace با اجاره‌نامه مسیر + نوشتن اتمیک + diff + revert + تست نقض allowedPaths.

### `GAP-EX-03` — ماتریس زبان و ابزار (Node، Python، Go، Rust، Java، PHP)

**چرا مهم است:** کل طراحی به‌صورت ضمنی اکوسیستم TypeScript/Next.js را فرض کرده (pnpm، vitest، prisma). «پلتفرم همه‌فن‌حریف» بدون آداپتور زبان ممکن نیست.

**چه چیزی آن را می‌بندد:** LanguageProfile per language: image، package manager، دستور lint/test/build، آداپتور نتیجه.

### `GAP-EX-01` — Sandbox runtime (قرارداد اجرا، image، network policy، limits، جمع‌آوری artifact)

**چرا مهم است:** docs/07-sandbox-and-security.md همه کنترل‌ها را فهرست کرده ولی grep برای Sandbox در src صفر نتیجه می‌دهد. این قلب Execution Plane است و بدون آن هیچ کدی قابل اجرا نیست.

**چه چیزی آن را می‌بندد:** packages/sandbox-sdk با قرارداد runtime + پیاده‌سازی Docker + تست escape.

### `GAP-EX-08` — پروتکل تزریق secret به sandbox و جلوگیری از نشت برگشتی

**چرا مهم است:** SecretReference در schema هست و redaction خروجی را پاک می‌کند، ولی اینکه secret چطور وارد sandbox شود و چطور در لاگ/exit code/artifact نماند طراحی نشده.

**چه چیزی آن را می‌بندد:** طراحی تزریق (env در برابر file mount) + mask در لاگ + تست نشت.

### `GAP-EX-16` — M146 workspace VFS و sandbox resource boundary integration

**چرا مهم است:** M146 snapshot، path/symlink guard، sandbox budget و diff rollback را fail-closed validate می‌کند، اما VFS، snapshot store، sandbox runtime، resource cgroup و diff applier واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال workspace/VFS، immutable snapshot، path/symlink enforcement، sandbox/cgroup، resource telemetry و reversible diff applier.

### `GAP-EX-17` — M149 durable worker queue، retry و DLQ integration

**چرا مهم است:** M149 job envelope، queue policy، worker lease، idempotency و DLQ replay را validate می‌کند، اما durable queue، consumer، distributed lease، retry scheduler و DLQ store واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال queue backend، consumer/worker، lease/heartbeat، retry/backoff، idempotency store، DLQ review و bounded replay.

### `GAP-EX-20` — M170 tool action boundary و transactional approval integration

**چرا مهم است:** M170 action plan، tool call، separation of duties، protected target و commit evidence را validate می‌کند، اما tool gateway، approval store، precondition lock، transactional applier و rollback executor واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال tool gateway، durable approval، precondition/lock store، transactional action applier، protected target guard و rollback evidence.

### `GAP-EX-21` — M180 agent graph orchestration و durable checkpoint integration

**چرا مهم است:** M180 acyclic graph، bounded task، lease، idempotency، checkpoint و transition را validate می‌کند، اما graph compiler، durable worker، checkpoint store، lease manager و sandbox executor واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال graph compiler، durable queue/worker، lease/idempotency store، checkpoint persistence، sandbox و replay/recovery evidence.

### `GAP-EX-24` — M200 side-effect journal و idempotent commit integration

**چرا مهم است:** M200 operation journal، idempotency، precondition، atomic boundary، receipt، no-duplicate و compensation را gate می‌کند، اما durable journal، transaction/outbox adapter، side-effect applier، receipt store و compensation worker واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال durable operation journal، idempotency/outbox store، precondition lock، side-effect applier، receipt verifier و compensation worker.

### `GAP-EX-25` — M207 action simulation و blast-radius preview integration

**چرا مهم است:** M207 side-effect-free simulation، predicted diff، affected resources، blast radius، approval، precondition، redaction و rollback را gate می‌کند، اما isolated simulator، state snapshotter، preview UI، apply gateway و rollback runner واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال isolated simulator، snapshot/diff engine، reviewable preview UI، preconditioned apply gateway و rollback runner.

### `GAP-EX-04` — آداپتور test runner و نرمال‌سازی نتیجه به TestRun

**چرا مهم است:** جدول test_runs با exitCode و logsRef وجود دارد ولی هیچ چیزی خروجی vitest/pytest/go test را به آن تبدیل نمی‌کند. بدون نرمال‌سازی، Evidence Rule قابل اعمال نیست.

**چه چیزی آن را می‌بندد:** پارسر per runner + نگاشت به TestRun + تست روی خروجی‌های نمونه.

### `GAP-EX-06` — checkpoint/resume و compensation برای jobهای طولانی

**چرا مهم است:** docs/03-architecture.md می‌گوید «jobها قابل ازسرگیری‌اند» و idempotencyKey در schema هست، ولی هیچ طراحی checkpoint یا saga وجود ندارد.

**چه چیزی آن را می‌بندد:** طراحی checkpoint per task + recovery procedure + تست کشتن worker وسط کار.

### `GAP-EX-09` — Migration runner (up/down/dry-run) برای پروژه تولیدشده

**چرا مهم است:** definitionOfDone شامل migration-dry-run است ولی هیچ اجرایی برای آن وجود ندارد.

**چه چیزی آن را می‌بندد:** آداپتور per ORM + dry-run در sandbox + گزارش.

### `GAP-EX-12` — اثبات حذف کامل محیط پس از job

**چرا مهم است:** «ephemeral، پس از job حذف می‌شود» یک ادعاست تا وقتی تستی نباشد که ثابت کند چیزی باقی نمانده.

**چه چیزی آن را می‌بندد:** تست cleanup که پس از job فایل‌سیستم، volume و process را بررسی می‌کند.

### `GAP-EX-05` — محیط preview: تخصیص پورت، مسیریابی، TLS، انقضا، جداسازی tenant

**چرا مهم است:** پرامپت devops الزامات را می‌گوید ولی هیچ طراحی برای اینکه دو tenant همزمان preview داشته باشند وجود ندارد.

**چه چیزی آن را می‌بندد:** طراحی router پیشوند-محور + wildcard TLS + TTL + cleanup job.

### `GAP-EX-10` — آداپتور deploy (Vercel، Fly، Cloud Run، Kubernetes)

**چرا مهم است:** در نقشه راه M7 آمده ولی هیچ قرارداد آداپتوری طراحی نشده.

**چه چیزی آن را می‌بندد:** DeployAdapter interface + یک پیاده‌سازی مرجع + verification و rollback.

### `GAP-EX-13` — M15 workflow scheduler و trigger runtime

**چرا مهم است:** M15 workflow definition، signed trigger، approval و idempotency plan دارد، اما scheduler، webhook ingress، durable queue، worker execution و cooldown store واقعی ساخته نشده‌اند.

**چه چیزی آن را می‌بندد:** ساخت scheduler و ingress با signature/dedupe، اتصال به queue/worker، approval per step، rate limit و replayable evidence.

### `GAP-EX-14` — M141 workflow scheduler و trigger runtime integration

**چرا مهم است:** M141 schedule، event trigger، dedupe، concurrency، quota و worker lease را validate می‌کند، اما scheduler، durable queue، distributed lock، worker consumer و DLQ واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال cron/event scheduler، durable queue، lease/lock، worker، retry/DLQ، quota preflight و observability.

### `GAP-EX-15` — M142 artifact lifecycle و preview isolation integration

**چرا مهم است:** M142 artifact retention، safe preview path، signed delivery و cleanup evidence را gate می‌کند، اما object store، preview proxy، sandbox/container، CDN و deletion worker واقعی وجود ندارد.

**چه چیزی آن را می‌بندد:** اتصال artifact store، preview isolation proxy، signed URL service، sandbox، CDN cache purge و deletion sweep.

### `GAP-EX-18` — M152 preview environment و deployment routing integration

**چرا مهم است:** M152 preview environment، port lease، TLS/origin route و deployment target را gate می‌کند، اما environment provisioner، port allocator، proxy/TLS، deployment adapter و expiry cleanup واقعی وجود ندارد.

**چه چیزی آن را می‌بندد:** اتصال preview provisioner، port lease store، TLS/proxy routing، Docker/Kubernetes adapter، smoke check و cleanup.

### `GAP-EX-19` — M166 cancellation و compensation runtime integration

**چرا مهم است:** M166 cancellation request، checkpoint، lease revoke، compensation و cleanup evidence را gate می‌کند، اما cancellation controller، task signal، saga/compensation worker، process cleanup و external side-effect adapter واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال cancellation controller، durable task signal، checkpoint store، compensation worker، resource cleanup و external action reconciliation با approval.

### `GAP-EX-22` — M184 graph engine compatibility و state interop integration

**چرا مهم است:** M184 adapter manifest، graph/state hash، checkpoint، handoff، node binding و compatibility را gate می‌کند، اما LangGraph/external adapter gateway، state store، protocol translator و replay runner واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال adapter gateway، versioned state/checkpoint store، node capability broker، protocol translator، sandbox و replay/rollback evidence.

### `GAP-EX-23` — M193 tenant fairness و queue scheduling integration

**چرا مهم است:** M193 workload، slot/cost quota، max tenant share، starvation bound، reservation، allocation lease و fairness evidence را gate می‌کند، اما durable queue، scheduler، lease store، autoscaler، provider quota adapter و fairness telemetry واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال durable queue، fair scheduler، lease/preemption store، autoscaler، provider quota adapter و redacted fairness telemetry.

### `GAP-EX-07` — Artifact storage: چرخه عمر، signed URL، retention

**چرا مهم است:** logsRef و diffRef در قراردادها هست و MinIO نام برده شده، ولی هیچ طراحی برای دسترسی امن کاربر به این فایل‌ها وجود ندارد.

**چه چیزی آن را می‌بندد:** قرارداد storage + signed URL با انقضا + policy حذف.

## کانکتورها و یکپارچه‌سازی

| شناسه | شکاف | وضعیت | شدت | مایلستون |
|---|---|---|---|---|
| `GAP-IG-01` | Connector SDK runtime (OAuth state، refresh، error taxonomy، backoff) | 🟡 ناقص | بلوکر | M2 |
| `GAP-IG-02` | پیاده‌سازی GitHub App (installation، token کوتاه‌مدت، webhook، permission) | 🔴 غایب | بلوکر | M2 |
| `GAP-IG-16` | M161 workload identity و service-account lease integration | 🟡 ناقص | بلوکر | M161 |
| `GAP-IG-04` | Webhook receiver با اعتبارسنجی امضا و dedupe | 📄 فقط سند | بالا | M2 |
| `GAP-IG-07` | Idempotency store و پنجره dedupe | 🟡 ناقص | بالا | M2 |
| `GAP-IG-08` | Rate-limit adapter per connector (429، Retry-After، صف) | 🔴 غایب | بالا | M2 |
| `GAP-IG-05` | Browser runtime (session store، اعمال allowlist، ضبط، پروتکل handover) | 📄 فقط سند | بالا | M6 |
| `GAP-IG-10` | M13 governed plugin registry و marketplace integration | 🟡 ناقص | بالا | M13 |
| `GAP-IG-11` | M17 agent protocol و interoperability gateway | 🟡 ناقص | بالا | M17 |
| `GAP-IG-12` | M126 connector consent، signed webhook و reconciliation integration | 🟡 ناقص | بالا | M126 |
| `GAP-IG-13` | M145 connector SDK و OAuth/PKCE lifecycle integration | 🟡 ناقص | بالا | M145 |
| `GAP-IG-14` | M151 GitHub App و webhook/action integration | 🟡 ناقص | بالا | M151 |
| `GAP-IG-17` | M165 agent delegation و capability token integration | 🟡 ناقص | بالا | M165 |
| `GAP-IG-18` | M168 outbound webhook و callback delivery integration | 🟡 ناقص | بالا | M168 |
| `GAP-IG-19` | M176 agent-to-agent protocol و interoperability integration | 🟡 ناقص | بالا | M176 |
| `GAP-IG-20` | M195 provider health و circuit recovery integration | 🟡 ناقص | بالا | M195 |
| `GAP-IG-21` | M201 connector reconciliation و drift repair integration | 🟡 ناقص | بالا | M201 |
| `GAP-IN-17` | کشف وب‌محور مدل‌های هوش مصنوعی و ثبت کاندیدای مدل | 🔴 غایب | بالا | POST |
| `GAP-IN-18` | دایرکتوری جامع هوش مصنوعی و راستی‌آزمایی API رایگان | 🔴 غایب | بالا | POST |
| `GAP-IG-03` | آداپتور MCP | 🔴 غایب | متوسط | M5 |
| `GAP-IG-06` | Connector دیتابیس (introspection خوانا در برابر نوشتن) | 🔴 غایب | متوسط | M5 |
| `GAP-IG-09` | Webhook خروجی به مشتری با امضا | 🔴 غایب | پایین | POST |

### `GAP-IG-01` — Connector SDK runtime (OAuth state، refresh، error taxonomy، backoff)

**چرا مهم است:** manifest schema و نمونه GitHub وجود دارد ولی هیچ runtime. grep برای oauth در src صفر نتیجه می‌دهد.

**چه چیزی آن را می‌بندد:** packages/connector-sdk + OAuth 2.1 PKCE + vault adapter + تست با mock provider.

### `GAP-IG-02` — پیاده‌سازی GitHub App (installation، token کوتاه‌مدت، webhook، permission)

**چرا مهم است:** کل MVP روی GitHub سوار است و هیچ کدی برای آن وجود ندارد.

**چه چیزی آن را می‌بندد:** connectors/github + تست integration + بررسی scope در عمل.

### `GAP-IG-16` — M161 workload identity و service-account lease integration

**چرا مهم است:** M161 workload proof، least-privilege binding، short-lived lease، rotation و revoke را gate می‌کند، اما issuer/identity provider، workload attestation، credential broker، binding store و revoke propagation واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال workload identity provider، attestation verifier، scoped lease broker، binding policy، rotation/revoke fan-out و audit evidence.

### `GAP-IG-04` — Webhook receiver با اعتبارسنجی امضا و dedupe

**چرا مهم است:** endpoint در docs/10-api-and-events.md فهرست شده و امضا ذکر شده، ولی هیچ پیاده‌سازی و هیچ تست امضای نامعتبر وجود ندارد.

**چه چیزی آن را می‌بندد:** apps/api/webhooks + اعتبارسنجی + dedupe + تست replay.

### `GAP-IG-07` — Idempotency store و پنجره dedupe

**چرا مهم است:** ستون idempotencyKey @unique در Prisma هست ولی هیچ طراحی برای اینکه کلید چطور ساخته، نگهداری و منقضی شود وجود ندارد.

**چه چیزی آن را می‌بندد:** src/core/idempotency.ts + TTL + تست تکرار.

### `GAP-IG-08` — Rate-limit adapter per connector (429، Retry-After، صف)

**چرا مهم است:** manifest فیلد rateLimits دارد ولی هیچ چیزی از آن استفاده نمی‌کند. tryConsumeQuota فقط برای مدل است، نه برای GitHub.

**چه چیزی آن را می‌بندد:** تعمیم quota به کانکتورها + تست اشباع.

### `GAP-IG-05` — Browser runtime (session store، اعمال allowlist، ضبط، پروتکل handover)

**چرا مهم است:** پرامپت browser-automation دقیق است ولی allowlist و توقف در CAPTCHA فقط به مدل گفته شده — هیچ کدی آن را تحمیل نمی‌کند. این خطرناک‌ترین شکاف امنیتی فاز ۶ است.

**چه چیزی آن را می‌بندد:** apps/browser-runner + allowlist در سطح مرورگر + رویداد handover + تست.

### `GAP-IG-10` — M13 governed plugin registry و marketplace integration

**چرا مهم است:** M13 manifest، signature، digest، trust، scope، hard-deny و sandbox boundary را enforce می‌کند، اما package registry، marketplace, signing service، sandbox runtime و revoke/upgrade واقعی وجود ندارد.

**چه چیزی آن را می‌بندد:** ساخت registry و review workflow، امضای قابل‌اعتماد، digest verification، sandbox runtime، audit، revoke و upgrade با approval انسانی.

### `GAP-IG-11` — M17 agent protocol و interoperability gateway

**چرا مهم است:** M17 envelope، signature callback، TTL، scope، trust و replay window contract دارد، اما network gateway، durable replay store، key service، A2A/MCP adapter و tool execution واقعی وجود ندارد.

**چه چیزی آن را می‌بندد:** ساخت gateway با canonical signing، key rotation، durable nonce store، protocol conformance، policy mapping و sandboxed tool boundary.

### `GAP-IG-12` — M126 connector consent، signed webhook و reconciliation integration

**چرا مهم است:** M126 consent، webhook signature/freshness، cursor reconciliation و connector action safety را validate می‌کند، اما OAuth/PKCE provider، ingress، durable cursor/outbox و conflict UI واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال OAuth/PKCE، webhook ingress، durable dedupe/cursor/outbox، provider adapter، conflict review و sandboxed mutation با local/BYOK/free fallback.

### `GAP-IG-13` — M145 connector SDK و OAuth/PKCE lifecycle integration

**چرا مهم است:** M145 manifest، OAuth PKCE، opaque token lease و signed webhook را gate می‌کند، اما connector SDK، IdP/OAuth provider، token broker، webhook ingress و refresh/revoke واقعی وجود ندارد.

**چه چیزی آن را می‌بندد:** اتصال connector SDK، OAuth/PKCE provider، encrypted token broker، scope attenuation، webhook ingress/dedupe و revoke propagation.

### `GAP-IG-14` — M151 GitHub App و webhook/action integration

**چرا مهم است:** M151 installation، short-lived token، signed webhook و repository action safety را validate می‌کند، اما GitHub App، installation token broker، webhook ingress، permission adapter و action worker واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال GitHub App/OAuth، encrypted token broker، signed webhook ingress، dedupe، permission mapping و approved repository worker.

### `GAP-IG-17` — M165 agent delegation و capability token integration

**چرا مهم است:** M165 delegation، capability token، no-transitive-escalation، result contract و revocation را validate می‌کند، اما delegation broker، capability store، agent gateway، descendant revoke و execution binding واقعی وجود ندارد.

**چه چیزی آن را می‌بندد:** اتصال delegation broker، short-lived capability store، agent gateway، resource policy، result validator و descendant revoke propagation.

### `GAP-IG-18` — M168 outbound webhook و callback delivery integration

**چرا مهم است:** M168 verified endpoint، HTTPS، signature، delivery retry، response validation و bounded replay را gate می‌کند، اما endpoint registry، secret/signing service، outbound dispatcher، durable dedupe و delivery dashboard واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال endpoint verification، signing service، outbound queue/worker، retry/DLQ، dedupe/replay store و delivery telemetry با revoke.

### `GAP-IG-19` — M176 agent-to-agent protocol و interoperability integration

**چرا مهم است:** M176 agent manifest، capability، signed message، schema، idempotency و bounded handoff را gate می‌کند، اما discovery registry، protocol gateway، signature/replay store و revoke propagation واقعی وجود ندارند.

**چه چیزی آن را می‌بندد:** اتصال agent discovery، protocol gateway، signature verification، replay/idempotency store، schema validator و capability revoke.

### `GAP-IG-20` — M195 provider health و circuit recovery integration

**چرا مهم است:** M195 provider manifest، health sample، quota، circuit state، cooldown، probe، fallback و route admission را gate می‌کند، اما provider health collector، circuit store، quota adapter، route gateway و recovery controller واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال health collector، signed sample store، circuit/quota gateway، route controller، cooldown/probe worker و honest fallback disclosure.

### `GAP-IG-21` — M201 connector reconciliation و drift repair integration

**چرا مهم است:** M201 connector snapshot، cursor، revisions، ACL، consent، change direction، conflict، no-clobber، reconciliation و drift evidence را gate می‌کند، اما connector snapshot store، diff engine، conflict UI، repair worker و remote cursor واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال snapshot/cursor store، bidirectional diff engine، conflict review UI، no-clobber repair worker و drift evidence collector.

### `GAP-IN-17` — کشف وب‌محور مدل‌های هوش مصنوعی و ثبت کاندیدای مدل

**چرا مهم است:** پلتفرم هنوز چرخه bounded discovery برای پیدا کردن model card، provider، قابلیت‌ها و منبع رسمی از وب و تبدیل آن به candidate قابل audit ندارد.

**چه چیزی آن را می‌بندد:** پیاده‌سازی harvester/search adapter با robots و ToS، provenance، dedupe، rate limit، review و evidence برای هر candidate.

### `GAP-IN-18` — دایرکتوری جامع هوش مصنوعی و راستی‌آزمایی API رایگان

**چرا مهم است:** کاربر فهرست یکپارچه، دسته‌بندی‌شده و قابل جست‌وجویی از AIها با توضیح کوتاه، وضعیت lifecycle و نشان API رایگان معتبر ندارد.

**چه چیزی آن را می‌بندد:** ساخت directory taxonomy، model card، free-api evidence، publication governance، search و activation با وضعیت‌های شفاف.

### `GAP-IG-03` — آداپتور MCP

**چرا مهم است:** manifest فیلد supportsMcp دارد ولی هیچ آداپتوری برای تبدیل ابزار MCP به ToolCall طراحی نشده.

**چه چیزی آن را می‌بندد:** MCP client + نگاشت capability + policy mapping.

### `GAP-IG-06` — Connector دیتابیس (introspection خوانا در برابر نوشتن)

**چرا مهم است:** در ساختار مخزن connectors/postgres آمده ولی هیچ قرارداد یا سطح دسترسی برایش تعریف نشده.

**چه چیزی آن را می‌بندد:** manifest + قاعده read-only پیش‌فرض + write فقط با تأیید.

### `GAP-IG-09` — Webhook خروجی به مشتری با امضا

**چرا مهم است:** برای یکپارچه‌سازی مشتری سازمانی لازم است، نه برای MVP.

**چه چیزی آن را می‌بندد:** طراحی امضا + retry + داشبورد تحویل.

## امنیت و انطباق

| شناسه | شکاف | وضعیت | شدت | مایلستون |
|---|---|---|---|---|
| `GAP-SE-01` | Threat model خود پلتفرم (STRIDE) | 🟡 ناقص | بلوکر | M1 |
| `GAP-SE-10` | RLS SQL کامل برای همه جداول tenant-scoped + تست | 🟡 ناقص | بلوکر | M1 |
| `GAP-SE-02` | تست خودکار جداسازی tenant (cross-tenant probe) | 🟡 ناقص | بلوکر | M3 |
| `GAP-SE-13` | M130 artifact supply chain، SBOM و attestation integration | 🟡 ناقص | بلوکر | M130 |
| `GAP-SE-14` | M136 signed policy distribution و configuration drift integration | 🟡 ناقص | بلوکر | M136 |
| `GAP-SE-15` | M147 tenant isolation و RLS proof integration | 🟡 ناقص | بلوکر | M147 |
| `GAP-SE-20` | M190 egress policy و destination governance integration | 🟡 ناقص | بلوکر | M190 |
| `GAP-SE-03` | مدیریت کلید: KMS، envelope encryption، چرخش | 🟡 ناقص | بالا | M3 |
| `GAP-SE-04` | jobهای retention و حذف داده (GDPR-like) | 📄 فقط سند | بالا | M3 |
| `GAP-SE-05` | تشخیص تزریق پرامپت (classifier، canary token) | 🔴 غایب | بالا | M3 |
| `GAP-SE-06` | فیلتر خروجی: نشت secret یا داده tenant دیگر توسط مدل | 🔴 غایب | بالا | M3 |
| `GAP-SE-09` | ضدسوءاستفاده (جلوگیری از ساخت malware، spam، scraping انبوه) | 🟡 ناقص | بالا | M3 |
| `GAP-SE-11` | M14 data governance و privacy lifecycle durable integration | 🟡 ناقص | بالا | M14 |
| `GAP-SE-12` | M122 key rotation، privacy erasure، deletion proof و backup retention integration | 🟡 ناقص | بالا | M122 |
| `GAP-SE-17` | M159 data residency و regional routing integration | 🟡 ناقص | بالا | M159 |
| `GAP-SE-18` | M177 prompt cache integrity و privacy integration | 🟡 ناقص | بالا | M177 |
| `GAP-SE-19` | M187 dependency risk و vulnerability response integration | 🟡 ناقص | بالا | M187 |
| `GAP-SE-21` | M196 plugin capability sandbox و extension certification integration | 🟡 ناقص | بالا | M196 |
| `GAP-SE-22` | M205 capability attestation و trust-bound activation integration | 🟡 ناقص | بالا | M205 |
| `GAP-SE-23` | M208 policy change control و rollback integration | 🟡 ناقص | بالا | M208 |
| `GAP-SE-07` | Supply chain: تأیید lockfile و allowlist وابستگی per org | 🟡 ناقص | متوسط | M3 |
| `GAP-SE-08` | سیاست افشای آسیب‌پذیری، bug bounty و pen-test دوره‌ای | 🔴 غایب | متوسط | POST |

### `GAP-SE-01` — Threat model خود پلتفرم (STRIDE)

**چرا مهم است:** docs/07-sandbox-and-security.md کنترل‌ها را فهرست کرده ولی تهدیدها را نه. threat-model.md در ساختار مخزن آمده ولی مربوط به پروژه تولیدشده است، نه خود پلتفرم. بدون مدل تهدید، کنترل‌ها سلیقه‌ای‌اند.

**چه چیزی آن را می‌بندد:** docs/threat-model.md با STRIDE روی چهار صفحه + نگاشت هر تهدید به یک کنترل و یک تست.

### `GAP-SE-10` — RLS SQL کامل برای همه جداول tenant-scoped + تست

**چرا مهم است:** RLS transaction-local برای organizations و همه جداول tenant-scoped در migration دوم، به‌همراه parent-child same-tenant trigger، نوشته شده است؛ اجرای نفوذ cross-tenant روی PostgreSQL هنوز باید در CI واقعی تأیید شود.

**چه چیزی آن را می‌بندد:** migration با policy برای همه جداول + تست نفوذ cross-tenant در سطح SQL.

### `GAP-SE-02` — تست خودکار جداسازی tenant (cross-tenant probe)

**چرا مهم است:** docs/06-connectors-and-auth.md آن را «مهم‌ترین تست» می‌نامد ولی هیچ تستی وجود ندارد. قاعده بدون اجرا یک آرزوست.

**چه چیزی آن را می‌بندد:** tests/security/cross-tenant که هر endpoint را با دو tenant می‌کوبد.

### `GAP-SE-13` — M130 artifact supply chain، SBOM و attestation integration

**چرا مهم است:** M130 artifact digest، signature، SBOM، attestation، secret lease و egress gate را enforce می‌کند، اما registry/KMS، SBOM scanner، attestation verifier، secret broker و egress proxy واقعی وجود ندارد.

**چه چیزی آن را می‌بندد:** ساخت signed registry admission، SBOM/license/vulnerability scan، attestation verification، sandbox-bound secret lease و DLP egress proxy با approval.

### `GAP-SE-14` — M136 signed policy distribution و configuration drift integration

**چرا مهم است:** M136 signed policy bundle، target enforcement، drift classification و bounded exception را fail-closed validate می‌کند، اما policy service، signer/KMS، fleet agent، reconciler و runtime enforcement واقعی وجود ندارد.

**چه چیزی آن را می‌بندد:** اتصال signed policy service، KMS، target agent، drift reconciler، fail-closed runtime guard و exception review با expiry.

### `GAP-SE-15` — M147 tenant isolation و RLS proof integration

**چرا مهم است:** M147 RLS policy، default deny، cross-tenant probe و proof bundle را validate می‌کند، اما PostgreSQL RLS، service-role binding، transaction probe و replayable isolation CI واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اجرای RLS روی همه tenant tables، cross-tenant probe در CI، service-role boundary، transaction replay و signed no-leak proof.

### `GAP-SE-20` — M190 egress policy و destination governance integration

**چرا مهم است:** M190 destination، mode، data class، DNS/TLS، DLP، consent، credential lease و network evidence را gate می‌کند، اما egress proxy، DNS/TLS enforcement، DLP engine، vault و network audit واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال egress proxy، destination/DNS policy، TLS verifier، DLP scanner، vault lease/revoke و redacted network evidence collector.

### `GAP-SE-03` — مدیریت کلید: KMS، envelope encryption، چرخش

**چرا مهم است:** «توکن رمزنگاری‌شده ذخیره می‌شود» چندجا تکرار شده ولی هیچ طراحی برای کلید اصلی، چرخش و بازیابی پس از لو رفتن وجود ندارد.

**چه چیزی آن را می‌بندد:** docs/key-management.md + پیاده‌سازی envelope + runbook چرخش.

### `GAP-SE-04` — jobهای retention و حذف داده (GDPR-like)

**چرا مهم است:** docs/09-data-model.md جدول رفتار حذف را دارد ولی هیچ job، هیچ دوره نگهداری پیکربندی‌شده و هیچ گزارشی وجود ندارد.

**چه چیزی آن را می‌بندد:** retention policy per table + job زمان‌بندی‌شده + گزارش اجرای حذف.

### `GAP-SE-05` — تشخیص تزریق پرامپت (classifier، canary token)

**چرا مهم است:** دفاع فعلی سه لایه است (پرامپت، schema، policy) که همه واکنشی‌اند. هیچ تشخیص فعالی وجود ندارد و canary token که راه استاندارد اثبات نشت است اصلاً مطرح نشده.

**چه چیزی آن را می‌بندد:** canary در context + بررسی خروجی + رویداد security.injection_detected.

### `GAP-SE-06` — فیلتر خروجی: نشت secret یا داده tenant دیگر توسط مدل

**چرا مهم است:** redaction ورودی را پاک می‌کند ولی خروجی مدل را نه. مدل می‌تواند از حافظه آموزش یا از context آلوده چیزی تولید کند که نباید به کاربر برسد.

**چه چیزی آن را می‌بندد:** redactSecrets روی خروجی هم + تست + رویداد.

### `GAP-SE-09` — ضدسوءاستفاده (جلوگیری از ساخت malware، spam، scraping انبوه)

**چرا مهم است:** DENY_RULES چند مورد را می‌گیرد ولی هیچ طبقه‌بندی محتوای درخواست، هیچ سقف نرخ ساخت پروژه و هیچ بازبینی انسانی برای الگوهای مشکوک وجود ندارد.

**چه چیزی آن را می‌بندد:** سیاست استفاده قابل قبول + طبقه‌بند درخواست + rate limit ساخت Run.

### `GAP-SE-11` — M14 data governance و privacy lifecycle durable integration

**چرا مهم است:** M14 classification، consent، retention، export/delete و egress decision را به‌صورت deterministic دارد، اما storage encryption، legal hold، subject-rights workflow و deletion evidence واقعی وجود ندارد.

**چه چیزی آن را می‌بندد:** اتصال data governance به database/object storage، key management، audit، legal hold و export/delete دو-tenant با evidence قابل بازپخش.

### `GAP-SE-12` — M122 key rotation، privacy erasure، deletion proof و backup retention integration

**چرا مهم است:** M122 key/deletion/backup contracts identity، approval، legal hold و residual proof را enforce می‌کنند، اما KMS/HSM، erasure propagation، immutable ledger و backup purge/restore واقعی وصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال KMS/HSM با staged rotation/revoke، erasure worker برای همه replica/index/cache/backup، immutable signed proof و restore/purge drill با legal hold.

### `GAP-SE-17` — M159 data residency و regional routing integration

**چرا مهم است:** M159 residency policy، placement، cross-border transfer و deletion proof را fail-closed می‌کند، اما regional data plane، placement controller، jurisdiction registry، transfer gateway و replica deletion worker واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال region-aware storage/router، jurisdiction registry، encrypted transfer gateway، legal-basis review و replica deletion evidence.

### `GAP-SE-18` — M177 prompt cache integrity و privacy integration

**چرا مهم است:** M177 cache entry، tenant namespace، encryption، consent، expiry، poisoning scan و replica purge را validate می‌کند، اما cache backend، KMS/BYOK، invalidation bus، DLP و purge worker واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال tenant-scoped cache، KMS/BYOK adapter، invalidation، poisoning/DLP scan، retention و replica purge evidence.

### `GAP-SE-19` — M187 dependency risk و vulnerability response integration

**چرا مهم است:** M187 dependency digest/lock، license، advisory، fixed version، update test، rollback و bounded response را gate می‌کند، اما registry/SCA scanner، CVE feed، SBOM verifier، patch workflow و quarantine gate واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال package registry، SCA/license scanner، advisory feed، SBOM/provenance verifier، sandboxed patch workflow و quarantine/approval controller.

### `GAP-SE-21` — M196 plugin capability sandbox و extension certification integration

**چرا مهم است:** M196 plugin manifest، permissions، digest، signature، sandbox، no-network/no-secret، certification، behavior scan و revocation را gate می‌کند، اما marketplace registry، sandbox executor، scanner، publisher verifier و revoke propagation واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال extension registry، artifact/publisher verifier، sandbox executor، static/behavior scanner، permission broker و revoke propagation.

### `GAP-SE-22` — M205 capability attestation و trust-bound activation integration

**چرا مهم است:** M205 attestation، signature، artifact/environment match، permission scope، revocation و activation approval را gate می‌کند، اما attestation issuer، verifier، capability registry، activation gateway و revoke fan-out واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال attestation issuer/verifier، capability registry، artifact/environment probe، activation gateway و revocation propagation.

### `GAP-SE-23` — M208 policy change control و rollback integration

**چرا مهم است:** M208 policy diff، separation of duties، tests، canary، signed approval، expiry، propagation و rollback evidence را gate می‌کند، اما policy change registry، canary evaluator، signed promotion gateway، fleet distributor و rollback controller واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال policy change registry، diff/test evaluator، signed canary promotion gateway، target distributor، drift monitor و rollback controller.

### `GAP-SE-07` — Supply chain: تأیید lockfile و allowlist وابستگی per org

**چرا مهم است:** ایجنت باید لایسنس وابستگی را گزارش کند ولی هیچ مکانیزمی برای رد کردن یک وابستگی ممنوع وجود ندارد.

**چه چیزی آن را می‌بندد:** policy per org + gate در IMPLEMENT.

### `GAP-SE-08` — سیاست افشای آسیب‌پذیری، bug bounty و pen-test دوره‌ای

**چرا مهم است:** محصولی که کد کاربر را اجرا می‌کند بدون مسیر افشا، آسیب‌پذیری‌هایش در جای دیگری منتشر می‌شوند.

**چه چیزی آن را می‌بندد:** SECURITY.md + مسیر گزارش + SLA پاسخ.

## مشاهده‌پذیری و پایداری

| شناسه | شکاف | وضعیت | شدت | مایلستون |
|---|---|---|---|---|
| `GAP-OB-01` | کاتالوگ متریک، SLO و قواعد alert | 🔴 غایب | بالا | M4 |
| `GAP-OB-02` | ردیابی توزیع‌شده یک Run (span per agent call و tool call) | 🟡 ناقص | بالا | M4 |
| `GAP-OB-03` | Runbookها و پاسخ به حادثه | 🔴 غایب | بالا | M4 |
| `GAP-OB-05` | Backup/restore، DR، RTO و RPO | 📄 فقط سند | بالا | M7 |
| `GAP-PO-07` | M123 capacity، circuit breaker، bounded failure experiment و resilience alert integration | 🟡 ناقص | بالا | M123 |
| `GAP-AUD-01` | M124 durable audit ledger، evidence provenance و replay integration | 🟡 ناقص | بالا | M124 |
| `GAP-OB-07` | M128 usage ledger، quota scheduling و provider cost reconciliation integration | 🟡 ناقص | بالا | M128 |
| `GAP-OB-08` | M138 privacy-preserving telemetry و feedback integration | 🟡 ناقص | بالا | M138 |
| `GAP-OB-09` | M139 observability SLO، distributed trace و alert integration | 🟡 ناقص | بالا | M139 |
| `GAP-OB-10` | M163 FinOps budget guardrail و usage reconciliation integration | 🟡 ناقص | بالا | M163 |
| `GAP-OB-11` | M181 performance budget و load shedding integration | 🟡 ناقص | بالا | M181 |
| `GAP-OB-12` | M192 recovery، chaos و failover evidence integration | 🟡 ناقص | بالا | M192 |
| `GAP-OB-13` | M194 runtime evidence envelope و claim verification integration | 🟡 ناقص | بالا | M194 |
| `GAP-OB-14` | M203 privacy-preserving analytics و aggregation integration | 🟡 ناقص | بالا | M203 |
| `GAP-OB-04` | داشبورد مصرف و هزینه per org و per run | 🔴 غایب | متوسط | M4 |
| `GAP-OB-06` | تست تزریق خطا (chaos) | 🔴 غایب | پایین | POST |

### `GAP-OB-01` — کاتالوگ متریک، SLO و قواعد alert

**چرا مهم است:** OpenTelemetry و Prometheus نام برده شده ولی هیچ متریک، هیچ SLO و هیچ alert تعریف نشده. «مانیتورینگ داریم» بدون SLO معنا ندارد.

**چه چیزی آن را می‌بندد:** docs/slo.md + متریک‌های کلیدی + قواعد alert + داشبورد.

### `GAP-OB-02` — ردیابی توزیع‌شده یک Run (span per agent call و tool call)

**چرا مهم است:** رویدادها parentEventId دارند که نیمی از راه است، ولی هیچ span/context propagation برای مدل و ابزار وجود ندارد.

**چه چیزی آن را می‌بندد:** OTel instrumentation + traceId در ToolCall و SystemEvent.

### `GAP-OB-03` — Runbookها و پاسخ به حادثه

**چرا مهم است:** docs/03-architecture.md فایل incident-response.md و deployment-runbook.md را در ساختار آورده ولی نوشته نشده‌اند.

**چه چیزی آن را می‌بندد:** runbook per failure mode + escalation matrix.

### `GAP-OB-05` — Backup/restore، DR، RTO و RPO

**چرا مهم است:** در نقشه راه آمده ولی هیچ هدف RTO/RPO و هیچ روش restore تمرین‌شده وجود ندارد.

**چه چیزی آن را می‌بندد:** docs/dr.md + restore drill دوره‌ای.

### `GAP-PO-07` — M123 capacity، circuit breaker، bounded failure experiment و resilience alert integration

**چرا مهم است:** M123 ظرفیت، breaker state، sandbox failure experiment و actionable alert را تعریف می‌کند، اما telemetry، service-mesh breaker، autoscaler، chaos runner، alert routing و incident drill واقعی وجود ندارد.

**چه چیزی آن را می‌بندد:** اتصال workload/latency/error telemetry، breaker در runtime، sandboxed fault injection با rollback/no-data-loss، alert manager و postmortem evidence.

### `GAP-AUD-01` — M124 durable audit ledger، evidence provenance و replay integration

**چرا مهم است:** M124 audit chain، evidence bundle، replay و retention را به‌صورت deterministic validate می‌کند، اما WORM event store، signer/KMS، replay worker و retention provider واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال append-only/WORM ledger، signed evidence، tenant-bounded replay، legal hold و retention/purge scheduler با شواهد مستقل.

### `GAP-OB-07` — M128 usage ledger، quota scheduling و provider cost reconciliation integration

**چرا مهم است:** M128 usage، quota، allocation و reconciliation را قبل از اجرا gate می‌کند، اما durable usage store، provider quota probe، scheduler، billing adapter و cost dashboard واقعی وجود ندارد.

**چه چیزی آن را می‌بندد:** اتصال append-only ledger، provider quota/RPM probes، mode-safe scheduler، billing/reconciliation adapter و tenant-safe FinOps dashboard.

### `GAP-OB-08` — M138 privacy-preserving telemetry و feedback integration

**چرا مهم است:** M138 consent، local-only telemetry، PII redaction، feedback و retention را gate می‌کند، اما consent store/UI، telemetry SDK، DLP pipeline، analytics warehouse و deletion worker واقعی وجود ندارند.

**چه چیزی آن را می‌بندد:** اتصال consent lifecycle، SDK، DLP/redaction، privacy-aware warehouse، feedback moderation و downstream deletion با legal hold.

### `GAP-OB-09` — M139 observability SLO، distributed trace و alert integration

**چرا مهم است:** M139 SLO، error budget، span integrity، Run trace و critical alert action را deterministic می‌کند، اما collector/backend، trace propagation، metrics store، alert router و on-call واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال telemetry collector، distributed trace/metrics backend، SLO evaluator، dedupe alert route، dashboard و runbook evidence.

### `GAP-OB-10` — M163 FinOps budget guardrail و usage reconciliation integration

**چرا مهم است:** M163 budget، hard stop، reservation، usage reconciliation و circuit guardrail را gate می‌کند، اما durable usage ledger، provider receipts، cost catalog، scheduler، alerting و budget enforcement واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال append-only usage ledger، provider receipt adapter، cost catalog، atomic budget reservation، hard-stop gateway، alert و FinOps dashboard.

### `GAP-OB-11` — M181 performance budget و load shedding integration

**چرا مهم است:** M181 latency، queue، token، concurrency و error budget، admission، load evidence و explicit shedding را gate می‌کند، اما telemetry backend، budget ledger، scheduler، load runner و autoscaler واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال telemetry collector، budget ledger، admission gateway، scheduler/backpressure، load generator و alert/autoscale با provider fallback disclosure.

### `GAP-OB-12` — M192 recovery، chaos و failover evidence integration

**چرا مهم است:** M192 chaos plan، blast radius، sandbox، recovery RTO/RPO، checkpoint، failover fencing/quorum و restore proof را gate می‌کند، اما fault injector، failover coordinator، backup restore، fencing و incident evidence واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال chaos controller، fault injector، checkpoint/backup store، failover/fencing coordinator، restore/replay runner و recovery evidence pipeline.

### `GAP-OB-13` — M194 runtime evidence envelope و claim verification integration

**چرا مهم است:** M194 evidence envelope، claim، contradiction، freshness، signer، replay و disclosure را gate می‌کند، اما evidence ledger، signer/verifier، claim aggregator، replay runner و user evidence surface واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال evidence ledger، signing/verifier service، claim aggregator، replay/sandbox runner و redacted user-facing evidence surface.

### `GAP-OB-14` — M203 privacy-preserving analytics و aggregation integration

**چرا مهم است:** M203 analytics event، consent، sampling، privacy budget، redaction، aggregate noise، k-anonymity، export disclosure و deletion propagation را gate می‌کند، اما event collector، privacy budget ledger، aggregate engine، export gateway و derived-data deletion worker واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال privacy-safe collector، budget ledger، noisy aggregate engine، cohort gate، export/disclosure gateway و derived-data deletion propagation.

### `GAP-OB-04` — داشبورد مصرف و هزینه per org و per run

**چرا مهم است:** بدون آن کاربر نمی‌تواند بفهمد چرا سهمیه‌اش تمام شد و ما نمی‌توانیم گلوگاه هزینه را پیدا کنیم.

**چه چیزی آن را می‌بندد:** ledger + aggregation + UI.

### `GAP-OB-06` — تست تزریق خطا (chaos)

**چرا مهم است:** ادعای «resumable» فقط با کشتن عمدی worker در لحظه اشتباه اثبات می‌شود.

**چه چیزی آن را می‌بندد:** سناریوهای chaos + اجرای دوره‌ای.

## کیفیت و ارزیابی

| شناسه | شکاف | وضعیت | شدت | مایلستون |
|---|---|---|---|---|
| `GAP-QA-01` | پیاده‌سازی harness ارزیابی (runner، scorer، dataset، gate در CI) | 🔴 غایب | بلوکر | M2 |
| `GAP-QA-03` | تست E2E محصول (ثبت‌نام → اتصال → درخواست → Plan → تأیید → PR) | 🔴 غایب | بلوکر | M4 |
| `GAP-QA-10` | M153 product E2E orchestration و failure containment integration | 🟡 ناقص | بلوکر | M153 |
| `GAP-QA-02` | دروازه regression برای تغییر پرامپت و schema در CI | 🟡 ناقص | بالا | M2 |
| `GAP-QA-05` | تست دسترسی‌پذیری UI خود پلتفرم | 🔴 غایب | بالا | M4 |
| `GAP-QA-06` | M10 evaluator runner و quality gate production integration | 🟡 ناقص | بالا | M10 |
| `GAP-QA-07` | M120 verification matrix و CI/security/accessibility/load evidence integration | 🟡 ناقص | بالا | M120 |
| `GAP-QA-08` | M127 benchmark corpus، deterministic replay و release quality integration | 🟡 ناقص | بالا | M127 |
| `GAP-QA-09` | M148 E2E release acceptance و readiness integration | 🟡 ناقص | بالا | M148 |
| `GAP-QA-11` | M172 accessibility و localization verification integration | 🟡 ناقص | بالا | M172 |
| `GAP-QA-12` | M186 human feedback و preference governance integration | 🟡 ناقص | بالا | M186 |
| `GAP-QA-04` | تست بار (k6) و تست امنیت خودکار | 🔴 غایب | متوسط | M7 |

### `GAP-QA-01` — پیاده‌سازی harness ارزیابی (runner، scorer، dataset، gate در CI)

**چرا مهم است:** این همان GAP-IN-01 است از سمت کیفیت: ۱۲ سناریو تعریف شده، صفر خط کد. بدون آن هیچ تغییری در ۱۲۹۲ خط پرامپت قابل اعتماد نیست.

**چه چیزی آن را می‌بندد:** npm run eval + gate در CI + گزارش امتیاز هر ایجنت.

### `GAP-QA-03` — تست E2E محصول (ثبت‌نام → اتصال → درخواست → Plan → تأیید → PR)

**چرا مهم است:** هیچ تستی کل مسیر کاربر را نمی‌پیماید. ۱۹۲ تست فعلی همه واحد/قراردادی‌اند.

**چه چیزی آن را می‌بندد:** Playwright suite روی یک Run واقعی با GitHub mock.

### `GAP-QA-10` — M153 product E2E orchestration و failure containment integration

**چرا مهم است:** M153 E2E flow plan، deterministic step، cleanup، failure evidence و bounded retry را validate می‌کند، اما product E2E orchestrator، test data sandbox، browser/API runner، artifact collector و failure containment واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال scenario runner، isolated test tenant/data، browser/API E2E، evidence collector، secret purge، rollback و failure containment.

### `GAP-QA-02` — دروازه regression برای تغییر پرامپت و schema در CI

**چرا مهم است:** تست‌های ساختاری وجود دارند (front matter، include، schema) ولی هیچ تست رفتاری نیست. یک پرامپت می‌تواند از نظر ساختاری سالم و از نظر رفتار خراب باشد.

**چه چیزی آن را می‌بندد:** اتصال eval به CI + baseline امتیاز.

### `GAP-QA-05` — تست دسترسی‌پذیری UI خود پلتفرم

**چرا مهم است:** ایجنت موظف است WCAG 2.1 AA را در پروژه کاربر رعایت کند، ولی برای UI خودمان هیچ تستی وجود ندارد. این یک تناقض محصولی است.

**چه چیزی آن را می‌بندد:** axe-core روی همه صفحات + تست کیبورد + گزارش.

### `GAP-QA-06` — M10 evaluator runner و quality gate production integration

**چرا مهم است:** M10 scoring، invariant، regression، cost، latency و consensus contract دارد، اما evaluator runner، dataset versioning، model execution، CI gate و human review workflow وجود ندارد.

**چه چیزی آن را می‌بندد:** ساخت runner با dataset versioned، اجرای sandboxed، baseline/regression report، CI gate و مسیر human review با evidence قابل بازپخش.

### `GAP-QA-07` — M120 verification matrix و CI/security/accessibility/load evidence integration

**چرا مهم است:** M120 matrix و gateهای pipeline، security، accessibility و load را تعریف می‌کند، اما CI provider، scanner، browser/screen-reader، load runner و artifact store واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** ساخت reproducible CI lanes با revision/fixture/artifact/exit code، secret/security scan، accessibility browser evidence و bounded load telemetry.

### `GAP-QA-08` — M127 benchmark corpus، deterministic replay و release quality integration

**چرا مهم است:** M127 corpus provenance، replay، regression gate و release evidence را تعریف می‌کند، اما dataset registry، model runner، CI gate، browser/accessibility farm و human review واقعی وجود ندارد.

**چه چیزی آن را می‌بندد:** ساخت corpus registry و runner versioned، deterministic replay، regression/safety/latency CI gate و E2E release evidence با rollback.

### `GAP-QA-09` — M148 E2E release acceptance و readiness integration

**چرا مهم است:** M148 acceptance plan، deterministic gates، go/no-go و independent readiness review را gate می‌کند، اما product E2E، security/accessibility runners، release orchestrator، rollback evidence و support runbook واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال E2E product flow، security/accessibility/load matrix، release orchestrator، canary/rollback، readiness review و support evidence.

### `GAP-QA-11` — M172 accessibility و localization verification integration

**چرا مهم است:** M172 locale catalog، RTL، WCAG AA، keyboard/contrast/screen-reader evidence و fallback را validate می‌کند، اما translation pipeline، browser/a11y runner، screen-reader evidence store و CI gate واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال locale catalog pipeline، browser/axe/keyboard runner، screen-reader evidence، RTL visual checks و CI release gate.

### `GAP-QA-12` — M186 human feedback و preference governance integration

**چرا مهم است:** M186 consented feedback، rubric، privacy/bias review، bounded aggregate، no-direct-update، canary و rollback را gate می‌کند، اما feedback UI/store، evaluator، annotation service و preference update controller واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال feedback/annotation store، privacy/DLP و consent service، evaluator، bias review، model registry و canary/rollback controller.

### `GAP-QA-04` — تست بار (k6) و تست امنیت خودکار

**چرا مهم است:** ابزارها در docs/12-quality-and-dod.md نام برده شده ولی هیچ سناریویی نوشته نشده.

**چه چیزی آن را می‌بندد:** سناریوهای k6 + CI job اسکن امنیتی.

## رابط کاربری

| شناسه | شکاف | وضعیت | شدت | مایلستون |
|---|---|---|---|---|
| `GAP-UX-01` | خود رابط کاربری — هیچ صفحه و کامپوننتی وجود ندارد | 🟡 ناقص | بلوکر | M1 |
| `GAP-UX-02` | مشخصات صفحات (inventory، wireframe، حالت‌های empty/loading/error) | 🔴 غایب | بلوکر | M1 |
| `GAP-UX-04` | UI تصویب (approval) با نمایش ریسک، بازگشت‌پذیری و انقضا | 🟡 ناقص | بلوکر | M1 |
| `GAP-UX-05` | سیستم طراحی با RTL کامل، dark/light و توکن‌های رنگ | 🔴 غایب | بالا | M1 |
| `GAP-UX-03` | نمایشگر diff، ترمینال زنده، تسک‌بورد و timeline اجرا | 🔴 غایب | بالا | M4 |
| `GAP-UX-09` | M12 localization و accessibility production integration | 🟡 ناقص | بالا | M12 |
| `GAP-UX-10` | M143 operator console و live Run UX integration | 🟡 ناقص | بالا | M143 |
| `GAP-UX-11` | M171 offline sync و conflict resolution integration | 🟡 ناقص | بالا | M171 |
| `GAP-UX-07` | CLI اختصاصی (forge) | 🔴 غایب | متوسط | M5 |
| `GAP-UX-06` | PWA موبایل و Tauri دسکتاپ | 🔴 غایب | پایین | POST |
| `GAP-UX-08` | رفتار آفلاین و degraded | 🔴 غایب | پایین | POST |

### `GAP-UX-01` — خود رابط کاربری — هیچ صفحه و کامپوننتی وجود ندارد

**چرا مهم است:** apps/web در ساختار آمده ولی صفر فایل دارد. محصول بدون UI قابل استفاده نیست، حتی برای تست دستی.

**چه چیزی آن را می‌بندد:** apps/web با Next.js + احراز هویت + فهرست پروژه + صفحه Run.

### `GAP-UX-02` — مشخصات صفحات (inventory، wireframe، حالت‌های empty/loading/error)

**چرا مهم است:** docs/01-product-definition.md جریان کاربر را دارد ولی فهرست صفحات و حالت‌های هر صفحه را نه. بدون آن پیاده‌سازی UI سلیقه‌ای می‌شود.

**چه چیزی آن را می‌بندد:** docs/screen-inventory.md + wireframe هر صفحه + حالت‌های خطا.

### `GAP-UX-04` — UI تصویب (approval) با نمایش ریسک، بازگشت‌پذیری و انقضا

**چرا مهم است:** کل مدل امنیتی محصول روی approval انسانی سوار است و هیچ UI برای آن طراحی نشده. یک دکمه «تأیید» بدون زمینه، امنیت را به یک کلیک کور تبدیل می‌کند.

**چه چیزی آن را می‌بندد:** مشخصات کارت approval + نمایش diff/ریسک/انقضا + تأیید دومرحله‌ای برای کلاس D.

### `GAP-UX-05` — سیستم طراحی با RTL کامل، dark/light و توکن‌های رنگ

**چرا مهم است:** shadcn/ui و RTL ذکر شده ولی هیچ توکن، هیچ قاعده فاصله‌گذاری دوطرفه و هیچ الگوی کامپوننت تعریف نشده.

**چه چیزی آن را می‌بندد:** packages/ui + توکن‌ها + تست بصری RTL.

### `GAP-UX-03` — نمایشگر diff، ترمینال زنده، تسک‌بورد و timeline اجرا

**چرا مهم است:** این‌ها چهار کامپوننت پیچیده‌اند و هیچ مشخصاتی ندارند. diff viewer به‌تنهایی یک پروژه است.

**چه چیزی آن را می‌بندد:** مشخصات هر کامپوننت + انتخاب کتابخانه + پروتوتایپ.

### `GAP-UX-09` — M12 localization و accessibility production integration

**چرا مهم است:** M12 catalog، fallback، RTL/LTR، formatting و accessibility contract را تعریف می‌کند، اما UI واقعی، translation workflow، screen-reader audit و accessibility CI وجود ندارد.

**چه چیزی آن را می‌بندد:** اتصال catalog به UI، استخراج و review ترجمه، تست keyboard/screen reader/axe و CI برای هر صفحه و locale.

### `GAP-UX-10` — M143 operator console و live Run UX integration

**چرا مهم است:** M143 Run view، live event، safe action و RTL/accessibility evidence را validate می‌کند، اما Web UI، realtime gateway، RBAC/API، action executor و browser E2E واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** ساخت operator console با role/field allowlist، realtime replay، safe action API، approval/idempotency و accessibility E2E.

### `GAP-UX-11` — M171 offline sync و conflict resolution integration

**چرا مهم است:** M171 encrypted snapshot، device trust، sync cursor، conflict و no-clobber resolution را gate می‌کند، اما offline client، local store، sync transport، conflict UI و server merge worker واقعی وجود ندارند.

**چه چیزی آن را می‌بندد:** اتصال offline client/store، cursor sync، conflict API/UI، protected-target review و idempotent merge/abort worker.

### `GAP-UX-07` — CLI اختصاصی (forge)

**چرا مهم است:** برای توسعه‌دهندگان مهم‌ترین کلاینت است و هیچ طراحی ندارد.

**چه چیزی آن را می‌بندد:** طراحی دستورات + احراز هویت device flow + خروجی TTY.

### `GAP-UX-06` — PWA موبایل و Tauri دسکتاپ

**چرا مهم است:** در فاز ۲ و ۳ آمده؛ API-first بودن زیرساختش را فراهم می‌کند.

**چه چیزی آن را می‌بندد:** manifest PWA + skin دسکتاپ پس از پایدار شدن وب.

### `GAP-UX-08` — رفتار آفلاین و degraded

**چرا مهم است:** در حالت لوکال، قطع بودن شبکه یک حالت عادی است نه استثناء.

**چه چیزی آن را می‌بندد:** قواعد cache + پیام‌های وضعیت.

## API و قراردادها

| شناسه | شکاف | وضعیت | شدت | مایلستون |
|---|---|---|---|---|
| `GAP-API-01` | فایل OpenAPI | 🟡 ناقص | بلوکر | M1 |
| `GAP-API-02` | پیاده‌سازی endpointها (apps/api) | 🟡 ناقص | بلوکر | M1 |
| `GAP-API-05` | ساختار tRPC router و مرز آن با REST عمومی | 🔴 غایب | بالا | M1 |
| `GAP-API-07` | Rate limiting پیاده‌سازی‌شده (هدرها، bucket، per user/org) | 🟡 ناقص | بالا | M1 |
| `GAP-API-04` | پروتکل reconnect با Last-Event-ID برای SSE | 🟡 ناقص | بالا | M4 |
| `GAP-API-08` | M121 SDK/API compatibility، safe CLI و config bootstrap integration | 🟡 ناقص | بالا | M121 |
| `GAP-API-09` | M129 API evolution، schema migration و stream reconnect integration | 🟡 ناقص | بالا | M129 |
| `GAP-API-10` | M144 public API surface و OpenAPI compatibility integration | 🟡 ناقص | بالا | M144 |
| `GAP-API-11` | M188 schema evolution و consumer compatibility integration | 🟡 ناقص | بالا | M188 |
| `GAP-API-03` | کاتالوگ کد خطا | 🟡 ناقص | متوسط | M1 |
| `GAP-API-06` | سیاست نسخه‌بندی و deprecation | 🟡 ناقص | پایین | M2 |

### `GAP-API-01` — فایل OpenAPI

**چرا مهم است:** openapi.yaml اکنون قرارداد برش مرجع health و Run را دارد، اما تمام endpointهای طراحی‌شده، generated client و تطبیق کامل با implementation هنوز وجود ندارد.

**چه چیزی آن را می‌بندد:** openapi.yaml کامل + تولید client + تست تطبیق با پیاده‌سازی.

### `GAP-API-02` — پیاده‌سازی endpointها (apps/api)

**چرا مهم است:** apps/api/server.ts اکنون HTTP reference slice دارد و src/core/session-auth.ts Bearer authenticator قابل تزریق فراهم می‌کند، اما اتصال OAuth/OIDC واقعی، persistence، تمام endpointها و production validation هنوز کامل نیست.

**چه چیزی آن را می‌بندد:** apps/api + middleware احراز هویت + اعتبارسنجی zod + تست.

### `GAP-API-05` — ساختار tRPC router و مرز آن با REST عمومی

**چرا مهم است:** تصمیم «tRPC داخلی + REST عمومی» گرفته شده ولی هیچ قاعده‌ای برای اینکه کدام عملیات کجا باشد وجود ندارد. بدون قاعده، دو برابر کار می‌شود.

**چه چیزی آن را می‌بندد:** ADR مرز + ساختار router + مثال.

### `GAP-API-07` — Rate limiting پیاده‌سازی‌شده (هدرها، bucket، per user/org)

**چرا مهم است:** rate limiting با token bucket و هدرهای استاندارد در reference API پیاده شده است، اما store پایدار، quota per user و policy کامل سازمانی هنوز باقی است.

**چه چیزی آن را می‌بندد:** middleware + bucket per user/org + هدرهای استاندارد + تست.

### `GAP-API-04` — پروتکل reconnect با Last-Event-ID برای SSE

**چرا مهم است:** docs/10-api-and-events.md می‌گوید «با replay از lastEventId وضعیت برمی‌گردد» ولی هیچ پروتکلی برای آن تعریف نشده.

**چه چیزی آن را می‌بندد:** قرارداد heartbeat + resume + تست قطع اتصال.

### `GAP-API-08` — M121 SDK/API compatibility، safe CLI و config bootstrap integration

**چرا مهم است:** M121 versioning، safe CLI، workspace path، config no-clobber و developer handoff را deterministic می‌کند، اما SDK generator/registry، sandbox shell، secret manager و config persistence واقعی وجود ندارد.

**چه چیزی آن را می‌بندد:** اتصال schema compatibility به generated SDK و registry، اجرای CLI در sandbox، config store با BYOK reference و handoff verification؛ raw secret هرگز ذخیره نشود.

### `GAP-API-09` — M129 API evolution، schema migration و stream reconnect integration

**چرا مهم است:** M129 versioned API، error envelope، stream resume و migration gate را deterministic می‌کند، اما schema registry، consumer contract CI، SSE broker/replay store و migration runner واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال schema registry و diff، consumer compatibility CI، durable stream cursor/replay و migration automation با rollback و deprecation evidence.

### `GAP-API-10` — M144 public API surface و OpenAPI compatibility integration

**چرا مهم است:** M144 OpenAPI document، endpoint contract، compatibility diff و request admission را validate می‌کند، اما gateway، OpenAPI publication، consumer CI، authz middleware و rate-limit runtime واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال OpenAPI registry/gateway، generated consumer compatibility، authz/rate limiter، idempotency store و public error catalog.

### `GAP-API-11` — M188 schema evolution و consumer compatibility integration

**چرا مهم است:** M188 versioned schema، compatibility، expand-contract migration، backfill، consumer contract/replay proof و bounded cutover را gate می‌کند، اما schema registry، migration runner، consumer CI و rollback controller واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال schema registry، migration/backfill runner، consumer contract CI، API/stream gateway، compatibility checker و rollback controller.

### `GAP-API-03` — کاتالوگ کد خطا

**چرا مهم است:** docs/10-api-and-events.md یک نمونه RFC 7807 نشان می‌دهد ولی فهرست کامل کدها و معنی هرکدام وجود ندارد.

**چه چیزی آن را می‌بندد:** error-codes.md + enum مشترک + تست.

### `GAP-API-06` — سیاست نسخه‌بندی و deprecation

**چرا مهم است:** «شکستن قرارداد یعنی /v2» گفته شده ولی هیچ فرایند deprecation، هدر warning یا پنجره پشتیبانی تعریف نشده.

**چه چیزی آن را می‌بندد:** docs/api-versioning.md + هدر Sunset.

## داده و ذخیره‌سازی

| شناسه | شکاف | وضعیت | شدت | مایلستون |
|---|---|---|---|---|
| `GAP-DA-01` | migrationهای واقعی Prisma | 🟡 ناقص | بلوکر | M1 |
| `GAP-DA-07` | M119 durable tenant transaction، RLS evidence و transactional outbox integration | 🟡 ناقص | بلوکر | M119 |
| `GAP-DA-02` | اعتبارسنجی schema با Prisma CLI | 🟡 ناقص | بالا | M1 |
| `GAP-DA-08` | M134 data portability و controlled import integration | 🟡 ناقص | بالا | M134 |
| `GAP-DA-09` | M140 full-text search و query governance integration | 🟡 ناقص | بالا | M140 |
| `GAP-DA-10` | M150 database migration و schema governance integration | 🟡 ناقص | بالا | M150 |
| `GAP-DA-11` | M162 data rights، export و deletion orchestration integration | 🟡 ناقص | بالا | M162 |
| `GAP-DA-12` | M191 retention، legal hold و secure erasure integration | 🟡 ناقص | بالا | M191 |
| `GAP-DA-13` | M206 region-bound processing و residency enforcement integration | 🟡 ناقص | بالا | M206 |
| `GAP-DA-03` | seed و fixture برای توسعه | 🔴 غایب | متوسط | M1 |
| `GAP-DA-06` | soft delete و ممیزی حذف | 🟡 ناقص | متوسط | M3 |
| `GAP-DA-04` | انبار رویداد برای analytics | 🔴 غایب | پایین | POST |
| `GAP-DA-05` | جست‌وجوی full-text روی پروژه و Run | 🔴 غایب | پایین | POST |

### `GAP-DA-01` — migrationهای واقعی Prisma

**چرا مهم است:** prisma/schema.prisma و دو migration واقعی برای DDL و RLS اکنون وجود دارند؛ اجرای آن‌ها روی PostgreSQL و CI migration gate هنوز باید در محیط durable تأیید شود.

**چه چیزی آن را می‌بندد:** prisma migrate dev + commit migrationها + CI check.

### `GAP-DA-07` — M119 durable tenant transaction، RLS evidence و transactional outbox integration

**چرا مهم است:** M119 kernel قرارداد transaction، RLS denial، migration safety و outbox را validate می‌کند، اما PostgreSQL transaction/RLS، migration runner، durable outbox worker و دو-tenant integration هنوز اجرا نشده‌اند.

**چه چیزی آن را می‌بندد:** اتصال tenant context به PostgreSQL transaction و RLS policy، اجرای migration dry-run/rollback، transactional outbox worker و replayable cross-tenant evidence.

### `GAP-DA-02` — اعتبارسنجی schema با Prisma CLI

**چرا مهم است:** prisma validate در این محیط اجرا نشد (binaries.prisma.sh در دسترس نیست)؛ صحت دستوری اسکیم ماشین‌بررسی نشده. test/data-model.test.ts فقط قواعد طراحی را می‌سنجد.

**چه چیزی آن را می‌بندد:** اجرای npm run prisma:validate در CI روی ماشین با دسترسی شبکه.

### `GAP-DA-08` — M134 data portability و controlled import integration

**چرا مهم است:** M134 export manifest، redaction، tenant boundary و import dry-run را deterministic می‌کند، اما object store، KMS، schema migration worker، conflict resolver و rollback واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال encrypted export store، schema registry، cross-tenant import worker، idempotency، conflict review و rollback evidence.

### `GAP-DA-09` — M140 full-text search و query governance integration

**چرا مهم است:** M140 index snapshot، ACL query، bounded result، freshness و export audit را gate می‌کند، اما indexer، search backend، ranking، ACL service، pagination/cache و search UI واقعی وجود ندارد.

**چه چیزی آن را می‌بندد:** اتصال indexer و snapshot، ACL-aware search backend، ranking/freshness، bounded pagination، export approval و query audit.

### `GAP-DA-10` — M150 database migration و schema governance integration

**چرا مهم است:** M150 expand/contract plan، schema change، migration run، rollback و RLS check را gate می‌کند، اما migration runner، schema lock، Prisma/database CI، backfill monitor و rollback واقعی وجود ندارد.

**چه چیزی آن را می‌بندد:** اتصال migration registry/runner، expand-contract validator، lock/transaction، backfill telemetry، RLS probe و rollback automation.

### `GAP-DA-11` — M162 data rights، export و deletion orchestration integration

**چرا مهم است:** M162 verified rights request، encrypted export، legal hold، replica enumeration و residual proof را validate می‌کند، اما DSAR intake، export store، deletion orchestrator، index/cache propagation و legal-hold service واقعی وجود ندارند.

**چه چیزی آن را می‌بندد:** اتصال rights intake/identity proof، encrypted export store، deletion workflow، replica/index/cache sweep، legal hold و residual verification.

### `GAP-DA-12` — M191 retention، legal hold و secure erasure integration

**چرا مهم است:** M191 retention، encryption، consent، deletion، replica/backup scope، legal hold و purge verification را gate می‌کند، اما retention registry، erasure orchestrator، backup catalog، KMS و residual scanner واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال policy registry، DB/object-store eraser، replica/backup sweep، legal workflow، KMS و residual verification با idempotent evidence.

### `GAP-DA-13` — M206 region-bound processing و residency enforcement integration

**چرا مهم است:** M206 processing region، provider declaration، allowed placement، cross-region transfer، encryption، minimization و regional deletion را gate می‌کند، اما region-aware router، provider location verifier، transfer consent service و multi-region erasure worker واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال regional router، provider location verifier، transfer/consent gateway، encrypted region stores و multi-region erasure worker.

### `GAP-DA-03` — seed و fixture برای توسعه

**چرا مهم است:** بدون seed، هر توسعه‌دهنده باید دستی داده بسازد و سناریوهای approval قابل تست نیستند.

**چه چیزی آن را می‌بندد:** prisma/seed.ts + fixture per سناریو.

### `GAP-DA-06` — soft delete و ممیزی حذف

**چرا مهم است:** docs/09-data-model.md می‌گوید AuditLog حذف‌ناپذیر است ولی خود جداول onDelete: Cascade دارند؛ یعنی حذف یک سازمان شواهد اجرای او را هم می‌برد.

**چه چیزی آن را می‌بندد:** soft delete + clobber policy + تست.

### `GAP-DA-04` — انبار رویداد برای analytics

**چرا مهم است:** SystemEvent برای UI کافی است ولی برای تحلیل محصول به انبار ستونی نیاز است.

**چه چیزی آن را می‌بندد:** sync به ClickHouse/BigQuery.

### `GAP-DA-05` — جست‌وجوی full-text روی پروژه و Run

**چرا مهم است:** با رشد داده، LIKE کافی نیست.

**چه چیزی آن را می‌بندد:** tsvector یا Meilisearch.

## عملیات خود پلتفرم

| شناسه | شکاف | وضعیت | شدت | مایلستون |
|---|---|---|---|---|
| `GAP-PO-02` | CI خود مخزن (typecheck، test، lint) | 🔴 غایب | بلوکر | M1 |
| `GAP-PO-05` | lint و formatter پیکربندی‌شده (eslint، prettier) | 🔴 غایب | بالا | M1 |
| `GAP-PO-01` | docker-compose برای self-host | 🔴 غایب | بالا | M4 |
| `GAP-PO-08` | M133 self-host upgrade، backup restore و controlled cutover integration | 🟡 ناقص | بالا | M133 |
| `GAP-PO-09` | M137 incident case، bounded containment و postmortem integration | 🟡 ناقص | بالا | M137 |
| `GAP-PO-11` | M167 reproducible build و release manifest integration | 🟡 ناقص | بالا | M167 |
| `GAP-PO-12` | M173 incident learning و runbook automation integration | 🟡 ناقص | بالا | M173 |
| `GAP-PO-13` | M178 deployment adapter و release target boundary integration | 🟡 ناقص | بالا | M178 |
| `GAP-PO-14` | M179 pull-request quality و commit provenance integration | 🟡 ناقص | بالا | M179 |
| `GAP-PO-15` | M189 release provenance و promotion evidence integration | 🟡 ناقص | بالا | M189 |
| `GAP-PO-06` | CHANGELOG و نسخه‌بندی انتشار | 🔴 غایب | متوسط | M4 |
| `GAP-PO-03` | Helm chart و manifests Kubernetes | 🔴 غایب | متوسط | M7 |
| `GAP-PO-04` | نسخه Enterprise/self-hosted و مسیر ارتقا | 🔴 غایب | متوسط | POST |

### `GAP-PO-02` — CI خود مخزن (typecheck، test، lint)

**چرا مهم است:** پوشه .github/workflows وجود ندارد. ۱۹۲ تست فقط محلی اجرا می‌شوند؛ هیچ دروازه‌ای روی merge نیست. محصولی که برای کاربر CI می‌سازد خودش CI ندارد.

**چه چیزی آن را می‌بندد:** GitHub Actions با typecheck + test + prisma validate + eval.

### `GAP-PO-05` — lint و formatter پیکربندی‌شده (eslint، prettier)

**چرا مهم است:** packages/config در ساختار آمده ولی هیچ پیکربندی وجود ندارد. ایجنت موظف است lint پروژه کاربر را اجرا کند؛ خودمان lint نداریم.

**چه چیزی آن را می‌بندد:** eslint.config + prettier + script + gate در CI.

### `GAP-PO-01` — docker-compose برای self-host

**چرا مهم است:** حالت Local-first ادعای اصلی محصول است ولی هیچ راهی برای بالا آوردن کل پشته با یک دستور وجود ندارد.

**چه چیزی آن را می‌بندد:** docker-compose.yml + .env.example + docs self-host.

### `GAP-PO-08` — M133 self-host upgrade، backup restore و controlled cutover integration

**چرا مهم است:** M133 release، backup/restore، canary/cutover و resilience drill را طراحی می‌کند، اما installer/controller، object store، traffic switch، restore automation و chaos runner واقعی وجود ندارد.

**چه چیزی آن را می‌بندد:** اتصال self-host package/controller، encrypted backup object store، isolated restore، canary traffic switch، rollback و bounded incident drill با approval.

### `GAP-PO-09` — M137 incident case، bounded containment و postmortem integration

**چرا مهم است:** M137 signal، case، containment و postmortem evidence را validate می‌کند، اما alert adapter، durable case store، on-call routing، containment controller و incident drill واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال alert normalization/dedupe، case management، on-call escalation، reversible containment، evidence timeline و postmortem workflow.

### `GAP-PO-11` — M167 reproducible build و release manifest integration

**چرا مهم است:** M167 reproducible build، lockfile/toolchain، SBOM، provenance، scan، rollback و promotion را validate می‌کند، اما isolated builder، registry admission، attestation verifier، release controller و canary evidence واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال hermetic builder، signed registry، SBOM/provenance verifier، vulnerability/license scan، release controller و canary/rollback gate.

### `GAP-PO-12` — M173 incident learning و runbook automation integration

**چرا مهم است:** M173 incident signal، case، containment runbook، approval و regression learning را gate می‌کند، اما alert/case store، on-call router، runbook executor، postmortem workflow و learning-to-CI اتصال واقعی ندارند.

**چه چیزی آن را می‌بندد:** اتصال signal/case store، on-call escalation، reversible runbook executor، postmortem workflow و corrective-action/regression CI integration.

### `GAP-PO-13` — M178 deployment adapter و release target boundary integration

**چرا مهم است:** M178 deployment plan، target policy، preflight، idempotency، smoke evidence و bounded rollback را gate می‌کند، اما target registry، adapter gateway، artifact verifier، smoke runner و rollback controller واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال target/adapter registry، artifact admission، egress/secret boundary، deployment controller، smoke evidence و approved rollback.

### `GAP-PO-14` — M179 pull-request quality و commit provenance integration

**چرا مهم است:** M179 commit provenance، PR summary، test evidence و risk evidence، merge approval و changelog را gate می‌کند، اما Git provider، reviewer service، secret scanner، CI checks و merge controller واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال Git provider، code-owner/reviewer، secret scanner، CI check registry، protected merge controller و evidence-based release notes.

### `GAP-PO-15` — M189 release provenance و promotion evidence integration

**چرا مهم است:** M189 release manifest، artifact/source/build hash، SBOM، attestation، promotion، canary و rollback را gate می‌کند، اما hermetic builder، registry، signer، verifier، canary controller و rollback runner واقعی متصل نیستند.

**چه چیزی آن را می‌بندد:** اتصال artifact registry، reproducible builder، SBOM/provenance verifier، signing service، canary promotion و rollback controller با evidence قابل replay.

### `GAP-PO-06` — CHANGELOG و نسخه‌بندی انتشار

**چرا مهم است:** نسخه پرامپت‌ها ثبت می‌شود ولی نسخه محصول نه. بازتولید یک Run قدیمی بدون نسخه محصول کامل نیست.

**چه چیزی آن را می‌بندد:** CHANGELOG + semantic release + ثبت نسخه در AuditLog.

### `GAP-PO-03` — Helm chart و manifests Kubernetes

**چرا مهم است:** infrastructure/k8s در ساختار آمده ولی خالی است.

**چه چیزی آن را می‌بندد:** chart + values per محیط.

### `GAP-PO-04` — نسخه Enterprise/self-hosted و مسیر ارتقا

**چرا مهم است:** در فاز ۳ آمده؛ بدون مسیر ارتقا، self-hosterها در نسخه قدیمی گیر می‌کنند.

**چه چیزی آن را می‌بندد:** سیاست نسخه + migration خودکار + entitlement.

## حقوقی و کسب‌وکار

| شناسه | شکاف | وضعیت | شدت | مایلستون |
|---|---|---|---|---|
| `GAP-LG-02` | ماتریس انطباق ToS هر ارائه‌دهنده مدل و سرویس | 🟡 ناقص | بالا | M1 |
| `GAP-LG-05` | تصمیم نهایی درباره Redis و Vault (لایسنس) و جایگزین‌ها | 📄 فقط سند | بالا | M1 |
| `GAP-LG-01` | پیش‌نویس ToS و Privacy Policy | 📄 فقط سند | بالا | POST |
| `GAP-LG-04` | مالکیت خروجی، آموزش روی داده کاربر و سلب مسئولیت | 📄 فقط سند | بالا | POST |
| `GAP-LG-03` | مدل قیمت‌گذاری دقیق | 🟡 ناقص | متوسط | POST |

### `GAP-LG-02` — ماتریس انطباق ToS هر ارائه‌دهنده مدل و سرویس

**چرا مهم است:** ساختار ProviderTos (commercialUseAllowed / trainingOnInput / requiresAttribution / reviewedOn / source) کنار هر endpoint تعریف شد و مسیریابی بر اساس آن رد می‌کند؛ staleTosReviews مرورهای قدیمی‌تر از ۹۰ روز را علامت می‌زند. باقی‌مانده: پر کردن ماتریس با ارائه‌دهندگان واقعی.

**چه چیزی آن را می‌بندد:** provider-compliance.md با ستون‌های استفاده تجاری، داده، سهمیه، تاریخ بررسی.

### `GAP-LG-05` — تصمیم نهایی درباره Redis و Vault (لایسنس) و جایگزین‌ها

**چرا مهم است:** docs/14-licensing-and-legal.md ریسک را شناسایی کرده و Valkey/OpenBao را پیشنهاد داده، ولی تصمیم گرفته نشده. انتخاب دیرهنگام یعنی بازنویسی لایه cache و secret.

**چه چیزی آن را می‌بندد:** ADR با تصمیم نهایی + به‌روزرسانی پشته.

### `GAP-LG-01` — پیش‌نویس ToS و Privacy Policy

**چرا مهم است:** docs/14-licensing-and-legal.md فهرست آنچه لازم است را می‌دهد ولی هیچ پیش‌نویسی وجود ندارد.

**چه چیزی آن را می‌بندد:** پیش‌نویس + بازبینی وکیل.

### `GAP-LG-04` — مالکیت خروجی، آموزش روی داده کاربر و سلب مسئولیت

**چرا مهم است:** docs/14-licensing-and-legal.md چهار سؤال را مطرح می‌کند و به هیچ‌کدام پاسخ نداده. این‌ها قبل از اولین کاربر خارجی باید جواب داشته باشند.

**چه چیزی آن را می‌بندد:** تصمیم‌های صریح + بازتاب در ToS و در تنظیمات پیش‌فرض.

### `GAP-LG-03` — مدل قیمت‌گذاری دقیق

**چرا مهم است:** docs/13-roadmap-and-cost.md چهار گزینه را نام می‌برد ولی هیچ کدام انتخاب و قیمت‌گذاری نشده.

**چه چیزی آن را می‌بندد:** تصمیم + plan matrix + واحد محاسبه.

<!-- GAPS:END -->
