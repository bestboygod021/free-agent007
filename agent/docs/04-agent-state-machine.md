# ماشین حالت اجرا

پیاده‌سازی: `src/core/state-machine.ts` — تست: `test/state-machine.test.ts`

## چرا ماشین حالت در کد است

اگر مدل تصمیم بگیرد قدم بعدی چیست، سه اتفاق می‌افتد: حلقه بی‌نهایت، پرش از
مرحله امنیتی، و ادعای تکمیل بدون شواهد. ماشین حالت قطعی هر سه را غیرممکن می‌کند:
مدل یک `proposedEvent` پیشنهاد می‌دهد و کد تصمیم می‌گیرد قانونی است یا نه.

## نمودار

```
                    ┌──────────► CLARIFY ──┐
                    │                      │
INTAKE ─────────────┤                      ▼
                    │                   SPECIFY
                    │                      │ spec_ready
                    │                      ▼
                    └──────────────────► PLAN ◄────────┐
                                           │ plan_ready │ plan_rejected
                                           ▼            │
                                 AWAITING_PLAN_APPROVAL ┘
                                           │ plan_approved
                                           ▼
                                         RECON
                                           │ recon_complete
                                           ▼
                    ┌────────────────► IMPLEMENT
                    │                      │ implementation_batch_done
                    │                      ▼
                    │                    TEST ──tests_passed──► SECURITY_REVIEW
                    │                      │ tests_failed          │
                    │                      ▼                       │ security_clear
                    │                   REPAIR                     ▼
                    │                      │                    PREVIEW
                    │  repair_succeeded    │ repair_exhausted     │ preview_ready
                    └──────────────────────┘        │             ▼
                                                    ▼   AWAITING_DEPLOY_APPROVAL
                                                 BLOCKED         │        │
                                                        ▲        │        │ deploy_rejected
                                                        │        ▼        ▼
                                       security_blocked │     DEPLOY   FINALIZE
                                                        │        │        │
                                                        └── deploy_verified ──► VERIFY ──► DONE

  هر state غیرپایانی می‌تواند: fail → FAILED | cancel → CANCELLED | block → BLOCKED
```

## شش invariant

| # | invariant | نحوه اثبات در تست |
|---|---|---|
| I1 | بدون Plan تأییدشده هیچ کدی نوشته نمی‌شود | `transition(RECON, implementation_batch_done)` با `planApproved=false` رد می‌شود |
| I2 | بدون تأیید صریح، deploy انجام نمی‌شود | `transition(PREVIEW, deploy_approved)` رد می‌شود |
| I3 | بدون عبور از VERIFY به DONE نمی‌رسیم | `transition(IMPLEMENT, finalized)` و `transition(VERIFY, finalized)` با `verifyPassed=false` رد می‌شوند |
| I4 | حلقه تعمیر کراندار است (پیش‌فرض ۳) | سه بار `tests_failed` پذیرفته و بار چهارم با «repair budget exhausted» رد می‌شود |
| I5 | بازبینی امنیتی قابل پرش نیست | `preview_ready` قبل از `securityGatePassed` رد می‌شود |
| I6 | حالت‌های پایانی هیچ رویدادی نمی‌پذیرند | هر سه حالت پایانی با `fail` رد می‌شوند |

## جدول انتقال

| State | رویدادهای مجاز |
|---|---|
| INTAKE | needs_clarification، spec_ready، plan_ready |
| CLARIFY | clarification_answered، spec_ready، plan_ready |
| SPECIFY | spec_ready، plan_ready، needs_clarification |
| PLAN | plan_ready، needs_clarification |
| AWAITING_PLAN_APPROVAL | plan_approved، plan_rejected |
| RECON | recon_complete، implementation_batch_done، needs_clarification |
| IMPLEMENT | implementation_batch_done، tests_failed، block |
| TEST | tests_passed، tests_failed، repair_exhausted |
| REPAIR | repair_succeeded، repair_exhausted، tests_failed |
| SECURITY_REVIEW | security_clear، security_blocked، security_findings_accepted |
| PREVIEW | preview_ready، deploy_requested، implementation_batch_done |
| AWAITING_DEPLOY_APPROVAL | deploy_approved، deploy_rejected |
| DEPLOY | deploy_verified، deploy_failed |
| VERIFY | finalized، tests_failed، deploy_failed |
| FINALIZE | finalized |
| BLOCKED | unblock |
| DONE / FAILED / CANCELLED | — |

`fail`، `cancel` و `block` از هر state غیرپایانی مجازند.

## ترتیب ارزیابی

`guard` **قبل از** جدول انتقال اجرا می‌شود. دلیل: در Audit Log باید ثبت شود
**کدام invariant** نقض شده، نه یک پیام کلی «رویداد غیرمجاز».

## context اجرا

```ts
interface RunContext {
  repairAttempts: number;      // شمارنده تلاش تعمیر
  maxRepairAttempts: number;   // پیش‌فرض ۳
  planApproved: boolean;
  deployApproved: boolean;
  securityGatePassed: boolean;
  verifyPassed: boolean;
  blockReason?: string;
}
```

یک انتقال ردشده context را تغییر نمی‌دهد. این در تست اثبات شده است.

## قفل‌شدگی و خروج از آن

`BLOCKED` یک حالت انسانی است. خروج از آن با `unblock` ممکن است و Run به
IMPLEMENT برمی‌گردد؛ اما علت block در `blockReason` باقی می‌ماند تا در گزارش
نهایی دیده شود. موارد ورود به BLOCKED:

- `repair_exhausted` — بودجه تعمیر تمام شد
- `security_blocked` — finding بحرانی/بالای حل‌نشده
- `deploy_failed` — استقرار یا verification شکست خورد
- `block` — هر مانع انسانی دیگر (مجوز رد شده، کانکتور قطع، سهمیه تمام)
