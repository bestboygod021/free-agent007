# فاز M146: Workspace VFS و Sandbox Resource Boundary

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/workspace-sandbox-boundary-runtime.ts`
**تست:** `test/next-platform-hardening-phases-4.test.ts`
**gap:** `GAP-EX-16`

## هدف و مرز

M146 اجرای workspace را به immutable snapshot، allowed paths، symlink guard، bounded file operation،
sandbox budget و reversible diff apply متصل می‌کند. snapshot باید root/diff hash، counts، path roots،
immutability و tenant binding داشته باشد. file operation فقط در path مجاز و sandboxed اجرا می‌شود. budget
باید CPU، memory، disk، timeout، process و network mode را bound کند. diff ابتدا dry-run و سپس با approval،
no-clobber و rollback اعمال می‌شود. این فاز VFS، snapshot store، container/cgroup، resource monitor یا
diff applier واقعی نیست.

## معماری و قراردادها

- `validateM146Snapshot`: root hash، counts، allowed paths، immutability و tenant.
- `decideM146FileOperation`: path، action، bytes، symlink، sandbox و delete approval.
- `validateM146SandboxBudget`: resource limits، network mode، tenant، sandbox و approval.
- `decideM146DiffApply`: dry-run، no-clobber، allowed paths و rollback.

کد untrusted خارج از sandbox اجرا نمی‌شود؛ secret injection، path traversal، symlink escape و destructive delete fail-closed هستند.

## sprint plan

### Sprint A — Snapshot/VFS

materialize، immutable snapshot، root/diff hash و allowed path.

### Sprint B — File boundary

read/write/delete/rename، symlink detection، byte limits و audit.

### Sprint C — Sandbox budget

CPU/memory/disk، timeout، process limit، network none/allowlist و cgroup.

### Sprint D — Diff apply

dry-run، approval، no-clobber، rollback و failed-operation recovery.

## Threat Model

- **Path traversal:** workspace-relative allowed paths لازم است.
- **Symlink escape:** no-symlink evidence و VFS resolution اجباری است.
- **Resource exhaustion:** CPU، memory، disk، process و timeout bound می‌شوند.
- **Network exfiltration:** network mode و allowlist gate می‌شود.
- **Destructive overwrite:** dry-run، no-clobber، approval و rollback لازم است.
- **Untrusted code escape:** sandbox و tenant match fail-closed هستند.

## prompt pack

### `m146-workspace-sandbox-engineer`

```text
نقش: Workspace and Sandbox Boundary Engineer

snapshot را immutable و tenant-bound با root/diff hash و allowed paths بساز. file operation باید
relative، symlink-safe، sandboxed و byte-bounded باشد. budget CPU/memory/disk/timeout/process/network
را enforce کن. diff را dry-run، no-clobber، approval-bound و rollback-ready نگه دار.
```

### `m146-execution-auditor`

```text
نقش: Workspace Execution Auditor

path traversal، symlink، resource limit، network، delete approval، snapshot integrity و rollback را
ممیزی کن. fake filesystem یا unit budget جای VFS، container/cgroup و resource monitor واقعی نیست.
```

## DoD و production evidence boundary

- snapshot، path traversal denial، file budget، sandbox limit، destructive delete و diff rollback تست شوند.
- VFS/snapshot store، sandbox/cgroup، resource telemetry، secret boundary و diff applier باید integration شوند.
- kernel M146 به‌تنهایی workspace isolation، resource enforcement، file durability یا untrusted execution safety production claim نیست.
