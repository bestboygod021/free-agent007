# نقشه راه و هزینه

## مایلستون‌ها

### M1 — هسته محصول
حساب، Workspace، پروژه، دریافت درخواست، تولید Plan، جریان Approval.

**معیار پایان:** یک کاربر می‌تواند درخواست بدهد، Plan ببیند و تأیید کند — بدون
اینکه یک بایت کد نوشته شود.

### M2 — حلقه کدنویسی GitHub
GitHub App، تحلیل مخزن، branch، ویرایش فایل، commit، اجرای تست، Pull Request.

**معیار پایان:** یک Run کامل از درخواست تا PR با diff قابل بررسی.

### M3 — Sandbox و امنیت
ایزوله‌سازی container، حد منابع، redaction، audit log، permission engine،
اسکن امنیتی.

**معیار پایان:** اجرای کد مخرب نمونه در sandbox هیچ اثری روی میزبان ندارد و در
audit ثبت می‌شود.

طراحی تفصیلی این فاز: [`docs/26-phase-m3-sandbox-execution-and-security.md`](./26-phase-m3-sandbox-execution-and-security.md)

### M4 — تجربه کاربری

رویدادهای زنده، لاگ ترمینال، نمایشگر diff، تسک‌بورد، timeline اجرا، بازیابی از
خطا.

**معیار پایان:** کاربر می‌تواند بدون خواندن لاگ خام بفهمد کجای کار هستیم و چرا
متوقف شدیم.

طراحی تفصیلی این فاز: [`docs/27-phase-m4-product-experience-observability-and-operations.md`](./27-phase-m4-product-experience-observability-and-operations.md)

### M5 — Connector SDK و Governed Integrations

Manifest، چارچوب OAuth، API Token/BYOK، adapter runtime، webhook، MCP، A2A،
Prompt Operations و UI مجوزها.

**معیار پایان:** افزودن یک connector جدید بدون تغییر هسته ممکن باشد؛ بدون
عبور از policy، consent، sandbox، audit یا approval.

طراحی تفصیلی این فاز: [`docs/28-phase-m5-connector-sdk-and-governed-extensibility.md`](./28-phase-m5-connector-sdk-and-governed-extensibility.md)

### M6 — Browser Automation
جلسه مرورگر، allowlist دامنه، تأیید انسانی، worker Playwright، اسکرین‌شات و
audit.

**معیار پایان:** یک جریان واقعی بدون API، با توقف درست در CAPTCHA و MFA.

طراحی تفصیلی این فاز: [`docs/29-phase-m6-browser-automation-and-human-in-loop.md`](./29-phase-m6-browser-automation-and-human-in-loop.md)

### M7 — Deploy و Preview
ساخت image، محیط پیش‌نمایش، health check، rollback، تأیید استقرار.

**معیار پایان:** استقرار با تأیید، verification خودکار، و rollback آزمایش‌شده.

طراحی تفصیلی این فاز: [`docs/30-phase-m7-deploy-preview-and-release-engineering.md`](./30-phase-m7-deploy-preview-and-release-engineering.md)

### M8 — Production Reliability و Disaster Recovery

SLO، capacity plan، backup/restore، RPO/RTO، incident response، runbook و on-call.

**معیار پایان:** خرابی با alert و owner تشخیص داده شود، restore در محیط ایزوله با RPO/RTO اندازه‌گیری شود و recovery بدون نقض tenant، privacy یا approval انجام شود.

طراحی تفصیلی این فاز: [`docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md`](./31-phase-m8-production-reliability-capacity-and-disaster-recovery.md)

### M9 — Collaboration و Project Bootstrap

membership، comment، handoff، approval delegation، template signature/license،
scaffold امن، conflict detection، PR و commit quality.

**وضعیت:** `designed_only`. هسته deterministic در `src/core/collaboration.ts` و
`src/core/project-scaffold.ts` فقط verdict و plan می‌سازد؛ persistence، UI،
filesystem adapter و Draft PR واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/32-phase-m9-collaboration-and-project-bootstrap.md`](./32-phase-m9-collaboration-and-project-bootstrap.md)

### M10 — Evaluation، Quality Gates و Consensus

caseهای ارزیابی، expected/forbidden signals، invariant gate، weighted score،
regression، cost/latency gate و consensus محدود با quorum، tie و human review.

**وضعیت:** `designed_only`. `src/core/evaluation.ts` و `src/core/consensus.ts`
contract/kernel هستند؛ runner مدل، dataset production، CI gate و evidence واقعی
هنوز وجود ندارد.

طراحی تفصیلی: [`docs/33-phase-m10-evaluation-quality-and-consensus.md`](./33-phase-m10-evaluation-quality-and-consensus.md)

### M11 — Billing، Metering و Entitlements

planهای free/paid/local، feature allowlist، سقف run/token/concurrency/project،
cost ceiling و denial صریح برای هزینه در free/local.

**وضعیت:** `designed_only`. `src/core/entitlements.ts` یک hard gate خالص است؛
provider billing، ledger پایدار، invoice، webhook و reconciliation هنوز وجود ندارد.

طراحی تفصیلی: [`docs/34-phase-m11-billing-metering-and-entitlements.md`](./34-phase-m11-billing-metering-and-entitlements.md)

### M12 — Internationalization، Localization و Accessibility

catalog نسخه‌دار، localeهای `fa-IR`/`en-US`، fallback، interpolation امن، metadata
RTL/LTR، number/date formatting و accessibility contract.

**وضعیت:** `designed_only`. `src/core/i18n.ts` فقط catalog/message/formatting
را deterministic حل می‌کند؛ UI، translation operations، screen reader و
accessibility CI هنوز وجود ندارد.

طراحی تفصیلی: [`docs/35-phase-m12-internationalization-and-accessibility.md`](./35-phase-m12-internationalization-and-accessibility.md)

### M13 — Governed Plugin Ecosystem و Marketplace Boundary

manifest، signature/digest/license، compatibility، capability/scope checks، trust
levels، hard-deny capabilities، sandbox install decision و revocation boundary.

**وضعیت:** `designed_only`. `src/core/plugin-registry.ts` package را نصب یا اجرا
نمی‌کند؛ registry، marketplace، sandbox runtime، signing service و revoke/upgrade
واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/36-phase-m13-governed-plugin-ecosystem.md`](./36-phase-m13-governed-plugin-ecosystem.md)

### M14 — Data Governance و Privacy Lifecycle

classification، purpose limitation، consent، retention، subject export/delete و
external egress policy.

**وضعیت:** `designed_only`. `src/core/data-governance.ts` فقط class، consent و
lifecycle plan می‌سازد؛ storage deletion، encryption، legal hold و export واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/37-phase-m14-data-governance-and-privacy-lifecycle.md`](./37-phase-m14-data-governance-and-privacy-lifecycle.md)

### M15 — Workflow Automation و Event-Driven Triggers

manual، schedule، webhook و system-event trigger، signed definition، cooldown،
idempotency، step approval و bounded workflow.

**وضعیت:** `designed_only`. `src/core/workflow-automation.ts` فقط run plan می‌دهد؛
scheduler، ingress، durable queue و worker execution واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/38-phase-m15-workflow-automation-and-triggers.md`](./38-phase-m15-workflow-automation-and-triggers.md)

### M16 — Memory، Knowledge و Context Retrieval

memory provenance، trust، expiry، tenant/project isolation، lexical baseline،
optional local embeddings و context boundary.

**وضعیت:** `designed_only`. `src/core/memory-retrieval.ts` retrieval قطعی و lexical
است؛ durable memory، vector adapter، context assembler و deletion واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/39-phase-m16-memory-and-context-retrieval.md`](./39-phase-m16-memory-and-context-retrieval.md)

### M17 — Agent Protocol و Interoperability Gateway

A2A/MCP envelope، signature، nonce، TTL، replay window، capability/scope mapping و
hard-deny boundary.

**وضعیت:** `designed_only`. `src/core/agent-protocol.ts` فقط envelope decision و
replay kernel است؛ network gateway، key service، adapter و tool execution واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/40-phase-m17-agent-protocol-and-interoperability.md`](./40-phase-m17-agent-protocol-and-interoperability.md)

### M18 — Organization Governance و Policy-as-Code

policy bundle نسخه‌دار، parent/child monotonic merge، mode، egress، autonomy،
capability deny، approval class و policy change plan.

**وضعیت:** `designed_only`. `src/core/org-governance.ts` فقط compile/decision/plan
می‌کند؛ persistence، admin UI، runtime enforcement و cache invalidation واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/41-phase-m18-organization-governance-and-policy.md`](./41-phase-m18-organization-governance-and-policy.md)

### M19 — Durable Product Surface، API و Event Bus

وب‌اپ مستقل، API contract، event bus، contract testing، tenant-safe command/event
boundary و durable control-plane adapter.

**وضعیت:** `designed_only`. `src/core/control-plane-contract.ts` فقط command، event
sequence و idempotency decision را بررسی می‌کند؛ HTTP، persistence، broker و web app
واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/43-phase-m19-durable-product-surface-and-event-bus.md`](./43-phase-m19-durable-product-surface-and-event-bus.md)

### M20 — Evaluation Integrity و Reproducible Benchmarking

benchmark corpus، deterministic replay، contamination detection، rubric، blind
human evaluation و regression quality gate.

**وضعیت:** `designed_only`. `src/core/evaluation-integrity.ts` فقط integrity و gate
را deterministic می‌کند؛ runner، corpus واقعی، model execution و CI evidence هنوز وجود ندارد.

طراحی تفصیلی: [`docs/44-phase-m20-evaluation-integrity-and-reproducible-benchmarking.md`](./44-phase-m20-evaluation-integrity-and-reproducible-benchmarking.md)

### M21 — Secure Supply Chain و Runtime Isolation

egress proxy، ephemeral secret broker، signed tool manifest، SBOM، dependency policy،
prompt-injection firewall، DLP و microVM boundary.

**وضعیت:** `designed_only`. `src/core/secure-supply-chain.ts` فقط admission، DLP و
lease plan می‌سازد؛ secret manager، proxy، SBOM builder و microVM runtime واقعی وجود ندارد.

طراحی تفصیلی: [`docs/45-phase-m21-secure-supply-chain-and-runtime-isolation.md`](./45-phase-m21-secure-supply-chain-and-runtime-isolation.md)

### M22 — Resilience، SLO، FinOps و Provider Operations

crash resume، circuit breaker، SLO/error budget، backup restore drill، pre-run
budget، provider quota scheduler، health score، response cache و energy metering.

**وضعیت:** `designed_only`. `src/core/resilience-operations.ts` فقط transition،
budget، selection، SLO و restore plan را می‌سازد؛ provider، storage، cache و restore
runtime واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/46-phase-m22-resilience-finops-and-provider-operations.md`](./46-phase-m22-resilience-finops-and-provider-operations.md)

### M23 — Delivery Trust و Developer Experience

approval inbox، rollback، isolated worktree، transactional patch apply، license
scanner، git secret scan، artifact attestation، CLI/IDE، fixture و test matrix.

**وضعیت:** `designed_only`. `src/core/delivery-trust.ts` فقط plan و scan decision
می‌دهد؛ Git mutation، artifact signer، worktree adapter، CLI/IDE و UI approval واقعی
هنوز وجود ندارد.

طراحی تفصیلی: [`docs/47-phase-m23-delivery-trust-and-developer-experience.md`](./47-phase-m23-delivery-trust-and-developer-experience.md)

### M24 — Intake، Planning، Capability Graph و Collaboration

intent taxonomy، requirement extraction، task decomposition، capability graph، governed
Plugin SDK و collaboration تیمی.

**وضعیت:** `designed_only` از نظر integration. `src/core/intake-and-collaboration.ts`
فقط classifier، validator و decision kernel دارد؛ مدل، filesystem، plugin runtime،
persistence و UI واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/48-phase-m24-intake-planning-and-collaboration.md`](./48-phase-m24-intake-planning-and-collaboration.md)

