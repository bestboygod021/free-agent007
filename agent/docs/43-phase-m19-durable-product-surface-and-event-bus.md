# فاز M19: Durable Product Surface، API و Event Bus

**وضعیت:** `designed_only`
**پیش‌نیاز:** M1.2 Durable Control Plane، M4 Product Experience، M8 Operations، M15 Workflow و M18 Governance
**کد اولیه:** `src/core/control-plane-contract.ts`

M19 فاصله بین reference API و control plane محصولی را هدف می‌گیرد: command معتبر،
idempotency، event sequence، tenant context و contract testing. این فاز با وجود نام
Durable، در این سری persistence، HTTP server، PostgreSQL execution، Redis/BullMQ یا
web app تولیدی نمی‌سازد؛ kernel فقط مرزهای آن‌ها را تعیین می‌کند.

## قرارداد

`ControlCommand` شامل command ID، organization، actor، type، contract version،
idempotency key، payload hash و issuedAt است. `decideControlCommand` clock skew،
tenant و command allowlist را بررسی می‌کند. `ControlEvent` به aggregate، sequence،
payload hash و parent event bind است و `planEventAppend` append خارج از ترتیب یا
cross-tenant را deny می‌کند.

## چهار sprint

### A — API contract و error model

- versioned command/event schema
- RFC 7807 error catalog
- idempotency conflict و replay semantics
- generated contract fixture

### B — Event Bus boundary

- outbox/inbox contract
- tenant-aware topic naming
- ordering، dedupe و DLQ
- consumer authorization

### C — Product surface

- web app route inventory
- auth/session middleware
- SSE replay با Last-Event-ID
- approval/run timeline و accessibility states

### D — Durable integration

- PostgreSQL transaction و RLS واقعی
- Redis/BullMQ adapter
- contract test در CI
- migration، backup و incident drill

## Prompt pack

### `m19-control-plane-architect`

```text
نقش: Durable Control Plane Architect

command، event، aggregate، sequence، idempotency، tenant، actor، contract version و
replay را دقیق bind کن. payload untrusted است و policy را تغییر نمی‌دهد. هیچ command
بدون session، approval یا evidence لازم اجرا نشود. output شامل schema، state، denial،
transaction boundary و test fixture باشد.
```

### `m19-api-evidence-gate`

```text
نقش: API Evidence Gate

برای auth، tenant isolation، idempotency replay/conflict، event ordering، SSE resume،
RLS، migration و queue delivery، command، exit code، response hash، audit event و
artifact ثبت کن. reference/mock به‌جای اجرای durable production evidence نیست.
```

## خط‌های ایمنی و DoD

- raw password در command، event یا log ذخیره نشود.
- event متن README/Issue را authority نمی‌کند.
- protected branch و production deploy approval لازم دارد.
- service-to-service command باید audience و scope داشته باشد.
- M19 فقط زمانی از `designed_only` خارج می‌شود که API، persistence، broker، web UI و
  دو-tenant E2E با evidence واقعی اجرا شوند.
