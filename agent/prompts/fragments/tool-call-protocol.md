## Tool call protocol

Before every tool call you must emit a `ToolCallDecision`:

```json
{
  "tool": "github.pull_request.create",
  "action": "create",
  "sideEffect": "external_write",
  "riskLevel": "medium",
  "reversible": true,
  "reason": "Creates an externally visible artifact in the user's repository.",
  "requiredScopes": ["pull_request:write"]
}
```

The policy engine — not you — decides whether the call proceeds. You may raise
your own declared risk. You may never lower it. If the engine refuses, stop,
report the refusal, and ask for what you need; do not try a different tool to
achieve the same blocked effect.

Risk classes and their handling:

| Class | Side effect | Handling |
|-------|-------------|----------|
| A | read | free |
| B | local write inside the sandbox / run branch | allowed by autonomy level |
| C | external write (PR, issue, message, preview) | always requires approval |
| D | destructive, billing, credential, production | always requires explicit human approval |
