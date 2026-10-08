/**
 * Design-coverage audit.
 *
 * `docs/gap-register.json` answers "what is designed but not built".
 * This module answers a different question: "what was never designed at all".
 *
 * It scans the design documents for a fixed list of topics that a platform of
 * this scope has to take a position on, and classifies each as:
 *   designed  — the docs argue about it (more than THRESHOLD mentions)
 *   thin      — named in passing, never designed (<= THRESHOLD mentions)
 *   none      — no coverage anywhere
 *
 * Every `thin` / `none` topic must carry a `closure`, and every topic carrying
 * a `closure` must currently be thin or none — see test/design-coverage.test.ts.
 * That keeps the list from rotting in either direction.
 */

import type { GapMilestone, GapSeverity } from "./gap-register.js";

/** A mention count at or below this is "named, not designed". */
export const THIN_THRESHOLD = 2;

export interface DesignTopic {
  id: string;
  /** Stable English key — used in generated tables. */
  key: string;
  /** Persian label. */
  fa: string;
  /** RegExp sources, matched case-insensitively. */
  patterns: string[];
  /** Cross-reference into docs/gap-register.json, where a gap exists. */
  gapRefs?: string[];
  /** Required while the topic is thin or none; must be absent once designed. */
  severity?: GapSeverity;
  milestone?: GapMilestone;
  closure?: string;
  /** Phase lifecycle marker: these phases have a contract kernel but no production integration. */
  phaseStatus?: "designed_only";
}

/** Topics that are thin or un-designed. Each carries a closure action. */
export const OPEN_DESIGN_TOPICS: DesignTopic[] = [
  // ── Zero coverage ────────────────────────────────────────────────────────

  {
    id: "DC-17",
    key: "PR description quality",
    fa: "کیفیت شرح PR",
    patterns: ["pr description", "شرح pr"],
    severity: "medium",
    milestone: "M2",
    closure: "قالب اجباری PR (چه / چرا / تست / ریسک) + اعتبارسنجی پیش از ارسال.",
  },
  {
    id: "DC-23",
    key: "commit message convention",
    fa: "قرارداد پیام کامیت",
    patterns: ["conventional commit", "پیام کامیت"],
    severity: "low",
    milestone: "M2",
    closure: "conventional commits + lint پیام + سیاست squash.",
  },


  // ── Thin coverage ────────────────────────────────────────────────────────
];


