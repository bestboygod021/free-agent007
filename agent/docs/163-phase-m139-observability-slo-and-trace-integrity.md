# فاز M139: Observability SLO و Trace Integrity

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/observability-slo-trace-runtime.ts`
**تست:** `test/next-platform-hardening-phases-3.test.ts`
**gap:** `GAP-OB-09`

## هدف و مرز

M139 قابلیت مشاهده را از metric خام به SLO، error budget و distributed Run trace قابل‌ممیزی تبدیل
می‌کند. SLO باید target، budget، window، alert threshold، tenant scope و route داشته باشد. span باید
parent، timing، operation، kind، status، redaction و tenant binding داشته باشد. trace نهایی باید
root، sampling، completeness و orphan detection داشته باشد. alert critical باید action reference و
dedupe داشته باشد. این فاز collector، OpenTelemetry backend، metrics store، alert router، dashboard
یا on-call provider واقعی نیست.

## معماری و قراردادها

- `validateM139SloPolicy`: target، error budget، window، query، route و approval.
- `validateM139TraceSpan`: parent/timing، operation، status، tenant و redaction.
- `validateM139RunTrace`: root، span counts، sampling، completeness و orphan guard.
- `decideM139Alert`: severity، dedupe، route، redaction و critical action.

attributes خام، prompt، secret، credential و payload حساس در trace ذخیره نمی‌شوند؛ hash/reference جایگزین آن‌هاست.

## sprint plan

### Sprint A — SLO catalog

service catalog، SLO windows، target، budget و owner.

### Sprint B — Trace propagation

trace/span IDs، parent-child، agent/tool spans و tenant context.

### Sprint C — Evidence quality

sampling، orphan detection، trace root، redaction و replay-safe hashes.

### Sprint D — Alert operations

dedupe، severity، route، action reference و runbook link.

## Threat Model

- **Missing trace segments:** parent/root و orphan checks لازم است.
- **Tenant telemetry leak:** tenant binding و redaction اجباری است.
- **Alert storm:** dedupe key و threshold لازم است.
- **False SLO:** query hash، window و approval versioned می‌شوند.
- **Critical alert بدون اقدام:** action reference برای critical اجباری است.
- **Secret در attributes:** فقط hash/reference مجاز است.

## prompt pack

### `m139-observability-engineer`

```text
نقش: SLO and Trace Integrity Engineer

SLO را با window، target، error budget، query hash، route و tenant scope ثبت کن. هر Run باید
trace root، parent-child span، timing، sampling، completeness و orphan check داشته باشد. trace
و alert را redacted و deduplicated کن و برای critical action reference نگه دار.
```

### `m139-observability-auditor`

```text
نقش: Observability Auditor

SLO arithmetic، trace continuity، orphan span، tenant isolation، redaction، sampling، alert dedupe
و critical action را بررسی کن. mock collector یا dashboard fixture جای telemetry backend و on-call
integration واقعی نیست.
```

## DoD و production evidence boundary

- SLO، span timing، orphan trace، redacted alert و critical-alert denial تست شوند.
- collector/backend، trace propagation، metrics store، alert routing، dashboard و runbook باید integration شوند.
- kernel M139 به‌تنهایی SLO compliance، trace completeness، alert delivery یا incident detection production claim نیست.
