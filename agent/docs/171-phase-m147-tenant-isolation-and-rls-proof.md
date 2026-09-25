# فاز M147: Tenant Isolation و RLS Proof

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/tenant-isolation-proof-runtime.ts`
**تست:** `test/next-platform-hardening-phases-4.test.ts`
**gap:** `GAP-SE-15`

## هدف و مرز

M147 جداسازی tenant را از policy prose به RLS policy، default deny، service-role binding، cross-tenant
probe و replayable proof bundle تبدیل می‌کند. policy باید table set، tenant column، version و review را
ثبت کند. access decision باید organization context، target row، role، action، transaction و visibility
را gate کند. probe باید cross-tenant denial، no-leak، query hash و transaction binding را ثابت کند.
proof bundle فقط وقتی معتبر است که همه probeها deny و independent review شده باشند. این فاز PostgreSQL،
Prisma migration، database CI یا signed evidence store واقعی نیست.

## معماری و قراردادها

- `validateM147TenantPolicy`: RLS، default deny، service binding، tables و safe tenant column.
- `decideM147Access`: request/target context، role، action، row visibility و transaction.
- `validateM147Probe`: cross-org denial، no-leak، policy/query hash و transaction.
- `validateM147ProofBundle`: probe hashes، replay/no-leak hash، review و policy version.

service role بدون binding، tenant context missing و raw cross-tenant row fail-closed هستند؛ production claim بدون database evidence مجاز نیست.

## sprint plan

### Sprint A — Policy inventory

tenant tables، tenant column، RLS/default deny و service role matrix.

### Sprint B — Access probes

same-tenant allow، cross-tenant deny، read/write/admin و transaction context.

### Sprint C — Replayable proof

policy/query hash، no-leak checks، probe bundle و deterministic replay.

### Sprint D — CI gate

PostgreSQL fixture، migration validation، all-table probe، signed review و regression block.

## Threat Model

- **Cross-tenant read:** row visibility و probe denial لازم است.
- **Service-role bypass:** binding و default deny اجباری است.
- **Missing context:** tenant context validation fail-closed می‌شود.
- **Policy drift:** policy version و proof bundle replay می‌شود.
- **Incomplete test scope:** table inventory و all-probe CI لازم است.
- **False isolation claim:** deterministic kernel بدون DB evidence کافی نیست.

## prompt pack

### `m147-isolation-engineer`

```text
نقش: Tenant Isolation and RLS Engineer

تمام tenant tables را با policy version، tenant column، RLS، default deny و service-role binding
ثبت کن. same-tenant access را allow و cross-tenant row را deny کن. probe باید query/policy hash،
transaction binding و no-leak داشته باشد و proof bundle با review و replay ساخته شود.
```

### `m147-rls-auditor`

```text
نقش: RLS Isolation Auditor

table inventory، RLS، default deny، service role، missing context، cross-tenant read/write، query
replay و proof completeness را ممیزی کن. fixture policy یا TypeScript decision جای PostgreSQL RLS
و CI probe واقعی نیست.
```

## DoD و production evidence boundary

- policy، same-tenant access، cross-tenant denial، admin role، missing context و proof replay تست شوند.
- PostgreSQL RLS، Prisma migration، service-role boundary، CI probe، signed proof و transaction replay باید integration شوند.
- kernel M147 به‌تنهایی tenant isolation، RLS coverage، no-leak یا compliance production claim نیست.
