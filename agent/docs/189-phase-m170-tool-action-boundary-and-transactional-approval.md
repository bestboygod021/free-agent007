# فاز M170: Tool Action Boundary و Transactional Approval

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/tool-action-boundary-runtime.ts`
**تست:** `test/next-platform-hardening-phases-9.test.ts`
**gap:** `GAP-EX-20`

## هدف و مرز

M170 tool call را از intent مدل به action plan، precondition، approval، protected-target guard،
idempotency و commit evidence تبدیل می‌کند. read، write، external و destructive سطح ریسک جدا دارند؛
commit موفق بدون no-unexpected-changes و tenant match پذیرفته نمی‌شود. این فاز tool gateway،
approval store، lock، transactional applier یا rollback executor واقعی نیست.

## معماری

- `validateM170Plan`: target، input/output، precondition، rollback، state و main guard.
- `decideM170ToolCall`: approved state، timeout، idempotency، redaction و tenant.
- `validateM170Approval`: reviewer، expiry، separation of duties، reversible و second reviewer.
- `decideM170Commit`: precondition، output/evidence، unexpected changes و rollback.

Local-first tool execution هم باید همین boundary را طی کند؛ BYOK/provider response مجوز tool call نیست.
نوشتن روی `main`، تغییر خارجی، bulk account creation، CAPTCHA/MFA bypass یا raw secret action
بدون human approval مجاز نیست.

## sprint plan

### Sprint A — Action plan

risk class، target، precondition، expected output و rollback plan.

### Sprint B — Approval

reviewer separation، expiry، second reviewer و approval inbox.

### Sprint C — Execution

tool gateway، lock/idempotency، timeout و sandbox boundary.

### Sprint D — Commit/rollback

no-unexpected-change، evidence، rollback و external reconciliation.

## Threat Model

- **Model-authorized mutation:** model intent مجوز نیست؛ approval و policy gate لازم است.
- **TOCTOU:** precondition hash، lock و commit verification.
- **Protected target mutation:** main/production deny و environment policy.
- **Approval spoofing:** reviewer identity، expiry و separation of duties.
- **Duplicate side effect:** idempotency و transactional boundary.
- **Rollback fiction:** external action فقط با provider evidence reversible اعلام می‌شود.

## prompt pack

### `m170-tool-boundary-engineer`

```text
نقش: Tool Action Boundary Engineer

action را با risk class، target، input hash، precondition، rollback و tenant بساز. write/external/
destructive را قبل از اجرا approval بده. tool call باید timeout، idempotency، redaction و protected-target
guard داشته باشد و commit فقط با evidence/no-unexpected-change پذیرفته شود.
```

### `m170-action-auditor`

```text
نقش: Tool Action Auditor

TOCTOU، main mutation، approval spoofing، duplicate side effect، missing rollback و external-action
false success را بررسی کن. policy unit test جای gateway، durable approval و transactional applier واقعی نیست.
```

## DoD و production evidence boundary

- plan، tool call، approval، protected-target denial، commit و rollback تست شوند.
- tool gateway، approval store، precondition lock، action applier، sandbox، idempotency و rollback adapter باید متصل شوند.
- kernel M170 به‌تنهایی action safety، atomicity، human approval correctness یا no-data-loss production claim نیست.