### M25 — Evidence-Grounded Routing و Operations

official source boundary، calibration، capability drift، Pareto routing، explanation،
shadow routing، distributed tracing و error taxonomy.

**وضعیت:** `designed_only` از نظر integration. `src/core/evidence-routing-operations.ts`
فقط claim normalization، route comparison، trace و error contract را اجرا می‌کند؛
harvester، provider call، OTel exporter و metrics backend واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/49-phase-m25-evidence-grounded-routing-and-operations.md`](./49-phase-m25-evidence-grounded-routing-and-operations.md)

### M26 — Secure Knowledge Fabric و Context Packing

code knowledge graph، ACL-aware connectors، context packing، tiered memory، stale
documentation و data lineage.

**وضعیت:** `designed_only` از نظر integration. `src/core/knowledge-fabric.ts` فقط graph،
ACL، budget و lineage را deterministic بررسی می‌کند؛ AST/index/vector/persistence واقعی
هنوز وجود ندارد.

طراحی تفصیلی: [`docs/50-phase-m26-secure-knowledge-fabric.md`](./50-phase-m26-secure-knowledge-fabric.md)

### M27 — Privacy-Aware Retrieval و Local Index

PII classification، data deletion propagation، retrieval evaluation و local repository
index با network deny.

**وضعیت:** `designed_only` از نظر integration. `src/core/privacy-retrieval.ts` فقط
classification، plan و metric contract دارد؛ classifier model، vector store، deletion
worker و embedding runtime واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/51-phase-m27-privacy-aware-retrieval-and-local-index.md`](./51-phase-m27-privacy-aware-retrieval-and-local-index.md)

### M28 — Governance، Quality و Transparency

policy as code، change management، model cards، fairness/language eval، WCAG، Persian
RTL QA، plugin marketplace، transparency dashboard و ADR.

**وضعیت:** `designed_only` از نظر integration. `src/core/governance-quality.ts` فقط
policy/quality/publication decision می‌دهد؛ admin UI، marketplace، signer، dashboard
backend و browser accessibility audit واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/52-phase-m28-governance-quality-and-transparency.md`](./52-phase-m28-governance-quality-and-transparency.md)

### M29 — Durable Runtime Foundation

transaction، RLS boundary، outbox، idempotency و durable job envelope.

**وضعیت:** `designed_only` از نظر integration. `src/core/durable-runtime-contract.ts`
فقط tenant/mutation/event/job decision می‌دهد؛ PostgreSQL، Redis/BullMQ، migration و
worker production هنوز اجرا نشده‌اند.

طراحی تفصیلی: [`docs/53-phase-m29-durable-runtime-foundation.md`](./53-phase-m29-durable-runtime-foundation.md)

### M30 — Sandbox Execution و Workspace Runtime

sandbox، VFS، patch atomic، test runner normalization و cleanup proof.

**وضعیت:** `designed_only` از نظر integration. `src/core/execution-sandbox-contract.ts`
فقط sandbox/patch/test/cleanup contract دارد؛ container/microVM و runner واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/54-phase-m30-sandbox-execution-and-workspace-runtime.md`](./54-phase-m30-sandbox-execution-and-workspace-runtime.md)

### M31 — Connector و Provider Runtime

OAuth، webhook، connector scope، provider adapter، BYOK/free/local و privacy egress.

**وضعیت:** `designed_only` از نظر integration. `src/core/connector-provider-runtime.ts`
فقط state/signature/scope/provider decision دارد؛ GitHub App، vault، HTTP adapter و
webhook ingress واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/55-phase-m31-connector-and-provider-runtime.md`](./55-phase-m31-connector-and-provider-runtime.md)

### M32 — Operations Evidence، SLO، FinOps و Disaster Recovery

metrics، trace، SLO، error budget، cost reconciliation، incident و restore drill.

**وضعیت:** `designed_only` از نظر integration. `src/core/operations-evidence.ts` فقط
metric/SLO/cost/restore evidence contract دارد؛ collector، dashboard، backup و restore
runtime واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/56-phase-m32-operations-evidence-and-disaster-recovery.md`](./56-phase-m32-operations-evidence-and-disaster-recovery.md)

### M33 — Product Surface، Approval UX و Client Contracts

screen state، SSE resume، timeline، approval inbox، CLI/IDE client و accessibility.

**وضعیت:** `designed_only` از نظر integration. `src/core/product-surface-contract.ts`
فقط view/client/approval/a11y contract دارد؛ Web App، SSE transport، Playwright و
accessibility browser audit واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/57-phase-m33-product-surface-and-approval-clients.md`](./57-phase-m33-product-surface-and-approval-clients.md)

### M34 — Identity، Membership و Access Runtime

session proof، membership، role governance، settings hierarchy، onboarding و notifications.

**وضعیت:** `designed_only` از نظر integration. `src/core/identity-access-contract.ts` فقط
session/role/settings/notification decision دارد؛ identity provider، MFA service، mailer و
membership store واقعی هنوز اجرا نشده‌اند.

طراحی تفصیلی: [`docs/58-phase-m34-identity-membership-and-access-runtime.md`](./58-phase-m34-identity-membership-and-access-runtime.md)

### M35 — Evaluation و Reproducible Benchmark Runtime

dataset provenance، benchmark plan، scoring، regression gate و human feedback.

**وضعیت:** `designed_only` از نظر integration. `src/core/evaluation-runtime-contract.ts` فقط
case/benchmark/aggregate/regression contract دارد؛ model runner، evaluator، CI و dataset
registry واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/59-phase-m35-evaluation-and-benchmark-runtime.md`](./59-phase-m35-evaluation-and-benchmark-runtime.md)

### M36 — Repository Intelligence و Context Runtime

repository snapshot، ACL context packing، delegation، path guard و migration boundary.

**وضعیت:** `designed_only` از نظر integration. `src/core/repository-context-runtime.ts` فقط
snapshot/path/context/delegation decision دارد؛ indexer، parser، vector store، migration
runner و Git/PR adapter واقعی هنوز اجرا نشده‌اند.

طراحی تفصیلی: [`docs/60-phase-m36-repository-intelligence-and-context-runtime.md`](./60-phase-m36-repository-intelligence-and-context-runtime.md)

### M37 — Preview، Artifact و Delivery Runtime

preview environment، immutable artifact، retention، deploy approval و rollback.

**وضعیت:** `designed_only` از نظر integration. `src/core/delivery-preview-runtime.ts` فقط
preview/artifact/deploy/rollback contract دارد؛ object store، ingress، TLS، deploy adapter،
Docker/Helm و load test واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/61-phase-m37-preview-artifact-and-delivery-runtime.md`](./61-phase-m37-preview-artifact-and-delivery-runtime.md)

### M38 — Security، Privacy و Governance Runtime

STRIDE، tenant isolation، key rotation، retention/deletion، prompt injection، DLP و egress.

**وضعیت:** `designed_only` از نظر integration. `src/core/security-privacy-governance-runtime.ts`
فقط policy/evidence decision دارد؛ KMS/Vault، DLP، privacy worker، abuse detector، pen-test و
chaos runner واقعی هنوز اجرا نشده‌اند.

طراحی تفصیلی: [`docs/62-phase-m38-security-privacy-and-governance-runtime.md`](./62-phase-m38-security-privacy-and-governance-runtime.md)

### M39 — Agent Interaction و Streaming Runtime

structured output، repair loop، model streaming، resume و tool-target guardrail.

**وضعیت:** `designed_only` از نظر integration. `src/core/agent-interaction-runtime.ts` فقط
output/stream/tool decision دارد؛ model adapter، SSE/WebSocket، grammar decoder و terminal UI
واقعی هنوز اجرا نشده‌اند.

طراحی تفصیلی: [`docs/63-phase-m39-agent-interaction-and-streaming-runtime.md`](./63-phase-m39-agent-interaction-and-streaming-runtime.md)

### M40 — Connector Gateway و Interoperability Runtime

GitHub App، rate/backoff، signed webhook، database introspection و MCP envelope.

**وضعیت:** `designed_only` از نظر integration. `src/core/connector-gateway-runtime.ts` فقط
installation/rate/webhook/database/MCP contract دارد؛ GitHub API، vault، driver، ingress و
MCP server واقعی هنوز وجود ندارند.

طراحی تفصیلی: [`docs/64-phase-m40-connector-gateway-and-interoperability-runtime.md`](./64-phase-m40-connector-gateway-and-interoperability-runtime.md)

### M41 — Data Lifecycle، Analytics و Metering Runtime

retention، legal hold، analytics event store، entitlement و full-text search.

**وضعیت:** `designed_only` از نظر integration. `src/core/data-lifecycle-analytics-runtime.ts` فقط
lifecycle/event/query/entitlement/search decision دارد؛ deletion worker، warehouse، billing،
search index و dashboard واقعی هنوز اجرا نشده‌اند.

طراحی تفصیلی: [`docs/65-phase-m41-data-lifecycle-analytics-and-metering-runtime.md`](./65-phase-m41-data-lifecycle-analytics-and-metering-runtime.md)

### M42 — Quality، CI و Verification Runtime

toolchain matrix، test adapter، E2E، load/security، accessibility و CI gate.

**وضعیت:** `designed_only` از نظر integration. `src/core/quality-ci-runtime.ts` فقط
runner/result/E2E/gate/a11y contract دارد؛ GitHub Actions، Playwright، k6، axe، scanner و
lint/formatter واقعی هنوز اجرا نشده‌اند.

طراحی تفصیلی: [`docs/66-phase-m42-quality-ci-and-verification-runtime.md`](./66-phase-m42-quality-ci-and-verification-runtime.md)

### M43 — Self-host، Release و Resilience Runtime

Docker/Compose، Helm/Kubernetes، release، recovery، upgrade و chaos boundary.

**وضعیت:** `designed_only` از نظر integration. `src/core/self-host-resilience-runtime.ts` فقط
profile/release/recovery/chaos/upgrade decision دارد؛ packaging، backup/restore، cloud adapter
و chaos runner واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/67-phase-m43-self-host-release-and-resilience-runtime.md`](./67-phase-m43-self-host-release-and-resilience-runtime.md)

### M44 — Collaboration، Onboarding و Run Workspace

collaboration روی Run، handoff، onboarding، starter template، CLI و offline workspace.

**وضعیت:** `designed_only` از نظر integration. `src/core/collaboration-onboarding-runtime.ts`
فقط action/template/onboarding/offline decision دارد؛ collaboration store، Web App، Forge CLI،
template registry و sync واقعی هنوز اجرا نشده‌اند.

