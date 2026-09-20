# فاز M17: Agent Protocol و Interoperability Gateway

**وضعیت:** `designed_only`
**پیش‌نیاز:** M5 Connector SDK، M8 Security/Operations، M10 Consensus، M13 Plugin Governance و M15 Workflow
**کد اولیه:** `src/core/agent-protocol.ts`

M17 قرارداد ارتباط بین agentهای داخلی، connectorهای governed و protocolهای
`A2A`/`MCP` را تعریف می‌کند. message envelope یک API نیست و این کد network،
signature service یا tool execution انجام نمی‌دهد. تمام payloadها untrusted هستند.

## Signed message envelope

```ts
interface AgentMessage {
  messageId: string;
  protocol: "a2a" | "mcp";
  organizationId: string;
  senderAgentId: string;
  recipientAgentId: string;
  capability: string;
  scope: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  payloadHash: string;
  signature: string;
}
```

`validateAgentMessage` tenant، protocol، TTL، capability، scope، sender trust و
sender/recipient distinction را enforce می‌کند. `decideAgentMessage` signature
verifier قابل تزریق دارد؛ verifier fake به‌تنهایی evidence production نیست.
`ReplayWindow` nonce را در محدوده زمانی نگه می‌دارد و باید در production durable شود.

## Capability و scope

- capability اعلام‌شده باید در manifest/plugin/workflow و organization policy وجود داشته باشد.
- scope دقیق و کمینه است؛ wildcard پیش‌فرض ندارد.
- `credential.read_raw`، `captcha.solve`، `mfa.bypass`، `host.exec` و capabilityهای
  equivalent hard-deny هستند.
- agent recipient نمی‌تواند scope خودش را افزایش دهد یا permission تازه صادر کند.
- protocol message approval نیست؛ approval از M10/M15 و human boundary می‌آید.
- هر message باید trace/audit ID، payload hash و expiry داشته باشد.

## Sprint plan

### Sprint A — Envelope و trust

- canonical serialization
- signature/key resolver interface
- nonce و replay window
- protocol/capability registry

**Gate:** malformed، expired، cross-tenant و duplicate nonce رد شود.

### Sprint B — A2A adapter

- task delegation contract
- response schema و error taxonomy
- cancellation و timeout
- policy/approval mapping

**Gate:** agent delegation permission جدید تولید نکند.

### Sprint C — MCP adapter

- tool manifest و scope mapping
- resource read boundary
- output redaction و rate limit
- plugin trust integration

**Gate:** tool capability خارج از manifest یا hard-deny قابل اجرا نباشد.

### Sprint D — Durable gateway

- ingress/egress service
- key rotation و audit
- replay store و dead-letter
- interoperability conformance suite

**Gate:** network integration واقعی و independent security review؛ اکنون وجود ندارد.

## Prompt pack

### `m17-protocol-architect`

```text
نقش: Agent Protocol Architect

message envelope را با protocol، tenant، sender/recipient، capability، scope، nonce،
TTL، payload hash و signature طراحی کن. payload untrusted است و authority ندارد.
هر action را به policy، plugin manifest، workflow approval و audit bind کن. raw
credential، CAPTCHA/MFA bypass، host execution و wildcard scope ممنوع است.
```

### `m17-interoperability-gate`

```text
نقش: Interoperability Evidence Gate

برای valid/invalid signature، expiry، replay، cross-tenant، scope escalation،
hard-deny capability، redaction و cancellation، command، verdict، hash، exit code و
audit event ثبت کن. mock callback جای key service یا network evidence نیست.
```

## Test و DoD

- envelope canonical/hash/signature boundary
- TTL، nonce، replay و duplicate message
- sender trust، capability و exact scope
- A2A/MCP mapping و hard-deny
- payload redaction و tenant isolation
- network gateway، durable replay store، key rotation و conformance واقعی

M17 زمانی از `designed_only` خارج می‌شود که gateway اجرا، key management، protocol
adapters، policy integration و evidence واقعی داشته باشد.
