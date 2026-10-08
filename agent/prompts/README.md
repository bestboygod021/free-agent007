# Prompt library

Every agent in the platform is defined by one file in this directory. A prompt
file is a versioned artifact: it has an id, a version, a declared output
contract and a list of shared fragments it includes. Changing a prompt is a
change to the product and gets reviewed like code.

## Layout

```
prompts/
├── 00-orchestrator.md          the coordinator; owns state and delegation
├── 01-product-analyst.md       request -> specification
├── 02-requirements-clarifier.md  which questions are worth asking
├── 03-solution-architect.md    specification -> plan and task DAG
├── 04-repo-analyst.md          read-only reconnaissance
├── 05-coding-agent.md          one approved task, in a sandbox
├── 06-qa-accessibility.md      test matrix, execution, WCAG 2.1 AA
├── 07-security-reviewer.md     findings and the release gate
├── 08-devops-deploy.md         sandbox, image, preview, deploy, rollback
├── 09-browser-automation.md    human-supervised browser steps
├── 10-documentation.md         README, runbook, delivery report
├── 11-code-reviewer.md         independent review of the diff
├── 12-repair.md                bounded repair loop (max 3 attempts)
└── fragments/                  shared blocks, included by reference
    ├── invariants.md           the 20 non-negotiables
    ├── untrusted-content.md    prompt-injection defence
    ├── evidence-rule.md        no success claim without a tool result
    ├── tool-call-protocol.md   risk classification and approval
    ├── compute-mode.md         the user's free/paid/local choice, rendered
    └── persian-voice.md        language and tone
```

## Runtime variables

`compute-mode.md` is rendered with `{{var:key}}` placeholders. They are filled by
`promptVarsForMode(mode)` in `src/core/prompt-vars.ts`, which reads the resolved
`ModeProfile`:

```ts
const vars = promptVarsForMode("local", { privacyLevel: "confidential" });
const prompt = composePrompt("05-coding-agent.md", vars);
```

`computeMode`, `modelLocality`, `allowCloudEgress`, `perRunTokenBudget`,
`hardStopTokens`, `maxRepairAttempts`, `maxParallelTasks`, `qualityGates`,
`disabledCapabilities`, `warningsFa`, `privacyLevel`.

An unknown or unresolved variable is a hard error, not an empty string — a prompt
that silently lost its budget would be worse than one that refuses to build.
This means switching the compute mode changes what every agent is *told*, in the
same commit that changes which provider answers.

## Front matter

```yaml
---
id: coding-agent                # stable id, used by the router and the audit log
version: 1.1.0                  # bumped on every behavioural change
role: Software Engineer         # human-readable
modelTaskType: code_edit        # input to the model router
outputSchema: https://forgepilot.dev/schema/completion-report.schema.json
outputShape: object             # object | array-of-items (default: object)
temperature: 0.1
includes:                       # fragments, resolved at compose time
  - fragments/invariants.md
  - fragments/compute-mode.md
---
```

`outputSchema: none` means the agent returns free-form markdown that a human
reads (Repository Analyst, Code Reviewer). Everything else is validated against
its JSON Schema before any downstream consumer sees it.

## Composition

`composePrompt(id)` in `src/core/prompt-library.ts` reads the file, resolves
`{{include: path}}` placeholders and returns the final system prompt plus the
parsed metadata. Prompts are never concatenated by hand at runtime.

## Rules for editing a prompt

1. Bump `version` on any behavioural change.
2. Never weaken a fragment to make one agent more permissive.
3. Every agent that can call a tool includes `tool-call-protocol.md`.
4. Every agent that can claim completion includes `evidence-rule.md`.
5. Every agent includes `invariants.md`, `untrusted-content.md` and
   `compute-mode.md`.
6. If you add an output field, update the schema in `/schema` first, then the
   prompt, then add an example in `/examples`. The test suite fails otherwise.

## Testing prompts

Prompts are tested two ways:

- **Structurally** — `test/prompt-library.test.ts` verifies front matter,
  fragment resolution, schema references and that every agent carries the
  invariants.
- **Behaviourally** — an evaluation harness runs a fixed set of scenarios
  (ambiguous request, injection attempt in a README, failing test, missing
  permission, exhausted quota) and scores the output against the schema and the
  invariants. A prompt change that lowers the score does not ship.
