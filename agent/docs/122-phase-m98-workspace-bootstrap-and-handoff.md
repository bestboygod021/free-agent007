# فاز M98: Project Templates، Workspace Bootstrap و Handoff

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-CP-05`، `GAP-CP-07`، `GAP-CP-08`، `GAP-DA-03`، `GAP-UX-07`
**کد kernel:** `src/core/workspace-bootstrap-runtime.ts`
**تست:** `test/next-memory-security-client-phases.test.ts`

## هدف و مرز

M98 project template، first workspace bootstrap، no-clobber config، collaboration handoff و
comment evidence را formalize می‌کند. template باید dependency/license/starter data review داشته
باشد. bootstrap path-relative، idempotent و backup-aware است. handoff باید context/diff/test
bundle و recipient acceptance داشته باشد. این فاز project generator، filesystem writer، Forge CLI،
Git worktree، seed service یا collaboration UI واقعی را اجرا نمی‌کند.

## معماری

`ProjectTemplateContract` kind/version/files/setup hash، allowed paths، dependency/license review
و redacted starter data را نگه می‌دارد. `WorkspaceBootstrapRequest` target path، local/remote mode،
no-clobber، backup و idempotency را gate می‌کند. `WorkspaceHandoffEvidence` from/to user hash،
context/diff/test evidence، redaction و acceptance را جمع می‌کند. comment فقط body/author hash و path نسبی دارد.

## قراردادهای اصلی

- `validateWorkspaceProjectTemplate` path، dependency/license، redaction و approval را validate می‌کند.
- `decideWorkspaceBootstrap` organization/template match، path، backup و no-clobber را gate می‌کند.
- `validateWorkspaceHandoffEvidence` users، context/diff/tests، redaction و acceptance را بررسی می‌کند.
- `validateWorkspaceComment` path، PII redaction و timestamp را enforce می‌کند.

## sprintها

### Sprint A — Templates

- web/api/worker/agent/self-host templates
- dependency/license scan
- starter data
- version/upgrade

### Sprint B — Bootstrap

- local workspace
- remote workspace
- config backup/no-clobber
- idempotent setup

### Sprint C — Handoff

- context pack
- diff/test evidence
- pair/review/handoff modes
- acceptance/revoke

### Sprint D — Collaboration

- comments/paths
- resolve state
- mentions/assignment
- timeline/audit

## Threat Model

- **Template supply-chain risk:** dependency/license review و approval لازم است.
- **Path traversal:** template و bootstrap path فقط relative/allowlisted هستند.
- **Config clobber:** backup و no-clobber gate اجباری است.
- **Handoff leakage:** context/diff/test evidence باید redacted باشد.
- **False acceptance:** recipient acceptance صریح و قابل audit است.

## Prompt pack

### `m98-workspace-bootstrap-engineer`

```text
نقش: Workspace Bootstrap Engineer

template را با version، allowed paths، dependency/license review و redacted starter data بساز.
bootstrap باید idempotent، relative-path، backup و no-clobber باشد. handoff را با context/diff/test
hash، user separation، redaction و recipient acceptance ثبت کن. raw config/secret را کپی نکن.
```

### `m98-workspace-evidence-gate`

```text
نقش: Workspace Evidence Gate

برای template، bootstrap، backup، generated files، handoff، diff، test و comment، artifact/path/
context hash، acceptance، command و exit code ثبت کن. template JSON یا dry-run جای filesystem,
Forge CLI، Git worktree و collaboration E2E evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای template، path، no-clobber، bootstrap، handoff و comment.
- generator، filesystem/worktree، Forge CLI، seed service، sync و collaboration UI باید integration شوند.
- kernel M98 به‌تنهایی project bootstrap، workspace handoff یا collaboration production را ثابت نمی‌کند و `done_tested` نیست.
