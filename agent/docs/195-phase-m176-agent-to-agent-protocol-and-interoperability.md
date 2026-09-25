# فاز M176: Agent-to-agent Protocol و Interoperability

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/agent-interoperability-runtime.ts`
**تست:** `test/next-platform-hardening-phases-10.test.ts`
**gap:** `GAP-IG-19`

## هدف و مرز

M176 ارتباط agentها را به manifest قابل‌اعتماد، capability، schema، signed message، nonce، expiry،
idempotency و typed handoff محدود می‌کند. agent خارجی هرگز با صرف معرفی خود trusted نمی‌شود و delegation
transitive ممنوع است. این فاز gateway، transport، discovery registry، signature service یا remote agent
واقعی نیست.

## معماری

- `validateM176Manifest`: protocol/schema hash، capability، issuer، expiry، approval، sandbox و tenant.
- `decideM176Message`: sender/receiver، capability، nonce، signature، correlation، expiry و redaction.
- `validateM176Response`: output schema، capability match، evidence، idempotency و tenant.
- `decideM176Handoff`: context hash، approval، bound، no-secrets، expiry و operator.

Local-first برای agentهای هم‌دستگاه هم همین contract را اعمال می‌کند. BYOK یا free-tier agent فقط یک
adapter است؛ password، raw token، untrusted code و context بدون redaction در handoff مجاز نیست.

## Sprint plan

### Sprint A — Manifest و discovery

protocol version، capability، schema hash، issuer و trust lifecycle.

### Sprint B — Message envelope

signature، nonce، correlation، expiry، replay guard و tenant binding.

### Sprint C — Typed response

schema validation، result evidence، idempotency و capability match.

### Sprint D — Handoff

context minimization، approval، no-secret transfer، bounded delegation و revoke.

## Threat Model

- **Rogue agent:** issuer، approval، sandbox و trust gate.
- **Capability escalation:** no-transitive-delegation و exact capability match.
- **Replay:** nonce، correlation، expiry و idempotency.
- **Schema confusion:** input/output schema hash و typed response.
- **Context exfiltration:** context hash، redaction و no-secrets handoff.
- **Cross-tenant messaging:** message و response tenant match.

## prompt pack

### `m176-agent-protocol-engineer`

```text
نقش: Agent Interoperability Engineer

پیش از message، manifest agent را با issuer، protocol، capability، schema hash، expiry و sandbox
اعتبارسنجی کن. هر پیام nonce، signature، correlation و idempotency دارد. handoff را کمینه، approval-bound
و بدون secret نگه دار؛ capability را transitive ارتقا نده.
```

### `m176-agent-protocol-auditor`

```text
نقش: Agent Protocol Auditor

rogue agent، replay، capability escalation، schema mismatch، context exfiltration و cross-tenant message
را بررسی کن. JSON message یا local mock جای gateway، signature verification و remote interoperability واقعی نیست.
```

## DoD و production evidence boundary

- manifest، message، response، handoff، replay، expiry و untrusted-agent denial تست شوند.
- discovery registry، protocol gateway، signature/replay store، schema validator و revoke propagation باید متصل شوند.
- kernel M176 به‌تنهایی interoperability، authentication، delivery یا multi-agent safety production claim نیست.