طراحی تفصیلی: [`docs/68-phase-m44-collaboration-onboarding-and-run-workspace.md`](./68-phase-m44-collaboration-onboarding-and-run-workspace.md)

### M45 — Localization، Design System و Degraded Clients

message catalog، Persian RTL، design token، PWA و offline/degraded client.

**وضعیت:** `designed_only` از نظر integration. `src/core/localization-design-runtime.ts` فقط
catalog/locale/token/offline/PWA contract دارد؛ translation pipeline، design system، service
worker، Tauri و offline storage واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/69-phase-m45-localization-design-and-degraded-clients.md`](./69-phase-m45-localization-design-and-degraded-clients.md)

### M46 — Browser Automation و External Signal Runtime

browser session، allowlist، human handover، external signal و bounded harvesting.

**وضعیت:** `designed_only` از نظر integration. `src/core/browser-signal-runtime.ts` فقط
session/navigation/handover/signal/harvester decision دارد؛ Playwright، recorder، network
adapter و signal pipeline واقعی هنوز اجرا نشده‌اند.

طراحی تفصیلی: [`docs/70-phase-m46-browser-automation-and-external-signals.md`](./70-phase-m46-browser-automation-and-external-signals.md)

### M47 — Legal، Licensing و Enterprise Governance Runtime

Terms/Privacy، output rights، dependency license، vulnerability disclosure و enterprise upgrade.

**وضعیت:** `designed_only` از نظر integration. `src/core/legal-enterprise-governance-runtime.ts`
فقط document/rights/license/disclosure/upgrade decision دارد؛ legal review، policy website،
license scanner، support/billing و enterprise service واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/71-phase-m47-legal-licensing-and-enterprise-governance.md`](./71-phase-m47-legal-licensing-and-enterprise-governance.md)

### M48 — Production Integration Evidence و Controlled Cutover

evidence envelope، readiness gate، canary، cutover و rollback evidence.

**وضعیت:** `designed_only` از نظر integration. `src/core/production-cutover-evidence.ts` فقط
readiness/canary/cutover/rollback contract دارد؛ production deploy، monitoring، backup، CI و
external adapter واقعی هنوز اجرا نشده‌اند.

طراحی تفصیلی: [`docs/72-phase-m48-production-integration-evidence-and-cutover.md`](./72-phase-m48-production-integration-evidence-and-cutover.md)

### M49 — Platform Connections، OAuth/PKCE و Consent

اتصال کاربر به GitHub، GitLab، Bitbucket، Slack، Linear، Notion، Google Drive، Jira و custom platform با scope، consent، PKCE و revoke.

**وضعیت:** `designed_only` از نظر integration. `src/core/platform-connection-runtime.ts` فقط descriptor، OAuth/PKCE، consent و opaque credential reference را gate می‌کند؛ OAuth server، callback، token vault و provider واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/73-phase-m49-platform-connections-oauth-and-consent.md`](./73-phase-m49-platform-connections-oauth-and-consent.md)

### M50 — Unified Connector Capabilities و Cross-platform Actions

normalized operation، capability negotiation، scope intersection و action approval برای platformهای مختلف.

**وضعیت:** `designed_only` از نظر integration. `src/core/unified-connector-runtime.ts` فقط manifest/capability/action contract دارد؛ SDK، adapter، API gateway و remote write واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/74-phase-m50-unified-connector-capabilities-and-actions.md`](./74-phase-m50-unified-connector-capabilities-and-actions.md)

### M51 — Cross-platform Context Handoff و Deep Links

deep link، context handoff، import/export bundle و رفت‌وبرگشت امن بین اپ و platform.

**وضعیت:** `designed_only` از نظر integration. `src/core/platform-handoff-runtime.ts` فقط signed link، bounded context و bundle validation دارد؛ router، UI، browser/mobile handoff و import/export service واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/75-phase-m51-cross-platform-handoff-and-deep-links.md`](./75-phase-m51-cross-platform-handoff-and-deep-links.md)

### M52 — Platform Sync، Webhook و Conflict Resolution

inbound webhook، cursor، dedupe، outbox، retry و conflict review برای sync پایدار.

**وضعیت:** `designed_only` از نظر integration. `src/core/platform-sync-runtime.ts` فقط event/cursor/conflict/delivery contract دارد؛ receiver، queue، event store و provider replay واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/76-phase-m52-platform-sync-and-conflict-resolution.md`](./76-phase-m52-platform-sync-and-conflict-resolution.md)

### M53 — Connection Center، Health، Recovery و Fallback

connection center، health، reauthorization، revoke و fallback صادقانه به local/BYOK/free/read-only.

**وضعیت:** `designed_only` از نظر integration. `src/core/connection-health-runtime.ts` فقط health/fallback/reconnect/scope decision دارد؛ UI، monitoring، refresh worker، quota و recovery واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/77-phase-m53-connection-center-health-and-fallback.md`](./77-phase-m53-connection-center-health-and-fallback.md)

### M54 — Visual App Studio و Prompt-to-UI

محیط نمایشی برای تبدیل توضیح کاربر به canvas گرافیکی، UX flow، screen/component، state و interactive preview.

**وضعیت:** `designed_only` از نظر integration. `src/core/visual-app-studio-runtime.ts` فقط intent/canvas/session contract دارد؛ browser canvas، renderer، asset store و collaborative editor واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/78-phase-m54-visual-app-studio-and-prompt-to-ui.md`](./78-phase-m54-visual-app-studio-and-prompt-to-ui.md)

### M55 — Design-to-code، Component Handoff و UX Verification

تبدیل کنترل‌شده design graph به component mapping، design token، code handoff و accessibility review.

**وضعیت:** `designed_only` از نظر integration. `src/core/design-to-code-runtime.ts` فقط sandbox/path/accessibility contract دارد؛ code generator، framework compiler، browser runner و axe integration واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/79-phase-m55-design-to-code-and-ux-verification.md`](./79-phase-m55-design-to-code-and-ux-verification.md)

### M56 — Web AI Model Discovery و Free API Verification

کشف bounded مدل‌ها از official catalog/provider docs/model card/repository، توضیح کوتاه، provenance و نشان free API.

**وضعیت:** `designed_only` از نظر integration. `src/core/model-discovery-runtime.ts` فقط discovery/free-evidence decision دارد؛ crawler، search adapter، parser، summarizer و provider probe واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/80-phase-m56-web-ai-model-discovery-and-free-api.md`](./80-phase-m56-web-ai-model-discovery-and-free-api.md)

### M57 — Comprehensive AI Directory و Model Cards

دایرکتوری دسته‌بندی‌شده و قابل جست‌وجو برای chat، code، image، video، audio، speech، embedding، vision، search، agentic، 3D و سایر حوزه‌ها.

**وضعیت:** `designed_only` از نظر integration. `src/core/ai-directory-runtime.ts` فقط taxonomy/model-card/query/ranking contract دارد؛ directory store، search index، UI و health backend واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/81-phase-m57-comprehensive-ai-directory-and-model-cards.md`](./81-phase-m57-comprehensive-ai-directory-and-model-cards.md)

### M58 — Model Catalog Governance و Safe Activation

چرخه candidate تا verified/listed/enabled/retired، activation امن free API/BYOK/local و health evidence.

**وضعیت:** `designed_only` از نظر integration. `src/core/model-catalog-governance-runtime.ts` فقط publication/activation/health/refresh decision دارد؛ catalog store، model router، quota، provider probe و activation UI واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/82-phase-m58-model-catalog-governance-and-safe-activation.md`](./82-phase-m58-model-catalog-governance-and-safe-activation.md)

### M59 — Visual Studio Integration و Reviewable Preview

وصل‌کردن canvas طراحی به preview محلی/sandbox/staging، collaboration event، screenshot، browser report و publish boundary.

**وضعیت:** `designed_only` از نظر integration. `src/core/visual-studio-integration-runtime.ts` فقط preview/artifact/publish decision دارد؛ browser renderer، persistence، collaboration store و branch writer واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/83-phase-m59-visual-studio-integration-and-preview.md`](./83-phase-m59-visual-studio-integration-and-preview.md)

### M60 — Model Evaluation، Trust و Activation Gate

benchmark reproducible، safety/quality/latency/cost، trust profile و gate پیش از فعال‌سازی model.

**وضعیت:** `designed_only` از نظر integration. `src/core/model-evaluation-trust-runtime.ts` فقط evaluation/trust contract دارد؛ dataset، evaluator، red-team و CI gate واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/84-phase-m60-model-evaluation-and-trust.md`](./84-phase-m60-model-evaluation-and-trust.md)

### M61 — Model Provider Runtime و Intelligent Routing

اتصال catalog/trust به endpointهای local/free/paid، privacy، quota، route و fallback.

**وضعیت:** `designed_only` از نظر integration. `src/core/model-provider-runtime.ts` فقط endpoint/route/fallback decision دارد؛ provider adapter، credential broker، queue و API execution واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/85-phase-m61-model-provider-runtime-and-routing.md`](./85-phase-m61-model-provider-runtime-and-routing.md)

### M62 — AI Workflow Builder و Agent Graphs

ساخت graph از input/model/tool/condition/transform/approval/output و اتصال آن به Studio، model و connector.

**وضعیت:** `designed_only` از نظر integration. `src/core/ai-workflow-builder-runtime.ts` فقط graph/schema/approval contract دارد؛ workflow engine، tool executor، CLI و runtime واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/86-phase-m62-ai-workflow-builder-and-agent-graphs.md`](./86-phase-m62-ai-workflow-builder-and-agent-graphs.md)

### M63 — AI Platform Operations، Quota و Governance

health، latency، availability، quota، cost، incident response و tenant-scoped model operations dashboard.

**وضعیت:** `designed_only` از نظر integration. `src/core/ai-platform-operations-runtime.ts` فقط health/quota/incident/dashboard decision دارد؛ monitoring، alerting، billing، incident system و restore drill واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/87-phase-m63-ai-platform-operations-and-governance.md`](./87-phase-m63-ai-platform-operations-and-governance.md)

### M64 — Product Control-plane UI، API و Approval Surfaces

اتصال contractهای پلتفرم به screen projection، API داخلی، حالت‌های loading/empty/error/degraded و approval inbox.

**وضعیت:** `designed_only` از نظر integration. `src/core/product-control-plane-runtime.ts` فقط tenant/API/screen/approval decision دارد؛ Web App، API server، session middleware و approval UI واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/88-phase-m64-product-control-plane-and-api.md`](./88-phase-m64-product-control-plane-and-api.md)

### M65 — Durable Persistence، RLS، Outbox و Job Leases

transaction، tenant RLS، optimistic version، durable outbox و worker lease برای خروج از process-local state.

**وضعیت:** `designed_only` از نظر integration. `src/core/durable-persistence-runtime.ts` فقط transaction/outbox/lease contract دارد؛ PostgreSQL/RLS، queue، event store و worker واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/89-phase-m65-durable-persistence-and-event-bus.md`](./89-phase-m65-durable-persistence-and-event-bus.md)

### M66 — Sandbox Execution و Workspace Integration

اجرای untrusted code در sandbox، patch atomic، test-run evidence و cleanup proof.

**وضعیت:** `designed_only` از نظر integration. `src/core/execution-integration-runtime.ts` فقط sandbox/patch/test/cleanup gate دارد؛ runtime sandbox، VFS، test adapter و cleanup runner واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/90-phase-m66-sandbox-execution-and-workspace-integration.md`](./90-phase-m66-sandbox-execution-and-workspace-integration.md)

