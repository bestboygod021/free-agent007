# فاز M100: Durable Workflow، Queue و Scheduling

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-EX-11`، `GAP-EX-13`، `GAP-IG-07`، `GAP-DA-04`، `GAP-OB-01`
**کد kernel:** `src/core/workflow-queue-runtime.ts`
**تست:** `test/next-agent-platform-phases.test.ts`

## هدف و مرز

M100 triggerهای event/cron/manual/webhook، durable job envelope، worker lease، retry، DLQ و
idempotency را formalize می‌کند. هر job باید tenant، payload hash، trace، attempt، lease و
idempotency داشته باشد. retry فقط برای خطای مناسب و عملیات idempotent مجاز است. این فاز
PostgreSQL queue، scheduler service، consumer، timer، outbox، distributed lock یا DLQ UI واقعی
را اجرا نمی‌کند.

## معماری

`WorkflowTriggerContract` منبع، consent، schedule، dedupe و concurrency را نگه می‌دارد.
`DurableWorkflowJob` lifecycle و lease fencing را توصیف می‌کند. `WorkflowRetryDecisionRequest`
خطاهای policy/validation را از transient/rate-limit جدا می‌کند. `WorkflowDeadLetterEvidence`
payload redaction و replay approval را الزام می‌کند. زمان و lease از clock واقعی adapter می‌آید،
نه از مدل.

## قراردادهای اصلی

- `validateWorkflowTrigger`: cron/event/webhook و source allowlist، consent و concurrency را بررسی می‌کند.
- `decideWorkflowJobLease`: state، attempt، not-before و active lease را gate می‌کند.
- `decideWorkflowRetry`: Retry-After، idempotency، side effect و retry budget را enforce می‌کند.
- `validateWorkflowDeadLetter`: payload redaction و operator approval برای replay را می‌سنجد.

## sprintها

### Sprint A — Trigger Registry

- event و webhook trigger
- cron syntax و timezone
- consent و source allowlist
- dedupe و disable

### Sprint B — Durable Queue

- job envelope و trace
- lease/fencing
- priority و concurrency
- outbox/idempotency store

### Sprint C — Retry و DLQ

- error taxonomy
- exponential backoff و Retry-After
- max attempts
- redacted dead letter و approved replay

### Sprint D — Operations

- worker health
- queue depth و SLO
- stuck lease recovery
- audit و operator runbook

## Threat Model

- **Duplicate execution:** idempotency key و side-effect gate اجباری است.
- **Lease split-brain:** active lease و owner hash باید بررسی شود.
- **Retry storm:** retry budget و Retry-After رعایت می‌شود.
- **Malicious trigger:** source allowlist، consent و approval برای webhook لازم است.
- **DLQ leakage:** failure payload قبل از ذخیره redacted می‌شود.

## Prompt pack

### `m100-workflow-queue-engineer`

```text
نقش: Workflow and Queue Engineer

trigger را با kind، source allowlist، consent، schedule، dedupe و concurrency بساز. job envelope
باید tenant، payload hash، trace، attempt، lease و idempotency داشته باشد. فقط خطای transient یا
rate-limit را با Retry-After تکرار کن؛ validation/policy و side effect غیر idempotent را retry نکن.
```

### `m100-queue-evidence-gate`

```text
نقش: Queue Evidence Gate

برای trigger، enqueue، lease، retry، DLQ و replay، envelope hash، owner، attempt، delay، redaction،
operator، command و exit code ثبت کن. fake timer یا in-memory array جای queue durable، worker
concurrency، outbox و crash recovery evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای trigger، lease، retry، idempotency و DLQ.
- durable store، scheduler، worker consumers، fencing، metrics، crash recovery و replay UI باید integration شوند.
- kernel M100 به‌تنهایی workflow scheduler، queue durability یا exactly-once side effect را ثابت نمی‌کند و `done_tested` نیست.
