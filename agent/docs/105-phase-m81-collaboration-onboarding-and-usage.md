# فاز M81: Collaboration، Onboarding، Notification و Usage Control

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-CP-03`، `GAP-CP-04`، `GAP-CP-05`، `GAP-CP-07`، `GAP-CP-08`، `GAP-UX-07`، `GAP-DA-03`، `GAP-OB-04`
**کد kernel:** `src/core/collaboration-usage-runtime.ts`
**تست:** `test/next-governance-and-trust-phases.test.ts`

## هدف و مرز

M81 مسیر first run تا همکاری واقعی روی Run را طراحی می‌کند: comment، approval handoff،
notification، template/starter kit، local/BYOK/free onboarding و metering/entitlement. این فاز
web UI، email provider، billing provider، usage database، seed service یا Forge binary واقعی را
اجرا نمی‌کند.

## معماری

`CollaborationRunAccess` actor/run organization را مقایسه و role/action را gate می‌کند.
`GovernedOnboardingPlan` mode و completed steps را با local fallback، BYOK configuration و free
provider consent تطبیق می‌دهد. `UsageEntitlement` allowance/request را پیش از مصرف بررسی می‌کند.
Notification فقط recipient/payload hash و idempotency key دارد؛ raw email یا webhook secret وارد
kernel نمی‌شود.

## قراردادهای اصلی

- `validateCollaborationRunAccess` cross-tenant، role، handoff و approval delegation را بررسی می‌کند.
- `decideGovernedOnboardingPlan` step integrity و local/BYOK/free fallback را gate می‌کند.
- `validateUsageEntitlement` quota، period، approval و local mode را validate می‌کند.
- `decideNotificationDelivery` preference، hash/reference و idempotency را enforce می‌کند.

## sprintها

### Sprint A — First Run

- welcome، project template و starter kit
- local/BYOK/free selection
- provider/egress consent
- seed و deterministic fixture

### Sprint B — Run Collaboration

- comments و mentions
- approval assignment
- handoff و agent/user boundary
- timeline و audit

### Sprint C — Notifications

- in-app event
- email reference adapter
- webhook reference adapter
- preference و retry/dedupe

### Sprint D — Metering

- per org/run usage
- entitlement/quota
- near-limit warning
- local mode no-billing path

## Threat Model

- **Cross-tenant collaboration:** actor، run و target باید organization یکسان داشته باشند.
- **Quota bypass:** allowance قبل از action چک می‌شود؛ local mode هزینه cloud را جعل نمی‌کند.
- **Notification leakage:** recipient و payload hash می‌شوند و preference اجباری است.
- **Approval hijack:** handoff و approval delegation evidence مستقل دارند.
- **BYOK/free ambiguity:** provider review، consent و fallback صادقانه نمایش داده می‌شود.

## Prompt pack

### `m81-collaboration-and-usage-engineer`

```text
نقش: Collaboration and Usage Engineer

Run را organization-bound نگه دار. comment/handoff/approval را با role و evidence gate کن.
first-run باید local-first، BYOK و free API را شفاف و قابل fallback نشان دهد. quota و entitlement
پیش از مصرف محاسبه شوند. notification فقط hash/reference و idempotency داشته باشد و raw email/key
ذخیره نشود.
```

### `m81-product-evidence-gate`

```text
نقش: Product Adoption Evidence Gate

برای onboarding، template، collaboration، handoff، notification، quota و entitlement، step state،
event hash، preference، usage snapshot، command و exit code ثبت کن. unit contract جای UI first-run،
email delivery، billing reconciliation و cross-tenant E2E نیست.
```

## DoD و production evidence boundary

- unit/contract برای collaboration، role/action، onboarding modes، notification و entitlement.
- web UI، email/webhook adapters، usage store، billing/reconciliation، templates و Forge client باید integration شوند.
- kernel M81 به‌تنهایی onboarding، collaboration delivery یا billing production را ثابت نمی‌کند و `done_tested` نیست.