### M67 — External Integration Gates و Adapter Probes

اتصال کنترل‌شده connector، model provider، webhook، database و MCP با capability probe و tenant evidence.

**وضعیت:** `designed_only` از نظر integration. `src/core/external-integration-gate-runtime.ts` فقط manifest/probe/run/rollback decision دارد؛ adapterهای واقعی، network probe و provider integration هنوز وجود ندارد.

طراحی تفصیلی: [`docs/91-phase-m67-external-integration-gates.md`](./91-phase-m67-external-integration-gates.md)

### M68 — Pilot Release، E2E و Release Gates

pilot cohort، E2E flow evidence، accessibility/security checks، rollback و release readiness.

**وضعیت:** `designed_only` از نظر integration. `src/core/pilot-release-gate-runtime.ts` فقط cohort/flow/release/abort contract دارد؛ canary traffic، CI/CD، monitoring، rollback executor و production pilot واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/92-phase-m68-pilot-release-and-e2e-gates.md`](./92-phase-m68-pilot-release-and-e2e-gates.md)

### M69 — Enterprise Identity، Membership و Delegation

دعوت عضو، membership state، نقش، SSO/OIDC/SAML، MFA، deprovision و delegation کوتاه‌عمر.

**وضعیت:** `designed_only` از نظر integration. `src/core/enterprise-identity-runtime.ts` فقط federation/membership/delegation contract دارد؛ IdP، MFA، directory sync، membership store و admin UI واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/93-phase-m69-enterprise-identity-and-membership.md`](./93-phase-m69-enterprise-identity-and-membership.md)

### M70 — Privacy Lifecycle، Data Rights و Deletion Evidence

retention، access/export/rectify/delete/restrict، legal hold، tombstone و residual deletion proof.

**وضعیت:** `designed_only` از نظر integration. `src/core/privacy-lifecycle-runtime.ts` فقط rights/retention/hold/deletion decision دارد؛ DSAR portal، deletion worker، store propagation و legal service واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/94-phase-m70-privacy-lifecycle-and-data-rights.md`](./94-phase-m70-privacy-lifecycle-and-data-rights.md)

### M71 — Developer Experience، API Contract و SDK/CLI

API versioning، schema compatibility، SDKهای چندزبان، Forge CLI و signed customer webhook.

**وضعیت:** `designed_only` از نظر integration. `src/core/developer-experience-runtime.ts` فقط API/SDK/CLI/webhook contract دارد؛ server، generator، binary، package registry و delivery واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/95-phase-m71-developer-experience-and-sdk.md`](./95-phase-m71-developer-experience-and-sdk.md)

### M72 — Extension Marketplace و Plugin Trust

manifest، permission، signature/checksum، sandbox، security/dependency scan، review و install/revoke lifecycle.

**وضعیت:** `designed_only` از نظر integration. `src/core/extension-marketplace-runtime.ts` فقط plugin manifest/review/install/security gate دارد؛ marketplace، registry، scanner و runtime sandbox واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/96-phase-m72-extension-marketplace-and-plugin-trust.md`](./96-phase-m72-extension-marketplace-and-plugin-trust.md)

### M73 — Platform Resilience، SLO، Backup/Restore و Chaos

SLO، error budget، encrypted backup، restore evidence، incident action، failover و bounded chaos.

**وضعیت:** `designed_only` از نظر integration. `src/core/platform-resilience-runtime.ts` فقط SLO/backup/incident/chaos contract دارد؛ monitoring، backup store، restore runner، self-host و chaos runner واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/97-phase-m73-platform-resilience-and-dr.md`](./97-phase-m73-platform-resilience-and-dr.md)

### M74 — Product Experience، Client Contracts و Accessibility

screen state، error/degraded UX، tenant-safe client action، idempotency، RTL و accessibility evidence.

**وضعیت:** `designed_only` از نظر integration. `src/core/product-experience-runtime.ts` فقط screen/action/accessibility/release contract دارد؛ Web UI، browser E2E، design system و axe/screen-reader runner واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/98-phase-m74-product-experience-and-accessibility.md`](./98-phase-m74-product-experience-and-accessibility.md)

### M75 — Evaluation Harness، Benchmark و Regression Gates

scenario provenance، deterministic seed، blind scoring، safety/contamination، score evidence و regression gate.

**وضعیت:** `designed_only` از نظر integration. `src/core/evaluation-harness-runtime.ts` فقط scenario/run/score/regression contract دارد؛ corpus، model runner، scorer، CI و human feedback واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/99-phase-m75-evaluation-harness-and-regression.md`](./99-phase-m75-evaluation-harness-and-regression.md)

### M76 — Execution Fabric، Workspace/VFS و Sandbox

runtime matrix، allowed paths، network/resource limits، atomic patch، test result و cleanup proof.

**وضعیت:** `designed_only` از نظر integration. `src/core/execution-fabric-runtime.ts` فقط sandbox/patch/test/cleanup gate دارد؛ VFS، process isolation، language adapter، artifact store و cleanup probe واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/100-phase-m76-execution-fabric-and-sandbox.md`](./100-phase-m76-execution-fabric-and-sandbox.md)

### M77 — Connector Delivery، Webhook و Rate Limits

connector manifest، کمینه scope، short-lived token، signed webhook، dedupe، Retry-After و normalized action.

**وضعیت:** `designed_only` از نظر integration. `src/core/connector-delivery-runtime.ts` فقط connector/webhook/rate-limit/action contract دارد؛ OAuth server، GitHub App، receiver، queue و provider adapter واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/101-phase-m77-connector-delivery-and-webhooks.md`](./101-phase-m77-connector-delivery-and-webhooks.md)

### M78 — Self-host Release، CI Evidence و Upgrade Gates

artifact digest/SBOM/signature، CI evidence، Compose/Kubernetes، canary، backup، migration dry-run و rollback.

**وضعیت:** `designed_only` از نظر integration. `src/core/self-host-release-runtime.ts` فقط artifact/CI/release/upgrade contract دارد؛ CI provider، registry، Helm، deployment adapter، backup executor و release واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/102-phase-m78-self-host-release-and-ci.md`](./102-phase-m78-self-host-release-and-ci.md)

### M79 — Secure Knowledge Fabric، Context و Repository Intelligence

repository index، context assembly، semantic memory، ACL، lineage و bounded agent delegation.

**وضعیت:** `designed_only` از نظر integration. `src/core/knowledge-context-runtime.ts` فقط source/index/context/delegation contract دارد؛ indexer، vector store، RAG، watcher و migration runner واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/103-phase-m79-knowledge-context-and-repository-intelligence.md`](./103-phase-m79-knowledge-context-and-repository-intelligence.md)

### M80 — Prompt Safety، Injection Detection و Output Trust

injection، canary، secret/tenant leak، structured output و bounded repair/fallback.

**وضعیت:** `designed_only` از نظر integration. `src/core/prompt-safety-runtime.ts` فقط policy/ingress/output/fallback gate دارد؛ classifier، DLP، model firewall و streaming redactor واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/104-phase-m80-prompt-safety-and-output-trust.md`](./104-phase-m80-prompt-safety-and-output-trust.md)

### M81 — Collaboration، Onboarding و Usage Control

Run collaboration، first-run، local/BYOK/free، notification، metering و entitlement.

**وضعیت:** `designed_only` از نظر integration. `src/core/collaboration-usage-runtime.ts` فقط collaboration/onboarding/notification/usage contract دارد؛ UI، email/webhook، usage store، billing و Forge client واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/105-phase-m81-collaboration-onboarding-and-usage.md`](./105-phase-m81-collaboration-onboarding-and-usage.md)

### M82 — Integration Adapters و Browser Runtime

GitHub App، MCP، database، browser session، scope، probe و rollback evidence.

**وضعیت:** `designed_only` از نظر integration. `src/core/integration-adapter-runtime.ts` فقط manifest/operation/browser/probe gate دارد؛ connector clients، browser runner، queue/rate limiter و webhook server واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/106-phase-m82-integration-adapters-and-browser.md`](./106-phase-m82-integration-adapters-and-browser.md)

### M83 — Data Governance، Analytics، Legal و Disclosure

event envelope، governed analytics، legal acceptance، output rights و vulnerability disclosure.

**وضعیت:** `designed_only` از نظر integration. `src/core/data-governance-runtime.ts` فقط event/query/legal/disclosure contract دارد؛ event store، search، legal review، secret-manager decision و disclosure workflow واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/107-phase-m83-data-governance-legal-and-disclosure.md`](./107-phase-m83-data-governance-legal-and-disclosure.md)

### M84 — Agent Orchestration، Workflow Graph و Checkpoints

workflow DAG، scheduling، checkpoint، resume و tool-call approval.

**وضعیت:** `designed_only` از نظر integration. `src/core/agent-orchestration-runtime.ts` فقط graph/schedule/checkpoint/tool gate دارد؛ scheduler، queue، worker، state store و model/tool adapter واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/108-phase-m84-agent-orchestration-and-checkpoints.md`](./108-phase-m84-agent-orchestration-and-checkpoints.md)

### M85 — Public API، Worker Lease و Stream Runtime

public API tenant-safe، worker lease/fencing، SSE/WebSocket resume و job completion evidence.

**وضعیت:** `designed_only` از نظر integration. `src/core/api-worker-runtime.ts` فقط API/lease/stream/completion contract دارد؛ API server، auth middleware، queue/worker، broker و durable store واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/109-phase-m85-api-worker-and-stream-runtime.md`](./109-phase-m85-api-worker-and-stream-runtime.md)

### M86 — Provider Economics، Quota و Routing

provider offer، local/BYOK/free/paid route، quota، RPM، budget و cost reconciliation.

**وضعیت:** `designed_only` از نظر integration. `src/core/provider-economics-runtime.ts` فقط offer/route/quota/reconciliation gate دارد؛ provider adapter، vault، limiter، billing ledger و invoice importer واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/110-phase-m86-provider-economics-and-routing.md`](./110-phase-m86-provider-economics-and-routing.md)

### M87 — Quality Integration، E2E، Load/Security و Accessibility

reproducible scenario، E2E، tenant probe، load/security threshold و accessibility evidence.

**وضعیت:** `designed_only` از نظر integration. `src/core/quality-integration-runtime.ts` فقط scenario/E2E/load/security/a11y evidence contract دارد؛ browser runner، k6/security/axe runner، CI و staging واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/111-phase-m87-quality-integration-and-e2e.md`](./111-phase-m87-quality-integration-and-e2e.md)

### M88 — Release Certification، Canary و Controlled Cutover

release candidate، artifact/SBOM/signature، canary، promotion، incident hold و rollback.

**وضعیت:** `designed_only` از نظر integration. `src/core/release-certification-runtime.ts` فقط candidate/cutover/canary/rollback contract دارد؛ registry، deployment، traffic manager، backup executor و production approval workflow واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/112-phase-m88-release-certification-and-cutover.md`](./112-phase-m88-release-certification-and-cutover.md)

### M89 — Observability، SLO Measurement و Incident Command

telemetry، SLO measurement، alert evaluation و incident runbook action.

**وضعیت:** `designed_only` از نظر integration. `src/core/observability-incident-runtime.ts` فقط telemetry/SLO/alert/incident contract دارد؛ collector، metrics store، alert manager و on-call واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/113-phase-m89-observability-and-incident-command.md`](./113-phase-m89-observability-and-incident-command.md)

