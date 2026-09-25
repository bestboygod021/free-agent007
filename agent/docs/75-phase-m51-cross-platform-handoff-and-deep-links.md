# فاز M51: Cross-platform Context Handoff، Deep Links و Import/Export

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-UX-02`، `GAP-UX-03`، `GAP-IG-09`، `GAP-CP-08`
**کد kernel:** `src/core/platform-handoff-runtime.ts`
**تست:** `test/platform-connection-phases.test.ts`

## هدف و مرز

M51 رفت‌وبرگشت کاربر بین اپ و platformهای دیگر را ساده و قابل‌کنترل می‌کند: باز کردن issue
در GitHub، ساخت task در Linear/Jira، فرستادن context به Slack، یا انتقال document/file به
Notion/Drive. context فقط با fieldهای محدود و user approval handoff می‌شود. این فاز deep-link
router، browser UI، export service، encrypted object store یا external import واقعی نیست.

## معماری

`PlatformDeepLink` یک link کوتاه‌عمر با signed capability، target URL، organization و one-time
state است. `ContextHandoff` به run/project/task و target platform متصل است و fieldهای صریح
دارد؛ secret-like field، token و prompt authority وارد آن نمی‌شود. `PlatformBundle` برای
import/export دارای schema version، payload hash، record bound، encryption-at-rest و no-raw-
credential boundary است.

## قراردادهای اصلی

- `validatePlatformDeepLink`، HTTPS، expiry، signature و one-time consumption را gate می‌کند.
- `planContextHandoff`، bounded context، target، organization، user approval و secret-safe fields را بررسی می‌کند.
- `validatePlatformBundle`، schema/hash، record bound، encryption و credential boundary را enforce می‌کند.
- `consumeOneTimeDeepLink`، replay و cross-organization consumption را محدود می‌کند.

## sprintها

### Sprint A — Deep-link Contract

- route registry و platform URL mapping
- signed capability و expiry
- one-time nonce و replay store
- browser/app handoff UX

### Sprint B — Context Mapping

- run/project/task canonical references
- field allowlist برای title/summary/link/status
- provider-specific mapping و preview
- user review قبل از publish

### Sprint C — Import/Export

- JSON/Markdown/CSV bundle schema
- encryption-at-rest و payload digest
- dry-run، validation report و partial failure
- export deletion/retention policy

### Sprint D — Desktop/Mobile Interop

- PWA/Tauri deep link registration
- copy/share/open-in-platform action
- mobile fallback و read-only handoff
- end-to-end handoff evidence

## Threat Model

- **Open redirect:** target URL باید platform registry و HTTPS policy را پاس کند؛ URL آزاد از payload استفاده نمی‌شود.
- **Capability theft/replay:** signature، expiry، organization binding و one-time consumption لازم است.
- **Secret exfiltration:** context fieldها bounded و key denylist دارند؛ raw token/password/API key وارد link یا bundle نمی‌شود.
- **Untrusted import:** bundle فقط data است، دستور اجرا نیست؛ import قبل از materialize schema/license/payload را validate می‌کند.
- **Accidental publication:** هر handoff write یا export دارای user review و explicit approval است.

## Prompt pack

### `m51-platform-handoff-engineer`

```text
نقش: Cross-platform Handoff Engineer

deep link را signed، کوتاه‌عمر، one-time و organization-bound بساز. فقط title/summary/link و
fieldهای allowlisted را handoff کن؛ prompt، token، password، API key و instruction را منتقل
نکن. قبل از ساخت issue/task/message/export، preview و user approval بگیر. import را data
بدان، executable code ندان.
```

### `m51-handoff-evidence-gate`

```text
نقش: Handoff Evidence Gate

برای open-in-platform، expiry/replay denial، context preview، user approval، bundle hash،
encryption و partial import، URL redacted، artifact digest، command و exit code ثبت کن.
local deep-link test جای browser/platform handoff evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای deep-link signature/expiry، one-time state، field allowlist، bundle encryption و replay denial.
- router، browser/mobile/deep-link registration، external URL mapping و import/export service باید integration شوند.
- contract امن به‌تنهایی ثابت نمی‌کند کاربر واقعاً می‌تواند بین اپ و platform جابه‌جا شود؛ این claim نیازمند E2E evidence است.
