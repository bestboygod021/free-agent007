# فاز M164: Structured Output Repair و Response Safety

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/model-output-safety-runtime.ts`
**تست:** `test/next-platform-hardening-phases-8.test.ts`
**gap:** `GAP-IN-20`

## هدف و مرز

M164 پاسخ مدل را از متن قابل‌اعتماد فرض‌شده به output contract، schema validation، bounded repair،
refusal handling و safety scan تبدیل می‌کند. repair نباید authority جدید، permission یا مقصد تازه
ایجاد کند و response فقط پس از redaction، tenant match و contract validation پذیرفته می‌شود. این فاز
model adapter، structured decoder، repair worker، DLP gateway یا safety classifier واقعی نیست.

## معماری

- `validateM164Contract`: schema hash، required fields، content type، size، version و tenant.
- `decideM164Response`: contract match، field completeness، refusal و redaction.
- `decideM164Repair`: reason، attempt bound، input/output hash و no-new-authority.
- `validateM164SafetyScan`: secret leak، cross-tenant data، prompt injection و unsafe action.

در حالت Local-first، decoder محلی و repair محدود استفاده می‌شود؛ fallback به provider پولی بدون consent،
mode policy و budget مجاز نیست. response مدل untrusted است و نباید با ادعای مدل، README، webpage یا
payload ابزار authority بگیرد.

## sprint plan

### Sprint A — Output contracts

schema registry، version، content type، size limit و error taxonomy.

### Sprint B — Validation

parser، required fields، refusal state، redaction و tenant response gateway.

### Sprint C — Bounded repair

repair prompt جدا، حداکثر تلاش، no-new-authority و deterministic evidence.

### Sprint D — Safety admission

secret/tenant/prompt-injection scan، quarantine، human review و regression corpus.

## Threat Model

- **Malformed output:** schema، size و content-type gate.
- **Repair escalation:** repair بدون authority جدید و با attempt bound.
- **Secret/tenant leakage:** output redaction و safety scan.
- **Prompt injection in output:** classifier، quarantine و no-execution default.
- **Refusal laundering:** refusal state به‌عنوان success پذیرفته نمی‌شود.
- **Provider fallback drift:** mode، quota، privacy و budget policy پابرجا می‌ماند.

## prompt pack

### `m164-output-safety-engineer`

```text
نقش: Model Output Safety Engineer

هر پاسخ را با schema hash، required fields، content type، size و tenant match validate کن. repair را
حداکثر سه بار و بدون authority جدید انجام بده. پیش از پذیرش، redaction و scan برای secret، tenant
leak، prompt injection و unsafe action را اجرا کن؛ refusal را موفقیت اعلام نکن.
```

### `m164-response-auditor`

```text
نقش: Response Safety Auditor

schema bypass، repair escalation، refusal laundering، secret leak، cross-tenant output، provider
fallback و unbounded retry را بررسی کن. mock response یا parser unit test جای model gateway، DLP و
safety regression واقعی نیست.
```

## DoD و production evidence boundary

- contract، response valid/invalid، repair bound، refusal و safety block تست شوند.
- model adapter، schema decoder، repair worker، output DLP/redaction، safety classifier و response gateway باید متصل شوند.
- kernel M164 به‌تنهایی کیفیت مدل، safety classifier recall، عدم نشت داده یا structured-output reliability production claim نیست.
