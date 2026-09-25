# پوشش طراحی: چه چیزی اصلاً طراحی نشده

تاریخ ممیزی: ۲۰۲۶-۰۹-۱۰ — تولیدشده با `scripts/render-design-coverage.ts`

## این سند چه سؤالی را جواب می‌دهد

دو سؤال با هم متفاوت‌اند و اشتباه گرفتنشان خطرناک است:

| سؤال | منبع | جواب |
|---|---|---|
| چه چیزی **طراحی شده ولی ساخته نشده**؟ | `docs/16-gap-analysis.md` | ۱۰۹ شکاف، ۲۳ بلوکر |
| چه چیزی **اصلاً طراحی نشده**؟ | همین سند | جدول زیر |

سند ۱۶ درباره فاصله طراحی تا کد است. این سند درباره فاصله *نیاز* تا طراحی است —
موضوعاتی که پلتفرمی در این ابعاد باید درباره‌شان موضع صریح داشته باشد و ندارد.

## روش

۱۰۶ موضوع فهرست شده‌اند (`src/core/design-coverage.ts`). هر موضوع با مجموعه‌ای
الگوی کلیدواژه در اسناد طراحی جست‌وجو می‌شود و یکی از سه وضعیت را می‌گیرد:

| وضعیت | قاعده |
|---|---|
| ✅ طراحی‌شده | بیش از ۲ ذکر — یعنی سند درباره‌اش استدلال کرده |
| 🟡 نازک | ۱ یا ۲ ذکر — نام برده شده، طراحی نشده |
| 🔴 بدون طراحی | صفر ذکر در همه اسناد |

**پایه شواهد:** همه اسناد طراحی `docs/` به‌جز اسناد ۱۶، ۱۷ و قرارداد تولیدی ۲۳، به‌همراه `README.md` و
`prompts/README.md`. اسناد خود ممیزی عمداً حذف شده‌اند، وگرنه همین سند
«پوشش» موضوعاتی می‌شد که خودش نبودشان را گزارش می‌کند و عدد دوری می‌شد.

**قاعده نگهداری:** هر موضوع نازک یا بدون طراحی باید «چه چیزی آن را می‌بندد»
داشته باشد، و هر موضوعی که طراحی شد باید بسته‌شدنش حذف شود. این دو جهت با تست
`test/design-coverage.test.ts` اجبار می‌شود، پس فهرست در هیچ جهتی نمی‌پوسد.

## پنج یافته‌ای که از بقیه مهم‌ترند

### ۱. LangGraph فقط یک ردیف در جدول لایسنس است

`langgraph` در **کل مخزن یک بار** آمده: `docs/14-licensing-and-legal.md` سطر ۳۰،
در جدول لایسنس ابزارها. یعنی یک الزام صریح مشخصات اولیه، هیچ طراحی ندارد.

سؤال بی‌پاسخ: ارکستراسیون با LangGraph است یا با ماشین حالت داخلی
(`src/core/state-machine.ts`)؟ این دو با هم نمی‌سازند — ماشین حالت ما جدول
انتقال قطعی با invariant است، LangGraph گراف با checkpoint. اگر هر دو بمانند،
دو منبع حقیقت برای «Run الان کجاست» خواهیم داشت.

### ۲. Repository Intelligence اکنون طراحی شده، اما اجرا نشده

`repo indexing / RAG` و `code search in repo` در سند M2 طراحی شده‌اند: snapshot
به commit bind می‌شود، AST/lexical مسیر پایه است و semantic فقط با consent فعال
می‌شود. هنوز indexer، retrieval isolation و benchmark واقعی ساخته نشده‌اند؛ پس
این موضوع از نظر طراحی بسته و از نظر implementation باز است.

### ۳. Permission Ladder اکنون طراحی شده، اما runtime آن غایب است

سند M3 پلکان `L0` تا `L4`، approval، TTL، scope hash، revoke و stop rule را
تعریف می‌کند. با این حال بدون Sandbox runtime و policy integration واقعی، هیچ
ارتقای دسترسی قابل‌اعتماد نیست. این موضوع دیگر «بدون طراحی» نیست؛ evidence اجرای
آن باقی مانده است.

### ۴. سقف توکن اعلامی است، نه اندازه‌گیری‌شده

`compute-mode` سقف توکن و «توقف سخت» را تعریف می‌کند، ولی metering production،
ledger پایدار و اتصال provider هنوز ساخته نشده است. M11 اکنون contract/kernel
`src/core/entitlements.ts` را دارد؛ این implementation evidence جای اجرای durable را
نمی‌گیرد.

### ۵. ده فاز جدید طراحی‌شده‌اند، اما production نیستند

M9 تا M18 اکنون در اسناد canonical و registry پوشش دارند و kernelهای deterministic
آن‌ها تست شده‌اند. بااین‌حال data storage، scheduler، memory/vector integration،
protocol gateway، policy runtime، UI/CI و شواهد production هنوز gap هستند. وضعیت هر
ده فاز عمداً `designed_only` باقی می‌ماند؛ کد contract به‌تنهایی مجوز success claim
یا production integration نیست.

## تناقض روش‌شناختی که این ممیزی پیدا کرد

ممیزی اول (سند ۱۶) خودش بخشی از `docs/` است. اگر در پایه شواهد باشد، هر
موضوعی که سند ۱۶ نام می‌برد «پوشش دارد» شمرده می‌شود. در اولین اجرای این
اسکن، `sandbox escalation` و `۷ مایلستون` به‌خاطر ذکر در سند ۱۶ «OK» شدند در
حالی که در خود طراحی نبودند. پایه شواهد از آن پس اسناد ممیزی را حذف می‌کند.

## ترتیب بستن