### M90 — Durable Data Plane، Event Store و Governed Search

versioned entity، append-only event، migration safety و ACL/tenant-scoped search.

**وضعیت:** `designed_only` از نظر integration. `src/core/durable-data-plane-runtime.ts` فقط entity/event/migration/search gate دارد؛ PostgreSQL، event bus، index، backup و migration runner واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/114-phase-m90-durable-data-plane-and-search.md`](./114-phase-m90-durable-data-plane-and-search.md)

### M91 — Billing، Entitlements و Usage Reconciliation

plan، allowance، usage charge، invoice delta و subscription transition.

**وضعیت:** `designed_only` از نظر integration. `src/core/billing-entitlement-runtime.ts` فقط plan/charge/invoice/subscription contract دارد؛ payment provider، billing DB، webhook، tax/invoice UI و durable ledger واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/115-phase-m91-billing-and-entitlements.md`](./115-phase-m91-billing-and-entitlements.md)

### M92 — Human Approval، Review Queue و Escalation

approval request، assignment، human decision، separation of duties و escalation.

**وضعیت:** `designed_only` از نظر integration. `src/core/approval-review-runtime.ts` فقط request/review/decision/escalation gate دارد؛ approval UI، directory، notification، signature و case-management واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/116-phase-m92-approval-review-and-escalation.md`](./116-phase-m92-approval-review-and-escalation.md)

### M93 — Deployment Operations، Environment Promotion و Self-host

adapter، environment promotion، smoke/migration evidence، backup و no-clobber self-host config.

**وضعیت:** `designed_only` از نظر integration. `src/core/deployment-operations-runtime.ts` فقط adapter/promotion/migration/self-host contract دارد؛ registry، cloud deployment، Helm، migration executor و self-host installer واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/117-phase-m93-deployment-operations-and-self-host.md`](./117-phase-m93-deployment-operations-and-self-host.md)

### M94 — Retrieval، Semantic Memory و Human Feedback

semantic memory، governed retrieval، quality evidence و feedback/invalidation.

**وضعیت:** `designed_only` از نظر integration. `src/core/retrieval-memory-runtime.ts` فقط memory/retrieval/quality/feedback contract دارد؛ embedding، vector store، RAG worker، feedback UI و memory database واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/118-phase-m94-retrieval-memory-and-feedback.md`](./118-phase-m94-retrieval-memory-and-feedback.md)

### M95 — Supply-chain، Artifact Provenance و Injection Security

dependency، SBOM/provenance/signature، secret lease و injection guard.

**وضعیت:** `designed_only` از نظر integration. `src/core/supply-chain-security-runtime.ts` فقط dependency/artifact/lease/injection gate دارد؛ scanner، registry، signer/KMS، Vault، DLP و sandbox واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/119-phase-m95-supply-chain-and-injection-security.md`](./119-phase-m95-supply-chain-and-injection-security.md)

### M96 — Browser Automation، External Signals و Webhook Delivery

browser session، bounded harvesting، source trust، signed webhook و replay guard.

**وضعیت:** `designed_only` از نظر integration. `src/core/browser-signal-delivery-runtime.ts` فقط browser/signal/webhook/replay contract دارد؛ browser runner، harvester، delivery queue، webhook server و dedupe store واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/120-phase-m96-browser-signal-and-webhook-delivery.md`](./120-phase-m96-browser-signal-and-webhook-delivery.md)

### M97 — Localization، RTL Accessibility و Degraded Clients

locale catalog، Persian RTL، accessibility و offline/read-only/local-only client policy.

**وضعیت:** `designed_only` از نظر integration. `src/core/localization-client-runtime.ts` فقط catalog/degraded/a11y/offline mutation gate دارد؛ UI، PWA/Tauri، service worker، screen-reader runner و sync engine واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/121-phase-m97-localization-and-degraded-clients.md`](./121-phase-m97-localization-and-degraded-clients.md)

### M98 — Project Templates، Workspace Bootstrap و Handoff

template، no-clobber bootstrap، context/diff/test handoff و collaboration comments.

**وضعیت:** `designed_only` از نظر integration. `src/core/workspace-bootstrap-runtime.ts` فقط template/bootstrap/handoff/comment contract دارد؛ generator، filesystem/worktree، Forge CLI، seed، sync و collaboration UI واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/122-phase-m98-workspace-bootstrap-and-handoff.md`](./122-phase-m98-workspace-bootstrap-and-handoff.md)

### M99 — Agent Delegation، Structured Streaming و Tool Safety

delegation contract، bounded structured-output repair، stream resume و tool-target safety.

**وضعیت:** `designed_only` از نظر integration. `src/core/agent-delegation-stream-runtime.ts` فقط delegation/stream/tool gate دارد؛ provider stream، parser، API gateway و sandbox واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/123-phase-m99-agent-delegation-and-streaming.md`](./123-phase-m99-agent-delegation-and-streaming.md)

### M100 — Durable Workflow، Queue و Scheduling

trigger، durable job envelope، worker lease، retry، DLQ و idempotency.

**وضعیت:** `designed_only` از نظر integration. `src/core/workflow-queue-runtime.ts` فقط trigger/job/retry/DLQ contract دارد؛ scheduler، queue store، consumer، outbox و crash recovery واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/124-phase-m100-workflow-queue-and-scheduling.md`](./124-phase-m100-workflow-queue-and-scheduling.md)

### M101 — Connector Platform، OAuth/PKCE و GitHub App Gates

OAuth/PKCE، consent/scope، GitHub App installation، read-only adapter و rate-limit.

**وضعیت:** `designed_only` از نظر integration. `src/core/connector-platform-runtime.ts` فقط connection/installation/operation/quota gate دارد؛ OAuth server، token broker، GitHub App، MCP/database adapter و quota store واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/125-phase-m101-connectors-and-platform-gates.md`](./125-phase-m101-connectors-and-platform-gates.md)

### M102 — Privacy Lifecycle، Retention و Tenant Boundary

retention، erasure/export، legal hold، tenant isolation probe و output privacy filter.

**وضعیت:** `designed_only` از نظر integration. `src/core/privacy-retention-runtime.ts` فقط privacy/retention/isolation/output contract دارد؛ KMS، RLS deployment، object deletion، DSAR service و DLP scanner واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/126-phase-m102-privacy-retention-and-tenant-boundary.md`](./126-phase-m102-privacy-retention-and-tenant-boundary.md)

### M103 — Evaluation Harness، E2E و Release Quality

dataset provenance، replayable evaluation، regression gate و E2E release evidence.

**وضعیت:** `designed_only` از نظر integration. `src/core/evaluation-quality-runtime.ts` فقط dataset/run/regression/E2E gate دارد؛ evaluator runner، benchmark corpus، CI، browser E2E و release promotion واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/127-phase-m103-evaluation-and-release-quality.md`](./127-phase-m103-evaluation-and-release-quality.md)

### M104 — API Contracts، Versioning و Stream Reconnect

versioned API، error taxonomy، SSE cursor/replay و rate-limit evidence.

**وضعیت:** `designed_only` از نظر integration. `src/core/api-contract-runtime.ts` فقط API/version/error/reconnect/limit contract دارد؛ OpenAPI/tRPC server، SSE broker، cursor store و gateway واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/128-phase-m104-api-contracts-and-stream-reconnect.md`](./128-phase-m104-api-contracts-and-stream-reconnect.md)

### M105 — Identity، Membership و MFA Boundary

session lifecycle، invitation، role transition، MFA و deprovision evidence.

**وضعیت:** `designed_only` از نظر integration. `src/core/identity-membership-runtime.ts` فقط session/invitation/role/MFA gate دارد؛ OIDC/SAML، passkey/TOTP store، directory و membership UI واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/129-phase-m105-identity-and-membership.md`](./129-phase-m105-identity-and-membership.md)

### M106 — Artifact Lifecycle، Preview و Signed Delivery

artifact provenance، preview isolation، signed URL، retention و rollback evidence.

**وضعیت:** `designed_only` از نظر integration. `src/core/artifact-preview-delivery-runtime.ts` فقط artifact/preview/delivery/rollback contract دارد؛ object store، preview router، TLS provisioner، signed URL service و deploy adapter واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/130-phase-m106-artifact-preview-and-delivery.md`](./130-phase-m106-artifact-preview-and-delivery.md)

### M107 — Observability، SLO، Incident Command و FinOps

telemetry، SLO/error budget، incident runbook و cost reconciliation.

**وضعیت:** `designed_only` از نظر integration. `src/core/observability-finops-runtime.ts` فقط telemetry/SLO/incident/cost gate دارد؛ collector، tracing backend، alert manager، on-call و provider billing API واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/131-phase-m107-observability-and-finops.md`](./131-phase-m107-observability-and-finops.md)

### M108 — Self-host، Backup/Restore و Controlled Cutover

self-host package، encrypted restore، canary، rollback و bounded chaos.

**وضعیت:** `designed_only` از نظر integration. `src/core/release-cutover-runtime.ts` فقط package/restore/cutover/chaos contract دارد؛ installer، CI، backup store، traffic switch، rollback automation و chaos runner واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/132-phase-m108-self-host-and-controlled-cutover.md`](./132-phase-m108-self-host-and-controlled-cutover.md)

### M109 — Context Assembly و Repository Intelligence

repository snapshot/index، context assembly، token budget و citation quality.

**وضعیت:** `designed_only` از نظر integration. `src/core/context-assembly-runtime.ts` فقط source/index/assembly/quality contract دارد؛ indexer، vector store، ACL query و context packer واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/133-phase-m109-context-assembly-and-repository-intelligence.md`](./133-phase-m109-context-assembly-and-repository-intelligence.md)

### M110 — Model Discovery، AI Directory و Free API Verification

model candidate، model card، free endpoint probe، ToS/quota و activation fallback.

**وضعیت:** `designed_only` از نظر integration. `src/core/model-discovery-directory-runtime.ts` فقط candidate/endpoint/catalog/activation gate دارد؛ harvester، directory، provider health و credential broker واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/134-phase-m110-model-discovery-and-ai-directory.md`](./134-phase-m110-model-discovery-and-ai-directory.md)

### M111 — Plugin Marketplace و Extension Trust

plugin manifest، permissions، attestation، sandbox installation و invocation.

**وضعیت:** `designed_only` از نظر integration. `src/core/plugin-marketplace-runtime.ts` فقط manifest/attestation/install/invocation contract دارد؛ registry، verifier، sandbox و marketplace UI واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/135-phase-m111-plugin-marketplace-and-extension-trust.md`](./135-phase-m111-plugin-marketplace-and-extension-trust.md)

### M112 — Product Collaboration، Onboarding و Notifications

onboarding، notification، approval surface و collaborative Run.

