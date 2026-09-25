# فاز M29: Durable Runtime Foundation

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-DA-01`، `GAP-DA-03`، `GAP-IG-07`، `GAP-EX-11`، `GAP-SE-10`
**کد kernel:** `src/core/durable-runtime-contract.ts`
**تست:** `test/audit-followup-phases.test.ts`

## هدف و مرز

M29 مرز storage و worker durable را تثبیت می‌کند: transaction tenant context، RLS
boundary، outbox، idempotency و durable job envelope. هیچ تصمیمی به‌تنهایی ادعای
PostgreSQL، Redis/BullMQ، migration gate یا multi-worker production ندارد.

## معماری

لایه‌ی ورودی command را به `TenantSession` تبدیل می‌کند؛ decision kernel پیش از هر
adapter، tenant/role/idempotency را می‌سنجد. adapter persistence در یک transaction,
mutation و outbox را ثبت می‌کند؛ dispatcher فقط eventهای commit‌شده را به durable job
می‌سپارد و worker با lease، retry، DLQ و checkpoint ادامه می‌دهد. PostgreSQL/RLS منبع
حقیقت tenant state و Redis/Valkey فقط acceleration/lease است، نه مرجع امنیتی مستقل.

## قراردادهای اصلی

- `decideTenantMutation` mutation را به organization، project و transaction bind می‌کند.
- resource محافظت‌شده owner/admin می‌خواهد و agent حذف durable را نمی‌تواند انجام دهد.
- `planOutboxAppend` duplicate و sequence خارج از ترتیب را رد می‌کند.
- `planDurableJob` retry/availability bounds را بررسی می‌کند.
- `decideIdempotency` بین new، replay و conflict فرق می‌گذارد و tenant را در lookup
  وارد می‌کند.

## Threat Model

- **Cross-tenant write/read:** tenant context، parent resource و RLS باید در هر transaction یکسان باشند؛ mismatch و missing context deny است.
- **Replay و duplicate side effect:** outbox sequence، idempotency hash، lease و DLQ از اجرای دوباره جلوگیری می‌کنند؛ replay فقط read-only است.
- **Privilege escalation:** agent بدون owner/admin و approval نمی‌تواند resource محافظت‌شده یا destructive mutation را اجرا کند.
- **Durability illusion:** unit kernel، mock database یا queue plan evidence تولیدی نیست؛ schema hash، migration، crash/resume و backup/restore باید جداگانه ثابت شوند.

## sprintها

### Sprint A — Transaction و RLS

- transaction-local tenant context
- parent/child same-tenant validation
- RLS SQL integration و migration checksum
- cross-tenant negative test روی PostgreSQL واقعی در adapter بعدی

### Sprint B — Outbox و Event Delivery

- atomic mutation + outbox boundary
- event sequence و duplicate handling
- consumer offset، retry و DLQ
- replay بدون اجرای دوباره side effect

### Sprint C — Durable Idempotency و Queue

- Redis/Valkey یا جایگزین local-first
- job lease، heartbeat، retry و dedupe
- fair scheduling per tenant
- worker crash/resume drill

### Sprint D — Persistence Evidence

- migration up/down/dry-run
- seed fixture
- backup/restore reference
- evidence شامل command، exit code، schema hash و tenant isolation

## Prompt pack

### `m29-durable-runtime-architect`

```text
نقش: Durable Runtime Architect

هر mutation را با organization، project، actor، transaction و idempotency bind کن.
Outbox باید در همان transaction قرار گیرد و event sequence/duplicate را حفظ کند.
RLS، Queue و Redis/PostgreSQL را production فرض نکن مگر command و evidence واقعی
وجود داشته باشد. raw password، direct main push و agent deletion ممنوع است.
```

### `m29-persistence-evidence-gate`

```text
نقش: Persistence Evidence Gate

برای migration، RLS، outbox، idempotency، queue، crash resume و backup/restore،
command، exit code، schema hash، tenant probe و audit event ثبت کن. unit kernel،
mock database و migration SQL به‌تنهایی production evidence نیستند.
```

## DoD و evidence boundary

- unit/contract برای tenant mismatch، protected mutation، event ordering، replay و conflict.
- PostgreSQL، Redis/Valkey، worker process، migration CI و backup storage باید در
  integration جدا اجرا شوند.
- این فاز production persistence یا durable queue را done اعلام نمی‌کند.
