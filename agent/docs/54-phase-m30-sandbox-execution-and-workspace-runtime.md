# فاز M30: Sandbox Execution و Workspace Runtime

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-EX-01`، `GAP-EX-02`، `GAP-EX-03`، `GAP-EX-04`، `GAP-EX-08`، `GAP-EX-12`
**کد kernel:** `src/core/execution-sandbox-contract.ts`
**تست:** `test/audit-followup-phases.test.ts`

## هدف و مرز

M30 قرارداد اجرای untrusted code، workspace/VFS، patch atomic و normalized test result
را تعریف می‌کند. sandbox باید no host mount، no credential inheritance، resource limit
و network default-deny داشته باشد. این فاز container، microVM، process runner یا Git
mutation واقعی اجرا نمی‌کند.

## معماری

Control plane ابتدا `SandboxSpec` را با image digest، resource limit و network policy
می‌سازد. sandbox adapter workspace را در VFS tenant/run-scoped mount می‌کند و runner
هیچ host credential یا mountی نمی‌بیند. خروجی runner به normalized test result و
artifact manifest تبدیل می‌شود؛ patch validator آن را نسبت به base revision بررسی و
atomic apply/rollback می‌کند و cleanup controller در پایان process، volume و workspace
را با proof حذف می‌کند.

## قراردادهای اصلی

- `decideSandbox` image digest، path، network، CPU/memory/timeout را validate می‌کند.
- host mount و credential inheritance همیشه رد می‌شوند.
- `validatePatchPlan` path traversal، duplicate، protected path، hash ناقص و file limit
  را رد و atomic/rollback boundary را اجباری می‌کند.
- `normalizeTestRun` exit code، signal، pass/fail/skip و log hash را به TestRun تبدیل
  می‌کند.
- `planSandboxCleanup` process، volume و workspace verification را در cleanup plan
  ثبت می‌کند.

## Threat Model

- **Host escape و privilege escalation:** image باید digest-pinned باشد؛ host mount، privileged mode، inherited credential و path traversal deny می‌شوند.
- **Network و secret exfiltration:** network پیش‌فرض `none`، allowlist صریح، no raw secret در environment/log و artifact redaction لازم است.
- **Workspace corruption:** patch فقط نسبت به revision/hash معتبر و به‌صورت atomic اعمال می‌شود؛ protected path و duplicate change رد می‌شوند.
- **False execution evidence:** exit code، normalized test result، artifact hash و cleanup proof باید از runner واقعی بیایند؛ Docker/mock به‌تنهایی production evidence نیست.

## sprintها

### Sprint A — Runtime Boundary

- OCI image digest یا microVM artifact pin
- filesystem، process و resource isolation
- no credential inheritance
- network mode none یا explicit allowlist

### Sprint B — Workspace/VFS

- lease per run و allowedPaths
- snapshot، diff، atomic apply و revert
- conflict با base revision
- protected branch/path gate

### Sprint C — Language Matrix و Test Adapter

- Node، Python، Go، Rust و Java profile
- parser خروجی Vitest/Pytest/Go/Cargo
- timeout، cancellation و signal semantics
- evidence hash برای log و artifact

### Sprint D — Cleanup و Escape Testing

- process/volume/filesystem cleanup
- host escape و network abuse fixture
- secret leak در log، exit code و artifact
- cleanup proof و incident event

## Prompt pack

### `m30-sandbox-runtime-engineer`

```text
نقش: Sandbox Runtime Engineer

کد untrusted را فقط با image digest، workspace-relative paths، resource limit و
network policy اجرا کن. host mount، inherited credential، privileged mode و secret خام
ممنوع است. قبل از write patch را validate و atomic apply/rollback را plan کن؛ CAPTCHA یا
MFA را automation نکن و برای handover متوقف شو.
```

### `m30-execution-evidence-gate`

```text
نقش: Execution Evidence Gate

برای escape، path traversal، network deny، timeout، cleanup، test parser و secret
redaction، command، exit code، artifact hash و audit ثبت کن. contract یا Docker mock به
جای اجرای sandbox واقعی قابل قبول نیست.
```

## DoD و evidence boundary

- unit برای sandbox deny، patch safety، test normalization و cleanup proof.
- اجرای واقعی container/microVM، VFS، language runners و escape suite integration بعدی
  است.
- هیچ artifact یا test result بدون provenance به‌عنوان موفقیت پذیرفته نمی‌شود.
