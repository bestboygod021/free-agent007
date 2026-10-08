# فاز M203: Privacy-preserving Analytics و Aggregation

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/privacy-analytics-runtime.ts`
**تست:** `test/next-platform-hardening-phases-15.test.ts`
**gap:** `GAP-OB-14`

## هدف و مرز

M203 analytics event را با consent، sampling، subject/dimension hash، redaction و privacy budget ثبت
می‌کند و aggregate را به noise، epsilon، حداقل cohort، k-anonymity، approval، export disclosure و
derived-data deletion propagation bind می‌کند. این فاز event collector، privacy ledger، noisy aggregation
engine، export gateway یا deletion worker واقعی نیست.

## معماری

- `validateM203Event`: metric/dimension/subject reference، consent، sampling، privacy budget، redaction و tenant.
- `validateM203Aggregate`: window، sample/cohort bound، epsilon/noise، min cohort، k-anonymity، approval و redaction.
- `decideM203Export`: purpose/recipient، fields، visibility، consent، no-raw-data، expiry و tenant.
- `validateM203Deletion`: stores، derived aggregates، evidence، completion، residual subject data و tenant.

Local-first aggregate store مسیر پیش‌فرض است؛ free-tier/BYOK telemetry باید opt-in و redacted باشد و raw
subject data به provider ارسال نمی‌شود. analytics برای quality signal است، نه مجوز training یا surveillance.

## Sprint plan

### Sprint A — Event privacy

consent، sampling، subject/dimension hash، redaction و budget.

### Sprint B — Aggregate

window، cohort، epsilon/noise، k-anonymity و approval.

### Sprint C — Export

purpose، recipient، fields، visibility، consent و expiry.

### Sprint D — Erasure propagation

stores، derived aggregates، evidence، residual scan و completion.

## Threat Model

- **Re-identification:** subject/dimension hash و cohort bound.
- **Differential privacy budget exhaustion:** epsilon ledger و approval.
- **Raw telemetry leakage:** consent، redaction و no-raw-data export.
- **Small cohort inference:** minimum cohort و k-anonymity.
- **Deletion residue:** derived aggregate propagation و residual flag.
- **Purpose creep:** user-visible export purpose و expiry.

## prompt pack

### `m203-analytics-engineer`

```text
نقش: Privacy Analytics Engineer

event را با consent، sampling، subject/dimension hash، redaction و privacy budget ثبت کن. aggregate باید
window/cohort bound، epsilon/noise، minimum cohort، k-anonymity و approval داشته باشد. export باید purpose،
recipient، fields، visibility، consent، expiry و no-raw-data داشته باشد و deletion به derived aggregates برسد.
```

### `m203-analytics-auditor`

```text
نقش: Privacy Analytics Auditor

re-identification، budget exhaustion، raw telemetry، small cohort inference، deletion residue و purpose creep
را بررسی کن. metric counter یا aggregate mock جای privacy ledger، noisy engine، export gateway و deletion worker واقعی نیست.
```

## DoD و production evidence boundary

- event consent denial، small-cohort denial، aggregate privacy، export disclosure و deletion propagation تست شوند.
- privacy-safe collector، budget ledger، noisy aggregate engine، cohort gate، export/disclosure gateway و derived-data deletion باید متصل شوند.
- kernel M203 به‌تنهایی differential privacy guarantee، anonymity، deletion compliance، analytics accuracy یا training-policy production claim نیست.
