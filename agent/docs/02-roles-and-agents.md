# تیم و ایجنت‌ها

«تیم» در این محصول یک استعاره معماری است: مجموعه‌ای از نقش‌های منطقی با ورودی،
خروجی، مجوز و پرامپت مشخص. هر نقش یک فایل در `prompts/` و یک قرارداد در `schema/`
دارد.

## اصل تفکیک

یک ایجنت در هر فراخوانی **یک تسک** می‌گیرد. نه بیشتر. این ساده‌ترین و مؤثرترین
راه برای جلوگیری از دو شکست رایج است: از دست دادن context و ادعای موفقیت بی‌شواهد.

## جدول نقش‌ها

| # | ایجنت | فایل پرامپت | ورودی | خروجی | مجوز |
|---|---|---|---|---|---|
| ۰ | Orchestrator | `00-orchestrator.md` | درخواست کاربر + وضعیت Run | `OrchestratorOutput` + `proposedEvent` | پیشنهاد Tool Call |
| ۱ | Product Analyst | `01-product-analyst.md` | درخواست خام | `ProductSpec` | هیچ |
| ۲ | Requirements Clarifier | `02-requirements-clarifier.md` | spec اولیه + تاریخچه | حداکثر ۷ سؤال | هیچ |
| ۳ | Solution Architect | `03-solution-architect.md` | `ProductSpec` تأییدشده | `ProjectPlan` + Task DAG | هیچ |
| ۴ | Repository Analyst | `04-repo-analyst.md` | دسترسی خواندن مخزن | نقشه مخزن + قراردادها | کلاس A فقط |
| ۵ | Coding Agent | `05-coding-agent.md` | یک `AgentTask` | `CompletionReport` + diff | کلاس B |
| ۶ | QA & Accessibility | `06-qa-accessibility.md` | diff + spec | `QaReport` | کلاس B |
| ۷ | Security Reviewer | `07-security-reviewer.md` | diff + infra | `SecurityFinding[]` | کلاس A |
| ۸ | DevOps | `08-devops-deploy.md` | کد + محیط | image، preview، deploy | کلاس C/D با تأیید |
| ۹ | Browser Automation | `09-browser-automation.md` | دامنه allowlist + مجوز | گزارش اقدام + screenshot | کلاس C با تأیید |
| ۱۰ | Documentation | `10-documentation.md` | diff + گزارش‌ها | README، runbook، delivery report | کلاس B |
| ۱۱ | Code Reviewer | `11-code-reviewer.md` | diff | approve / request changes | کلاس A |
| ۱۲ | Repair | `12-repair.md` | خطای reproduce شده | `CompletionReport` یا `repair_exhausted` | کلاس B |

## قاعده تفکیک وظایف

ایجنتی که کد نوشته **نمی‌تواند** همان کد را review کند یا امنیت آن را تأیید کند.
این در سطح Orchestrator اعمال می‌شود: `assignedAgent` برای author و reviewer باید
متفاوت باشد و در Audit Log ثبت می‌شود.

## قطعه‌های مشترک

به‌جای تکرار قوانین در هر پرامپت، پنج قطعه مشترک وجود دارد که در زمان compose
تزریق می‌شوند:

| قطعه | چه کسی شامل می‌شود |
|---|---|
| `invariants.md` | همه — بدون استثنا |
| `untrusted-content.md` | همه — بدون استثنا |
| `evidence-rule.md` | هر ایجنتی که می‌تواند ادعای تکمیل کند |
| `tool-call-protocol.md` | هر ایجنتی که می‌تواند ابزار صدا بزند |
| `persian-voice.md` | همه |

`test/prompt-library.test.ts` این قوانین را mechanically بررسی می‌کند؛ اگر کسی
`invariants.md` را از یک ایجنت حذف کند، تست می‌شکند.

## چه چیزی ایجنت نیست

- **Policy Engine** ایجنت نیست. کد است.
- **State Machine** ایجنت نیست. کد است.
- **Model Router** ایجنت نیست. کد است.
- **Secret Redaction** ایجنت نیست. کد است.

این تفکیک مهم‌ترین تصمیم معماری محصول است: هر جا «باید» وجود دارد، کد است؛ هر جا
«قضاوت» وجود دارد، مدل.

## مقیاس‌پذیری تیم

در MVP لازم نیست هر نقش یک مدل جدا یا یک سرویس جدا داشته باشد. همه نقش‌ها
فراخوانی‌های متفاوتی از یک runtime با پرامپت‌های متفاوت‌اند. تفکیک فیزیکی زمانی
لازم می‌شود که:

- یک نقش به context window بزرگ‌تری نیاز داشته باشد
- یک نقش نیاز به مدل تخصصی (مثلاً مدل review امنیتی) داشته باشد
- صف یک نقش گلوگاه شود
