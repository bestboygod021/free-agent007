# فاز M150: Database Migration و Schema Governance

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/database-migration-runtime.ts`
**تست:** `test/next-platform-hardening-phases-5.test.ts`
**gap:** `GAP-DA-10`

## هدف و مرز

M150 schema change را به expand/contract، dry-run، no-clobber، lock، transaction، RLS check و rollback
تبدیل می‌کند. plan باید schema hashes، step hash، tenant scope و rollback داشته باشد. change باید
backward compatibility، destructive state، lock risk و online safety را اعلام کند. run باید checksum،
state، lock، row count، transaction و exit code داشته باشد. این فاز migration runner، schema registry،
Prisma/database CI، backfill monitor یا rollback executor واقعی نیست.

## معماری و قراردادها

- `validateM150Plan`: schema transition، migration kind، dry-run، approval و rollback.
- `validateM150Change`: operation، column، compatibility، destructive/lock risk و tenant.
- `decideM150Run`: lock/transaction، state، checksum، row count و completion.
- `validateM150RlsCheck`: RLS، default deny، no-leak، policy/probe و rollback.

raw data در migration evidence کپی نمی‌شود؛ checksum، row count و hash/reference کافی است.

## sprint plan

### Sprint A — Schema registry

schema version، migration order، checksum و compatibility.

### Sprint B — Expand/contract

backward-compatible expand، dual-read/write، contract approval و no-clobber.

### Sprint C — Runner

lock، transaction، dry-run، backfill batch و progress.

### Sprint D — RLS/rollback

RLS probes، tenant checks، failure recovery و rollback evidence.

## Threat Model

- **Destructive migration:** contract approval، backup و rollback لازم است.
- **Schema drift:** from/to hash و checksum gate می‌شوند.
- **Lock outage:** lock risk و online safety بررسی می‌شود.
- **Partial backfill:** row count، state و transaction evidence لازم است.
- **Tenant leak after migration:** RLS/default-deny probe اجباری است.
- **Clobbering schema:** no-clobber و dry-run fail-closed هستند.

## prompt pack

### `m150-migration-engineer`

```text
نقش: Database Migration Engineer

migration plan را با from/to schema hash، kind expand/contract/backfill، step hash، dry-run،
tenant scope، no-clobber و rollback بساز. change را از نظر destructive، lock risk، backward و
online safety بررسی کن و run را با lock، transaction، checksum، row count و exit code ثبت کن.
```

### `m150-schema-auditor`

```text
نقش: Schema Governance Auditor

schema drift، destructive change، lock، backfill، RLS/default deny، tenant probe، rollback و
clobber را ممیزی کن. migration fixture یا TypeScript plan جای database runner، lock و PostgreSQL
integration واقعی نیست.
```

## DoD و production evidence boundary

- plan، destructive change، dry-run، failed run، RLS probe و rollback paths تست شوند.
- migration runner، schema registry، lock/transaction، backfill monitor، RLS database و rollback باید integration شوند.
- kernel M150 به‌تنهایی migration safety، schema durability، RLS coverage یا zero-downtime production claim نیست.
