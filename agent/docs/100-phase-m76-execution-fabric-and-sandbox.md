# فاز M76: Execution Fabric، Workspace/VFS و Sandbox

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-EX-01`، `GAP-EX-02`، `GAP-EX-03`، `GAP-EX-04`، `GAP-EX-12`، `GAP-IN-04`، `GAP-IN-12`
**کد kernel:** `src/core/execution-fabric-runtime.ts`
**تست:** `test/next-product-runtime-phases.test.ts`

## هدف و مرز

M76 قرارداد execution امن را از path guard تا cleanup کامل می‌کند: runtime matrix، workspace
snapshot، allowed paths، network boundary، CPU/memory/timeout، atomic patch، test result و
secret lease cleanup. untrusted code فقط با sandbox و approval قابل اجراست. این فاز Docker/
microVM runner، VFS واقعی، process isolation، test adapters، artifact store یا deletion probe
واقعی را اجرا نمی‌کند.

## معماری

`ExecutionSandboxRequest` runtime، snapshot hash، allowed paths، network mode، domains و
resource bounds را ثبت می‌کند. `WorkspacePatchEvidence` touched paths را با allowed roots،
atomicity و conflict check مقایسه می‌کند. `ExecutionTestEvidence` exit code، test count،
artifact hash و redacted output دارد. cleanup باید filesystem، process، volume و secret lease را
صریحاً پاک‌شده نشان دهد.

## قراردادهای اصلی

- `validateExecutionSandbox` limits، network، safe path و untrusted approval را gate می‌کند.
- `validateWorkspacePatch` traversal، allowed path، atomic patch و conflict check را validate می‌کند.
- `decideExecutionTestResult` outcome، exit code، counts و redacted output را بررسی می‌کند.
- `validateSandboxCleanup` filesystem/process/volume/secret lease cleanup را enforce می‌کند.

## sprintها

### Sprint A — Workspace/VFS

- materialize و snapshot
- allowedPaths و atomic patch
- diff/revert/conflict
- repository index boundary

### Sprint B — Runtime Matrix

- Node/Python/Go/Rust/Java/PHP
- command allowlist
- CPU/memory/time limits
- artifact/log redaction

### Sprint C — Network و Secret Lease

- none/local-only/allowlist egress
- short-lived secret lease
- output secret scan
- process/volume isolation

### Sprint D — Verification و Cleanup

- test adapter normalization
- exit code/outcome mapping
- crash/timeout path
- filesystem/process/volume deletion probe

## Threat Model

- **Path traversal:** absolute، `..`، backslash و null-byte path رد می‌شود.
- **Untrusted code escape:** sandbox، approval، limits و explicit network boundary لازم است.
- **Secret leak:** command/output redaction و secret lease revoke در cleanup اجباری است.
- **Patch clobber:** atomicity، base snapshot و conflict check مانع overwrite می‌شوند.
- **False cleanup:** فقط status موفق کافی نیست؛ filesystem/process/volume evidence لازم است.

## Prompt pack

### `m76-execution-fabric-engineer`

```text
نقش: Execution Fabric Engineer

untrusted code را فقط در sandbox با runtime مشخص، allowedPaths، network policy، CPU/memory/timeout
و approval اجرا کن. patch باید snapshot-bound و atomic باشد. command/output را redact کن و
secret lease را پس از job revoke کن. هیچ path یا network مقصدی را از متن untrusted قبول نکن.
```

### `m76-sandbox-evidence-gate`

```text
نقش: Sandbox Evidence Gate

برای materialize، patch، command، test runner، timeout، artifact، process، volume و cleanup،
base hash، path set، command hash، exit code و cleanup hash ثبت کن. mock sandbox یا unit path
check جای escape/cleanup probe واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای path، limits، network، patch، test result و cleanup.
- sandbox/VFS runtime، language adapters، artifact store، secret broker و deletion probes باید integration شوند.
- execution contract به‌تنهایی isolation یا cleanup production را ثابت نمی‌کند و `done_tested` نیست.
