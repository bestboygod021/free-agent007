# فاز M62: AI Workflow Builder و Agent Graphs

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IN-08`، `GAP-IN-12`، `GAP-UX-07`، `GAP-CP-04`، `GAP-CP-05`
**کد kernel:** `src/core/ai-workflow-builder-runtime.ts`
**تست:** `test/next-ai-platform-phases.test.ts`

## هدف و مرز

M62 اجازه می‌دهد کاربر از modelهای directory و connectorهای M49-M53 یک workflow/agent graph
بسازد: input، model، tool، condition، transform، human approval و output. workflow قابل
نمایش در Studio است، graph cycle و schema آن validate می‌شود و execution modeهای preview/local/
production_candidate دارد. این فاز workflow engine، agent runtime، tool executor یا CLI واقعی
را اجرا نمی‌کند.

## معماری

`AiWorkflowDefinition` graph versioned و organization/project scoped است. هر node ورودی‌های
صریح، modelId یا connectorId، output schema، approval و allowed flag دارد. `validateWorkflowGraph`
reachability و cycle را بررسی می‌کند. `decideAiWorkflowExecution` version، input hash، budget،
egress و approval را پیش از execution gate می‌کند. raw credential هیچ‌وقت بخشی از graph نیست.

## قراردادهای اصلی

- `validateAiWorkflow` node، model/tool binding، schema، entry/output و mode را validate می‌کند.
- `decideAiWorkflowExecution` version، budget، egress، approval و input را gate می‌کند.
- `validateWorkflowGraph` cycle و reachability را بررسی می‌کند.
- `planWorkflowHandoff` workflow artifact را به local/sandbox/project handoff محدود می‌کند.

## sprintها

### Sprint A — Graph Builder

- node palette و edge editor
- model/connector picker
- schema mapping و validation
- version/undo/branch

### Sprint B — Human-in-the-loop

- approval node و pause/resume
- owner/reviewer separation
- input/output redaction
- notification و audit event

### Sprint C — Safe Execution

- sandboxed tool runner
- allowed API/file path
- cycle/timeout/retry limit
- deterministic preview run

### Sprint D — Product Integration

- Studio graph ↔ workflow persistence
- Forge CLI export/run
- model routing و connector action
- E2E workflow evidence

## Threat Model

- **Graph injection/unsafe tools:** tool node connectorId و schema لازم دارد؛ graph خودش authority یا credential ایجاد نمی‌کند.
- **Cycle/retry denial:** cycle، timeout و retry bound پیش از execution رد می‌شوند.
- **Approval bypass:** production candidate و approval node بدون human approval اجرا نمی‌شوند.
- **API/path hallucination:** allowed connector/file/API paths از policy می‌آیند؛ node ناشناخته deny می‌شود.
- **Cross-tenant workflow:** definition، run و artifact با organization/project/version bind هستند.

## Prompt pack

### `m62-ai-workflow-builder-engineer`

```text
نقش: AI Workflow Builder Engineer

graph را versioned و typed بساز. هر model/tool node باید modelId یا connectorId، input و
output schema داشته باشد. cycle، path/API hallucination، retry بی‌نهایت و raw credential را
رد کن. production candidate و هر side effect را به approval، egress consent، budget و audit
بسپار؛ graph preview جای execution production نیست.
```

### `m62-workflow-evidence-gate`

```text
نقش: Workflow Evidence Gate

برای graph validation، cycle check، schema، approval pause، tool sandbox، preview run،
retry/timeout و handoff، graph hash، execution trace، command و exit code ثبت کن. static graph
یا mocked tool جای workflow engine و connector E2E evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای graph، node binding، cycle/reachability، schema، budget، approval و handoff.
- graph editor، persistence، runtime، sandbox/tool executor، CLI و connector/model integration باید اجرا شوند.
- تعریف workflow به‌تنهایی به معنی اجرای موفق agent یا safe automation نیست و `done_tested` نمی‌شود.
