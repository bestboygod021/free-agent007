# فاز M61: Model Provider Runtime و Intelligent Routing

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IG-02`، `GAP-IG-08`، `GAP-IN-10`، `GAP-OB-04`، `GAP-PO-01`
**کد kernel:** `src/core/model-provider-runtime.ts`
**تست:** `test/next-ai-platform-phases.test.ts`

## هدف و مرز

M61 catalog/trust را به مسیر اجرای model وصل می‌کند: endpointهای local، free و paid، privacy
mode، task capability، context window، quota reference و fallback. کاربر یا policy می‌تواند
local-only، tenant-safe یا cloud-allowed انتخاب کند. این فاز network adapter، provider SDK،
queue، token broker یا اجرای واقعی مدل را انجام نمی‌دهد؛ با `free-provider-pool` و model router
فعلی فقط decision boundary تعریف می‌کند.

## معماری

`ModelProviderEndpoint` catalogId/modelId/providerId، mode/locality، opaque credential
reference، task، context، free API status، trust level، concurrency و quota reference دارد.
`ModelRuntimeRequest` privacy، estimated tokens، egress consent و budget را حمل می‌کند.
`decideModelRuntimeRoute` فقط endpointهای enabled و non-blocked را route می‌کند و fallback
را deterministic نگه می‌دارد. auth/policy failure اجازه fallback کور نمی‌دهد.

## قراردادهای اصلی

- `validateModelProviderEndpoint` HTTPS، locality/mode، credential، capability، limit و trust را validate می‌کند.
- `decideModelRuntimeRoute` task، model preference، privacy، mode، egress و budget را route می‌کند.
- `decideModelProviderFallback` timeout/rate-limit را از auth/policy failure جدا می‌کند.

## sprintها

### Sprint A — Provider Adapter

- OpenAI-compatible/Anthropic/Gemini/local adapter boundary
- request/response normalization
- streaming/structured-output capability
- opaque credential injection

### Sprint B — Routing

- trust/capability/context filtering
- local-first و BYOK/free route
- sticky session و fallback chain
- provider error taxonomy

### Sprint C — Quota و Cost

- RPM/RPD/TPM/TPD accounting
- cooldown و Retry-After
- cost estimate و hard stop
- user-visible route explanation

### Sprint D — Runtime Integration

- queue/worker execution
- model router/catalog sync
- provider contract tests
- privacy/egress/tenant E2E

## Threat Model

- **Wrong model/tenant route:** catalog، organization، task، privacy و mode قبل از انتخاب بررسی می‌شوند.
- **Hidden cloud egress:** local_only فقط locality local می‌پذیرد؛ cloud بدون egress consent رد می‌شود.
- **Credential leak:** endpoint فقط opaque credential reference می‌گیرد و raw key وارد route نمی‌شود.
- **Retry storm/cost blowup:** quota، max concurrency، budget و fallback failure policy جلوی retry کور را می‌گیرند.
- **Untrusted provider:** trust blocked یا disabled endpoint هرگز route نمی‌شود.

## Prompt pack

### `m61-model-provider-engineer`

```text
نقش: Model Provider Runtime Engineer

catalog و trust را پیش از route enforce کن. endpoint را با task، context، privacy، mode و
quota انتخاب کن. local_only هرگز cloud نمی‌گیرد. free/BYOK فقط با egress consent و opaque
credential reference مجاز است. auth/policy failure را با timeout/rate-limit قاطی نکن و retry
storm نساز.
```

### `m61-routing-evidence-gate`

```text
نقش: Model Routing Evidence Gate

برای endpoint validation، route candidate، privacy deny، quota، cooldown، fallback و model
switch، route decision، quota snapshot، command، exit code و provider response redacted را
ثبت کن. deterministic selection جای network/provider execution evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای endpoint، trust، task, mode، privacy، egress، budget، quota و fallback.
- provider adapters، credential broker، queue، streaming، router integration و real API probes باید اجرا شوند.
- route decision به‌تنهایی ثابت نمی‌کند model پاسخ داده، latency واقعی دارد یا fallback سالم است؛ `done_tested` نیست.