/** Topics the design documents already argue about. No closure needed. */
export const DESIGNED_TOPICS: DesignTopic[] = [
  { id: "DC-28", key: "LangGraph / orchestration engine", fa: "موتور ارکستراسیون", patterns: ["langgraph"], phaseStatus: "designed_only" },
  { id: "M124-COVERAGE", key: "M124 audit evidence ledger and replay", fa: "M124 دفترکل audit و replay شواهد", patterns: ["M124", "audit evidence ledger", "evidence provenance", "tenant-bounded replay"], phaseStatus: "designed_only" },
  { id: "M125-COVERAGE", key: "M125 identity continuity and MFA recovery", fa: "M125 تداوم هویت و بازیابی MFA", patterns: ["M125", "identity continuity", "session revocation", "MFA recovery"], phaseStatus: "designed_only" },
  { id: "M126-COVERAGE", key: "M126 connector consent and reconciliation", fa: "M126 رضایت connector و reconciliation", patterns: ["M126", "connector consent", "signed webhook", "reconciliation"], phaseStatus: "designed_only" },
  { id: "M127-COVERAGE", key: "M127 benchmark replay and release quality", fa: "M127 benchmark replay و کیفیت release", patterns: ["M127", "benchmark corpus", "deterministic replay", "release quality"], phaseStatus: "designed_only" },
  { id: "M128-COVERAGE", key: "M128 FinOps quota and provider allocation", fa: "M128 FinOps و quota و تخصیص provider", patterns: ["M128", "usage ledger", "quota scheduling", "provider allocation"], phaseStatus: "designed_only" },
  { id: "M129-COVERAGE", key: "M129 API evolution and stream reconnect", fa: "M129 تکامل API و reconnect جریان", patterns: ["M129", "API evolution", "schema migration", "stream reconnect"], phaseStatus: "designed_only" },
  { id: "M130-COVERAGE", key: "M130 artifact supply chain and attestation", fa: "M130 زنجیره تأمین artifact و attestation", patterns: ["M130", "artifact supply chain", "SBOM", "attestation"], phaseStatus: "designed_only" },
  { id: "M131-COVERAGE", key: "M131 approval operations and escalation", fa: "M131 عملیات approval و escalation", patterns: ["M131", "approval operations", "human review", "escalation"], phaseStatus: "designed_only" },
  { id: "M132-COVERAGE", key: "M132 knowledge ACL freshness and lineage", fa: "M132 ACL دانش و freshness و lineage", patterns: ["M132", "knowledge ACL", "freshness", "context lineage"], phaseStatus: "designed_only" },
  { id: "M133-COVERAGE", key: "M133 self-host upgrade and controlled cutover", fa: "M133 ارتقای self-host و cutover کنترل‌شده", patterns: ["M133", "self-host upgrade", "backup restore", "controlled cutover"], phaseStatus: "designed_only" },
  { id: "M134-COVERAGE", key: "M134 data portability and controlled import", fa: "M134 portability داده و import کنترل‌شده", patterns: ["M134", "data portability", "controlled import", "portable manifest"], phaseStatus: "designed_only" },
  { id: "M135-COVERAGE", key: "M135 device pairing and local trust", fa: "M135 pairing دستگاه و local trust", patterns: ["M135", "device pairing", "local trust", "scoped grant"], phaseStatus: "designed_only" },
  { id: "M136-COVERAGE", key: "M136 policy distribution and drift", fa: "M136 توزیع policy و drift", patterns: ["M136", "policy distribution", "configuration drift", "policy exception"], phaseStatus: "designed_only" },
  { id: "M137-COVERAGE", key: "M137 incident case and containment", fa: "M137 case رخداد و containment", patterns: ["M137", "incident case", "bounded containment", "postmortem"], phaseStatus: "designed_only" },
  { id: "M138-COVERAGE", key: "M138 privacy telemetry and feedback", fa: "M138 telemetry خصوصی و feedback", patterns: ["M138", "privacy telemetry", "user feedback", "retention"], phaseStatus: "designed_only" },
  { id: "M139-COVERAGE", key: "M139 observability SLO and trace integrity", fa: "M139 SLO مشاهده‌پذیری و trace integrity", patterns: ["M139", "observability SLO", "trace integrity", "error budget"], phaseStatus: "designed_only" },
  { id: "M140-COVERAGE", key: "M140 full-text search and query governance", fa: "M140 جست‌وجوی full-text و query governance", patterns: ["M140", "full-text search", "query governance", "ACL index"], phaseStatus: "designed_only" },
  { id: "M141-COVERAGE", key: "M141 workflow scheduler and triggers", fa: "M141 scheduler و trigger workflow", patterns: ["M141", "workflow scheduler", "trigger runtime", "run lease"], phaseStatus: "designed_only" },
  { id: "M142-COVERAGE", key: "M142 artifact lifecycle and preview isolation", fa: "M142 lifecycle artifact و preview isolation", patterns: ["M142", "artifact lifecycle", "preview isolation", "signed delivery"], phaseStatus: "designed_only" },
  { id: "M143-COVERAGE", key: "M143 operator console and live Run UX", fa: "M143 console اپراتور و UX اجرای زنده", patterns: ["M143", "operator console", "live Run UX", "safe action"], phaseStatus: "designed_only" },
  { id: "M144-COVERAGE", key: "M144 public API surface and OpenAPI", fa: "M144 سطح API عمومی و OpenAPI", patterns: ["M144", "public API surface", "OpenAPI", "endpoint contract"], phaseStatus: "designed_only" },
  { id: "M145-COVERAGE", key: "M145 connector SDK and OAuth lifecycle", fa: "M145 SDK کانکتور و lifecycle احراز OAuth", patterns: ["M145", "connector SDK", "OAuth PKCE", "token lease"], phaseStatus: "designed_only" },
  { id: "M146-COVERAGE", key: "M146 workspace VFS and sandbox boundary", fa: "M146 VFS workspace و مرز sandbox", patterns: ["M146", "workspace VFS", "sandbox resource", "diff rollback"], phaseStatus: "designed_only" },
  { id: "M147-COVERAGE", key: "M147 tenant isolation and RLS proof", fa: "M147 اثبات isolation tenant و RLS", patterns: ["M147", "tenant isolation", "RLS proof", "cross-tenant probe"], phaseStatus: "designed_only" },
  { id: "M148-COVERAGE", key: "M148 E2E release acceptance and readiness", fa: "M148 پذیرش E2E و آمادگی release", patterns: ["M148", "E2E release acceptance", "readiness review", "go-no-go"], phaseStatus: "designed_only" },
  { id: "M149-COVERAGE", key: "M149 durable worker queue and DLQ", fa: "M149 صف durable worker و DLQ", patterns: ["M149", "durable worker queue", "retry", "DLQ"], phaseStatus: "designed_only" },
  { id: "M150-COVERAGE", key: "M150 database migration and schema governance", fa: "M150 migration دیتابیس و schema governance", patterns: ["M150", "database migration", "schema governance", "expand contract"], phaseStatus: "designed_only" },
  { id: "M151-COVERAGE", key: "M151 GitHub App integration", fa: "M151 integration اپ GitHub", patterns: ["M151", "GitHub App", "webhook action", "repository action"], phaseStatus: "designed_only" },
  { id: "M152-COVERAGE", key: "M152 preview environment and routing", fa: "M152 محیط preview و routing", patterns: ["M152", "preview environment", "deployment routing", "port lease"], phaseStatus: "designed_only" },
  { id: "M153-COVERAGE", key: "M153 product E2E orchestration", fa: "M153 orchestration E2E محصول", patterns: ["M153", "product E2E", "failure containment", "flow orchestration"], phaseStatus: "designed_only" },
  { id: "M159-COVERAGE", key: "M159 data residency and regional routing", fa: "M159 data residency و regional routing", patterns: ["M159", "data residency", "regional routing", "cross-border transfer"], phaseStatus: "designed_only" },
  { id: "M160-COVERAGE", key: "M160 feature flags and progressive rollout", fa: "M160 feature flag و progressive rollout", patterns: ["M160", "feature flag", "progressive rollout", "kill switch"], phaseStatus: "designed_only" },
  { id: "M161-COVERAGE", key: "M161 workload identity and service-account leases", fa: "M161 workload identity و service-account lease", patterns: ["M161", "workload identity", "service-account lease", "least-privilege binding"], phaseStatus: "designed_only" },
  { id: "M162-COVERAGE", key: "M162 data rights export and deletion", fa: "M162 data rights و export/deletion", patterns: ["M162", "data rights", "DSAR", "deletion orchestration"], phaseStatus: "designed_only" },
  { id: "M163-COVERAGE", key: "M163 FinOps budget guardrails", fa: "M163 FinOps budget guardrail", patterns: ["M163", "FinOps budget", "usage reconciliation", "hard stop"], phaseStatus: "designed_only" },
  { id: "M164-COVERAGE", key: "M164 structured output repair and response safety", fa: "M164 structured output و response safety", patterns: ["M164", "structured output repair", "response safety", "safety scan"], phaseStatus: "designed_only" },
  { id: "M165-COVERAGE", key: "M165 agent delegation and capability tokens", fa: "M165 delegation ایجنت و capability token", patterns: ["M165", "agent delegation", "capability token", "no-transitive-escalation"], phaseStatus: "designed_only" },
  { id: "M166-COVERAGE", key: "M166 cancellation and compensation", fa: "M166 cancellation و compensation", patterns: ["M166", "cancellation", "compensation", "cleanup evidence"], phaseStatus: "designed_only" },
  { id: "M167-COVERAGE", key: "M167 reproducible build and release manifest", fa: "M167 reproducible build و release manifest", patterns: ["M167", "reproducible build", "release manifest", "hermetic builder"], phaseStatus: "designed_only" },
  { id: "M168-COVERAGE", key: "M168 outbound webhook delivery", fa: "M168 outbound webhook delivery", patterns: ["M168", "outbound webhook", "callback delivery", "delivery replay"], phaseStatus: "designed_only" },
  { id: "M169-COVERAGE", key: "M169 context provenance and injection firewall", fa: "M169 context provenance و injection firewall", patterns: ["M169", "context provenance", "prompt-injection firewall", "source trust"], phaseStatus: "designed_only" },
  { id: "M170-COVERAGE", key: "M170 tool action boundary and transactional approval", fa: "M170 tool action boundary و transactional approval", patterns: ["M170", "tool action boundary", "transactional approval", "protected target"], phaseStatus: "designed_only" },
  { id: "M171-COVERAGE", key: "M171 offline sync and conflict resolution", fa: "M171 offline sync و conflict resolution", patterns: ["M171", "offline sync", "conflict resolution", "no-clobber"], phaseStatus: "designed_only" },
  { id: "M172-COVERAGE", key: "M172 accessibility and localization verification", fa: "M172 accessibility و localization verification", patterns: ["M172", "accessibility verification", "localization verification", "WCAG AA"], phaseStatus: "designed_only" },
  { id: "M173-COVERAGE", key: "M173 incident learning and runbook automation", fa: "M173 incident learning و runbook automation", patterns: ["M173", "incident learning", "runbook automation", "corrective action"], phaseStatus: "designed_only" },
  { id: "M174-COVERAGE", key: "M174 prompt experimentation and rollback", fa: "M174 آزمایش prompt و rollback", patterns: ["M174", "prompt experimentation", "prompt rollback", "variant assignment"], phaseStatus: "designed_only" },
  { id: "M175-COVERAGE", key: "M175 multi-model consensus and voting", fa: "M175 اجماع چندمدلی و voting", patterns: ["M175", "multi-model consensus", "model voting", "quorum"], phaseStatus: "designed_only" },
  { id: "M176-COVERAGE", key: "M176 agent-to-agent protocol interoperability", fa: "M176 پروتکل agent-to-agent و interoperability", patterns: ["M176", "agent-to-agent", "protocol interoperability", "typed handoff"], phaseStatus: "designed_only" },
  { id: "M177-COVERAGE", key: "M177 prompt cache integrity and privacy", fa: "M177 integrity و privacy حافظه prompt", patterns: ["M177", "prompt cache", "cache integrity", "cache poisoning"], phaseStatus: "designed_only" },
  { id: "M178-COVERAGE", key: "M178 deployment adapter and release target boundary", fa: "M178 adapter استقرار و مرز target release", patterns: ["M178", "deployment adapter", "release target boundary", "target environment"], phaseStatus: "designed_only" },
  { id: "M179-COVERAGE", key: "M179 pull-request quality and commit provenance", fa: "M179 کیفیت PR و provenance کامیت", patterns: ["M179", "pull-request quality", "commit provenance", "change governance"], phaseStatus: "designed_only" },
  { id: "M180-COVERAGE", key: "M180 agent graph orchestration and checkpoints", fa: "M180 orchestration گراف agent و checkpoint", patterns: ["M180", "agent graph orchestration", "durable checkpoint", "graph cycle"], phaseStatus: "designed_only" },
  { id: "M181-COVERAGE", key: "M181 performance budget and load shedding", fa: "M181 budget کارایی و load shedding", patterns: ["M181", "performance budget", "load shedding", "backpressure"], phaseStatus: "designed_only" },
  { id: "M182-COVERAGE", key: "M182 onboarding and safe first run", fa: "M182 onboarding و first run امن", patterns: ["M182", "safe first run", "onboarding consent", "synthetic fixture"], phaseStatus: "designed_only" },
  { id: "M183-COVERAGE", key: "M183 service entitlement SLA and degraded disclosure", fa: "M183 entitlement و SLA و disclosure تنزل‌یافته", patterns: ["M183", "service entitlement", "SLA evidence", "degraded disclosure"], phaseStatus: "designed_only" },
  { id: "M184-COVERAGE", key: "M184 graph engine compatibility and state interop", fa: "M184 سازگاری graph engine و state interop", patterns: ["M184", "graph engine compatibility", "state interop", "LangGraph adapter"], phaseStatus: "designed_only" },
  { id: "M185-COVERAGE", key: "M185 repository intelligence and retrieval evidence", fa: "M185 هوش repository و evidence بازیابی", patterns: ["M185", "repository intelligence", "retrieval evidence", "exact commit retrieval"], phaseStatus: "designed_only" },
  { id: "M186-COVERAGE", key: "M186 human feedback and preference governance", fa: "M186 feedback انسانی و preference governance", patterns: ["M186", "human feedback", "preference governance", "no-direct-model-update"], phaseStatus: "designed_only" },
  { id: "M187-COVERAGE", key: "M187 dependency risk and vulnerability response", fa: "M187 ریسک dependency و پاسخ vulnerability", patterns: ["M187", "dependency risk", "vulnerability response", "license gate"], phaseStatus: "designed_only" },
  { id: "M188-COVERAGE", key: "M188 schema evolution and consumer compatibility", fa: "M188 تکامل schema و compatibility مصرف‌کننده", patterns: ["M188", "schema evolution", "consumer compatibility", "expand-contract"], phaseStatus: "designed_only" },
  { id: "M189-COVERAGE", key: "M189 release provenance and promotion evidence", fa: "M189 provenance انتشار و evidence ارتقا", patterns: ["M189", "release provenance", "promotion evidence", "reproducible release"], phaseStatus: "designed_only" },
  { id: "M190-COVERAGE", key: "M190 egress policy and destination governance", fa: "M190 policy خروجی و governance مقصد", patterns: ["M190", "egress policy", "destination governance", "credential lease"], phaseStatus: "designed_only" },
  { id: "M191-COVERAGE", key: "M191 retention legal hold and secure erasure", fa: "M191 retention و legal hold و erasure امن", patterns: ["M191", "secure erasure", "legal hold", "deletion evidence"], phaseStatus: "designed_only" },
  { id: "M192-COVERAGE", key: "M192 recovery chaos and failover evidence", fa: "M192 recovery و chaos و evidence failover", patterns: ["M192", "recovery chaos", "failover evidence", "restore proof"], phaseStatus: "designed_only" },
  { id: "M193-COVERAGE", key: "M193 tenant fairness and queue scheduling", fa: "M193 fairness tenant و queue scheduling", patterns: ["M193", "tenant fairness", "fair scheduler", "starvation bound"], phaseStatus: "designed_only" },
  { id: "M194-COVERAGE", key: "M194 runtime evidence envelope and claim verification", fa: "M194 evidence envelope و verification ادعا", patterns: ["M194", "evidence envelope", "claim verification", "replay proof"], phaseStatus: "designed_only" },
  { id: "M195-COVERAGE", key: "M195 provider health and circuit recovery", fa: "M195 health provider و circuit recovery", patterns: ["M195", "provider health", "circuit recovery", "fallback routing"], phaseStatus: "designed_only" },
  { id: "M196-COVERAGE", key: "M196 plugin capability sandbox and certification", fa: "M196 sandbox قابلیت plugin و certification", patterns: ["M196", "plugin certification", "extension sandbox", "plugin revocation"], phaseStatus: "designed_only" },
  { id: "M197-COVERAGE", key: "M197 notification delivery and preference governance", fa: "M197 delivery notification و preference governance", patterns: ["M197", "notification delivery", "preference governance", "escalation"], phaseStatus: "designed_only" },
  { id: "M198-COVERAGE", key: "M198 model catalog freshness and capability disclosure", fa: "M198 freshness کاتالوگ مدل و disclosure قابلیت", patterns: ["M198", "catalog freshness", "capability disclosure", "model retirement"], phaseStatus: "designed_only" },
  { id: "M199-COVERAGE", key: "M199 intent normalization and scope freeze", fa: "M199 نرمال‌سازی intent و scope freeze", patterns: ["M199", "intent normalization", "scope freeze", "no scope expansion"], phaseStatus: "designed_only" },
  { id: "M200-COVERAGE", key: "M200 side-effect journal and idempotent commit", fa: "M200 journal اثر جانبی و commit idempotent", patterns: ["M200", "side-effect journal", "idempotent commit", "compensation"], phaseStatus: "designed_only" },
  { id: "M201-COVERAGE", key: "M201 connector reconciliation and drift repair", fa: "M201 reconciliation connector و drift repair", patterns: ["M201", "connector reconciliation", "drift repair", "no-clobber"], phaseStatus: "designed_only" },
  { id: "M202-COVERAGE", key: "M202 approval integrity and decision expiry", fa: "M202 integrity approval و expiry تصمیم", patterns: ["M202", "approval integrity", "decision expiry", "approval revocation"], phaseStatus: "designed_only" },
  { id: "M203-COVERAGE", key: "M203 privacy-preserving analytics and aggregation", fa: "M203 analytics خصوصی و aggregation", patterns: ["M203", "privacy-preserving analytics", "k-anonymity", "deletion propagation"], phaseStatus: "designed_only" },
  { id: "M204-COVERAGE", key: "M204 run handoff and human takeover", fa: "M204 handoff اجرا و human takeover", patterns: ["M204", "run handoff", "human takeover", "resume safety"], phaseStatus: "designed_only" },
  { id: "M205-COVERAGE", key: "M205 capability attestation and trust-bound activation", fa: "M205 attestation قابلیت و activation مبتنی بر اعتماد", patterns: ["M205", "capability attestation", "trust-bound activation", "revocation propagation"], phaseStatus: "designed_only" },
  { id: "M206-COVERAGE", key: "M206 region-bound processing and residency enforcement", fa: "M206 پردازش منطقه‌ای و residency enforcement", patterns: ["M206", "region-bound processing", "residency enforcement", "regional deletion"], phaseStatus: "designed_only" },
  { id: "M207-COVERAGE", key: "M207 action simulation and blast-radius preview", fa: "M207 شبیه‌سازی action و blast-radius preview", patterns: ["M207", "action simulation", "blast-radius preview", "side-effect-free"], phaseStatus: "designed_only" },
  { id: "M208-COVERAGE", key: "M208 policy change control and rollback", fa: "M208 کنترل تغییر policy و rollback", patterns: ["M208", "policy change control", "canary promotion", "policy rollback"], phaseStatus: "designed_only" },



  { id: "M119-COVERAGE", key: "M119 durable tenant transactions and RLS", fa: "M119 تراکنش durable tenant و RLS", patterns: ["M119", "durable tenant", "transactional outbox", "RLS"], phaseStatus: "designed_only" },
  { id: "M120-COVERAGE", key: "M120 verification CI security accessibility load", fa: "M120 ماتریس verification و CI و security و accessibility", patterns: ["M120", "verification matrix", "accessibility", "load evidence"], phaseStatus: "designed_only" },
  { id: "M121-COVERAGE", key: "M121 SDK CLI config developer handoff", fa: "M121 سازگاری SDK و CLI امن و handoff", patterns: ["M121", "SDK/API compatibility", "safe CLI", "developer handoff"], phaseStatus: "designed_only" },
  { id: "M122-COVERAGE", key: "M122 key rotation erasure deletion proof backup", fa: "M122 چرخش کلید و حذف حریم خصوصی", patterns: ["M122", "key rotation", "privacy erasure", "deletion proof"], phaseStatus: "designed_only" },
  { id: "M123-COVERAGE", key: "M123 capacity circuit breaker resilience", fa: "M123 ظرفیت و circuit breaker و تاب‌آوری", patterns: ["M123", "capacity planning", "circuit breaker", "failure injection"], phaseStatus: "designed_only" },
  {
    id: "DC-27",
    key: "SLA for users",
    fa: "توافق‌نامه سطح خدمت",
    patterns: ["\\bsla\\b"],
    phaseStatus: "designed_only",
  },
  {
    id: "DC-26",
    key: "pen-test / bug bounty",
    fa: "تست نفوذ و پاداش آسیب‌پذیری",
    patterns: ["pen[- ]?test", "bug bounty"],
    phaseStatus: "designed_only",
  },
  {
    id: "M9-COVERAGE",
    key: "M9 collaboration and project bootstrap",
    fa: "M9 همکاری تیمی و ساخت پروژه",
    patterns: ["M9", "collaboration", "project bootstrap"],
    phaseStatus: "designed_only",
  },
  {
    id: "M10-COVERAGE",
    key: "M10 evaluation quality and consensus",
    fa: "M10 ارزیابی، دروازه کیفیت و اجماع",
    patterns: ["M10", "quality gates", "consensus"],
    phaseStatus: "designed_only",
  },
  {
    id: "M11-COVERAGE",
    key: "M11 billing metering and entitlements",
    fa: "M11 صورتحساب، metering و entitlement",
    patterns: ["M11", "billing", "entitlement"],
    phaseStatus: "designed_only",
  },
  {
    id: "M12-COVERAGE",
    key: "M12 internationalization localization and accessibility",
    fa: "M12 بین‌المللی‌سازی و دسترس‌پذیری",
    patterns: ["M12", "internationalization", "accessibility"],
    phaseStatus: "designed_only",
  },
  {
    id: "M13-COVERAGE",
    key: "M13 governed plugin ecosystem",
    fa: "M13 اکوسیستم plugin حاکمیت‌شده",
    patterns: ["M13", "plugin ecosystem", "marketplace"],
    phaseStatus: "designed_only",
  },
  {
    id: "M14-COVERAGE",
    key: "M14 data governance and privacy lifecycle",
    fa: "M14 حاکمیت داده و چرخه حریم خصوصی",
    patterns: ["M14", "data governance", "privacy lifecycle"],
    phaseStatus: "designed_only",
  },
  {
    id: "M15-COVERAGE",
    key: "M15 workflow automation and triggers",
    fa: "M15 خودکارسازی workflow و trigger",
    patterns: ["M15", "workflow automation", "event-driven"],
    phaseStatus: "designed_only",
  },
  {
    id: "M16-COVERAGE",
    key: "M16 memory and context retrieval",
    fa: "M16 حافظه و بازیابی context",
    patterns: ["M16", "memory retrieval", "context retrieval"],
    phaseStatus: "designed_only",
  },
  {
    id: "M17-COVERAGE",
    key: "M17 agent protocol interoperability",
    fa: "M17 پروتکل agent و interoperability",
    patterns: ["M17", "agent protocol", "interoperability gateway"],
    phaseStatus: "designed_only",
  },
  {
    id: "M18-COVERAGE",
    key: "M18 organization governance policy as code",
    fa: "M18 governance سازمانی و policy-as-code",
    patterns: ["M18", "organization governance", "policy-as-code"],
    phaseStatus: "designed_only",
  },
  {
    id: "DC-22",
    key: "multi-model consensus / voting",
    fa: "رأی‌گیری چندمدلی",
    patterns: ["consensus", "voting", "رأی‌گیری"],
  },
  {
    id: "DC-31",
    key: "repo scaffold / init",
    fa: "ساخت پروژه از صفر",
    patterns: ["scaffold", "template repo"],
  },
  {
    id: "DC-37",
    key: "billing / metering",
    fa: "صورتحساب و اندازه‌گیری مصرف",
    patterns: ["billing", "metering", "صورت‌حساب"],
  },
  {
    id: "DC-38",
    key: "i18n of platform",
    fa: "چندزبانه‌بودن پلتفرم",
    patterns: ["\\bi18n\\b", "چندزبانه"],
  },

  // These topics are designed in the phase documents below. They are designed
  // topics, not open design work. M3 is documented in
  // docs/26-phase-m3-sandbox-execution-and-security.md, M4 in
  // docs/27-phase-m4-product-experience-observability-and-operations.md and M5 in
  // docs/28-phase-m5-connector-sdk-and-governed-extensibility.md.
  {
    id: "DC-11",
    key: "prompt A/B + rollback",
    fa: "انتشار تدریجی و بازگردانی پرامپت",
    patterns: ["prompt.{0,25}(rollback|a/b)", "بازگرداندن پرامپت"],
    gapRefs: ["GAP-QA-02", "GAP-IN-13"],
  },
  {
    id: "DC-20",
    key: "A2A agent-to-agent protocol",
    fa: "پروتکل ایجنت‌به‌ایجنت",
    patterns: ["\\ba2a\\b", "agent-to-agent"],
    gapRefs: ["GAP-IN-08"],
  },
  {
    id: "DC-21",
    key: "prompt caching",
    fa: "کش پرامپت",
    patterns: ["prompt cach", "کش پرامپت"],
    gapRefs: ["GAP-IN-07"],
  },
  {
    id: "DC-14",
    key: "deploy adapters",
    fa: "آداپتور استقرار",
    patterns: ["vercel", "cloud run", "deploy adapter"],
    gapRefs: ["GAP-EX-10"],
  },
  {
    id: "DC-39",
    key: "kubernetes / helm",
    fa: "کوبرنتیز و Helm",
    patterns: ["kubernetes", "\\bhelm\\b"],
    gapRefs: ["GAP-PO-03"],
  },
  {
    id: "DC-25",
    key: "capacity planning / load model",
    fa: "مدل بار و ظرفیت",
    patterns: ["capacity plan", "load model", "تخمین بار"],
    gapRefs: ["GAP-QA-04"],
  },
  {
    id: "DC-40",
    key: "runbook / on-call",
    fa: "runbook و آنکال",
    patterns: ["runbook", "on-?call"],
    gapRefs: ["GAP-OB-03"],
  },
  {
    id: "DC-09",
    key: "cost dashboards",
    fa: "داشبورد هزینه",
    patterns: ["cost dashboard", "داشبورد هزینه"],
    gapRefs: ["GAP-OB-04"],
  },
  {
    id: "DC-10",
    key: "onboarding / first-run",
    fa: "تجربه اولین اجرا",
    patterns: ["onboarding", "first[- ]run"],
    gapRefs: ["GAP-CP-08"],
  },
  {
    id: "DC-13",
    key: "admin / ops console",
    fa: "پنل مدیریت و عملیات",
    patterns: ["admin console", "ops console", "پنل ادمین"],
    gapRefs: ["GAP-UX-02"],
  },
  {
    id: "DC-15",
    key: "performance budget",
    fa: "بودجه کارایی",
    patterns: ["lighthouse", "performance budget", "بودجه کارایی"],
  },
  {
    id: "DC-16",
    key: "docs generation for output",
    fa: "تولید مستند برای خروجی",
    patterns: ["docstring", "jsdoc", "مستندسازی خودکار"],
  },
  {
    id: "DC-18",
    key: "CI caching strategy",
    fa: "استراتژی کش CI",
    patterns: ["turbo cache", "cache strategy"],
    gapRefs: ["GAP-PO-02"],
  },
  {
    id: "DC-19",
    key: "feature flags",
    fa: "پرچم ویژگی",
    patterns: ["feature flag", "پرچم ویژگی"],
  },
  {
    id: "DC-30",
    key: "error taxonomy",
    fa: "طبقه‌بندی خطاها",
    patterns: ["rfc ?7807", "error code"],
    gapRefs: ["GAP-API-03"],
  },
  {
    id: "DC-35",
    key: "docker-compose self-host",
    fa: "راه‌اندازی self-host",
    patterns: ["docker[- ]compose", "self[- ]host"],
    gapRefs: ["GAP-PO-01"],
  },
  {
    id: "DC-41",
    key: "release policy / changelog",
    fa: "سیاست انتشار و changelog",
    patterns: ["changelog", "deprecat"],
    gapRefs: ["GAP-PO-06", "GAP-API-06"],
  },
  {
    id: "DC-03",
    key: "sandbox escalation path",
    fa: "پلکان ارتقای دسترسی سندباکس",
    patterns: ["escalat", "ارتقای دسترسی"],
    gapRefs: ["GAP-EX-01", "GAP-SE-01"],
  },
  {
    id: "DC-07",
    key: "abuse prevention",
    fa: "جلوگیری از سوءاستفاده",
    patterns: ["abuse", "malware"],
    gapRefs: ["GAP-SE-09"],
  },
  {
    id: "DC-08",
    key: "content moderation of output",
    fa: "پالایش محتوای خروجی",
    patterns: ["moderation", "محتوای نامناسب"],
    gapRefs: ["GAP-SE-06"],
  },
  {
    id: "DC-32",
    key: "dependency scanning",
    fa: "اسکن وابستگی‌ها",
    patterns: ["dependabot", "dependency scan", "snyk", "trivy"],
    gapRefs: ["GAP-SE-07"],
  },
  {
    id: "DC-34",
    key: "data retention / GDPR",
    fa: "نگهداری و حذف داده",
    // Deliberately not the bare word "retention": a settings key such as
    // `auditLogRetentionDays` names a policy, it does not design the
    // per-table schedule or the deletion job this topic asks for.
    patterns: [
      "retention.{0,40}(per.table|جدول|schedule|زمان‌بندی)",
      "deletion job",
      "حذف زمان‌بندی‌شده",
      "right to erasure",
      "حق فراموشی",
      "gdpr",
    ],
    gapRefs: ["GAP-SE-04"],
  },
  {
    id: "DC-01",
    key: "repo indexing / RAG",
    fa: "نمایه‌سازی مخزن و بازیابی",
    patterns: ["\\brag\\b", "indexing", "نمایه"],
    gapRefs: ["GAP-IN-04", "GAP-IN-05"],
  },
  {
    id: "DC-02",
    key: "code search in repo",
    fa: "جست‌وجوی کد در مخزن",
    patterns: ["code search", "جست‌وجوی کد"],
    gapRefs: ["GAP-IN-04", "GAP-DA-05"],
  },
  {
    id: "DC-05",
    key: "merge conflict resolution",
    fa: "حل تعارض ادغام",
    patterns: ["merge conflict", "تعارض ادغام"],
    gapRefs: ["GAP-EX-02"],
  },
  {
    id: "DC-06",
    key: "monorepo support",
    fa: "پشتیبانی از monorepo",
    patterns: ["monorepo", "turborepo", "pnpm workspace"],
    gapRefs: ["GAP-EX-03"],
  },
  {
    id: "DC-12",
    key: "backup / DR / RPO",
    fa: "پشتیبان‌گیری و بازیابی فاجعه",
    patterns: ["backup", "\\brpo\\b", "disaster"],
    gapRefs: ["GAP-OB-05"],
  },
  {
    id: "DC-24",
    key: "SLO targets",
    fa: "اهداف SLO",
    patterns: ["\\bslo\\b"],
    gapRefs: ["GAP-OB-01"],
  },
  {
    id: "DC-33",
    key: "supply chain / lockfile",
    fa: "زنجیره تأمین و lockfile",
    patterns: ["lockfile", "supply chain"],
    gapRefs: ["GAP-SE-07"],
  },
  {
    id: "DC-36",
    key: "observability of runs",
    fa: "مشاهده‌پذیری اجراها",
    patterns: ["timeline", "run detail"],
    gapRefs: ["GAP-UX-03", "GAP-OB-02"],
  },
  {
    id: "DC-29",
    key: "BullMQ queue design",
    fa: "طراحی صف BullMQ",
    patterns: ["bullmq"],
    gapRefs: ["GAP-EX-11"],
  },
  {
    id: "DCD-01",
    key: "error handling / repair loop",
    fa: "حلقه مدیریت خطا و تعمیر",
    patterns: ["repair", "تعمیر"],
    gapRefs: ["GAP-IN-09"],
  },
  {
    id: "DCD-02",
    key: "human approval flow",
    fa: "جریان تأیید انسانی",
    patterns: ["approval", "تأیید انسانی"],
    gapRefs: ["GAP-UX-04"],
  },
  {
    id: "DCD-03",
    key: "free-tier strategy",
    fa: "استراتژی لایه رایگان",
    patterns: ["free tier", "رایگان"],
    gapRefs: ["GAP-LG-02"],
  },
  {
    id: "DCD-04",
    key: "secrets management",
    fa: "مدیریت secret",
    patterns: ["secret"],
    gapRefs: ["GAP-EX-08"],
  },
  {
    id: "DCD-05",
    key: "model router / fallback",
    fa: "مسیریابی مدل و fallback",
    patterns: ["router", "fallback"],
    gapRefs: ["GAP-IN-10"],
  },
  {
    id: "DCD-06",
    key: "sandbox",
    fa: "سندباکس",
    patterns: ["sandbox", "سندباکس"],
    gapRefs: ["GAP-EX-01"],
  },
  {
    id: "DCD-07",
    key: "licensing compliance",
    fa: "انطباق لایسنس",
    patterns: ["license", "لایسنس"],
    gapRefs: ["GAP-LG-02"],
  },
  {
    id: "DCD-08",
    key: "audit log",
    fa: "لاگ ممیزی",
    patterns: ["audit"],
    gapRefs: ["GAP-DA-06"],
  },
  {
    id: "DCD-09",
    key: "state machine",
    fa: "ماشین حالت",
    patterns: ["state[- ]machine", "ماشین حالت"],
    gapRefs: ["GAP-EX-11"],
  },
  {
    id: "DCD-10",
    key: "redaction of secrets",
    fa: "پاک‌سازی secret",
    patterns: ["redact", "پاک‌سازی"],
    gapRefs: ["GAP-SE-06"],
  },
  {
    id: "DCD-11",
    key: "connector tiers A–D",
    fa: "سطح‌بندی کانکتور A–D",
    patterns: ["tier", "کلاس [abcd]"],
    gapRefs: ["GAP-IG-05"],
  },
  {
    id: "DCD-12",
    key: "tenant isolation / RLS",
    fa: "جداسازی tenant و RLS",
    patterns: ["\\brls\\b", "tenant"],
    gapRefs: ["GAP-SE-10"],
  },
  {
    id: "DCD-13",
    key: "quota / budget",
    fa: "سهمیه و بودجه",
    patterns: ["quota", "budget"],
    gapRefs: ["GAP-CP-03"],
  },
  {
    id: "DCD-14",
    key: "evidence rule",
    fa: "قاعده شواهد",
    patterns: ["evidence", "شواهد"],
    gapRefs: ["GAP-EX-04"],
  },
  {
    id: "DCD-15",
    key: "Prisma",
    fa: "Prisma",
    patterns: ["prisma"],
    gapRefs: ["GAP-DA-01"],
  },
  {
    id: "DCD-16",
    key: "memory layers",
    fa: "لایه‌های حافظه",
    patterns: ["memory", "حافظه"],
    gapRefs: ["GAP-IN-05"],
  },
  {
    id: "DCD-17",
    key: "diff / patch strategy",
    fa: "استراتژی diff و patch",
    patterns: ["\\bdiff\\b"],
    gapRefs: ["GAP-CP-05"],
  },
  {
    id: "DCD-18",
    key: "preview environment",
    fa: "محیط پیش‌نمایش",
    patterns: ["preview"],
    gapRefs: ["GAP-EX-05"],
  },
  {
    id: "DCD-19",
    key: "OAuth / PKCE",
    fa: "OAuth و PKCE",
    patterns: ["oauth", "pkce"],
    gapRefs: ["GAP-IG-01"],
  },
  {
    id: "DCD-20",
    key: "CAPTCHA / MFA stop rule",
    fa: "توقف در CAPTCHA و MFA",
    patterns: ["captcha", "mfa"],
    gapRefs: ["GAP-IG-05"],
  },
  {
    id: "DCD-21",
    key: "workspace / VFS",
    fa: "workspace و VFS",
    patterns: ["workspace", "\\bvfs\\b"],
    gapRefs: ["GAP-EX-02"],
  },
  {
    id: "DCD-22",
    key: "prompt injection defence",
    fa: "دفاع در برابر تزریق پرامپت",
    patterns: ["injection", "تزریق"],
    gapRefs: ["GAP-SE-05"],
  },
  {
    id: "DCD-23",
    key: "Ollama / local models",
    fa: "Ollama و مدل‌های لوکال",
    patterns: ["ollama"],
    gapRefs: ["GAP-IN-06"],
  },
  {
    id: "DCD-24",
    key: "KMS / envelope encryption",
    fa: "KMS و رمزنگاری پاکتی",
    patterns: ["kms", "envelope", "vault"],
    gapRefs: ["GAP-SE-03"],
  },
  {
    id: "DCD-25",
    key: "task DAG / scheduling",
    fa: "گراف تسک و زمان‌بندی",
    patterns: ["\\bdag\\b"],
  },
  {
    id: "DCD-26",
    key: "idempotency",
    fa: "idempotency",
    patterns: ["idempot"],
    gapRefs: ["GAP-IG-07"],
  },
  {
    id: "DCD-27",
    key: "output contract validation",
    fa: "اعتبارسنجی قرارداد خروجی",
    patterns: ["json schema", "structured output"],
    gapRefs: ["GAP-CP-10"],
  },
  {
    id: "DCD-28",
    key: "milestones M1–M7",
    fa: "مایلستون‌های M1 تا M7",
    patterns: ["\\bM[1-7]\\b"],
  },
  {
    id: "DCD-29",
    key: "BYOK",
    fa: "BYOK (کلید خود کاربر)",
    patterns: ["byok", "کلید خود کاربر"],
  },
  {
    id: "DCD-30",
    key: "pgvector / embeddings",
    fa: "pgvector و embedding",
    patterns: ["pgvector", "embedding"],
    gapRefs: ["GAP-IN-05"],
  },
  {
    id: "DCD-31",
    key: "cancellation semantics",
    fa: "معنای لغو اجرا",
    patterns: ["cancel", "لغو"],
  },
  {
    id: "DCD-32",
    key: "workers",
    fa: "workerها",
    patterns: ["worker"],
    gapRefs: ["GAP-EX-11"],
  },
  {
    id: "DCD-33",
    key: "git workflow / PR",
    fa: "گردش‌کار git و PR",
    patterns: ["pull request"],
    gapRefs: ["GAP-CP-05"],
  },
  {
    id: "DCD-34",
    key: "static analysis of output",
    fa: "تحلیل ایستا روی خروجی",
    patterns: ["eslint", "\\blint\\b"],
    gapRefs: ["GAP-PO-05"],
  },
  {
    id: "DCD-35",
    key: "e2e testing of output",
    fa: "تست e2e خروجی",
    patterns: ["playwright", "cypress"],
    gapRefs: ["GAP-QA-03"],
  },
  {
    id: "DCD-36",
    key: "webhook",
    fa: "webhook",
    patterns: ["webhook"],
    gapRefs: ["GAP-IG-04"],
  },
  {
    id: "DCD-37",
    key: "PostgreSQL",
    fa: "PostgreSQL",
    patterns: ["postgres"],
  },
  {
    id: "DCD-38",
    key: "eval scenarios",
    fa: "سناریوهای ارزیابی",
    patterns: ["eval", "سناریوی ارزیابی"],
    gapRefs: ["GAP-QA-01"],
  },
  {
    id: "DCD-39",
    key: "streaming (SSE) protocol",
    fa: "پروتکل streaming (SSE)",
    patterns: ["\\bsse\\b", "eventsource"],
    gapRefs: ["GAP-API-04"],
  },
  {
    id: "DCD-40",
    key: "compute modes",
    fa: "حالت‌های محاسباتی",
    patterns: ["compute mode", "حالت محاسباتی"],
  },
  {
    id: "DCD-41",
    key: "file locking",
    fa: "قفل فایل",
    patterns: ["file lock", "قفل فایل"],
    gapRefs: ["GAP-EX-02"],
  },
  {
    id: "DCD-42",
    key: "language matrix",
    fa: "ماتریس زبان",
    patterns: ["python", "rust"],
    gapRefs: ["GAP-EX-03"],
  },
  {
    id: "DCD-43",
    key: "distributed tracing",
    fa: "ردیابی توزیع‌شده",
    patterns: ["opentelemetry", "otel"],
    gapRefs: ["GAP-OB-02"],
  },
  {
    id: "DCD-44",
    key: "a11y testing of output",
    fa: "تست دسترس‌پذیری خروجی",
    patterns: ["axe", "pa11y"],
    gapRefs: ["GAP-QA-05"],
  },
  {
    id: "DCD-45",
    key: "test runner adapters",
    fa: "آداپتور test runner",
    patterns: ["test runner", "vitest", "pytest"],
    gapRefs: ["GAP-EX-04"],
  },
  {
    id: "DCD-46",
    key: "MCP",
    fa: "MCP",
    patterns: ["\\bmcp\\b"],
    gapRefs: ["GAP-IG-03"],
  },
  {
    id: "DCD-47",
    key: "rate limiting",
    fa: "محدودسازی نرخ",
    patterns: ["rate[- ]limit"],
    gapRefs: ["GAP-API-07"],
  },
  {
    id: "DCD-48",
    key: "retry / backoff",
    fa: "retry و backoff",
    patterns: ["backoff", "retry"],
    gapRefs: ["GAP-IG-08"],
  },
  {
    id: "DCD-49",
    key: "Next.js",
    fa: "Next.js",
    patterns: ["next\\.?js"],
    gapRefs: ["GAP-UX-01"],
  },
  {
    id: "DCD-50",
    key: "multi-tenant",
    fa: "چندمستأجری",
    patterns: ["multi[- ]tenant", "چندمستأجر"],
    gapRefs: ["GAP-SE-02"],
  },
  {
    id: "DCD-51",
    key: "quality gates / DoD",
    fa: "دروازه کیفیت و DoD",
    patterns: ["definition of done", "دروازه کیفیت"],
    gapRefs: ["GAP-QA-02"],
  },
  {
    id: "DCD-52",
    key: "tRPC",
    fa: "tRPC",
    patterns: ["trpc"],
    gapRefs: ["GAP-API-05"],
  },
  {
    id: "DCD-53",
    key: "modular monolith boundary",
    fa: "مرز مونولیت ماژولار",
    patterns: ["monolith"],
  },
  {
    id: "DCD-54",
    key: "observability metrics",
    fa: "متریک‌های مشاهده‌پذیری",
    patterns: ["prometheus", "metrics?"],
    gapRefs: ["GAP-OB-01"],
  },
  {
    id: "DCD-55",
    key: "context window management",
    fa: "مدیریت پنجره متن",
    patterns: ["context window", "پنجره متن"],
    gapRefs: ["GAP-IN-03"],
  },
  {
    id: "DCD-56",
    key: "token accounting per run",
    fa: "حسابداری توکن برای هر Run",
    patterns: [
      "token.{0,25}(account|count)",
      "شمارش توکن",
      "حسابداری توکن",
      "monthlyTokenBudget",
      "\\btpd\\b",
    ],
    gapRefs: ["GAP-IN-07"],
  },
];

