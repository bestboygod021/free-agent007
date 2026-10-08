# فاز M171: Offline Sync و Conflict Resolution

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/offline-sync-runtime.ts`
**تست:** `test/next-platform-hardening-phases-9.test.ts`
**gap:** `GAP-UX-11`

## هدف و مرز

M171 client degraded/offline را به encrypted snapshot، trusted device، sync cursor، idempotent
operations، conflict classification و no-clobber resolution تبدیل می‌کند. protected target و permission
conflict خودکار merge نمی‌شوند. این فاز offline client، local database، sync transport، conflict UI یا
server merge worker واقعی نیست.

## معماری

- `validateM171Snapshot`: revision، entity hashes، encryption، device trust، tenant و expiry.
- `decideM171Sync`: cursor، operations، idempotency، network policy و redaction.
- `validateM171Conflict`: version/field/permission/deletion، auto-merge و protected target.
- `decideM171Resolution`: strategy، merged hash، reviewer، approval و no-clobber.

Local-first snapshot روی device encrypted نگه داشته می‌شود و خروج داده فقط با consent/policy انجام
می‌شود. BYOK برای encryption reference قابل استفاده است؛ sync در حالت نبود شبکه باید queue شود، نه
اینکه credential یا customer data به endpoint ناشناخته بفرستد.

## sprint plan

### Sprint A — Client snapshot

encryption، revision، expiry، trusted device و local store.

### Sprint B — Sync protocol

cursor، operation log، idempotency، retry و network policy.

### Sprint C — Conflict service

version/field/permission/deletion conflict و protected target.

### Sprint D — Resolution UI

reviewer، merge/abort، no-clobber، evidence و degraded UX.

## Threat Model

- **Local data exposure:** encryption، device trust و expiry.
- **Replay/duplicate sync:** cursor و idempotency.
- **Conflict clobber:** base/local/remote hash و no-clobber.
- **Permission downgrade:** permission conflict نیازمند review است.
- **Cross-tenant sync:** snapshot/request/conflict tenant-bound.
- **Offline exfiltration:** network policy و local fallback.

## prompt pack

### `m171-sync-engineer`

```text
نقش: Offline Sync Engineer

snapshot را encrypted، tenant-bound، device-trusted و expiring نگه دار. sync را با base revision،
cursor، operation hash و idempotency queue کن. conflict را classify کن؛ protected/permission conflict
را auto-merge نکن و resolution را با reviewer، approval و no-clobber evidence انجام بده.
```

### `m171-sync-auditor`

```text
نقش: Offline Sync Auditor

local encryption، replay، duplicate operation، permission conflict، protected target، cross-tenant
و no-network behavior را بررسی کن. local mock یا last-write-wins ساده جای conflict service و client evidence واقعی نیست.
```

## DoD و production evidence boundary

- snapshot، sync، conflict، merge/abort، expiry و no-clobber denial تست شوند.
- offline client/store، sync API، cursor service، conflict UI، merge worker و device trust باید متصل شوند.
- kernel M171 به‌تنهایی offline confidentiality، sync convergence، conflict correctness یا client accessibility production claim نیست.
