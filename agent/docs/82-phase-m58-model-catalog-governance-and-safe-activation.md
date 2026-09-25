# فاز M58: Model Catalog Governance و Safe Activation

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IN-17`، `GAP-IN-18`، `GAP-IG-08`، `GAP-PO-01`
**کد kernel:** `src/core/model-catalog-governance-runtime.ts`
**تست:** `test/visual-model-directory-phases.test.ts`

## هدف و مرز

M58 discovery و directory را به registry قابل استفاده در خود پلتفرم وصل می‌کند، اما با
lifecycle صریح: `candidate → verified → listed → enabled → retired`. مدل‌های جدید می‌توانند
به‌صورت خودکار به candidate registry اضافه شوند، ولی publication و activation بدون evidence،
review، consent و provider configuration انجام نمی‌شود. این فاز catalog store، model router
integration، health scheduler، UI activation یا real API call را اجرا نمی‌کند.

## معماری

`ModelCatalogRecord` organization-scoped است و description، category، source evidence، free API
evidence و verification timestamp دارد. `decideCatalogPublication` official/reviewed evidence
و reviewer approval را لازم می‌کند. `decideModelActivation` modeهای free_api، byok، local و
manual_provider را با consent، egress، opaque credential reference و health state بررسی می‌کند.
`validateModelHealthEvidence` probe hash و capability response را از ادعای availability جدا
می‌کند. refresh بدون source evidence یا review رد می‌شود.

## قراردادهای اصلی

- `validateModelCatalogRecord` record، category، evidence، free badge، retirement و timestamp را بررسی می‌کند.
- `decideCatalogPublication` candidate-to-listed publication را با official evidence و approval gate می‌کند.
- `decideModelActivation` free API/BYOK/local/manual activation، consent و egress را enforce می‌کند.
- `validateModelHealthEvidence` availability، latency، probe و capability response را validate می‌کند.
- `decideCatalogRefresh` source evidence، timestamp و reviewer approval را برای refresh لازم می‌داند.

## sprintها

### Sprint A — Catalog Lifecycle

- candidate ingestion و dedupe
- verification/review queue
- listed/retired transition
- source/evidence retention

### Sprint B — User Activation

- add-to-system consent
- free API activation با quota/cooldown
- BYOK credential reference
- local model activation و no-egress

### Sprint C — Health و Routing

- provider/model health probe
- latency/capability evidence
- rate-limit و retirement
- model router catalog sync

### Sprint D — Governance و Operations

- audit/history و rollback
- user feedback و abuse report
- refresh scheduler و stale detection
- backup/export/restore و admin review

## Threat Model

- **Auto-add به‌معنای auto-enable نیست:** discovery فقط candidate می‌سازد؛ listed/enabled نیازمند evidence و approval است.
- **Free API deception:** free activation بدون evidence معتبر، quota و terms review رد می‌شود؛ paid یا unknown با badge اشتباه نمایش داده نمی‌شود.
- **Credential misuse:** BYOK فقط opaque reference و explicit egress دارد؛ raw credential و secret در catalog ذخیره نمی‌شود.
- **Retired/unhealthy activation:** مدل retired، candidate یا unhealthy active نمی‌شود؛ health evidence تاریخ‌دار و قابل audit است.
- **Provider rate/cost risk:** quota، retry/cooldown و mode انتخابی باید به user-visible state تبدیل شوند؛ fallback پنهان ممنوع است.

## Prompt pack

### `m58-model-catalog-governance-engineer`

```text
نقش: Model Catalog Governance Engineer

lifecycle candidate→verified→listed→enabled→retired را immutable/auditable نگه دار. مدل
کشف‌شده را خودکار candidate کن، نه enabled. publication به official/reviewed evidence و
approval نیاز دارد. free API را فقط با evidence و quota فعال کن؛ BYOK را با opaque reference
و egress consent و local را بدون egress نگه دار. health و retirement را قبل از routing بررسی کن.
```

### `m58-catalog-evidence-gate`

```text
نقش: Catalog Activation Evidence Gate

برای ingestion، review، publication، activation، free API، BYOK، local, health، retirement و
refresh، source/model/evidence hash، consent، mode، probe output، quota و exit code ثبت کن.
registry fixture یا catalog unit test جای provider activation و routing integration evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای lifecycle، publication، free badge، activation mode، credential reference، health و refresh.
- catalog store، router integration، provider probe، quota/cooldown، activation UI و scheduler باید integration شوند.
- اضافه‌شدن candidate به registry به‌تنهایی به معنی model فعال، API رایگان قابل استفاده یا سلامت production نیست و `done_tested` نمی‌شود.
