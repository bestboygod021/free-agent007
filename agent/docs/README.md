# نقشه مهندسی پلتفرم

مخزن حاضر سه چیز را با هم نگه می‌دارد: **سند طراحی**، **قراردادهای داده**، و
**هسته قطعی (deterministic core)** که رفتارهای بحرانی محصول را بدون وابستگی به
مدل زبانی تضمین می‌کند.

## اسناد

| سند | محتوا |
|---|---|
| [00-request-review.md](./00-request-review.md) | نقد درخواست اولیه، شکاف‌ها، تناقض‌ها |
| [01-product-definition.md](./01-product-definition.md) | تعریف محصول، دامنه، MVP، جریان کاربر |
| [02-roles-and-agents.md](./02-roles-and-agents.md) | تیم مجازی و مسئولیت هر ایجنت |
| [03-architecture.md](./03-architecture.md) | چهار صفحه معماری، ساختار مخزن، جریان داده |
| [04-agent-state-machine.md](./04-agent-state-machine.md) | ماشین حالت و شش invariant |
| [05-model-router.md](./05-model-router.md) | مسیریابی مدل، سهمیه، سیاست محرمانگی |
| [06-connectors-and-auth.md](./06-connectors-and-auth.md) | کانکتورها، OAuth، سطح‌بندی دسترسی |
| [07-sandbox-and-security.md](./07-sandbox-and-security.md) | سندباکس، multi-tenant، دفاع در برابر تزریق |
| [08-memory-and-context.md](./08-memory-and-context.md) | لایه‌های حافظه و ساخت context |
| [09-data-model.md](./09-data-model.md) | مدل داده و Prisma schema |
| [10-api-and-events.md](./10-api-and-events.md) | قرارداد API و واژگان رویدادها |
| [11-task-dag-and-scheduling.md](./11-task-dag-and-scheduling.md) | گراف تسک، قفل فایل، موازی‌سازی |
| [12-quality-and-dod.md](./12-quality-and-dod.md) | تست، ارزیابی، Definition of Done |
| [13-roadmap-and-cost.md](./13-roadmap-and-cost.md) | مایلستون‌ها، هزینه، مدل استقرار |
| [14-licensing-and-legal.md](./14-licensing-and-legal.md) | لایسنس ابزارها، n8n، حریم خصوصی |
| [15-compute-modes.md](./15-compute-modes.md) | سه حالت رایگان / پولی / لوکال و آنچه با هرکدام عوض می‌شود |
| [16-gap-analysis.md](./16-gap-analysis.md) | ممیزی کامل: چه چیزی طراحی شده ولی ساخته نشده (از روی `gap-register.json` تولید می‌شود) |
| [17-design-coverage.md](./17-design-coverage.md) | ممیزی پوشش طراحی: چه چیزی اصلاً طراحی نشده (۹۶ موضوع) |
| [18-free-provider-pool.md](./18-free-provider-pool.md) | استخر ارائه‌دهندگان رایگان: سهمیه آگاه از توکن، failover، گروه یکپارچه، sticky session |
| [19-security-standard.md](./19-security-standard.md) | استاندارد امنیتی پلتفرم: مدل تهدید STRIDE، ماتریس مجوزها، چهار قاعده غیرقابل مذاکره |
| [20-capability-evidence.md](./20-capability-evidence.md) | انتخاب مدل و ابزار بر پایه شواهد: لایه‌بندی اعتماد، سقف نفوذ سیگنال وب، canary |
| [21-canary-trials.md](./21-canary-trials.md) | حلقه canary: Thompson sampling، آزمون ترتیبی SPRT، McNemar، guardrailها |
| [22-upgrade-program.md](./22-upgrade-program.md) | طراحی سطح محصول و معیار پذیرش ۱۰۰ ارتقای جدید |
| [23-upgrade-contracts.md](./23-upgrade-contracts.md) | قرارداد ریزدانه هر ۱۰۰ پیشنهاد: هدف، مسئله، schema، محل، تهدید، تست و DoD |
| [24-phase-m1-durable-control-plane.md](./24-phase-m1-durable-control-plane.md) | طراحی فاز بعدی: PostgreSQL durable، RLS واقعی، Redis/BullMQ، Worker و Outbox |
| [25-phase-m2-repository-intelligence-and-github-loop.md](./25-phase-m2-repository-intelligence-and-github-loop.md) | طراحی M2: فهم repository، GitHub، worktree، patch، test runner و Draft PR |
| [26-phase-m3-sandbox-execution-and-security.md](./26-phase-m3-sandbox-execution-and-security.md) | طراحی M3: Sandbox، Execution Plane، permission ladder، egress، secrets و security hardening |
| [27-phase-m4-product-experience-observability-and-operations.md](./27-phase-m4-product-experience-observability-and-operations.md) | طراحی M4: Web App، SSE، Timeline، Approval UX، Cost، Observability و Self-host |
| [28-phase-m5-connector-sdk-and-governed-extensibility.md](./28-phase-m5-connector-sdk-and-governed-extensibility.md) | طراحی M5: Connector SDK، OAuth/PKCE، MCP، A2A، Prompt Operations و governed integrations |
| [29-phase-m6-browser-automation-and-human-in-loop.md](./29-phase-m6-browser-automation-and-human-in-loop.md) | طراحی M6: Browser Runner، human handover، domain policy، Playwright، evidence و controlled web interaction |
| [30-phase-m7-deploy-preview-and-release-engineering.md](./30-phase-m7-deploy-preview-and-release-engineering.md) | طراحی M7: artifact supply chain، Preview، DeployAdapter، verification، approval و rollback |
| [31-phase-m8-production-reliability-capacity-and-disaster-recovery.md](./31-phase-m8-production-reliability-capacity-and-disaster-recovery.md) | طراحی M8: SLO، capacity plan، backup/restore، DR، incident، runbook و on-call |
| [32-phase-m9-collaboration-and-project-bootstrap.md](./32-phase-m9-collaboration-and-project-bootstrap.md) | طراحی M9: collaboration، project bootstrap، template safety، PR و commit quality (`designed_only`) |
| [33-phase-m10-evaluation-quality-and-consensus.md](./33-phase-m10-evaluation-quality-and-consensus.md) | طراحی M10: evaluation، invariant/quality gates، regression، cost/latency و multi-model consensus (`designed_only`) |
| [34-phase-m11-billing-metering-and-entitlements.md](./34-phase-m11-billing-metering-and-entitlements.md) | طراحی M11: metering، free/paid/local entitlements، quota و billing boundary (`designed_only`) |
| [35-phase-m12-internationalization-and-accessibility.md](./35-phase-m12-internationalization-and-accessibility.md) | طراحی M12: versioned catalogs، fallback، RTL/LTR، formatting و accessibility contract (`designed_only`) |
| [36-phase-m13-governed-plugin-ecosystem.md](./36-phase-m13-governed-plugin-ecosystem.md) | طراحی M13: plugin manifest، trust، signature، capability scope، sandbox و revocation (`designed_only`) |
| [37-phase-m14-data-governance-and-privacy-lifecycle.md](./37-phase-m14-data-governance-and-privacy-lifecycle.md) | طراحی M14: classification، consent، retention، export/delete و egress (`designed_only`) |
| [38-phase-m15-workflow-automation-and-triggers.md](./38-phase-m15-workflow-automation-and-triggers.md) | طراحی M15: trigger، schedule، webhook، idempotency، approval و bounded workflow (`designed_only`) |
| [39-phase-m16-memory-and-context-retrieval.md](./39-phase-m16-memory-and-context-retrieval.md) | طراحی M16: memory provenance، trust، expiry، retrieval و context boundary (`designed_only`) |
| [40-phase-m17-agent-protocol-and-interoperability.md](./40-phase-m17-agent-protocol-and-interoperability.md) | طراحی M17: A2A/MCP envelope، signature، nonce، scope و replay boundary (`designed_only`) |
| [41-phase-m18-organization-governance-and-policy.md](./41-phase-m18-organization-governance-and-policy.md) | طراحی M18: policy-as-code، monotonic governance، egress، autonomy و approval (`designed_only`) |
| [42-comprehensive-capability-audit.md](./42-comprehensive-capability-audit.md) | ممیزی جامع همه ۱۰۰ proposal، ۱۱۱ gap و design coverage؛ منبع انتخاب M24 تا M28 و سری بعدی M29 تا M103 |
| [43-phase-m19-durable-product-surface-and-event-bus.md](./43-phase-m19-durable-product-surface-and-event-bus.md) | طراحی M19: API، command/event، idempotency و event bus (`designed_only`) |
| [44-phase-m20-evaluation-integrity-and-reproducible-benchmarking.md](./44-phase-m20-evaluation-integrity-and-reproducible-benchmarking.md) | طراحی M20: corpus، replay، contamination و regression integrity (`designed_only`) |
| [45-phase-m21-secure-supply-chain-and-runtime-isolation.md](./45-phase-m21-secure-supply-chain-and-runtime-isolation.md) | طراحی M21: signed tools، SBOM، secret lease، DLP و runtime isolation (`designed_only`) |
| [46-phase-m22-resilience-finops-and-provider-operations.md](./46-phase-m22-resilience-finops-and-provider-operations.md) | طراحی M22: budget، quota، circuit، SLO، restore و provider operations (`designed_only`) |
| [47-phase-m23-delivery-trust-and-developer-experience.md](./47-phase-m23-delivery-trust-and-developer-experience.md) | طراحی M23: worktree، patch، scan، attestation، rollback و developer clients (`designed_only`) |
| [48-phase-m24-intake-planning-and-collaboration.md](./48-phase-m24-intake-planning-and-collaboration.md) | طراحی M24: intent، requirement، DAG، capability graph، plugin و collaboration (`designed_only`) |
| [49-phase-m25-evidence-grounded-routing-and-operations.md](./49-phase-m25-evidence-grounded-routing-and-operations.md) | طراحی M25: evidence calibration، routing، shadow، trace و error taxonomy (`designed_only`) |
| [50-phase-m26-secure-knowledge-fabric.md](./50-phase-m26-secure-knowledge-fabric.md) | طراحی M26: code graph، ACL، context packing، tiered memory، freshness و lineage (`designed_only`) |
| [51-phase-m27-privacy-aware-retrieval-and-local-index.md](./51-phase-m27-privacy-aware-retrieval-and-local-index.md) | طراحی M27: PII، deletion propagation، retrieval evaluation و local index (`designed_only`) |
| [52-phase-m28-governance-quality-and-transparency.md](./52-phase-m28-governance-quality-and-transparency.md) | طراحی M28: policy، change، model card، fairness، accessibility، marketplace و ADR (`designed_only`) |
| [53-phase-m29-durable-runtime-foundation.md](./53-phase-m29-durable-runtime-foundation.md) | طراحی M29: transaction، RLS boundary، outbox، idempotency و durable queue (`designed_only`) |
| [54-phase-m30-sandbox-execution-and-workspace-runtime.md](./54-phase-m30-sandbox-execution-and-workspace-runtime.md) | طراحی M30: sandbox، workspace، patch، test adapter و cleanup (`designed_only`) |
| [55-phase-m31-connector-and-provider-runtime.md](./55-phase-m31-connector-and-provider-runtime.md) | طراحی M31: OAuth، webhook، connector scope و provider runtime (`designed_only`) |
| [56-phase-m32-operations-evidence-and-disaster-recovery.md](./56-phase-m32-operations-evidence-and-disaster-recovery.md) | طراحی M32: metrics، SLO، FinOps، incident و restore drill (`designed_only`) |
| [57-phase-m33-product-surface-and-approval-clients.md](./57-phase-m33-product-surface-and-approval-clients.md) | طراحی M33: Web surface، SSE، approval inbox، clients و accessibility (`designed_only`) |
| [58-phase-m34-identity-membership-and-access-runtime.md](./58-phase-m34-identity-membership-and-access-runtime.md) | طراحی M34: identity، session، membership، settings و notifications (`designed_only`) |
| [59-phase-m35-evaluation-and-benchmark-runtime.md](./59-phase-m35-evaluation-and-benchmark-runtime.md) | طراحی M35: dataset provenance، benchmark، regression و feedback (`designed_only`) |
| [60-phase-m36-repository-intelligence-and-context-runtime.md](./60-phase-m36-repository-intelligence-and-context-runtime.md) | طراحی M36: snapshot، ACL context، delegation و repository mutation (`designed_only`) |
| [61-phase-m37-preview-artifact-and-delivery-runtime.md](./61-phase-m37-preview-artifact-and-delivery-runtime.md) | طراحی M37: preview، artifact، deployment، retention و rollback (`designed_only`) |
| [62-phase-m38-security-privacy-and-governance-runtime.md](./62-phase-m38-security-privacy-and-governance-runtime.md) | طراحی M38: isolation، key rotation، deletion، DLP و egress (`designed_only`) |
| [63-phase-m39-agent-interaction-and-streaming-runtime.md](./63-phase-m39-agent-interaction-and-streaming-runtime.md) | طراحی M39: structured output، repair، streaming و tool guard (`designed_only`) |
| [64-phase-m40-connector-gateway-and-interoperability-runtime.md](./64-phase-m40-connector-gateway-and-interoperability-runtime.md) | طراحی M40: GitHub App، rate/backoff، webhook، database و MCP (`designed_only`) |
| [65-phase-m41-data-lifecycle-analytics-and-metering-runtime.md](./65-phase-m41-data-lifecycle-analytics-and-metering-runtime.md) | طراحی M41: retention، analytics، metering، entitlement و search (`designed_only`) |
| [66-phase-m42-quality-ci-and-verification-runtime.md](./66-phase-m42-quality-ci-and-verification-runtime.md) | طراحی M42: toolchain، test adapter، E2E، CI و accessibility (`designed_only`) |
| [67-phase-m43-self-host-release-and-resilience-runtime.md](./67-phase-m43-self-host-release-and-resilience-runtime.md) | طراحی M43: self-host، release، recovery، upgrade و chaos (`designed_only`) |
| [68-phase-m44-collaboration-onboarding-and-run-workspace.md](./68-phase-m44-collaboration-onboarding-and-run-workspace.md) | طراحی M44: collaboration، onboarding، template و offline workspace (`designed_only`) |
| [69-phase-m45-localization-design-and-degraded-clients.md](./69-phase-m45-localization-design-and-degraded-clients.md) | طراحی M45: localization، RTL design system، PWA و degraded client (`designed_only`) |
| [70-phase-m46-browser-automation-and-external-signals.md](./70-phase-m46-browser-automation-and-external-signals.md) | طراحی M46: browser session، handover، harvesting و untrusted signals (`designed_only`) |
| [71-phase-m47-legal-licensing-and-enterprise-governance.md](./71-phase-m47-legal-licensing-and-enterprise-governance.md) | طراحی M47: Terms، output rights، licensing، disclosure و enterprise (`designed_only`) |
| [72-phase-m48-production-integration-evidence-and-cutover.md](./72-phase-m48-production-integration-evidence-and-cutover.md) | طراحی M48: evidence envelope، readiness، canary، cutover و rollback (`designed_only`) |
| [73-phase-m49-platform-connections-oauth-and-consent.md](./73-phase-m49-platform-connections-oauth-and-consent.md) | طراحی M49: platform connections، OAuth/PKCE، scope و consent (`designed_only`) |
| [74-phase-m50-unified-connector-capabilities-and-actions.md](./74-phase-m50-unified-connector-capabilities-and-actions.md) | طراحی M50: unified connector، capability negotiation و normalized actions (`designed_only`) |
| [75-phase-m51-cross-platform-handoff-and-deep-links.md](./75-phase-m51-cross-platform-handoff-and-deep-links.md) | طراحی M51: deep link، context handoff و import/export (`designed_only`) |
| [76-phase-m52-platform-sync-and-conflict-resolution.md](./76-phase-m52-platform-sync-and-conflict-resolution.md) | طراحی M52: webhook، cursor، sync و conflict resolution (`designed_only`) |
| [77-phase-m53-connection-center-health-and-fallback.md](./77-phase-m53-connection-center-health-and-fallback.md) | طراحی M53: connection center، health، recovery و fallback (`designed_only`) |
| [78-phase-m54-visual-app-studio-and-prompt-to-ui.md](./78-phase-m54-visual-app-studio-and-prompt-to-ui.md) | طراحی M54: visual app studio، prompt-to-UI و canvas (`designed_only`) |
| [79-phase-m55-design-to-code-and-ux-verification.md](./79-phase-m55-design-to-code-and-ux-verification.md) | طراحی M55: design-to-code، component handoff و UX verification (`designed_only`) |
| [80-phase-m56-web-ai-model-discovery-and-free-api.md](./80-phase-m56-web-ai-model-discovery-and-free-api.md) | طراحی M56: web discovery، model candidate و free API verification (`designed_only`) |
| [81-phase-m57-comprehensive-ai-directory-and-model-cards.md](./81-phase-m57-comprehensive-ai-directory-and-model-cards.md) | طراحی M57: comprehensive AI directory، taxonomy و model cards (`designed_only`) |
| [82-phase-m58-model-catalog-governance-and-safe-activation.md](./82-phase-m58-model-catalog-governance-and-safe-activation.md) | طراحی M58: catalog governance، publication و safe activation (`designed_only`) |
| [83-phase-m59-visual-studio-integration-and-preview.md](./83-phase-m59-visual-studio-integration-and-preview.md) | طراحی M59: visual studio integration، preview و publish boundary (`designed_only`) |
| [84-phase-m60-model-evaluation-and-trust.md](./84-phase-m60-model-evaluation-and-trust.md) | طراحی M60: model evaluation، trust و activation gate (`designed_only`) |
| [85-phase-m61-model-provider-runtime-and-routing.md](./85-phase-m61-model-provider-runtime-and-routing.md) | طراحی M61: provider runtime، routing و fallback (`designed_only`) |
| [86-phase-m62-ai-workflow-builder-and-agent-graphs.md](./86-phase-m62-ai-workflow-builder-and-agent-graphs.md) | طراحی M62: AI workflow builder، graph و human approval (`designed_only`) |
| [87-phase-m63-ai-platform-operations-and-governance.md](./87-phase-m63-ai-platform-operations-and-governance.md) | طراحی M63: health، quota، incident و operations governance (`designed_only`) |
| [88-phase-m64-product-control-plane-and-api.md](./88-phase-m64-product-control-plane-and-api.md) | طراحی M64: product control-plane، API، screens و approvals (`designed_only`) |
| [89-phase-m65-durable-persistence-and-event-bus.md](./89-phase-m65-durable-persistence-and-event-bus.md) | طراحی M65: durable persistence، RLS، outbox و job leases (`designed_only`) |
| [90-phase-m66-sandbox-execution-and-workspace-integration.md](./90-phase-m66-sandbox-execution-and-workspace-integration.md) | طراحی M66: sandbox، workspace patch و test evidence (`designed_only`) |
| [91-phase-m67-external-integration-gates.md](./91-phase-m67-external-integration-gates.md) | طراحی M67: connector/provider probes و external integration gates (`designed_only`) |
| [92-phase-m68-pilot-release-and-e2e-gates.md](./92-phase-m68-pilot-release-and-e2e-gates.md) | طراحی M68: pilot cohort، E2E evidence و release gate (`designed_only`) |
| [93-phase-m69-enterprise-identity-and-membership.md](./93-phase-m69-enterprise-identity-and-membership.md) | طراحی M69: enterprise identity، membership و delegation (`designed_only`) |
| [94-phase-m70-privacy-lifecycle-and-data-rights.md](./94-phase-m70-privacy-lifecycle-and-data-rights.md) | طراحی M70: privacy lifecycle، data rights و deletion evidence (`designed_only`) |
| [95-phase-m71-developer-experience-and-sdk.md](./95-phase-m71-developer-experience-and-sdk.md) | طراحی M71: API contract، SDK، Forge CLI و webhook (`designed_only`) |
| [96-phase-m72-extension-marketplace-and-plugin-trust.md](./96-phase-m72-extension-marketplace-and-plugin-trust.md) | طراحی M72: extension marketplace، plugin permissions و trust (`designed_only`) |
| [97-phase-m73-platform-resilience-and-dr.md](./97-phase-m73-platform-resilience-and-dr.md) | طراحی M73: SLO، backup/restore، incident و chaos (`designed_only`) |
| [98-phase-m74-product-experience-and-accessibility.md](./98-phase-m74-product-experience-and-accessibility.md) | طراحی M74: product experience، client contracts و accessibility (`designed_only`) |
| [99-phase-m75-evaluation-harness-and-regression.md](./99-phase-m75-evaluation-harness-and-regression.md) | طراحی M75: evaluation harness، benchmark و regression gates (`designed_only`) |
| [100-phase-m76-execution-fabric-and-sandbox.md](./100-phase-m76-execution-fabric-and-sandbox.md) | طراحی M76: execution fabric، workspace/VFS و sandbox (`designed_only`) |
| [101-phase-m77-connector-delivery-and-webhooks.md](./101-phase-m77-connector-delivery-and-webhooks.md) | طراحی M77: connector delivery، webhook و rate limits (`designed_only`) |
| [102-phase-m78-self-host-release-and-ci.md](./102-phase-m78-self-host-release-and-ci.md) | طراحی M78: self-host release، CI و upgrade gates (`designed_only`) |
| [103-phase-m79-knowledge-context-and-repository-intelligence.md](./103-phase-m79-knowledge-context-and-repository-intelligence.md) | طراحی M79: secure knowledge fabric، context و repository intelligence (`designed_only`) |
| [104-phase-m80-prompt-safety-and-output-trust.md](./104-phase-m80-prompt-safety-and-output-trust.md) | طراحی M80: prompt safety، injection detection و output trust (`designed_only`) |
| [105-phase-m81-collaboration-onboarding-and-usage.md](./105-phase-m81-collaboration-onboarding-and-usage.md) | طراحی M81: collaboration، onboarding و usage control (`designed_only`) |
| [106-phase-m82-integration-adapters-and-browser.md](./106-phase-m82-integration-adapters-and-browser.md) | طراحی M82: integration adapters و browser runtime (`designed_only`) |
| [107-phase-m83-data-governance-legal-and-disclosure.md](./107-phase-m83-data-governance-legal-and-disclosure.md) | طراحی M83: data governance، legal و disclosure (`designed_only`) |
| [108-phase-m84-agent-orchestration-and-checkpoints.md](./108-phase-m84-agent-orchestration-and-checkpoints.md) | طراحی M84: agent orchestration، workflow graph و checkpoints (`designed_only`) |
| [109-phase-m85-api-worker-and-stream-runtime.md](./109-phase-m85-api-worker-and-stream-runtime.md) | طراحی M85: public API، worker lease و stream runtime (`designed_only`) |
| [110-phase-m86-provider-economics-and-routing.md](./110-phase-m86-provider-economics-and-routing.md) | طراحی M86: provider economics، quota و routing (`designed_only`) |
| [111-phase-m87-quality-integration-and-e2e.md](./111-phase-m87-quality-integration-and-e2e.md) | طراحی M87: quality integration، E2E و accessibility (`designed_only`) |
| [112-phase-m88-release-certification-and-cutover.md](./112-phase-m88-release-certification-and-cutover.md) | طراحی M88: release certification، canary و cutover (`designed_only`) |
| [113-phase-m89-observability-and-incident-command.md](./113-phase-m89-observability-and-incident-command.md) | طراحی M89: observability، SLO و incident command (`designed_only`) |
| [114-phase-m90-durable-data-plane-and-search.md](./114-phase-m90-durable-data-plane-and-search.md) | طراحی M90: durable data plane، event store و governed search (`designed_only`) |
| [115-phase-m91-billing-and-entitlements.md](./115-phase-m91-billing-and-entitlements.md) | طراحی M91: billing، entitlements و reconciliation (`designed_only`) |
| [116-phase-m92-approval-review-and-escalation.md](./116-phase-m92-approval-review-and-escalation.md) | طراحی M92: human approval، review و escalation (`designed_only`) |
| [117-phase-m93-deployment-operations-and-self-host.md](./117-phase-m93-deployment-operations-and-self-host.md) | طراحی M93: deployment operations و self-host (`designed_only`) |
| [118-phase-m94-retrieval-memory-and-feedback.md](./118-phase-m94-retrieval-memory-and-feedback.md) | طراحی M94: retrieval، semantic memory و human feedback (`designed_only`) |
| [119-phase-m95-supply-chain-and-injection-security.md](./119-phase-m95-supply-chain-and-injection-security.md) | طراحی M95: supply-chain، artifact provenance و injection security (`designed_only`) |
| [120-phase-m96-browser-signal-and-webhook-delivery.md](./120-phase-m96-browser-signal-and-webhook-delivery.md) | طراحی M96: browser automation، signals و webhook delivery (`designed_only`) |
| [121-phase-m97-localization-and-degraded-clients.md](./121-phase-m97-localization-and-degraded-clients.md) | طراحی M97: localization، RTL accessibility و degraded clients (`designed_only`) |
| [122-phase-m98-workspace-bootstrap-and-handoff.md](./122-phase-m98-workspace-bootstrap-and-handoff.md) | طراحی M98: project templates، bootstrap و handoff (`designed_only`) |
| [123-phase-m99-agent-delegation-and-streaming.md](./123-phase-m99-agent-delegation-and-streaming.md) | طراحی M99: agent delegation، structured streaming و tool safety (`designed_only`) |
| [124-phase-m100-workflow-queue-and-scheduling.md](./124-phase-m100-workflow-queue-and-scheduling.md) | طراحی M100: workflow، queue و scheduling (`designed_only`) |
| [125-phase-m101-connectors-and-platform-gates.md](./125-phase-m101-connectors-and-platform-gates.md) | طراحی M101: connector platform، OAuth/PKCE و GitHub App (`designed_only`) |
| [126-phase-m102-privacy-retention-and-tenant-boundary.md](./126-phase-m102-privacy-retention-and-tenant-boundary.md) | طراحی M102: privacy lifecycle، retention و tenant boundary (`designed_only`) |
| [127-phase-m103-evaluation-and-release-quality.md](./127-phase-m103-evaluation-and-release-quality.md) | طراحی M103: evaluation، E2E و release quality (`designed_only`) |
| [128-phase-m104-api-contracts-and-stream-reconnect.md](./128-phase-m104-api-contracts-and-stream-reconnect.md) | طراحی M104: API contracts، versioning و stream reconnect (`designed_only`) |
| [129-phase-m105-identity-and-membership.md](./129-phase-m105-identity-and-membership.md) | طراحی M105: identity، membership و MFA (`designed_only`) |
| [130-phase-m106-artifact-preview-and-delivery.md](./130-phase-m106-artifact-preview-and-delivery.md) | طراحی M106: artifact lifecycle، preview و signed delivery (`designed_only`) |
| [131-phase-m107-observability-and-finops.md](./131-phase-m107-observability-and-finops.md) | طراحی M107: observability، SLO، incident command و FinOps (`designed_only`) |
| [132-phase-m108-self-host-and-controlled-cutover.md](./132-phase-m108-self-host-and-controlled-cutover.md) | طراحی M108: self-host، backup/restore و controlled cutover (`designed_only`) |
| [133-phase-m109-context-assembly-and-repository-intelligence.md](./133-phase-m109-context-assembly-and-repository-intelligence.md) | طراحی M109: context assembly و repository intelligence (`designed_only`) |
| [134-phase-m110-model-discovery-and-ai-directory.md](./134-phase-m110-model-discovery-and-ai-directory.md) | طراحی M110: model discovery، AI directory و free API verification (`designed_only`) |
| [135-phase-m111-plugin-marketplace-and-extension-trust.md](./135-phase-m111-plugin-marketplace-and-extension-trust.md) | طراحی M111: plugin marketplace و extension trust (`designed_only`) |
| [136-phase-m112-product-collaboration-and-onboarding.md](./136-phase-m112-product-collaboration-and-onboarding.md) | طراحی M112: product collaboration، onboarding و notifications (`designed_only`) |
| [137-phase-m113-data-plane-and-analytics.md](./137-phase-m113-data-plane-and-analytics.md) | طراحی M113: data plane، event store، search و analytics (`designed_only`) |
| [138-phase-m114-legal-disclosure-and-output-rights.md](./138-phase-m114-legal-disclosure-and-output-rights.md) | طراحی M114: legal، disclosure و output rights (`designed_only`) |
| [139-phase-m115-provider-routing-and-economics.md](./139-phase-m115-provider-routing-and-economics.md) | طراحی M115: provider routing، quota و economics (`designed_only`) |
| [140-phase-m116-platform-sync-and-health.md](./140-phase-m116-platform-sync-and-health.md) | طراحی M116: platform sync، conflict resolution و health (`designed_only`) |
| [141-phase-m117-abuse-safety-and-dlp.md](./141-phase-m117-abuse-safety-and-dlp.md) | طراحی M117: abuse prevention، DLP و safety governance (`designed_only`) |
| [142-phase-m118-production-evidence-and-cutover.md](./142-phase-m118-production-evidence-and-cutover.md) | طراحی M118: production evidence، readiness و cutover (`designed_only`) |
| [143-phase-m119-durable-tenant-and-transaction-runtime.md](./143-phase-m119-durable-tenant-and-transaction-runtime.md) | طراحی M119: durable tenant transactions، RLS، migration safety و transactional outbox (`designed_only`) |
| [144-phase-m120-verification-ci-security-accessibility.md](./144-phase-m120-verification-ci-security-accessibility.md) | طراحی M120: verification matrix، CI، security، accessibility و load evidence (`designed_only`) |
| [145-phase-m121-sdk-cli-config-developer-handoff.md](./145-phase-m121-sdk-cli-config-developer-handoff.md) | طراحی M121: SDK/API compatibility، safe CLI، config bootstrap و developer handoff (`designed_only`) |
| [146-phase-m122-key-rotation-erasure-deletion-proof-backup.md](./146-phase-m122-key-rotation-erasure-deletion-proof-backup.md) | طراحی M122: key rotation، privacy erasure، deletion proof و backup retention (`designed_only`) |
| [147-phase-m123-capacity-circuit-breaker-resilience.md](./147-phase-m123-capacity-circuit-breaker-resilience.md) | طراحی M123: capacity planning، circuit breaker، failure injection و resilience operations (`designed_only`) |
| [148-phase-m124-audit-evidence-ledger-and-replay.md](./148-phase-m124-audit-evidence-ledger-and-replay.md) | طراحی M124: audit evidence ledger، provenance و replay (`designed_only`) |
| [149-phase-m125-identity-continuity-session-revocation.md](./149-phase-m125-identity-continuity-session-revocation.md) | طراحی M125: identity continuity، session revocation، delegation و MFA recovery (`designed_only`) |
| [150-phase-m126-connector-consent-webhook-reconciliation.md](./150-phase-m126-connector-consent-webhook-reconciliation.md) | طراحی M126: connector consent، signed webhook و reconciliation (`designed_only`) |
| [151-phase-m127-benchmark-replay-release-quality.md](./151-phase-m127-benchmark-replay-release-quality.md) | طراحی M127: benchmark corpus، deterministic replay و release quality (`designed_only`) |
| [152-phase-m128-finops-quota-and-provider-allocation.md](./152-phase-m128-finops-quota-and-provider-allocation.md) | طراحی M128: FinOps، usage ledger، quota و provider allocation (`designed_only`) |
| [153-phase-m129-api-evolution-stream-reconnect.md](./153-phase-m129-api-evolution-stream-reconnect.md) | طراحی M129: API evolution، schema migration و stream reconnect (`designed_only`) |
| [154-phase-m130-artifact-supply-chain-and-attestation.md](./154-phase-m130-artifact-supply-chain-and-attestation.md) | طراحی M130: artifact supply chain، SBOM و attestation (`designed_only`) |
| [155-phase-m131-approval-operations-and-escalation.md](./155-phase-m131-approval-operations-and-escalation.md) | طراحی M131: approval operations، human review و escalation (`designed_only`) |
| [156-phase-m132-knowledge-freshness-and-context-lineage.md](./156-phase-m132-knowledge-freshness-and-context-lineage.md) | طراحی M132: knowledge ACL، freshness و context lineage (`designed_only`) |
| [157-phase-m133-self-host-upgrade-and-controlled-cutover.md](./157-phase-m133-self-host-upgrade-and-controlled-cutover.md) | طراحی M133: self-host upgrade، backup restore و controlled cutover (`designed_only`) |
| [158-phase-m134-data-portability-and-controlled-import.md](./158-phase-m134-data-portability-and-controlled-import.md) | طراحی M134: data portability و controlled import (`designed_only`) |
| [159-phase-m135-device-pairing-and-local-trust.md](./159-phase-m135-device-pairing-and-local-trust.md) | طراحی M135: device pairing و local trust (`designed_only`) |
| [160-phase-m136-policy-distribution-and-drift.md](./160-phase-m136-policy-distribution-and-drift.md) | طراحی M136: policy distribution و configuration drift (`designed_only`) |
| [161-phase-m137-incident-case-and-containment.md](./161-phase-m137-incident-case-and-containment.md) | طراحی M137: incident case، containment و postmortem (`designed_only`) |
| [162-phase-m138-privacy-preserving-telemetry-and-feedback.md](./162-phase-m138-privacy-preserving-telemetry-and-feedback.md) | طراحی M138: privacy-preserving telemetry و feedback (`designed_only`) |
| [163-phase-m139-observability-slo-and-trace-integrity.md](./163-phase-m139-observability-slo-and-trace-integrity.md) | طراحی M139: observability SLO و trace integrity (`designed_only`) |
| [164-phase-m140-search-query-governance.md](./164-phase-m140-search-query-governance.md) | طراحی M140: full-text search و query governance (`designed_only`) |
| [165-phase-m141-workflow-scheduler-and-triggers.md](./165-phase-m141-workflow-scheduler-and-triggers.md) | طراحی M141: workflow scheduler و trigger runtime (`designed_only`) |
| [166-phase-m142-artifact-lifecycle-and-preview-isolation.md](./166-phase-m142-artifact-lifecycle-and-preview-isolation.md) | طراحی M142: artifact lifecycle و preview isolation (`designed_only`) |
| [167-phase-m143-operator-console-and-live-run-ux.md](./167-phase-m143-operator-console-and-live-run-ux.md) | طراحی M143: operator console و live Run UX (`designed_only`) |
| [168-phase-m144-public-api-surface-and-openapi.md](./168-phase-m144-public-api-surface-and-openapi.md) | طراحی M144: public API surface و OpenAPI compatibility (`designed_only`) |
| [169-phase-m145-connector-sdk-oauth-lifecycle.md](./169-phase-m145-connector-sdk-oauth-lifecycle.md) | طراحی M145: connector SDK و OAuth/PKCE lifecycle (`designed_only`) |
| [170-phase-m146-workspace-vfs-and-sandbox-boundary.md](./170-phase-m146-workspace-vfs-and-sandbox-boundary.md) | طراحی M146: workspace VFS و sandbox resource boundary (`designed_only`) |
| [171-phase-m147-tenant-isolation-and-rls-proof.md](./171-phase-m147-tenant-isolation-and-rls-proof.md) | طراحی M147: tenant isolation و RLS proof (`designed_only`) |
| [172-phase-m148-e2e-release-acceptance-and-readiness.md](./172-phase-m148-e2e-release-acceptance-and-readiness.md) | طراحی M148: E2E release acceptance و readiness (`designed_only`) |
| [173-phase-m149-worker-queue-retry-and-dlq.md](./173-phase-m149-worker-queue-retry-and-dlq.md) | طراحی M149: durable worker queue، retry و DLQ (`designed_only`) |
| [174-phase-m150-database-migration-and-schema-governance.md](./174-phase-m150-database-migration-and-schema-governance.md) | طراحی M150: database migration و schema governance (`designed_only`) |
| [175-phase-m151-github-app-and-webhook-action.md](./175-phase-m151-github-app-and-webhook-action.md) | طراحی M151: GitHub App و webhook/action integration (`designed_only`) |
| [176-phase-m152-preview-environment-and-routing.md](./176-phase-m152-preview-environment-and-routing.md) | طراحی M152: preview environment و deployment routing (`designed_only`) |
| [177-phase-m153-product-e2e-orchestration-and-containment.md](./177-phase-m153-product-e2e-orchestration-and-containment.md) | طراحی M153: product E2E orchestration و failure containment (`designed_only`) |
| [178-phase-m159-data-residency-and-regional-routing.md](./178-phase-m159-data-residency-and-regional-routing.md) | طراحی M159: data residency و regional routing (`designed_only`) |
| [179-phase-m160-feature-flags-and-progressive-rollout.md](./179-phase-m160-feature-flags-and-progressive-rollout.md) | طراحی M160: feature flags و progressive rollout (`designed_only`) |
| [180-phase-m161-workload-identity-and-service-account-leases.md](./180-phase-m161-workload-identity-and-service-account-leases.md) | طراحی M161: workload identity و service-account leases (`designed_only`) |
| [181-phase-m162-data-rights-export-and-deletion.md](./181-phase-m162-data-rights-export-and-deletion.md) | طراحی M162: data rights، export و deletion (`designed_only`) |
| [182-phase-m163-finops-budget-guardrails-and-reconciliation.md](./182-phase-m163-finops-budget-guardrails-and-reconciliation.md) | طراحی M163: FinOps budget guardrails و reconciliation (`designed_only`) |
| [183-phase-m164-structured-output-repair-and-response-safety.md](./183-phase-m164-structured-output-repair-and-response-safety.md) | طراحی M164: structured output repair و response safety (`designed_only`) |
| [184-phase-m165-agent-delegation-and-capability-tokens.md](./184-phase-m165-agent-delegation-and-capability-tokens.md) | طراحی M165: agent delegation و capability tokens (`designed_only`) |
| [185-phase-m166-cancellation-and-compensation-runtime.md](./185-phase-m166-cancellation-and-compensation-runtime.md) | طراحی M166: cancellation و compensation runtime (`designed_only`) |
| [186-phase-m167-reproducible-build-and-release-manifest.md](./186-phase-m167-reproducible-build-and-release-manifest.md) | طراحی M167: reproducible build و release manifest (`designed_only`) |
| [187-phase-m168-outbound-webhook-and-callback-delivery.md](./187-phase-m168-outbound-webhook-and-callback-delivery.md) | طراحی M168: outbound webhook و callback delivery (`designed_only`) |
| [188-phase-m169-context-provenance-and-injection-firewall.md](./188-phase-m169-context-provenance-and-injection-firewall.md) | طراحی M169: context provenance و injection firewall (`designed_only`) |
| [189-phase-m170-tool-action-boundary-and-transactional-approval.md](./189-phase-m170-tool-action-boundary-and-transactional-approval.md) | طراحی M170: tool action boundary و transactional approval (`designed_only`) |
| [190-phase-m171-offline-sync-and-conflict-resolution.md](./190-phase-m171-offline-sync-and-conflict-resolution.md) | طراحی M171: offline sync و conflict resolution (`designed_only`) |
| [191-phase-m172-accessibility-and-localization-verification.md](./191-phase-m172-accessibility-and-localization-verification.md) | طراحی M172: accessibility و localization verification (`designed_only`) |
| [192-phase-m173-incident-learning-and-runbook-automation.md](./192-phase-m173-incident-learning-and-runbook-automation.md) | طراحی M173: incident learning و runbook automation (`designed_only`) |
| [193-phase-m174-prompt-experimentation-and-rollback.md](./193-phase-m174-prompt-experimentation-and-rollback.md) | طراحی M174: prompt experimentation و rollback (`designed_only`) |
| [194-phase-m175-multi-model-consensus-and-voting.md](./194-phase-m175-multi-model-consensus-and-voting.md) | طراحی M175: multi-model consensus و voting (`designed_only`) |
| [195-phase-m176-agent-to-agent-protocol-and-interoperability.md](./195-phase-m176-agent-to-agent-protocol-and-interoperability.md) | طراحی M176: agent-to-agent protocol و interoperability (`designed_only`) |
| [196-phase-m177-prompt-cache-integrity-and-privacy.md](./196-phase-m177-prompt-cache-integrity-and-privacy.md) | طراحی M177: prompt cache integrity و privacy (`designed_only`) |
| [197-phase-m178-deployment-adapter-and-release-target-boundary.md](./197-phase-m178-deployment-adapter-and-release-target-boundary.md) | طراحی M178: deployment adapter و release target boundary (`designed_only`) |
| [198-phase-m179-pull-request-quality-and-commit-provenance.md](./198-phase-m179-pull-request-quality-and-commit-provenance.md) | طراحی M179: pull-request quality و commit provenance (`designed_only`) |
| [199-phase-m180-agent-graph-orchestration-and-checkpoints.md](./199-phase-m180-agent-graph-orchestration-and-checkpoints.md) | طراحی M180: agent graph orchestration و durable checkpoints (`designed_only`) |
| [200-phase-m181-performance-budget-and-load-shedding.md](./200-phase-m181-performance-budget-and-load-shedding.md) | طراحی M181: performance budget و load shedding (`designed_only`) |
| [201-phase-m182-onboarding-and-safe-first-run.md](./201-phase-m182-onboarding-and-safe-first-run.md) | طراحی M182: onboarding و safe first run (`designed_only`) |
| [202-phase-m183-service-entitlement-sla-and-degraded-disclosure.md](./202-phase-m183-service-entitlement-sla-and-degraded-disclosure.md) | طراحی M183: service entitlement، SLA و degraded disclosure (`designed_only`) |
| [203-phase-m184-graph-engine-compatibility-and-state-interop.md](./203-phase-m184-graph-engine-compatibility-and-state-interop.md) | طراحی M184: graph engine compatibility و state interop (`designed_only`) |
| [204-phase-m185-repository-intelligence-and-retrieval-evidence.md](./204-phase-m185-repository-intelligence-and-retrieval-evidence.md) | طراحی M185: repository intelligence و retrieval evidence (`designed_only`) |
| [205-phase-m186-human-feedback-and-preference-governance.md](./205-phase-m186-human-feedback-and-preference-governance.md) | طراحی M186: human feedback و preference governance (`designed_only`) |
| [206-phase-m187-dependency-risk-and-vulnerability-response.md](./206-phase-m187-dependency-risk-and-vulnerability-response.md) | طراحی M187: dependency risk و vulnerability response (`designed_only`) |
| [207-phase-m188-schema-evolution-and-consumer-compatibility.md](./207-phase-m188-schema-evolution-and-consumer-compatibility.md) | طراحی M188: schema evolution و consumer compatibility (`designed_only`) |
| [208-phase-m189-release-provenance-and-promotion-evidence.md](./208-phase-m189-release-provenance-and-promotion-evidence.md) | طراحی M189: release provenance و promotion evidence (`designed_only`) |
| [209-phase-m190-egress-policy-and-destination-governance.md](./209-phase-m190-egress-policy-and-destination-governance.md) | طراحی M190: egress policy و destination governance (`designed_only`) |
| [210-phase-m191-retention-legal-hold-and-secure-erasure.md](./210-phase-m191-retention-legal-hold-and-secure-erasure.md) | طراحی M191: retention، legal hold و secure erasure (`designed_only`) |
| [211-phase-m192-recovery-chaos-and-failover-evidence.md](./211-phase-m192-recovery-chaos-and-failover-evidence.md) | طراحی M192: recovery، chaos و failover evidence (`designed_only`) |
| [212-phase-m193-tenant-fairness-and-queue-scheduling.md](./212-phase-m193-tenant-fairness-and-queue-scheduling.md) | طراحی M193: tenant fairness و queue scheduling (`designed_only`) |
| [213-phase-m194-runtime-evidence-envelope-and-claim-verification.md](./213-phase-m194-runtime-evidence-envelope-and-claim-verification.md) | طراحی M194: runtime evidence envelope و claim verification (`designed_only`) |
| [214-phase-m195-provider-health-and-circuit-recovery.md](./214-phase-m195-provider-health-and-circuit-recovery.md) | طراحی M195: provider health و circuit recovery (`designed_only`) |
| [215-phase-m196-plugin-capability-sandbox-and-extension-certification.md](./215-phase-m196-plugin-capability-sandbox-and-extension-certification.md) | طراحی M196: plugin capability sandbox و extension certification (`designed_only`) |
| [216-phase-m197-notification-delivery-and-preference-governance.md](./216-phase-m197-notification-delivery-and-preference-governance.md) | طراحی M197: notification delivery و preference governance (`designed_only`) |
| [217-phase-m198-model-catalog-freshness-and-capability-disclosure.md](./217-phase-m198-model-catalog-freshness-and-capability-disclosure.md) | طراحی M198: model catalog freshness و capability disclosure (`designed_only`) |
| [218-phase-m199-intent-normalization-and-scope-freeze.md](./218-phase-m199-intent-normalization-and-scope-freeze.md) | طراحی M199: intent normalization و scope freeze (`designed_only`) |
| [219-phase-m200-side-effect-journal-and-idempotent-commit.md](./219-phase-m200-side-effect-journal-and-idempotent-commit.md) | طراحی M200: side-effect journal و idempotent commit (`designed_only`) |
| [220-phase-m201-connector-reconciliation-and-drift-repair.md](./220-phase-m201-connector-reconciliation-and-drift-repair.md) | طراحی M201: connector reconciliation و drift repair (`designed_only`) |
| [221-phase-m202-approval-integrity-and-decision-expiry.md](./221-phase-m202-approval-integrity-and-decision-expiry.md) | طراحی M202: approval integrity و decision expiry (`designed_only`) |
| [222-phase-m203-privacy-preserving-analytics-and-aggregation.md](./222-phase-m203-privacy-preserving-analytics-and-aggregation.md) | طراحی M203: privacy-preserving analytics و aggregation (`designed_only`) |
| [223-phase-m204-run-handoff-and-human-takeover.md](./223-phase-m204-run-handoff-and-human-takeover.md) | طراحی M204: run handoff و human takeover (`designed_only`) |
| [224-phase-m205-capability-attestation-and-trust-bound-activation.md](./224-phase-m205-capability-attestation-and-trust-bound-activation.md) | طراحی M205: capability attestation و trust-bound activation (`designed_only`) |
| [225-phase-m206-region-bound-processing-and-residency-enforcement.md](./225-phase-m206-region-bound-processing-and-residency-enforcement.md) | طراحی M206: region-bound processing و residency enforcement (`designed_only`) |
| [226-phase-m207-action-simulation-and-blast-radius-preview.md](./226-phase-m207-action-simulation-and-blast-radius-preview.md) | طراحی M207: action simulation و blast-radius preview (`designed_only`) |
| [227-phase-m208-policy-change-control-and-rollback.md](./227-phase-m208-policy-change-control-and-rollback.md) | طراحی M208: policy change control و rollback (`designed_only`) |
| [upgrade-register.json](./upgrade-register.json) | رجیستر ماشین‌خوان ۱۰۰ پیشنهاد، وضعیت canonical طراحی/پیاده‌سازی |

