# حالت‌های محاسباتی: رایگان، پولی، لوکال

پیاده‌سازی: `src/core/compute-mode.ts` — پل پرامپت: `src/core/prompt-vars.ts` —
تست: `test/compute-mode.test.ts`

## اصل طراحی

کاربر **یک** چیز را انتخاب می‌کند؛ سیستم **همه‌چیز** را از روی آن
استخراج می‌کند. هیچ لایه‌ای اجازه ندارد حالت را حدس بزند یا از یک مقدار پیش‌فرض پنهان
استفاده کند — همه از یک `ModeProfile` حل‌شده می‌خوانند.

```
کاربر حالت را انتخاب می‌کند
        ↓
resolveMode(mode)  →  ModeProfile
        ↓
   ┌────┴─────────────────────────────────────────────┐
   ↓            ↓            ↓            ↓           ↓
Router      Policy        Budget      Execution    Prompts
(کی؟)    (خروج داده؟)   (چقدر؟)     (چطور؟)     (به ایجنت چه بگوییم؟)
```

## جدول مقایسه سه حالت

| | رایگان `free` | پولی `paid` | لوکال `local` |
|---|---|---|---|
| مدل محلی | ✅ | ✅ (fallback) | ✅ تنها گزینه |
| ابر رایگان | ✅ | ✅ | ❌ |
| ابر پولی | ❌ | ✅ | ❌ |
| سقف هزینه نسبی | `0` | `1000` | `0` |
| هزینه هر Run | `0` | تا سقف کاربر | `0` |
| سقف محرمانگی ابری | `internal` | `confidential` | — (ابر ندارد) |
| ترتیب fallback | cloud_free → local | cloud_paid → cloud_free → local | local |
| بودجه توکن هر Run | ۴۰۰٬۰۰۰ | ۴٬۰۰۰٬۰۰۰ | ۲٬۰۰۰٬۰۰۰ |
| توقف سخت | ۶۰۰٬۰۰۰ | ۸٬۰۰۰٬۰۰۰ | ۳٬۰۰۰٬۰۰۰ |
| تلاش تعمیر | ۲ | ۳ | ۳ |
| تسک موازی | ۲ | ۴ | ۱ |
| timeout سندباکس | ۶۰۰ ثانیه | ۱۸۰۰ ثانیه | ۳۶۰۰ ثانیه |
| دروازه‌های کیفیت | ۶ (بدون e2e و a11y) | ۹ (کامل) | ۸ (بدون dependency-scan) |
| Browser Automation | ❌ | ✅ | ✅ |
| Preview | ✅ | ✅ | ✅ |
| قابلیت‌های غیرفعال | paid_models، browser_automation، parallel_4x | هیچ | cloud_inference، managed_embedding، hosted_preview_cdn |

## چرا این تفاوت‌ها منطقی‌اند، نه سلیقه‌ای

**رایگان → تعمیر کمتر و موازی‌سازی کمتر.** هر فراخوانی مدل سهمیه مصرف می‌کند.
حلقه تعمیر ۳ بار و ۴ ایجنت موازی یعنی چهار برابر مصرف روی سهمیه‌ای که مال ما
نیست. کاهش به ۲ و ۲ یک تصمیم مهندسی است، نه تنبیه کاربر.

**رایگان → بدون `test:e2e`.** تست E2E خودش فراخوانی مدل برای تشخیص و تعمیر
خطا دارد. در حالت رایگان این یعنی سوزاندن سهمیه روی زیرساخت تست به‌جای خود
محصول. دروازه‌های اصلی (lint، typecheck، build، unit، secret-scan،
dependency-scan) حفظ می‌شوند؛ هیچ‌وقت security gate حذف نمی‌شود.

**لوکال → موازی‌سازی ۱.** یک دستگاه، یک GPU. اجرای ۴ ایجنت موازی فقط باعث
thrash می‌شود و همه را کندتر می‌کند.

**لوکال → timeout بیشتر.** استنتاج محلی کندتر است؛ کشتن job در ۶۰۰ ثانیه یعنی
کار هرگز تمام نمی‌شود.

**لوکال → بدون `dependency-scan`.** این دروازه به شبکه نیاز دارد و در حالت لوکال
شبکه خاموش است. به‌جای حذف ساکت، در `disabledCapabilities` و در پرامپت اعلام
می‌شود.

## جدول مسیریابی هر نوع کار

`ModeProfile.routing` برای هر ۱۳ نوع کار یک قاعده دارد. شکل کار با حالت عوض
نمی‌شود — فقط بودجه، تحمل تأخیر و محل ترجیحی اجرا.