**وضعیت:** `designed_only` از نظر integration. `src/core/product-collaboration-runtime.ts` فقط onboarding/notification/approval/collaboration gate دارد؛ Web UI، delivery queue، realtime store و approval client واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/136-phase-m112-product-collaboration-and-onboarding.md`](./136-phase-m112-product-collaboration-and-onboarding.md)

### M113 — Data Plane، Event Store، Search و Analytics

seed fixture، append-only event، governed search و analytics evidence.

**وضعیت:** `designed_only` از نظر integration. `src/core/data-plane-analytics-runtime.ts` فقط seed/event/search/analytics contract دارد؛ migration، RLS، event store، full-text index و analytics pipeline واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/137-phase-m113-data-plane-and-analytics.md`](./137-phase-m113-data-plane-and-analytics.md)

### M114 — Legal، Licensing، Disclosure و Output Rights

policy، output rights، provider terms، attribution و vulnerability disclosure.

**وضعیت:** `designed_only` از نظر integration. `src/core/legal-disclosure-runtime.ts` فقط policy/output/provider/disclosure contract دارد؛ legal review workflow، license scanner و disclosure portal واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/138-phase-m114-legal-disclosure-and-output-rights.md`](./138-phase-m114-legal-disclosure-and-output-rights.md)

### M115 — Provider Routing، Quota و Economics

provider offer، privacy-aware route، quota/cooldown، fallback و cost evidence.

**وضعیت:** `designed_only` از نظر integration. `src/core/provider-routing-economics-runtime.ts` فقط offer/route/quota/outcome gate دارد؛ provider adapters، health/quota probe و routing service واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/139-phase-m115-provider-routing-and-economics.md`](./139-phase-m115-provider-routing-and-economics.md)

### M116 — Platform Sync، Conflict Resolution و Connection Health

sync connection، cursor/dedupe، conflict review و fallback health.

**وضعیت:** `designed_only` از نظر integration. `src/core/platform-sync-health-runtime.ts` فقط connection/cursor/conflict/health contract دارد؛ sync worker، outbox، persistent cursor و conflict UI واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/140-phase-m116-platform-sync-and-health.md`](./140-phase-m116-platform-sync-and-health.md)

### M117 — Abuse Prevention، DLP و Safety Governance

abuse score/action، DLP، malware/spam guard و prohibited activity boundary.

**وضعیت:** `designed_only` از نظر integration. `src/core/abuse-safety-runtime.ts` فقط abuse/policy/DLP/activity gate دارد؛ classifier، moderation، DLP scanner، malware sandbox و abuse workflow واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/141-phase-m117-abuse-safety-and-dlp.md`](./141-phase-m117-abuse-safety-and-dlp.md)

### M118 — Production Evidence، Readiness و Cross-phase Cutover

evidence layer، readiness، canary، rollback و cutover gate.

**وضعیت:** `designed_only` از نظر integration. `src/core/production-evidence-runtime.ts` فقط evidence/readiness/canary/cutover contract دارد؛ CI/CD، evidence store، traffic switch، production monitor و deployment orchestrator واقعی هنوز وجود ندارد.

طراحی تفصیلی: [`docs/142-phase-m118-production-evidence-and-cutover.md`](./142-phase-m118-production-evidence-and-cutover.md)

### M119 — Durable Tenant Transactions، RLS و Transactional Outbox

transaction tenant-bound، RLS denial evidence، migration safety و outbox transactional. وضعیت: `designed_only`.

طراحی: [`docs/143-phase-m119-durable-tenant-and-transaction-runtime.md`](./143-phase-m119-durable-tenant-and-transaction-runtime.md)

### M120 — Verification Matrix، CI، Security، Accessibility و Load Evidence

verification reproducible، CI artifact، security findings، accessibility/RTL و load evidence. وضعیت: `designed_only`.

طراحی: [`docs/144-phase-m120-verification-ci-security-accessibility.md`](./144-phase-m120-verification-ci-security-accessibility.md)

### M121 — SDK/API Compatibility، Safe CLI و Developer Handoff

versioning، command safety، config bootstrap و handoff با Local-first/BYOK. وضعیت: `designed_only`.

طراحی: [`docs/145-phase-m121-sdk-cli-config-developer-handoff.md`](./145-phase-m121-sdk-cli-config-developer-handoff.md)

### M122 — Key Rotation، Privacy Erasure و Backup Retention

key lifecycle، deletion propagation، immutable proof و retention/restore. وضعیت: `designed_only`.

طراحی: [`docs/146-phase-m122-key-rotation-erasure-deletion-proof-backup.md`](./146-phase-m122-key-rotation-erasure-deletion-proof-backup.md)

### M123 — Capacity، Circuit Breaker و Resilience Operations

capacity planning، bounded failure injection، breaker و actionable alerts. وضعیت: `designed_only`.

طراحی: [`docs/147-phase-m123-capacity-circuit-breaker-resilience.md`](./147-phase-m123-capacity-circuit-breaker-resilience.md)

### M124 — Audit Evidence Ledger، Provenance و Replay

immutable audit، evidence provenance، tenant-bounded replay و retention. وضعیت: `designed_only`.

طراحی: [`docs/148-phase-m124-audit-evidence-ledger-and-replay.md`](./148-phase-m124-audit-evidence-ledger-and-replay.md)

### M125 — Identity Continuity، Session Revocation و MFA Recovery

session lifecycle، membership delegation، role safety و recovery. وضعیت: `designed_only`.

طراحی: [`docs/149-phase-m125-identity-continuity-session-revocation.md`](./149-phase-m125-identity-continuity-session-revocation.md)

### M126 — Connector Consent، Signed Webhook و Reconciliation

consent، webhook، dedupe/cursor، conflict و connector action safety. وضعیت: `designed_only`.

طراحی: [`docs/150-phase-m126-connector-consent-webhook-reconciliation.md`](./150-phase-m126-connector-consent-webhook-reconciliation.md)

### M127 — Benchmark Corpus، Deterministic Replay و Release Quality

corpus governance، replay، regression gate، E2E و rollback evidence. وضعیت: `designed_only`.

طراحی: [`docs/151-phase-m127-benchmark-replay-release-quality.md`](./151-phase-m127-benchmark-replay-release-quality.md)

### M128 — FinOps، Usage Ledger، Quota Scheduling و Provider Allocation

append-only usage، quota preflight، provider allocation و cost reconciliation. وضعیت: `designed_only`.

طراحی: [`docs/152-phase-m128-finops-quota-and-provider-allocation.md`](./152-phase-m128-finops-quota-and-provider-allocation.md)

### M129 — API Evolution، Schema Migration و Stream Reconnect

versioning، error contract، stream cursor و migration compatibility. وضعیت: `designed_only`.

طراحی: [`docs/153-phase-m129-api-evolution-stream-reconnect.md`](./153-phase-m129-api-evolution-stream-reconnect.md)

### M130 — Artifact Supply Chain، SBOM و Attestation

artifact admission، dependency trust، secret lease و egress. وضعیت: `designed_only`.

طراحی: [`docs/154-phase-m130-artifact-supply-chain-and-attestation.md`](./154-phase-m130-artifact-supply-chain-and-attestation.md)

### M131 — Approval Operations، Human Review و Escalation

approval queue، reviewer، signed decision و escalation. وضعیت: `designed_only`.

طراحی: [`docs/155-phase-m131-approval-operations-and-escalation.md`](./155-phase-m131-approval-operations-and-escalation.md)

### M132 — Knowledge ACL، Freshness و Context Lineage

trusted source، ACL context، freshness، lineage و index. وضعیت: `designed_only`.

طراحی: [`docs/156-phase-m132-knowledge-freshness-and-context-lineage.md`](./156-phase-m132-knowledge-freshness-and-context-lineage.md)

### M133 — Self-host Upgrade، Backup Restore و Controlled Cutover

release package، restore، canary، rollback و resilience drill. وضعیت: `designed_only`.

طراحی: [`docs/157-phase-m133-self-host-upgrade-and-controlled-cutover.md`](./157-phase-m133-self-host-upgrade-and-controlled-cutover.md)

### M134 — Data Portability و Controlled Import

portable manifest، redaction، dry-run، conflict و rollback. وضعیت: `designed_only`.

طراحی: [`docs/158-phase-m134-data-portability-and-controlled-import.md`](./158-phase-m134-data-portability-and-controlled-import.md)

### M135 — Device Pairing و Local Trust

device identity، pairing challenge، scoped grant و revocation. وضعیت: `designed_only`.

طراحی: [`docs/159-phase-m135-device-pairing-and-local-trust.md`](./159-phase-m135-device-pairing-and-local-trust.md)

### M136 — Policy Distribution و Configuration Drift

signed bundle، enforcement، drift و exception. وضعیت: `designed_only`.

طراحی: [`docs/160-phase-m136-policy-distribution-and-drift.md`](./160-phase-m136-policy-distribution-and-drift.md)

### M137 — Incident Case، Containment و Postmortem

signal، case، bounded containment و learning loop. وضعیت: `designed_only`.

طراحی: [`docs/161-phase-m137-incident-case-and-containment.md`](./161-phase-m137-incident-case-and-containment.md)

### M138 — Privacy-preserving Telemetry و Feedback

consent، sampling، redaction، feedback و retention. وضعیت: `designed_only`.

طراحی: [`docs/162-phase-m138-privacy-preserving-telemetry-and-feedback.md`](./162-phase-m138-privacy-preserving-telemetry-and-feedback.md)

### M139 — Observability SLO و Trace Integrity

SLO، error budget، distributed trace و alert routing. وضعیت: `designed_only`.

طراحی: [`docs/163-phase-m139-observability-slo-and-trace-integrity.md`](./163-phase-m139-observability-slo-and-trace-integrity.md)

### M140 — Full-text Search و Query Governance

ACL index، bounded query، result integrity و export audit. وضعیت: `designed_only`.

طراحی: [`docs/164-phase-m140-search-query-governance.md`](./164-phase-m140-search-query-governance.md)

### M141 — Workflow Scheduler و Trigger Runtime

schedule، trigger، dedupe، lease و concurrency. وضعیت: `designed_only`.

طراحی: [`docs/165-phase-m141-workflow-scheduler-and-triggers.md`](./165-phase-m141-workflow-scheduler-and-triggers.md)

### M142 — Artifact Lifecycle و Preview Isolation

artifact retention، safe preview، signed delivery و cleanup. وضعیت: `designed_only`.

طراحی: [`docs/166-phase-m142-artifact-lifecycle-and-preview-isolation.md`](./166-phase-m142-artifact-lifecycle-and-preview-isolation.md)

### M143 — Operator Console و Live Run UX

redacted view، live event، safe action و accessibility evidence. وضعیت: `designed_only`.

طراحی: [`docs/167-phase-m143-operator-console-and-live-run-ux.md`](./167-phase-m143-operator-console-and-live-run-ux.md)

### M144 — Public API Surface و OpenAPI Compatibility

OpenAPI document، endpoint contract، compatibility و request admission. وضعیت: `designed_only`.

طراحی: [`docs/168-phase-m144-public-api-surface-and-openapi.md`](./168-phase-m144-public-api-surface-and-openapi.md)

### M145 — Connector SDK و OAuth/PKCE Lifecycle

manifest، OAuth، token lease و signed webhook. وضعیت: `designed_only`.

طراحی: [`docs/169-phase-m145-connector-sdk-oauth-lifecycle.md`](./169-phase-m145-connector-sdk-oauth-lifecycle.md)

### M146 — Workspace VFS و Sandbox Resource Boundary

