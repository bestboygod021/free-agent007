# فاز M165: Agent Delegation و Capability Tokens

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/agent-delegation-runtime.ts`
**تست:** `test/next-platform-hardening-phases-8.test.ts`
**gap:** `GAP-IG-17`

## هدف و مرز

M165 واگذاری بین agentها را به delegation envelope، capability token محدود، output contract،
no-transitive-escalation، result evidence و revoke descendant تبدیل می‌کند. child agent فقط همان resource
و action تعریف‌شده را می‌بیند؛ token خام یا authority آزاد منتقل نمی‌شود. این فاز agent gateway،
capability store، broker، distributed revoke یا tool executor واقعی نیست.

## معماری

- `validateM165Delegation`: parent/child، task، input/output hash، scope، TTL و tenant.
- `decideM165Token`: resource، conditions، expiry، single-use، revoke و main-branch denial.
- `validateM165Result`: contract match، capability usage، evidence، tenant و redaction.
- `decideM165Revocation`: descendant enumeration، operator و revoke evidence.

در Local-first، delegation در همان process هم باید token و scope داشته باشد؛ BYOK/provider credential
به child منتقل نمی‌شود. `request_approval` اجازه approval جعلی نمی‌دهد و write patch روی `main` یا
capability escalation باید fail-closed باشد.

## sprint plan

### Sprint A — Delegation schema

parent/child envelope، task context، output contract و TTL.

### Sprint B — Capability broker

attenuation، resource pattern، conditions، single-use و idempotency.

### Sprint C — Agent gateway

accept/complete، result validation، tool boundary و evidence.

### Sprint D — Revoke و recovery

descendant revoke، stale token probe، timeout، replay و human review.

## Threat Model

- **Confused deputy:** parent، child، task و resource binding.
- **Transitive escalation:** no-transitive-escalation و capability attenuation.
- **Token replay:** TTL، single-use، idempotency و revoke store.
- **Unauthorized write:** write capability با approval و protected-target deny.
- **Cross-tenant delegation:** همه envelope/result/tokenها tenant-bound هستند.
- **Stale descendant:** revoke باید descendants را enumerate و propagate کند.

## prompt pack

### `m165-delegation-engineer`

```text
نقش: Agent Delegation Engineer

delegation را با parent، child، task، input/output contract، capabilities، TTL و tenant بساز. token
را resource/condition scoped، کوتاه‌عمر و در صورت نیاز single-use کن. child authority جدید نسازد و
revoke باید همه descendantها را پوشش دهد.
```

### `m165-delegation-auditor`

```text
نقش: Delegation Security Auditor

confused deputy، transitive escalation، token replay، protected branch، tenant crossover و stale
revoke را بررسی کن. callback یا mock agent gateway جای capability broker و execution binding واقعی نیست.
```

## DoD و production evidence boundary

- delegation معتبر/ردشده، token expiry/replay، result mismatch و descendant revoke تست شوند.
- delegation broker، capability store، agent gateway، resource policy، tool executor و revoke propagation باید متصل شوند.
- kernel M165 به‌تنهایی agent authenticity، capability isolation، replay resistance یا task correctness production claim نیست.
