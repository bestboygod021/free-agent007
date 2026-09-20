# فاز M186: Human Feedback و Preference Governance

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/human-feedback-runtime.ts`
**تست:** `test/next-platform-hardening-phases-12.test.ts`
**gap:** `GAP-QA-12`

## هدف و مرز

M186 feedback انسانی را به consent-bound label، rubric، redaction، privacy/bias review، aggregate metric و
preference update دارای evaluation، canary و rollback تبدیل می‌کند. feedback به‌صورت خودکار model را تغییر
نمی‌دهد و score خام به‌عنوان حقیقت کیفیت پذیرفته نمی‌شود. این فاز feedback UI، annotation workforce،
preference trainer، model registry یا production fine-tuning واقعی نیست.

## معماری

- `validateM186Feedback`: task/subject hash، label/score، rubric، source، consent، redaction و tenant.
- `validateM186Aggregate`: sample bound، positive/negative، mean score، privacy/bias review و no-direct-update.
- `decideM186PreferenceUpdate`: dataset/evaluation/canary/rollback، regression، approval و tenant.
- `decideM186Disclosure`: purpose، retention، visibility، opt-out و no-training-by-default.

Local-first feedback store باید synthetic یا redacted باشد؛ BYOK/free-tier provider حق استفاده training از
feedback را بدون disclosure و consent ندارد. raw customer content، identity و password در label یا metric
ذخیره نمی‌شود.

## Sprint plan

### Sprint A — Feedback intake

rubric، label، score، consent، subject hash و redaction.

### Sprint B — Aggregate quality

sample bound، privacy review، bias review، metric و disagreement.

### Sprint C — Preference update

dataset، evaluation، canary، regression، rollback و approval.

### Sprint D — User disclosure

purpose، retention، opt-out، training policy و correction request.

## Threat Model

- **Feedback poisoning:** source/rubric، consent و bounded aggregate.
- **Privacy leakage:** subject hash، redaction، retention و opt-out.
- **Bias amplification:** bias review و disagreement evidence.
- **Silent model update:** no-direct-update و explicit update approval.
- **Metric gaming:** evaluation/canary مستقل.
- **Training surprise:** no-training-by-default disclosure.

## prompt pack

### `m186-feedback-governance-engineer`

```text
نقش: Human Feedback Governance Engineer

feedback را با consent، subject hash، rubric، score، source و redaction بگیر. aggregate باید sample-bound،
privacy/bias-reviewed و no-direct-update باشد. preference update فقط با evaluation، canary، regression،
rollback و approval انجام شود و training policy به کاربر اعلام شود.
```

### `m186-feedback-auditor`

```text
نقش: Feedback Auditor

poisoning، privacy leak، bias، score gaming، silent update، retention drift و hidden training را بررسی
کن. thumbs-up mock یا annotation file جای feedback governance، evaluation و model update gate واقعی نیست.
```

## DoD و production evidence boundary

- feedback، consent denial، aggregate، bias/privacy review، preference update و disclosure تست شوند.
- feedback UI/store، annotation service، privacy/DLP، evaluator، model registry و canary/rollback باید متصل شوند.
- kernel M186 به‌تنهایی label quality، fairness، user consent، preference learning یا model improvement production claim نیست.