```
فوری (پیش از هر پیاده‌سازی)
  DC-28 ADR موتور ارکستراسیون

بسته‌شده از نظر طراحی در فاز بعدی M1.2
  DC-29 صف BullMQ (طراحی در `docs/24-phase-m1-durable-control-plane.md`)

M2 — توانایی فهم مخزن
  طراحی‌شده در `docs/25-phase-m2-repository-intelligence-and-github-loop.md`:
  DC-01 نمایه‌سازی · DC-02 code search · DC-05 تعارض · DC-06 monorepo
  باقی‌مانده برای طراحی: DC-28 موتور ارکستراسیون · DC-31 scaffold · DC-17 کیفیت شرح PR
  · DC-23 قرارداد پیام کامیت

M3 — امنیت و یکپارچگی
  طراحی‌شده در `docs/26-phase-m3-sandbox-execution-and-security.md`:
  DC-03 پلکان سندباکس · DC-07 ضدسوءاستفاده · DC-08 پالایش خروجی
  · DC-32 اسکن وابستگی · DC-34 حذف داده
  باقی‌مانده برای طراحی M3 در این ممیزی نداریم؛ اجرای واقعی این موضوعات هنوز باز است.

M4 — تجربه کاربر و عملیات
  طراحی‌شده در `docs/27-phase-m4-product-experience-observability-and-operations.md`:
  DC-09 داشبورد هزینه · DC-10 اولین اجرا · DC-13 پنل ادمین · DC-15 بودجه کارایی
  · DC-16 مستندسازی خروجی · DC-18 استراتژی cache · DC-19 feature flags
  · DC-30 طبقه‌بندی خطا · DC-35 self-host · DC-41 release policy/changelog

M5 — Connector SDK و interoperability
  طراحی‌شده در `docs/28-phase-m5-connector-sdk-and-governed-extensibility.md`:
  DC-11 انتشار و rollback پرامپت · DC-20 پروتکل A2A · DC-21 کش پرامپت

M6 — Browser Automation و human-in-the-loop
  طراحی تفصیلی در `docs/29-phase-m6-browser-automation-and-human-in-loop.md`:
  Browser Runner، human handover، domain/egress policy، action governance و evidence

M7 — Deploy، Preview و Release Engineering
  طراحی تفصیلی در `docs/30-phase-m7-deploy-preview-and-release-engineering.md`:
  DC-14 آداپتور استقرار · DC-39 Kubernetes و Helm

M8 — Production Reliability و Disaster Recovery
  طراحی تفصیلی در `docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md`:
  DC-25 مدل بار و ظرفیت · DC-40 runbook و آنکال

M9 — Collaboration، Bootstrap و Developer Workflow
  طراحی‌شده در `docs/32-phase-m9-collaboration-and-project-bootstrap.md`:
  comment، handoff، approval delegation، scaffold امن و PR/commit quality؛
  kernelها وجود دارند اما persistence، UI و Draft PR واقعی هنوز باز است.

M10 — Evaluation، Quality Gates و Consensus
  طراحی‌شده در `docs/33-phase-m10-evaluation-quality-and-consensus.md`:
  invariant، weighted score، regression/cost/latency gate، quorum و human review؛
  evaluator runner و model evidence هنوز باز است.

M11 — Billing، Metering و Entitlements
  طراحی‌شده در `docs/34-phase-m11-billing-metering-and-entitlements.md`:
  free/paid/local plan، quota و cost ceiling؛ billing provider و durable ledger هنوز باز است.

M12 — Internationalization، Localization و Accessibility
  طراحی‌شده در `docs/35-phase-m12-internationalization-and-accessibility.md`:
  catalogs، fallback، RTL/LTR، formatting و a11y contract؛ UI و accessibility CI هنوز باز است.

M13 — Governed Plugin Ecosystem
  طراحی‌شده در `docs/36-phase-m13-governed-plugin-ecosystem.md`:
  manifest، signature/digest/license، trust، scope و sandbox boundary؛ registry و marketplace واقعی هنوز باز است.

M14 تا M18
  موضوعات data governance، workflow triggers، memory retrieval، agent protocol و
  organization policy در اسناد ۳۷ تا ۴۱ طراحی شده‌اند؛ runtimeهای durable و evidence
  واقعی هنوز باز هستند.
```

<!-- COVERAGE:START (generated by scripts/render-design-coverage.ts — do not edit by hand) -->

## خلاصه پوشش طراحی

از ۱۹۱ موضوعی که این پلتفرم باید درباره‌اش موضع داشته باشد، ۱۸۹ طراحی شده، ۱ فقط نام برده شده، و ۱ هیچ پوششی ندارد.

| پوشش | تعداد |
|---|---|
| 🔴 بدون طراحی | ۱ |
| 🟡 نازک | ۱ |
| ✅ طراحی‌شده | ۱۸۹ |

## موضوعات بدون طراحی یا نازک (۲)

| شناسه | موضوع | پوشش | شدت | مایلستون |
|---|---|---|---|---|
| `DC-17` | کیفیت شرح PR | 🔴 بدون طراحی | متوسط | M2 |
| `DC-23` | قرارداد پیام کامیت | 🟡 نازک | پایین | M2 |

### `DC-17` — کیفیت شرح PR

**کلید:** `PR description quality` · **پوشش فعلی:** بدون طراحی (صفر ذکر در همه اسناد) · **مایلستون:** M2

**چه چیزی آن را می‌بندد:** قالب اجباری PR (چه / چرا / تست / ریسک) + اعتبارسنجی پیش از ارسال.

### `DC-23` — قرارداد پیام کامیت

**کلید:** `commit message convention` · **پوشش فعلی:** نازک (۱ ذکر در `docs/32-phase-m9-collaboration-and-project-bootstrap.md`) · **مایلستون:** M2

**چه چیزی آن را می‌بندد:** conventional commits + lint پیام + سیاست squash.

## موضوعاتی که طراحی شده‌اند

