# مسیریابی مدل

پیاده‌سازی: `src/core/model-router.ts` — تست: `test/model-router.test.ts`

## چرا Router و نه اتصال مستقیم

ایجنت نباید بداند با کدام مدل حرف می‌زند. او **کار** را توصیف می‌کند؛ Router
تصمیم می‌گیرد آن کار از نظر سیاست، محرمانگی، قابلیت، سهمیه و هزینه کجا می‌تواند
اجرا شود. این سه چیز را ممکن می‌کند:

1. تعویض ارائه‌دهنده بدون تغییر یک خط از پرامپت
2. نگه‌داشتن کد خصوصی روی مدل محلی به‌صورت پیش‌فرض
3. پاسخ به سؤال «چرا متوقف شدیم؟» با عدد، نه با ۴۲۹ از سمت فروشنده

## ورودی

```json
{
  "taskType": "code_generation",
  "privacyLevel": "private",
  "requiresToolCalling": true,
  "requiresStructuredOutput": true,
  "contextTokens": 24000,
  "maxCost": 0,
  "maxLatencyMs": 30000
}
```

## ترتیب فیلتر

هر مرحله دلیل رد را ثبت می‌کند تا UI بتواند «چرا Groq نه؟» را نشان دهد.
**دروازه صفر، حالت محاسباتی است** که کاربر انتخاب کرده
([`docs/15-compute-modes.md`](./15-compute-modes.md)):

| # | فیلتر | دلیل رد نمونه |
|---|---|---|
| 0 | حالت محاسباتی (کلاس ارائه‌دهنده، سقف هزینه حالت، آموزش روی ورودی) | `mode "local" does not allow free cloud tiers` |
| 1 | `enabled` | `provider disabled` |
| 2 | سقف محرمانگی | `privacy ceiling internal < requested private` |
| 3 | `mayTrainOnInput` برای private/confidential | `provider may train on inputs; blocked for private/confidential workspaces` |
| 4 | tool calling | `no tool calling support` |
| 5 | structured output | `no structured output support` |
| 6 | context window | `context window 32000 < required 500000` |
| 7 | سقف هزینه | `cost 5 > budget 0` |
| 8 | سقف تأخیر | `latency 4200ms > budget 3000ms` |
| 9 | رتبه‌بندی (ترجیح محل حالت، هزینه، سپس تأخیر) | — |

برای کار حساس، یک امتیاز منفی به مدل محلی داده می‌شود تا همیشه اولویت پیدا کند.
جدول مسیریابی هر حالت (`ModeProfile.routing`) هم یک ترجیح محل برای هر نوع کار
اعمال می‌کند.

## فراخوانی استاندارد ایجنت‌ها

ایجنت‌ها مستقیم `routeModel` صدا نمی‌زنند؛ از `routeForTask` استفاده می‌کنند که
نوع کار را در جدول حالت lookup می‌کند:

```ts
routeForTask({
  taskType: "code_generation",
  mode: "local",                 // همان چیزی که کاربر انتخاب کرده
  providers,
  privacyLevel: "private",
});
```

یعنی عوض شدن حالت، محدودیت‌های **همه** ایجنت‌های pipeline را یک‌جا عوض می‌کند
بدون اینکه هیچ‌کدام بدانند کدام حالت فعال است.

## رفتار اثبات‌شده در تست

با این پنج ارائه‌دهنده:

| provider | locality | maxPrivacy | mayTrain | cost | enabled |
|---|---|---|---|---|---|
| ollama/local-coder | local | confidential | false | 0 | ✅ |
| groq/fast-coder | cloud | internal | false | 0 | ✅ |
| freecloud/train-on-input | cloud | confidential | **true** | 0 | ✅ |
| paid/premium-coder | cloud | confidential | false | 5 | ✅ |
| disabled/whatever | cloud | confidential | false | 0 | ❌ |

- درخواست `private` + `maxCost: 0` → **ollama** انتخاب می‌شود؛ groq به‌دلیل سقف
  محرمانگی، freecloud به‌دلیل آموزش روی ورودی، paid به‌دلیل هزینه و disabled
  به‌دلیل غیرفعال بودن رد می‌شوند.
- همان درخواست با `internal` → **groq** (ارزان‌ترین و سریع‌ترین).
- `contextTokens: 500000` → `primary: null` و پیام «هیچ مدلی با این سیاست پیدا
  نشد» به همراه فهرست کامل دلایل رد.

## حسابداری سهمیه

```ts
const { decision, state } = tryConsumeQuota(quota, { rpm: 30, rpd: 14400 });
// decision: { ok: false, reason: "rpm", retryAfterHint: "minute" }
```

پنجره دقیقه و روز بر اساس زمان حال بازنشانی می‌شوند. وقتی سهمیه روز تمام شود،
Router به fallback می‌رود؛ اگر fallback محلی وجود نداشته باشد، Run با رویداد
`quota.exhausted` متوقف می‌شود و کاربر دقیقاً می‌فهمد چه چیزی تمام شده است.

## نمایش اجباری به کاربر

برای هر ارائه‌دهنده ابری، UI باید این‌ها را نشان دهد:

- سقف مصرف فعلی و باقی‌مانده (RPM / RPD)
- سیاست استفاده از داده و اینکه آیا روی ورودی آموزش می‌دهد
- لایسنس مدل
- منطقه پردازش داده
- امکان بررسی انسانی داده توسط ارائه‌دهنده
- وضعیت فعلی ارائه‌دهنده (سالم / degrade / قطع)

## سه حالت کلید

| حالت | توضیح | چه کسی هزینه می‌دهد |
|---|---|---|
| Local | Ollama روی ماشین کاربر | صفر API؛ سخت‌افزار کاربر |
| BYOK | کاربر کلید ارائه‌دهنده خودش را وارد می‌کند | کاربر |
| Platform Key | پلتفرم کلید خودش را مدیریت می‌کند | پلتفرم (نیاز به مدل درآمدی) |

در BYOK: کلید رمزنگاری شده ذخیره می‌شود، هرگز به frontend برنمی‌گردد، در لاگ
ثبت نمی‌شود، دکمه «آزمایش اتصال» دارد، قابل حذف و چرخش است و scope آن محدود
می‌شود.

## نگاشت نوع کار به مدل

| taskType | پیشنهاد |
|---|---|
| intake، clarification، summarization | مدل سبک و سریع |
| specification، planning | مدل قوی با structured output |
| code_generation، code_edit | مدل کدنویسی با tool calling |
| code_review، security_review | مدل قوی، ترجیحاً متفاوت از نویسنده |
| repair | همان مدل نویسنده، با temperature پایین |
| embedding | مدل embedding محلی |

## سیاست Workspace

هر Workspace یک policy دارد:

```yaml
privacy:
  defaultLevel: private
  allowCloudEgress: false
  allowProvidersThatTrain: false
  requireConsentPerRun: true
models:
  allowedProviders: [ollama, groq]
  localFirst: true
  maxCostPerRun: 0
  hardStopTokens: 3000000
quota:
  perUserPerDay: 500000
  perRunTokens: 2000000
```
