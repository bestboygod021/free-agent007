# فاز M151: GitHub App و Webhook/Action Integration

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/github-app-integration-runtime.ts`
**تست:** `test/next-platform-hardening-phases-5.test.ts`
**gap:** `GAP-IG-14`

## هدف و مرز

M151 مسیر رسمی GitHub را به installation، permission hash، short-lived token، signed webhook و
repository action تبدیل می‌کند. installation باید repository، events، trust، tenant match و no-raw-
credential داشته باشد. token lease scope-bound، encrypted-reference و revocable است. webhook باید
signature، event hash، dedupe و redaction داشته باشد. action باید authorization، approval، idempotency،
protected branch و force-push prohibition را enforce کند. این فاز GitHub App، token broker، webhook
receiver، permission adapter یا repository worker واقعی نیست.

## معماری و قراردادها

- `validateM151Installation`: app/install identity، permissions، event types، trust و tenant.
- `validateM151TokenLease`: scope، expiry، revoke، encryption و raw-token denial.
- `decideM151Webhook`: signature، dedupe، event hash و repository tenant.
- `decideM151RepositoryAction`: authz، approval، idempotency، branch protection و force-push.

raw GitHub token، webhook secret و password ذخیره نمی‌شوند؛ opaque reference/hash استفاده می‌شود.

## sprint plan

### Sprint A — Installation

App/install registry، repository binding، permission review و tenant.

### Sprint B — Token lifecycle

short-lived installation token، scope attenuation، encryption و revoke.

### Sprint C — Webhook ingress

signature، timestamp، dedupe، replay window و event redaction.

### Sprint D — Repository actions

read/write matrix، branch protection، approval، idempotency و worker.

## Threat Model

- **Fake webhook:** signature/hash، timestamp و dedupe لازم است.
- **Token leakage:** encrypted opaque lease و expiry اجباری است.
- **Permission escalation:** permission hash و action authorization gate می‌شوند.
- **Cross-tenant repository:** repository tenant match لازم است.
- **Destructive push:** force push ممنوع و protected branch approval-bound است.
- **Duplicate mutation:** idempotency key برای action الزامی است.

## prompt pack

### `m151-github-integration-engineer`

```text
نقش: GitHub App Integration Engineer

installation را با repository، permissions، events، trust، tenant match و no-raw-credential ثبت کن.
token را short-lived، encrypted، scoped و revocable نگه دار. webhook را signature-verified،
deduplicated و redacted کن. repository mutation را authz، approval، idempotency، branch protection
و no-force-push gate کن.
```

### `m151-github-auditor`

```text
نقش: GitHub Integration Auditor

installation، permission، token expiry/revoke، webhook signature، replay/dedupe، tenant، approval،
protected branch و force push را ممیزی کن. fake webhook یا mocked GitHub API جای App، broker، ingress
و repository worker واقعی نیست.
```

## DoD و production evidence boundary

- installation، token denial، webhook spoof/replay، protected branch و force-push denial تست شوند.
- GitHub App/OAuth، encrypted token broker، webhook ingress، dedupe store، permission adapter و action worker باید integration شوند.
- kernel M151 به‌تنهایی GitHub authorization، webhook authenticity، repository safety یا API availability production claim نیست.