| موضوع | ذکر | اسناد |
|---|---|---|
| موتور ارکستراسیون | ۶ | `docs/203-phase-m184-graph-engine-compatibility-and-state-interop.md`، `docs/14-licensing-and-legal.md`، `docs/199-phase-m180-agent-graph-orchestration-and-checkpoints.md` |
| M124 دفترکل audit و replay شواهد | ۲۸ | `docs/148-phase-m124-audit-evidence-ledger-and-replay.md`، `docs/13-roadmap-and-cost.md`، `README.md` |
| M125 تداوم هویت و بازیابی MFA | ۳۶ | `docs/149-phase-m125-identity-continuity-session-revocation.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M126 رضایت connector و reconciliation | ۱۶۰ | `docs/13-roadmap-and-cost.md`، `docs/150-phase-m126-connector-consent-webhook-reconciliation.md`، `docs/README.md` |
| M127 benchmark replay و کیفیت release | ۵۵ | `docs/151-phase-m127-benchmark-replay-release-quality.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M128 FinOps و quota و تخصیص provider | ۵۵ | `docs/152-phase-m128-finops-quota-and-provider-allocation.md`، `docs/13-roadmap-and-cost.md`، `README.md` |
| M129 تکامل API و reconnect جریان | ۳۸ | `docs/153-phase-m129-api-evolution-stream-reconnect.md`، `docs/README.md`، `README.md` |
| M130 زنجیره تأمین artifact و attestation | ۲۴۹ | `docs/154-phase-m130-artifact-supply-chain-and-attestation.md`، `docs/26-phase-m3-sandbox-execution-and-security.md`، `docs/13-roadmap-and-cost.md` |
| M131 عملیات approval و escalation | ۲۱۷ | `docs/155-phase-m131-approval-operations-and-escalation.md`، `docs/13-roadmap-and-cost.md`، `docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md` |
| M132 ACL دانش و freshness و lineage | ۱۴۳ | `docs/156-phase-m132-knowledge-freshness-and-context-lineage.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M133 ارتقای self-host و cutover کنترل‌شده | ۴۹ | `docs/157-phase-m133-self-host-upgrade-and-controlled-cutover.md`، `docs/13-roadmap-and-cost.md`، `README.md` |
| M134 portability داده و import کنترل‌شده | ۳۵ | `docs/158-phase-m134-data-portability-and-controlled-import.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M135 pairing دستگاه و local trust | ۲۹ | `docs/159-phase-m135-device-pairing-and-local-trust.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M136 توزیع policy و drift | ۲۸ | `docs/160-phase-m136-policy-distribution-and-drift.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M137 case رخداد و containment | ۶۶ | `docs/161-phase-m137-incident-case-and-containment.md`، `docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md`، `docs/13-roadmap-and-cost.md` |
| M138 telemetry خصوصی و feedback | ۲۸۴ | `docs/13-roadmap-and-cost.md`، `docs/162-phase-m138-privacy-preserving-telemetry-and-feedback.md`، `docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md` |
| M139 SLO مشاهده‌پذیری و trace integrity | ۹۲ | `docs/163-phase-m139-observability-slo-and-trace-integrity.md`، `docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md`، `docs/13-roadmap-and-cost.md` |
| M140 جست‌وجوی full-text و query governance | ۳۱ | `docs/164-phase-m140-search-query-governance.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M141 scheduler و trigger workflow | ۳۱ | `docs/165-phase-m141-workflow-scheduler-and-triggers.md`، `docs/README.md`، `docs/13-roadmap-and-cost.md` |
| M142 lifecycle artifact و preview isolation | ۵۰ | `docs/166-phase-m142-artifact-lifecycle-and-preview-isolation.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M143 console اپراتور و UX اجرای زنده | ۴۰ | `docs/167-phase-m143-operator-console-and-live-run-ux.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M144 سطح API عمومی و OpenAPI | ۶۲ | `docs/168-phase-m144-public-api-surface-and-openapi.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M145 SDK کانکتور و lifecycle احراز OAuth | ۴۹ | `docs/169-phase-m145-connector-sdk-oauth-lifecycle.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M146 VFS workspace و مرز sandbox | ۲۹ | `docs/170-phase-m146-workspace-vfs-and-sandbox-boundary.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M147 اثبات isolation tenant و RLS | ۱۰۶ | `docs/171-phase-m147-tenant-isolation-and-rls-proof.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M148 پذیرش E2E و آمادگی release | ۲۸ | `docs/172-phase-m148-e2e-release-acceptance-and-readiness.md`، `docs/13-roadmap-and-cost.md`، `README.md` |
| M149 صف durable worker و DLQ | ۳۸۴ | `docs/173-phase-m149-worker-queue-retry-and-dlq.md`، `docs/24-phase-m1-durable-control-plane.md`، `docs/27-phase-m4-product-experience-observability-and-operations.md` |
| M150 migration دیتابیس و schema governance | ۳۰ | `docs/174-phase-m150-database-migration-and-schema-governance.md`، `docs/README.md`، `docs/13-roadmap-and-cost.md` |
| M151 integration اپ GitHub | ۸۱ | `docs/175-phase-m151-github-app-and-webhook-action.md`، `docs/13-roadmap-and-cost.md`، `docs/125-phase-m101-connectors-and-platform-gates.md` |
| M152 محیط preview و routing | ۳۷ | `docs/176-phase-m152-preview-environment-and-routing.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M153 orchestration E2E محصول | ۵۰ | `docs/177-phase-m153-product-e2e-orchestration-and-containment.md`، `docs/172-phase-m148-e2e-release-acceptance-and-readiness.md`، `docs/README.md` |
| M159 data residency و regional routing | ۳۷ | `docs/178-phase-m159-data-residency-and-regional-routing.md`، `docs/13-roadmap-and-cost.md`، `README.md` |
| M160 feature flag و progressive rollout | ۴۸ | `docs/179-phase-m160-feature-flags-and-progressive-rollout.md`، `docs/27-phase-m4-product-experience-observability-and-operations.md`، `docs/13-roadmap-and-cost.md` |
| M161 workload identity و service-account lease | ۲۸ | `docs/180-phase-m161-workload-identity-and-service-account-leases.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M162 data rights و export/deletion | ۴۲ | `docs/181-phase-m162-data-rights-export-and-deletion.md`، `docs/13-roadmap-and-cost.md`، `README.md` |
| M163 FinOps budget guardrail | ۵۲ | `docs/182-phase-m163-finops-budget-guardrails-and-reconciliation.md`، `docs/13-roadmap-and-cost.md`، `docs/87-phase-m63-ai-platform-operations-and-governance.md` |
| M164 structured output و response safety | ۳۲ | `docs/183-phase-m164-structured-output-repair-and-response-safety.md`، `docs/13-roadmap-and-cost.md`، `README.md` |
| M165 delegation ایجنت و capability token | ۴۴ | `docs/184-phase-m165-agent-delegation-and-capability-tokens.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M166 cancellation و compensation | ۱۰۷ | `docs/185-phase-m166-cancellation-and-compensation-runtime.md`، `docs/219-phase-m200-side-effect-journal-and-idempotent-commit.md`، `docs/13-roadmap-and-cost.md` |
| M167 reproducible build و release manifest | ۴۴ | `docs/186-phase-m167-reproducible-build-and-release-manifest.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M168 outbound webhook delivery | ۳۳ | `docs/187-phase-m168-outbound-webhook-and-callback-delivery.md`، `README.md`، `docs/13-roadmap-and-cost.md` |
| M169 context provenance و injection firewall | ۴۶ | `docs/188-phase-m169-context-provenance-and-injection-firewall.md`، `docs/13-roadmap-and-cost.md`، `README.md` |
| M170 tool action boundary و transactional approval | ۳۷ | `docs/189-phase-m170-tool-action-boundary-and-transactional-approval.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M171 offline sync و conflict resolution | ۱۰۷ | `docs/190-phase-m171-offline-sync-and-conflict-resolution.md`، `docs/13-roadmap-and-cost.md`، `docs/122-phase-m98-workspace-bootstrap-and-handoff.md` |
| M172 accessibility و localization verification | ۲۸ | `docs/191-phase-m172-accessibility-and-localization-verification.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M173 incident learning و runbook automation | ۳۲ | `docs/192-phase-m173-incident-learning-and-runbook-automation.md`، `README.md`، `docs/13-roadmap-and-cost.md` |
| M174 آزمایش prompt و rollback | ۲۳ | `docs/193-phase-m174-prompt-experimentation-and-rollback.md`، `README.md`، `docs/13-roadmap-and-cost.md` |
| M175 اجماع چندمدلی و voting | ۵۲ | `docs/194-phase-m175-multi-model-consensus-and-voting.md`، `docs/33-phase-m10-evaluation-quality-and-consensus.md`، `docs/13-roadmap-and-cost.md` |
| M176 پروتکل agent-to-agent و interoperability | ۳۱ | `docs/195-phase-m176-agent-to-agent-protocol-and-interoperability.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M177 integrity و privacy حافظه prompt | ۴۹ | `docs/28-phase-m5-connector-sdk-and-governed-extensibility.md`، `docs/196-phase-m177-prompt-cache-integrity-and-privacy.md`، `docs/13-roadmap-and-cost.md` |
| M178 adapter استقرار و مرز target release | ۳۵ | `docs/197-phase-m178-deployment-adapter-and-release-target-boundary.md`، `docs/13-roadmap-and-cost.md`، `README.md` |
| M179 کیفیت PR و provenance کامیت | ۳۳ | `docs/198-phase-m179-pull-request-quality-and-commit-provenance.md`، `docs/13-roadmap-and-cost.md`، `README.md` |
| M180 orchestration گراف agent و checkpoint | ۲۹ | `docs/199-phase-m180-agent-graph-orchestration-and-checkpoints.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M181 budget کارایی و load shedding | ۴۸ | `docs/200-phase-m181-performance-budget-and-load-shedding.md`، `docs/27-phase-m4-product-experience-observability-and-operations.md`، `docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md` |
| M182 onboarding و first run امن | ۲۹ | `docs/201-phase-m182-onboarding-and-safe-first-run.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M183 entitlement و SLA و disclosure تنزل‌یافته | ۳۵ | `docs/202-phase-m183-service-entitlement-sla-and-degraded-disclosure.md`، `docs/13-roadmap-and-cost.md`، `README.md` |
| M184 سازگاری graph engine و state interop | ۲۷ | `docs/203-phase-m184-graph-engine-compatibility-and-state-interop.md`، `README.md`، `docs/13-roadmap-and-cost.md` |
| M185 هوش repository و evidence بازیابی | ۵۶ | `docs/204-phase-m185-repository-intelligence-and-retrieval-evidence.md`، `README.md`، `docs/13-roadmap-and-cost.md` |
| M186 feedback انسانی و preference governance | ۴۴ | `docs/205-phase-m186-human-feedback-and-preference-governance.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M187 ریسک dependency و پاسخ vulnerability | ۳۴ | `docs/206-phase-m187-dependency-risk-and-vulnerability-response.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M188 تکامل schema و compatibility مصرف‌کننده | ۳۵ | `docs/207-phase-m188-schema-evolution-and-consumer-compatibility.md`، `docs/13-roadmap-and-cost.md`، `README.md` |
| M189 provenance انتشار و evidence ارتقا | ۳۳ | `docs/208-phase-m189-release-provenance-and-promotion-evidence.md`، `README.md`، `docs/13-roadmap-and-cost.md` |
| M190 policy خروجی و governance مقصد | ۴۲ | `docs/209-phase-m190-egress-policy-and-destination-governance.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M191 retention و legal hold و erasure امن | ۱۲۸ | `docs/210-phase-m191-retention-legal-hold-and-secure-erasure.md`، `docs/13-roadmap-and-cost.md`، `docs/94-phase-m70-privacy-lifecycle-and-data-rights.md` |
| M192 recovery و chaos و evidence failover | ۲۴ | `docs/211-phase-m192-recovery-chaos-and-failover-evidence.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M193 fairness tenant و queue scheduling | ۳۰ | `docs/212-phase-m193-tenant-fairness-and-queue-scheduling.md`، `docs/13-roadmap-and-cost.md`، `README.md` |
| M194 evidence envelope و verification ادعا | ۴۲ | `docs/213-phase-m194-runtime-evidence-envelope-and-claim-verification.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M195 health provider و circuit recovery | ۴۳ | `docs/214-phase-m195-provider-health-and-circuit-recovery.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M196 sandbox قابلیت plugin و certification | ۱۹ | `docs/215-phase-m196-plugin-capability-sandbox-and-extension-certification.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M197 delivery notification و preference governance | ۱۷۳ | `docs/216-phase-m197-notification-delivery-and-preference-governance.md`، `docs/13-roadmap-and-cost.md`، `docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md` |
| M198 freshness کاتالوگ مدل و disclosure قابلیت | ۲۷ | `docs/217-phase-m198-model-catalog-freshness-and-capability-disclosure.md`، `README.md`، `docs/13-roadmap-and-cost.md` |
| M199 نرمال‌سازی intent و scope freeze | ۲۷ | `docs/218-phase-m199-intent-normalization-and-scope-freeze.md`، `README.md`، `docs/13-roadmap-and-cost.md` |
| M200 journal اثر جانبی و commit idempotent | ۶۶ | `docs/219-phase-m200-side-effect-journal-and-idempotent-commit.md`، `docs/13-roadmap-and-cost.md`، `docs/185-phase-m166-cancellation-and-compensation-runtime.md` |
| M201 reconciliation connector و drift repair | ۹۳ | `docs/220-phase-m201-connector-reconciliation-and-drift-repair.md`، `docs/13-roadmap-and-cost.md`، `docs/122-phase-m98-workspace-bootstrap-and-handoff.md` |
| M202 integrity approval و expiry تصمیم | ۲۸ | `docs/221-phase-m202-approval-integrity-and-decision-expiry.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M203 analytics خصوصی و aggregation | ۴۸ | `docs/222-phase-m203-privacy-preserving-analytics-and-aggregation.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M204 handoff اجرا و human takeover | ۲۶ | `docs/223-phase-m204-run-handoff-and-human-takeover.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M205 attestation قابلیت و activation مبتنی بر اعتماد | ۲۳ | `docs/224-phase-m205-capability-attestation-and-trust-bound-activation.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M206 پردازش منطقه‌ای و residency enforcement | ۲۳ | `docs/225-phase-m206-region-bound-processing-and-residency-enforcement.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M207 شبیه‌سازی action و blast-radius preview | ۲۴ | `docs/226-phase-m207-action-simulation-and-blast-radius-preview.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M208 کنترل تغییر policy و rollback | ۲۳ | `docs/227-phase-m208-policy-change-control-and-rollback.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M119 تراکنش durable tenant و RLS | ۱۷۲ | `docs/143-phase-m119-durable-tenant-and-transaction-runtime.md`، `docs/13-roadmap-and-cost.md`، `docs/89-phase-m65-durable-persistence-and-event-bus.md` |
| M120 ماتریس verification و CI و security و accessibility | ۲۵۱ | `docs/13-roadmap-and-cost.md`، `docs/144-phase-m120-verification-ci-security-accessibility.md`، `docs/README.md` |
| M121 سازگاری SDK و CLI امن و handoff | ۳۵ | `docs/145-phase-m121-sdk-cli-config-developer-handoff.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M122 چرخش کلید و حذف حریم خصوصی | ۶۱ | `docs/146-phase-m122-key-rotation-erasure-deletion-proof-backup.md`، `docs/13-roadmap-and-cost.md`، `docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md` |
| M123 ظرفیت و circuit breaker و تاب‌آوری | ۴۲ | `docs/147-phase-m123-capacity-circuit-breaker-resilience.md`، `docs/13-roadmap-and-cost.md`، `README.md` |
| توافق‌نامه سطح خدمت | ۳۷ | `docs/202-phase-m183-service-entitlement-sla-and-degraded-disclosure.md`، `docs/71-phase-m47-legal-licensing-and-enterprise-governance.md`، `docs/13-roadmap-and-cost.md` |
| تست نفوذ و پاداش آسیب‌پذیری | ۱۱ | `docs/71-phase-m47-legal-licensing-and-enterprise-governance.md`، `docs/62-phase-m38-security-privacy-and-governance-runtime.md`، `docs/107-phase-m83-data-governance-legal-and-disclosure.md` |
| M9 همکاری تیمی و ساخت پروژه | ۳۱۱ | `docs/13-roadmap-and-cost.md`، `docs/README.md`، `README.md` |
| M10 ارزیابی، دروازه کیفیت و اجماع | ۲۵۲ | `docs/13-roadmap-and-cost.md`، `docs/README.md`، `README.md` |
| M11 صورتحساب، metering و entitlement | ۴۲۳ | `docs/13-roadmap-and-cost.md`، `README.md`، `docs/README.md` |
| M12 بین‌المللی‌سازی و دسترس‌پذیری | ۴۳۰ | `docs/13-roadmap-and-cost.md`، `README.md`، `docs/README.md` |
| M13 اکوسیستم plugin حاکمیت‌شده | ۲۷۵ | `docs/13-roadmap-and-cost.md`، `README.md`، `docs/README.md` |
| M14 حاکمیت داده و چرخه حریم خصوصی | ۲۳۰ | `README.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M15 خودکارسازی workflow و trigger | ۱۱۸ | `README.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M16 حافظه و بازیابی context | ۲۰۳ | `README.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M17 پروتکل agent و interoperability | ۲۱۴ | `README.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| M18 governance سازمانی و policy-as-code | ۲۰۷ | `README.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| رأی‌گیری چندمدلی | ۵۴ | `docs/33-phase-m10-evaluation-quality-and-consensus.md`، `docs/13-roadmap-and-cost.md`، `docs/194-phase-m175-multi-model-consensus-and-voting.md` |
| ساخت پروژه از صفر | ۱۸ | `docs/32-phase-m9-collaboration-and-project-bootstrap.md`، `docs/13-roadmap-and-cost.md`، `docs/01-product-definition.md` |
| صورتحساب و اندازه‌گیری مصرف | ۱۲۰ | `docs/13-roadmap-and-cost.md`، `docs/115-phase-m91-billing-and-entitlements.md`، `README.md` |
| چندزبانه‌بودن پلتفرم | ۶ | `docs/35-phase-m12-internationalization-and-accessibility.md`، `docs/10-api-and-events.md`، `docs/13-roadmap-and-cost.md` |
| انتشار تدریجی و بازگردانی پرامپت | ۲۴ | `docs/28-phase-m5-connector-sdk-and-governed-extensibility.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| پروتکل ایجنت‌به‌ایجنت | ۳۹ | `docs/28-phase-m5-connector-sdk-and-governed-extensibility.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| کش پرامپت | ۲۴ | `docs/28-phase-m5-connector-sdk-and-governed-extensibility.md`، `docs/196-phase-m177-prompt-cache-integrity-and-privacy.md`، `docs/13-roadmap-and-cost.md` |
| آداپتور استقرار | ۳۰ | `docs/30-phase-m7-deploy-preview-and-release-engineering.md`، `docs/61-phase-m37-preview-artifact-and-delivery-runtime.md`، `docs/102-phase-m78-self-host-release-and-ci.md` |
| کوبرنتیز و Helm | ۶۹ | `docs/30-phase-m7-deploy-preview-and-release-engineering.md`، `docs/67-phase-m43-self-host-release-and-resilience-runtime.md`، `docs/102-phase-m78-self-host-release-and-ci.md` |
| مدل بار و ظرفیت | ۲۳ | `docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| runbook و آنکال | ۱۳۹ | `docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md`، `docs/192-phase-m173-incident-learning-and-runbook-automation.md`، `docs/131-phase-m107-observability-and-finops.md` |
| داشبورد هزینه | ۷ | `docs/27-phase-m4-product-experience-observability-and-operations.md`، `docs/152-phase-m128-finops-quota-and-provider-allocation.md`، `docs/65-phase-m41-data-lifecycle-analytics-and-metering-runtime.md` |
| تجربه اولین اجرا | ۱۳۳ | `docs/13-roadmap-and-cost.md`، `docs/27-phase-m4-product-experience-observability-and-operations.md`، `docs/201-phase-m182-onboarding-and-safe-first-run.md` |
| پنل مدیریت و عملیات | ۳ | `docs/27-phase-m4-product-experience-observability-and-operations.md` |
| بودجه کارایی | ۱۳ | `docs/27-phase-m4-product-experience-observability-and-operations.md`، `docs/200-phase-m181-performance-budget-and-load-shedding.md`، `docs/13-roadmap-and-cost.md` |
| تولید مستند برای خروجی | ۳ | `docs/27-phase-m4-product-experience-observability-and-operations.md` |
| استراتژی کش CI | ۴ | `docs/27-phase-m4-product-experience-observability-and-operations.md` |
| پرچم ویژگی | ۱۷ | `docs/27-phase-m4-product-experience-observability-and-operations.md`، `docs/179-phase-m160-feature-flags-and-progressive-rollout.md`، `docs/13-roadmap-and-cost.md` |
| طبقه‌بندی خطاها | ۱۱ | `docs/27-phase-m4-product-experience-observability-and-operations.md`، `docs/10-api-and-events.md`، `docs/128-phase-m104-api-contracts-and-stream-reconnect.md` |
| راه‌اندازی self-host | ۱۵۰ | `docs/13-roadmap-and-cost.md`، `docs/27-phase-m4-product-experience-observability-and-operations.md`، `docs/README.md` |
| سیاست انتشار و changelog | ۵۸ | `docs/27-phase-m4-product-experience-observability-and-operations.md`، `docs/198-phase-m179-pull-request-quality-and-commit-provenance.md`، `docs/28-phase-m5-connector-sdk-and-governed-extensibility.md` |
| پلکان ارتقای دسترسی سندباکس | ۱۴۸ | `docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md`، `docs/13-roadmap-and-cost.md`، `docs/216-phase-m197-notification-delivery-and-preference-governance.md` |
| جلوگیری از سوءاستفاده | ۱۲۱ | `docs/141-phase-m117-abuse-safety-and-dlp.md`، `docs/26-phase-m3-sandbox-execution-and-security.md`، `docs/62-phase-m38-security-privacy-and-governance-runtime.md` |
| پالایش محتوای خروجی | ۱۵ | `docs/26-phase-m3-sandbox-execution-and-security.md`، `docs/141-phase-m117-abuse-safety-and-dlp.md`، `docs/81-phase-m57-comprehensive-ai-directory-and-model-cards.md` |
| اسکن وابستگی‌ها | ۱۲ | `docs/26-phase-m3-sandbox-execution-and-security.md`، `docs/96-phase-m72-extension-marketplace-and-plugin-trust.md`، `docs/13-roadmap-and-cost.md` |
| نگهداری و حذف داده | ۱۳ | `docs/26-phase-m3-sandbox-execution-and-security.md`، `docs/162-phase-m138-privacy-preserving-telemetry-and-feedback.md`، `docs/00-request-review.md` |
| نمایه‌سازی مخزن و بازیابی | ۱۳ | `docs/204-phase-m185-repository-intelligence-and-retrieval-evidence.md`، `docs/25-phase-m2-repository-intelligence-and-github-loop.md`، `docs/103-phase-m79-knowledge-context-and-repository-intelligence.md` |
| جست‌وجوی کد در مخزن | ۴ | `docs/25-phase-m2-repository-intelligence-and-github-loop.md` |
| حل تعارض ادغام | ۴ | `docs/25-phase-m2-repository-intelligence-and-github-loop.md` |
| پشتیبانی از monorepo | ۳ | `docs/25-phase-m2-repository-intelligence-and-github-loop.md` |
| پشتیبان‌گیری و بازیابی فاجعه | ۳۷۸ | `docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md`، `docs/13-roadmap-and-cost.md`، `docs/97-phase-m73-platform-resilience-and-dr.md` |
| اهداف SLO | ۱۵۶ | `docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md`، `docs/13-roadmap-and-cost.md`، `docs/163-phase-m139-observability-slo-and-trace-integrity.md` |
| زنجیره تأمین و lockfile | ۶۲ | `docs/22-upgrade-program.md`، `docs/26-phase-m3-sandbox-execution-and-security.md`، `docs/186-phase-m167-reproducible-build-and-release-manifest.md` |
| مشاهده‌پذیری اجراها | ۷۴ | `docs/27-phase-m4-product-experience-observability-and-operations.md`، `docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md`، `docs/161-phase-m137-incident-case-and-containment.md` |
| طراحی صف BullMQ | ۲۰ | `docs/24-phase-m1-durable-control-plane.md`، `docs/03-architecture.md`، `docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md` |
| حلقه مدیریت خطا و تعمیر | ۱۳۱ | `docs/04-agent-state-machine.md`، `docs/183-phase-m164-structured-output-repair-and-response-safety.md`، `docs/104-phase-m80-prompt-safety-and-output-trust.md` |
| جریان تأیید انسانی | ۱۳۷۹ | `docs/30-phase-m7-deploy-preview-and-release-engineering.md`، `docs/27-phase-m4-product-experience-observability-and-operations.md`، `docs/29-phase-m6-browser-automation-and-human-in-loop.md` |
| استراتژی لایه رایگان | ۶۰ | `README.md`، `docs/00-request-review.md`، `docs/13-roadmap-and-cost.md` |
| مدیریت secret | ۶۶۱ | `docs/26-phase-m3-sandbox-execution-and-security.md`، `docs/30-phase-m7-deploy-preview-and-release-engineering.md`، `docs/28-phase-m5-connector-sdk-and-governed-extensibility.md` |
| مسیریابی مدل و fallback | ۴۰۱ | `docs/13-roadmap-and-cost.md`، `docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md`، `docs/29-phase-m6-browser-automation-and-human-in-loop.md` |
| سندباکس | ۴۹۸ | `docs/26-phase-m3-sandbox-execution-and-security.md`، `docs/13-roadmap-and-cost.md`، `docs/README.md` |
| انطباق لایسنس | ۲۴۷ | `docs/28-phase-m5-connector-sdk-and-governed-extensibility.md`، `docs/14-licensing-and-legal.md`، `docs/30-phase-m7-deploy-preview-and-release-engineering.md` |
| لاگ ممیزی | ۵۲۷ | `docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md`، `docs/26-phase-m3-sandbox-execution-and-security.md`، `docs/27-phase-m4-product-experience-observability-and-operations.md` |
| ماشین حالت | ۳۸ | `docs/03-architecture.md`، `docs/04-agent-state-machine.md`، `docs/README.md` |
| پاک‌سازی secret | ۵۳۷ | `docs/29-phase-m6-browser-automation-and-human-in-loop.md`، `docs/26-phase-m3-sandbox-execution-and-security.md`، `docs/27-phase-m4-product-experience-observability-and-operations.md` |
| سطح‌بندی کانکتور A–D | ۱۳۹ | `docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md`، `docs/02-roles-and-agents.md`، `docs/30-phase-m7-deploy-preview-and-release-engineering.md` |
| جداسازی tenant و RLS | ۱۳۱۰ | `docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md`، `docs/13-roadmap-and-cost.md`، `docs/28-phase-m5-connector-sdk-and-governed-extensibility.md` |
| سهمیه و بودجه | ۸۳۱ | `docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md`، `docs/27-phase-m4-product-experience-observability-and-operations.md`، `docs/13-roadmap-and-cost.md` |
| قاعده شواهد | ۱۸۲۳ | `docs/13-roadmap-and-cost.md`، `docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md`، `docs/README.md` |
| Prisma | ۳۷ | `docs/09-data-model.md`، `docs/03-architecture.md`، `docs/22-upgrade-program.md` |
| لایه‌های حافظه | ۱۶۴ | `docs/39-phase-m16-memory-and-context-retrieval.md`، `docs/118-phase-m94-retrieval-memory-and-feedback.md`، `docs/13-roadmap-and-cost.md` |
| استراتژی diff و patch | ۱۸۴ | `docs/27-phase-m4-product-experience-observability-and-operations.md`، `docs/22-upgrade-program.md`، `docs/170-phase-m146-workspace-vfs-and-sandbox-boundary.md` |
| محیط پیش‌نمایش | ۳۱۷ | `docs/30-phase-m7-deploy-preview-and-release-engineering.md`، `docs/13-roadmap-and-cost.md`، `docs/83-phase-m59-visual-studio-integration-and-preview.md` |
| OAuth و PKCE | ۱۹۴ | `docs/28-phase-m5-connector-sdk-and-governed-extensibility.md`، `docs/169-phase-m145-connector-sdk-oauth-lifecycle.md`، `docs/13-roadmap-and-cost.md` |
| توقف در CAPTCHA و MFA | ۲۶۲ | `docs/29-phase-m6-browser-automation-and-human-in-loop.md`، `docs/70-phase-m46-browser-automation-and-external-signals.md`، `docs/30-phase-m7-deploy-preview-and-release-engineering.md` |
| workspace و VFS | ۱۹۸ | `docs/13-roadmap-and-cost.md`، `docs/26-phase-m3-sandbox-execution-and-security.md`، `docs/README.md` |
| دفاع در برابر تزریق پرامپت | ۱۷۸ | `docs/13-roadmap-and-cost.md`، `docs/119-phase-m95-supply-chain-and-injection-security.md`، `docs/26-phase-m3-sandbox-execution-and-security.md` |
| Ollama و مدل‌های لوکال | ۲۴ | `docs/05-model-router.md`، `docs/15-compute-modes.md`، `docs/21-canary-trials.md` |
| KMS و رمزنگاری پاکتی | ۲۲۳ | `docs/13-roadmap-and-cost.md`، `docs/24-phase-m1-durable-control-plane.md`، `docs/26-phase-m3-sandbox-execution-and-security.md` |
| گراف تسک و زمان‌بندی | ۳۴ | `docs/22-upgrade-program.md`، `docs/README.md`، `docs/27-phase-m4-product-experience-observability-and-operations.md` |
| idempotency | ۳۷۵ | `docs/28-phase-m5-connector-sdk-and-governed-extensibility.md`، `docs/29-phase-m6-browser-automation-and-human-in-loop.md`، `docs/24-phase-m1-durable-control-plane.md` |
| اعتبارسنجی قرارداد خروجی | ۳۳ | `docs/104-phase-m80-prompt-safety-and-output-trust.md`، `docs/05-model-router.md`، `docs/13-roadmap-and-cost.md` |
| مایلستون‌های M1 تا M7 | ۲۸۱ | `docs/30-phase-m7-deploy-preview-and-release-engineering.md`، `docs/26-phase-m3-sandbox-execution-and-security.md`، `docs/29-phase-m6-browser-automation-and-human-in-loop.md` |
| BYOK (کلید خود کاربر) | ۱۵۹ | `docs/13-roadmap-and-cost.md`، `docs/28-phase-m5-connector-sdk-and-governed-extensibility.md`، `docs/77-phase-m53-connection-center-health-and-fallback.md` |
| pgvector و embedding | ۵۴ | `docs/118-phase-m94-retrieval-memory-and-feedback.md`، `docs/25-phase-m2-repository-intelligence-and-github-loop.md`، `docs/13-roadmap-and-cost.md` |
| معنای لغو اجرا | ۹۹ | `docs/185-phase-m166-cancellation-and-compensation-runtime.md`، `docs/29-phase-m6-browser-automation-and-human-in-loop.md`، `docs/27-phase-m4-product-experience-observability-and-operations.md` |
| workerها | ۳۲۳ | `docs/24-phase-m1-durable-control-plane.md`، `docs/13-roadmap-and-cost.md`، `docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md` |
| گردش‌کار git و PR | ۱۴ | `docs/25-phase-m2-repository-intelligence-and-github-loop.md`، `docs/01-product-definition.md`، `docs/06-connectors-and-auth.md` |
| تحلیل ایستا روی خروجی | ۲۷ | `docs/102-phase-m78-self-host-release-and-ci.md`، `docs/12-quality-and-dod.md`، `docs/66-phase-m42-quality-ci-and-verification-runtime.md` |
| تست e2e خروجی | ۳۸ | `docs/29-phase-m6-browser-automation-and-human-in-loop.md`، `docs/13-roadmap-and-cost.md`، `docs/03-architecture.md` |
| webhook | ۳۰۱ | `docs/13-roadmap-and-cost.md`، `docs/28-phase-m5-connector-sdk-and-governed-extensibility.md`، `docs/README.md` |
| PostgreSQL | ۸۹ | `docs/24-phase-m1-durable-control-plane.md`، `docs/26-phase-m3-sandbox-execution-and-security.md`، `docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md` |
| سناریوهای ارزیابی | ۳۶۵ | `docs/13-roadmap-and-cost.md`، `docs/README.md`، `README.md` |
| پروتکل streaming (SSE) | ۷۲ | `docs/27-phase-m4-product-experience-observability-and-operations.md`، `docs/57-phase-m33-product-surface-and-approval-clients.md`، `docs/13-roadmap-and-cost.md` |
| حالت‌های محاسباتی | ۳۵ | `docs/138-phase-m114-legal-disclosure-and-output-rights.md`، `docs/136-phase-m112-product-collaboration-and-onboarding.md`، `docs/05-model-router.md` |
| قفل فایل | ۶ | `docs/00-request-review.md`، `docs/11-task-dag-and-scheduling.md`، `docs/26-phase-m3-sandbox-execution-and-security.md` |
| ماتریس زبان | ۴۵۹ | `docs/13-roadmap-and-cost.md`، `docs/84-phase-m60-model-evaluation-and-trust.md`، `docs/README.md` |
| ردیابی توزیع‌شده | ۱۳ | `docs/03-architecture.md`، `docs/13-roadmap-and-cost.md`، `docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md` |
| تست دسترس‌پذیری خروجی | ۴۴ | `docs/98-phase-m74-product-experience-and-accessibility.md`، `docs/111-phase-m87-quality-integration-and-e2e.md`، `docs/13-roadmap-and-cost.md` |
| آداپتور test runner | ۲۱ | `docs/25-phase-m2-repository-intelligence-and-github-loop.md`، `docs/13-roadmap-and-cost.md`، `docs/54-phase-m30-sandbox-execution-and-workspace-runtime.md` |
| MCP | ۱۰۲ | `docs/28-phase-m5-connector-sdk-and-governed-extensibility.md`، `docs/64-phase-m40-connector-gateway-and-interoperability-runtime.md`، `docs/13-roadmap-and-cost.md` |
| محدودسازی نرخ | ۸۵ | `docs/28-phase-m5-connector-sdk-and-governed-extensibility.md`، `docs/128-phase-m104-api-contracts-and-stream-reconnect.md`، `docs/101-phase-m77-connector-delivery-and-webhooks.md` |
| retry و backoff | ۳۱۷ | `docs/28-phase-m5-connector-sdk-and-governed-extensibility.md`، `docs/24-phase-m1-durable-control-plane.md`، `docs/27-phase-m4-product-experience-observability-and-operations.md` |
| Next.js | ۴ | `docs/03-architecture.md`، `docs/14-licensing-and-legal.md` |
| چندمستأجری | ۴ | `docs/03-architecture.md`، `docs/07-sandbox-and-security.md`، `docs/26-phase-m3-sandbox-execution-and-security.md` |
| دروازه کیفیت و DoD | ۱۲ | `docs/12-quality-and-dod.md`، `docs/22-upgrade-program.md`، `docs/24-phase-m1-durable-control-plane.md` |
| tRPC | ۱۱ | `docs/03-architecture.md`، `docs/128-phase-m104-api-contracts-and-stream-reconnect.md`، `docs/95-phase-m71-developer-experience-and-sdk.md` |
| مرز مونولیت ماژولار | ۳ | `docs/03-architecture.md`، `docs/00-request-review.md` |
| متریک‌های مشاهده‌پذیری | ۱۶۱ | `docs/31-phase-m8-production-reliability-capacity-and-disaster-recovery.md`، `docs/193-phase-m174-prompt-experimentation-and-rollback.md`، `docs/56-phase-m32-operations-evidence-and-disaster-recovery.md` |
| مدیریت پنجره متن | ۷ | `docs/05-model-router.md`، `docs/134-phase-m110-model-discovery-and-ai-directory.md`، `docs/02-roles-and-agents.md` |
| حسابداری توکن برای هر Run | ۱۲ | `docs/18-free-provider-pool.md`، `docs/133-phase-m109-context-assembly-and-repository-intelligence.md`، `docs/22-upgrade-program.md` |

<!-- COVERAGE:END -->
