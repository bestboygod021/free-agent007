# فاز M35: Evaluation و Reproducible Benchmark Runtime

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IN-01`، `GAP-IN-02`، `GAP-IN-13`، `GAP-QA-01`، `GAP-QA-02`، `GAP-IN-10`
**کد kernel:** `src/core/evaluation-runtime-contract.ts`
**تست:** `test/next-followup-phases.test.ts`

## هدف و مرز

M35 قرارداد dataset provenance، benchmark plan، evaluation observation، regression gate و
human feedback را می‌سازد. محتوای dataset و پاسخ مدل در kernel ذخیره نمی‌شود؛ فقط hash،
provenance و summary اندازه‌گیری‌شده عبور می‌کند. این فاز evaluator provider، model call،
CI runner یا claim کیفیت production را اجرا نمی‌کند.

## معماری

Dataset registry یک case را با dataset، split، prompt version و provenance hash ثبت
می‌کند. benchmark planner با environment digest، seed، case IDs و budget یک اجرای قابل
بازپخش می‌سازد. runner sandbox/CI observation را به aggregate تبدیل می‌کند و regression
kernel با baseline، pass rate، quality، latency و cost gate می‌دهد. human feedback به
case و feedback hash متصل می‌شود و بعداً می‌تواند ورودی dataset review باشد، نه authority
برای تغییر مستقیم production.

## قراردادهای اصلی

- `validateEvaluationCase` split، training contamination و provenance را بررسی می‌کند.
- `planBenchmarkRun` case uniqueness، seed، environment digest و budget را gate می‌کند.
- `aggregateEvaluation` pass rate، mean quality، p95 latency و total cost را deterministic می‌کند.
- `decideRegressionGate` افت کیفیت، pass rate، latency و cost را به review/deny تبدیل می‌کند.
- `validateHumanFeedback` feedback را به organization، evaluator، case و hash متصل می‌کند.

## sprintها

### Sprint A — Dataset و Provenance

- dataset registry و version manifest
- train/validation/test/holdout split
- contamination flag و provenance chain
- PII-safe fixture و hash-only observation

### Sprint B — Benchmark Runner

- sandbox runner و deterministic seed
- environment/image digest و toolchain manifest
- budget، timeout، retry و cancellation
- artifact و log evidence بدون raw prompt export

### Sprint C — Scoring و Regression

- rubric و structured output normalization
- aggregate metric و confidence interval
- baseline compare و prompt/schema regression gate
- CI report با exit code و evidence hash

### Sprint D — Human Feedback Loop

- blind review و evaluator separation
- rating/correction hash و adjudication
- feedback sampling و bias review
- promotion فقط با approval و reproducible rerun

## Threat Model

- **Benchmark contamination:** test/holdout مورد استفاده برای training علامت می‌خورد و
  provenance/hash اجباری است؛ dataset بدون lineage قابل promotion نیست.
- **Metric gaming:** aggregate فقط از observation دارای output/evidence hash ساخته می‌شود؛
  model یا evaluator نمی‌تواند pass rate جعلی را به‌تنهایی ثبت کند.
- **Cost/latency denial:** benchmark پیش از اجرا budget و بعد از اجرا cost/p95 gate دارد؛
  free/local مسیر zero-cost باید با evidence واقعی reconcile شود.
- **Feedback manipulation:** evaluator identity، blind review و correction hash ثبت می‌شود؛
  feedback به‌تنهایی مجوز deploy یا تغییر policy نیست.

## Prompt pack

### `m35-evaluation-runtime-engineer`

```text
نقش: Evaluation Runtime Engineer

هر case را با dataset، split، prompt version، provenance و hash مدل کن. benchmark باید
seed و environment digest داشته باشد. پاسخ raw را در audit ذخیره نکن؛ observation را با
quality، latency، cost و evidence hash normalize کن. regression gate را قبل از promotion
اجرا کن و budget رایگان/لوکال را صادقانه گزارش بده.
```

### `m35-evaluation-evidence-gate`

```text
نقش: Evaluation Evidence Gate

برای dataset manifest، contamination check، benchmark command، runner exit code،
scorer output، regression diff و human review، artifact hash و reproducible seed ثبت کن.
یک unit test یا mock model به‌تنهایی evidence کیفیت production نیست.
```

## DoD و production evidence boundary

- unit/contract برای split contamination، duplicate case، seed، aggregate، regression
  و feedback validation.
- dataset registry، sandbox runner، evaluator/scorer، CI gate و blind review باید با
  fixture واقعی و command مستقل اجرا شوند.
- هیچ pass rate، quality uplift، latency saving یا prompt promotion بدون benchmark
  reproducible و evidence مستقل `done_tested` محسوب نمی‌شود.
