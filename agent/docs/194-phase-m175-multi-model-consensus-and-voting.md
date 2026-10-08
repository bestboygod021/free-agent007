# فاز M175: Multi-model Consensus و Voting

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/model-consensus-runtime.ts`
**تست:** `test/next-platform-hardening-phases-10.test.ts`
**gap:** `GAP-IN-23`

## هدف و مرز

M175 تصمیم حساس را از authority یک model به panel مستقل، quorum، threshold، evidence و tie-break
شفاف تبدیل می‌کند. abstain رأی معتبر اما موافق نیست؛ consensus بدون quorum یا independent evidence
بسته نمی‌شود. این فاز model ensemble runner، provider fan-out، calibration store یا human review
product واقعی نیست.

## معماری

- `validateM175Panel`: participant uniqueness، quorum، strict majority، independent prompt و no-single-model authority.
- `decideM175Vote`: participant، vote، rationale/evidence hash، confidence و tenant.
- `validateM175Consensus`: vote totals، quorum، threshold، decision و evidence.
- `decideM175TieBreak`: deny، human review یا evidence-weight با reviewer، approval و bound.

Local-first می‌تواند panel را روی چند model محلی اجرا کند؛ free-tier/BYOK provider پاسخ را untrusted
signal می‌کند، نه policy authority. رأی‌ها raw prompt، secret یا customer content ندارند و اختلاف باید
به human review یا deny ختم شود.

## Sprint plan

### Sprint A — Panel formation

participant registry، policy hash، independent prompt و model diversity.

### Sprint B — Voting protocol

typed ballot، rationale/evidence hash، confidence و duplicate-vote prevention.

### Sprint C — Quorum و scoring

quorum، strict threshold، abstain، disagreement و deterministic aggregation.

### Sprint D — Tie-break

deny-by-default، human review، evidence-weight، approval و audit.

## Threat Model

- **Single-model failure:** no-single-model authority و minimum panel.
- **Correlated answers:** independent prompts و participant uniqueness.
- **Vote forgery/replay:** vote identity، evidence hash و immutable panel state.
- **Quorum laundering:** count consistency و strict majority.
- **Provider bias:** model scope و calibration evidence.
- **Tie-break escalation:** deny default و human approval.

## prompt pack

### `m175-consensus-engineer`

```text
نقش: Multi-model Consensus Engineer

panel را با participantهای مستقل، policy hash، quorum و strict threshold بساز. هر vote rationale و
evidence hash دارد؛ abstain را approve حساب نکن. اختلاف را deny یا human review کن و هیچ model منفردی
را authority نهایی قرار نده.
```

### `m175-consensus-auditor`

```text
نقش: Consensus Auditor

duplicate participant، prompt correlation، fake quorum، confidence بدون evidence، provider bias و
tie-break بدون approval را بررسی کن. majority ساده یا ensemble mock جای panel مستقل و calibrated evidence واقعی نیست.
```

## DoD و production evidence boundary

- panel، vote، quorum، approve/reject، abstain، tie و negative authority path تست شوند.
- panel registry، model fan-out، vote store، calibration/evaluation و human review باید متصل شوند.
- kernel M175 به‌تنهایی correctness اجماع، کاهش hallucination، fairness یا consensus production claim نیست.