snapshot، path guard، budget، diff و rollback. وضعیت: `designed_only`.

طراحی: [`docs/170-phase-m146-workspace-vfs-and-sandbox-boundary.md`](./170-phase-m146-workspace-vfs-and-sandbox-boundary.md)

### M147 — Tenant Isolation و RLS Proof

RLS policy، cross-tenant probe، access و proof bundle. وضعیت: `designed_only`.

طراحی: [`docs/171-phase-m147-tenant-isolation-and-rls-proof.md`](./171-phase-m147-tenant-isolation-and-rls-proof.md)

### M148 — E2E Release Acceptance و Readiness

acceptance plan، deterministic gates، go/no-go و readiness review. وضعیت: `designed_only`.

طراحی: [`docs/172-phase-m148-e2e-release-acceptance-and-readiness.md`](./172-phase-m148-e2e-release-acceptance-and-readiness.md)

### M149 — Durable Worker Queue، Retry و DLQ

job envelope، queue policy، lease، retry و DLQ replay. وضعیت: `designed_only`.

طراحی: [`docs/173-phase-m149-worker-queue-retry-and-dlq.md`](./173-phase-m149-worker-queue-retry-and-dlq.md)

### M150 — Database Migration و Schema Governance

expand/contract، schema change، migration run، RLS و rollback. وضعیت: `designed_only`.

طراحی: [`docs/174-phase-m150-database-migration-and-schema-governance.md`](./174-phase-m150-database-migration-and-schema-governance.md)

### M151 — GitHub App و Webhook/Action Integration

installation، token lease، webhook و repository action. وضعیت: `designed_only`.

طراحی: [`docs/175-phase-m151-github-app-and-webhook-action.md`](./175-phase-m151-github-app-and-webhook-action.md)

### M152 — Preview Environment و Deployment Routing

environment، port lease، route، TLS و deployment target. وضعیت: `designed_only`.

طراحی: [`docs/176-phase-m152-preview-environment-and-routing.md`](./176-phase-m152-preview-environment-and-routing.md)

### M153 — Product E2E Orchestration و Failure Containment

flow plan، step evidence، cleanup، failure و bounded retry. وضعیت: `designed_only`.

طراحی: [`docs/177-phase-m153-product-e2e-orchestration-and-containment.md`](./177-phase-m153-product-e2e-orchestration-and-containment.md)

### M159 — Data Residency و Regional Routing

classification، placement، cross-border transfer و replica deletion proof. وضعیت: `designed_only`.

طراحی: [`docs/178-phase-m159-data-residency-and-regional-routing.md`](./178-phase-m159-data-residency-and-regional-routing.md)

### M160 — Feature Flags و Progressive Rollout

flag lifecycle، cohort، canary، SLO guardrail و kill switch. وضعیت: `designed_only`.

طراحی: [`docs/179-phase-m160-feature-flags-and-progressive-rollout.md`](./179-phase-m160-feature-flags-and-progressive-rollout.md)

### M161 — Workload Identity و Service-account Leases

issuer proof، least privilege، short lease، rotation و revoke. وضعیت: `designed_only`.

طراحی: [`docs/180-phase-m161-workload-identity-and-service-account-leases.md`](./180-phase-m161-workload-identity-and-service-account-leases.md)

### M162 — Data Rights، Export و Deletion Orchestration

identity proof، encrypted export، legal hold و residual deletion proof. وضعیت: `designed_only`.

طراحی: [`docs/181-phase-m162-data-rights-export-and-deletion.md`](./181-phase-m162-data-rights-export-and-deletion.md)

### M163 — FinOps Budget Guardrails و Usage Reconciliation

budget، reservation، provider receipt، hard stop و circuit guardrail. وضعیت: `designed_only`.

طراحی: [`docs/182-phase-m163-finops-budget-guardrails-and-reconciliation.md`](./182-phase-m163-finops-budget-guardrails-and-reconciliation.md)

### M164 — Structured Output Repair و Response Safety

output contract، bounded repair، refusal، redaction و safety scan. وضعیت: `designed_only`.

طراحی: [`docs/183-phase-m164-structured-output-repair-and-response-safety.md`](./183-phase-m164-structured-output-repair-and-response-safety.md)

### M165 — Agent Delegation و Capability Tokens

delegation، capability token، no escalation، result و revoke. وضعیت: `designed_only`.

طراحی: [`docs/184-phase-m165-agent-delegation-and-capability-tokens.md`](./184-phase-m165-agent-delegation-and-capability-tokens.md)

### M166 — Cancellation و Compensation Runtime

cancel request، checkpoint، lease revoke، compensation و cleanup. وضعیت: `designed_only`.

طراحی: [`docs/185-phase-m166-cancellation-and-compensation-runtime.md`](./185-phase-m166-cancellation-and-compensation-runtime.md)

### M167 — Reproducible Build و Release Manifest

hermetic build، SBOM، provenance، scan، rollback و promotion. وضعیت: `designed_only`.

طراحی: [`docs/186-phase-m167-reproducible-build-and-release-manifest.md`](./186-phase-m167-reproducible-build-and-release-manifest.md)

### M168 — Outbound Webhook و Callback Delivery

endpoint، signature، delivery retry، DLQ و bounded replay. وضعیت: `designed_only`.

طراحی: [`docs/187-phase-m168-outbound-webhook-and-callback-delivery.md`](./187-phase-m168-outbound-webhook-and-callback-delivery.md)

### M169 — Context Provenance و Prompt-injection Firewall

context envelope، source trust، freshness، citation و injection scan. وضعیت: `designed_only`.

طراحی: [`docs/188-phase-m169-context-provenance-and-injection-firewall.md`](./188-phase-m169-context-provenance-and-injection-firewall.md)

### M170 — Tool Action Boundary و Transactional Approval

action plan، precondition، approval، protected target و commit evidence. وضعیت: `designed_only`.

طراحی: [`docs/189-phase-m170-tool-action-boundary-and-transactional-approval.md`](./189-phase-m170-tool-action-boundary-and-transactional-approval.md)

### M171 — Offline Sync و Conflict Resolution

snapshot، cursor sync، conflict، no-clobber و degraded client. وضعیت: `designed_only`.

طراحی: [`docs/190-phase-m171-offline-sync-and-conflict-resolution.md`](./190-phase-m171-offline-sync-and-conflict-resolution.md)

### M172 — Accessibility و Localization Verification

locale catalog، RTL، WCAG AA، browser evidence و CI gate. وضعیت: `designed_only`.

طراحی: [`docs/191-phase-m172-accessibility-and-localization-verification.md`](./191-phase-m172-accessibility-and-localization-verification.md)

### M173 — Incident Learning و Runbook Automation

signal، case، containment، runbook و corrective learning. وضعیت: `designed_only`.

طراحی: [`docs/192-phase-m173-incident-learning-and-runbook-automation.md`](./192-phase-m173-incident-learning-and-runbook-automation.md)

### M174 — Prompt Experimentation و Rollback

variant، deterministic assignment، metric evidence، holdout و rollback approval. وضعیت: `designed_only`.

طراحی: [`docs/193-phase-m174-prompt-experimentation-and-rollback.md`](./193-phase-m174-prompt-experimentation-and-rollback.md)

### M175 — Multi-model Consensus و Voting

panel مستقل، quorum، strict threshold، evidence و tie-break. وضعیت: `designed_only`.

طراحی: [`docs/194-phase-m175-multi-model-consensus-and-voting.md`](./194-phase-m175-multi-model-consensus-and-voting.md)

### M176 — Agent-to-agent Protocol و Interoperability

manifest، capability، signed message، typed response و bounded handoff. وضعیت: `designed_only`.

طراحی: [`docs/195-phase-m176-agent-to-agent-protocol-and-interoperability.md`](./195-phase-m176-agent-to-agent-protocol-and-interoperability.md)

### M177 — Prompt Cache Integrity و Privacy

hash tuple، tenant namespace، encryption، poisoning scan، expiry و purge evidence. وضعیت: `designed_only`.

طراحی: [`docs/196-phase-m177-prompt-cache-integrity-and-privacy.md`](./196-phase-m177-prompt-cache-integrity-and-privacy.md)

### M178 — Deployment Adapter و Release Target Boundary

adapter request، target policy، preflight، smoke evidence و bounded rollback. وضعیت: `designed_only`.

طراحی: [`docs/197-phase-m178-deployment-adapter-and-release-target-boundary.md`](./197-phase-m178-deployment-adapter-and-release-target-boundary.md)

### M179 — Pull-request Quality و Commit Provenance

commit provenance، PR summary، test/risk evidence، merge guard و changelog. وضعیت: `designed_only`.

طراحی: [`docs/198-phase-m179-pull-request-quality-and-commit-provenance.md`](./198-phase-m179-pull-request-quality-and-commit-provenance.md)

### M180 — Agent Graph Orchestration و Durable Checkpoints

acyclic graph، bounded task، lease، idempotency، checkpoint و typed transition. وضعیت: `designed_only`.

طراحی: [`docs/199-phase-m180-agent-graph-orchestration-and-checkpoints.md`](./199-phase-m180-agent-graph-orchestration-and-checkpoints.md)

### M181 — Performance Budget و Load Shedding

latency/queue/token/concurrency budget، admission، degrade، shed و load evidence. وضعیت: `designed_only`.

طراحی: [`docs/200-phase-m181-performance-budget-and-load-shedding.md`](./200-phase-m181-performance-budget-and-load-shedding.md)

### M182 — Onboarding و Safe First Run

consent، compute mode، synthetic fixture، sandbox، budget، progress و fallback disclosure. وضعیت: `designed_only`.

طراحی: [`docs/201-phase-m182-onboarding-and-safe-first-run.md`](./201-phase-m182-onboarding-and-safe-first-run.md)

### M183 — Service Entitlement، SLA و Degraded Disclosure

capability/quota entitlement، SLA evidence، cost admission و honest degraded disclosure. وضعیت: `designed_only`.

طراحی: [`docs/202-phase-m183-service-entitlement-sla-and-degraded-disclosure.md`](./202-phase-m183-service-entitlement-sla-and-degraded-disclosure.md)

### M184 — Graph Engine Compatibility و State Interop

adapter manifest، graph/state hash، state handoff، node binding، checkpoint و replay compatibility. وضعیت: `designed_only`.

طراحی: [`docs/203-phase-m184-graph-engine-compatibility-and-state-interop.md`](./203-phase-m184-graph-engine-compatibility-and-state-interop.md)

### M185 — Repository Intelligence و Retrieval Evidence

commit-bound snapshot، exact retrieval، ACL، path allowlist، code evidence و deletion refresh. وضعیت: `designed_only`.

طراحی: [`docs/204-phase-m185-repository-intelligence-and-retrieval-evidence.md`](./204-phase-m185-repository-intelligence-and-retrieval-evidence.md)

### M186 — Human Feedback و Preference Governance

consent، rubric، privacy/bias review، bounded aggregate، canary، rollback و disclosure. وضعیت: `designed_only`.

طراحی: [`docs/205-phase-m186-human-feedback-and-preference-governance.md`](./205-phase-m186-human-feedback-and-preference-governance.md)

### M187 — Dependency Risk و Vulnerability Response

digest/lock، license، advisory، fixed version، patch، quarantine و rollback. وضعیت: `designed_only`.

