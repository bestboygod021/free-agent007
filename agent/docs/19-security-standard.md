# استاندارد امنیتی پلتفرم

منبع حقیقت اجرایی: `src/core/security-baseline.ts` · ثبت تهدیدها: `THREAT_REGISTER`
تست: `test/security-baseline.test.ts`

## اصل حاکم

> امنیت یک سند نیست؛ مجموعه‌ای از تصمیم‌هایی است که سیستم **نمی‌تواند** اشتباه
> بگیرد، حتی وقتی فراخوان تلاش کند.

هر کنترل در این سند سه چیز دارد: تهدید، کنترل، و **تابعی که اثبات می‌کند کنترل
کار می‌کنند**. کنترلی که تست نداشته باشد یک آرزوست.

## مدل تهدید (STRIDE)

دامنه: خود پلتفرم — نه پروژه‌ای که تولید می‌کند.

### S — جعل هویت (Spoofing)

| تهدید | کنترل | اجرا توسط |
|---|---|---|
| سرقت یا بازپخش نشست پس از خروج | کوکی `HttpOnly` + `Secure` + `SameSite=Strict`، TTL مطلق، timeout بیکاری، فهرست لغو | `checkSession`، `SESSION_COOKIE_FLAGS` |
| Credential stuffing روی لاگین | شمارنده شکست per شناسه با قفل‌شدن؛ حداقل ۵ تلاش / ۱۵ دقیقه | `recordLoginFailure`، `isLockedOut` |
| تصویب بدون حضور کاربر | پنجره تازگی MFA برای هر مجوز کلاس تصویب | `authorize`، `validateApproval` |

### T — دستکاری (Tampering)

| تهدید | کنترل | اجرا توسط |
|---|---|---|
| ویرایش یا حذف لاگ ممیزی پس از حادثه | لاگ **زنجیره‌هش‌شده** و append-only؛ اعتبارسنجی در اولین ورودی دستکاری‌شده شکست می‌خورد | `appendAudit`، `verifyAuditChain` |
| وب‌هوک جعلی یا بازپخشی | HMAC-SHA256 روی `timestamp.body`، مقایسه زمان‌ثابت، کرانه انحراف ۳۰۰ ثانیه | `verifyWebhook` |
| استفاده مجدد از کلید idempotency با بدنه متفاوت | هش درخواست به کلید گره خورده؛ ناسازگاری ۴۰۹ است، **نه اجرای دوم** | `checkIdempotency` |

### R — انکار (Repudiation)

| تهدید | کنترل | اجرا توسط |
|---|---|---|
| انکار انجام یک عمل مخرب | هر تصمیم با بازیگر، نقش، نتیجه، دلیل و **هش تنظیمات مؤثر** ثبت می‌شود تا قابل بازپخش باشد | `appendAudit` + `hashSettings` |

### I — افشای اطلاعات (Information Disclosure)

| تهدید | کنترل | اجرا توسط |
|---|---|---|
| نشت secret به پرامپت یا لاگ | redaction پیش از خروج، دیوار egress، تنظیم block-on-unredacted | `redactSecrets`، `evaluateEgress` |
| خواندن داده tenant دیگر با شناسه حدسی | `organizationId` روی هر دسترسی سطر asserted می‌شود؛ RLS خط دوم | `assertSameOrganization` |
| ذخیره رمز خام سرویس سوم | **هیچ فیلدی نمی‌تواند یکی را نگه دارد**؛ اسکن بدنه نام فیلد را outright رد می‌کند | `findRawCredentials` |

### D — محروم‌سازی از سرویس (Denial of Service)

| تهدید | کنترل | اجرا توسط |
|---|---|---|
| حلقه ایجنت که لایه رایگان یا بودجه را می‌بلعد | سطل توکن per بازیگر، سهمیه آگاه از توکن، توقف سخت توکن | `consumeRate`، `tryAcquire` |
| موازی‌سازی بی‌کران که استخر worker را می‌خورد | سقف `maxParallelTasks` که یک پروژه **نمی‌تواند بالا ببرد** | `resolveSettings`، `checkRunAgainstSettings` |

### E — ارتقای دسترسی (Elevation of Privilege)

