# فاز M103: Evaluation Harness، E2E و Release Quality

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IN-01`، `GAP-IN-02`، `GAP-IN-15`، `GAP-QA-01`، `GAP-QA-03`، `GAP-QA-04`، `GAP-QA-05`
**کد kernel:** `src/core/evaluation-quality-runtime.ts`
**تست:** `test/next-agent-platform-phases.test.ts`

## هدف و مرز

M103 provenance dataset، replayable evaluation، safety/quality score، regression gate و release
E2E evidence را کنار هم می‌گذارد. dataset باید redacted، contamination-checked و approved باشد.
run باید seed، case completion، score، safety violation، p95 و result hash داشته باشد. gate با
regression، safety و latency بسته می‌شود و E2E علاوه بر functional path، tenant/security/
accessibility/load/rollback evidence می‌خواهد. این فاز evaluator runner، model sandbox، browser
E2E، k6/DAST/axe، CI pipeline یا release promotion واقعی را اجرا نمی‌کند.

## معماری

`EvaluationDatasetContract` provenance و rubric version را تثبیت می‌کند.
`EvaluationRunEvidence` mode، seed، model reference، score و result hash را ثبت می‌کند.
`RegressionGateRequest` افت score/safety، latency budget و approval را می‌سنجد.
`EndToEndReleaseEvidence` step trace، tenant isolation، security/accessibility، load، redaction و
rollback را به یک release boundary تبدیل می‌کند.

## قراردادهای اصلی

- `validateEvaluationDataset`: provenance، PII، contamination، cases و approval را validate می‌کند.
- `validateEvaluationRun`: seed، completion، score، safety، latency و canary reviewer را بررسی می‌کند.
- `decideM103RegressionGate`: regression threshold، safety floor، p95 budget، status و approval را gate می‌کند.
- `validateEndToEndReleaseEvidence`: ordered steps، tenant/security/accessibility، load، redaction و rollback را enforce می‌کند.

## sprintها

### Sprint A — Dataset و Runner

- scenario registry
- redaction و provenance
- seed و replay
- rubric و scorer

### Sprint B — Regression

- baseline/candidate comparison
- safety floor
- latency p95
- model/prompt/schema gate

### Sprint C — Product E2E

- registration/connection/request/plan/approval/PR scenario
- tenant probe
- API/worker/stream evidence
- failure artifact

### Sprint D — Release Quality

- load/security/accessibility matrix
- canary review
- rollback drill
- CI artifact و release decision

## Threat Model

- **Benchmark contamination:** provenance و contamination check پیش‌شرط dataset است.
- **Metric gaming:** safety و latency کنار score gate می‌شوند.
- **Flaky E2E:** seed، ordered steps و artifact hash replay را ممکن می‌کند.
- **False release:** approval و rollback evidence اجباری است.
- **PII leakage:** dataset و artifact باید redacted باشند.

## Prompt pack

### `m103-evaluation-engineer`

```text
نقش: Evaluation and Release Quality Engineer

dataset را با provenance، version، PII redaction، contamination check و rubric بساز. run باید seed،
case completion، score، safety violation، latency p95 و result hash داشته باشد. regression gate
افت quality، safety یا latency را block کند؛ human approval بدون evidence کافی نیست.
```

### `m103-quality-evidence-gate`

```text
نقش: Quality Evidence Gate

برای dataset، run، regression، E2E و release، scenario/version/seed، hash، score، safety، latency،
step trace، tenant/security/accessibility، load، rollback، command و exit code ثبت کن. unit test یا
screenshot جای evaluator runner، CI، browser E2E، load/security/accessibility و rollback evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای dataset، evaluation run، regression gate و E2E release evidence.
- evaluator runner، benchmark corpus، CI، browser/API E2E، load/security/accessibility tools و release promotion باید integration شوند.
- kernel M103 به‌تنهایی quality production، end-to-end readiness یا release certification را ثابت نمی‌کند و `done_tested` نیست.