export const DESIGN_TOPICS: DesignTopic[] = [...OPEN_DESIGN_TOPICS, ...DESIGNED_TOPICS];

export type Coverage = "designed" | "thin" | "none";

export interface CoverageRow {
  topic: DesignTopic;
  coverage: Coverage;
  mentions: number;
  evidence: Array<{ file: string; count: number }>;
}

export interface CoverageReport {
  rows: CoverageRow[];
  designed: number;
  thin: number;
  none: number;
  /** Topics checked but carrying no closure requirement. */
  total: number;
}

export function classify(mentions: number): Coverage {
  if (mentions === 0) return "none";
  if (mentions <= THIN_THRESHOLD) return "thin";
  return "designed";
}

/**
 * Scan a set of documents. `files` maps a path to its text; the caller decides
 * which files count as evidence (the audit's own documents must be excluded,
 * otherwise the audit cites itself as coverage).
 */
export function scanDesignCoverage(files: Map<string, string>): CoverageReport {
  const rows: CoverageRow[] = DESIGN_TOPICS.map((topic) => {
    const evidence: Array<{ file: string; count: number }> = [];
    for (const [file, text] of files) {
      let count = 0;
      for (const source of topic.patterns) {
        count += (text.match(new RegExp(source, "gi")) ?? []).length;
      }
      if (count > 0) evidence.push({ file, count });
    }
    evidence.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
    const mentions = evidence.reduce((sum, e) => sum + e.count, 0);
    return { topic, coverage: classify(mentions), mentions, evidence };
  });

  return {
    rows,
    designed: rows.filter((r) => r.coverage === "designed").length,
    thin: rows.filter((r) => r.coverage === "thin").length,
    none: rows.filter((r) => r.coverage === "none").length,
    total: rows.length,
  };
}

