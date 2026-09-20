# فاز M11: Billing، Metering و Entitlements

**وضعیت:** `designed_only`
**پیش‌نیاز:** M4 Cost/Observability، M5 Usage/Provider، M7 Deploy Cost و M8 Capacity
**کد اولیه این فاز:** `src/core/entitlements.ts`

M11 بین usage اندازه‌گیری‌شده، quota، plan و entitlement مرز روشن می‌سازد. `free` به
معنی paid provider پنهان نیست؛ `paid` به معنی حذف approval نیست؛ `local` نباید cloud
fallback بسازد. کد این فاز billing provider را charge نمی‌کند و فقط hard preflight
و entitlement decision را deterministic می‌کند.

## ۱. مدل محصول

```text
usage event
  → append-only ledger
  → aggregation per org/project/run/provider/mode
  → entitlement period
  → quota reservation
  → allow/hold/deny
  → invoice/export (future)
```

### plan

هر plan باید این‌ها را versioned کند:

- tier و mode
- monthly runs/input/output tokens
- concurrency و projects
- features و connector capabilities
- max cost و currency
- retention، support و preview limits
- paid provider policy

### Entitlement decision

`checkEntitlement` موارد زیر را hard gate می‌کند:

- feature allowlist
- monthly run/token quota
- concurrent run و project limit
- cost ceiling
- free/local paid-cost prohibition
- period و currency consistency

Usage از client trust نمی‌کند؛ event باید tenant، provider، model، mode، run، task،
units، cost estimate/actual و timestamp داشته باشد. correction به‌صورت compensating
entry است، نه mutation خام ledger.

## ۲. Free/paid/local

| mode | مجاز | ممنوع |
|---|---|---|
| `free` | local/free-tier، quota محدود، local preview | paid provider، card، hidden cloud fallback |
| `paid` | BYOK/provider مجاز، budget و consent | cost بدون reservation، تجاوز silent |
| `local` | local model/filesystem/MCP و hardware user | cloud inference، cloud billing، telemetry ناخواسته |

اگر quota تمام شد، سیستم باید `quota_exhausted` با reason و nextAction تولید کند.
تغییر mode فقط با انتخاب صریح کاربر و reconfiguration کامل مجاز است.

## ۳. Metering و fairness

- usage با idempotency key append می‌شود.
- duplicate provider receipt دوباره charge نمی‌شود.
- estimated و settled cost جدا هستند.
- currency mix در یک total خام ممنوع است.
- reservation با atomic release/settlement انجام می‌شود.
- tenant پرمصرف نمی‌تواند quota یا worker همه را بگیرد.
- free-tier limits، ToS و provider price snapshot در provenance می‌آیند.

## ۴. Sprintها

### Sprint A: Usage Contract

- event schema و append-only ledger
- token/cost/duration/unit normalization
- dedupe و compensating entry
- org/project/run aggregation

### Sprint B: Plan و Entitlement

- plan registry و version
- feature/quota/concurrency gate
- period rollover و grace/hold
- UI explanation و export

### Sprint C: Reservation و Provider Settlement

- preflight reservation
- actual usage settlement
- provider free-tier/retry accounting
- budget alerts و M8 capacity join

### Sprint D: Billing Boundary

- invoice/export adapter با approval
- tax/currency/legal review
- dispute/correction workflow
- no payment credential in core

## ۵. Prompt Pack

### `m11-metering-architect`

```text
نقش: Usage and Metering Architect

unit، source، provider receipt، mode، tenant، run، task، estimate/actual، currency و
idempotency را مشخص کن. ledger append-only باشد و correction با compensating entry
انجام شود. raw payment credential را هرگز درخواست یا ذخیره نکن.
```

### `m11-entitlement-reviewer`

```text
نقش: Entitlement Policy Reviewer

plan، period، feature، quota، concurrency، project، cost و mode را بررسی کن. free و
local نباید paid provider/cost داشته باشند. quota exhaustion باید deny/hold شفاف بسازد؛
mode را silently عوض نکن.
```

### `m11-cost-evidence-gate`

```text
نقش: Metering Evidence Gate

duplicate receipt، mixed currency، reservation race، quota boundary، free-tier cap و
compensating entry را با fixture بررسی کن. report باید usage hash، provider receipt,
policyHash و exit code داشته باشد؛ invoice mock evidence واقعی billing نیست.
```

## ۶. Test و DoD

- usage validation، append-only و dedupe
- estimate/actual settlement و correction
- currency separation
- quota boundary و concurrency race
- free/local paid-cost deny
- paid BYOK budget accept
- period reset و expiry
- noisy tenant fairness
- provider 429/retry accounting
- export privacy/tenant isolation

M11 فقط با ledger durable، quota reservation واقعی، provider settlement، privacy-safe
export و legal/billing evidence از `designed_only` خارج می‌شود. `entitlements.ts`
در حال حاضر charge یا payment انجام نمی‌دهد.
