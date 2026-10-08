# ForgePilot — نقشه مهندسی پلتفرم ایجنت کدنویسی و اتوماسیون

این مخزن پاسخ مهندسی به این درخواست است:

> یک پلتفرم همه‌فن‌حریف که با ابزارها و APIهای رایگان، از صفر تا صد یک پروژه را
> طراحی، کدنویسی، تست و مستقر کند.

خروجی آن سه چیز است که با هم نگه داشته شده‌اند:

1. **سند طراحی کامل** — ۲۲۹ سند اصلی در [`docs/`](./docs/README.md) و برنامه مهندسی ۱۰۰ ارتقا
2. **کتابخانه پرامپت نسخه‌بندی‌شده** — ۱۳ ایجنت در [`prompts/`](./prompts/README.md)
3. **هسته قطعی قابل اجرا** — کدی که رفتارهای بحرانی را بدون وابستگی به مدل تضمین
   می‌کند، همراه با قراردادهای JSON Schema و ۶۱۱ تست
4. **ممیزی صادقانه شکاف‌ها** — رجیستر ماشین‌خوان ۱۹۶ موردی در
   [`docs/gap-register.json`](./docs/gap-register.json) و تحلیل آن در
   [`docs/16-gap-analysis.md`](./docs/16-gap-analysis.md)
5. **رجیستر ۱۰۰ ارتقا** — طراحی کامل ورودی، خروجی، مرز ایمنی و معیار پذیرش هر پیشنهاد در
   [`docs/22-upgrade-program.md`](./docs/22-upgrade-program.md) و
   [`docs/upgrade-register.json`](./docs/upgrade-register.json)

## قانون بنیادین

> **مدل زبانی پیشنهاد می‌دهد؛ کد تصمیم می‌گیرد.**

هیچ‌کدام از این تصمیم‌ها به مدل سپرده نمی‌شوند:

| تصمیم | مکان |
|---|---|
| انتقال بین حالت‌های اجرا | `src/core/state-machine.ts` |
| مجاز بودن یک Tool Call و نیاز به تأیید | `src/core/policy-engine.ts` |
| انتخاب ارائه‌دهنده مدل | `src/core/model-router.ts` |
| پیکربندی کل سیستم از روی حالت رایگان/پولی/لوکال | `src/core/compute-mode.ts` + `src/core/prompt-vars.ts` |
| پاک‌سازی secret پیش از خروج از فرایند | `src/core/redaction.ts` |
| ترتیب و موازی‌سازی تسک‌ها | `src/core/task-dag.ts` |
| پذیرش ادعای موفقیت | `src/core/evidence.ts` |
| اعتبارسنجی خروجی مدل | `src/core/output-contract.ts` |
| اینکه چه چیزی از طراحی هنوز ساخته نشده | `docs/gap-register.json` + `src/core/gap-register.ts` |
| انتخاب endpoint و کلید از میان لایه‌های رایگان | `src/core/free-provider-pool.ts` |
| اجرای Benchmark واقعی بدون شبیه‌سازی مهارت | `src/core/benchmark-runner.ts` |
| ثبت مصرف و توقف پیش از عبور از بودجه | `src/core/usage-ledger.ts` |
| Checkpoint زنجیره‌ای برای Resume و Replay | `src/core/checkpoint-store.ts` |
| Token کوتاه‌عمر و Bearer Auth بدون raw password | `src/core/session-auth.ts` |
| Queue با priority، retry، lease و DLQ | `src/core/job-queue.ts` |
| طراحی و وضعیت ۱۰۰ ارتقا | `docs/upgrade-register.json` + `src/core/upgrade-register.ts` |

## سوییچ حالت محاسباتی

کاربر یکی از سه حالت را انتخاب می‌کند و **همه‌چیز** از روی آن پیکربندی می‌شود:
ارائه‌دهندگان مجاز، سقف هزینه، بودجه توکن، حد تعمیر، تعداد تسک موازی،
دروازه‌های کیفیت، اجازه خروج داده از دستگاه، و متنی که به تک‌تک ۱۳ ایجنت داده
می‌شود.

| | رایگان | پولی | لوکال |
|---|---|---|---|
| ابر پولی | ❌ | ✅ | ❌ |
| هزینه هر Run | ۰ | تا سقف شما | ۰ |
| خروج داده از دستگاه | با رضایت | با رضایت | **هرگز** |
| تلاش تعمیر / تسک موازی | ۲ / ۲ | ۳ / ۴ | ۳ / ۱ |
| دروازه‌های کیفیت | ۶ | ۹ | ۸ |

جزئیات: [`docs/15-compute-modes.md`](./docs/15-compute-modes.md)

## وضعیت M9 تا M208

فازهای M9 تا M208 طراحی شده‌اند و در وضعیت **`designed_only`** از نظر production integration هستند؛ kernel/testهای جدید صرفاً وضعیت registry را از `designed_only` به `partial` می‌برند و production claim ایجاد نمی‌کنند. ماژول‌های
`src/core/` فقط قراردادهای deterministic، validation و decision kernel را اجرا
می‌کنند؛ persistence، UI، billing provider، evaluator runner، sandbox runtime،
marketplace، accessibility CI، data storage، scheduler، protocol gateway، event bus،
microVM، secret broker، restore runtime و شواهد production هنوز پیاده‌سازی یا ادعا نشده‌اند.
کدهای جدید با safety boundaryهای Local-first، BYOK و free-tier fallback نوشته شده‌اند
و raw password، CAPTCHA/MFA bypass، bulk account creation، push به `main` و اجرای
کد untrusted خارج از sandbox را مجاز نمی‌کنند.

## وضعیت M119 تا M208

هفده سری پنج‌فازی M119–M123، M124–M128، M129–M133، M134–M138، M139–M143، M144–M148، M149–M153، M159–M163، M164–M168، M169–M173، M174–M178، M179–M183، M184–M188، M189–M193، M194–M198، M199–M203 و M204–M208 نیز طراحی و به‌صورت contract kernel و تست deterministic اضافه شده‌اند؛ همه فازها عمداً `designed_only` از نظر production integration هستند:

