# فاز M169: Context Provenance و Prompt-injection Firewall

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/context-integrity-runtime.ts`
**تست:** `test/next-platform-hardening-phases-9.test.ts`
**gap:** `GAP-IN-21`

## هدف و مرز

M169 context را به envelope قابل‌ردیابی با source hash، trust level، freshness، token budget،
redaction، citation و injection scan تبدیل می‌کند. external/user content هرگز system instruction
نیست و scan failure باید quarantine بسازد. این فاز context assembler، provenance store، classifier،
quarantine queue یا response firewall واقعی نیست.

## معماری

- `validateM169Context`: هم‌ترازی source arrays، token budget، state، tenant و untrusted separation.
- `decideM169Source`: locator/content hash، freshness، trust، external-content و tenant.
- `validateM169InjectionScan`: instruction override، secret request، tool manipulation و markup.
- `decideM169Citation`: claim/source hash، position، source trust و tenant.

Local-first می‌تواند lexical/context store محلی داشته باشد؛ داده external فقط با trust پایین و citation
و expiry وارد می‌شود. BYOK، free-tier یا webpage نمی‌تواند trust system را ارتقا دهد. README، Issue،
webpage و payload مدل همچنان untrusted data هستند.

## sprint plan

### Sprint A — Context envelope

source registry، hash، trust level، snapshot و token budget.

### Sprint B — Freshness و citation

expiry، lineage، citation mapping و stale-source denial.

### Sprint C — Injection firewall

pattern/classifier، canary، quarantine و tool-target block.

### Sprint D — Gateway integration

context assembler، redaction، tenant retrieval، regression corpus و response gate.

## Threat Model

- **Prompt injection:** source trust، scan، quarantine و no-execution default.
- **Instruction override:** system/user boundary و immutable policy hash.
- **Stale or forged source:** content/locator hash و freshness.
- **Secret request:** scan و redaction پیش از model call.
- **Cross-tenant context:** tenant-bound source و citation.
- **Citation laundering:** required citation فقط با source evidence پذیرفته می‌شود.

## prompt pack

### `m169-context-integrity-engineer`

```text
نقش: Context Integrity Engineer

هر source را با locator/content hash، trust، tenant و expiry ثبت کن. external/user content را از
system instruction جدا نگه دار. پیش از model call injection scan، secret scan، tool-target guard و
redaction انجام بده و claimهای حساس را با citation قابل‌ردیابی برگردان.
```

### `m169-context-auditor`

```text
نقش: Context Security Auditor

trust escalation، stale source، prompt injection، secret request، cross-tenant context و citation
laundering را بررسی کن. prompt template یا mock scanner جای provenance store، quarantine و firewall واقعی نیست.
```

## DoD و production evidence boundary

- envelope، source expiry، injection block، citation معتبر و tenant mismatch تست شوند.
- context assembler، provenance/freshness store، classifier، quarantine، DLP و response firewall باید متصل شوند.
- kernel M169 به‌تنهایی prompt-injection recall، source correctness، no-leak یا context quality production claim نیست.