## اجزای اجرایی مخزن

| مسیر | نقش |
|---|---|
| `prompts/` | کتابخانه پرامپت نسخه‌بندی‌شده (۱۳ ایجنت + ۶ قطعه مشترک) |
| `schema/` | قراردادهای JSON Schema برای هر خروجی ایجنت |
| `examples/` | نمونه‌های معتبر هر قرارداد — هم مستند، هم fixture تست |
| `src/core/` | هسته قطعی: ماشین حالت، policy engine، router، redaction، DAG، evidence، استخر ارائه‌دهندگان، تنظیمات پلتفرم، خط پایه امنیت، ممیزی‌ها، Benchmark، Usage Ledger، Checkpoint، Idempotency، Session Auth، Job Queue، رجیستر ارتقا، collaboration/scaffold، evaluation/consensus، entitlements، i18n، plugin governance، data governance، workflow automation، memory retrieval، agent protocol، organization governance، intake/planning/collaboration، evidence routing/operations، knowledge fabric، privacy retrieval و governance quality، durable runtime، sandbox execution، connector/provider runtime، operations evidence و product surface، identity/access، evaluation/benchmark، repository/context، delivery/preview، security/privacy governance، agent interaction/streaming، connector gateway، data lifecycle/analytics، quality/CI و self-host/resilience، collaboration/onboarding، localization/design، browser/signals، legal/licensing و production cutover evidence، API evolution، artifact supply chain، approval operations، knowledge freshness و self-host cutover، data portability، device trust، policy drift، incident case، privacy telemetry، observability SLO، search governance، workflow scheduler، artifact preview، operator console، public API، connector SDK، workspace sandbox، tenant isolation، release acceptance، worker queue، database migration، GitHub App، preview environment و product E2E |
| `prisma/schema.prisma` | مدل داده ۱۳ جدولی |
| `prisma/migrations/` | migration مرجع DDL و PostgreSQL RLS؛ اجرای واقعی PostgreSQL هنوز باید در CI تأیید شود |
| `src/core/tenant-context.ts` | استخراج و انتقال امن tenant context به transaction، بدون interpolation SQL |
| `src/core/worker-boundary.ts` | اجرای handler فقط در Worker Boundary؛ Queue Domain فقط envelope/lease را نگه می‌دارد |
| `docs/gap-register.json` | رجیستر ماشین‌خوان شکاف‌ها — منبع حقیقت سند ۱۶ |
| `scripts/render-gaps.ts` | بازتولید جداول سند ۱۶ از روی رجیستر |
| `scripts/render-design-coverage.ts` | اسکن پوشش طراحی و بازتولید جداول سند ۱۷ |
| `scripts/render-upgrade-contracts.ts` | بازتولید قرارداد ریزدانه سند ۲۳ از رجیستر ۱۰۰تایی |
| `apps/api/server.ts` | برش مرجع Control Plane: health، Run، SSE replay، rate limit و idempotency در حافظه |
| `openapi.yaml` | قرارداد OpenAPI همان برش مرجع |
| `apps/playground/` | کنسول مشاهده زنده: تصمیم‌های واقعی هسته را روی SSE نشان می‌دهد |
| `test/` | تست‌هایی که invariants را اثبات می‌کنند |

## قانون اصلی

مدل زبانی **پیشنهاد** می‌دهد؛ کد **تصمیم** می‌گیرد.

هیچ‌کدام از این تصمیم‌ها به مدل سپرده نمی‌شوند:

- انتقال بین حالت‌های اجرا → `src/core/state-machine.ts`
- مجاز بودن یک Tool Call و نیاز به تأیید → `src/core/policy-engine.ts`
- انتخاب ارائه‌دهنده مدل → `src/core/model-router.ts`
- پاک‌سازی secret پیش از خروج از فرایند → `src/core/redaction.ts`
- ترتیب و موازی‌سازی تسک‌ها → `src/core/task-dag.ts`
- پذیرش ادعای موفقیت → `src/core/evidence.ts`
- انتخاب مدل و ابزار از روی شواهد → `src/core/capability-evidence.ts`
- اینکه چه چیزی را برویم اندازه بگیریم → `src/core/canary-trials.ts`
- سقف خودمختاری، بودجه و قفل‌های ایمنی → `src/core/platform-settings.ts`
- مجوز، نشست، تصویب و زنجیره ممیزی → `src/core/security-baseline.ts`
- اعتبارسنجی خروجی مدل → `src/core/output-contract.ts`

## اجرا

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run check       # هر دو
```