- **M119:** Durable Tenant Transactions، RLS، Migration Safety و Transactional Outbox — [`docs/143-phase-m119-durable-tenant-and-transaction-runtime.md`](./docs/143-phase-m119-durable-tenant-and-transaction-runtime.md)
- **M120:** Reproducible Verification Matrix، CI، Security، Accessibility و Load Evidence — [`docs/144-phase-m120-verification-ci-security-accessibility.md`](./docs/144-phase-m120-verification-ci-security-accessibility.md)
- **M121:** SDK/API Compatibility، Safe CLI، Config Bootstrap و Developer Handoff — [`docs/145-phase-m121-sdk-cli-config-developer-handoff.md`](./docs/145-phase-m121-sdk-cli-config-developer-handoff.md)
- **M122:** Key Rotation، Privacy Erasure، Deletion Proof و Backup Retention — [`docs/146-phase-m122-key-rotation-erasure-deletion-proof-backup.md`](./docs/146-phase-m122-key-rotation-erasure-deletion-proof-backup.md)
- **M123:** Capacity Planning، Circuit Breaker، Failure Injection و Resilience Operations — [`docs/147-phase-m123-capacity-circuit-breaker-resilience.md`](./docs/147-phase-m123-capacity-circuit-breaker-resilience.md)
- **M124:** Audit Evidence Ledger، Provenance و Replay — [`docs/148-phase-m124-audit-evidence-ledger-and-replay.md`](./docs/148-phase-m124-audit-evidence-ledger-and-replay.md)
- **M125:** Identity Continuity، Session Revocation، Delegation و MFA Recovery — [`docs/149-phase-m125-identity-continuity-session-revocation.md`](./docs/149-phase-m125-identity-continuity-session-revocation.md)
- **M126:** Connector Consent، Signed Webhook Delivery و Reconciliation — [`docs/150-phase-m126-connector-consent-webhook-reconciliation.md`](./docs/150-phase-m126-connector-consent-webhook-reconciliation.md)
- **M127:** Benchmark Corpus، Deterministic Replay و Release Quality — [`docs/151-phase-m127-benchmark-replay-release-quality.md`](./docs/151-phase-m127-benchmark-replay-release-quality.md)
- **M128:** FinOps، Usage Ledger، Quota Scheduling و Provider Allocation — [`docs/152-phase-m128-finops-quota-and-provider-allocation.md`](./docs/152-phase-m128-finops-quota-and-provider-allocation.md)
- **M129:** API Evolution، Schema Migration و Stream Reconnect — [`docs/153-phase-m129-api-evolution-stream-reconnect.md`](./docs/153-phase-m129-api-evolution-stream-reconnect.md)
- **M130:** Artifact Supply Chain، SBOM و Attestation — [`docs/154-phase-m130-artifact-supply-chain-and-attestation.md`](./docs/154-phase-m130-artifact-supply-chain-and-attestation.md)
- **M131:** Approval Operations، Human Review و Escalation — [`docs/155-phase-m131-approval-operations-and-escalation.md`](./docs/155-phase-m131-approval-operations-and-escalation.md)
- **M132:** Knowledge ACL، Freshness و Context Lineage — [`docs/156-phase-m132-knowledge-freshness-and-context-lineage.md`](./docs/156-phase-m132-knowledge-freshness-and-context-lineage.md)
- **M133:** Self-host Upgrade، Backup Restore و Controlled Cutover — [`docs/157-phase-m133-self-host-upgrade-and-controlled-cutover.md`](./docs/157-phase-m133-self-host-upgrade-and-controlled-cutover.md)
- **M134:** Data Portability و Controlled Import — [`docs/158-phase-m134-data-portability-and-controlled-import.md`](./docs/158-phase-m134-data-portability-and-controlled-import.md)
- **M135:** Device Pairing و Local Trust — [`docs/159-phase-m135-device-pairing-and-local-trust.md`](./docs/159-phase-m135-device-pairing-and-local-trust.md)
- **M136:** Policy Distribution و Configuration Drift — [`docs/160-phase-m136-policy-distribution-and-drift.md`](./docs/160-phase-m136-policy-distribution-and-drift.md)
- **M137:** Incident Case، Containment و Postmortem — [`docs/161-phase-m137-incident-case-and-containment.md`](./docs/161-phase-m137-incident-case-and-containment.md)
- **M138:** Privacy-preserving Telemetry و Feedback — [`docs/162-phase-m138-privacy-preserving-telemetry-and-feedback.md`](./docs/162-phase-m138-privacy-preserving-telemetry-and-feedback.md)
- **M139:** Observability SLO و Trace Integrity — [`docs/163-phase-m139-observability-slo-and-trace-integrity.md`](./docs/163-phase-m139-observability-slo-and-trace-integrity.md)
- **M140:** Full-text Search و Query Governance — [`docs/164-phase-m140-search-query-governance.md`](./docs/164-phase-m140-search-query-governance.md)
- **M141:** Workflow Scheduler و Trigger Runtime — [`docs/165-phase-m141-workflow-scheduler-and-triggers.md`](./docs/165-phase-m141-workflow-scheduler-and-triggers.md)
- **M142:** Artifact Lifecycle و Preview Isolation — [`docs/166-phase-m142-artifact-lifecycle-and-preview-isolation.md`](./docs/166-phase-m142-artifact-lifecycle-and-preview-isolation.md)
- **M143:** Operator Console و Live Run UX — [`docs/167-phase-m143-operator-console-and-live-run-ux.md`](./docs/167-phase-m143-operator-console-and-live-run-ux.md)
- **M144:** Public API Surface و OpenAPI Compatibility — [`docs/168-phase-m144-public-api-surface-and-openapi.md`](./docs/168-phase-m144-public-api-surface-and-openapi.md)
- **M145:** Connector SDK و OAuth/PKCE Lifecycle — [`docs/169-phase-m145-connector-sdk-oauth-lifecycle.md`](./docs/169-phase-m145-connector-sdk-oauth-lifecycle.md)
- **M146:** Workspace VFS و Sandbox Resource Boundary — [`docs/170-phase-m146-workspace-vfs-and-sandbox-boundary.md`](./docs/170-phase-m146-workspace-vfs-and-sandbox-boundary.md)
- **M147:** Tenant Isolation و RLS Proof — [`docs/171-phase-m147-tenant-isolation-and-rls-proof.md`](./docs/171-phase-m147-tenant-isolation-and-rls-proof.md)
- **M148:** E2E Release Acceptance و Readiness — [`docs/172-phase-m148-e2e-release-acceptance-and-readiness.md`](./docs/172-phase-m148-e2e-release-acceptance-and-readiness.md)
- **M149:** Durable Worker Queue، Retry و DLQ — [`docs/173-phase-m149-worker-queue-retry-and-dlq.md`](./docs/173-phase-m149-worker-queue-retry-and-dlq.md)
- **M150:** Database Migration و Schema Governance — [`docs/174-phase-m150-database-migration-and-schema-governance.md`](./docs/174-phase-m150-database-migration-and-schema-governance.md)
- **M151:** GitHub App و Webhook/Action Integration — [`docs/175-phase-m151-github-app-and-webhook-action.md`](./docs/175-phase-m151-github-app-and-webhook-action.md)
- **M152:** Preview Environment و Deployment Routing — [`docs/176-phase-m152-preview-environment-and-routing.md`](./docs/176-phase-m152-preview-environment-and-routing.md)
- **M153:** Product E2E Orchestration و Failure Containment — [`docs/177-phase-m153-product-e2e-orchestration-and-containment.md`](./docs/177-phase-m153-product-e2e-orchestration-and-containment.md)
- **M159:** Data Residency و Regional Routing — [`docs/178-phase-m159-data-residency-and-regional-routing.md`](./docs/178-phase-m159-data-residency-and-regional-routing.md)
- **M160:** Feature Flags و Progressive Rollout — [`docs/179-phase-m160-feature-flags-and-progressive-rollout.md`](./docs/179-phase-m160-feature-flags-and-progressive-rollout.md)
- **M161:** Workload Identity و Service-account Leases — [`docs/180-phase-m161-workload-identity-and-service-account-leases.md`](./docs/180-phase-m161-workload-identity-and-service-account-leases.md)
- **M162:** Data Rights، Export و Deletion Orchestration — [`docs/181-phase-m162-data-rights-export-and-deletion.md`](./docs/181-phase-m162-data-rights-export-and-deletion.md)
- **M163:** FinOps Budget Guardrails و Usage Reconciliation — [`docs/182-phase-m163-finops-budget-guardrails-and-reconciliation.md`](./docs/182-phase-m163-finops-budget-guardrails-and-reconciliation.md)
- **M164:** Structured Output Repair و Response Safety — [`docs/183-phase-m164-structured-output-repair-and-response-safety.md`](./docs/183-phase-m164-structured-output-repair-and-response-safety.md)
- **M165:** Agent Delegation و Capability Tokens — [`docs/184-phase-m165-agent-delegation-and-capability-tokens.md`](./docs/184-phase-m165-agent-delegation-and-capability-tokens.md)
- **M166:** Cancellation و Compensation Runtime — [`docs/185-phase-m166-cancellation-and-compensation-runtime.md`](./docs/185-phase-m166-cancellation-and-compensation-runtime.md)
- **M167:** Reproducible Build و Release Manifest — [`docs/186-phase-m167-reproducible-build-and-release-manifest.md`](./docs/186-phase-m167-reproducible-build-and-release-manifest.md)
- **M168:** Outbound Webhook و Callback Delivery — [`docs/187-phase-m168-outbound-webhook-and-callback-delivery.md`](./docs/187-phase-m168-outbound-webhook-and-callback-delivery.md)
- **M169:** Context Provenance و Prompt-injection Firewall — [`docs/188-phase-m169-context-provenance-and-injection-firewall.md`](./docs/188-phase-m169-context-provenance-and-injection-firewall.md)
- **M170:** Tool Action Boundary و Transactional Approval — [`docs/189-phase-m170-tool-action-boundary-and-transactional-approval.md`](./docs/189-phase-m170-tool-action-boundary-and-transactional-approval.md)
- **M171:** Offline Sync و Conflict Resolution — [`docs/190-phase-m171-offline-sync-and-conflict-resolution.md`](./docs/190-phase-m171-offline-sync-and-conflict-resolution.md)
- **M172:** Accessibility و Localization Verification — [`docs/191-phase-m172-accessibility-and-localization-verification.md`](./docs/191-phase-m172-accessibility-and-localization-verification.md)
- **M173:** Incident Learning و Runbook Automation — [`docs/192-phase-m173-incident-learning-and-runbook-automation.md`](./docs/192-phase-m173-incident-learning-and-runbook-automation.md)
- **M174:** Prompt Experimentation و Rollback — [`docs/193-phase-m174-prompt-experimentation-and-rollback.md`](./docs/193-phase-m174-prompt-experimentation-and-rollback.md)
- **M175:** Multi-model Consensus و Voting — [`docs/194-phase-m175-multi-model-consensus-and-voting.md`](./docs/194-phase-m175-multi-model-consensus-and-voting.md)
- **M176:** Agent-to-agent Protocol و Interoperability — [`docs/195-phase-m176-agent-to-agent-protocol-and-interoperability.md`](./docs/195-phase-m176-agent-to-agent-protocol-and-interoperability.md)
- **M177:** Prompt Cache Integrity و Privacy — [`docs/196-phase-m177-prompt-cache-integrity-and-privacy.md`](./docs/196-phase-m177-prompt-cache-integrity-and-privacy.md)
- **M178:** Deployment Adapter و Release Target Boundary — [`docs/197-phase-m178-deployment-adapter-and-release-target-boundary.md`](./docs/197-phase-m178-deployment-adapter-and-release-target-boundary.md)
- **M179:** Pull-request Quality و Commit Provenance — [`docs/198-phase-m179-pull-request-quality-and-commit-provenance.md`](./docs/198-phase-m179-pull-request-quality-and-commit-provenance.md)
- **M180:** Agent Graph Orchestration و Durable Checkpoints — [`docs/199-phase-m180-agent-graph-orchestration-and-checkpoints.md`](./docs/199-phase-m180-agent-graph-orchestration-and-checkpoints.md)
- **M181:** Performance Budget و Load Shedding — [`docs/200-phase-m181-performance-budget-and-load-shedding.md`](./docs/200-phase-m181-performance-budget-and-load-shedding.md)
- **M182:** Onboarding و Safe First Run — [`docs/201-phase-m182-onboarding-and-safe-first-run.md`](./docs/201-phase-m182-onboarding-and-safe-first-run.md)
- **M183:** Service Entitlement، SLA و Degraded Disclosure — [`docs/202-phase-m183-service-entitlement-sla-and-degraded-disclosure.md`](./docs/202-phase-m183-service-entitlement-sla-and-degraded-disclosure.md)
- **M184:** Graph Engine Compatibility و State Interop — [`docs/203-phase-m184-graph-engine-compatibility-and-state-interop.md`](./docs/203-phase-m184-graph-engine-compatibility-and-state-interop.md)
- **M185:** Repository Intelligence و Retrieval Evidence — [`docs/204-phase-m185-repository-intelligence-and-retrieval-evidence.md`](./docs/204-phase-m185-repository-intelligence-and-retrieval-evidence.md)
- **M186:** Human Feedback و Preference Governance — [`docs/205-phase-m186-human-feedback-and-preference-governance.md`](./docs/205-phase-m186-human-feedback-and-preference-governance.md)
- **M187:** Dependency Risk و Vulnerability Response — [`docs/206-phase-m187-dependency-risk-and-vulnerability-response.md`](./docs/206-phase-m187-dependency-risk-and-vulnerability-response.md)
- **M188:** Schema Evolution و Consumer Compatibility — [`docs/207-phase-m188-schema-evolution-and-consumer-compatibility.md`](./docs/207-phase-m188-schema-evolution-and-consumer-compatibility.md)
- **M189:** Release Provenance و Promotion Evidence — [`docs/208-phase-m189-release-provenance-and-promotion-evidence.md`](./docs/208-phase-m189-release-provenance-and-promotion-evidence.md)
- **M190:** Egress Policy و Destination Governance — [`docs/209-phase-m190-egress-policy-and-destination-governance.md`](./docs/209-phase-m190-egress-policy-and-destination-governance.md)
- **M191:** Retention، Legal Hold و Secure Erasure — [`docs/210-phase-m191-retention-legal-hold-and-secure-erasure.md`](./docs/210-phase-m191-retention-legal-hold-and-secure-erasure.md)
- **M192:** Recovery، Chaos و Failover Evidence — [`docs/211-phase-m192-recovery-chaos-and-failover-evidence.md`](./docs/211-phase-m192-recovery-chaos-and-failover-evidence.md)
- **M193:** Tenant Fairness و Queue Scheduling — [`docs/212-phase-m193-tenant-fairness-and-queue-scheduling.md`](./docs/212-phase-m193-tenant-fairness-and-queue-scheduling.md)
- **M194:** Runtime Evidence Envelope و Claim Verification — [`docs/213-phase-m194-runtime-evidence-envelope-and-claim-verification.md`](./docs/213-phase-m194-runtime-evidence-envelope-and-claim-verification.md)
- **M195:** Provider Health و Circuit Recovery — [`docs/214-phase-m195-provider-health-and-circuit-recovery.md`](./docs/214-phase-m195-provider-health-and-circuit-recovery.md)
- **M196:** Plugin Capability Sandbox و Extension Certification — [`docs/215-phase-m196-plugin-capability-sandbox-and-extension-certification.md`](./docs/215-phase-m196-plugin-capability-sandbox-and-extension-certification.md)
- **M197:** Notification Delivery و Preference Governance — [`docs/216-phase-m197-notification-delivery-and-preference-governance.md`](./docs/216-phase-m197-notification-delivery-and-preference-governance.md)
- **M198:** Model Catalog Freshness و Capability Disclosure — [`docs/217-phase-m198-model-catalog-freshness-and-capability-disclosure.md`](./docs/217-phase-m198-model-catalog-freshness-and-capability-disclosure.md)
- **M199:** Intent Normalization و Scope Freeze — [`docs/218-phase-m199-intent-normalization-and-scope-freeze.md`](./docs/218-phase-m199-intent-normalization-and-scope-freeze.md)
- **M200:** Side-effect Journal و Idempotent Commit — [`docs/219-phase-m200-side-effect-journal-and-idempotent-commit.md`](./docs/219-phase-m200-side-effect-journal-and-idempotent-commit.md)
- **M201:** Connector Reconciliation و Drift Repair — [`docs/220-phase-m201-connector-reconciliation-and-drift-repair.md`](./docs/220-phase-m201-connector-reconciliation-and-drift-repair.md)
- **M202:** Approval Integrity و Decision Expiry — [`docs/221-phase-m202-approval-integrity-and-decision-expiry.md`](./docs/221-phase-m202-approval-integrity-and-decision-expiry.md)
- **M203:** Privacy-preserving Analytics و Aggregation — [`docs/222-phase-m203-privacy-preserving-analytics-and-aggregation.md`](./docs/222-phase-m203-privacy-preserving-analytics-and-aggregation.md)

