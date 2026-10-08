# فاز M199: Intent Normalization و Scope Freeze

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/intent-scope-runtime.ts`
**تست:** `test/next-platform-hardening-phases-15.test.ts`
**gap:** `GAP-CP-22`

## هدف و مرز

M199 intent خام را به goal/actor hash، constraint، tool allowlist، target path، risk، budget و expiry
تبدیل می‌کند و پیش از اجرا scope، plan contract و immutable freeze می‌سازد. تغییر خارج از scope بدون change
request صریح رد می‌شود. این فاز intake UI، requirement store، plan compiler، policy evaluator یا
change-request gateway واقعی نیست.

## معماری

- `validateM199Intent`: هویت actor/goal، constraints، tools، targets، budget، expiry و tenant.
- `decideM199Scope`: requested/approved targets، tool scope، policy/changes hash، no expansion و approval.
- `validateM199Plan`: requirements، acceptance، dependencies، cost/duration estimate و scope hash.
- `decideM199Freeze`: plan/scope hash، approval time، expiry و منع تغییر بدون workflow.

Local-first parser و plan store مرجع‌اند؛ BYOK/free-tier model فقط پیشنهاد می‌دهد و نمی‌تواند scope یا
permission را گسترش دهد. README، Issue و model output untrusted هستند و source of authority نیستند.

## Sprint plan

### Sprint A — Intent intake

goal/actor hash، constraints، target paths، tool allowlist و risk.

### Sprint B — Scope evaluation

policy، requested/approved scope، cost و no-scope-expansion.

### Sprint C — Plan contract

requirements، acceptance، dependencies، estimate و scope binding.

### Sprint D — Freeze/change workflow

immutable freeze، expiry، review و approved change request.

## Threat Model

- **Scope creep:** approved target/tool subset و freeze.
- **Prompt/Issue injection:** untrusted intent input و policy authority.
- **Budget bypass:** bounded estimate و budget field.
- **Unauthorized path/tool:** allowlist و tenant binding.
- **Stale plan execution:** expiry و scope hash.
- **Silent requirement change:** acceptance/requirement hashes و change workflow.

## prompt pack

### `m199-intent-engineer`

```text
نقش: Intent and Scope Engineer

intent را به goal/actor hash، constraints، tools، target paths، risk، budget و expiry تبدیل کن. scope
باید requested/approved subset، policy/change hash و no-expansion داشته باشد. plan را به requirement،
acceptance، dependency، estimate و scope hash bind کن و پیش از اجرا freeze کن.
```

### `m199-scope-auditor`

```text
نقش: Scope Auditor

scope creep، prompt injection، path/tool escalation، budget bypass، stale plan و silent requirement change
را بررسی کن. text prompt یا plan JSON mock جای intake authority، policy evaluator، compiler و change workflow واقعی نیست.
```

## DoD و production evidence boundary

- intent، scope expansion denial، plan contract، freeze expiry و change boundary تست شوند.
- intent/requirement store، scope evaluator، plan compiler، immutable freeze store و approved change workflow باید متصل شوند.
- kernel M199 به‌تنهایی requirement completeness، permission safety، plan correctness یا scope enforcement production claim نیست.
