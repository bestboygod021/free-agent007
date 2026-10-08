# فاز M54: Visual App Studio و Prompt-to-UI

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-UX-02`، `GAP-UX-03`، `GAP-UX-05`، `GAP-QA-05`، `GAP-UX-06`
**کد kernel:** `src/core/visual-app-studio-runtime.ts`
**تست:** `test/visual-model-directory-phases.test.ts`

## هدف و مرز

M54 قابلیت شبیه Google Stitch را به‌صورت امن و local-first تعریف می‌کند: کاربر توضیح متنی
می‌دهد و در یک canvas نمایشی، screen، component، flow و حالت‌های UI/UX را می‌بیند و اصلاح
می‌کند. خروجی این فاز design graph و preview contract است، نه ادعای تولید UI نهایی. این فاز
browser canvas، image generation، font/asset store، collaborative editor یا production web
app را اجرا نمی‌کند.

## معماری

`VisualDesignIntent` prompt، project، target platform، theme، direction و approval را bind
می‌کند. `VisualDesignCanvas` یک graph محدود از screen/component/text/image/input/button/list/
navigation/state است و هر node geometry، parent و properties مشخص دارد. assetهای untrusted
فقط reference هستند و `javascript:`، HTML data URL و secret-like reference رد می‌شوند.
wireframe می‌تواند کاملاً local و بدون network اجرا شود؛ prototype و visual system باید
network/asset egress را explicit کنند.

## قراردادهای اصلی

- `validateVisualDesignIntent` prompt، platform، direction، approval و no-raw-credential را gate می‌کند.
- `validateVisualDesignCanvas` node graph، geometry، parent، token set و asset safety را بررسی می‌کند.
- `planVisualStudioSession` generation budget، mode، network boundary و approval را محدود می‌کند.

## sprintها

### Sprint A — Prompt-to-Canvas

- prompt parser و intent extraction
- screen/component graph
- wireframe generation با local fallback
- undo/redo و versioned canvas

### Sprint B — UX Flow و States

- user journey و navigation map
- loading/empty/error/success state
- responsive web/mobile/desktop frame
- RTL، dark/light و bidi preview

### Sprint C — Visual System

- token picker و component variants
- typography، spacing، color و asset reference
- image/icon generation با provenance
- interactive preview و annotation

### Sprint D — Studio Integration

- browser canvas و persistence
- share/comment/review
- project/run handoff
- screenshot/visual regression و accessibility baseline

## Threat Model

- **Prompt injection در design input:** متن کاربر و asset وب، data است و command/approval ایجاد نمی‌کند.
- **Asset XSS یا exfiltration:** asset referenceهای خطرناک، HTML executable و secret-like URL رد می‌شوند؛ asset باید sandbox و redacted باشد.
- **UI hallucination:** node type، geometry و parent محدود است؛ component ناشناخته به‌جای حدس زدن review می‌شود.
- **Tenant leakage:** canvas، preview و annotation به organization/project/session bind می‌شوند.
- **هزینه و egress پنهان:** wireframe local-first است؛ prototype/image/network فقط با network mode و consent روشن اجرا می‌شود.

## Prompt pack

### `m54-visual-app-studio-engineer`

```text
نقش: Visual App Studio Engineer

prompt را به design graph محدود تبدیل کن، نه کد دلخواه. screen/component/state و geometry
را versioned نگه دار. حالت‌های loading/empty/error، RTL، dark/light و responsive را از ابتدا
مدل کن. asset وب را untrusted بدان، raw secret و executable HTML را رد کن. wireframe را
local-first بساز و هر egress/image generation را با consent و provenance ثبت کن.
```

### `m54-studio-evidence-gate`

```text
نقش: Visual Studio Evidence Gate

برای prompt، canvas graph، node validation، preview، asset rejection، RTL، responsive و
undo/redo، canvas artifact hash، screenshot، command و exit code ثبت کن. یک JSON graph یا
snapshot unit test جای browser canvas و visual evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای prompt bounds، node graph، geometry، asset safety، direction، budget و network boundary.
- browser canvas، preview renderer، asset pipeline، persistence، collaboration و visual regression باید integration شوند.
- contract kernel به‌تنهایی ثابت نمی‌کند کاربر یک طرح گرافیکی قابل استفاده ساخته است؛ این claim نیازمند browser/E2E evidence است.
