# فاز M129: API Evolution، Schema Migration و Stream Reconnect

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/api-evolution-runtime.ts`
**تست:** `test/next-platform-hardening-phases.test.ts`
**gap:** `GAP-API-09`

## هدف و مرز

M129 چرخه عمر API عمومی را از contract ثابت به evolution کنترل‌شده تبدیل می‌کند. هر نسخه باید schema hash، tenant boundary، lifecycle، documentation و compatibility window داشته باشد. error envelope باید public-safe، correlation-bound و retry-aware باشد. stream resume باید cursor، tenant match، redaction و terminal state را gate کند. migration breaking باید consumer test، migration guide، rollback و approval داشته باشد. این kernel API gateway، schema registry، SSE broker، consumer fleet یا migration runner واقعی نیست.

## معماری و قراردادها

- `validateM129ApiContract`: version، protocol، schema hashes، lifecycle، compatibility و tenant scope.
- `validateM129Error`: error taxonomy، HTTP status، retry semantics، correlation و redaction.
- `decideM129StreamResume`: cursor، tenant match، replay limit، terminal state و event redaction.
- `decideM129Migration`: version transition، breaking change، consumer tests، rollback و approval.

هیچ internal detail، raw password، token یا provider secret در public error یا stream event قرار نمی‌گیرد.

## sprint plan

### Sprint A — API catalogue

versioned operation catalogue، schema hash، lifecycle و deprecation policy.

### Sprint B — Error contract

stable error code، retry classification، correlation ID، public message و internal hash.

### Sprint C — Stream continuity

cursor/replay، fresh snapshot، tenant isolation و terminal event handling.

### Sprint D — Migration governance

consumer contract tests، migration guide، compatibility window، rollback و approval.

## Threat Model

- **Silent breaking change:** schema diff و consumer test لازم است.
- **Cross-tenant stream replay:** tenant match و bounded cursor gate اجباری است.
- **Retry storm:** error class و retryability باید deterministic باشند.
- **Internal leakage:** public message و internal hash از هم جدا می‌شوند.
- **Deprecated API persistence:** deprecation date و compatibility window لازم است.

## prompt pack

### `m129-api-evolution-engineer`

```text
نقش: API Evolution Engineer

هر operation را با version، request/response schema hash، lifecycle، tenant scope و compatibility
window ثبت کن. breaking migration باید consumer test، migration guide، rollback و approval داشته
باشد. SSE resume فقط با tenant match، cursor و redacted replay مجاز است.
```

### `m129-contract-reviewer`

```text
نقش: API Contract Reviewer

schema diff، error taxonomy، retry semantics، deprecation، stream cursor و cross-tenant replay را
بررسی کن. internal detail و secret را به public response نبر. mock gateway یا unit test جای
consumer fleet، stream broker یا migration evidence واقعی نیست.
```

## DoD و production evidence boundary

- contract version، error، stream resume و breaking migration با مسیرهای مثبت و منفی تست شوند.
- schema registry، API gateway، consumer contract CI، SSE replay store و migration automation باید integration شوند.
- kernel M129 به‌تنهایی backward compatibility، stream durability، API availability یا safe migration production claim نیست.