طراحی: [`docs/206-phase-m187-dependency-risk-and-vulnerability-response.md`](./206-phase-m187-dependency-risk-and-vulnerability-response.md)

### M188 — Schema Evolution و Consumer Compatibility

versioned schema، expand-contract migration، consumer proof، bounded cutover و rollback. وضعیت: `designed_only`.

طراحی: [`docs/207-phase-m188-schema-evolution-and-consumer-compatibility.md`](./207-phase-m188-schema-evolution-and-consumer-compatibility.md)

### M189 — Release Provenance و Promotion Evidence

artifact/source/build hash، SBOM، attestation، reproducibility، canary، promotion و rollback. وضعیت: `designed_only`.

طراحی: [`docs/208-phase-m189-release-provenance-and-promotion-evidence.md`](./208-phase-m189-release-provenance-and-promotion-evidence.md)

### M190 — Egress Policy و Destination Governance

destination policy، data class، DNS/TLS، DLP، consent، credential lease و network evidence. وضعیت: `designed_only`.

طراحی: [`docs/209-phase-m190-egress-policy-and-destination-governance.md`](./209-phase-m190-egress-policy-and-destination-governance.md)

### M191 — Retention، Legal Hold و Secure Erasure

retention، encryption، replica/backup purge، legal hold، idempotency و residual verification. وضعیت: `designed_only`.

طراحی: [`docs/210-phase-m191-retention-legal-hold-and-secure-erasure.md`](./210-phase-m191-retention-legal-hold-and-secure-erasure.md)

### M192 — Recovery، Chaos و Failover Evidence

bounded chaos، RTO/RPO، checkpoint، fencing، quorum، restore و replay proof. وضعیت: `designed_only`.

طراحی: [`docs/211-phase-m192-recovery-chaos-and-failover-evidence.md`](./211-phase-m192-recovery-chaos-and-failover-evidence.md)

### M193 — Tenant Fairness و Queue Scheduling

quota، max share، starvation bound، allocation lease، preemption و fairness evidence. وضعیت: `designed_only`.

طراحی: [`docs/212-phase-m193-tenant-fairness-and-queue-scheduling.md`](./212-phase-m193-tenant-fairness-and-queue-scheduling.md)

### M194 — Runtime Evidence Envelope و Claim Verification

evidence envelope، claim verification، contradiction، freshness، replay و honest disclosure. وضعیت: `designed_only`.

طراحی: [`docs/213-phase-m194-runtime-evidence-envelope-and-claim-verification.md`](./213-phase-m194-runtime-evidence-envelope-and-claim-verification.md)

### M195 — Provider Health و Circuit Recovery

provider health، quota، circuit، cooldown، probe، route admission و fallback disclosure. وضعیت: `designed_only`.

طراحی: [`docs/214-phase-m195-provider-health-and-circuit-recovery.md`](./214-phase-m195-provider-health-and-circuit-recovery.md)

### M196 — Plugin Capability Sandbox و Extension Certification

plugin manifest، permission، signature، sandbox، scanner، certification و revocation. وضعیت: `designed_only`.

طراحی: [`docs/215-phase-m196-plugin-capability-sandbox-and-extension-certification.md`](./215-phase-m196-plugin-capability-sandbox-and-extension-certification.md)

### M197 — Notification Delivery و Preference Governance

notification intent، consent، preference، dedupe، TTL، delivery evidence و escalation. وضعیت: `designed_only`.

طراحی: [`docs/216-phase-m197-notification-delivery-and-preference-governance.md`](./216-phase-m197-notification-delivery-and-preference-governance.md)

### M198 — Model Catalog Freshness و Capability Disclosure

model card، discovery provenance، freshness، capability activation، fallback و retirement. وضعیت: `designed_only`.

طراحی: [`docs/217-phase-m198-model-catalog-freshness-and-capability-disclosure.md`](./217-phase-m198-model-catalog-freshness-and-capability-disclosure.md)

### M199 — Intent Normalization و Scope Freeze

intent، constraints، target/tool scope، plan contract، immutable freeze و approved change request. وضعیت: `designed_only`.

طراحی: [`docs/218-phase-m199-intent-normalization-and-scope-freeze.md`](./218-phase-m199-intent-normalization-and-scope-freeze.md)

### M200 — Side-effect Journal و Idempotent Commit

operation journal، idempotency، precondition، atomic commit، receipt، no-duplicate و compensation. وضعیت: `designed_only`.

طراحی: [`docs/219-phase-m200-side-effect-journal-and-idempotent-commit.md`](./219-phase-m200-side-effect-journal-and-idempotent-commit.md)

### M201 — Connector Reconciliation و Drift Repair

snapshot، cursor، revisions، bidirectional conflict، no-clobber، reconciliation و drift evidence. وضعیت: `designed_only`.

طراحی: [`docs/220-phase-m201-connector-reconciliation-and-drift-repair.md`](./220-phase-m201-connector-reconciliation-and-drift-repair.md)

### M202 — Approval Integrity و Decision Expiry

signed human decision، evidence/policy match، expiry، self-approval، revocation و escalation. وضعیت: `designed_only`.

طراحی: [`docs/221-phase-m202-approval-integrity-and-decision-expiry.md`](./221-phase-m202-approval-integrity-and-decision-expiry.md)

### M203 — Privacy-preserving Analytics و Aggregation

consent، sampling، privacy budget، noisy aggregate، k-anonymity، export disclosure و deletion propagation. وضعیت: `designed_only`.

طراحی: [`docs/222-phase-m203-privacy-preserving-analytics-and-aggregation.md`](./222-phase-m203-privacy-preserving-analytics-and-aggregation.md)

## ترتیب اجباری

M1 → M2 → M3 قبل از هر اتصال به سرویس بیرونی. این ترتیب قابل مذاکره نیست:
اتصال به GitHub بدون permission engine و sandbox یعنی سپردن دسترسی نوشتن یک
مخزن به یک سیستم بدون مرز.

## هزینه

### حالت Local-first (پیشنهادی برای شروع)

| جزء | ابزار | هزینه |
|---|---|---|
| مدل | Ollama روی ماشین کاربر | صفر API |
| دیتابیس | PostgreSQL | صفر |
| صف | Redis | صفر |
| Object Storage | MinIO | صفر |
| Sandbox | Docker | صفر |
| تست | Playwright، Vitest | صفر |
| Observability | OpenTelemetry، Prometheus | صفر |
| CI | GitHub Actions | سهمیه رایگان |
| Git | GitHub | سهمیه رایگان |

هزینه واقعی: سخت‌افزار کاربر (RAM و در صورت نیاز GPU) و زمان نگهداری.

### حالت Cloud Free Tier (تکمیلی)

| سرویس | کاربرد | محدودیت |
|---|---|---|
| Supabase | Auth، PostgreSQL، Storage | حجم و MAU |
| Cloudflare | Edge، webhook سبک | CPU time |
| Groq | استنتاج سریع | RPM/RPD |
| Hugging Face | مدل‌های باز | صف و تأخیر |
| Gemini API | مدل ابری | سهمیه و سیاست داده |

این‌ها برای **نمونه اولیه** مناسب‌اند، نه زیرساخت دائمی. سه خطر واقعی:

1. سهمیه تغییر می‌کند بدون اطلاع قبلی
2. پروژه کم‌استفاده خاموش می‌شود
3. سیاست استفاده از داده عوض می‌شود

پس سیستم باید سهمیه را بشمارد، fallback داشته باشد و وقتی سهمیه تمام شد بایستد و
بگوید چرا.

### حالت میزبانی‌شده

اگر محصول را به‌صورت SaaS ارائه می‌دهید، سه هزینه اجتناب‌ناپذیر دارید: اجرای
sandbox (CPU/RAM)، ذخیره‌سازی artifact، و استنتاج ابری. رایگان نگه‌داشتن این سه
در مقیاس ممکن نیست. مدل‌های ممکن:

- BYOK اجباری برای حالت رایگان
- محدودیت Run در ماه
- اجرای Local-only برای حالت رایگان
- پرداخت به‌مصرف برای حالت میزبانی‌شده

## حداقل سخت‌افزار برای حالت محلی

| سناریو | RAM | نتیجه |
|---|---|---|
| مدل ۷B کوانتیزه | ۸–۱۲ GB | قابل استفاده، کیفیت متوسط |
| مدل ۱۳–۱۴B کوانتیزه | ۱۶–۲۴ GB | خوب برای کارهای روزمره |
| مدل ۳۲B+ | ۳۲ GB+ یا GPU | نزدیک به کیفیت ابری |

محصول باید این را صادقانه نشان دهد و در صورت کم بودن منابع، حالت ترکیبی
(معماری محلی، کدنویسی ابری با رضایت) را پیشنهاد کند.

## ریسک‌های اجرایی

| ریسک | احتمال | اثر | کاهش |
|---|---|---|---|
| دامنه پروژه از کنترل خارج می‌شود | بالا | بالا | MVP فقط GitHub؛ غیرهدف‌های صریح |
| کیفیت مدل محلی کافی نیست | متوسط | متوسط | BYOK و حالت ترکیبی |
| ToS سرویس‌ها جلوی browser automation را می‌گیرد | بالا | متوسط | انسان در حلقه؛ اولویت با API رسمی |
| سهمیه رایگان تمام می‌شود | بالا | متوسط | حسابداری سهمیه و fallback |
| تغییر لایسنس یک وابستگی کلیدی | پایین | بالا | ثبت `commercialLicense` در manifest |
| نشتی secret کاربر | پایین | بحرانی | vault + redaction + عدم ذخیره رمز |
| حلقه بی‌نهایت ایجنت و مصرف سهمیه | متوسط | بالا | ماشین حالت + بودجه سخت |


## سری M204 تا M208

### M204 — Run Handoff و Human Takeover

pause/resume، checkpoint، human handoff، lease، replay safety و termination cleanup. وضعیت: `designed_only`.

طراحی: [`docs/223-phase-m204-run-handoff-and-human-takeover.md`](./223-phase-m204-run-handoff-and-human-takeover.md)

### M205 — Capability Attestation و Trust-bound Activation

attestation، artifact/environment match، permission scope، revocation و activation approval. وضعیت: `designed_only`.

طراحی: [`docs/224-phase-m205-capability-attestation-and-trust-bound-activation.md`](./224-phase-m205-capability-attestation-and-trust-bound-activation.md)

### M206 — Region-bound Processing و Residency Enforcement

region routing، provider declaration، transfer basis، encryption، minimization و regional deletion. وضعیت: `designed_only`.

طراحی: [`docs/225-phase-m206-region-bound-processing-and-residency-enforcement.md`](./225-phase-m206-region-bound-processing-and-residency-enforcement.md)

### M207 — Action Simulation و Blast-radius Preview

side-effect-free simulation، predicted diff، affected resources، precondition، approval و rollback. وضعیت: `designed_only`.

طراحی: [`docs/226-phase-m207-action-simulation-and-blast-radius-preview.md`](./226-phase-m207-action-simulation-and-blast-radius-preview.md)

### M208 — Policy Change Control و Rollback

policy diff، separation of duties، signed canary، expiry، propagation و rollback evidence. وضعیت: `designed_only`.

طراحی: [`docs/227-phase-m208-policy-change-control-and-rollback.md`](./227-phase-m208-policy-change-control-and-rollback.md)
