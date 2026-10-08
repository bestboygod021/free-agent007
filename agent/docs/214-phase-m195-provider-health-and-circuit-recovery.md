# فاز M195: Provider Health و Circuit Recovery

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/provider-health-runtime.ts`
**تست:** `test/next-platform-hardening-phases-14.test.ts`
**gap:** `GAP-IG-20`

## هدف و مرز

M195 provider manifest، health sample امضاشده، latency/status/quota، circuit state، cooldown، half-open
probe، route admission و honest fallback را کنترل می‌کند. local provider اولویت دارد؛ free-tier/BYOK/hosted
با consent و budget وارد route می‌شوند. این فاز health collector، circuit store، provider gateway،
quota adapter، probe worker یا failover runtime واقعی نیست.

## معماری

- `validateM195Provider`: endpoint reference، capability، quota، region، terms، credential reference و health policy.
- `validateM195Health`: sample time/status/latency/quota، evidence، signature و tenant.
- `decideM195Circuit`: failure threshold، cooldown، fallback disclosure، probe، approval و tenant.
- `decideM195Route`: candidate set، fresh health، quota، budget، consent، egress و selected provider.

هیچ raw key در provider manifest نیست و credential فقط reference است. در degraded mode علت fallback، هزینه،
quota و data egress باید به کاربر اعلام شود.

## Sprint plan

### Sprint A — Provider registry

mode، capability، endpoint، quota، region و terms review.

### Sprint B — Health evidence

signed sample، latency/status/error، quota و freshness.

### Sprint C — Circuit

closed/open/half-open، threshold، cooldown و probe.

### Sprint D — Route recovery

candidate route، budget، consent، fallback و recovery controller.

## Threat Model

- **Provider outage پنهان:** signed health و circuit state.
- **Retry storm:** open circuit و cooldown.
- **Probe abuse:** half-open probe gate.
- **Quota overspend:** quota/budget admission.
- **ناهماهنگی fallback:** explicit disclosure و consent.
- **Endpoint/credential spoofing:** reference، terms و tenant binding.

## prompt pack

### `m195-provider-ops-engineer`

```text
نقش: Provider Health Engineer

provider را با mode، capability، endpoint reference، quota، region و health policy ثبت کن. health sample
باید signed و time-bound باشد. circuit با threshold/cooldown/probe کار کند و route فقط با health تازه،
quota، budget، consent و fallback disclosure مجاز شود.
```

### `m195-provider-auditor`

```text
نقش: Provider Reliability Auditor

stale health، retry storm، half-open abuse، quota overspend، endpoint spoof و silent fallback را بررسی کن.
health ping یا provider list mock جای collector، circuit store، quota adapter و route gateway واقعی نیست.
```

## DoD و production evidence boundary

- provider، health invalid، open circuit، cooldown/probe و route denial تست شوند.
- health collector، signed sample store، circuit/quota gateway، route controller، probe worker و fallback UI باید متصل شوند.
- kernel M195 به‌تنهایی availability، failover، quota accuracy، routing quality یا provider SLA production claim نیست.