| taskType | ابزار | خروجی ساختاریافته | context | تأخیر (free / paid / local) |
|---|---|---|---|---|
| intake | ❌ | ✅ | 8k | ۶۰s / ۲۰s / ۱۸۰s |
| clarification | ❌ | ✅ | 8k | ۶۰s / ۲۰s / ۱۸۰s |
| specification | ❌ | ✅ | 24k | ۶۰s / ۲۰s / ۱۸۰s |
| planning | ✅ | ✅ | 32k | ۶۰s / ۲۰s / ۱۸۰s |
| code_generation | ✅ | ✅ | 32k | ۶۰s / ۲۰s / ۱۸۰s |
| code_edit | ✅ | ✅ | 24k | ۶۰s / ۲۰s / ۱۸۰s |
| code_review | ❌ | ✅ | 32k | ۶۰s / ۲۰s / ۱۸۰s |
| test_generation | ✅ | ✅ | 24k | ۶۰s / ۲۰s / ۱۸۰s |
| repair | ✅ | ✅ | 24k | ۶۰s / ۲۰s / ۱۸۰s |
| security_review | ❌ | ✅ | 32k | ۶۰s / ۲۰s / ۱۸۰s |
| documentation | ❌ | ❌ | 16k | ۶۰s / ۲۰s / ۱۸۰s |
| summarization | ❌ | ❌ | 16k | ۶۰s / ۲۰s / ۱۸۰s |
| embedding | ❌ | ❌ | 8k | همیشه local |

**embedding همیشه لوکال است، در هر سه حالت.** تعداد فراخوانی‌اش زیاد است،
ارزانش کردنش ساده است، و فرستادن کد خصوصی به یک سرویس embedding ابری هیچ
توجیهی ندارد.

## شش لایه‌ای که با سوییچ عوض می‌شوند

### ۱. Router — چه کسی جواب می‌دهد

`modeAllowsProvider` به‌عنوان **دروازه صفر** اجرا می‌شود، قبل از هر فیلتر دیگر.
ارائه‌دهنده‌ای که حالت اجازه نمی‌دهد اصلاً کاندید نیست، مهما قیمت و قابلیتش.

ترتیب دروازه‌ها:

```
۰. حالت محاسباتی      (compute-mode)
   ├─mayTrainOnInput   ← اول، چون در همه حالت‌ها مطلق است
   ├─ کلاس ارائه‌دهنده (local / cloud_free / cloud_paid)
   └─ سقف هزینه حالت
۱. enabled
۲. سقف محرمانگی خود ارائه‌دهنده + آموزش روی ورودی
۳. سقف محرمانگی ابریِ حالت
۴. قابلیت‌ها (tool calling / structured output)
۵. پنجره context
۶. سقف هزینه
۷. سقف تأخیر
۸. رتبه‌بندی (ترجیح محل حالت، سپس هزینه، سپس تأخیر)
```

نمونه رفتاری که در تست اثبات شده (`test/compute-mode.test.ts`) با پنج
ارائه‌دهنده `ollama` (local)، `groq` (cloud free، سقف internal)، `trainfree`
(cloud free، آموزش روی ورودی)، `freeconf` (cloud free، سقف confidential) و
`openai` (cloud paid):

| درخواست | free | paid | local |
|---|---|---|---|
| `code_generation` + `internal` | groq | groq (با openai در fallback) | ollama |
| `code_generation` + `private` | ollama — groq به‌خاطر سقف خودش، `freeconf` به‌خاطر **سقف حالت** رد می‌شوند | openai در fallback | ollama |
| فقط ارائه‌دهنده ابری موجود است | groq | openai | `primary: null` + دلیل کامل |

نکته مهم در ردیف دوم: `freeconf` ادعای سقف `confidential` دارد و روی ورودی هم
آموزش نمی‌دهد؛ تنها چیزی که جلوی آن را می‌گیرد **حالت رایگان** است. این یعنی
سقف حالت یک کنترل واقعی است، نه یک برچسب.

### ۲. Policy Engine — آیا داده از دستگاه خارج می‌شود

`evaluateEgress` یک پارامتر `computeMode` گرفت. در حالت `local` هر خروج به ابر
**رد مطلق** است — حتی با رضایت کاربر:

```
local mode: cloud egress forbidden
```

رضایت کاربر نمی‌تواند چیزی را مجاز کند که حالت ممنوع کرده؛ این همان تفکیک
«اطلاعات در برابر مجوز» است.

### ۳. بودجه — چقدر مصرف مجاز است

`perRunTokens`، `hardStopTokens` و `maxCostPerRun` از پروفیل می‌آیند. کاربر
می‌تواند سقف خودش را **پایین‌تر** بیاورد، هرگز بالاتر:

```ts
resolveMode("free", { maxCostPerRun: 50 }).budget.maxCostPerRun; // 0
resolveMode("paid", { maxCostPerRun: 3 }).budget.maxCostPerRun;  // 3
```

