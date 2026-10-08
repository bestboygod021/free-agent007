# فاز M110: Model Discovery، AI Directory و Free API Verification

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IN-14`، `GAP-IN-17`، `GAP-IN-18`، `GAP-IG-08`، `GAP-LG-02`
**کد kernel:** `src/core/model-discovery-directory-runtime.ts`
**تست:** `test/next-product-surface-phases.test.ts`

## هدف و مرز

M110 discovery candidate، model card، source provenance، free endpoint verification و activation
fallback را جدا می‌کند. وب، community و README فقط untrusted data هستند. free claim باید با health
probe، quota، ToS و no-raw-key evidence همراه باشد. model activation باید privacy، quota، consent
و local/BYOK/free fallback داشته باشد. این فاز web crawler، AI directory UI، provider health
service، API key vault یا automated publication واقعی را اجرا نمی‌کند.

## معماری

`M110ModelCandidateContract` source، URL، description hash، license، capability و context window
را نگه می‌دارد و description خارجی را untrusted علامت می‌زند. `M110FreeEndpointEvidence` protocol،
auth mode، schema، quota، ToS و raw-key boundary را ثبت می‌کند. `M110CatalogPublicationRequest`
lifecycle، model card، provenance، safety review، freshness و reviewer را gate می‌کند.
`M110ModelActivationRequest` route، consent، privacy، quota و fallback را enforce می‌کند.

## قراردادهای اصلی

- `validateM110ModelCandidate`: source provenance، HTTPS، capability، license و untrusted description را validate می‌کند.
- `validateM110FreeEndpointEvidence`: endpoint، protocol، health، quota، ToS و no-raw-key را بررسی می‌کند.
- `decideM110CatalogPublication`: lifecycle، freshness، reviewer و publication approval را gate می‌کند.
- `decideM110ModelActivation`: verification، privacy، quota، consent و fallback را enforce می‌کند.

## sprintها

### Sprint A — Discovery

- bounded web/community discovery
- source provenance
- description/license reference
- candidate dedupe

### Sprint B — Directory

- taxonomy/capabilities
- model card
- freshness/health
- free API badge

### Sprint C — Endpoint Verification

- OpenAI-compatible/Ollama/custom probe
- schema/status
- quota/ToS review
- BYOK/local credential boundary

### Sprint D — Activation

- publication review
- privacy route
- local/BYOK/free fallback
- suspend/revalidate

## Threat Model

- **Web prompt injection:** webpage/README فقط untrusted candidate data است.
- **Fake free API:** health، quota و ToS باید evidence مستقل داشته باشند.
- **Key leakage:** raw key در candidate، probe یا catalog ذخیره نمی‌شود.
- **Unsafe activation:** privacy review، consent و fallback پیش‌شرط activation هستند.
- **Stale listing:** freshness و suspension lifecycle از claim قدیمی جلوگیری می‌کند.

## Prompt pack

### `m110-model-discovery-engineer`

```text
نقش: Model Discovery and Directory Engineer

candidate را با source URL، provenance، license، capability، context window و untrusted description
ثبت کن. free endpoint فقط با HTTPS یا loopback، health/schema/quota/ToS و no-raw-key evidence
verified شود. activation باید local/BYOK/free fallback، privacy review و user consent داشته باشد.
```

### `m110-directory-evidence-gate`

```text
نقش: Model Directory Evidence Gate

برای discovery، model card، health probe، quota، ToS و activation، source/request/response hash،
freshness، reviewer، command و exit code ثبت کن. web snippet یا provider claim جای API probe،
quota evidence، license review و catalog publication control واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای candidate، endpoint evidence، publication و activation.
- bounded harvester، directory/index، provider health probe، credential broker و publication UI باید integration شوند.
- kernel M110 به‌تنهایی AI directory، free API verification یا safe model activation production را ثابت نمی‌کند و `done_tested` نیست.
