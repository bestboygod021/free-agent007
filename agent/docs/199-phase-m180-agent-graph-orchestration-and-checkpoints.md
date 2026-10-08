# فاز M180: Agent Graph Orchestration و Durable Checkpoints

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/agent-graph-runtime.ts`
**تست:** `test/next-platform-hardening-phases-11.test.ts`
**gap:** `GAP-EX-21`

## هدف و مرز

M180 graph اجرای agent را به node/edge معتبر، cycle denial، bounded parallelism، task idempotency،
lease، state schema و durable checkpoint تبدیل می‌کند. resume فقط با proof و state hash معتبر است؛
این فاز LangGraph/engine، durable queue، worker fleet، checkpoint store یا sandbox executor واقعی نیست.

## معماری

- `validateM180Graph`: node/edge، cycle، schema hash، version، max nodes/parallel و sandbox.
- `decideM180Task`: dependency، input/output hash، idempotency، timeout، lease و tenant.
- `validateM180Checkpoint`: sequence، graph version، state hash، resume proof و durability.
- `decideM180Transition`: typed transition، precondition، evidence و idempotent state change.

Local-first graph runner می‌تواند روی یک process اجرا شود، اما همان cycle، timeout و sandbox boundary را
حفظ می‌کند. BYOK/free-tier model مجاز نیست graph state، tool capability یا transition policy را تغییر دهد.

## Sprint plan

### Sprint A — Graph compiler

node/edge schema، cycle detection، graph version و bounded parallelism.

### Sprint B — Task runtime

dependency، lease، timeout، idempotency و task evidence.

### Sprint C — Checkpoint

state hash، sequence، durable snapshot، redaction و resume proof.

### Sprint D — Transition/recovery

start/succeed/fail/cancel/pause/resume، precondition، replay و failure containment.

## Threat Model

- **Graph cycle/deadlock:** static cycle detection و execution bounds.
- **Duplicate side effect:** idempotency key و checkpoint.
- **State corruption:** schema/version hash و resume proof.
- **Lease theft:** bounded lease و tenant binding.
- **Untrusted node:** sandbox requirement و policy hash.
- **False resume:** durable, redacted checkpoint evidence.

## prompt pack

### `m180-agent-graph-engineer`

```text
نقش: Agent Graph Engineer

graph را با node/edge schema، cycle check، version، max parallel و sandbox بساز. هر task dependency،
lease، timeout، idempotency و evidence دارد. checkpoint را با state hash، sequence و resume proof ثبت کن
و transition نامعتبر را fail-closed رد کن.
```

### `m180-graph-auditor`

```text
نقش: Agent Graph Auditor

cycle، deadlock، duplicate side effect، stale checkpoint، lease theft، schema drift و untrusted node را
بررسی کن. graph JSON یا in-memory runner جای durable orchestrator و worker evidence واقعی نیست.
```

## DoD و production evidence boundary

- graph سالم، cycle denial، task lease، checkpoint، resume، transition و negative path تست شوند.
- graph compiler، durable queue/worker، checkpoint store، lease manager، sandbox و replay evidence باید متصل شوند.
- kernel M180 به‌تنهایی orchestration liveness، exactly-once execution، resume durability یا agent graph production claim نیست.
