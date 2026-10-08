# فاز M39: Agent Interaction و Streaming Runtime

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IN-10`، `GAP-IN-11`، `GAP-IN-12`، `GAP-UX-03`، `GAP-API-04`
**کد kernel:** `src/core/agent-interaction-runtime.ts`
**تست:** `test/next-runtime-phases.test.ts`

## هدف و مرز

M39 مرز output structured، repair loop، model streaming، stream resume و tool-target
guardrail را تعریف می‌کند. خروجی مدل، README، Issue و webpage همچنان untrusted هستند؛
این فاز model provider، stream transport، grammar decoder، UI terminal یا API gateway
واقعی اجرا نمی‌کند.

## معماری

Model adapter هر attempt را با schema/output hash وارد decision kernel می‌کند. بسته به
invalid JSON، schema error یا refusal، repair planner grammar retry، schema repair،
model fallback یا human review را انتخاب می‌کند. stream gateway frameها را با sequence،
byte budget و terminal state به‌صورت resumable کاهش می‌دهد. tool guard پیش از file/API
call path، host، method و side effect approval را بررسی می‌کند.

## قراردادهای اصلی

- `validateStructuredOutputAttempt` هویت run، schema/output hash و bounded attempt را بررسی می‌کند.
- `planStructuredOutputRepair` repair strategy و نیاز به human review را deterministic می‌کند.
- `planModelOutputStream` cursor، frame/byte limit و resumability را gate می‌کند.
- `reduceStreamFrame` sequence gap، duplicate/terminal frame و byte accounting را رد می‌کند.
- `guardToolTarget` مسیر فایل، host API و side effect approval را enforce می‌کند.

## sprintها

### Sprint A — Structured Output و Repair

- JSON/schema validation و grammar-constrained retry
- repair loop با سقف attempt
- refusal و model fallback
- preservation hash برای output اولیه

### Sprint B — Streaming و Resume

- frame sequence و Last-Event-ID bridge
- checkpoint، reconnect و gap snapshot
- heartbeat، terminal/error state و byte budget
- live terminal/timeline projection

### Sprint C — Tool Target Guard

- path/API hallucination guard
- host/path allowlist و method policy
- approval برای write/execute/egress
- sandbox handoff و audit event

### Sprint D — Provider/UI Integration

- OpenAI-compatible/Anthropic/local stream adapter
- SSE/WebSocket transport
- incremental UI و cancellation
- replay و browser E2E با evidence واقعی

## Threat Model

- **Structured output bypass:** JSON یا schema error موفقیت نیست؛ repair attempt محدود و
  refusal به human review متصل است.
- **Stream replay/gap:** sequence باید contiguous باشد؛ frame بعد از terminal یا خارج از
  byte budget پذیرفته نمی‌شود و resume بدون cursor معتبر نیست.
- **Path/API hallucination:** model output authority نیست؛ path، host، method و allowlist
  پیش از tool call بررسی می‌شوند و localhost browser dependency ممنوع است.
- **Streaming data leak:** frame فقط hash/metadata و redaction boundary دارد؛ secret یا
  cross-tenant event در terminal/timeline نمایش داده نمی‌شود.

## Prompt pack

### `m39-agent-interaction-engineer`

```text
نقش: Agent Interaction and Streaming Engineer

structured output را با schema و attempt bound بررسی کن. invalid JSON، schema error و
refusal را یکی ندان؛ repair یا human review را صریح انتخاب کن. stream باید sequence،
resume، byte limit و terminal state داشته باشد. هر path/API برگرفته از model یا README
untrusted است و قبل از tool call به allowlist و approval نیاز دارد.
```

### `m39-interaction-evidence-gate`

```text
نقش: Interaction Evidence Gate

برای malformed output، repair، refusal، reconnect، sequence gap، cancellation، path
traversal و API allowlist، command، exit code، frame hash، schema hash و audit ثبت کن.
mock stream یا unit kernel جای provider/SSE/browser integration evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای malformed JSON، repair cap، refusal، stream gap/terminal و unsafe target.
- model adapter، grammar decoder، SSE/WebSocket، terminal UI، cancellation و E2E باید
  در integration مستقل اجرا شوند.
- structured-output success، stream reliability یا tool safety بدون output/frame/e2e
  evidence واقعی `done_tested` نیست.
