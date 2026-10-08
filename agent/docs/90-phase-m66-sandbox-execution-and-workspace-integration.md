# فاز M66: Sandbox Execution و Workspace Integration

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-EX-01`، `GAP-EX-02`، `GAP-EX-03`، `GAP-EX-04`، `GAP-EX-12`، `GAP-IN-12`، `GAP-SE-05`، `GAP-SE-06`
**کد kernel:** `src/core/execution-integration-runtime.ts`
**تست:** `test/next-platform-integration-phases.test.ts`

## هدف و مرز

M66 اجرای واقعی untrusted code را پشت sandbox، workspace VFS، atomic patch، test adapter و
cleanup evidence قرار می‌دهد. command و image به hash/digest تبدیل می‌شوند، pathها allowlist
می‌شوند و network policy explicit است. این فاز microVM/container runtime، workspace store،
language adapter، test runner یا cleanup process واقعی را اجرا نمی‌کند.

## معماری

`SandboxExecutionRequest` image digest، command hash، allowed paths، network policy، CPU/memory/
timeout limit و untrusted marker دارد. `WorkspacePatchRequest` base snapshot، patch hash،
changed paths، atomicity و approval را enforce می‌کند. `TestRunEvidence` exit code، pass/fail,
duration و artifact hash می‌دهد. `CleanupEvidence` resource probe و no-residual-process را برای
بستن job لازم می‌کند.

## قراردادهای اصلی

- `validateSandboxExecution` image/command، path، resource limit، untrusted و network approval را gate می‌کند.
- `decideWorkspacePatch` snapshot، atomic patch، allowed path و approval را بررسی می‌کند.
- `validateTestRunEvidence` exit code، test metric، artifact و timestamp را validate می‌کند.
- `validateCleanupEvidence` cleaned state، deleted paths، resource probe و residual process را enforce می‌کند.

## sprintها

### Sprint A — Sandbox Runtime

- image digest و runtime adapter
- CPU/memory/time limit
- network none/allowlist/egress proxy
- process/artifact collection

### Sprint B — Workspace/VFS

- materialize/snapshot/diff/revert
- allowed paths و symlink defense
- atomic patch و conflict
- cleanup پس از job

### Sprint C — Test Matrix

- Node/Python/Go/Rust/Java/PHP adapters
- normalized TestRun
- artifact/log redaction
- failure/retry evidence

### Sprint D — Security Drills

- prompt injection canary
- secret/DLP output filter
- escape/path traversal tests
- deletion/cleanup/chaos evidence

## Threat Model

- **Untrusted code escape:** code همیشه untrusted marker، sandbox، image digest و resource limit دارد.
- **Network exfiltration:** network policy none/allowlist/proxy است؛ network-enabled execution approval می‌خواهد.
- **Workspace destruction:** patch فقط atomic و در allowed paths است؛ base snapshot conflict را مشخص می‌کند.
- **Secret leakage:** logs/artifacts با hash/redaction تولید می‌شوند؛ command raw وارد kernel نیست.
- **Residual process/data:** cleanup تا resource probe و no-residual-process تأیید نشود کامل نیست.

## Prompt pack

### `m66-sandbox-integration-engineer`

```text
نقش: Sandbox and Workspace Integration Engineer

هر کد تولیدی را untrusted بدان. image را digest pin، command را hash و path را allowlist کن.
network پیش‌فرض none باشد. patch را atomic و snapshot-bound بساز. test result را با exit code
و artifact hash ثبت کن و job را فقط بعد از cleanup/no-residual-process ببند.
```

### `m66-execution-evidence-gate`

```text
نقش: Execution Evidence Gate

برای sandbox start، resource limit، network deny، patch conflict، test pass/fail، artifact،
secret redaction و cleanup، runtime output، probe hash، command و exit code ثبت کن. fake sandbox
یا mocked test result جای execution/escape evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای sandbox policy، path، network، resource, patch، test evidence و cleanup.
- container/microVM runtime، VFS، language adapters، test runner، DLP و cleanup باید integration شوند.
- sandbox contract به‌تنهایی isolation، secure execution یا cleanup کامل production را ثابت نمی‌کند و `done_tested` نیست.
