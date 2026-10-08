# فاز M159: Data Residency و Regional Routing

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/data-residency-runtime.ts`
**تست:** `test/next-platform-hardening-phases-7.test.ts`
**gap:** `GAP-SE-17`

## هدف و مرز

M159 محل نگهداری داده را به policy صریح، classification، region placement، cross-border transfer و
replica deletion proof تبدیل می‌کند. هر dataset باید tenant، legal basis، encryption و retention داشته
باشد؛ region پیش‌فرض یا approval مدل به‌تنهایی مجوز عبور از residency policy نیست. این فاز regional
storage، jurisdiction registry، transfer gateway، data-plane router یا deletion worker واقعی نیست.

## معماری

- `validateM159Policy`: regionهای مجاز، default، classification، legal basis، tenant scope و approval.
- `decideM159Placement`: تطبیق placement با policy، encryption، retention و tenant.
- `validateM159Transfer`: مقصد، cross-border rule، legal basis، TLS، redaction و tenant match.
- `decideM159Deletion`: enumeration همه replicaها، legal hold، approval و residual proof.

در حالت Local-first، `local` می‌تواند تنها region مجاز باشد و خروج داده خام ممنوع بماند. BYOK باید با
region/KMS هماهنگ شود؛ free-tier یا provider ابری خارج از jurisdiction فقط با policy و consent صریح
مجاز است. classification و region نباید از untrusted README، webpage یا prompt مدل گرفته شوند.

## sprint plan

### Sprint A — Residency policy

region catalog، classification، jurisdiction، legal basis و default-deny.

### Sprint B — Placement

region-aware store، encryption/KMS reference، retention و tenant routing.

### Sprint C — Transfer

cross-border approval، TLS gateway، redaction، audit و provider fallback.

### Sprint D — Deletion evidence

replica inventory، index/cache sweep، legal hold و residual proof drill.

## Threat Model

- **Cross-border leakage:** destination allowlist، legal basis و transfer approval.
- **Wrong-region placement:** policy-bound placement و fail-closed router.
- **Replica omission:** inventory اجباری و deletion proof.
- **KMS/region mismatch:** envelope key metadata و BYOK region binding.
- **Tenant crossover:** placement/transfer/deletion همگی tenant-bound هستند.
- **False compliance:** signed jurisdiction source، freshness و independent evidence لازم است.

## prompt pack

### `m159-residency-engineer`

```text
نقش: Data Residency Engineer

برای dataset classification، tenant، region policy، legal basis، encryption و retention را صریح ثبت
کن. placement فقط در region مجاز انجام شود. cross-border را با مقصد approved، TLS، redaction و audit
gate کن و deletion را روی همه replica/index/cache با residual proof اجرا کن.
```

### `m159-residency-auditor`

```text
نقش: Residency Auditor

region mismatch، cross-border transfer، legal hold، replica omission، key locality و provider fallback
را بررسی کن. policy kernel یا bucket آزمایشی جای regional data plane، transfer gateway و deletion drill واقعی نیست.
```

## DoD و production evidence boundary

- policy، placement مجاز/ردشده، transfer داخلی/برون‌مرزی و deletion/hold تست شوند.
- region-aware store/router، jurisdiction registry، KMS، transfer gateway، replica inventory و deletion worker باید متصل شوند.
- kernel M159 به‌تنهایی data sovereignty، GDPR/قانون محلی، جلوگیری از cross-border leakage یا deletion completeness production claim نیست.
