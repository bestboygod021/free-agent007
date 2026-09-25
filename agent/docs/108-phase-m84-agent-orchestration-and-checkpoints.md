# فاز M84: Agent Orchestration، Workflow Graph و Checkpoint

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-IN-08`، `GAP-IN-12`، `GAP-EX-09`، `GAP-OB-01`، `GAP-CP-05`
**کد kernel:** `src/core/agent-orchestration-runtime.ts`
**تست:** `test/next-orchestration-and-release-phases.test.ts`

## هدف و مرز

M84 قرارداد اجرای workflowهای agentی را از graph تا schedule، checkpoint، resume و tool-call
approval یکپارچه می‌کند. graph باید acyclic و versioned باشد و هر side effect در boundary
جداگانه approval داشته باشد. این فاز scheduler واقعی، durable queue، worker runtime، state
store، model/tool adapter یا crash-resume production را اجرا نمی‌کند.

## معماری

`AgentWorkflowGraph` node/edge، entry node، graph hash و approval را نگه می‌دارد و cycle را
بررسی می‌کند. `AgentRunSchedule` mode، step/runtime budget و idempotency را محدود می‌کند.
`AgentCheckpointEnvelope` state/input/output hash، sequence، encryption و durability evidence
دارد. `decideAgentToolCall` target organization، risk، operation و approval را gate می‌کند.

## قراردادهای اصلی

- `validateAgentWorkflowGraph` node/edge integrity، cycle و side-effect boundary را validate می‌کند.
- `decideAgentRunScheduling` workflow match، budget، mode و approval را gate می‌کند.
- `validateAgentCheckpointEnvelope` sequence، encryption، durability و timestamp را بررسی می‌کند.
- `decideAgentToolCall` cross-tenant، risk و side-effect approval را enforce می‌کند.

## sprintها

### Sprint A — Workflow Graph

- node/capability schema
- DAG validation
- version و graph hash
- cycle/duplicate detection

### Sprint B — Scheduler

- queue priority
- step/runtime budget
- idempotency
- pause/resume/cancel

### Sprint C — Checkpoint و Recovery

- encrypted checkpoint
- fencing/sequence
- crash resume
- replay و cleanup

### Sprint D — Tool Boundary

- tool capability registry
- side-effect approval
- target tenant guard
- idempotent tool call

## Threat Model

- **Workflow cycle:** cycle یا self-edge schedule نمی‌شود.
- **Run explosion:** max steps و max runtime اجباری است.
- **State tampering:** checkpoint durable، encrypted و hash-bound است.
- **Tool escalation:** write/execute/egress و high-risk call بدون approval رد می‌شود.
- **Cross-tenant execution:** organization run، workflow و tool target باید همسان باشند.

## Prompt pack

### `m84-agent-orchestration-engineer`

```text
نقش: Agent Orchestration Engineer

workflow را DAG، versioned و hash-bound نگه دار. run با step/runtime budget و idempotency schedule
شود. checkpoint باید encrypted و durable باشد و sequence/fencing داشته باشد. هر tool write,
execute یا egress با capability، target tenant و approval مستقل gate شود.
```

### `m84-orchestration-evidence-gate`

```text
نقش: Orchestration Evidence Gate

برای graph، schedule، lease، checkpoint، resume، tool call و approval، graph/state/input/output
hash، sequence، command و exit code ثبت کن. in-memory workflow یا unit test جای crash-resume،
durable scheduler و tool integration evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای graph، cycle، budget، checkpoint، resume و tool approval.
- scheduler، queue، worker، durable state store، model/tool adapters و crash recovery باید integration شوند.
- kernel M84 به‌تنهایی agent runtime یا reliable workflow execution production را ثابت نمی‌کند و `done_tested` نیست.
