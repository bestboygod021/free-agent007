# فاز M50: Unified Connector Capabilities و Cross-platform Actions

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IG-02`، `GAP-IG-06`، `GAP-IG-08`، `GAP-IG-09`، `GAP-IN-12`
**کد kernel:** `src/core/unified-connector-runtime.ts`
**تست:** `test/platform-connection-phases.test.ts`

## هدف و مرز

M50 تفاوت APIهای مختلف را پشت normalized capability و action contract پنهان می‌کند تا کاربر
لازم نباشد برای هر platform رفتار کاملاً جدید یاد بگیرد. عملیات پایه شامل repository،
issue، message، document، file و webhook است. این فاز SDK واقعی، adapter implementation،
API gateway یا write به پلتفرم خارجی را اجرا نمی‌کند.

## معماری

هر adapter یک `ConnectorCapabilityManifest` با platform، version، operation، scope و risk
ارائه می‌دهد. negotiation، capability را با connection و granted scope intersection می‌کند.
`UnifiedPlatformAction` resource reference، idempotency، egress consent و approval را حمل
می‌کند؛ read و write با risk جدا می‌شوند. pluginهای reviewed باید sandbox شوند و custom
resourceها opaque reference دارند.

## قراردادهای اصلی

- `validateConnectorCapabilityManifest`، operation، scope، risk، source و sandbox boundary را validate می‌کند.
- `negotiateConnectorCapabilities`، platform match، user consent و granted scope را بررسی می‌کند.
- `decideUnifiedPlatformAction`، normalized operation، approval، egress consent و idempotency را gate می‌کند.
- `mapPlatformResource`، external ID را به reference امن و platform-specific map می‌کند.

## sprintها

### Sprint A — Canonical Action Model

- repository/issue/message/document/file vocabulary
- read/write/admin risk matrix
- normalized resource reference
- idempotency و operation result schema

### Sprint B — Adapter SDK

- adapter lifecycle و version compatibility
- authentication injection از connection reference
- error taxonomy و rate-limit normalization
- test fixture و contract conformance

### Sprint C — Capability Negotiation

- scope intersection و consent diff
- provider-specific feature flags
- unsupported operation fallback
- admin/write approval flow

### Sprint D — First-party Adapters

- GitHub/GitLab/Bitbucket repository/issues
- Slack/Linear/Jira message/task
- Notion/Google Drive document/file
- MCP/custom adapter در sandbox

## Threat Model

- **Confused deputy:** adapter فقط با connection، organization، granted scope و platform match action می‌گیرد.
- **Plugin escape:** reviewed plugin بدون sandbox معتبر نیست؛ untrusted code خارج از sandbox اجرا نمی‌شود.
- **Write escalation:** issue_write، message_send، document_write و file_write بدون approval و egress consent رد می‌شوند.
- **Resource mix-up:** resource reference با platform و operation bind می‌شود تا issue یک platform به platform دیگر نرود.
- **API hallucination:** operationهای خارج از manifest یا schema به‌جای حدس زدن deny می‌شوند.

## Prompt pack

### `m50-unified-connector-engineer`

```text
نقش: Unified Connector SDK Engineer

APIهای GitHub/GitLab/Slack/Linear/Notion/Jira/Drive را به operationهای محدود و versioned
normalize کن. capability، scope و risk را قبل از action negotiate کن. read را از write/admin
جدا کن، idempotency و resource reference بده و هر write را به approval و egress consent
بسپار. plugin و custom adapter فقط در sandbox و با manifest معتبر اجرا شوند.
```

### `m50-action-evidence-gate`

```text
نقش: Unified Action Evidence Gate

برای capability negotiation، scope denial، normalized read/write، approval، idempotency،
rate-limit و adapter error، manifest hash، command، result schema، exit code و tenant probe
ثبت کن. mock adapter یا contract test جای remote API evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای manifest، scope intersection، operation risk، sandbox، approval و resource mapping.
- SDK، adapterهای first-party، API result normalization، rate-limit و remote write باید integration شوند.
- وجود capability manifest به‌تنهایی به معنی اتصال platform یا موفقیت action در production نیست و `done_tested` نمی‌شود.
