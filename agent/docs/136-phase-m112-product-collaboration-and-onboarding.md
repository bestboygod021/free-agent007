# فاز M112: Product Collaboration، Onboarding و Notifications

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-CP-04`، `GAP-CP-05`، `GAP-CP-08`، `GAP-UX-01`، `GAP-UX-02`، `GAP-UX-04`
**کد kernel:** `src/core/product-collaboration-runtime.ts`
**تست:** `test/next-product-surface-phases.test.ts`

## هدف و مرز

M112 اولین تجربه کاربر، notification، approval surface و collaborative Run را به contract تبدیل
می‌کند. onboarding باید consent، connection check، compute mode، safety notice و first-run evidence
داشته باشد. notification باید redacted، deduplicated و actionable باشد. approval surface باید
risk/diff/reversibility، expiry، human decision و separation of duties داشته باشد. local mode
نباید egress کند. این فاز Web UI، email provider، in-app store، notification queue، realtime
collaboration یا approval client واقعی را اجرا نمی‌کند.

## معماری

`M112OnboardingContract` state، user/project، compute mode، consent، connection، first-run، locale
و egress را نگه می‌دارد. `M112NotificationContract` recipient، kind، hashهای محتوا، source run،
dedupe، channel و redaction را ثبت می‌کند. `M112ApprovalSurfaceRequest` risk/diff، action، expiry،
human decision و SoD را gate می‌کند. `M112CollaborativeRunContract` owner/participants، handoff،
comments، local egress و audit trail را نگه می‌دارد.

## قراردادهای اصلی

- `validateM112Onboarding`: consent، connection، first-run، safety notice و local egress را بررسی می‌کند.
- `validateM112Notification`: redaction، dedupe، actionable approval و webhook source را validate می‌کند.
- `decideM112ApprovalSurface`: risk/diff، expiry، human decision، reversibility و SoD را gate می‌کند.
- `validateM112CollaborativeRun`: owner/participant separation، comments، handoff، audit و egress را enforce می‌کند.

## sprintها

### Sprint A — Onboarding

- empty/loading/error states
- compute-mode selection
- consent و connection check
- first-run checklist

### Sprint B — Notifications

- in-app/email/webhook channels
- dedupe و preference
- quota/failure/approval events
- acknowledgement

### Sprint C — Approval Surface

- risk summary
- diff/reversibility
- expiry و reject/request changes
- reviewer separation

### Sprint D — Collaboration

- Run participants
- handoff/comments
- timeline
- local/offline boundary

## Threat Model

- **Dark pattern approval:** risk، diff، expiry و reversibility باید قابل مشاهده باشند.
- **Notification leakage:** body/title hash و redaction اجباری است.
- **Duplicate alert:** dedupe key از notification storm جلوگیری می‌کند.
- **Local egress surprise:** local mode در contract صریحاً بدون egress است.
- **Self-approval:** actor/reviewer separation در approval gate می‌شود.

## Prompt pack

### `m112-product-collaboration-engineer`

```text
نقش: Product Collaboration Engineer

onboarding را با consent، connection check، compute mode، safety notice و first-run evidence بساز.
notification باید redacted، deduplicated و actionable باشد. approval surface باید risk، diff،
reversibility، expiry، human decision و separation of duties نشان دهد. local mode egress ندارد.
```

### `m112-product-evidence-gate`

```text
نقش: Product Evidence Gate

برای onboarding، notification، approval و collaboration، state/hash، consent، source run، dedupe،
risk/diff، expiry، participant، audit، command و exit code ثبت کن. wireframe یا snapshot UI جای
browser accessibility، delivery queue، realtime collaboration و approval E2E evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای onboarding، notification، approval و collaborative run.
- Web UI، notification provider/queue، approval client، realtime store، accessibility runner و collaboration E2E باید integration شوند.
- kernel M112 به‌تنهایی product UI، notification delivery یا approval production را ثابت نمی‌کند و `done_tested` نیست.