/**
 * The list must agree with the scan in both directions: an undesigned topic
 * needs severity + milestone + closure, and a designed topic must not keep one.
 */
export function closureProblems(report: CoverageReport): string[] {
  const problems: string[] = [];
  for (const row of report.rows) {
    const t = row.topic;
    const hasClosure = typeof t.closure === "string" && t.closure.trim().length > 0;
    const where = `${row.mentions} mentions in ${row.evidence.map((e) => e.file).join(", ") || "no file"}`;
    if (row.coverage !== "designed") {
      if (!hasClosure) problems.push(`${t.id} is ${row.coverage} but has no closure action`);
      if (!t.severity) problems.push(`${t.id} is ${row.coverage} but has no severity`);
      if (!t.milestone) problems.push(`${t.id} is ${row.coverage} but has no milestone`);
    } else if (hasClosure || t.severity || t.milestone) {
      problems.push(`${t.id} is now designed (${where}) — move it to DESIGNED_TOPICS`);
    }
  }
  return problems;
}

const COVERAGE_FA: Record<Coverage, string> = {
  designed: "طراحی‌شده",
  thin: "نازک",
  none: "بدون طراحی",
};

const COVERAGE_MARK: Record<Coverage, string> = {
  designed: "✅",
  thin: "🟡",
  none: "🔴",
};

