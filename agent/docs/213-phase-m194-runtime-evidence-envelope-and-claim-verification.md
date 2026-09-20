# فاز M194: Runtime Evidence Envelope و Claim Verification

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/evidence-envelope-runtime.ts`
**تست:** `test/next-platform-hardening-phases-14.test.ts`
**gap:** `GAP-OB-13`

## هدف و مرز

M194 ادعای موفقیت را به evidence envelope، input/output/trace hash، test evidence، policy hash، signer،
freshness، contradiction check، replay proof و disclosure متصل می‌کند. این kernel فقط قرارداد verification
است و evidence ledger، signer service، claim aggregator، replay runner یا UI شواهد واقعی را ایجاد نمی‌کند.

## معماری

- `validateM194Envelope`: هویت claim/run، hashهای ورودی و خروجی، policy/test، signer، expiry، redaction و tenant.
- `decideM194Claim`: کامل بودن evidence، freshness، contradiction، signer/policy verification و tenant.
- `validateM194Replay`: output hash، deterministic replay، sandbox و tenant proof.
- `decideM194Disclosure`: user-visible، no-false-guarantee، redaction و approval.

Local-first evidence store منبع اولیه است؛ BYOK/free-tier evaluator بدون approval و disclosure نمی‌تواند
ادعا را تقویت کند. raw context، password، token و secret در envelope ذخیره نمی‌شوند.

## Sprint plan

### Sprint A — Envelope

claim/run identity، hashهای input/output/trace، test evidence و policy.

### Sprint B — Verification

required evidence، signer، freshness، contradiction و tenant boundary.

### Sprint C — Replay

sandboxed replay، deterministic output match و recovery of evidence.

### Sprint D — Disclosure

redacted evidence surface، user-visible claim و no-false-guarantee.

## Threat Model

- **موفقیت جعلی:** required evidence و policy verification.
- **Evidence قدیمی:** expiry/freshness boundary.
- **تناقض بین منابع:** contradiction hashes و deny.
- **Replay mismatch:** input/output hash و deterministic replay.
- **نشتی context:** redaction و reference-only evidence.
- **اعتماد به evaluator untrusted:** signer، approval و tenant binding.

## prompt pack

### `m194-evidence-engineer`

```text
نقش: Runtime Evidence Engineer

هر claim را به run، input/output/trace hash، test evidence، policy، signer، expiry و tenant bind کن.
claim ناقص، stale یا contradictory را رد کن. replay فقط در sandbox و با output hash match معتبر است و
به کاربر evidence redacted و no-false-guarantee نشان بده.
```

### `m194-evidence-auditor`

```text
نقش: Evidence Auditor

success claim جعلی، evidence stale، contradiction، replay mismatch، secret leakage و evaluator untrusted
را بررسی کن. test pass یا JSON mock جای evidence ledger، signer، replay runner و user-facing proof واقعی نیست.
```

## DoD و production evidence boundary

- envelope، claim missing/stale، contradiction، replay mismatch و disclosure تست شوند.
- evidence ledger، signer/verifier، claim aggregator، replay/sandbox runner و redacted UI باید متصل شوند.
- kernel M194 به‌تنهایی success claim، audit completeness، replay availability یا user trust production claim نیست.
