import { readFileSync, writeFileSync } from "node:fs";

type Proposal = {
  id: string;
  number: number;
  category: string;
  priority: string;
  titleFa: string;
  goal: string;
  problem: string;
  design: string;
  inputs: string[];
  outputs: string[];
  interfaceOrSchema: string[];
  implementationLocation: string[];
  dependencies: string[];
  safety: string[];
  securityThreats: string[];
  testsRequired: string[];
  acceptance: string[];
  definitionOfDone: string[];
  status: string;
  implementationStatus: string;
  codeEvidence: string[];
};

type Register = {
  version: string;
  generatedAt: string;
  statusVocabulary: Record<string, string>;
  proposals: Proposal[];
};

const register = JSON.parse(readFileSync("docs/upgrade-register.json", "utf8")) as Register;

function bullets(values: string[]): string {
  return values.map((value) => `- ${value}`).join("\n");
}

function field(title: string, values: string[]): string {
  return `**${title}:**\n${bullets(values)}\n`;
}

const statusSummary = Object.entries(register.statusVocabulary)
  .filter(([key]) => ["designed_only", "scaffolded", "partial", "done_tested"].includes(key))
  .map(([key, description]) => `| \`${key}\` | ${description} |`)
  .join("\n");

const entries = register.proposals.map((proposal) => {
  const evidence = proposal.codeEvidence.length > 0
    ? proposal.codeEvidence.map((path) => `- ${path}`).join("\n")
    : "- هنوز code evidence ثبت نشده؛ این وضعیت عمداً ادعای پیاده‌سازی ندارد.";
  const dependencies = proposal.dependencies.length > 0 ? proposal.dependencies.join(", ") : "ندارد";
  return `### ${proposal.number}. ${proposal.titleFa} — ${proposal.id}

| دسته | اولویت | وضعیت canonical | وضعیت legacy پیاده‌سازی |
|---|---|---|---|
| ${proposal.category} | ${proposal.priority} | \`${proposal.status}\` | \`${proposal.implementationStatus}\` |

${field("هدف", [proposal.goal])}
${field("مسئله‌ای که حل می‌کند", [proposal.problem])}
${field("طراحی اجرایی", [proposal.design])}
${field("ورودی‌ها", proposal.inputs)}
${field("خروجی‌ها", proposal.outputs)}
${field("Interface / Schema", proposal.interfaceOrSchema)}
${field("محل پیاده‌سازی", proposal.implementationLocation)}
**وابستگی‌ها:** ${dependencies}

${field("مرزهای امنیتی", proposal.safety)}
${field("تهدیدهای امنیتی", proposal.securityThreats)}
${field("تست‌های لازم", proposal.testsRequired)}
${field("معیار پذیرش", proposal.acceptance)}
${field("Definition of Done", proposal.definitionOfDone)}
**Evidence کد فعلی:**
${evidence}
`;
}).join("\n");

