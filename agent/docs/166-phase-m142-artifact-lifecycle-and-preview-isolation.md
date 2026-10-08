# فاز M142: Artifact Lifecycle و Preview Isolation

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/artifact-preview-runtime.ts`
**تست:** `test/next-platform-hardening-phases-3.test.ts`
**gap:** `GAP-EX-15`

## هدف و مرز

M142 lifecycle artifact را از supply-chain admission جدا می‌کند و storage، expiry، signed delivery،
preview isolation و cleanup را gate می‌کند. artifact باید digest، size bound، encryption، signature،
secret scan، tenant binding و retention داشته باشد. preview باید path-safe، read-only، origin-bound،
authz-verified و sandboxed باشد. delivery باید one-time، redacted و کوتاه‌عمر باشد. cleanup باید
storage targets، signed URL revocation و verification را ثابت کند. این فاز object storage، preview
proxy، container runtime، CDN، signed URL service یا deletion worker واقعی نیست.

## معماری و قراردادها

- `validateM142Artifact`: digest، size، lifetime، encryption، signature، tenant و secret scan.
- `decideM142Preview`: safe path، expiry، origin، read-only، authz و sandbox.
- `validateM142Delivery`: delivery method، content hash، redaction، one-time و origin binding.
- `validateM142Cleanup`: delete timing، target clearing، URL revoke و tenant evidence.

artifact content و secret خام در preview یا delivery log ذخیره نمی‌شود؛ content hash و redacted view استفاده می‌شود.

## sprint plan

### Sprint A — Artifact registry

digest، media type، size، encryption، signature و retention.

### Sprint B — Preview boundary

allowed path، origin، read-only، authz، sandbox و expiry.

### Sprint C — Delivery

signed URL، local mount، inline redaction، one-time token و origin binding.

### Sprint D — Cleanup

expiry worker، storage target sweep، URL revocation و deletion evidence.

## Threat Model

- **Path traversal:** allowed path و root boundary بررسی می‌شود.
- **Preview code execution:** read-only و sandbox اجباری است.
- **Expired URL reuse:** one-time، origin-bound و short expiry لازم است.
- **Tenant artifact leak:** tenant match در record، preview و delivery gate می‌شود.
- **Secret artifact exposure:** secret scan و redacted delivery لازم است.
- **Orphan storage:** cleanup target evidence و URL revoke لازم است.

## prompt pack

### `m142-artifact-engineer`

```text
نقش: Artifact Lifecycle Engineer

artifact را با digest، size bound، encryption، signature، secret scan، tenant binding و retention
ثبت کن. preview فقط با safe path، read-only، authz، origin، sandbox و expiry مجاز است. delivery را
one-time، redacted و origin-bound بساز و cleanup را با target clearing و URL revoke ثابت کن.
```

### `m142-preview-auditor`

```text
نقش: Preview Isolation Auditor

path traversal، origin، tenant، signed URL expiry، read-only، sandbox، secret scan و cleanup
coverage را ممیزی کن. local fixture یا signed string جای object store، preview proxy، CDN و
container isolation واقعی نیست.
```

## DoD و production evidence boundary

- artifact expiry، preview traversal denial، delivery expiry، redaction و cleanup failure تست شوند.
- artifact store، preview proxy، sandbox/container, signed URL service، CDN و deletion worker باید integration شوند.
- kernel M142 به‌تنهایی artifact retention، preview isolation، URL security یا deletion completeness production claim نیست.
