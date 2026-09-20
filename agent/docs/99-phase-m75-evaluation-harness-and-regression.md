# فاز M75: Evaluation Harness، Benchmark و Regression Gates

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IN-01`، `GAP-IN-10`، `GAP-IN-13`، `GAP-QA-01`، `GAP-QA-02`
**کد kernel:** `src/core/evaluation-harness-runtime.ts`
**تست:** `test/next-product-runtime-phases.test.ts`

## هدف و مرز

M75 از model card و trust profile به evaluation قابل‌تکرار می‌رسد: scenario provenance، input
hash، rubric، seed، blind scoring، safety/contamination checks، latency، score evidence و
regression gate. local، free-tier و BYOK مسیرهای معتبر هستند و paid compute approval می‌خواهد.
این فاز model API runner، benchmark corpus واقعی، scorer service، CI gate یا human feedback
portal را اجرا نمی‌کند.

## معماری

`BenchmarkScenario` به‌جای raw prompt فقط input/provenance/schema/rubric hash نگه می‌دارد.
`BenchmarkRun` dataset، scenario list، model reference، compute mode، seed و blind scoring را
ثبت می‌کند. `BenchmarkScoreEvidence` score، threshold، safety و contamination را به output
hash می‌بندد. `BenchmarkRegressionGate` baseline/candidate و regression bound را مقایسه می‌کند.

## قراردادهای اصلی

- `validateBenchmarkScenario` provenance، schema، rubric و secret scan را بررسی می‌کند.
- `decideBenchmarkRun` scenario membership، tenant boundary، seed و blind scoring را gate می‌کند.
- `validateBenchmarkScoreEvidence` score/status، threshold، safety و contamination را validate می‌کند.
- `decideBenchmarkRegressionGate` completeness، approval و regression budget را enforce می‌کند.

## sprintها

### Sprint A — Corpus و Scenario

- E1 تا E12 scenario catalog
- input/output schema
- provenance و license
- secret/PII scan و contamination label

### Sprint B — Runner و Scorer

- local/free/BYOK provider adapter
- deterministic seed و replay
- rubric/scorer version
- blind evaluation و output redaction

### Sprint C — Quality/Safety

- structured output repair
- safety/injection/canary checks
- latency/cost/tool-use dimensions
- human review و disagreement

### Sprint D — Regression/CI

- baseline/candidate run
- per-scenario diff
- regression threshold
- CI merge gate و model activation evidence

## Threat Model

- **Data leakage:** scenario فقط hash/provenance دارد؛ raw prompt/secret در evidence ذخیره نمی‌شود.
- **Contaminated benchmark:** provenance، contamination check و blind scoring اجباری‌اند.
- **Metric gaming:** scorer version/hash و status-threshold consistency ثبت می‌شود.
- **Paid surprise:** paid compute بدون approval رد می‌شود؛ local/free/BYOK fallback حفظ می‌شود.
- **False improvement:** regression gate باید تمام scenario evidence را داشته باشد.

## Prompt pack

### `m75-evaluation-harness-engineer`

```text
نقش: Evaluation Harness Engineer

scenario را با input hash، schema hash، rubric، provenance و secret scan بساز. run باید seedدار،
blind و organization-bound باشد. scorer version و output hash را ثبت کن. local/free/BYOK را
اولویت بده و paid compute را فقط با approval اجرا کن.
```

### `m75-benchmark-evidence-gate`

```text
نقش: Benchmark Evidence Gate

برای dataset، scenario، runner، scorer، safety/contamination، latency، baseline/candidate و
regression، artifact hash، seed، command، exit code و status ذخیره کن. model score یا model card
به‌تنهایی benchmark و CI evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای scenario، seed، blind scoring، score evidence و regression gate.
- corpus، model/provider runner، scorer، CI، human feedback و benchmark artifact باید integration شوند.
- evaluation kernel به‌تنهایی کیفیت model یا readiness production را ثابت نمی‌کند و `done_tested` نیست.
