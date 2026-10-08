# فاز M60: Model Evaluation، Trust و Activation Gate

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IN-01`، `GAP-IN-10`، `GAP-IN-13`، `GAP-QA-01`، `GAP-QA-02`
**کد kernel:** `src/core/model-evaluation-trust-runtime.ts`
**تست:** `test/next-ai-platform-phases.test.ts`

## هدف و مرز

M60 پیش از فعال‌شدن model در router، کیفیت، safety، latency، cost، tool use، structured
output و privacy را با benchmark reproducible بررسی می‌کند. مدل catalog یا free API badge به
تنهایی trust نیست. این فاز evaluation runner، dataset، scorer، CI harness یا red-team service
واقعی را اجرا نمی‌کند و فقط contract تصمیم‌گیری و evidence boundary را می‌سازد.

## معماری

`ModelEvaluationPlan` dataset/cases، dimension، runner، environment digest، seed، budget و
terms review را به catalog/model bind می‌کند. observationها score، latency، cost، safety
finding، output hash و evidence hash دارند. `ModelTrustProfile` aggregation را با threshold
quality/safety، p95 latency، cost، evaluation hash و reviewer approval عرضه می‌کند. trust
levelها `unverified`، `screened`، `trusted` و `blocked` هستند.

## قراردادهای اصلی

- `validateModelEvaluationPlan` reproducibility، budget، terms و dataset boundary را gate می‌کند.
- `aggregateModelEvaluation` observation metric و safety finding را aggregate می‌کند.
- `decideModelTrustGate` threshold، evidence، reviewer و trust level را enforce می‌کند.
- `validateModelFeedback` feedback/correction را با consent وارد چرخه evaluation می‌کند.

## sprintها

### Sprint A — Benchmark Harness

- dataset provenance و split
- deterministic seed و environment digest
- quality/safety/latency/cost dimensions
- result normalization

### Sprint B — Model Safety

- prompt injection و harmful output cases
- structured-output validity
- tool-use boundary
- privacy/tenant leakage tests

### Sprint C — Trust Gate

- baseline و regression threshold
- reviewer inbox
- trusted/blocked lifecycle
- feedback و correction provenance

### Sprint D — Catalog/Router Integration

- trust profile به M58 catalog
- trust gate به M61 routing
- periodic re-evaluation
- report و audit retention

## Threat Model

- **Benchmark contamination:** dataset، split، provenance و seed ثبت می‌شوند؛ test/holdout داده training نیست.
- **False trust:** score بدون evidence و reviewer، مدل را trusted نمی‌کند؛ safety finding هر trust gate را block می‌کند.
- **Provider terms violation:** terms review پیش از evaluation لازم است؛ داده حساس بدون policy به provider نمی‌رود.
- **Metric gaming:** quality تنها metric نیست؛ safety، latency، cost، tool use و structured output نیز gate می‌شوند.
- **Feedback poisoning:** human correction فقط با consent و correction hash وارد evaluation می‌شود.

## Prompt pack

### `m60-model-evaluation-engineer`

```text
نقش: Model Evaluation and Trust Engineer

هر model را با dataset provenance، split، seed و environment digest ارزیابی کن. quality را
با safety، latency، cost، tool-use و structured-output همراه کن. observation فقط hash/evidence
حمل کند. safety finding trust را block کند و trusted شدن به reviewer approval نیاز داشته باشد.
```

### `m60-trust-evidence-gate`

```text
نقش: Model Trust Evidence Gate

برای plan، dataset، seed، scorer، observation، regression، safety finding، feedback و trust
transition، artifact hash، command، exit code و evaluator report ثبت کن. score fixture یا
synthetic result جای benchmark runner و red-team evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای plan، seed، metrics، safety finding، trust threshold و feedback consent.
- evaluation runner، dataset store، scorer، red-team suite، CI gate و catalog/router integration باید اجرا شوند.
- model با kernel trust contract production-ready یا trustworthy محسوب نمی‌شود و `done_tested` نیست.
