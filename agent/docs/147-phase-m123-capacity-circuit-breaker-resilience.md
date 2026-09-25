# فاز M123: Capacity Planning، Circuit Breaker، Failure Injection و Resilience Operations

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-RES-01`، `GAP-CAP-03`، `GAP-OPS-05`، `GAP-ALERT-06`
**کد kernel:** `src/core/resilience-capacity-runtime.ts`
**تست:** `test/next-hardening-phases.test.ts`

## هدف و مرز

M123 ظرفیت، budget، circuit breaker، bounded failure experiment و alert عملیاتی را تعریف می‌کند.
ظرفیت باید بر اساس workload، concurrency، latency، error budget، saturation و headroom مدل شود.
Circuit breaker باید closed/open/half-open، threshold، cooldown و recovery evidence داشته باشد.
Failure experiment فقط sandboxed، bounded، reversible و بدون data loss است. chaos platform، autoscaler،
production traffic، alert manager و observability backend واقعی در kernel نیستند.

## معماری

`M123CapacityPlan` workload، concurrency، latency، error budget، headroom، bottleneck، forecast و
rollback را validate می‌کند. `M123CircuitBreaker` state، threshold، cooldown، probe، fallback و
recovery را gate می‌کند. `M123FailureExperiment` target، sandbox، blast radius، duration، recovery
و data-loss guard را بررسی می‌کند. `M123CapacityAlert` signal، threshold، customer impact، action
و acknowledgement را validate می‌کند.

## sprintها

### Sprint A — Capacity model

baseline، workload class، SLO، headroom، bottleneck و forecast.

### Sprint B — Circuit breaker

state machine، trip/recovery، half-open probe، fallback و tenant isolation.

### Sprint C — Failure experiments

sandbox، allowlist، blast radius، timeout، rollback و no-data-loss assertion.

### Sprint D — Resilience operations

alert routing، customer-impact redaction، runbook، acknowledgement و postmortem.

## Threat Model

- **Overload cascade:** bounded concurrency، breaker و backpressure لازم است.
- **Retry storm:** cooldown، retry budget و dedupe لازم است.
- **Unsafe chaos:** sandbox، blast-radius limit، duration و rollback اجباری است.
- **Silent customer impact:** alert باید impact و action evidence داشته باشد.
- **Tenant leakage under fallback:** fallback همچنان tenant-bound می‌ماند.
- **False recovery:** half-open probe و independent recovery evidence لازم است.

## Prompt pack

### `m123-resilience-engineer`

```text
نقش: Capacity and Resilience Engineer

capacity را با workload، concurrency، latency، error budget، saturation، headroom و forecast
مدل کن. circuit breaker را با closed/open/half-open، threshold، cooldown، fallback و recovery
بساز. failure experiment فقط sandboxed، bounded، reversible و no-data-loss باشد.
```

### `m123-operations-reviewer`

```text
نقش: Resilience Operations Reviewer

alert باید signal، threshold، customer impact، redaction، action، acknowledgement و runbook داشته
باشد. chaos/autoscaling/telemetry واقعی را از deterministic contract جدا نگه دار و هیچ experimentی
را روی production یا داده غیرقابل‌بازگشت اجرا نکن.
```

## DoD و production evidence boundary

- capacity matrix، breaker negative paths، bounded experiment و actionable alert contract.
- real load/telemetry، service mesh breaker، autoscaler، chaos platform، alert routing و incident drill باید integration شوند.
- kernel M123 به‌تنهایی capacity readiness، resilience، failure recovery یا production operations claim نیست.
