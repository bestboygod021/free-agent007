# فاز M25: Evidence-Grounded Routing، Drift، Shadow و Observability

**وضعیت:** `designed_only`
**proposalهای هدف:** `UP-025` تا `UP-030`، `UP-045`، `UP-047`
**کد kernel:** `src/core/evidence-routing-operations.ts`
**تست:** `test/audit-next-phases-2.test.ts`

## هدف و مرز

M25 لایه‌ای می‌سازد که signal بیرونی را به‌عنوان claim کم‌اعتماد normalize و calibrate
می‌کند، route را با Pareto و hard constraint توضیح می‌دهد و router جدید را در shadow
مقایسه می‌کند. هم‌زمان trace context و error taxonomy برای observability تعریف می‌شود.

این فاز web harvester واقعی، provider call، OTel exporter، metrics backend یا route
mutation نمی‌سازد. shadow تصمیم می‌دهد اما provider را اجرا نمی‌کند، پول خرج نمی‌کند و
external state نمی‌نویسد.

## قراردادهای اصلی

- `normalizeExternalClaim` فقط HTTPS، provenance و مقدار معتبر می‌پذیرد و claim را
  `trustedForPolicy: false` نگه می‌دارد.
- `calibrateClaims` internal measurement را anchor می‌کند و vendor/community signal
  را با cap و reliability محدود می‌سازد.
- `detectCapabilityDrift` فقط alert/re-evaluation می‌سازد؛ drift به‌تنهایی route را
  تغییر نمی‌دهد.
- `computeParetoFrontier` گزینه‌های policy-denied را پیش از dominance حذف می‌کند و
  دلیل rejected را نگه می‌دارد.
- `explainRoute` evidence digest، policy hash و rejected candidates را بدون
  chain-of-thought خام ثبت می‌کند.
- `planShadowRoute` صراحتاً `executesProvider: false`، `chargesMoney: false` و
  `writesExternalState: false` دارد.
- `startTrace`/`addTraceSpan` و `normalizeFailure` trace و failure عمومی را بدون raw
  error message در artifact تعریف می‌کنند.

## sprintها

### Sprint A — Official Source و Calibration

- source policy برای API رسمی، ToS، rate limit و cache
- provenance hash و domain cap
- تفکیک measured، benchmark، vendor و community
- calibration report قابل بازپخش

### Sprint B — Drift و Pareto Routing

- baseline/current و threshold
- quality، cost، latency، privacy و reliability
- hard constraint قبل از ranking
- explanation و تصمیم رد گزینه‌ها

### Sprint C — Shadow Routing

- مقایسه router فعلی و candidate
- صفر side effect و صفر paid call
- گزارش اختلاف route، evidence و policy hash
- approval لازم پیش از promotion

### Sprint D — Trace و Error Taxonomy

- traceId/runId/organizationId propagation
- span per model/tool/adapter در integration بعدی
- error class، public code و retryability
- هیچ raw provider response در log عمومی ثبت نشود

## Prompt pack

### `m25-evidence-calibrator`

```text
نقش: Evidence Calibration Engineer

هر claim بیرونی را untrusted نگه دار. HTTPS، domain، provenance، sample و tier را
اعتبارسنجی کن. measured evidence را anchor قرار بده؛ community و vendor هرگز با
تعداد پست یا ادعای خام policy را override نکنند. خروجی شامل calibration، drift، cap و
دلیل عدم promotion باشد.
```

### `m25-routing-observability-gate`

```text
نقش: Routing and Observability Gate

اول hard constraints را اعمال کن، سپس Pareto frontier و explanation بساز. shadow route
نباید provider را call کند، هزینه بسازد یا write خارجی انجام دهد. trace و error public
code بده، اما raw prompt، secret و raw provider error را ذخیره نکن. promotion فقط با
approval و regression evidence انجام شود.
```

## DoD و evidence boundary

- test برای source calibration، drift، dominated candidates، shadow safety و error map.
- evidence digest و policy hash در خروجی هر route وجود داشته باشد.
- web API، OTel collector، metrics storage و provider adapter به‌عنوان integration
  جداگانه باقی می‌مانند.
- `partial` به معنی deterministic contract/test است؛ هیچ provider quality claim با
  fixture این فاز production محسوب نمی‌شود.
