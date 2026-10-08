# فاز M177: Prompt Cache Integrity و Privacy

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/prompt-cache-runtime.ts`
**تست:** `test/next-platform-hardening-phases-10.test.ts`
**gap:** `GAP-SE-18`

## هدف و مرز

M177 cache را از shortcut بی‌اعتماد به entry با prompt/model/policy hash، tenant scope، encryption،
redaction، consent، expiry و poisoning scan تبدیل می‌کند. sensitive prompt به‌صورت پیش‌فرض cache نمی‌شود
و purge باید همه replicaها را پوشش دهد. این فاز cache backend، encryption service، invalidation bus،
DLP classifier یا retention worker واقعی نیست.

## معماری

- `validateM177Entry`: hashes، namespace، tenant scope، freshness، encryption، consent و sensitivity.
- `decideM177Lookup`: exact key، policy/model match، cross-tenant denial و poisoning scan.
- `validateM177Write`: encrypted/redacted/no-raw-prompt، consent و retention bound.
- `decideM177Purge`: reason، approval، replica evidence و bounded purge.

Local-first cache می‌تواند encrypted و device-local باشد؛ BYOK برای encryption reference است و cache
نباید raw key یا password نگه دارد. free-tier/provider response فقط وقتی cache می‌شود که policy و consent
همان tenant آن را اجازه دهند.

## Sprint plan

### Sprint A — Key و namespace

prompt/model/policy hash، tenant namespace و sensitivity classification.

### Sprint B — Safe lookup

exact match، expiry، policy invalidation، poisoning scan و cross-tenant denial.

### Sprint C — Safe write

encryption، redaction، consent، retention و no-raw-prompt evidence.

### Sprint D — Purge و incident response

replica enumeration، approval، deletion evidence و cache poisoning recovery.

## Threat Model

- **Cross-tenant disclosure:** tenant scope و lookup denial.
- **Prompt poisoning:** poisoning scan و policy/model hash.
- **Stale policy response:** policy hash و expiry/invalidation.
- **Sensitive data persistence:** sensitivity deny، encryption و retention.
- **Cache key collision:** namespace و exact hash tuple.
- **Incomplete deletion:** replica evidence و bounded purge.

## prompt pack

### `m177-cache-security-engineer`

```text
نقش: Prompt Cache Security Engineer

cache key را از prompt/model/policy hash و tenant namespace بساز. sensitive prompt را پیش‌فرض ذخیره
نکن. هر write encrypted، redacted، consent-bound و expiring باشد و هر lookup poisoning، cross-tenant و
policy mismatch را fail-closed رد کند.
```

### `m177-cache-auditor`

```text
نقش: Prompt Cache Auditor

tenant leak، stale policy، key collision، cache poisoning، raw prompt، retention drift و purge ناقص را
بررسی کن. in-memory Map یا hash بدون encryption و replica evidence جای cache privacy integration واقعی نیست.
```

## DoD و production evidence boundary

- entry، lookup، write، expiry، sensitive denial، poisoning denial و purge تست شوند.
- cache backend، KMS/BYOK adapter، invalidation bus، poisoning detector، DLP و replica purge worker باید متصل شوند.
- kernel M177 به‌تنهایی confidentiality، hit-rate، deletion completeness یا cache poisoning production claim نیست.
