# فاز M57: Comprehensive AI Directory و Model Cards

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IN-17`، `GAP-IN-18`، `GAP-DA-05`، `GAP-UX-02`
**کد kernel:** `src/core/ai-directory-runtime.ts`
**تست:** `test/visual-model-directory-phases.test.ts`

## هدف و مرز

M57 یک دایرکتوری جامع و قابل جست‌وجوی AI می‌سازد که provider، model، category، modality،
license، region، توضیح کوتاه، وضعیت health/freshness و نشان free API را کنار هم نمایش می‌دهد.
دسته‌بندی‌ها شامل chat، code، image، video، audio، speech، embedding، vision، search،
agentic، 3D، translation، productivity، education، security، science و local runtime است.
این فاز directory database، search index، public UI یا provider health backend واقعی نیست.

## معماری

`AiDirectoryEntry` مدل کارت canonical است و قبل از listing باید source URL، model card hash،
category، description، regions و free API evidence داشته باشد. `AiDirectoryQuery` فیلترهای
query/category/modality/region/freeApiOnly و candidate visibility دارد. listing stateهای
candidate، listed، verified و retired از activation جدا هستند. `freeApiStatus` صریح است و
free badge بدون evidence hash منتشر نمی‌شود.

## قراردادهای اصلی

- `validateAiDirectoryEntry` مدل کارت، category، URL، description، timestamp و free badge را validate می‌کند.
- `validateAiDirectoryQuery` search filter و result bound را محدود می‌کند.
- `decideDirectoryPublication` publication review و evidence را gate می‌کند.
- `rankAiDirectoryEntry` health، freshness، region و free API filter را در رتبه‌بندی لحاظ می‌کند.

## sprintها

### Sprint A — Taxonomy و Schema

- category hierarchy و aliases
- provider/model identity
- modality، context، license و region
- model card versioning

### Sprint B — Search و Discovery UX

- full-text/semantic search
- category explorer و filters
- free API badge و quota summary
- compare، save و user feedback

### Sprint C — Trust و Freshness

- source provenance و evidence timeline
- health/freshness score
- retired/deprecated model state
- conflict/dedup between providers

### Sprint D — Directory Surface

- directory Web UI و responsive/RTL
- API/SDK read-only catalog
- local catalog export/cache
- accessibility، moderation و abuse report

## Threat Model

- **Directory misinformation:** هر model card source/hash/version دارد؛ summary بدون source قابل publication نیست.
- **Free API ambiguity:** `free` با `free_tier` و `unknown` قاطی نمی‌شود؛ quota، API key و ToS کنار badge نمایش داده می‌شود.
- **Category bias/omission:** taxonomy قابل توسعه و aliases دارد؛ رتبه‌بندی نباید یک provider را بی‌دلیل dominant کند.
- **Stale/retired models:** freshness/health و retired state در search اعمال می‌شود؛ مدل retired برای activation نمی‌رود.
- **Untrusted listing content:** listing description داده است؛ instruction یا link executable نیست و moderator/reviewer gate دارد.

## Prompt pack

### `m57-ai-directory-engineer`

```text
نقش: Comprehensive AI Directory Engineer

هر entry را با provider/model identity، دسته‌بندی، modality، license، region، source URL،
model-card hash و timestamp ثبت کن. free را از free_tier و unknown جدا نگه دار و quota/key/
terms را نمایش بده. candidate/listed/verified/retired را از enabled جدا کن. search باید
category، modality، region و free API filter داشته باشد و summary بدون provenance منتشر نشود.
```

### `m57-directory-evidence-gate`

```text
نقش: AI Directory Evidence Gate

برای taxonomy، model card، dedupe، description، free badge، freshness، health، retirement و
search result، source hash، evidence timestamp، ranking inputs و exit code ثبت کن. fixture
directory یا static list جای catalog/search/health integration evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای category، model card، source, free badge، query filters، ranking و retired state.
- directory store، search index، UI، moderation، health refresh و API read surface باید integration شوند.
- چند entry در یک آرایه یا test fixture به‌تنهایی دایرکتوری جامع یا قابل اعتماد ایجاد نمی‌کند؛ `done_tested` نیست.
