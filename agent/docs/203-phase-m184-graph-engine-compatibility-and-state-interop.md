# فاز M184: Graph Engine Compatibility و State Interop

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/graph-interop-runtime.ts`
**تست:** `test/next-platform-hardening-phases-12.test.ts`
**gap:** `GAP-EX-22`

## هدف و مرز

M184 مرز میان deterministic graph kernel داخلی و engineهای خارجی مانند LangGraph را صریح می‌کند: protocol
version، graph/state hash، checkpoint format، node binding، capability و replay باید قبل از handoff سازگار
باشند. این فاز LangGraph runtime، adapter gateway، checkpoint store، remote execution یا sandbox واقعی نیست.

## معماری

- `validateM184Adapter`: engine، protocol، graph/state schema، checkpoint، policy، deterministic resume و sandbox.
- `decideM184StateHandoff`: state/checkpoint hash، sequence، capability، expiry، approval و no-secrets.
- `validateM184NodeBinding`: input/output schema، allowed tools، policy، sandbox و no-transitive-tools.
- `decideM184Compatibility`: version migration، backwards compatibility، replay، evidence و approval.

Local-first engine داخلی منبع حقیقت state باقی می‌ماند؛ LangGraph یا external adapter فقط با BYOK/free-tier
قابل انتخاب است و نمی‌تواند transition policy یا capability را ارتقا دهد. raw prompt، secret و customer
context بدون redaction در handoff قرار نمی‌گیرد.

## Sprint plan

### Sprint A — Adapter manifest

engine registry، protocol version، graph/state hash و checkpoint format.

### Sprint B — State handoff

sequence، state/checkpoint hash، expiry، capability و replay boundary.

### Sprint C — Node binding

schema، tool allowlist، sandbox و no-transitive capability.

### Sprint D — Compatibility

migration، replay test، approval، rollback و engine deprecation.

## Threat Model

- **دو منبع حقیقت برای Run:** internal state authority و explicit handoff.
- **State corruption:** hash، sequence و checkpoint format.
- **Capability escalation:** node allowlist و no-transitive-tools.
- **Replay/expired handoff:** expiry، sequence و approval.
- **External engine drift:** protocol/version compatibility evidence.
- **Secret exfiltration:** no-secrets و tenant-safe handoff.

## prompt pack

### `m184-graph-interop-engineer`

```text
نقش: Graph Engine Interop Engineer

adapter را با engine، protocol، graph/state hash، checkpoint format و transition policy ثبت کن. handoff
باید sequence، state/checkpoint hash، expiry، capability، approval و no-secrets داشته باشد. node binding
را با schema، tool allowlist، sandbox و no-transitive-tools محدود کن.
```

### `m184-graph-interop-auditor`

```text
نقش: Graph Interop Auditor

state split-brain، checkpoint mismatch، engine drift، expired handoff، capability escalation و secret
exfiltration را بررسی کن. graph adapter mock یا JSON handoff جای gateway، replay proof و remote runtime واقعی نیست.
```

## DoD و production evidence boundary

- adapter، state handoff، node binding، compatibility، expiry و invalid handoff تست شوند.
- engine registry، adapter gateway، checkpoint store، protocol translator، replay runner و sandbox باید متصل شوند.
- kernel M184 به‌تنهایی LangGraph compatibility، state durability، exactly-once resume یا remote execution production claim نیست.
