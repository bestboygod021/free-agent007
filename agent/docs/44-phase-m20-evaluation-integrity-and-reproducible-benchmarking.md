# فاز M20: Evaluation Integrity و Reproducible Benchmarking

**وضعیت:** `designed_only`
**پیش‌نیاز:** M10 Evaluation، M8 Checkpoint/Replay، M16 Memory و M19 Contract Testing
**کد اولیه:** `src/core/evaluation-integrity.ts`

M20 از ارزیابی‌ای جلوگیری می‌کند که با fixture آلوده، benchmark نامعتبر، replay
ناقص یا baseline دست‌کاری‌شده نتیجه خوب نشان دهد. `IntegrityBenchmarkCase` source،
license، fixture hash، prompt hash و expected artifact hash دارد. کد فعلی فقط
contamination، replay trace و regression decision را deterministic می‌کند.

## Integrity model

- corpus باید owned، licensed یا synthetic و دارای provenance باشد.
- contamination scan خروجی/fixtureهای موجود در known hash set را flag می‌کند.
- replay باید seed، input/output/tool hashes و model version داشته باشد.
- baseline با suite/version/policy hash bind می‌شود؛ score بدون baseline قابل‌مقایسه نیست.
- blind human evaluation باید identity مدل را تا بعد از رأی پنهان کند.
- test، quality، latency و cost gate باید جدا گزارش شوند؛ score بالا invariant را دور نمی‌زند.

## چهار sprint

### A — Corpus registry

- fixture manifest، license و provenance
- dedupe و contamination check
- data split و holdout
- subject/privacy review

### B — Deterministic replay

- seed و canonical serialization
- tool/model version pinning
- trace store و mismatch report
- replay از checkpoint

### C — Quality gate

- rubric و required cases
- regression، cost و latency baseline
- mutation/property testing
- blind human review و tie handling

### D — Runner و CI

- sandboxed benchmark runner
- artifact/evidence report
- CI merge gate و approval
- benchmark drift و scheduled re-run

## Prompt pack

### `m20-evaluation-integrity-reviewer`

```text
نقش: Evaluation Integrity Reviewer

برای هر case source، license، fixtureHash، promptHash، expected artifact و split را
بررسی کن. contamination، duplicate، data leakage، replay mismatch و model identity
را جدا گزارش کن. score یا model reputation جای invariant و evidence نیست.
```

### `m20-regression-gate`

```text
نقش: Reproducible Regression Gate

baseline، current score، required pass rate، cost، latency، seed، model version و
report hash را bind کن. اگر regression، contamination یا missing observation رخ داد
undecided/blocked بده؛ هیچ tie یا missing data را موفقیت فرض نکن.
```

## DoD

- corpus registry با license و contamination test
- replay hash برابر برای اجرای تکراری
- baseline regression و mutation gate
- human blind evaluation با audit
- اجرای واقعی runner در sandbox و CI

تا زمانی که corpus واقعی، runner، CI و human evidence وجود نداشته باشد، M20
`designed_only` باقی می‌ماند.