const phaseContracts = `

## قراردادهای فاز M119 تا M123

این پنج فاز extensionهای جدید به ۱۰۰ proposal هستند و وضعیت آن‌ها مستقل از \`done_tested\` proposalها، \`designed_only\` باقی می‌ماند. deterministic kernel و unit test، integration production محسوب نمی‌شوند.

| فاز | قرارداد | dependency/مرز | production evidence لازم |
|---|---|---|---|
| M119 | Durable tenant transaction، RLS، migration safety، transactional outbox | \`src/core/durable-tenant-runtime.ts\` و \`GAP-DA-07\` | PostgreSQL/RLS، migration runner، durable outbox worker و دو-tenant replay |
| M120 | Verification matrix، CI، security، accessibility، load | \`src/core/verification-matrix-runtime.ts\` و \`GAP-QA-07\` | CI artifacts، scanner، browser/screen-reader و bounded load telemetry |
| M121 | SDK/API compatibility، safe CLI، config bootstrap، handoff | \`src/core/developer-sdk-cli-runtime.ts\` و \`GAP-API-08\` | generated SDK، sandbox، secret manager، config store و compatibility run |
| M122 | Key rotation، erasure، deletion proof، backup retention | \`src/core/key-rotation-deletion-runtime.ts\` و \`GAP-SE-12\` | KMS/HSM، erasure worker، immutable proof و backup purge/restore |
| M123 | Capacity، circuit breaker، failure injection، resilience alert | \`src/core/resilience-capacity-runtime.ts\` و \`GAP-PO-07\` | telemetry، runtime breaker، bounded chaos، alert route و incident drill |

تمام فازها Local-first، BYOK، free-tier fallback، sandbox، audit و approval را حفظ می‌کنند؛ raw password/key material ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است، و production deploy بدون approval انجام نمی‌شود.


## قراردادهای فاز M124 تا M128

این سری پنج فاز جدید را به‌عنوان hardening contracts ثبت می‌کند؛ وضعیت هر پنج فاز مستقل از proposalهای ۱۰۰تایی، \`designed_only\` از نظر production integration است.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M124 | audit ledger، evidence provenance، replay و retention | \`GAP-AUD-01\` | WORM/event store، signed evidence، replay worker و legal-hold retention |
| M125 | identity continuity، session revoke، delegation و MFA recovery | \`GAP-CP-14\` | IdP/passkey، durable revoke، membership persistence و recovery review |
| M126 | connector consent، signed webhook، reconciliation و action safety | \`GAP-IG-12\` | OAuth/PKCE، ingress، cursor/outbox، provider adapter و conflict UI |
| M127 | corpus، deterministic replay، quality gate و release evidence | \`GAP-QA-08\` | corpus registry، model runner، CI/browser farm، load و rollback |
| M128 | usage ledger، quota، provider allocation و cost reconciliation | \`GAP-OB-07\` | durable metering، quota probes، scheduler، billing adapter و FinOps dashboard |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M129 تا M133

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً \`designed_only\` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M129 | API evolution، schema migration و stream reconnect | \`GAP-API-09\` | schema registry، consumer CI، durable stream replay و migration runner |
| M130 | artifact supply chain، SBOM، attestation، secret و egress | \`GAP-SE-13\` | signed registry، scanners، attestation verifier، secret broker و egress proxy |
| M131 | approval operations، human review و escalation | \`GAP-CP-15\` | durable inbox، reviewer identity، notification، signing و deployment gate |
| M132 | knowledge ACL، freshness، lineage و context | \`GAP-IN-19\` | indexer، ACL retrieval، freshness worker، lineage store و deletion propagation |
| M133 | self-host upgrade، backup restore و controlled cutover | \`GAP-PO-08\` | package/controller، encrypted restore، traffic switch، rollback و drill |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M134 تا M138

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً \`designed_only\` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M134 | data portability و controlled import | \`GAP-DA-08\` | encrypted export store، schema registry، import worker و rollback |
| M135 | device pairing و local trust | \`GAP-CP-16\` | IdP/WebAuthn، attestation، device registry و revocation fan-out |
| M136 | policy distribution و configuration drift | \`GAP-SE-14\` | signed policy service، KMS، fleet agent و runtime enforcement |
| M137 | incident case، bounded containment و postmortem | \`GAP-PO-09\` | alert/case store، on-call، containment controller و drill |
| M138 | privacy-preserving telemetry و feedback | \`GAP-OB-08\` | consent store، telemetry SDK، DLP، warehouse و deletion worker |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M139 تا M143

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً \`designed_only\` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M139 | observability SLO و trace integrity | \`GAP-OB-09\` | telemetry collector/backend، SLO evaluator، alert router و runbook |
| M140 | full-text search و query governance | \`GAP-DA-09\` | indexer، ACL search، ranking/freshness و export audit |
| M141 | workflow scheduler و trigger runtime | \`GAP-EX-14\` | scheduler، durable queue، lease/worker، retry و DLQ |
| M142 | artifact lifecycle و preview isolation | \`GAP-EX-15\` | artifact store، preview proxy، sandbox، signed URL و cleanup |
| M143 | operator console و live Run UX | \`GAP-UX-10\` | Web UI، realtime gateway، safe action API و accessibility E2E |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M144 تا M148

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً \`designed_only\` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M144 | public API surface و OpenAPI compatibility | \`GAP-API-10\` | OpenAPI registry/gateway، consumer CI، authz و rate limiter |
| M145 | connector SDK و OAuth/PKCE lifecycle | \`GAP-IG-13\` | connector SDK، OAuth provider، token broker و webhook ingress |
| M146 | workspace VFS و sandbox resource boundary | \`GAP-EX-16\` | VFS/snapshot، sandbox/cgroup، resource telemetry و diff applier |
| M147 | tenant isolation و RLS proof | \`GAP-SE-15\` | PostgreSQL RLS، cross-tenant CI probe، transaction replay و signed proof |
| M148 | E2E release acceptance و readiness | \`GAP-QA-09\` | product E2E، security/accessibility matrix، orchestrator و rollback |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M149 تا M153

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً \`designed_only\` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M149 | durable worker queue، retry و DLQ | \`GAP-EX-17\` | queue backend، worker consumer، lease، retry و DLQ store |
| M150 | database migration و schema governance | \`GAP-DA-10\` | migration runner، schema lock، backfill monitor، RLS و rollback |
| M151 | GitHub App و webhook/action integration | \`GAP-IG-14\` | GitHub App، token broker، webhook ingress و repository worker |
| M152 | preview environment و deployment routing | \`GAP-EX-18\` | provisioner، port allocator، TLS/proxy، deployment adapter و cleanup |
| M153 | product E2E orchestration و failure containment | \`GAP-QA-10\` | scenario runner، isolated test data، E2E runner، evidence و rollback |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M159 تا M163

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً \`designed_only\` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M159 | data residency و regional routing | \`GAP-SE-17\` | regional store/router، jurisdiction registry، transfer gateway و deletion worker |
| M160 | feature flags و progressive rollout | \`GAP-CP-18\` | signed flag store، evaluator، propagation، SLO guardrail و kill switch |
| M161 | workload identity و service-account leases | \`GAP-IG-16\` | IdP/attestation، lease broker، binding policy و revoke propagation |
| M162 | data rights، export و deletion orchestration | \`GAP-DA-11\` | rights intake، encrypted export، deletion sweep، legal hold و residual proof |
| M163 | FinOps budget guardrails و usage reconciliation | \`GAP-OB-10\` | usage ledger، receipt adapter، cost catalog، budget gateway و alerting |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M164 تا M168

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً \`designed_only\` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M164 | structured output repair و response safety | \`GAP-IN-20\` | model adapter، schema decoder، repair worker، DLP و response gateway |
| M165 | agent delegation و capability tokens | \`GAP-IG-17\` | delegation broker، capability store، agent gateway و revoke propagation |
| M166 | cancellation و compensation runtime | \`GAP-EX-19\` | cancellation controller، checkpoint/lease، compensation worker و cleanup |
| M167 | reproducible build و release manifest | \`GAP-PO-11\` | hermetic builder، registry، SBOM/provenance verifier و canary gate |
| M168 | outbound webhook و callback delivery | \`GAP-IG-18\` | endpoint registry، signing service، queue/worker، retry/DLQ و replay store |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M169 تا M173

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً \`designed_only\` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M169 | context provenance و prompt-injection firewall | \`GAP-IN-21\` | context assembler، provenance store، classifier، quarantine و response firewall |
| M170 | tool action boundary و transactional approval | \`GAP-EX-20\` | tool gateway، approval store، precondition lock، action applier و rollback |
| M171 | offline sync و conflict resolution | \`GAP-UX-11\` | offline client/store، sync API، conflict UI، merge worker و device trust |
| M172 | accessibility و localization verification | \`GAP-QA-11\` | locale pipeline، browser/a11y runner، screen-reader evidence و CI gate |
| M173 | incident learning و runbook automation | \`GAP-PO-12\` | case store، on-call router، runbook executor، postmortem و regression CI |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M174 تا M178

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً \`designed_only\` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M174 | prompt experimentation و rollback | \`GAP-IN-22\` | variant registry، assignment/router، evaluator، privacy-safe metrics و rollback controller |
| M175 | multi-model consensus و voting | \`GAP-IN-23\` | panel registry، model fan-out، vote store، calibration و human review |
| M176 | agent-to-agent protocol و interoperability | \`GAP-IG-19\` | discovery registry، protocol gateway، signature/replay store، schema validator و revoke |
| M177 | prompt cache integrity و privacy | \`GAP-SE-18\` | cache backend، KMS/BYOK، invalidation، poisoning detector و replica purge |
| M178 | deployment adapter و release target boundary | \`GAP-PO-13\` | target registry، adapter gateway، artifact verifier، smoke runner و rollback controller |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M179 تا M183

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً \`designed_only\` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M179 | pull-request quality و commit provenance | \`GAP-PO-14\` | Git provider، reviewer/code-owner، secret scanner، CI checks، merge controller و release registry |
| M180 | agent graph orchestration و durable checkpoints | \`GAP-EX-21\` | graph compiler، durable queue/worker، checkpoint store، lease manager، sandbox و replay |
| M181 | performance budget و load shedding | \`GAP-OB-11\` | telemetry، budget ledger، admission gateway، scheduler، load runner و autoscaler |
| M182 | onboarding و safe first run | \`GAP-CP-19\` | Web onboarding، auth/session، provider consent، fixture/bootstrap و handoff gateway |
| M183 | service entitlement، SLA و degraded disclosure | \`GAP-CP-20\` | entitlement/billing adapter، usage ledger، quota gateway، SLA monitor و disclosure UI |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M184 تا M188

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً \`designed_only\` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M184 | graph engine compatibility و state interop | \`GAP-EX-22\` | adapter gateway، state/checkpoint store، protocol translator، sandbox و replay |
| M185 | repository intelligence و retrieval evidence | \`GAP-IN-24\` | commit-bound indexer، ACL retrieval، semantic/AST backend، DLP و deletion worker |
| M186 | human feedback و preference governance | \`GAP-QA-12\` | feedback store، privacy/bias evaluator، model registry، canary و rollback |
| M187 | dependency risk و vulnerability response | \`GAP-SE-19\` | package/SCA feed، license/SBOM verifier، patch workflow و quarantine gate |
| M188 | schema evolution و consumer compatibility | \`GAP-API-11\` | schema registry، migration/backfill runner، consumer CI، gateway و rollback |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M189 تا M193

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً \`designed_only\` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M189 | release provenance و promotion evidence | \`GAP-PO-15\` | artifact registry، reproducible builder، SBOM/provenance verifier، canary و rollback |
| M190 | egress policy و destination governance | \`GAP-SE-20\` | egress proxy، DNS/TLS policy، DLP، vault lease و network evidence |
| M191 | retention، legal hold و secure erasure | \`GAP-DA-12\` | retention registry، erasure orchestrator، backup sweep، KMS و residual scanner |
| M192 | recovery، chaos و failover evidence | \`GAP-OB-12\` | fault injector، backup/restore، failover/fencing coordinator، replay و incident evidence |
| M193 | tenant fairness و queue scheduling | \`GAP-EX-23\` | durable queue، fair scheduler، lease/preemption store، autoscaler و quota adapter |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M194 تا M198

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً \`designed_only\` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M194 | runtime evidence envelope و claim verification | \`GAP-OB-13\` | evidence ledger، signer/verifier، claim aggregator، replay runner و evidence surface |
| M195 | provider health و circuit recovery | \`GAP-IG-20\` | health collector، circuit/quota gateway، route controller، probe worker و fallback disclosure |
| M196 | plugin capability sandbox و extension certification | \`GAP-SE-21\` | extension registry، artifact verifier، sandbox executor، scanners و revoke propagation |
| M197 | notification delivery و preference governance | \`GAP-CP-21\` | notification store/router، consent UI، channel adapters، delivery worker و escalation |
| M198 | model catalog freshness و capability disclosure | \`GAP-IN-25\` | signed catalog، discovery verifier، health/quota probe، activation gate و retirement migrator |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M199 تا M203

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً \`designed_only\` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M199 | intent normalization و scope freeze | \`GAP-CP-22\` | intent/requirement store، scope evaluator، plan compiler، freeze store و change workflow |
| M200 | side-effect journal و idempotent commit | \`GAP-EX-24\` | durable journal، idempotency/outbox، precondition lock، applier، receipt و compensation |
| M201 | connector reconciliation و drift repair | \`GAP-IG-21\` | snapshot/cursor store، diff engine، conflict UI، repair worker و drift collector |
| M202 | approval integrity و decision expiry | \`GAP-CP-23\` | approval inbox، signed decision store، expiry/revoke gate و second reviewer workflow |
| M203 | privacy-preserving analytics و aggregation | \`GAP-OB-14\` | privacy collector، budget ledger، noisy aggregate، cohort gate، export و deletion worker |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.

## قراردادهای فاز M204 تا M208

این سری پنج فاز hardening جدید را ثبت می‌کند؛ هر پنج فاز از نظر production integration عمداً \`designed_only\` هستند و contract kernel به‌تنهایی integration claim نیست.

| فاز | قرارداد | gap | production evidence boundary |
|---|---|---|---|
| M204 | run handoff و human takeover | \`GAP-CP-24\` | run-control store، takeover UI، lease/authority، checkpoint resume و cleanup coordinator |
| M205 | capability attestation و trust-bound activation | \`GAP-SE-22\` | issuer/verifier، capability registry، environment probe، activation gateway و revoke propagation |
| M206 | region-bound processing و residency enforcement | \`GAP-DA-13\` | regional router، provider location verifier، transfer gateway، encrypted stores و erasure worker |
| M207 | action simulation و blast-radius preview | \`GAP-EX-25\` | isolated simulator، snapshot/diff، preview UI، apply gateway و rollback runner |
| M208 | policy change control و rollback | \`GAP-SE-23\` | policy registry، diff/test evaluator، signed canary gateway، distributor، drift monitor و rollback controller |

Local-first، BYOK، free-tier fallback، sandbox، audit و approval پابرجا هستند؛ raw password/key/token ذخیره نمی‌شود، CAPTCHA/MFA bypass و bulk account creation ممنوع است و production deploy بدون approval مجاز نیست.
`;

const output = `# قرارداد اجرایی ۱۰۰ پیشنهاد ارتقای ForgePilot

این سند از [docs/upgrade-register.json](./upgrade-register.json) ساخته می‌شود؛ منبع حقیقت ماشین‌خوان همان رجیستر است و این فایل با \`npm run render:upgrades\` بازتولید می‌شود. هر پیشنهاد باید هدف، مسئله، ورودی/خروجی، Interface یا Schema، محل پیاده‌سازی، وابستگی، مرز و تهدید امنیتی، تست و Definition of Done داشته باشد.

**نسخه رجیستر:** ${register.version}\n\n**تاریخ رجیستر:** ${register.generatedAt}\n\n**تعداد:** ${register.proposals.length}\n\n## واژگان وضعیت

| وضعیت | معنی |
|---|---|
${statusSummary}

` + entries + phaseContracts;

writeFileSync("docs/23-upgrade-contracts.md", output, "utf8");
console.log(`docs/23-upgrade-contracts.md regenerated from ${register.proposals.length} proposals.`);