const SEVERITY_FA: Record<GapSeverity, string> = {
  blocker: "بلوکر",
  high: "بالا",
  medium: "متوسط",
  low: "پایین",
};

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

function fa(n: number): string {
  return String(n)
    .split("")
    .map((d) => FA_DIGITS[Number(d)] ?? d)
    .join("");
}

const SEVERITY_RANK: Record<GapSeverity, number> = {
  blocker: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Markdown for the generated block of docs/17-design-coverage.md. */
export function renderCoverageTables(report: CoverageReport): string {
  const lines: string[] = [];
  const open = report.rows
    .filter((r) => r.coverage !== "designed")
    .sort(
      (a, b) =>
        // open topics always carry a severity (enforced by closureProblems);
        // rank undefined last so the sort stays total.
        (SEVERITY_RANK[a.topic.severity ?? "low"] ?? 99) -
          (SEVERITY_RANK[b.topic.severity ?? "low"] ?? 99) ||
        a.topic.id.localeCompare(b.topic.id),
    );

  lines.push("## خلاصه پوشش طراحی");
  lines.push("");
  lines.push(
    `از ${fa(report.total)} موضوعی که این پلتفرم باید درباره‌اش موضع داشته باشد، ` +
      `${fa(report.designed)} طراحی شده، ${fa(report.thin)} فقط نام برده شده، و ` +
      `${fa(report.none)} هیچ پوششی ندارد.`,
  );
  lines.push("");
  lines.push("| پوشش | تعداد |");
  lines.push("|---|---|");
  for (const c of ["none", "thin", "designed"] as const) {
    lines.push(`| ${COVERAGE_MARK[c]} ${COVERAGE_FA[c]} | ${fa(report.rows.filter((r) => r.coverage === c).length)} |`);
  }
  lines.push("");

  lines.push(`## موضوعات بدون طراحی یا نازک (${fa(open.length)})`);
  lines.push("");
  lines.push("| شناسه | موضوع | پوشش | شدت | مایلستون |");
  lines.push("|---|---|---|---|---|");
  for (const row of open) {
    lines.push(
      `| \`${row.topic.id}\` | ${row.topic.fa} | ${COVERAGE_MARK[row.coverage]} ${COVERAGE_FA[row.coverage]} | ${SEVERITY_FA[row.topic.severity ?? "low"]} | ${row.topic.milestone ?? "—"} |`,
    );
  }
  lines.push("");

  for (const row of open) {
    lines.push(`### \`${row.topic.id}\` — ${row.topic.fa}`);
    lines.push("");
    lines.push(
      `**کلید:** \`${row.topic.key}\` · **پوشش فعلی:** ${COVERAGE_FA[row.coverage]}` +
        (row.evidence.length > 0
          ? ` (${fa(row.mentions)} ذکر در ${row.evidence.map((e) => `\`${e.file}\``).join("، ")})`
          : " (صفر ذکر در همه اسناد)") +
        " · **مایلستون:** " +
        row.topic.milestone,
    );
    lines.push("");
    if (row.topic.gapRefs && row.topic.gapRefs.length > 0) {
      lines.push(
        `**شکاف‌های مرتبط:** ${row.topic.gapRefs.map((r) => `\`${r}\``).join("، ")} (سند ۱۶)`,
      );
      lines.push("");
    }
    lines.push(`**چه چیزی آن را می‌بندد:** ${row.topic.closure}`);
    lines.push("");
  }

  lines.push("## موضوعاتی که طراحی شده‌اند");
  lines.push("");
  lines.push("| موضوع | ذکر | اسناد |");
  lines.push("|---|---|---|");
  for (const row of report.rows.filter((r) => r.coverage === "designed")) {
    const top = row.evidence
      .slice(0, 3)
      .map((e) => `\`${e.file}\``)
      .join("، ");
    lines.push(`| ${row.topic.fa} | ${fa(row.mentions)} | ${top} |`);
  }
  lines.push("");

  return lines.join("\n");
}

export const COVERAGE_START =
  "<!-- COVERAGE:START (generated by scripts/render-design-coverage.ts — do not edit by hand) -->";
export const COVERAGE_END = "<!-- COVERAGE:END -->";

export function injectCoverageTables(markdown: string, report: CoverageReport): string {
  const start = markdown.indexOf(COVERAGE_START);
  const end = markdown.indexOf(COVERAGE_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("docs/17-design-coverage.md is missing the COVERAGE:START / COVERAGE:END markers");
  }
  const before = markdown.slice(0, start + COVERAGE_START.length);
  const after = markdown.slice(end);
  return `${before}\n\n${renderCoverageTables(report)}\n${after}`;
}
