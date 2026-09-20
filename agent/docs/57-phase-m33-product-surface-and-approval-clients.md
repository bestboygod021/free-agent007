# فاز M33: Product Surface، Approval UX و Client Contracts

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-UX-01`، `GAP-UX-02`، `GAP-UX-03`، `GAP-UX-04`، `GAP-UX-05`، `GAP-UX-07`، `GAP-API-04`، `GAP-QA-03`، `GAP-QA-05`
**کد kernel:** `src/core/product-surface-contract.ts`
**تست:** `test/audit-followup-phases.test.ts`

## هدف و مرز

M33 قرارداد Web/API product surface، screen states، SSE resume، approval inbox،
CLI/IDE client و accessibility را تعریف می‌کند. این فاز Web App، browser E2E،
SSE backend، generated client یا design system واقعی تولید نمی‌کند.

## معماری

API projection لایه‌ی read model tenant-scoped را با revision به Web surface می‌دهد.
SSE gateway از retained event log با `Last-Event-ID` resume می‌کند و در gap snapshot
می‌فرستد؛ هیچ eventی mutation مستقیم نیست. Approval service diff/risk/cost/expiry را
به inbox می‌دهد و پس از MFA و separation-of-duties command را به policy engine تحویل
می‌دهد. CLI/IDE از configured یا relative API base استفاده می‌کند و browser client
هیچ localhost dependency یا raw credential ندارد.

## قراردادهای اصلی

- `validateScreenModel` state، revision، body hash و no-secret invariant را بررسی می‌کند.
- `planSseResume` cursor، retained window و snapshot requirement را مشخص می‌کند.
- `decideApprovalView` expiry، diff، risk، reversibility، fresh MFA و separation of
  duties را gate می‌کند.
- `validateClientCommand` localhost browser call و raw credential را رد می‌کند.
- `evaluateAccessibilitySummary` keyboard، focus، critical finding و fa-IR RTL را
  enforce می‌کند.

## Threat Model

- **Cross-tenant UI disclosure:** screen model، route، SSE cursor و approval record به organization و server revision bind می‌شوند؛ stale/cross-tenant state deny است.
- **Approval bypass و confused deputy:** risk، diff، cost، expiry، reversibility، fresh MFA و separation of duties باید قبل از action دیده و بررسی شوند.
- **SSE replay و client injection:** Last-Event-ID، retained window و snapshot fallback read-only و idempotent هستند؛ event payload untrusted و بدون secret نمایش داده می‌شود.
- **Browser and accessibility safety:** browser به localhost credential/API call نمی‌زند؛ keyboard/focus/RTL/critical findings gate release هستند و screenshot/mock جای E2E evidence را نمی‌گیرد.

## sprintها

### Sprint A — Screen و API Surface

- screen inventory و empty/loading/ready/error/blocked states
- server revision و optimistic update prohibition
- problem/error contract و no secret display
- tenant-aware route model

### Sprint B — SSE و Timeline

- Last-Event-ID، retained event window و snapshot fallback
- reconnect، heartbeat و duplicate event handling
- timeline، diff، audit و run projection
- replay read-only و بدون side effect

### Sprint C — Approval Inbox و Clients

- risk، cost، diff، expiry و reversibility card
- fresh MFA و no self-approval
- CLI command contract و configured/relative API base
- IDE client بدون localhost browser dependency

### Sprint D — Accessibility و E2E

- keyboard، focus، screen reader و contrast
- Persian RTL و mixed-direction path/code/log
- Playwright login-to-approval flow
- axe/manual evidence و regression gate

## Prompt pack

### `m33-product-surface-architect`

```text
نقش: Product Surface Architect

هر صفحه را با tenant، revision و explicit state مدل کن. SSE resume باید Last-Event-ID
و snapshot fallback داشته باشد. approval card باید diff، risk، cost، expiry،
reversibility و fresh MFA نشان دهد. هیچ secret، optimistic mutation بدون server
revision یا browser call به localhost مجاز نیست.
```

### `m33-ux-evidence-gate`

```text
نقش: UX and Accessibility Evidence Gate

برای login، run، timeline، diff، approval، SSE reconnect، keyboard، screen reader،
RTL و cross-tenant، مسیر واقعی، browser output، screenshot/axe report و exit code ثبت
کن. screen contract یا playground demo به‌جای Web App E2E معتبر نیست.
```

## DoD و evidence boundary

- unit برای screen state، SSE cursor، approval expiry/self-approval، client safety و RTL/a11y gate.
- Web App، SSE transport، CLI/IDE package، design system، Playwright و axe در integration
  بعدی ساخته و اجرا می‌شوند.
- production deploy و mutation همچنان human approval و protected branch boundary دارد.
