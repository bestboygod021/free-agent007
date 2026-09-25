# فاز M198: Model Catalog Freshness و Capability Disclosure

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/model-catalog-freshness-runtime.ts`
**تست:** `test/next-platform-hardening-phases-14.test.ts`
**gap:** `GAP-IN-25`

## هدف و مرز

M198 catalog model را با provider، mode، capability claims، model card، license، data policy، quota،
freshness، discovery provenance، activation evidence، fallback disclosure و retirement migration کنترل
می‌کند. این فاز signed catalog، discovery verifier، health/quota probe، activation gateway یا retirement
migrator واقعی نیست.

## معماری

- `validateM198Model`: capability، model card، license/data policy، quota، observation/expiry، verification، disclosure و tenant.
- `validateM198Discovery`: source/endpoint reference، model card، free-tier evidence، provenance، timestamp، approval و tenant.
- `decideM198Activation`: freshness، capability/health proof، budget، consent، fallback، disclosure و tenant.
- `decideM198Retirement`: reason، replacement، migration evidence، user disclosure، traffic stop، rollback و approval.

Local model و catalog محلی منبع fallback هستند؛ free-tier/BYOK/hosted model فقط با model card، data policy،
quota و disclosure صادقانه فعال می‌شود. web page، README، model payload و provider marketing untrusted
هستند و نباید capability authority تلقی شوند.

## Sprint plan

### Sprint A — Catalog record

provider/mode، capability claims، model card، license، data policy و quota.

### Sprint B — Discovery

source provenance، endpoint reference، free-tier evidence، redaction و approval.

### Sprint C — Activation

freshness، health، capability، budget، consent، fallback و disclosure.

### Sprint D — Retirement

traffic stop، replacement migration، rollback و user notice.

## Threat Model

- **Capability inflation:** model card و verified claim.
- **Stale catalog:** observed/expiry freshness.
- **Hidden data policy:** explicit data policy hash و consent.
- **Quota surprise:** quota evidence و budget gate.
- **Marketing/source spoofing:** provenance و approval.
- **Unsafe retirement:** traffic stop، migration و rollback.

## prompt pack

### `m198-model-catalog-engineer`

```text
نقش: Model Catalog Governance Engineer

هر model را با provider/mode، capability claims، model card، license، data policy، quota و freshness ثبت کن.
discovery باید provenance و free-tier evidence داشته باشد. activation فقط با health، budget، consent،
fallback و disclosure انجام شود و retirement دارای migration، stop traffic و rollback باشد.
```

### `m198-model-catalog-auditor`

```text
نقش: Model Catalog Auditor

capability inflation، stale card، hidden data policy، quota surprise، spoofed discovery و unsafe retirement
را بررسی کن. provider page یا model list mock جای signed catalog، verifier، health probe و activation gateway واقعی نیست.
```

## DoD و production evidence boundary

- catalog، stale denial، discovery provenance، activation gate، fallback disclosure و retirement rollback تست شوند.
- signed catalog، discovery/provenance verifier، health/quota probe، activation gateway و retirement migrator باید متصل شوند.
- kernel M198 به‌تنهایی model quality، capability truth، quota accuracy، provider privacy یا retirement safety production claim نیست.
