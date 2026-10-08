# فاز M59: Visual Studio Integration و Reviewable Preview

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-UX-02`، `GAP-UX-03`، `GAP-UX-05`، `GAP-QA-05`، `GAP-UX-06`، `GAP-UX-08`
**کد kernel:** `src/core/visual-studio-integration-runtime.ts`
**تست:** `test/next-ai-platform-phases.test.ts`

## هدف و مرز

M59 مرحله بعدی M54/M55 است: design canvas را به preview قابل بررسی، collaboration event و
publish boundary وصل می‌کند. کاربر می‌تواند preview محلی/sandbox/staging ببیند، screenshot و
browser report داشته باشد، comment/version/approval ثبت کند و فقط بعد از review به project
branch یا handoff برود. این فاز browser renderer، persistence، preview server، collaboration
store یا branch writer واقعی را اجرا نمی‌کند.

## معماری

`StudioRuntimeSurface` organization/project/session و canvas را با environment، sandbox،
network egress و approval bind می‌کند. `StudioPreviewArtifact` خروجی preview را با artifact
hash، screenshot، browser report، exit code و timestamp نگه می‌دارد. publish targetها
`preview`، `project_branch` و `handoff_only` هستند. collaboration event فقط hash و metadata
دارد و raw comment/secret وارد kernel نمی‌شود.

## قراردادهای اصلی

- `validateStudioRuntimeSurface` scope، sandbox، approval، egress و canvas ownership را بررسی می‌کند.
- `validateStudioPreviewArtifact` screenshot، browser report، exit code و timestamp را gate می‌کند.
- `decideStudioPublish` preview، handoff، reviewer approval و publish target را محدود می‌کند.
- `validateStudioCollaborationEvent` event scope، idempotency و secret-safe body را validate می‌کند.

## sprintها

### Sprint A — Preview Runtime

- local/sandbox/staging preview adapter
- artifact/screenshot/browser report
- hot reload و versioned canvas
- deterministic preview fixture

### Sprint B — Review و Collaboration

- annotation/comment/version event
- diff بین canvasها
- approval inbox و reviewer separation
- shareable read-only preview

### Sprint C — Publish Boundary

- handoff-only export
- project branch atomic patch
- rollback و preview expiry
- user-visible publish result

### Sprint D — UX Evidence

- browser E2E و visual regression
- RTL/dark/mobile states
- keyboard/accessibility report
- offline/degraded preview behavior

## Threat Model

- **Preview sandbox escape:** preview همیشه sandboxed است؛ untrusted generated code یا asset خارج از sandbox اجرا نمی‌شود.
- **Unauthorized publish:** preview به‌تنهایی publish نیست؛ user approval و reviewer approval لازم است.
- **Cross-project disclosure:** canvas، artifact و collaboration event به organization/project/session bind می‌شوند.
- **Comment injection/secret leak:** event فقط hash/metadata می‌گیرد؛ raw secret و instruction به execution تبدیل نمی‌شود.
- **False visual success:** screenshot بدون browser report/exit code برای staging publish کافی نیست.

## Prompt pack

### `m59-visual-studio-integration-engineer`

```text
نقش: Visual Studio Integration Engineer

canvas را به preview artifact با environment، sandbox، screenshot، browser report و exit code
وصل کن. preview را publish فرض نکن. project branch فقط با handoff، diff و reviewer approval
قابل تغییر است. collaboration event را tenant-scoped، idempotent و secret-safe نگه دار.
```

### `m59-preview-evidence-gate`

```text
نقش: Studio Preview Evidence Gate

برای local/sandbox/staging preview، screenshot، browser report، visual diff، annotation،
approval و publish/rollback، artifact hash، command، exit code و tenant probe ثبت کن.
canvas mock یا screenshot دستی جای preview server و browser E2E evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای preview surface، sandbox، artifact، screenshot، approval، publish و collaboration event.
- preview server، browser renderer، persistence، collaboration store، branch writer و accessibility runner باید integration شوند.
- contract kernel به‌تنهایی production preview، collaboration یا safe publish را ثابت نمی‌کند و `done_tested` نیست.
