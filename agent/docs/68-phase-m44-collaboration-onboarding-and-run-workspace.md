# فاز M44: Collaboration، Onboarding و Run Workspace

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-CP-04`، `GAP-CP-05`، `GAP-CP-07`، `GAP-CP-08`، `GAP-UX-02`، `GAP-UX-03`، `GAP-UX-07`
**کد kernel:** `src/core/collaboration-onboarding-runtime.ts`
**تست:** `test/future-runtime-phases.test.ts`

## هدف و مرز

M44 قرارداد همکاری روی Run، comment/handoff، onboarding، starter template، offline
collaboration و Run workspace را مشخص می‌کند. comment و template فقط hash/metadata دارند؛
متن Issue/README/template untrusted است. این فاز collaboration database، notification
transport، Web App، Forge CLI، template registry یا offline sync واقعی اجرا نمی‌کند.

## معماری

Run workspace یک organization/run-scoped projection است. collaboration policy actor role،
action، target و approval را پیش از append به event/outbox بررسی می‌کند. onboarding plan
mode، consent و step completion را با local-first default می‌سازد. template manifest با
source، version، content hash، license و approval قبل از materialize شدن validate می‌شود.
offline client فقط read/comment queue با idempotency دارد؛ approval و run start هنگام
offline بودن متوقف می‌شوند.

## قراردادهای اصلی

- `decideRunCollaboration` comment، assignment، handoff و agent restriction را gate می‌کند.
- `planOnboarding` step uniqueness، completion، local mode و egress consent را بررسی می‌کند.
- `validateProjectTemplate` source trust، license، content hash و approval را enforce می‌کند.
- `validateCollaborationContent` secret را از comment/handoff content خارج می‌کند.
- `decideOfflineCollaboration` offline mutation و approval را متوقف و idempotency را الزام می‌کند.

## sprintها

### Sprint A — Run Collaboration

- comment، mention و audit event
- assignment و approval handoff
- reviewer/owner separation
- event replay و conflict resolution

### Sprint B — Onboarding و First Run

- mode انتخابی free/paid/local
- first-run checklist و project bootstrap
- quota/provider consent و degraded onboarding
- notification preference و progress state

### Sprint C — Starter Templates

- curated/local/uploaded template registry
- license و provenance manifest
- install script sandbox و approval
- template version، update و rollback

### Sprint D — Workspace و Offline Client

- diff/terminal/taskboard/timeline projection
- Forge CLI command contract
- offline read/comment queue و reconnect
- Web App/CLI E2E و conflict evidence

## Threat Model

- **Collaboration privilege escalation:** agent نمی‌تواند human approval یا ownership را
  reassign کند؛ handoff، assignment و comment به role، target و organization bind می‌شوند.
- **Template supply-chain injection:** untrusted template، install script بدون approval و
  license نامعلوم نصب نمی‌شوند؛ content/version hash باید match باشد.
- **Offline replay:** هر queued action idempotency دارد؛ approval و run start offline اجرا
  نمی‌شوند و reconnect دوباره policy را ارزیابی می‌کند.
- **Cross-tenant disclosure:** comment، timeline، handoff و workspace projection فقط با
  organization/run scope خوانده می‌شوند و secret در content ذخیره نمی‌شود.

## Prompt pack

### `m44-collaboration-onboarding-engineer`

```text
نقش: Collaboration and Onboarding Runtime Engineer

هر action را به organization، run، actor role و idempotency bind کن. handoff/assignment
بدون separation of duties یا approval مجاز نیست. template را untrusted بدان؛ license،
content hash، source و install script را قبل از materialize validate کن. offline فقط
read/comment queue داشته باشد و approval/run start را متوقف کند.
```

### `m44-collaboration-evidence-gate`

```text
نقش: Collaboration Evidence Gate

برای comment، handoff، onboarding، template install، offline queue، reconnect و conflict،
command، exit code، event hash، tenant probe و browser/CLI output ثبت کن. deterministic
contract یا local mock جای Web App/CLI collaboration evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای role/action، approval handoff، template trust/license، onboarding
  precedence، secret content و offline approval denial.
- collaboration store، notifications، template registry، Web App، Forge CLI و offline
  sync باید در integration جداگانه اجرا شوند.
- claim درباره collaboration، first-run completion، template safety یا offline reliability
  بدون E2E و evidence واقعی `done_tested` نیست.
