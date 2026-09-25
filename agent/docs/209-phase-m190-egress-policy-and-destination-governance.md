# فاز M190: Egress Policy و Destination Governance

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/egress-policy-runtime.ts`
**تست:** `test/next-platform-hardening-phases-13.test.ts`
**gap:** `GAP-SE-20`

## هدف و مرز

M190 هر outbound request را به policy، mode، destination، scheme/port، data class، purpose، DNS pin،
TLS، DLP، consent، credential lease و network evidence bind می‌کند. local mode هیچ egress ناخواسته‌ای
ندارد؛ free-tier و BYOK فقط با consent و disclosure فعال می‌شوند. این فاز proxy، DNS resolver، TLS
terminator، DLP engine، vault یا network enforcement واقعی نیست.

## معماری

- `validateM190Policy`: destination pattern، scheme/port/data class، expiry، mode و tenant boundary.
- `decideM190Egress`: purpose، byte bound، DNS/TLS، DLP، consent و tenant match.
- `validateM190CredentialLease`: credential reference غیرخام، scope، rotation، expiry، revoke و approval.
- `validateM190NetworkEvidence`: IP، certificate hash، byte counters، redaction، policy و DLP.

محل اجرای پیش‌فرض local و بدون خروج داده است؛ providerهای free/BYOK باید مقصد و class داده را پیش از
اجرا نشان دهند. raw password، API key و token هرگز در این contract یا evidence قرار نمی‌گیرد.

## Sprint plan

### Sprint A — Policy registry

destination، scheme/port، data class، mode، consent و policy expiry.

### Sprint B — Request admission

purpose، byte bound، DNS pin، TLS، DLP و tenant match.

### Sprint C — Credential lease

vault reference، least scope، short expiry، rotation و revoke.

### Sprint D — Network evidence

resolved IP، certificate، bytes، redaction و policy linkage.

## Threat Model

- **Exfiltration به مقصد ناشناس:** destination allowlist و policy expiry.
- **DNS rebinding:** DNS pin و certificate evidence.
- **Credential leakage:** reference-only lease و scope/rotation.
- **Restricted data egress:** data class و DLP gate.
- **Consent bypass:** explicit consent و mode disclosure.
- **Evidence laundering:** request/policy/network hash linkage.

## prompt pack

### `m190-egress-governance-engineer`

```text
نقش: Egress Governance Engineer

هر مقصد را با policy، mode، scheme/port و data class محدود کن. request باید purpose، byte bound، DNS/TLS،
DLP، consent و tenant proof داشته باشد. credential فقط vault reference با scope، rotation، expiry و revoke است.
```

### `m190-egress-auditor`

```text
نقش: Egress Auditor

unknown destination، DNS rebinding، secret leakage، restricted-data bypass، missing consent و fake network
م evidence را بررسی کن. allowlist mock جای proxy، DNS/TLS، DLP و vault enforcement واقعی نیست.
```

## DoD و production evidence boundary

- policy، approved request، restricted-data denial، lease expiry/revoke و network evidence تست شوند.
- egress proxy، destination/DNS policy، TLS verifier، DLP scanner، vault adapter و network audit collector باید متصل شوند.
- kernel M190 به‌تنهایی no-exfiltration، TLS security، DLP compliance یا provider privacy production claim نیست.
