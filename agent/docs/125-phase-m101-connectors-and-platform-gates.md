# فاز M101: Connector Platform، OAuth/PKCE و GitHub App Gates

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IG-01`، `GAP-IG-02`، `GAP-IG-03`، `GAP-IG-06`، `GAP-IG-08`
**کد kernel:** `src/core/connector-platform-runtime.ts`
**تست:** `test/next-agent-platform-phases.test.ts`

## هدف و مرز

M101 lifecycle اتصال platform را از credential خام جدا می‌کند: OAuth/PKCE، consent، scope،
GitHub App installation، read-only database/MCP boundary و connector rate-limit. تمام secretها
فقط opaque reference هستند. عملیات mutation approval و idempotency لازم دارد. این فاز OAuth
server، token broker، GitHub App واقعی، MCP gateway، database driver، rate-limit store یا
connector UI را اجرا نمی‌کند.

## معماری

`ConnectorConnectionContract` state hash، PKCE، requested/granted scope، opaque credential
reference، expiry و revoke را ثبت می‌کند. `GitHubAppInstallationContract` repository allowlist،
permission manifest، short-lived token reference و signed webhook evidence دارد.
`ConnectorOperationRequest` read/write/admin را از scope و read-only mode جدا می‌کند.
`ConnectorRateLimitEvidence` remaining/reset، Retry-After، cooldown و credential rotation را
ثبت می‌کند.

## قراردادهای اصلی

- `validateConnectorConnection`: PKCE، consent، scope subset، expiry، revoke و opaque reference را validate می‌کند.
- `validateGitHubAppInstallation`: repository/permission allowlist، signature و short-lived token را gate می‌کند.
- `decideConnectorOperation`: resource scope، read-only، approval و idempotency را بررسی می‌کند.
- `decideConnectorRateLimit`: 429/5xx cooldown، Retry-After و rotation justification را enforce می‌کند.

## sprintها

### Sprint A — Connection Center

- OAuth state و PKCE
- consent و scope negotiation
- credential reference و revoke
- expiry و reconnect

### Sprint B — GitHub App

- installation و repository allowlist
- permission manifest
- short-lived installation token
- signed webhook ingress

### Sprint C — Read-only Adapters

- database introspection
- MCP capability manifest
- read/write distinction
- tool target approval

### Sprint D — Provider Resilience

- rate-limit headers
- Retry-After و cooldown
- rotation/reconnect
- connector health evidence

## Threat Model

- **OAuth CSRF:** state hash و PKCE verification اجباری است.
- **Over-scoping:** granted scopes باید subset درخواست باشند.
- **Credential leakage:** raw token/password در contract یا audit مجاز نیست.
- **Repository overreach:** GitHub App فقط allowlisted repositoryها را می‌بیند.
- **429 storm:** connector با Retry-After و cooldown متوقف می‌شود.

## Prompt pack

### `m101-connector-platform-engineer`

```text
نقش: Connector Platform Engineer

اتصال را با OAuth state hash، PKCE، consent، requested/granted scope، opaque credential reference،
expiry و revoke طراحی کن. GitHub App باید repository allowlist، permission manifest، short-lived
installation token و signed webhook داشته باشد. mutation را با approval و idempotency محدود کن.
```

### `m101-connector-evidence-gate`

```text
نقش: Connector Evidence Gate

برای OAuth، consent، scope، installation، webhook signature، operation، 429 و reconnect، reference
hash، granted scope، repository، Retry-After، cooldown، command و exit code ثبت کن. mock OAuth یا
توکن fixture جای provider callback، token broker، GitHub App و connector E2E evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای connection، GitHub installation، operation و rate-limit.
- OAuth provider، token broker، GitHub App، MCP/database adapters، webhook receiver و persistent quota store باید integration شوند.
- kernel M101 به‌تنهایی OAuth production، GitHub permission enforcement یا connector reliability را ثابت نمی‌کند و `done_tested` نیست.
