# فاز M99: Agent Delegation، Structured Streaming و Tool Safety

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IN-08`، `GAP-IN-10`، `GAP-IN-11`، `GAP-IN-12`، `GAP-API-04`
**کد kernel:** `src/core/agent-delegation-stream-runtime.ts`
**تست:** `test/next-agent-platform-phases.test.ts`

## هدف و مرز

M99 قرارداد واگذاری بین agentها، structured-output recovery، stream resume و tool-target
safety را یکپارچه می‌کند. delegation باید tenant، schema، ابزار، path، budget، expiry و nonce
داشته باشد. stream فقط eventهای redacted و non-terminal را از cursor معتبر replay می‌کند. repair
محدود است و خروجی حل‌نشده به human review می‌رود. این فاز مدل provider، stream server، parser
تولیدی، sandbox executor، API gateway یا delegation scheduler واقعی را اجرا نمی‌کند.

## معماری

`AgentDelegationContract` مرز issuer/recipient، schema hash، allowlist و budget را ثبت می‌کند.
`StructuredOutputRecoveryEvidence` valid/refusal/repair evidence را جدا نگه می‌دارد.
`AgentStreamResumeRequest` tenant match، last event و terminal state را gate می‌کند.
`AgentToolTargetRequest` برای file/command path-relative و برای API/connector HTTPS، approval و
idempotency را enforce می‌کند. kernel هیچ prompt یا raw model outputی را ذخیره نمی‌کند.

## قراردادهای اصلی

- `validateAgentDelegation`: delegation cross-tenant، budget، expiry و tool/path allowlist را رد می‌کند.
- `decideStructuredOutputRecovery`: repair را حداکثر دو بار و خروجی unresolved را با human review می‌پذیرد.
- `validateAgentStreamResume`: Last-Event-ID، redaction، tenant و terminal boundary را validate می‌کند.
- `decideAgentToolTarget`: مسیر فایل/command، HTTPS، untrusted-input separation و approval را gate می‌کند.

## sprintها

### Sprint A — Delegation Contract

- input/output schema و version
- issuer/recipient separation
- budget، expiry، nonce و audit
- nested delegation cap

### Sprint B — Structured Output

- schema validation
- bounded repair loop
- refusal و safety stop
- human review handoff

### Sprint C — Streaming

- event envelope
- cursor و Last-Event-ID
- replay/redaction
- terminal event و reconnect

### Sprint D — Tool Boundary

- file/API target guard
- path و endpoint allowlist
- idempotent tool call
- approval و sandbox handoff

## Threat Model

- **Privilege amplification:** child agent فقط ابزار، path و budget واگذارشده را می‌بیند.
- **Stream replay leakage:** stream tenant match، cursor و redaction اجباری دارد.
- **Repair loop abuse:** repair count محدود است؛ خروجی نامعتبر خودکار موفق اعلام نمی‌شود.
- **Path/API hallucination:** target باید allowlisted، relative یا HTTPS باشد.
- **Prompt injection:** untrusted input از tool instruction جدا می‌ماند.

## Prompt pack

### `m99-agent-interaction-engineer`

```text
نقش: Agent Interaction Engineer

delegation را با issuer/recipient، schema hash، tool/path allowlist، token budget، expiry و nonce
طراحی کن. structured output را validate کن؛ repair را حداکثر دو بار انجام بده و failure را human
review کن. stream فقط با tenant match، cursor، Last-Event-ID و redaction replay شود.
```

### `m99-stream-safety-evidence-gate`

```text
نقش: Streaming Safety Evidence Gate

برای delegation، repair، stream replay و tool target، schema/hash، tenant، cursor، approval،
command و exit code ثبت کن. mock stream یا JSON نمونه جای provider stream، reconnect، sandbox و
production API evidence نیست. raw model output و secret را در evidence ذخیره نکن.
```

## DoD و production evidence boundary

- unit/contract برای delegation، schema repair، stream resume و tool-target guard.
- provider adapter، structured parser، SSE/WebSocket service، persistent cursor، sandbox و E2E باید integration شوند.
- kernel M99 به‌تنهایی agent orchestration، streaming production یا safe tool execution را ثابت نمی‌کند و `done_tested` نیست.
