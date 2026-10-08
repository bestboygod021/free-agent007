# کانکتورها و احراز هویت

## ترتیب اولویت اتصال

```
OAuth 2.1 + PKCE  >  Official API Token  >  GitHub App  >  MCP Connector  >  Browser با حضور انسان
```

پلتفرم **هرگز** رمز عبور خام کاربر را دریافت نمی‌کند. این یک `deny` سخت در
`DENY_RULES` است.

## جریان OAuth

```
کاربر روی Connect کلیک می‌کند
  → سیستم state و PKCE verifier/challenge تولید می‌کند
  → کاربر به صفحه رسمی Provider می‌رود
  → Provider مجوزها را نمایش می‌دهد
  → کاربر تأیید می‌کند
  → authorization code به backend برمی‌گردد
  → state و PKCE اعتبارسنجی می‌شوند
  → توکن دریافت و رمزنگاری‌شده در vault ذخیره می‌شود
  → فقط scopeهای اعلام‌شده فعال می‌شوند
  → رویداد connector.connected با فهرست scope ثبت می‌شود
```

## چرا GitHub App

| معیار | GitHub App | OAuth App / PAT |
|---|---|---|
| دامنه دسترسی | per-repository installation | کل حساب کاربر |
| عمر توکن | کوتاه‌مدت (installation token) | طولانی یا دائمی |
| دقت مجوز | fine-grained | coarse |
| قابلیت لغو | نصب قابل حذف در هر repo | همه‌یا-هیچ |
| نرخ درخواست | بالاتر برای App | پایین‌تر |

## Manifest کانکتور

`schema/connector-manifest.schema.json` — نمونه: `examples/connector-manifest.github.json`

```jsonc
{
  "id": "github",
  "name": "GitHub",
  "version": "1.0.0",
  "category": "git",
  "auth": {
    "type": "github_app",
    "scopes": ["repository:read", "repository:write", "pull_request:write"],
    "requiresPkce": true,
    "tokenTtlSeconds": 3600
  },
  "capabilities": ["repository.read_file", "branch.create", "commit.create",
                   "pull_request.create", "workflow.read_logs"],
  "riskLevel": "medium",
  "supportsMcp": true,
  "commercialLicense": "MIT",
  "rateLimits": { "rpm": 0, "rpd": 5000, "documentedAt": "2026-09-01" },
  "dataResidency": ["us"]
}
```

`commercialLicense` و `rateLimits.documentedAt` اجباری‌اند. بدون آن‌ها یک
کانکتور ثبت نمی‌شود — چون «رایگان بودن» و «پایدار بودن سهمیه» هر دو باید
مستند باشند، نه فرض.

## سطح‌بندی دسترسی

| کلاس | نام | نمونه | رفتار |
|---|---|---|---|
| A | Read Only | خواندن repo، issue، مستندات | آزاد |
| B | Workspace Write | نوشتن فایل در sandbox، branch، commit | بر اساس Autonomy Level |
| C | External Write | Pull Request، issue، پیام، preview | **همیشه** با تأیید |
| D | High Risk | deploy، تغییر secret، حذف، Production، پرداخت | **همیشه** با تأیید صریح انسانی |

پیاده‌سازی: `AUTONOMY_CEILING` در `src/core/policy-engine.ts`.

## Autonomy Level

| سطح | سقف side effect بدون تأیید |
|---|---|
| `readonly` | هیچ (فقط خواندن) |
| `supervised` | `local_write` |
| `autonomous-branch` | `external_write` |
| `full` | `external_write` — کلاس D **همیشه** تأیید می‌خواهد |

نکته مهم: حتی در سطح `full`، عملیات destructive / billing / credential /
production نیاز به تأیید دارند. «full» به معنی «بدون انسان» نیست.

## سه دروازه Policy Engine

```
G1 HARD DENY   → آیا این کار هرگز مجاز نیست؟
G2 SCOPE       → آیا کانکتور این scope را واقعاً دارد؟
G3 APPROVAL    → ریسک × autonomy = نیاز به تأیید؟
```

علاوه بر این‌ها، نوشتن روی شاخه محافظت‌شده (`main`، `production`) در هر سطحی رد
می‌شود، حتی با همه scopeها.

## فهرست deny سخت

`*.captcha.solve`، `*.mfa.bypass`، `*.credential.read_raw`، `host.exec`،
`sandbox.docker_socket`، `*.account.bulk_create`، `*.ratelimit.bypass`

این قواعد در زمان اجرا قابل حذف نیستند: حتی اگر یک کانکتور قاعده‌ای بازکننده برای
`host.exec` ثبت کند، `DENY_RULES` اول بررسی می‌شود. این در تست اثبات شده است.

## سایت‌های بدون API

```
۱. یک مرورگر کنترل‌شده در دامنه allowlist باز می‌شود
۲. کاربر خودش login، CAPTCHA و MFA را انجام می‌دهد
۳. session به‌صورت امن، رمزنگاری‌شده و با عمر محدود ذخیره می‌شود
۴. ایجنت فقط فرم‌های غیرحساس را پر می‌کند
۵. هر اقدام در audit log ثبت و در UI قابل مشاهده و توقف است
۶. در هر چالش امنیتی، ایجنت متوقف و از انسان کمک می‌خواهد
```

## صفحه مدیریت اتصال

برای هر اتصال باید نمایش داده شود:

- کاربرد و اینکه کدام ایجنت از آن استفاده می‌کند
- scopeهای فعال
- تاریخ انقضا
- آخرین استفاده
- لاگ عملیات
- سطح ریسک
- دکمه لغو دسترسی (که توکن را همان لحظه باطل می‌کند)

## Idempotency

هر Tool Call با side effect یک `Idempotency-Key` می‌گیرد که از
`runId + taskId + tool + inputHash` ساخته می‌شود. این از تکرار PR، تکرار پیام و
پرداخت دوباره در اثر retry جلوگیری می‌کند.
