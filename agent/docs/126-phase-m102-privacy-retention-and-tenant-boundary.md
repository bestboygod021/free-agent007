# فاز M102: Privacy Lifecycle، Retention و Tenant Boundary

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-SE-02`، `GAP-SE-03`، `GAP-SE-04`، `GAP-SE-06`، `GAP-SE-10`
**کد kernel:** `src/core/privacy-retention-runtime.ts`
**تست:** `test/next-agent-platform-phases.test.ts`

## هدف و مرز

M102 سیاست retention، erasure/export، legal hold، tenant-isolation probe و output privacy filter
را contract می‌کند. unknown data class باید default-deny باشد. erasure باید propagation plan و
tombstone داشته باشد. خروجی دارای secret یا داده tenant دیگر هرگز با human review سفید نمی‌شود؛
ابتدا باید redaction/filter شود. این فاز KMS، PostgreSQL RLS deployment، object-store deletion،
DSAR service، DLP scanner یا legal process واقعی را اجرا نمی‌کند.

## معماری

`PrivacyRetentionPolicy` class، retention، grace، region و review را نگه می‌دارد.
`PrivacyErasureRequest` subject hash، identity proof، legal hold، approval و propagation evidence
دارد. `TenantIsolationProbeEvidence` denial، redaction و tenant-bound query را اثبات می‌کند.
`PrivacyOutputFilterRequest` secret/other-tenant detection و source/target tenant را gate می‌کند.
raw subject، password، token و payload در kernel ذخیره نمی‌شود.

## قراردادهای اصلی

- `validateM102RetentionPolicy`: retention، grace، secret cap، review و default-deny را validate می‌کند.
- `decidePrivacyErasure`: identity، legal hold، propagation plan، tombstone و approval را بررسی می‌کند.
- `validateM102TenantIsolationProbe`: cross-tenant denial، response redaction و query binding را enforce می‌کند.
- `decidePrivacyOutputFilter`: secret، tenant mismatch و redaction را پیش از خروجی gate می‌کند.

## sprintها

### Sprint A — Policy

- data classification
- retention و grace
- regional policy
- legal hold

### Sprint B — Data Rights

- verified subject request
- export bundle
- erasure propagation
- tombstone و residual proof

### Sprint C — Tenant Boundary

- RLS policy
- cross-tenant probes
- query parameter binding
- cache/key separation

### Sprint D — Output Privacy

- secret/DLP scan
- other-tenant filter
- redaction evidence
- deny-by-default response

## Threat Model

- **Erasure bypass:** legal hold و propagation plan باید قبل از اجرا روشن باشند.
- **Cross-tenant read:** probe باید denial و tenant-bound query را همزمان نشان دهد.
- **Secret exfiltration:** redaction شرط لازم است، human review جایگزین آن نیست.
- **Key/cache collision:** organization/tenant boundary در تمام referenceها باقی می‌ماند.
- **Unknown data:** class ناشناخته با default-deny نگه داشته می‌شود.

## Prompt pack

### `m102-privacy-engineer`

```text
نقش: Privacy and Tenant Boundary Engineer

retention را با data class، region، grace، legal hold و review طراحی کن. erasure/export باید
identity verification، propagation plan و tombstone داشته باشد. cross-tenant probe باید deny،
redact و tenant-bound query evidence بدهد. output دارای secret یا tenant دیگر همیشه block می‌شود.
```

### `m102-privacy-evidence-gate`

```text
نقش: Privacy Evidence Gate

برای policy، DSAR، deletion، legal hold، RLS probe و output filter، subject hash، propagation hash،
query/response evidence، redaction، command و exit code ثبت کن. fixture یا ادعای compliance جای
KMS rotation، database RLS، object deletion، DLP و independent privacy test نیست.
```

## DoD و production evidence boundary

- unit/contract برای retention، erasure، isolation probe و output filter.
- KMS/envelope encryption، durable RLS، object deletion, DLP scanner، DSAR workflow و audit store باید integration شوند.
- kernel M102 به‌تنهایی GDPR-like deletion، tenant isolation production یا DLP completeness را ثابت نمی‌کند و `done_tested` نیست.
