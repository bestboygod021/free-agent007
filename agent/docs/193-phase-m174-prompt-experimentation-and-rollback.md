# فاز M174: Prompt Experimentation و Rollback

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/prompt-experiment-runtime.ts`
**تست:** `test/next-platform-hardening-phases-10.test.ts`
**gap:** `GAP-IN-22`

## هدف و مرز

M174 آزمایش prompt را از تغییر بی‌ردپا به variant versioned، deterministic assignment، metric evidence،
holdout و rollback approval تبدیل می‌کند. هر variant policy hash، model scope، allocation و مسیر برگشت
دارد؛ نتیجه بدون evidence و redaction معتبر نیست. این فاز experiment service، traffic router، model
provider، statistical evaluator یا production rollout واقعی نیست.

## معماری

- `validateM174Variant`: prompt/policy hash، allocation، metric، approval، reversibility و tenant.
- `decideM174Assignment`: seed قطعی، subject hash، expiry و tenant match.
- `validateM174Result`: bounded score، evidence، redaction و result validity.
- `decideM174Rollback`: target متفاوت، operator، approval، bound و no-data-loss.

Local-first می‌تواند assignment و metric fixture را محلی نگه دارد. BYOK/free-tier/local provider فقط
یک model scope است و حق عبور از policy یا ارسال raw prompt را نمی‌دهد. prompt، user data و secret در
metric یا audit ذخیره نمی‌شوند.

## Sprint plan

### Sprint A — Variant registry

prompt hash، policy version، model scope، allocation و experiment state.

### Sprint B — Deterministic assignment

seed، holdout، expiry، tenant isolation و replayable assignment.

### Sprint C — Evidence و evaluation

metric schema، redacted result، quality/safety guardrail و sample integrity.

### Sprint D — Rollback

human approval، bounded rollback، no-data-loss proof و audit trail.

## Threat Model

- **Prompt regression:** variant hash، metric evidence و quality gate.
- **Traffic manipulation:** deterministic assignment و bounded allocation.
- **Secret leakage:** no-raw-secret و redacted metric.
- **Tenant contamination:** subject/assignment/result tenant match.
- **Irreversible experiment:** approval، reversibility و rollback evidence.
- **Metric gaming:** holdout، policy hash و immutable evidence.

## prompt pack

### `m174-prompt-experiment-engineer`

```text
نقش: Prompt Experiment Engineer

هر variant را با prompt hash، policy hash، model scope، allocation و rollback ثبت کن. assignment را با
seed قطعی و holdout بساز. نتیجه را فقط با metric evidence معتبر، redaction و tenant match قبول کن و
هر rollback را bounded و approval-bound انجام بده.
```

### `m174-experiment-auditor`

```text
نقش: Prompt Experiment Auditor

prompt drift، allocation bias، secret در metric، cross-tenant subject، metric gaming و rollback بدون
approval را بررسی کن. A/B mock یا تغییر prompt بدون evidence جای experiment service و rollout gate واقعی نیست.
```

## DoD و production evidence boundary

- variant، assignment، result، holdout، expiration و rollback مثبت/منفی تست شوند.
- experiment registry، traffic router، evaluator، privacy-safe metric store و rollback controller باید متصل شوند.
- kernel M174 به‌تنهایی بهبود کیفیت، causal attribution، statistical significance یا safe production rollout claim نیست.
