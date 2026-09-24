<div align="center">

# free-agent007

**An LLM gateway with a deterministic agent built into it.**

Two halves, merged into one process:

**The gateway** — 7.4 billion tokens per month across 34 free providers and 635
free model endpoints, plus any custom OpenAI-compatible chat, embedding, image
or audio endpoint, behind a single `/v1` API. Keys stored encrypted. A router
picks the best available model per request, fails over when one is
rate-limited, and tracks per-key usage so you stay under every free-tier cap.

**The agent** — the ForgePilot deterministic kernel, wired to 23 audited tools.
It reads code, finds every use of a symbol, writes patches, commits, runs tests
inside a real kernel namespace sandbox, and opens pull requests under a
credential the model never sees. Every tool call passes six gates and lands in
an audit table, including the refused ones.

The rule underneath both: **the model proposes, the code decides.**

[![CI](https://github.com/tashfeenahmed/freellmapi/actions/workflows/ci.yml/badge.svg)](https://github.com/tashfeenahmed/freellmapi/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/tashfeenahmed/freellmapi?style=flat&logo=github&color=yellow)](https://github.com/tashfeenahmed/freellmapi/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)
[![Docker image](https://img.shields.io/badge/ghcr.io-freellmapi-2496ED?logo=docker&logoColor=white)](https://github.com/tashfeenahmed/freellmapi/pkgs/container/freellmapi)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tashfeenahmed/freellmapi)

**[freellmapi.co](https://freellmapi.co/?utm_source=github&utm_medium=readme&utm_campaign=repository&utm_content=readme_top)** · browse the full catalog: 474 model families, 635 free endpoints

**English** · [简体中文](README.zh-cn.md)

<p align="center">
  <a href="https://github.com/tashfeenahmed/freellmapi/releases/latest"><img src="repo-assets/badges/macos.svg" height="48" alt="Download for macOS"></a>
  <a href="https://github.com/tashfeenahmed/freellmapi/releases/latest"><img src="repo-assets/badges/windows.svg" height="48" alt="Download for Windows"></a>
  <a href="docs/en/install/01-install.md#docker-compose"><img src="repo-assets/badges/docker.svg" height="48" alt="Self-host with Docker"></a>
  <a href="https://play.google.com/store/apps/details?id=co.freellmapi.app"><img src="repo-assets/badges/play-store.svg" height="48" alt="Get it on Google Play"></a>
  <a href="https://apps.apple.com/app/id6804648934"><img src="repo-assets/badges/app-store.svg" height="48" alt="Download on the App Store"></a>
</p>

![FreeLLMAPI dashboard — Models page with the monthly token budget](repo-assets/github-hero.png)


Your router updates its own model catalog from a signed feed: new free models, quota changes, and compatibility fixes land without a `git pull`. Free installs get the monthly snapshot, so a model reaches them 30 days after it joins the live feed; premium routers get it the same day.
**[Go live at freellmapi.co](https://freellmapi.co/?utm_source=github&utm_medium=readme&utm_campaign=premium&utm_content=readme_top#pricing)** ($19/yr, cancel anytime).

</div>

---

## Contents

- [Why this exists](#why-this-exists)
- [Supported providers](#supported-providers)
- [Compatible CLIs & coding agents](#compatible-clis--coding-agents)
- [How it compares](#how-it-compares)
- [Features](#features)
- [The agent: ForgePilot kernel + a wired toolchain](#the-agent-forgepilot-kernel--a-wired-toolchain)
- [Quick start](#quick-start)
- [Running the agent](#running-the-agent)
- [Desktop app](#desktop-app)
- [Works with OpenAI-compatible clients](#works-with-openai-compatible-clients)
- [Languages](#languages)
- [Premium (live catalog)](#premium-live-catalog)
- [Using the API](#using-the-api)
- [Screenshots](#screenshots)
- [How it works](#how-it-works)
- [FAQ](#faq)
- [Limitations](#limitations)
- [Contributing](#contributing)
- [Disclaimer](#disclaimer)

**Guides:** [Agent guide](agent/USAGE.md) · [Install & deploy](docs/en/install/01-install.md) · [API reference](docs/en/api/01-rest-api.md) · [Clients & coding agents](docs/en/clients/01-agent-clients.md) · [Prompt compression](docs/en/compression/01-compression-pipeline.md) · [Architecture & internals](docs/en/architecture/00-high-level-index.md) · [Documentation index](docs/en/README.md) · [Contributor guide](CONTRIBUTING.md)

## Why this exists

Every serious AI lab now offers a free tier, a few million tokens a month, a few thousand requests a day. On its own each tier is a toy. Stacked together, they add up to roughly **7.4 billion tokens per month** of working inference capacity, across **474 model families / 635 provider endpoints** from small-and-fast to reasonably capable.

The problem is that stacking them by hand is painful: thirty-four different SDKs, thirty-four different rate limits, thirty-four places a request can fail. FreeLLMAPI collapses that into one OpenAI-compatible endpoint. Point any OpenAI client library at your local server, and it routes transparently across whichever providers you've added keys for.

And the free-tier landscape shifts weekly: providers launch models, retire them, and change quotas without notice. FreeLLMAPI tracks all of that for you. The router pulls a signed model catalog from [freellmapi.co](https://freellmapi.co) on its own, so your install keeps up without a `git pull`. See [Premium (live catalog)](#premium-live-catalog) for how fast it keeps up.

![The free tier, stacked — ~7.4B tokens of free inference per month across 34 providers](repo-assets/free-tier.png)

## Supported providers

<div align="center">
<table>
<tr>
<td align="center" width="150"><img src="repo-assets/providers/google.png" width="44" alt="Google"><br/><b>Google</b></td>
<td align="center" width="150"><picture><source media="(prefers-color-scheme: dark)" srcset="repo-assets/providers/groq-dark.png"><img src="repo-assets/providers/groq.png" width="44" alt="Groq"></picture><br/><b>Groq</b></td>
<td align="center" width="150"><img src="repo-assets/providers/cerebras.png" width="44" alt="Cerebras"><br/><b>Cerebras</b></td>
<td align="center" width="150"><picture><source media="(prefers-color-scheme: dark)" srcset="repo-assets/providers/opencode-dark.png"><img src="repo-assets/providers/opencode.png" width="44" alt="OpenCode Zen"></picture><br/><b>OpenCode Zen</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/providers/mistral.png" width="44" alt="Mistral"><br/><b>Mistral</b></td>
<td align="center"><img src="repo-assets/providers/openrouter.png" width="44" alt="OpenRouter"><br/><b>OpenRouter</b></td>
<td align="center"><img src="repo-assets/providers/cloudflare.png" width="44" alt="Cloudflare"><br/><b>Cloudflare</b></td>
<td align="center"><img src="repo-assets/providers/cohere.png" width="44" alt="Cohere"><br/><b>Cohere</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/providers/zhipu.png" width="44" alt="Z.ai (Zhipu)"><br/><b>Z.ai (Zhipu)</b></td>
<td align="center"><img src="repo-assets/providers/nvidia.png" width="44" alt="NVIDIA"><br/><b>NVIDIA</b></td>
<td align="center"><img src="repo-assets/providers/huggingface.png" width="44" alt="HuggingFace"><br/><b>HuggingFace</b></td>
</tr>
<tr>
<td align="center"><a href="https://modelscope.cn"><b>ModelScope</b><br/>Qwen3 · DeepSeek V4 · GLM-5 (needs Aliyun cn binding)</a></td>
</tr>
</table>

<i>… and 22 more free providers</i>

</div>

Plus a **custom** provider — point chat, embedding, image, or audio models at any OpenAI-compatible endpoint (llama.cpp, LM Studio, vLLM, a local Ollama, or a remote gateway) from the Keys page.

The full, always-current list lives at **[freellmapi.co/models](https://freellmapi.co/models.html)** with per-model rate limits, context windows, and free-token budgets.

## Compatible CLIs & coding agents

<div align="center">
<table>
<tr>
<td align="center" width="150"><img src="repo-assets/agents/claude-code.png" width="44" alt="Claude Code"><br/><b>Claude Code</b></td>
<td align="center" width="150"><img src="repo-assets/agents/codex.png" width="44" alt="Codex CLI"><br/><b>Codex CLI</b></td>
<td align="center" width="150"><img src="repo-assets/agents/gemini-cli.png" width="44" alt="Gemini CLI"><br/><b>Gemini CLI</b></td>
<td align="center" width="150"><img src="repo-assets/agents/aider.png" width="44" alt="Aider"><br/><b>Aider</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/agents/cline.png" width="44" alt="Cline"><br/><b>Cline</b></td>
<td align="center"><img src="repo-assets/agents/roo-code.png" width="44" alt="Roo Code"><br/><b>Roo Code</b></td>
<td align="center"><img src="repo-assets/agents/continue.png" width="44" alt="Continue"><br/><b>Continue</b></td>
<td align="center"><img src="repo-assets/agents/opencode.png" width="44" alt="OpenCode"><br/><b>OpenCode</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/agents/goose.png" width="44" alt="Goose"><br/><b>Goose</b></td>
<td align="center"><img src="repo-assets/agents/qwen-code.png" width="44" alt="Qwen Code"><br/><b>Qwen Code</b></td>
<td align="center"><img src="repo-assets/agents/kilo-code.png" width="44" alt="Kilo Code"><br/><b>Kilo Code</b></td>
<td align="center"><img src="repo-assets/agents/crush.png" width="44" alt="Crush"><br/><b>Crush</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/agents/cursor.png" width="44" alt="Cursor"><br/><b>Cursor</b></td>
<td align="center"><img src="repo-assets/agents/zed.png" width="44" alt="Zed"><br/><b>Zed</b></td>
<td align="center"><img src="repo-assets/agents/jetbrains.png" width="44" alt="JetBrains AI"><br/><b>JetBrains AI</b></td>
<td align="center"><img src="repo-assets/agents/deepseek-harness.png" width="44" alt="DeepSeek Harness"><br/><b>DeepSeek Harness</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/agents/atomcode.png" width="44" alt="AtomCode"><br/><b>AtomCode</b></td>
<td align="center"><img src="repo-assets/agents/openclaw.png" width="44" alt="OpenClaw"><br/><b>OpenClaw</b></td>
<td align="center"><img src="repo-assets/agents/hermes-agent.png" width="44" alt="Hermes Agent"><br/><b>Hermes Agent</b></td>
</tr>
</table>

<i>… plus any OpenAI-compatible client, Anthropic SDK, Gemini SDK, or Ollama-capable app</i>

</div>

Most of these configure themselves with one command — `npx freellmapi setup-claude`, `setup-codex`, `setup-aider`, `setup-dsh` (DeepSeek Harness), and eleven more generators that fetch your live catalog, back up existing config, and never clobber what's already there. Claude Code and Codex also get zero-persistence launchers (`freellmapi launch`, `freellmapi launch-codex`) that inject credentials into the child process only. Zed and JetBrains AI connect through the opt-in [Ollama emulation](docs/en/clients/01-agent-clients.md#ollama-clients); Gemini CLI speaks its native wire on `/v1beta`.

Per-tool recipes, the setup CLI reference, revocable URL tokens for headerless clients, and the MCP server all live in **[Clients & coding agents →](docs/en/clients/01-agent-clients.md)**

## How it compares

![Feature comparison against OpenRouter, LiteLLM, and Portkey](repo-assets/comparison.png)

Based on public documentation, July 2026 — corrections welcome.

## Features

![Feature overview](repo-assets/features.png)

- **Every OpenAI-style surface** — `/v1/chat/completions`, `/v1/responses` (what Codex CLI needs), `/v1/completions` (editor ghost-text autocomplete), `/v1/images/generations`, `/v1/videos/generations`, `/v1/audio/speech`, `/v1/audio/transcriptions`, `/v1/embeddings`, and `/v1/models` — streaming and non-streaming, from the official SDKs or any OpenAI-compatible client. [API reference →](docs/en/api/01-rest-api.md)
- **Anthropic Messages API** — `/v1/messages` speaks Anthropic's wire format over the same router, so **Claude Code** and the official Anthropic SDKs run against your free pool. [Details →](docs/en/api/01-rest-api.md#anthropic--claude-clients)
- **Native Gemini + Ollama surfaces** — Gemini CLI can use `/v1beta` (`generateContent`, streaming, token counting, models), while opt-in Ollama emulation serves NDJSON chat/generate, tags, metadata, and embeddings for Zed, JetBrains, and other local-model clients.
- **Fusion (multi-model synthesis)** — request the virtual `fusion` model and the router fans your prompt out to a panel of diverse free models in parallel, then a judge model synthesizes one answer from the drafts. [Details →](docs/en/api/01-rest-api.md#fusion-multi-model-synthesis)
- **Image, video & speech generation** — `/v1/images/generations`, `/v1/videos/generations`, and `/v1/audio/speech` route across the providers that serve media models; images and speech also accept custom OpenAI-compatible media endpoints. Video jobs are normalized across synchronous and queued providers and return a completed MP4.
- **Tool calling & structured outputs** — OpenAI-style `tools` round-trip across providers (plain-text tool calls are rescued into real `tool_calls`), plus `response_format`, `seed`, `logprobs`, penalties, and the rest of the sampling params passed through per provider.
- **Smart routing, six strategies** — live per-model speed/capability/reliability scores rank your chain; automatic fallover retries the next model on 429/5xx with cooldowns and key rotation. [Routing in detail →](docs/en/architecture/00-high-level-index.md#how-it-works)
- **Unified models & profiles** — the same model on several providers collapses into one entry with strict in-group failover; named fallback-chain profiles (a coding chain, a vision chain) switch from the dashboard or per request via `auto:<profile>`.
- **Per-key rate tracking** — RPM/RPD/TPM/TPD counters per `(platform, model, key)` that learn providers' reported ceilings, so routing always stays under every cap.
- **Self-updating model catalog** — the router syncs a signed catalog from freellmapi.co twice a day: new models, quota changes, and provider quirk fixes land automatically. Free installs track the monthly snapshot, which each model joins 30 days after it lands in the live feed; premium routers get it same-day. [Premium →](#premium-live-catalog)
- **Sticky sessions & context handoff** — conversations stay on one model for 30 minutes; an optional compact handoff note keeps the thread coherent when a mid-chat switch does happen. [Details →](docs/en/clients/01-agent-clients.md#context-handoff)
- **Prompt compression (opt-in)** — a shared, fail-open request pipeline can deduplicate prompts, filter tool output, compact repeated JSON, and trim stale context before cache lookup and routing. [Details →](docs/en/compression/01-compression-pipeline.md)
- **Encrypted keys, one token out** — provider keys are AES-256-GCM encrypted in SQLite and decrypted in-memory per request; your apps only ever see a single unified `freellmapi-…` bearer token.
- **Admin dashboard & analytics** — React UI to manage keys, reorder the chain, run a playground, and read p50/p95/TTFT analytics over 24h–90d windows; login-gated, dark/light themes, [60 languages](#languages).
- **MCP server & interactive docs** — agents can introspect usable models, provider health, and routing strategy over `/mcp`; a dependency-free OpenAPI viewer lives at `/v1/docs`. [Coding agents →](docs/en/clients/01-agent-clients.md)
- **Ops niceties** — opt-in response cache, encrypted DB backups, periodic key health checks, bulk key import/export, declarative startup config. [Install & deploy →](docs/en/install/01-install.md)
- **Runs anywhere Node 20+ runs** — Windows, macOS, Linux servers, or a small ARM SBC (Raspberry Pi included). ~40 MB RSS at idle behind PM2 / systemd / whatever supervisor you prefer.
- **ForgePilot agent kernel, wired to real tools** — a deterministic decision core for agent-driven delivery: compute modes (free/paid/local), tool-call and egress policy, a run state machine, task-DAG wave planning, secret redaction, evidence auditing, JSON Schema output contracts and a versioned prompt library. On top of it, 23 audited tools: filesystem, code navigation with reference classification, atomic cross-file rename, git, pull-request creation under a separate credential, egress-controlled web reading, SQL over CSV and XLSX, and a test runner inside a real namespace sandbox. Served at `/api/agent`, with a dashboard at `/forgepilot`. [Details →](#the-agent-forgepilot-kernel--a-wired-toolchain)

The scope is deliberately narrow — see [what's not supported yet](docs/en/architecture/00-high-level-index.md#not-yet-supported).

## The agent: ForgePilot kernel + a wired toolchain

This fork merges the **ForgePilot deterministic agent kernel** into the
gateway, and then does the part a merge does not do on its own: wires it to
things that touch the real world. The gateway gives the agent models; the
kernel gives it judgement; the tools give it hands.

One rule runs through all of it: **the model proposes, the code decides.** Run
state transitions, tool-call permission, provider choice, secret scrubbing,
task ordering and whether a "task complete" claim is believed are decided by
tested code, not by a language model.

```bash
npm run agent:test        # kernel tests
npm test -w @freellmapi/server   # 4,173 server tests
npm run agent:typecheck   # strict tsc, zero @ts-ignore
```

### What the agent can actually do

23 tools, each one registered, policy-classified and audited. Every one is
reachable over HTTP at `POST /api/agent/tools/invoke` and every one has a test
that fails if its guard is removed. The count and the roster below are checked
against the live registry by a test, because this paragraph said "Nineteen"
while three other lines said 21 and nothing noticed.

| Area | Tools | Notes |
|---|---|---|
| Filesystem | `fs.read_file` `fs.list` `fs.search` `fs.file.write` | Confined to a workspace root the caller cannot choose; `realpath` checked, credential-shaped files refused. Writes go through the atomic path, so a failed write leaves the old file rather than a truncated one |
| Code navigation | `code.symbol.search` `code.outline.read` `code.file.outline.read` `code.references.search` | Declarations *and* uses. Each reference is classified as code / string / comment / import / declaration |
| Git | `git.status.read` `git.diff.read` `git.branch.create` `git.patch.file.write` `git.commit.create` | Protected branches cannot be evaded by omitting the ref — writes resolve their own target |
| Forge | `git.pull_request.create` | Under a separate, revocable forge credential that is never written to `.git/config` |
| Execution | `sandbox.test` | Runs inside a `user`/`mount`/`net`/`pid` namespace: read-only root, writable workspace only, no network |
| Web | `web.page.read` `web.page.search` | Egress-controlled: cloud metadata IPs, private ranges and decimal-encoded addresses refused, re-checked on every redirect hop |
| Refactoring | `code.rename.preview.read` `code.rename.apply` | Preview is a read; apply re-derives the preview, refuses a stale digest, and writes every file or none |
| Data | `data.csv.query` `data.csv.schema.read` `data.xlsx.query` `data.xlsx.schema.read` | SQL over a spreadsheet, in a sandbox that cannot reach the gateway's own database. A sheet's columns come from each cell's `r="C2"` reference, because Excel omits empty cells and reading them in order files values under the wrong heading |

### Six gates every tool call passes

```
registration → JSON-Schema validation → policy engine → human approval
             → timeout ceiling → audit row in agent_tool_calls
```

A refused call returns `outcome: 'denied'` with a reason. It does not throw,
and it is still recorded — a denied attempt is exactly the thing you want in
an audit trail.

**Tool names are part of the security interface.** The policy engine
classifies by dotted suffix: `*.read`, `*.search`, `*.list` are the read
vocabulary. A tool named `code.usages.find` instead of `code.references.search`
is silently classified `high` / `external_write` and dropped from every
autonomous phase — registered, but never offered to a model. Every tool name
here was verified against a live `evaluateToolCall` before being committed.

### The execution sandbox is real, and its limits are stated

`sandbox.test` spawns through `unshare` with user, mount, network and PID
namespaces: `/` is remounted read-only, the workspace is bind-mounted back
read-write, `/proc` is remounted fresh so the process cannot see the host's
process table, and there is no network namespace to reach out from.

Measured before and after, through the tool itself:

| probe | before | after |
|---|---|---|
| write `/tmp/agent-escaped.txt` | reached (file confirmed on disk) | blocked |
| write the gateway's source tree | reached | blocked |
| read the host process table | reached (100 pids) | blocked (3 pids) |
| resolve DNS | reached | blocked |
| write inside the workspace | reached | still works |

Not claimed: read access is *reduced by masking, not eliminated* — `pivot_root`
is unavailable in this environment — and there is no CPU or memory ceiling
without cgroup delegation. Both are reported to the caller by
`describeIsolation()` rather than left for you to discover.

### Compute modes

One switch configures the rest:

| | Free | Paid | Local |
|---|---|---|---|
| Paid cloud | ❌ | ✅ | ❌ |
| Cost per run | 0 | up to your ceiling | 0 |
| Data leaves the machine | with consent | with consent | **never** |
| Repair attempts / parallel tasks | 2 / 2 | 3 / 4 | 3 / 1 |
| Quality gates | 6 | 9 | 8 |

### Honest status

The kernel ships 225 modules in `agent/src/core`. **16 are wired to a
production caller; 209 are not.** That is not a to-do list that shrinks by
itself, and the reason is worth knowing before you plan around it: of 209
unwired modules, **200 take safety facts as boolean inputs** — they validate a
claim the caller makes rather than establishing it. Demonstrated live on one of
them: the same plugin allows an execution when told `sandboxed: true,
networkAllowed: false`, and denies it when told the truth. Same code, same
inputs, different caller honesty.

The 16 modules that *are* wired are precisely the ones that decide something
without being told it — the policy engine, the state machine, the router, the
redactor. Wiring the rest means building the measurement layer first, which is
what `agent-attestation.ts` started: a claim carries *how it was established*
(`measured` / `configured` / `derived`), and "never checked" is a different
answer from "checked and false".

Roughly **175 of the 500 catalogued capabilities** are implemented and
reachable. The rest are sequenced into phases with costs attached.

**[How to use it →](agent/USAGE.md)** · [What was merged →](agent/INTEGRATION.md) ·
[Full guide →](docs/en/agent/01-agent-kernel.md) ·
[Capability audit →](docs/en/agent/02-capability-audit.md) ·
[Roadmap →](docs/en/agent/04-remaining-roadmap.md)

## Quick start

**One-liner** (Docker required — sets up `~/freellmapi`, generates an encryption key, pulls the image, and starts the container):

```bash
curl -fsSL https://freellmapi.co/install.sh | bash
```

Prefer to read before you pipe to bash? [The script is here](https://freellmapi.co/install.sh). Re-running it is safe: your `.env` (and encryption key) is preserved and the container updates to `:latest`.

Open http://localhost:3001, add your provider keys on the **Keys** page, reorder the **Fallback Chain** to taste, and grab your unified API key from the **Keys** page header. That unified key is what you point your OpenAI SDK at.

On Windows, the easiest path is the desktop **[`.exe` installer from Releases](https://github.com/tashfeenahmed/freellmapi/releases/latest)** (below). On Android, see the experimental [Termux guide](docs/en/install/02-android-termux.md).

Everything else — Docker Compose, local development, declarative startup config, production builds, LAN access, and backups — is in **[docs/en/install/01-install.md](docs/en/install/01-install.md)**.

## Running the agent

The gateway and the agent are the same process. Start the gateway and the
agent API is at `/api/agent`, with a dashboard at `/forgepilot`.

### From source

```bash
git clone https://github.com/bestboygod021/free-agent007.git
cd free-agent007
npm install
npm run dev              # gateway on :3001, dashboard on :5173
```

First run only, create the owner account:

```bash
curl -X POST localhost:3001/api/auth/setup \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"a-long-password"}'
```

That returns a bearer token. Every `/api/agent` route needs it — an
unauthenticated request gets `401`, including health.

### Configuration

All of it is environment variables; nothing security-relevant is taken from
the request body. That is deliberate — an earlier version accepted `workerId`
and tool scopes from the body, and both were closed as vulnerabilities.

| Variable | Default | What it does |
|---|---|---|
| `AGENT_WORKSPACE_ROOT` | `./data/agent-workspace` | The only directory tools may touch. Defaults to a dedicated folder, **not** the gateway's own source, so a misconfigured deployment cannot hand the agent its own code |
| `AGENT_GRANTED_SCOPES` | *(empty)* | Scopes the install grants, comma-separated. Empty means the agent has none. Intersected with the request's scopes, never unioned |
| `AGENT_PROTECTED_BRANCHES` | `main` | Branches no tool may write, enforced on the ref the tool resolves for itself |
| `AGENT_WORKING_BRANCH` | `agent/work` | Where the agent is allowed to commit |
| `AGENT_AUTONOMY` | `supervised` | `supervised` requires human approval for anything with an external side effect |
| `AGENT_WORKER_TOKENS` | *(empty)* | Credentials for job-queue workers. Without these the queue fails closed with `503` rather than trusting whoever calls it |
| `AGENT_FORGE_TOKEN` | *(unset)* | Forge credential for opening pull requests. Read fresh on every call, so rotating it needs no restart |
| `AGENT_FORGE_REPO` | *(unset)* | `owner/name`. The repository is configuration, not a tool argument — the model cannot aim a pull request somewhere else |
| `AGENT_FORGE_HOST` | `api.github.com` | Bare hostname only. A URL is refused, so a credential cannot be sent to a collector |

Leave `AGENT_FORGE_TOKEN` unset and `git.pull_request.create` reports itself
as not configured instead of failing halfway through a push.

### Calling a tool

```bash
TOKEN=...   # from /api/auth/setup or /api/auth/login

curl -s localhost:3001/api/agent/tools \
  -H "Authorization: Bearer $TOKEN"        # list the 23 tools

curl -s -X POST localhost:3001/api/agent/tools/invoke \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"tool":"code.references.search","args":{"name":"resolveScope"}}'
```

A denied call is a normal response, not an error:

```json
{
  "outcome": "denied",
  "reason": "connector is missing required scopes: pull_request:write",
  "riskLevel": "medium",
  "sideEffect": "external_write"
}
```

### Verifying the sandbox on your own machine

The sandbox depends on unprivileged user namespaces, which some hosts disable.
It probes rather than assumes, and tells you what it found:

```bash
curl -s -X POST localhost:3001/api/agent/tools/invoke \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"tool":"sandbox.test","args":{"command":"node -e console.log(1)"}}' \
  | jq '{isolated, isolation}'
```

```json
{
  "isolated": true,
  "isolation": "Isolated in user, mount, net, pid namespaces. Filesystem is read-only except the workspace; network is unavailable. ..."
}
```

If your kernel refuses namespaces you get `isolated: false` with the reason.
The flag tracks reality — it is never hard-coded, and a test fails if it is.

### Tests

```bash
npm test                          # everything
npm test -w @freellmapi/server    # 4,173 server tests, ~4 min
npm run agent:test                # kernel tests
npm run lint && npm run build
```

## Desktop app

A native menu-bar app lives in [`desktop/`](./desktop): the entire router + dashboard running locally from your tray, with a glass popover showing live request stats.

![FreeLLMAPI desktop app](repo-assets/desktop.png)

**[Download from Releases](https://github.com/tashfeenahmed/freellmapi/releases/latest)** — the macOS `.dmg` and the Windows `.exe` installer are attached to every release. No account or password to set up: the only credential you need is the unified API key from the tray popover. Build-from-source steps and where your data lives: [docs/en/install/01-install.md#desktop-app](docs/en/install/01-install.md#desktop-app).

For macOS 12 Monterey or later, choose **arm64 (Apple Silicon)** or **x64 (Intel)**. Both Mac builds also include a ZIP download.

## Works with OpenAI-compatible clients

Anything that can target an OpenAI-compatible base URL works: set it to `http://localhost:3001/v1` with the unified key from the dashboard. **Claude Code**, **Codex CLI**, **Cline / Roo Code**, **Continue** (including inline autocomplete), **Aider**, **opencode**, and **Cursor** each have a short recipe in **[docs/en/clients/01-agent-clients.md](docs/en/clients/01-agent-clients.md)** — and the router doubles as an MCP server your agents can introspect mid-session.

The fastest setup is generated from the models available on your live server:

```bash
npx freellmapi setup-claude --url http://localhost:3001 --api-key <unified-key>
```

Every generator supports `--dry-run`, creates a timestamped backup before changing an existing file, and merges into the user's configuration. Launchers keep credentials out of config files entirely: `npx freellmapi launch` for Claude Code and `npx freellmapi launch-codex` for Codex.

| Agent | Automated setup | Base URL |
| --- | --- | --- |
| Claude Code | `setup-claude` | root |
| Codex CLI | `setup-codex` | `/v1` |
| Cline | `setup-cline` | `/v1` |
| Continue | `setup-continue` | `/v1` |
| Aider | `setup-aider` | `/v1` |
| OpenCode | `setup-opencode` | `/v1` |
| Goose | `setup-goose` | `/v1` |
| Qwen Code | `setup-qwen` | `/v1` (or native `/v1beta`) |
| Roo / Kilo / Crush | `setup-roo` / `setup-kilo` / `setup-crush` | `/v1` |
| DeepSeek Harness | `setup-dsh` | `/v1` |
| MiMo Code | `setup-mimo` | `/v1` |
| AtomCode | `setup-atomcode` | `/v1` |
| OpenClaw | `setup-openclaw` | `/v1` |
| Hermes Agent | `setup-hermes` | `/v1` |
| Cursor | `setup-cursor` guide | public `/v1` URL |

FreeLLMAPI is local-first and single-user by design. Your provider keys stay in your SQLite database, encrypted at rest, and requests go from your machine to the upstream providers you enabled.

## Languages

The dashboard ships in **60 languages** (the desktop tray menu in 6). The UI
auto-detects your browser/system language on first load and you can switch any
time from **⋯ → Settings**; the choice is remembered. Right-to-left languages
(العربية, עברית, فارسی, اردو) flip the whole layout automatically, and only the
active language's dictionary is loaded — the rest never touch your bandwidth.

<img src="https://flagcdn.com/24x18/us.png" srcset="https://flagcdn.com/48x36/us.png 2x" width="24" height="18" alt="United States" title="United States"> <img src="https://flagcdn.com/24x18/cn.png" srcset="https://flagcdn.com/48x36/cn.png 2x" width="24" height="18" alt="China" title="China"> <img src="https://flagcdn.com/24x18/es.png" srcset="https://flagcdn.com/48x36/es.png 2x" width="24" height="18" alt="Spain" title="Spain"> <img src="https://flagcdn.com/24x18/fr.png" srcset="https://flagcdn.com/48x36/fr.png 2x" width="24" height="18" alt="France" title="France"> <img src="https://flagcdn.com/24x18/br.png" srcset="https://flagcdn.com/48x36/br.png 2x" width="24" height="18" alt="Brazil" title="Brazil"> <img src="https://flagcdn.com/24x18/it.png" srcset="https://flagcdn.com/48x36/it.png 2x" width="24" height="18" alt="Italy" title="Italy"> <img src="https://flagcdn.com/24x18/in.png" srcset="https://flagcdn.com/48x36/in.png 2x" width="24" height="18" alt="India" title="India"> <img src="https://flagcdn.com/24x18/sa.png" srcset="https://flagcdn.com/48x36/sa.png 2x" width="24" height="18" alt="Saudi Arabia" title="Saudi Arabia"> <img src="https://flagcdn.com/24x18/bd.png" srcset="https://flagcdn.com/48x36/bd.png 2x" width="24" height="18" alt="Bangladesh" title="Bangladesh"> <img src="https://flagcdn.com/24x18/ru.png" srcset="https://flagcdn.com/48x36/ru.png 2x" width="24" height="18" alt="Russia" title="Russia"> <img src="https://flagcdn.com/24x18/pk.png" srcset="https://flagcdn.com/48x36/pk.png 2x" width="24" height="18" alt="Pakistan" title="Pakistan"> <img src="https://flagcdn.com/24x18/id.png" srcset="https://flagcdn.com/48x36/id.png 2x" width="24" height="18" alt="Indonesia" title="Indonesia"> <img src="https://flagcdn.com/24x18/de.png" srcset="https://flagcdn.com/48x36/de.png 2x" width="24" height="18" alt="Germany" title="Germany"> <img src="https://flagcdn.com/24x18/jp.png" srcset="https://flagcdn.com/48x36/jp.png 2x" width="24" height="18" alt="Japan" title="Japan"> <img src="https://flagcdn.com/24x18/ke.png" srcset="https://flagcdn.com/48x36/ke.png 2x" width="24" height="18" alt="Kenya" title="Kenya"> <img src="https://flagcdn.com/24x18/tr.png" srcset="https://flagcdn.com/48x36/tr.png 2x" width="24" height="18" alt="Türkiye" title="Türkiye"> <img src="https://flagcdn.com/24x18/vn.png" srcset="https://flagcdn.com/48x36/vn.png 2x" width="24" height="18" alt="Vietnam" title="Vietnam"> <img src="https://flagcdn.com/24x18/kr.png" srcset="https://flagcdn.com/48x36/kr.png 2x" width="24" height="18" alt="South Korea" title="South Korea"> <img src="https://flagcdn.com/24x18/ir.png" srcset="https://flagcdn.com/48x36/ir.png 2x" width="24" height="18" alt="Iran" title="Iran"> <img src="https://flagcdn.com/24x18/th.png" srcset="https://flagcdn.com/48x36/th.png 2x" width="24" height="18" alt="Thailand" title="Thailand"> <img src="https://flagcdn.com/24x18/pl.png" srcset="https://flagcdn.com/48x36/pl.png 2x" width="24" height="18" alt="Poland" title="Poland"> <img src="https://flagcdn.com/24x18/ua.png" srcset="https://flagcdn.com/48x36/ua.png 2x" width="24" height="18" alt="Ukraine" title="Ukraine"> <img src="https://flagcdn.com/24x18/mm.png" srcset="https://flagcdn.com/48x36/mm.png 2x" width="24" height="18" alt="Myanmar" title="Myanmar"> <img src="https://flagcdn.com/24x18/ro.png" srcset="https://flagcdn.com/48x36/ro.png 2x" width="24" height="18" alt="Romania" title="Romania"> <img src="https://flagcdn.com/24x18/nl.png" srcset="https://flagcdn.com/48x36/nl.png 2x" width="24" height="18" alt="Netherlands" title="Netherlands"> <img src="https://flagcdn.com/24x18/my.png" srcset="https://flagcdn.com/48x36/my.png 2x" width="24" height="18" alt="Malaysia" title="Malaysia"> <img src="https://flagcdn.com/24x18/ph.png" srcset="https://flagcdn.com/48x36/ph.png 2x" width="24" height="18" alt="Philippines" title="Philippines"> <img src="https://flagcdn.com/24x18/ng.png" srcset="https://flagcdn.com/48x36/ng.png 2x" width="24" height="18" alt="Nigeria" title="Nigeria"> <img src="https://flagcdn.com/24x18/et.png" srcset="https://flagcdn.com/48x36/et.png 2x" width="24" height="18" alt="Ethiopia" title="Ethiopia"> <img src="https://flagcdn.com/24x18/uz.png" srcset="https://flagcdn.com/48x36/uz.png 2x" width="24" height="18" alt="Uzbekistan" title="Uzbekistan"> <img src="https://flagcdn.com/24x18/az.png" srcset="https://flagcdn.com/48x36/az.png 2x" width="24" height="18" alt="Azerbaijan" title="Azerbaijan"> <img src="https://flagcdn.com/24x18/lk.png" srcset="https://flagcdn.com/48x36/lk.png 2x" width="24" height="18" alt="Sri Lanka" title="Sri Lanka"> <img src="https://flagcdn.com/24x18/np.png" srcset="https://flagcdn.com/48x36/np.png 2x" width="24" height="18" alt="Nepal" title="Nepal"> <img src="https://flagcdn.com/24x18/kh.png" srcset="https://flagcdn.com/48x36/kh.png 2x" width="24" height="18" alt="Cambodia" title="Cambodia"> <img src="https://flagcdn.com/24x18/gr.png" srcset="https://flagcdn.com/48x36/gr.png 2x" width="24" height="18" alt="Greece" title="Greece"> <img src="https://flagcdn.com/24x18/cz.png" srcset="https://flagcdn.com/48x36/cz.png 2x" width="24" height="18" alt="Czechia" title="Czechia"> <img src="https://flagcdn.com/24x18/hu.png" srcset="https://flagcdn.com/48x36/hu.png 2x" width="24" height="18" alt="Hungary" title="Hungary"> <img src="https://flagcdn.com/24x18/se.png" srcset="https://flagcdn.com/48x36/se.png 2x" width="24" height="18" alt="Sweden" title="Sweden"> <img src="https://flagcdn.com/24x18/il.png" srcset="https://flagcdn.com/48x36/il.png 2x" width="24" height="18" alt="Israel" title="Israel"> <img src="https://flagcdn.com/24x18/dk.png" srcset="https://flagcdn.com/48x36/dk.png 2x" width="24" height="18" alt="Denmark" title="Denmark"> <img src="https://flagcdn.com/24x18/fi.png" srcset="https://flagcdn.com/48x36/fi.png 2x" width="24" height="18" alt="Finland" title="Finland"> <img src="https://flagcdn.com/24x18/no.png" srcset="https://flagcdn.com/48x36/no.png 2x" width="24" height="18" alt="Norway" title="Norway"> <img src="https://flagcdn.com/24x18/sk.png" srcset="https://flagcdn.com/48x36/sk.png 2x" width="24" height="18" alt="Slovakia" title="Slovakia"> <img src="https://flagcdn.com/24x18/bg.png" srcset="https://flagcdn.com/48x36/bg.png 2x" width="24" height="18" alt="Bulgaria" title="Bulgaria"> <img src="https://flagcdn.com/24x18/hr.png" srcset="https://flagcdn.com/48x36/hr.png 2x" width="24" height="18" alt="Croatia" title="Croatia"> <img src="https://flagcdn.com/24x18/rs.png" srcset="https://flagcdn.com/48x36/rs.png 2x" width="24" height="18" alt="Serbia" title="Serbia"> <img src="https://flagcdn.com/24x18/lt.png" srcset="https://flagcdn.com/48x36/lt.png 2x" width="24" height="18" alt="Lithuania" title="Lithuania"> <img src="https://flagcdn.com/24x18/tw.png" srcset="https://flagcdn.com/48x36/tw.png 2x" width="24" height="18" alt="Taiwan" title="Taiwan"> <img src="https://flagcdn.com/24x18/pt.png" srcset="https://flagcdn.com/48x36/pt.png 2x" width="24" height="18" alt="Portugal" title="Portugal"> <img src="https://flagcdn.com/24x18/ge.png" srcset="https://flagcdn.com/48x36/ge.png 2x" width="24" height="18" alt="Georgia" title="Georgia">

The full list of locales lives in
[`client/src/i18n/locale-config.ts`](./client/src/i18n/locale-config.ts).

The original six locales are human-reviewed; the newer ones are machine-
translated and improve as native speakers send corrections — a one-string PR is
a great first contribution.

Translations live in [`client/src/i18n/locales/`](./client/src/i18n/locales) as
flat JSON files. To fix a string, edit the value in the locale's JSON file. To
add a language, copy `en.json`, translate the values, and register the locale in
`client/src/i18n/locale-config.ts` (and `desktop/src/i18n.ts` for the tray
strings); `npm test` checks every locale for key/placeholder parity — PRs
welcome.

## Premium (live catalog)

The router keeps its model catalog fresh on its own: it pulls a signed catalog
from [freellmapi.co](https://freellmapi.co) twice a day and applies new models,
quota changes, and provider quirk fixes to your local DB. Your own
enable/disable choices and custom providers are never touched, and every
download is verified against a pinned Ed25519 key before it is applied.

The catalog currently tracks **34 providers**, **474 model families**, **635
free provider/model endpoints** (584 chat, 41 embeddings, 7 transcription, 3
video), and roughly **7.4 billion tokens per month** of listed free-tier
capacity. Browse the full set at
**[freellmapi.co/models](https://freellmapi.co/models.html)**.

Free installs pull the same signed catalog, but from the monthly snapshot: a
model joins it 30 days after it lands in the live feed, so the free build
currently sits about 303 models behind. Nothing expires and nothing is
crippled — it just arrives later.

Premium keeps that signed catalog live on every router you run. When a provider
launches a strong free model, quietly tightens a quota, or breaks a wire format,
live-feed routers receive the update the same day we ship it.

**[Go live at freellmapi.co →](https://freellmapi.co/?utm_source=github&utm_medium=readme&utm_campaign=premium&utm_content=readme_bottom#pricing)**

- $19/year or $49 once, lifetime. Stripe checkout; cancel anytime, self-serve.
- One `fla_` key covers every router you run: desktop, homelab, Raspberry Pi.
- Activate in the dashboard under **Premium**; cancel or manage billing
  self-serve at [freellmapi.co/manage](https://freellmapi.co/manage).
- The router itself stays MIT-licensed and fully free, forever. Premium is only
  the live feed, and it's what funds the daily model testing and catalog
  maintenance that keeps the catalog working.

The catalog server never sees your prompts, completions, or provider keys — the
router stays fully self-hosted either way.

## Using the API

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3001/v1",
    api_key="freellmapi-your-unified-key",
)

resp = client.chat.completions.create(
    model="auto",  # let the router pick; or "auto:fast", "auto:smart", a profile, or a model id
    messages=[{"role": "user", "content": "Summarise the fall of Rome in one sentence."}],
)
print(resp.choices[0].message.content)
print("Routed via:", resp.headers.get("x-routed-via"))
```

Streaming, the `auto:*` routing strategies, tool calling, vision input, Gemini Google Search grounding, embeddings, and the Anthropic Messages surface — with curl and Python examples for each — are all in **[docs/en/api/01-rest-api.md](docs/en/api/01-rest-api.md)**. Every response carries an `X-Routed-Via: <platform>/<model>` header so you can see which provider actually served it.

## Screenshots

### Models

Pick a routing strategy and watch the monthly token budget fill across the whole provider fleet. Every model shows live reliability, speed, and intelligence scores — the order below is how requests route right now.

![Models page](repo-assets/models.png)

### Keys

Manage provider credentials and grab the unified API key your apps connect with. Each key shows a status dot and when it was last health-checked.

![Keys page](repo-assets/keys.png)

### Playground

Send a chat completion through the router and see which provider served it, with the model ID and latency printed right on the message. Attach files by button, drag-and-drop, or paste: images (PNG/JPEG/WebP/GIF) are downscaled in the browser and sent as image content parts to a vision-capable model, and text files (TXT/MD/CSV/JSON/LOG) are inlined into the prompt as fenced blocks.

![Playground page](repo-assets/playground.png)

### Analytics

Request volume, success rate, tokens in and out, average latency, and per-provider breakdowns over 24h / 7d / 30d / 90d windows.

![Analytics page](repo-assets/analytics.png)

## How it works

![One request in, the best free model out — the fallback chain with live scores, cooldowns, and quota tracking](repo-assets/router-flow.png)

One request in, the best free model out: the router picks the highest-priority model with a healthy key that's under all its rate limits, decrypts the key in memory, and calls the provider — on a 429/5xx it cools that key down and retries the next model in your chain. The component walkthrough, routing internals, and operational details live in **[docs/en/architecture/00-high-level-index.md](docs/en/architecture/00-high-level-index.md)**.

## FAQ

**Do I need a password?** Not for the desktop app — the dashboard signs itself in with a hidden local account, so there is nothing to set up and nothing to forget. Open it from the tray icon → **Open Dashboard**. Server installs (Docker, one-liner, `npm run dev`) do have an email + password account.

**I forgot the password on a server install.** Click **Forgot password?** on the login page. There is no email to send a link to, so the one-time code is printed to the server log — read it with `docker compose logs -f freellmapi` (or in the terminal running the server, or in the desktop log file), then enter it on the reset form. The code lasts 15 minutes.

**Where are the logs?** In the container log for Docker, in the terminal for a source run, and in `<data dir>/logs/freeapi.log` for the desktop app — reachable from the tray menu's **Open Logs Folder**.

**How do I uninstall?** Remove the app (Trash on macOS, *Settings → Apps* on Windows, `docker compose down -v` for Docker), then delete the data directory: `%APPDATA%\FreeLLMAPI\`, `~/Library/Application Support/FreeLLMAPI/`, or `~/.config/FreeLLMAPI/`. Uninstalling never touches that folder on its own.

Longer answers, per install method: **[docs/en/install/01-install.md#faq-passwords-logs-uninstall](docs/en/install/01-install.md#faq-passwords-logs-uninstall)**.

## Limitations

**The gateway.** Stacking free tiers has real trade-offs: no frontier models,
variable latency, no SLA — and the effective intelligence of the endpoint dips
late in the day as top models hit their daily caps, then resets at UTC
midnight. Read the honest list in
**[docs/en/architecture/00-high-level-index.md#limitations](docs/en/architecture/00-high-level-index.md#limitations)**
before building anything real on this.

**The agent.** Stated plainly, because a capability list that only lists
successes is not useful:

- **209 of 225 kernel modules are not wired to anything.** They are tested,
  correct, pure logic with no production caller. Of those 209, **200 take
  safety facts as boolean parameters** — they check a claim rather than
  establish one, so wiring them naively would produce guards that a dishonest
  caller talks its way past. Fixing that is a measurement problem, not a
  plumbing problem.
- **Code navigation is lexical, not type-aware.** `code.references.search`
  cannot tell two identically-named symbols apart. It says so: results carry
  `confidence: approximate` for short or common names rather than a confident
  wrong number.
- **The sandbox reduces read access; it does not eliminate it.** `pivot_root`
  is unavailable, so host paths are masked rather than replaced by a fresh
  root, and there is no CPU or memory ceiling without cgroup delegation. The
  wall-clock timeout is the only resource bound. All of this is reported by
  `describeIsolation()` at runtime.
- **The atomic write is atomic per file, not per commit.** `code.rename.apply`
  and `fs.file.write` both write through a temp-and-`rename` swap and roll
  back from in-memory originals if a later rename fails, so an interrupted
  refactor is restored and a failed single write leaves the previous file
  intact instead of a truncated one. Both accept an optional `expectedHash`
  and refuse if the file changed since it was read. It is still a loop of
  atomic operations, not one atomic operation: a power loss mid-loop is not
  covered, and a rollback that itself fails is reported with the exact list of
  unrestored files rather than swallowed. The design and its limits are in
  [docs/en/agent/05-atomic-refactor-design.md](docs/en/agent/05-atomic-refactor-design.md).
- **Retrieval is hybrid, but not reranked.** `documents/search` fuses BM25
  (SQLite FTS5) with the cosine scan by Reciprocal Rank Fusion, because pure
  vector search could not find an identifier that was literally in the
  corpus — `ERR_QUOTA_7734` returned nothing at all. There is no reranking
  model and camelCase is not split (`resolveScope` is findable, `scope` alone
  does not find it). The vector half remains a brute-force scan: measured at
  149 ms per query over 10,000 chunks, which is less than the embedding call
  it waits on, so an ANN index was deliberately not built.
- **A spreadsheet is queryable, not just searchable.** `data.xlsx.query` loads
  one sheet into the same private in-memory SQLite database `data.csv.query`
  uses, so counting and summing happen in SQLite rather than in a model.
  Columns come from each cell's `r="C2"` reference: Excel writes no element at
  all for an empty cell, so reading cells in document order files every value
  after a gap under the wrong heading — invisible in extracted text, and a
  wrong answer in a table. Sheets are selected by name or tab index and never
  merged. The sheet's part is found through `r:id` and the relationships file,
  not by guessing `sheet{n+1}.xml`, which reads nothing for the second tab of
  a workbook that has had a middle sheet deleted while still reporting its
  name.
- **A date is a number until `styles.xml` says otherwise.** `2026-03-14` is
  stored as `46095`, and nothing in the cell marks it as a date — the number
  format reached through the cell's style index does. Dates come out as ISO
  text, so `WHERE opened >= '2025-01-01'` and `strftime('%Y', opened)` work.
  Both calendars are handled (a Mac-saved workbook counts from 1904 and
  reading it as 1900 is four years early), and so is Excel's belief that 1900
  was a leap year: serial 60 is its 29 February 1900, a day that never
  happened, so serials either side of it need different epochs. Serial 60 is
  reported as `1900-02-29` rather than clamped onto the 28th, because merging
  two distinct cells into one value silently is worse than a date that is
  visibly impossible. Merged cells repeat their label across the block, so a
  `GROUP BY` agrees with what a human sees.
- **DOCX and XLSX ingest, PDF does not.** `POST /api/agent/documents` accepts
  `contentBase64` and extracts text from Word and Excel files with no new
  dependency — they are ZIP archives of XML and Node ships `zlib`. The format
  is detected from the bytes, not the filename. Runs are joined with no
  separator, because Word splits `resolveScope` across two runs and a space
  would store it as `resolve Scope` and put it out of reach of search; table
  rows come out tab-separated, and `<w:instrText>` field instructions are
  dropped so a HYPERLINK target no reader ever saw does not enter the index.
  PDF is **not** supported: it needs font and content-stream decoding that
  `zlib` alone cannot do, so it was left out rather than half-built.
  Archives are bounded at 32 MB in, 16 MB per entry and 48 MB total, checked
  both against the declared size and against what was actually produced.
- **Roughly 188 of 500 catalogued capabilities are implemented.** No browser
  automation, no PDF parsing, no OpenTelemetry — those dependencies are
  absent from the lockfile, which is checked rather than assumed.

## Contributing

Contributors very welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for the dev loop, PR expectations, and the policy on AI/LLM-assisted contributions (short version: welcome, same quality bar as any other PR). Good first PRs:

- **Add a provider** — copy `server/src/providers/openai-compat.ts` as a template, wire it into `server/src/providers/index.ts`, seed its models in `server/src/db/index.ts`, add a test in `server/src/__tests__/providers/`.
- **Add an endpoint** — moderations and other OpenAI-compatible surfaces. The provider base class can grow new methods; adapters declare which they support.
- **Improve the router** — cost-aware routing (cheapest-healthy-fastest tradeoffs), better latency-weighted priority, regional pinning.
- **Dashboard polish** — charts on the Analytics page, key rotation UX, batch import of keys from `.env`.
- **Docs** — more examples, client library snippets for Go/Rust/etc., a deployment recipe for Docker or Fly.

`npm install && npm run dev` gets you the server on :3001 and the dashboard on :5173, both with HMR. For a repeatable setup, use `./scripts/dev-bootstrap.sh` on Bash or `.\scripts\dev-bootstrap.ps1` on PowerShell; each preserves an existing `.env`. PRs should include a test, keep the existing suite green (`npm test`), and match the `.editorconfig` / tsconfig defaults already in the repo. Database migration workflow and the full contributor loop are in [CONTRIBUTING.md](./CONTRIBUTING.md).

### Contributors

<a href="https://github.com/moaaz12-web"><img src="https://images.weserv.nl/?url=github.com/moaaz12-web.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@moaaz12-web" /></a>
<a href="https://github.com/lukasulc"><img src="https://images.weserv.nl/?url=github.com/lukasulc.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@lukasulc" /></a>
<a href="https://github.com/VinhPhamAI"><img src="https://images.weserv.nl/?url=github.com/VinhPhamAI.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@VinhPhamAI" /></a>
<a href="https://github.com/deadc"><img src="https://images.weserv.nl/?url=github.com/deadc.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@deadc" /></a>
<a href="https://github.com/zhangyu1324"><img src="https://images.weserv.nl/?url=github.com/zhangyu1324.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@zhangyu1324" /></a>
<a href="https://github.com/kentpan"><img src="https://images.weserv.nl/?url=github.com/kentpan.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@kentpan" /></a>
<a href="https://github.com/stephenzwj"><img src="https://images.weserv.nl/?url=github.com/stephenzwj.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@stephenzwj" /></a>
<a href="https://github.com/chongjiazhen"><img src="https://images.weserv.nl/?url=github.com/chongjiazhen.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@chongjiazhen" /></a>
<a href="https://github.com/vjsai"><img src="https://images.weserv.nl/?url=github.com/vjsai.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@vjsai" /></a>
<a href="https://github.com/long2ice"><img src="https://images.weserv.nl/?url=github.com/long2ice.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@long2ice" /></a>
<a href="https://github.com/sadesguy"><img src="https://images.weserv.nl/?url=github.com/sadesguy.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@sadesguy" /></a>
<a href="https://github.com/hodlmybeer69-bit"><img src="https://images.weserv.nl/?url=github.com/hodlmybeer69-bit.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@hodlmybeer69-bit" /></a>
<a href="https://github.com/phoenixikkifullstack"><img src="https://images.weserv.nl/?url=github.com/phoenixikkifullstack.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@phoenixikkifullstack" /></a>
<a href="https://github.com/jtbrennan-git"><img src="https://images.weserv.nl/?url=github.com/jtbrennan-git.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@jtbrennan-git" /></a>
<a href="https://github.com/praveenkumarpranjal"><img src="https://images.weserv.nl/?url=github.com/praveenkumarpranjal.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@praveenkumarpranjal" /></a>
<a href="https://github.com/nordbyte"><img src="https://images.weserv.nl/?url=github.com/nordbyte.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@nordbyte" /></a>
<a href="https://github.com/mybropro"><img src="https://images.weserv.nl/?url=github.com/mybropro.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@mybropro" /></a>
<a href="https://github.com/danscMax"><img src="https://images.weserv.nl/?url=github.com/danscMax.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@danscMax" /></a>
<a href="https://github.com/jhash"><img src="https://images.weserv.nl/?url=github.com/jhash.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@jhash" /></a>
<a href="https://github.com/JammyJames1234"><img src="https://images.weserv.nl/?url=github.com/JammyJames1234.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@JammyJames1234" /></a>
<a href="https://github.com/coffcoe"><img src="https://images.weserv.nl/?url=github.com/coffcoe.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@coffcoe" /></a>
<a href="https://github.com/Sumit4codes"><img src="https://images.weserv.nl/?url=github.com/Sumit4codes.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Sumit4codes" /></a>
<a href="https://github.com/meliani"><img src="https://images.weserv.nl/?url=github.com/meliani.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@meliani" /></a>
<a href="https://github.com/thedavidweng"><img src="https://images.weserv.nl/?url=github.com/thedavidweng.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@thedavidweng" /></a>
<a href="https://github.com/bharvey42"><img src="https://images.weserv.nl/?url=github.com/bharvey42.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@bharvey42" /></a>
<a href="https://github.com/yuvrxj-afk"><img src="https://images.weserv.nl/?url=github.com/yuvrxj-afk.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@yuvrxj-afk" /></a>
<a href="https://github.com/Tushar49"><img src="https://images.weserv.nl/?url=github.com/Tushar49.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Tushar49" /></a>
<a href="https://github.com/nicyoong"><img src="https://images.weserv.nl/?url=github.com/nicyoong.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@nicyoong" /></a>
<a href="https://github.com/Aldo-f"><img src="https://images.weserv.nl/?url=github.com/Aldo-f.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Aldo-f" /></a>
<a href="https://github.com/Tazrif-Raim"><img src="https://images.weserv.nl/?url=github.com/Tazrif-Raim.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Tazrif-Raim" /></a>
<a href="https://github.com/m1nuzz"><img src="https://images.weserv.nl/?url=github.com/m1nuzz.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@m1nuzz" /></a>
<a href="https://github.com/suantea"><img src="https://images.weserv.nl/?url=github.com/suantea.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@suantea" /></a>
<a href="https://github.com/OhOkThisIsFine"><img src="https://images.weserv.nl/?url=github.com/OhOkThisIsFine.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@OhOkThisIsFine" /></a>
<a href="https://github.com/LoneRifle"><img src="https://images.weserv.nl/?url=github.com/LoneRifle.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@LoneRifle" /></a>
<a href="https://github.com/ita333"><img src="https://images.weserv.nl/?url=github.com/ita333.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@ita333" /></a>
<a href="https://github.com/barbotkonv"><img src="https://images.weserv.nl/?url=github.com/barbotkonv.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@barbotkonv" /></a>
<a href="https://github.com/Naster17"><img src="https://images.weserv.nl/?url=github.com/Naster17.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Naster17" /></a>
<a href="https://github.com/StealthTensor"><img src="https://images.weserv.nl/?url=github.com/StealthTensor.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@StealthTensor" /></a>
<a href="https://github.com/EmranAhmed"><img src="https://images.weserv.nl/?url=github.com/EmranAhmed.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@EmranAhmed" /></a>
<a href="https://github.com/itsfuad"><img src="https://images.weserv.nl/?url=github.com/itsfuad.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@itsfuad" /></a>
<a href="https://github.com/RobinHoodO"><img src="https://images.weserv.nl/?url=github.com/RobinHoodO.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@RobinHoodO" /></a>
<a href="https://github.com/hmm183"><img src="https://images.weserv.nl/?url=github.com/hmm183.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@hmm183" /></a>
<a href="https://github.com/duemilionidieuro-bot"><img src="https://images.weserv.nl/?url=github.com/duemilionidieuro-bot.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@duemilionidieuro-bot" /></a>
<a href="https://github.com/cagedbird043"><img src="https://images.weserv.nl/?url=github.com/cagedbird043.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@cagedbird043" /></a>
<a href="https://github.com/jasnoorgill"><img src="https://images.weserv.nl/?url=github.com/jasnoorgill.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@jasnoorgill" /></a>
<a href="https://github.com/Joey9024"><img src="https://images.weserv.nl/?url=github.com/Joey9024.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Joey9024" /></a>
<a href="https://github.com/AskingConical"><img src="https://images.weserv.nl/?url=github.com/AskingConical.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@AskingConical" /></a>
<a href="https://github.com/ProAlit"><img src="https://images.weserv.nl/?url=github.com/ProAlit.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@ProAlit" /></a>
<a href="https://github.com/hjhhoni"><img src="https://images.weserv.nl/?url=github.com/hjhhoni.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@hjhhoni" /></a>
<a href="https://github.com/immanuelsavio"><img src="https://images.weserv.nl/?url=github.com/immanuelsavio.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@immanuelsavio" /></a>
<a href="https://github.com/Slyker"><img src="https://images.weserv.nl/?url=github.com/Slyker.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Slyker" /></a>
<a href="https://github.com/wells1013"><img src="https://images.weserv.nl/?url=github.com/wells1013.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@wells1013" /></a>
<a href="https://github.com/evgkrsk"><img src="https://images.weserv.nl/?url=github.com/evgkrsk.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@evgkrsk" /></a>
<a href="https://github.com/aaronjmars"><img src="https://images.weserv.nl/?url=github.com/aaronjmars.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@aaronjmars" /></a>
<a href="https://github.com/Robs87"><img src="https://images.weserv.nl/?url=github.com/Robs87.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Robs87" /></a>
<a href="https://github.com/dashitongzhi"><img src="https://images.weserv.nl/?url=github.com/dashitongzhi.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@dashitongzhi" /></a>
<a href="https://github.com/QingJ01"><img src="https://images.weserv.nl/?url=github.com/QingJ01.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@QingJ01" /></a>
<a href="https://github.com/3215"><img src="https://images.weserv.nl/?url=github.com/3215.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@3215" /></a>
<a href="https://github.com/saifulaiub123"><img src="https://images.weserv.nl/?url=github.com/saifulaiub123.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@saifulaiub123" /></a>
<a href="https://github.com/PietFourie"><img src="https://images.weserv.nl/?url=github.com/PietFourie.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@PietFourie" /></a>
<a href="https://github.com/mhmdkrmabd"><img src="https://images.weserv.nl/?url=github.com/mhmdkrmabd.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@mhmdkrmabd" /></a>
<a href="https://github.com/DemeulemeesterxMaxime"><img src="https://images.weserv.nl/?url=github.com/DemeulemeesterxMaxime.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@DemeulemeesterxMaxime" /></a>
<a href="https://github.com/HoodBlah"><img src="https://images.weserv.nl/?url=github.com/HoodBlah.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@HoodBlah" /></a>
<a href="https://github.com/SeanPedersen"><img src="https://images.weserv.nl/?url=github.com/SeanPedersen.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@SeanPedersen" /></a>
<a href="https://github.com/andersmmg"><img src="https://images.weserv.nl/?url=github.com/andersmmg.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@andersmmg" /></a>
<a href="https://github.com/chirag127"><img src="https://images.weserv.nl/?url=github.com/chirag127.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@chirag127" /></a>
<a href="https://github.com/allababbot"><img src="https://images.weserv.nl/?url=github.com/allababbot.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@allababbot" /></a>
<a href="https://github.com/johan-droid"><img src="https://images.weserv.nl/?url=github.com/johan-droid.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@johan-droid" /></a>
<a href="https://github.com/redenfire"><img src="https://images.weserv.nl/?url=github.com/redenfire.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@redenfire" /></a>
<a href="https://github.com/itzpingcat"><img src="https://images.weserv.nl/?url=github.com/itzpingcat.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@itzpingcat" /></a>
<a href="https://github.com/kairwang01"><img src="https://images.weserv.nl/?url=github.com/kairwang01.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@kairwang01" /></a>
<a href="https://github.com/gongjurenzhangwei"><img src="https://images.weserv.nl/?url=github.com/gongjurenzhangwei.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@gongjurenzhangwei" /></a>
<a href="https://github.com/jsonring"><img src="https://images.weserv.nl/?url=github.com/jsonring.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@jsonring" /></a>
<a href="https://github.com/1029734570"><img src="https://images.weserv.nl/?url=github.com/1029734570.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@1029734570" /></a>
<a href="https://github.com/86TheCactus"><img src="https://images.weserv.nl/?url=github.com/86TheCactus.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@86TheCactus" /></a>
<a href="https://github.com/AmiroKD"><img src="https://images.weserv.nl/?url=github.com/AmiroKD.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@AmiroKD" /></a>
<a href="https://github.com/ecryptomillionaire-dev"><img src="https://images.weserv.nl/?url=github.com/ecryptomillionaire-dev.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@ecryptomillionaire-dev" /></a>
<a href="https://github.com/4riful"><img src="https://images.weserv.nl/?url=github.com/4riful.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@4riful" /></a>
<a href="https://github.com/fix2015"><img src="https://images.weserv.nl/?url=github.com/fix2015.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@fix2015" /></a>
<a href="https://github.com/iisyw"><img src="https://images.weserv.nl/?url=github.com/iisyw.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@iisyw" /></a>
<a href="https://github.com/xsfhacg"><img src="https://images.weserv.nl/?url=github.com/xsfhacg.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@xsfhacg" /></a>
<a href="https://github.com/noobix"><img src="https://images.weserv.nl/?url=github.com/noobix.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@noobix" /></a>
<a href="https://github.com/nandukmelath"><img src="https://images.weserv.nl/?url=github.com/nandukmelath.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@nandukmelath" /></a>
<a href="https://github.com/NirvanaCh7"><img src="https://images.weserv.nl/?url=github.com/NirvanaCh7.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@NirvanaCh7" /></a>
<a href="https://github.com/Mohamed3nan"><img src="https://images.weserv.nl/?url=github.com/Mohamed3nan.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Mohamed3nan" /></a>
<a href="https://github.com/Arman-Espiar"><img src="https://images.weserv.nl/?url=github.com/Arman-Espiar.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Arman-Espiar" /></a>
<a href="https://github.com/MetaMysteries8"><img src="https://images.weserv.nl/?url=github.com/MetaMysteries8.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@MetaMysteries8" /></a>
<a href="https://github.com/lujun880726"><img src="https://images.weserv.nl/?url=github.com/lujun880726.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@lujun880726" /></a>
<a href="https://github.com/qq97693453"><img src="https://images.weserv.nl/?url=github.com/qq97693453.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@qq97693453" /></a>
<a href="https://github.com/emv33"><img src="https://images.weserv.nl/?url=github.com/emv33.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@emv33" /></a>
<a href="https://github.com/ousamabenyounes"><img src="https://images.weserv.nl/?url=github.com/ousamabenyounes.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@ousamabenyounes" /></a>
<a href="https://github.com/yfdyh000"><img src="https://images.weserv.nl/?url=github.com/yfdyh000.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@yfdyh000" /></a>
<a href="https://github.com/s-uryansh"><img src="https://images.weserv.nl/?url=github.com/s-uryansh.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@s-uryansh" /></a>
<a href="https://github.com/arsalanyavari"><img src="https://images.weserv.nl/?url=github.com/arsalanyavari.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@arsalanyavari" /></a>
<a href="https://github.com/RoboMWM"><img src="https://images.weserv.nl/?url=github.com/RoboMWM.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@RoboMWM" /></a>
<a href="https://github.com/gaurang-py"><img src="https://images.weserv.nl/?url=github.com/gaurang-py.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@gaurang-py" /></a>
<a href="https://github.com/ddy4633"><img src="https://images.weserv.nl/?url=github.com/ddy4633.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@ddy4633" /></a>
<a href="https://github.com/UrbsKali"><img src="https://images.weserv.nl/?url=github.com/UrbsKali.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@UrbsKali" /></a>
<a href="https://github.com/hb-0"><img src="https://images.weserv.nl/?url=github.com/hb-0.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@hb-0" /></a>
<a href="https://github.com/xyblue135"><img src="https://images.weserv.nl/?url=github.com/xyblue135.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@xyblue135" /></a>
<a href="https://github.com/Icesenator"><img src="https://images.weserv.nl/?url=github.com/Icesenator.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Icesenator" /></a>
<a href="https://github.com/ZER0-auto"><img src="https://images.weserv.nl/?url=github.com/ZER0-auto.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@ZER0-auto" /></a>
<a href="https://github.com/tashdroid"><img src="https://images.weserv.nl/?url=github.com/tashdroid.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@tashdroid" /></a>
<a href="https://github.com/Patrickleondev"><img src="https://images.weserv.nl/?url=github.com/Patrickleondev.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Patrickleondev" /></a>
<a href="https://github.com/hiiamwaffledev"><img src="https://images.weserv.nl/?url=github.com/hiiamwaffledev.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@hiiamwaffledev" /></a>
<a href="https://github.com/w0fv1"><img src="https://images.weserv.nl/?url=github.com/w0fv1.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@w0fv1" /></a>
<a href="https://github.com/oppih"><img src="https://images.weserv.nl/?url=github.com/oppih.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@oppih" /></a>
<a href="https://github.com/n3dhir"><img src="https://images.weserv.nl/?url=github.com/n3dhir.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@n3dhir" /></a>
<a href="https://github.com/ksp2000"><img src="https://images.weserv.nl/?url=github.com/ksp2000.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@ksp2000" /></a>
<a href="https://github.com/quabynahdavis"><img src="https://images.weserv.nl/?url=github.com/quabynahdavis.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@quabynahdavis" /></a>
<a href="https://github.com/qinghuanandejiangshi"><img src="https://images.weserv.nl/?url=github.com/qinghuanandejiangshi.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@qinghuanandejiangshi" /></a>
<a href="https://github.com/qatcod"><img src="https://images.weserv.nl/?url=github.com/qatcod.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@qatcod" /></a>
<a href="https://github.com/CooperSheroy"><img src="https://images.weserv.nl/?url=github.com/CooperSheroy.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@CooperSheroy" /></a>
<a href="https://github.com/shahidbeig-a11y"><img src="https://images.weserv.nl/?url=github.com/shahidbeig-a11y.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@shahidbeig-a11y" /></a>
<a href="https://github.com/Kaban15"><img src="https://images.weserv.nl/?url=github.com/Kaban15.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Kaban15" /></a>
<a href="https://github.com/efcunha"><img src="https://images.weserv.nl/?url=github.com/efcunha.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@efcunha" /></a>
<a href="https://github.com/sukaimi"><img src="https://images.weserv.nl/?url=github.com/sukaimi.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@sukaimi" /></a>
<a href="https://github.com/rome-xi"><img src="https://images.weserv.nl/?url=github.com/rome-xi.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@rome-xi" /></a>
<a href="https://github.com/bsi-bcp"><img src="https://images.weserv.nl/?url=github.com/bsi-bcp.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@bsi-bcp" /></a>
<a href="https://github.com/rodion-gudz"><img src="https://images.weserv.nl/?url=github.com/rodion-gudz.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@rodion-gudz" /></a>

## Disclaimer

**This project is for personal experimentation and learning, not production.** Free tiers exist so developers can prototype against them; they aren't a stable, supported inference substrate and shouldn't be treated as one. If you build something real on top of FreeLLMAPI, swap in a paid API before you ship. Your relationship with each upstream provider is governed by the terms you accepted when you created your account — those terms still apply when the traffic is proxied through this project, and you're responsible for complying with them.

How each provider's ToS views a personal, single-user proxy — reviewed provider by provider in May 2026 — is in [docs/en/architecture/00-high-level-index.md#terms-of-service-review](docs/en/architecture/00-high-level-index.md#terms-of-service-review).

## License

[MIT](./LICENSE)
