# فاز M181: Performance Budget و Load Shedding

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/performance-budget-runtime.ts`
**تست:** `test/next-platform-hardening-phases-11.test.ts`
**gap:** `GAP-OB-11`

## هدف و مرز

M181 برای هر workload سقف latency، queue age، token، concurrency و error rate تعریف می‌کند و admission،
queue، degrade یا shed را explicit و bounded تصمیم می‌دهد. provider عوض‌کردن بی‌صدا مجاز نیست؛ این فاز
telemetry backend، load generator، scheduler، autoscaler یا circuit-breaker production نیست.

## معماری

- `validateM181Budget`: latency/queue/token/concurrency/error bounds، approval و tenant.
- `decideM181Admission`: estimate، deadline، concurrency، egress approval و idempotency.
- `validateM181LoadEvidence`: window، samples، p95/p99، error rate، redaction و budget status.
- `decideM181Shedding`: explicit action، retry-after، safe degradation، no silent provider change و approval.

Local-first budgetها باید با resource واقعی دستگاه صادق باشند؛ free-tier/BYOK fallback فقط با disclosure و
policy مجاز است. hard stop، queue یا degrade نباید raw request یا credential را به endpoint ناشناخته بفرستد.

## Sprint plan

### Sprint A — Budget model

workload، priority، latency، queue، token، concurrency و error budget.

### Sprint B — Admission

estimate، deadline، idempotency، egress و tenant-safe admission.

### Sprint C — Evidence

window، sample، p95/p99، queue age، error rate و budget reconciliation.

### Sprint D — Shedding

queue/degrade/shed، retry-after، explicit fallback و operator escalation.

## Threat Model

- **Queue collapse:** bounded queue age و admission denial.
- **Token/cost runaway:** token budget و hard stop.
- **Silent provider switch:** no-silent-provider-change و disclosure.
- **Priority starvation:** explicit priority و bounded concurrency.
- **False performance pass:** real window/sample evidence.
- **Unsafe degradation:** approved safe mode و tenant boundary.

## prompt pack

### `m181-performance-engineer`

```text
نقش: Performance Budget Engineer

برای هر workload budget صریح latency، queue، token، concurrency و error تعریف کن. admission را با
estimate، deadline، egress و idempotency بررسی کن. در فشار، queue/degrade/shed را bounded و disclosed
کن و provider را بدون policy و رضایت بی‌صدا عوض نکن.
```

### `m181-performance-auditor`

```text
نقش: Performance Auditor

queue collapse، token runaway، priority starvation، false p95، silent fallback و unsafe degrade را
بررسی کن. benchmark یک‌باره یا sleep mock جای telemetry window و load-shedding enforcement واقعی نیست.
```

## DoD و production evidence boundary

- budget، admission، load evidence، queue/degrade/shed و denied egress تست شوند.
- telemetry collector، budget ledger، admission gateway، scheduler، load runner و alert/autoscaler باید متصل شوند.
- kernel M181 به‌تنهایی latency SLO، capacity، availability، cost accuracy یا load-shedding production claim نیست.
