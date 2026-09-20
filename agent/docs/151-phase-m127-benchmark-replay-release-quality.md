# فاز M127: Benchmark Corpus، Deterministic Replay و Release Quality

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/evaluation-release-runtime.ts`
**تست:** `test/next-foundation-hardening-phases.test.ts`
**gap:** `GAP-QA-08`

## هدف و مرز

M127 quality را از یک test result به corpus versioned و release gate قابل بازپخش تبدیل می‌کند. corpus باید provenance، rubric، PII redaction، contamination check، fixture lock و approval داشته باشد. replay باید seed، environment hash، case completion، result hash و redacted logs ثبت کند. quality gate regression، safety، latency و approval را مقایسه می‌کند. release evidence باید tenant isolation، security، accessibility، load و rollback را کنار exit code جمع کند. model runner، benchmark corpus storage، CI release gate، browser farm یا human evaluation واقعی در kernel وجود ندارد.

## معماری

- `validateM127Corpus`: version، corpus/provenance/rubric hash، privacy، contamination، fixture lock و approval.
- `validateM127Replay`: deterministic seed، environment، case completion و redacted logs.
- `decideM127QualityGate`: score regression، safety violations، latency budget، reviewer و approval.
- `validateM127ReleaseEvidence`: scenario exit، tenant/security/accessibility، load/rollback و redaction.

Offline/local evaluation مسیر پیش‌فرض است؛ اجرای cloud یا paid model فقط با consent، budget و BYOK/free fallback مجاز است.

## sprint plan

### Sprint A — Corpus governance

case schema، version، provenance، rubric، PII handling و contamination review.

### Sprint B — Replay

seed، environment lock، fixture، deterministic output و mismatch taxonomy.

### Sprint C — Quality gate

baseline/candidate، safety، latency، regression allowance، reviewer و hold state.

### Sprint D — Release evidence

E2E، tenant isolation، security، accessibility، load، rollback و customer-impact redaction.

## Threat Model

- **Contaminated benchmark:** provenance و contamination check لازم است.
- **Non-reproducible green result:** seed/environment/corpus lock لازم است.
- **Quality regression hidden by average:** safety و latency gate جدا هستند.
- **Secret/PII in corpus or logs:** redaction و PII gate اجباری است.
- **Unsafe release:** approval، rollback و tenant/security/accessibility evidence لازم است.

## prompt pack

### `m127-evaluation-release-engineer`

```text
نقش: Benchmark and Release Quality Engineer

corpus را versioned، provenance-bound، PII-redacted، contamination-checked و fixture-locked کن.
replay باید seed/environment/result hash داشته باشد. quality gate score، safety، latency،
reviewer و approval را جدا بررسی کند و release بدون isolation/security/a11y/rollback سبز نشود.
```

### `m127-quality-auditor`

```text
نقش: Evaluation Integrity Auditor

corpus، rubric، contamination، deterministic replay، regression، safety، latency و release
artifacts را ممیزی کن. اجرای یک unit test یا mock model benchmark واقعی نیست و نباید quality
یا production readiness claim بسازد.
```

## DoD و production evidence boundary

- corpus، replay، regression gate و release evidence با negative paths تست شده باشند.
- dataset registry، model execution runner، CI gate، browser/accessibility farm، load telemetry و human review باید integration شوند.
- kernel M127 به‌تنهایی model quality، benchmark validity، release readiness یا production E2E را ثابت نمی‌کند.