این kernelها transaction store، CI provider، SDK registry، KMS، erasure worker، autoscaler یا chaos platform واقعی نیستند و هیچ production claim ایجاد نمی‌کنند.

## چه چیزی هنوز مانده

ممیزی کامل در [`docs/16-gap-analysis.md`](./docs/16-gap-analysis.md) — نتیجه یک‌خطی:

> **طراحی قوی است، اما بخش زیادی از پیاده‌سازی هنوز باز است.**

اکنون یک برش مرجع از Control Plane در `apps/api` و `openapi.yaml` وجود دارد:
health، ایجاد/خواندن/لغو Run، SSE replay، rate limit و idempotency در حافظه.
اما احراز هویت واقعی، persistence، migration، Web App و worker محصولی هنوز ساخته
نشده‌اند. `apps/playground` همچنان کنسول مشاهده است، نه خود محصول. این تفکیک در
رجیستر ثبت شده و با تست نگه داشته می‌شود:

```bash
npx tsx scripts/render-gaps.ts   # بازتولید جداول سند ۱۶ از روی رجیستر
npm test                         # همگامی سند و رجیستر را می‌سنجد

## انتخاب مدل بر پایه شواهد، نه بر پایه شهرت

پلتفرم از کجا می‌فهمد کدام مدل برای یک کار بهتر است؟ از **اندازه‌گیری**، نه از
خواندن درباره‌اش در وب.

`src/core/capability-evidence.ts` شواهد را لایه‌بندی می‌کند: اندازه‌گیری داخلی
در صدر، بنچمارک بازتولیدشده، ادعای فروشنده، و در آخر سیگنال جمع‌شده از وب با
**سقف نفوذ ۱۵٪**. به‌علاوه پوسیدگی زمانی، سقف per-domain، و تشخیص
astroturfing.

نتیجه واقعی روی اجرای زنده: مدلی با ۳۰۰ پست هماهنگ‌شده و امتیاز خام ۰٫۹۹
رتبه چهارم از پنج شد، چون هیچ اندازه‌گیری داخلی نداشت.

## حلقه canary — چگونه از حدس بیرون می‌آییم

دانستن اینکه «نمی‌دانیم» کافی نیست. `src/core/canary-trials.ts` یک
multi-armed bandit کامل است: پسین Beta–Bernoulli، نمونه‌گیری Thompson با
PRNG seed‌دار (قابل بازپخش)، آزمون ترتیبی SPRT که زود متوقف می‌شود، مقایسه
زوجی McNemar تا سختی تسک حذف شود، و چهار guardrail.

نتیجه واقعی: مدلی با ۳۰۰ پست هماهنگ‌شده و امتیاز خام ۰٫۹۹، بعد از ۱۲ آزمایش
واقعی با نرخ ۰٫۳۳ **آخر ماند**.

## استخر ارائه‌دهندگان رایگان

لایه رایگان هر ارائه‌دهنده به‌تنهایی یک اسباب‌بازی است؛ روی هم ظرفیت واقعی
می‌شود. الهام از [freellmapi](https://github.com/tashfeenahmed/freellmapi) (MIT)
— نه پراکسی آن، بلکه چهار مکانیزمی که توده‌ای از لایه‌های رایگان را مثل یک
ارائه‌دهنده قابل اتکا رفتار می‌دهد:

| مکانیزم | چرا |
|---|---|
| سهمیه آگاه از توکن (`rpm/rpd/tpm/tpd/monthly`) | لایه رایگان با **توکن در روز** سقف می‌گذارد؛ شمارنده درخواست‌محور بی‌صدا وارد ۴۲۹ می‌شود |
| Failover با cooldown رو به رشد + چرخش کلید | کلید نرخ‌محدودشده پارک می‌شود، نه اینکه دوباره کوبیده شود |
| گروه یکپارچه + زنجیره نام‌دار (`auto:coding`) | یک مدل روی چهار ارائه‌دهنده = یک ورودی؛ failover درون گروه |
| Sticky session با handoff note | عوض شدن مدل وسط مکالمه یک تغییر رفتار بی‌صداست |

دیوار حالت محاسباتی **قبل از هر امتیازدهی** اعمال می‌شود، پس هیچ استراتژی
مسیریابی نمی‌تواند از حالت انتخابی کاربر عبور کند.

جزئیات: [`docs/18-free-provider-pool.md`](./docs/18-free-provider-pool.md)

## سه تصمیمی که شکل محصول را تعیین می‌کنند

1. **خودکارسازی حداکثری با نقاط کنترل انسانی** — نه استقلال بی‌قیدوشرط.
2. **Local-first + BYOK** — مدل و اجرا روی ماشین کاربر؛ API رایگان گزینه تکمیلی
   است، نه زیرساخت.
3. **MVP فقط روی GitHub** — سپس کانکتورها مرحله‌ای اضافه می‌شوند.

جزئیات و دلایل در [`docs/00-request-review.md`](./docs/00-request-review.md).

## ساختار

```
docs/        ۲۲۹ سند طراحی + upgrade-register.json + gap-register.json
prompts/     ۱۳ ایجنت + ۶ قطعه مشترک + README
schema/      ۱۲ قرارداد JSON Schema
examples/    ۱۳ نمونه معتبر (هم مستند، هم fixture تست)
src/core/    ۲۰۰ ماژول هسته قطعی؛ Control Plane، Evaluation Integrity، Secure Supply Chain، Resilience Operations و Delivery Trust نیز اضافه شده‌اند؛ integration تولیدی هنوز لازم است
prisma/      مدل داده (۱۳ جدول، migration مرجع DDL و RLS؛ اجرای durable هنوز لازم است)
test/        ۶۷ فایل / ۶۱۱ تست
scripts/     show-prompt.ts + render-gaps.ts + render-design-coverage.ts + render-upgrade-contracts.ts
apps/        api — برش مرجع کنترل + playground — کنسول مشاهده زنده
```

## اجرا

```bash
npm install
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm run check        # هر دو
```

## شروع مطالعه

| اگر می‌خواهید بدانید… | بروید به |
|---|---|
| چه چیزی در درخواست اولیه کم بود | [`docs/00-request-review.md`](./docs/00-request-review.md) |
| محصول دقیقاً چیست و چه نیست | [`docs/01-product-definition.md`](./docs/01-product-definition.md) |
| چه ایجنت‌هایی وجود دارند | [`docs/02-roles-and-agents.md`](./docs/02-roles-and-agents.md) |
| معماری و ساختار مخزن | [`docs/03-architecture.md`](./docs/03-architecture.md) |
| پرامپت مادر Orchestrator | [`prompts/00-orchestrator.md`](./prompts/00-orchestrator.md) |
| چطور یک Run از درخواست به PR می‌رسد | [`docs/04-agent-state-machine.md`](./docs/04-agent-state-machine.md) |
| تفاوت رایگان / پولی / لوکال | [`docs/15-compute-modes.md`](./docs/15-compute-modes.md) |
| امنیت و sandbox | [`docs/07-sandbox-and-security.md`](./docs/07-sandbox-and-security.md) |
| از کجا شروع به ساختن کنیم | [`docs/13-roadmap-and-cost.md`](./docs/13-roadmap-and-cost.md) |
| چه چیزی هنوز ساخته نشده | [`docs/16-gap-analysis.md`](./docs/16-gap-analysis.md) |
| قرارداد اجرایی ریزدانه هر ۱۰۰ پیشنهاد | [`docs/23-upgrade-contracts.md`](./docs/23-upgrade-contracts.md) |
| فاز بعدی durable control plane | [`docs/24-phase-m1-durable-control-plane.md`](./docs/24-phase-m1-durable-control-plane.md) |
| فاز M2 repository intelligence و GitHub loop | [`docs/25-phase-m2-repository-intelligence-and-github-loop.md`](./docs/25-phase-m2-repository-intelligence-and-github-loop.md) |
| فاز M3 sandbox، execution plane و security hardening | [`docs/26-phase-m3-sandbox-execution-and-security.md`](./docs/26-phase-m3-sandbox-execution-and-security.md) |
| فاز M4 product experience، observability و human control | [`docs/27-phase-m4-product-experience-observability-and-operations.md`](./docs/27-phase-m4-product-experience-observability-and-operations.md) |
| فاز M5 connector SDK، governed integrations و agent interoperability | [`docs/28-phase-m5-connector-sdk-and-governed-extensibility.md`](./docs/28-phase-m5-connector-sdk-and-governed-extensibility.md) |
| فاز M6 browser automation، human-in-the-loop و controlled web interaction | [`docs/29-phase-m6-browser-automation-and-human-in-loop.md`](./docs/29-phase-m6-browser-automation-and-human-in-loop.md) |
| فاز M7 deploy، preview و release engineering | [`docs/30-phase-m7-deploy-preview-and-release-engineering.md`](./docs/30-phase-m7-deploy-preview-and-release-engineering.md) |
| فاز M8 production reliability، capacity و disaster recovery | [`docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md`](./docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md) |
| فاز M9 collaboration، project bootstrap و developer workflow | [`docs/32-phase-m9-collaboration-and-project-bootstrap.md`](./docs/32-phase-m9-collaboration-and-project-bootstrap.md) |
| فاز M10 evaluation، quality gates و multi-model consensus | [`docs/33-phase-m10-evaluation-quality-and-consensus.md`](./docs/33-phase-m10-evaluation-quality-and-consensus.md) |
| فاز M11 billing، metering و entitlements | [`docs/34-phase-m11-billing-metering-and-entitlements.md`](./docs/34-phase-m11-billing-metering-and-entitlements.md) |
| فاز M12 internationalization، localization و accessibility | [`docs/35-phase-m12-internationalization-and-accessibility.md`](./docs/35-phase-m12-internationalization-and-accessibility.md) |
| فاز M13 governed plugin ecosystem و marketplace boundary | [`docs/36-phase-m13-governed-plugin-ecosystem.md`](./docs/36-phase-m13-governed-plugin-ecosystem.md) |
| فاز M14 data governance و privacy lifecycle | [`docs/37-phase-m14-data-governance-and-privacy-lifecycle.md`](./docs/37-phase-m14-data-governance-and-privacy-lifecycle.md) |
| فاز M15 workflow automation و event-driven triggers | [`docs/38-phase-m15-workflow-automation-and-triggers.md`](./docs/38-phase-m15-workflow-automation-and-triggers.md) |
| فاز M16 memory، knowledge و context retrieval | [`docs/39-phase-m16-memory-and-context-retrieval.md`](./docs/39-phase-m16-memory-and-context-retrieval.md) |
| فاز M17 agent protocol و interoperability gateway | [`docs/40-phase-m17-agent-protocol-and-interoperability.md`](./docs/40-phase-m17-agent-protocol-and-interoperability.md) |
| فاز M18 organization governance و policy-as-code | [`docs/41-phase-m18-organization-governance-and-policy.md`](./docs/41-phase-m18-organization-governance-and-policy.md) |
| فاز M24 intake، planning و collaboration | [`docs/48-phase-m24-intake-planning-and-collaboration.md`](./docs/48-phase-m24-intake-planning-and-collaboration.md) |
| فاز M25 evidence-grounded routing و operations | [`docs/49-phase-m25-evidence-grounded-routing-and-operations.md`](./docs/49-phase-m25-evidence-grounded-routing-and-operations.md) |
| فاز M26 secure knowledge fabric | [`docs/50-phase-m26-secure-knowledge-fabric.md`](./docs/50-phase-m26-secure-knowledge-fabric.md) |
| فاز M27 privacy-aware retrieval و local index | [`docs/51-phase-m27-privacy-aware-retrieval-and-local-index.md`](./docs/51-phase-m27-privacy-aware-retrieval-and-local-index.md) |
| فاز M28 governance، quality و transparency | [`docs/52-phase-m28-governance-quality-and-transparency.md`](./docs/52-phase-m28-governance-quality-and-transparency.md) |
| فاز M29 durable runtime foundation | [`docs/53-phase-m29-durable-runtime-foundation.md`](./docs/53-phase-m29-durable-runtime-foundation.md) |
| فاز M30 sandbox execution و workspace runtime | [`docs/54-phase-m30-sandbox-execution-and-workspace-runtime.md`](./docs/54-phase-m30-sandbox-execution-and-workspace-runtime.md) |
| فاز M31 connector و provider runtime | [`docs/55-phase-m31-connector-and-provider-runtime.md`](./docs/55-phase-m31-connector-and-provider-runtime.md) |
| فاز M32 operations evidence و disaster recovery | [`docs/56-phase-m32-operations-evidence-and-disaster-recovery.md`](./docs/56-phase-m32-operations-evidence-and-disaster-recovery.md) |
| فاز M33 product surface و approval clients | [`docs/57-phase-m33-product-surface-and-approval-clients.md`](./docs/57-phase-m33-product-surface-and-approval-clients.md) |
| فاز M34 identity، membership و access runtime | [`docs/58-phase-m34-identity-membership-and-access-runtime.md`](./docs/58-phase-m34-identity-membership-and-access-runtime.md) |
| فاز M35 evaluation و benchmark runtime | [`docs/59-phase-m35-evaluation-and-benchmark-runtime.md`](./docs/59-phase-m35-evaluation-and-benchmark-runtime.md) |
| فاز M36 repository intelligence و context runtime | [`docs/60-phase-m36-repository-intelligence-and-context-runtime.md`](./docs/60-phase-m36-repository-intelligence-and-context-runtime.md) |
| فاز M37 preview، artifact و delivery runtime | [`docs/61-phase-m37-preview-artifact-and-delivery-runtime.md`](./docs/61-phase-m37-preview-artifact-and-delivery-runtime.md) |
| فاز M38 security، privacy و governance runtime | [`docs/62-phase-m38-security-privacy-and-governance-runtime.md`](./docs/62-phase-m38-security-privacy-and-governance-runtime.md) |
| فاز M39 agent interaction و streaming runtime | [`docs/63-phase-m39-agent-interaction-and-streaming-runtime.md`](./docs/63-phase-m39-agent-interaction-and-streaming-runtime.md) |
| فاز M40 connector gateway و interoperability runtime | [`docs/64-phase-m40-connector-gateway-and-interoperability-runtime.md`](./docs/64-phase-m40-connector-gateway-and-interoperability-runtime.md) |
| فاز M41 data lifecycle، analytics و metering runtime | [`docs/65-phase-m41-data-lifecycle-analytics-and-metering-runtime.md`](./docs/65-phase-m41-data-lifecycle-analytics-and-metering-runtime.md) |
| فاز M42 quality، CI و verification runtime | [`docs/66-phase-m42-quality-ci-and-verification-runtime.md`](./docs/66-phase-m42-quality-ci-and-verification-runtime.md) |
| فاز M43 self-host، release و resilience runtime | [`docs/67-phase-m43-self-host-release-and-resilience-runtime.md`](./docs/67-phase-m43-self-host-release-and-resilience-runtime.md) |
| فاز M44 collaboration، onboarding و Run workspace | [`docs/68-phase-m44-collaboration-onboarding-and-run-workspace.md`](./docs/68-phase-m44-collaboration-onboarding-and-run-workspace.md) |
| فاز M45 localization، design system و degraded clients | [`docs/69-phase-m45-localization-design-and-degraded-clients.md`](./docs/69-phase-m45-localization-design-and-degraded-clients.md) |
| فاز M46 browser automation و external signals | [`docs/70-phase-m46-browser-automation-and-external-signals.md`](./docs/70-phase-m46-browser-automation-and-external-signals.md) |
| فاز M47 legal، licensing و enterprise governance | [`docs/71-phase-m47-legal-licensing-and-enterprise-governance.md`](./docs/71-phase-m47-legal-licensing-and-enterprise-governance.md) |
| فاز M48 production integration evidence و controlled cutover | [`docs/72-phase-m48-production-integration-evidence-and-cutover.md`](./docs/72-phase-m48-production-integration-evidence-and-cutover.md) |
| فاز M49 platform connections، OAuth/PKCE و consent | [`docs/73-phase-m49-platform-connections-oauth-and-consent.md`](./docs/73-phase-m49-platform-connections-oauth-and-consent.md) |
| فاز M50 unified connector capabilities و normalized actions | [`docs/74-phase-m50-unified-connector-capabilities-and-actions.md`](./docs/74-phase-m50-unified-connector-capabilities-and-actions.md) |
| فاز M51 cross-platform handoff، deep links و import/export | [`docs/75-phase-m51-cross-platform-handoff-and-deep-links.md`](./docs/75-phase-m51-cross-platform-handoff-and-deep-links.md) |
| فاز M52 platform sync، webhook و conflict resolution | [`docs/76-phase-m52-platform-sync-and-conflict-resolution.md`](./docs/76-phase-m52-platform-sync-and-conflict-resolution.md) |
| فاز M53 connection center، health، recovery و fallback | [`docs/77-phase-m53-connection-center-health-and-fallback.md`](./docs/77-phase-m53-connection-center-health-and-fallback.md) |
| فاز M54 visual app studio و prompt-to-UI | [`docs/78-phase-m54-visual-app-studio-and-prompt-to-ui.md`](./docs/78-phase-m54-visual-app-studio-and-prompt-to-ui.md) |
| فاز M55 design-to-code و UX verification | [`docs/79-phase-m55-design-to-code-and-ux-verification.md`](./docs/79-phase-m55-design-to-code-and-ux-verification.md) |
| فاز M56 web AI model discovery و free API verification | [`docs/80-phase-m56-web-ai-model-discovery-and-free-api.md`](./docs/80-phase-m56-web-ai-model-discovery-and-free-api.md) |
| فاز M57 comprehensive AI directory و model cards | [`docs/81-phase-m57-comprehensive-ai-directory-and-model-cards.md`](./docs/81-phase-m57-comprehensive-ai-directory-and-model-cards.md) |
| فاز M58 model catalog governance و safe activation | [`docs/82-phase-m58-model-catalog-governance-and-safe-activation.md`](./docs/82-phase-m58-model-catalog-governance-and-safe-activation.md) |
| فاز M59 visual studio integration و preview | [`docs/83-phase-m59-visual-studio-integration-and-preview.md`](./docs/83-phase-m59-visual-studio-integration-and-preview.md) |
| فاز M60 model evaluation و trust gate | [`docs/84-phase-m60-model-evaluation-and-trust.md`](./docs/84-phase-m60-model-evaluation-and-trust.md) |
| فاز M61 model provider runtime و intelligent routing | [`docs/85-phase-m61-model-provider-runtime-and-routing.md`](./docs/85-phase-m61-model-provider-runtime-and-routing.md) |
| فاز M62 AI workflow builder و agent graphs | [`docs/86-phase-m62-ai-workflow-builder-and-agent-graphs.md`](./docs/86-phase-m62-ai-workflow-builder-and-agent-graphs.md) |
| فاز M63 AI platform operations و governance | [`docs/87-phase-m63-ai-platform-operations-and-governance.md`](./docs/87-phase-m63-ai-platform-operations-and-governance.md) |
| فاز M64 product control-plane، API و approvals | [`docs/88-phase-m64-product-control-plane-and-api.md`](./docs/88-phase-m64-product-control-plane-and-api.md) |
| فاز M65 durable persistence، event bus و job leases | [`docs/89-phase-m65-durable-persistence-and-event-bus.md`](./docs/89-phase-m65-durable-persistence-and-event-bus.md) |
| فاز M66 sandbox execution و workspace integration | [`docs/90-phase-m66-sandbox-execution-and-workspace-integration.md`](./docs/90-phase-m66-sandbox-execution-and-workspace-integration.md) |
| فاز M67 external integration gates و adapter probes | [`docs/91-phase-m67-external-integration-gates.md`](./docs/91-phase-m67-external-integration-gates.md) |
| فاز M68 pilot release، E2E و release gates | [`docs/92-phase-m68-pilot-release-and-e2e-gates.md`](./docs/92-phase-m68-pilot-release-and-e2e-gates.md) |
| فاز M69 enterprise identity، membership و delegation | [`docs/93-phase-m69-enterprise-identity-and-membership.md`](./docs/93-phase-m69-enterprise-identity-and-membership.md) |
| فاز M70 privacy lifecycle، data rights و deletion evidence | [`docs/94-phase-m70-privacy-lifecycle-and-data-rights.md`](./docs/94-phase-m70-privacy-lifecycle-and-data-rights.md) |
| فاز M71 developer experience، SDK، CLI و API contract | [`docs/95-phase-m71-developer-experience-and-sdk.md`](./docs/95-phase-m71-developer-experience-and-sdk.md) |
| فاز M72 extension marketplace و plugin trust | [`docs/96-phase-m72-extension-marketplace-and-plugin-trust.md`](./docs/96-phase-m72-extension-marketplace-and-plugin-trust.md) |
| فاز M73 platform resilience و DR | [`docs/97-phase-m73-platform-resilience-and-dr.md`](./docs/97-phase-m73-platform-resilience-and-dr.md) |
| فاز M74 product experience، client contracts و accessibility | [`docs/98-phase-m74-product-experience-and-accessibility.md`](./docs/98-phase-m74-product-experience-and-accessibility.md) |
| فاز M75 evaluation harness، benchmark و regression gates | [`docs/99-phase-m75-evaluation-harness-and-regression.md`](./docs/99-phase-m75-evaluation-harness-and-regression.md) |
| فاز M76 execution fabric، workspace/VFS و sandbox | [`docs/100-phase-m76-execution-fabric-and-sandbox.md`](./docs/100-phase-m76-execution-fabric-and-sandbox.md) |
| فاز M77 connector delivery، webhook و rate limits | [`docs/101-phase-m77-connector-delivery-and-webhooks.md`](./docs/101-phase-m77-connector-delivery-and-webhooks.md) |
| فاز M78 self-host release، CI و upgrade gates | [`docs/102-phase-m78-self-host-release-and-ci.md`](./docs/102-phase-m78-self-host-release-and-ci.md) |
| فاز M79 secure knowledge fabric، context و repository intelligence | [`docs/103-phase-m79-knowledge-context-and-repository-intelligence.md`](./docs/103-phase-m79-knowledge-context-and-repository-intelligence.md) |
| فاز M80 prompt safety، injection detection و output trust | [`docs/104-phase-m80-prompt-safety-and-output-trust.md`](./docs/104-phase-m80-prompt-safety-and-output-trust.md) |
| فاز M81 collaboration، onboarding و usage control | [`docs/105-phase-m81-collaboration-onboarding-and-usage.md`](./docs/105-phase-m81-collaboration-onboarding-and-usage.md) |
| فاز M82 integration adapters و browser runtime | [`docs/106-phase-m82-integration-adapters-and-browser.md`](./docs/106-phase-m82-integration-adapters-and-browser.md) |
| فاز M83 data governance، legal و disclosure | [`docs/107-phase-m83-data-governance-legal-and-disclosure.md`](./docs/107-phase-m83-data-governance-legal-and-disclosure.md) |
| فاز M84 agent orchestration، workflow graph و checkpoints | [`docs/108-phase-m84-agent-orchestration-and-checkpoints.md`](./docs/108-phase-m84-agent-orchestration-and-checkpoints.md) |
| فاز M85 public API، worker lease و stream runtime | [`docs/109-phase-m85-api-worker-and-stream-runtime.md`](./docs/109-phase-m85-api-worker-and-stream-runtime.md) |
| فاز M86 provider economics، quota و routing | [`docs/110-phase-m86-provider-economics-and-routing.md`](./docs/110-phase-m86-provider-economics-and-routing.md) |
| فاز M87 quality integration، E2E و accessibility | [`docs/111-phase-m87-quality-integration-and-e2e.md`](./docs/111-phase-m87-quality-integration-and-e2e.md) |
| فاز M88 release certification، canary و cutover | [`docs/112-phase-m88-release-certification-and-cutover.md`](./docs/112-phase-m88-release-certification-and-cutover.md) |
| فاز M89 observability، SLO و incident command | [`docs/113-phase-m89-observability-and-incident-command.md`](./docs/113-phase-m89-observability-and-incident-command.md) |
| فاز M90 durable data plane، event store و governed search | [`docs/114-phase-m90-durable-data-plane-and-search.md`](./docs/114-phase-m90-durable-data-plane-and-search.md) |
| فاز M91 billing، entitlements و usage reconciliation | [`docs/115-phase-m91-billing-and-entitlements.md`](./docs/115-phase-m91-billing-and-entitlements.md) |
| فاز M92 human approval، review queue و escalation | [`docs/116-phase-m92-approval-review-and-escalation.md`](./docs/116-phase-m92-approval-review-and-escalation.md) |
| فاز M93 deployment operations و self-host | [`docs/117-phase-m93-deployment-operations-and-self-host.md`](./docs/117-phase-m93-deployment-operations-and-self-host.md) |
| فاز M94 retrieval، semantic memory و human feedback | [`docs/118-phase-m94-retrieval-memory-and-feedback.md`](./docs/118-phase-m94-retrieval-memory-and-feedback.md) |
| فاز M95 supply-chain، artifact provenance و injection security | [`docs/119-phase-m95-supply-chain-and-injection-security.md`](./docs/119-phase-m95-supply-chain-and-injection-security.md) |
| فاز M96 browser automation، external signals و webhook delivery | [`docs/120-phase-m96-browser-signal-and-webhook-delivery.md`](./docs/120-phase-m96-browser-signal-and-webhook-delivery.md) |
| فاز M97 localization، RTL accessibility و degraded clients | [`docs/121-phase-m97-localization-and-degraded-clients.md`](./docs/121-phase-m97-localization-and-degraded-clients.md) |
| فاز M98 project templates، workspace bootstrap و handoff | [`docs/122-phase-m98-workspace-bootstrap-and-handoff.md`](./docs/122-phase-m98-workspace-bootstrap-and-handoff.md) |
| فاز M99 agent delegation، structured streaming و tool safety | [`docs/123-phase-m99-agent-delegation-and-streaming.md`](./docs/123-phase-m99-agent-delegation-and-streaming.md) |
| فاز M100 durable workflow، queue و scheduling | [`docs/124-phase-m100-workflow-queue-and-scheduling.md`](./docs/124-phase-m100-workflow-queue-and-scheduling.md) |
| فاز M101 connector platform، OAuth/PKCE و GitHub App gates | [`docs/125-phase-m101-connectors-and-platform-gates.md`](./docs/125-phase-m101-connectors-and-platform-gates.md) |
| فاز M102 privacy lifecycle، retention و tenant boundary | [`docs/126-phase-m102-privacy-retention-and-tenant-boundary.md`](./docs/126-phase-m102-privacy-retention-and-tenant-boundary.md) |
| فاز M103 evaluation، E2E و release quality | [`docs/127-phase-m103-evaluation-and-release-quality.md`](./docs/127-phase-m103-evaluation-and-release-quality.md) |
| فاز M104 API contracts، versioning و stream reconnect | [`docs/128-phase-m104-api-contracts-and-stream-reconnect.md`](./docs/128-phase-m104-api-contracts-and-stream-reconnect.md) |
| فاز M105 identity، membership و MFA | [`docs/129-phase-m105-identity-and-membership.md`](./docs/129-phase-m105-identity-and-membership.md) |
| فاز M106 artifact lifecycle، preview و signed delivery | [`docs/130-phase-m106-artifact-preview-and-delivery.md`](./docs/130-phase-m106-artifact-preview-and-delivery.md) |
| فاز M107 observability، SLO، incident command و FinOps | [`docs/131-phase-m107-observability-and-finops.md`](./docs/131-phase-m107-observability-and-finops.md) |
| فاز M108 self-host، backup/restore و controlled cutover | [`docs/132-phase-m108-self-host-and-controlled-cutover.md`](./docs/132-phase-m108-self-host-and-controlled-cutover.md) |
| فاز M109 context assembly و repository intelligence | [`docs/133-phase-m109-context-assembly-and-repository-intelligence.md`](./docs/133-phase-m109-context-assembly-and-repository-intelligence.md) |
| فاز M110 model discovery، AI directory و free API verification | [`docs/134-phase-m110-model-discovery-and-ai-directory.md`](./docs/134-phase-m110-model-discovery-and-ai-directory.md) |
| فاز M111 plugin marketplace و extension trust | [`docs/135-phase-m111-plugin-marketplace-and-extension-trust.md`](./docs/135-phase-m111-plugin-marketplace-and-extension-trust.md) |
| فاز M112 product collaboration، onboarding و notifications | [`docs/136-phase-m112-product-collaboration-and-onboarding.md`](./docs/136-phase-m112-product-collaboration-and-onboarding.md) |
| فاز M113 data plane، event store، search و analytics | [`docs/137-phase-m113-data-plane-and-analytics.md`](./docs/137-phase-m113-data-plane-and-analytics.md) |
| فاز M114 legal، disclosure و output rights | [`docs/138-phase-m114-legal-disclosure-and-output-rights.md`](./docs/138-phase-m114-legal-disclosure-and-output-rights.md) |
| فاز M115 provider routing، quota و economics | [`docs/139-phase-m115-provider-routing-and-economics.md`](./docs/139-phase-m115-provider-routing-and-economics.md) |
| فاز M116 platform sync، conflict resolution و health | [`docs/140-phase-m116-platform-sync-and-health.md`](./docs/140-phase-m116-platform-sync-and-health.md) |
| فاز M117 abuse prevention، DLP و safety governance | [`docs/141-phase-m117-abuse-safety-and-dlp.md`](./docs/141-phase-m117-abuse-safety-and-dlp.md) |
| فاز M118 production evidence، readiness و cutover | [`docs/142-phase-m118-production-evidence-and-cutover.md`](./docs/142-phase-m118-production-evidence-and-cutover.md) |
| ممیزی جامع capabilityها و انتخاب فازهای بعدی | [`docs/42-comprehensive-capability-audit.md`](./docs/42-comprehensive-capability-audit.md) |