| تهدید | کنترل | اجرا توسط |
|---|---|---|
| ایجنت خودش را به نوشتن branch محافظت‌شده یا deploy ارتقا می‌دهد | نقش `agent` فقط `run.create` دارد؛ ref محافظت‌شده hard-deny؛ deploy نیاز به تصویب | `PERMISSIONS`، `evaluateToolCall` |
| شل کردن تنظیمات پروژه برای دور زدن سیاست سازمان | **تنظیمات ایمنی monotonic**: دامنه پایین‌تر فقط سخت‌تر می‌کند | `resolveSettings` + `MONOTONIC_RULES` |
| CSRF روی endpoint حالت‌تغییردهنده | `SameSite=Strict` به‌علاوه توکن double-submit با مقایسه زمان‌ثابت | `verifyCsrf` |

## ماتریس مجوزها

| مجوز | owner | admin | developer | viewer | agent |
|---|---|---|---|---|---|
| `run.create` | ✅ | ✅ | ✅ | — | ✅ |
| `run.cancel` | ✅ | ✅ | ✅ | — | — |
| `approval.grant` | ✅ | ✅ | ✅ | — | — |
| `deploy.approve` | ✅ | ✅ | ✅ | — | — |
| `settings.write.project` | ✅ | ✅ | ✅ | — | — |
| `settings.write.org` | ✅ | ✅ | — | — | — |
| `connector.add` | ✅ | ✅ | ✅ | — | — |
| `connector.remove` | ✅ | ✅ | — | — | — |
| `secret.read` | ✅ | — | — | — | — |
| `member.invite` / `member.remove` | ✅ | ✅ | — | — | — |
| `audit.read` | ✅ | ✅ | ✅ | ✅ | — |
| `org.delete` | ✅ | — | — | — | — |

`agent` عمداً تقریباً هیچ چیز ندارد. ایجنت یک service principal است که **از طرف
یک کاربر** داخل یک Run عمل می‌کند و هر اقدام حساس همچنان تصویب همان کاربر را
می‌خواهد.

## چهار قاعده‌ای که قابل مذاکره نیستند

۱. **ایجنت نمی‌تواند کار خودش را تصویب کند.** `validateApproval` هم
`approvedByAgent` و هم یکی بودن تصویب‌کننده با درخواست‌کننده را رد می‌کند.

۲. **هیچ رمز خامی ذخیره نمی‌شود.** `FORBIDDEN_CREDENTIAL_FIELDS` در اسکن بدنه
رد می‌شود و `connectors.allowRawPasswordAuth` در هیچ دامنه‌ای نمی‌تواند `true`
شود — حتی دامنه platform.

۳. **لاگ ممیزی حذف‌شدنی نیست.** `retention.allowAuditLogDeletion` همیشه `false`
است و `auditLogRetentionDays` کمتر از ۹۰ روز رد می‌شود، چون با کمتر از آن هیچ
حادثه‌ای قابل بازسازی نیست.

۴. **تنظیمات ایمنی فقط سخت‌تر می‌شوند.** ۱۶ قاعده monotonic در
`MONOTONIC_RULES`. یک پروژه نمی‌تواند سقف خودمختاری را بالا ببرد، MFA را خاموش
کند، توقف سخت توکن را بالا ببرد، یا PKCE را بردارد. تلاش **رد می‌شود با دلیل**،
نه اینکه بی‌صدا clamp شود.

## هدرهای انتقال

`SECURITY_HEADERS` روی هر پاسخ اعمال می‌شود:

| هدر | مقدار |
|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `Content-Security-Policy` | `default-src 'self'`، بدون inline script، `frame-ancestors 'none'` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | geolocation/microphone/camera/payment خاموش |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cache-Control` | `no-store` |

CSP عمداً `script-src 'self'` است؛ به همین دلیل playground کد inline ندارد و
`/app.js` جدا سرو می‌شود.

## آنچه هنوز باز است

این استاندارد **کنترل‌ها را enforceable کرده**، ولی سه چیز همچنان در رجیستر
شکاف‌ها باز است و باید صادقانه بماند:

| شکاف | وضعیت |
|---|---|
| `GAP-SE-10` RLS واقعی در SQL برای همه جداول tenant-scoped | باز — `assertSameOrganization` خط اول است، نه جایگزین RLS |
| `GAP-SE-02` تست نفوذ cross-tenant روی endpointهای واقعی | باز — تا `apps/api` ساخته شود چیزی برای کوبیدن نیست |
| `GAP-SE-03` KMS و رمزنگاری پاکتی با چرخش کلید | partial — `SecretReference` قرارداد را دارد، vault adapter نه |

`THREAT_REGISTER` در کد است تا هر تهدید جدید با کنترل و تستش اضافه شود، نه در
یک سند که از کد جدا می‌افتد.