### ۴. Execution — چطور اجرا می‌شود

`maxRepairAttempts` به `AgentRun.maxRepairAttempts` می‌رسد و ماشین حالت همان
عدد را اعمال می‌کند. `maxParallelTasks` به زمان‌بند موج‌ها می‌رسد.
`qualityGates` به `definitionOfDone` تسک‌ها تزریق می‌شود. `sandboxTimeoutSeconds`
به runtime سندباکس.

### ۵. پرامپت‌ها — به ایجنت چه می‌گوییم

قطعه `prompts/fragments/compute-mode.md` با `{{var:...}}` رندر می‌شود و **در هر
۱۳ ایجنت** include شده است. `promptVarsForMode(mode)` مقادیر را از همان پروفیل
حل‌شده می‌سازد:

```ts
const vars = promptVarsForMode("local", { privacyLevel: "confidential" });
const prompt = composePrompt("05-coding-agent.md", vars);
```

تست `reconfigures every agent at once when the mode changes` خروجی رندرشده هر ۱۳
ایجنت را در سه حالت با هم مقایسه می‌کند و assert می‌کند **همه ۱۳ تای آن‌ها در هر
جفت حالت متفاوت‌اند**. یعنی سوییچ واقعاً سرتاسری است، نه اینکه فقط orchestrator
عوض شود و بقیه با تنظیمات قبلی کار کنند.

یک متغیر ناشناخته یا حل‌نشده **خطا** می‌دهد، نه رشته خالی. پرامپتی که بودجه‌اش
را ساکت از دست بدهد بدتر از پرامپتی است که ساخته نمی‌شود.

### ۶. UI — چه چیزی نشان داده می‌شود

`describeModeFa(profile)` یک پاراگراف فارسی می‌سازد با بودجه، حد تعمیر،
موازی‌سازی، دروازه‌ها و قابلیت‌های غیرفعال. `warningsFa` هشدارهای خاص هر حالت
است که قبل از شروع Run نمایش داده می‌شود.

## بررسی پیش از شروع

`validateModeSelection` قبل از شروع Run اجرا می‌شود تا کاربر در لحظه انتخاب
بفهمد، نه ده دقیقه بعد:

| انتخاب | نتیجه |
|---|---|
| `local` بدون مدل محلی در دسترس | رد + پیشنهاد `paid` یا `free` |
| `paid` بدون BYOK و بدون اعتبار | رد + پیشنهاد `local` یا `free` |
| `free` با `confidential` و بدون مدل محلی | رد — غیرقابل اجرا |
| `free` با `confidential` و مدل محلی موجود | مجاز + هشدار «بخش‌های حساس فقط محلی» |

خروجی `{ ok, problems, effectiveMode, warningsFa }` است؛ `effectiveMode` همان
چیزی است که واقعاً اجرا می‌شود و در UI نشان داده می‌شود.

## ذخیره‌سازی

`organizations.compute_mode` مقدار پیش‌فرض Workspace است.
`agent_runs.compute_mode` **عکس لحظه شروع Run** است به‌همراه `mode_profile_hash`.

چرا snapshot؟ چون اگر کاربر وسط اجرا تنظیمات Workspace را عوض کند، یک Run در
جریان نباید ساکت بازپیکربندی شود. تغییر حالت یعنی Run جدید.

## API

```http
POST /v1/projects/:projectId/runs
```

```json
{
  "request": "…",
  "computeMode": "local",
  "privacyLevel": "confidential",
  "autonomyLevel": "supervised",
  "budget": { "maxCostPerRun": 0 },
  "modelPreferences": { "localModel": "qwen2.5-coder:14b" }
}
```

`computeMode` **اجباری** است. `schema/run-request.schema.json` نبود آن یا مقدار
خارج از سه گزینه را رد می‌کند و سه نمونه معتبر در `examples/run-request.*.json`
وجود دارد.

## قواعد تغییر حالت

| قاعده | دلیل |
|---|---|
| Run در جریان با تغییر Workspace بازپیکربندی نمی‌شود | قابلیت بازتولید و Audit |
| کاهش سقف همیشه مجاز، افزایش هرگز | کاربر نمی‌تواند از سیاست حالت فرار کند |
| حالت لوکال با رضایت هم ابری نمی‌شود | تعهد محصول به کاربر |
| `security-scan` در هیچ حالتی حذف نمی‌شود | امنیت قابل معامله با قیمت نیست |
| قابلیت حذف‌شده ساکت حذف نمی‌شود | در `disabledCapabilities` و در پرامپت اعلام می‌شود |
| اگر حالت کار را غیرممکن کرد، ایجنت باید بگوید کدام حالت ممکنش می‌کند | نه کاهش ساکت کیفیت |
