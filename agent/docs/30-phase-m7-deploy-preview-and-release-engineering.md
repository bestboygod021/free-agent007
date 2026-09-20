# فاز بعدی: M7 Deploy، Preview و Release Engineering

**نام فاز:** `M7.0 — استقرار قابل‌تأیید با Preview ایزوله و Rollback قابل‌اثبات`
**وضعیت:** `designed_only`
**پیش‌نیاز اجباری:** M1.2 Durable Control Plane، M2.0 Repository Intelligence، M3.0 Sandbox/Security، M4.0 Product Experience، M5.0 Connector SDK و M6.0 Browser Automation
**معیار سطح محصول:** یک تغییر versioned از snapshot تأییدشده به artifact قابل‌اعتماد، preview tenant-safe و در صورت approval صریح به target استقرار برسد؛ verification، health، audit، cost، rollback و failure recovery قابل‌مشاهده و قابل‌آزمون باشند.

M7 «کلیک Deploy» نیست. Deploy یک side effect کلاس D است که فقط با artifact
immutable، policy verdict، approval معتبر، verification پس از استقرار و مسیر
rollback مجاز است. مدل می‌تواند release proposal بسازد، اما target، image، secret،
approval، migration و production state را خودش تعیین یا تغییر نمی‌دهد.

تا اجرای واقعی build fixture، registry mock، preview router، provider deploy mock،
health failure، rollback، migration compatibility، دو tenant و mode matrix، هیچ
بخش این سند `done_tested` نیست.

---

## ۱. خروجی نهایی فاز

```text
approved change / commit
  → immutable snapshot + policy review
  → reproducible build
  → dependency/license/secret/security gates
  → signed image + SBOM + provenance
  → release candidate
  → preview allocation (tenant + route + TTL)
  → smoke / functional / accessibility verification
  → human approval for promotion
  → DeployAdapter execution
  → health/SLO verification
  → progressive rollout or hold
  → release evidence + audit
  → revoke / expire / rollback
```

M7 باید برای هر release نشان دهد:

- snapshot، commit، Plan hash، prompt/model/tool versions و ChangeScope چه بوده‌اند.
- artifact از کدام Dockerfile/build inputs با چه digest و builder ساخته شده است.
- dependency، license، SBOM، secret scan، vulnerability و policy gate چه نتیجه‌ای داشته‌اند.
- preview به کدام organization/project تعلق دارد، چه URL و TTLی دارد و چه کسی آن را می‌بیند.
- health check فقط process زنده را سنجیده یا readiness، smoke، functional و security check نیز موفق بوده‌اند.
- کدام `DeployAdapter` با چه provider account، target، manifest و capabilityی فراخوانی شده است.
- promotion به staging/production با کدام approval، MFA freshness، approver و budget انجام شده است.
- نسخه قبلی چیست، rollback point کجاست و migration/data rollback چه محدودیتی دارد.
- failure، unknown provider result، partial rollout و cleanup چگونه مدیریت شده‌اند.
- هیچ secret خام، credential، registry token یا production configuration در log، artifact یا prompt نرفته است.

---

## ۲. مرز فاز

### در محدوده

| حوزه | خروجی طراحی |
|---|---|
| Release Contract | `ReleaseCandidate`، snapshot، artifact، policy، approval و evidence hash |
| Build Plane | reproducible build، pinned base image، SBOM، license، secret و vulnerability gates |
| Image Supply Chain | digest، signature، provenance، registry allowlist و immutable promotion |
| Preview | port allocation، route، TLS، tenant isolation، auth، TTL، cleanup و signed URL |
| Deploy SDK | `DeployAdapter` مستقل از provider با validate، plan، apply، verify و rollback |
| Provider Adapters | reference adapter برای local/compose و قرارداد Vercel/Fly/Cloud Run/Kubernetes |
| Environment Policy | local، preview، staging و production با سقف‌های مستقل |
| Approval | change scope، budget، fresh MFA، two-person review و no self-approval |
| Verification | liveness، readiness، smoke، functional، accessibility، security و SLO gates |
| Rollout | recreate، rolling، blue/green و canary با stop criteria و hold |
| Rollback | artifact rollback، config rollback، migration compatibility و manual data recovery |
| Config/Secrets | environment schema، encrypted reference، rotation، no raw secret injection to logs |
| IaC/Helm | values per environment، schema، drift detection و upgrade path |
| Observability | deploy event، trace، release timeline، cost، health و incident projection |
| Abuse/Legal | provider ToS، quota، free-tier honesty، production boundary و audit |
| Evidence | artifact hash، SBOM hash، signature، health report، approval و rollback receipt |
| Test Fixtures | registry، provider، preview router، health failure، migration و tenant probes |

### خارج از محدوده

- production deploy بدون approval صریح و fresh MFA
- push مستقیم به `main`، تغییر branch protection یا bypass review
- deploy با mutable tag، unsigned image، unverified artifact یا unknown build input
- ذخیره یا نمایش raw registry token، cloud credential، database password یا private key
- automatic destructive migration، data rollback جعلی یا حذف backup برای ساده‌سازی deploy
- ادعای Kubernetes production readiness بدون cluster fixture، policy، upgrade و rollback evidence
- marketplace عمومی providerها یا arbitrary Terraform/Helm/plugin execution
- استفاده از Browser Automation برای bypass deploy API، approval یا provider policy
- استفاده از paid infrastructure در `free` یا cloud deploy/fallback ناخواسته در `local`
- انتشار preview خصوصی با URL عمومی بدون auth، expiry و tenant binding
- rollback خودکار به artifact آسیب‌پذیر یا release revoked
- deploy هم‌زمان چند tenant با credential یا namespace مشترک

---

## ۳. وابستگی و Gateهای اجباری

| dependency | حداقل gate پیش از اجرای واقعی M7 |
|---|---|
| M1.2 | durable Run، queue، approval، outbox، idempotency و tenant context واقعی |
| M2.0 | commit-pinned snapshot، worktree/diff، protected branch و artifact source binding |
| M3.0 | sandbox build، egress، resource limit، secret broker، redaction و cleanup |
| M4.0 | UI برای diff، approval، timeline، cost، health، incident و rollback |
| M5.0 | adapter registry، capability/risk، consent، provenance، rate و revoke |
| M6.0 | browser verification فقط در مسیر governed؛ deploy به login automation وابسته نباشد |
| Registry | signed image/package، immutable digest، retention و access policy |
| Storage | artifact store tenant-safe با signed URL، TTL و deletion receipt |
| DNS/TLS | preview route، certificate، ownership و renewal policy |
| Database | migration compatibility، backup/restore drill و forward-only policy |

تا dependencyها واقعی نشده‌اند، M7 فقط طراحی، fixture و contract است؛ «deployed»
در متن یا mock response evidence اجرای واقعی محسوب نمی‌شود.

---

## ۴. مدل معماری و مناطق اعتماد

```text
┌──────────────────────────────────────────────────────────────┐
│ Control Plane                                                │
│ snapshot · policy · approval · budget · tenant · audit        │
└────────────────┬─────────────────────────────────────────────┘
                 │ signed ReleaseCandidate
                 ▼
┌──────────────────────────────────────────────────────────────┐
│ Build Plane / Sandbox                                         │
│ reproducible build · tests · SBOM · scans · image digest      │
└────────────────┬─────────────────────────────────────────────┘
                 │ signed artifact + provenance
                 ▼
┌──────────────────────────────────────────────────────────────┐
│ Artifact/Registry                                             │
│ allowlist · immutable digest · retention · signature verify    │
└───────────────┬───────────────────────┬──────────────────────┘
                │                       │
                ▼                       ▼
┌────────────────────────┐  ┌──────────────────────────────────┐
│ Preview Plane           │  │ Deploy Adapter Plane              │
│ route · TLS · TTL       │  │ plan · apply · verify · rollback   │
└────────────┬───────────┘  └────────────────┬─────────────────┘
             │                               │
             └──────────────┬────────────────┘
                            ▼
                 ┌────────────────────────┐
                 │ Health · Event · Audit  │
                 │ evidence · UI · cost   │
                 └────────────────────────┘
```

### source of truth

- Control Plane منبع حقیقت target، environment policy، approval، budget و promotion است.
- Git snapshot منبع حقیقت source است؛ provider state جایگزین commit و Plan نمی‌شود.
- Artifact Registry منبع حقیقت digest، signature، SBOM و retention است.
- Preview Router منبع حقیقت route، port، TLS، auth و expiry است.
- DeployAdapter فقط provider API را با capability محدود صدا می‌زند؛ provider response authority داخلی نیست.
- Health/Verification Gate می‌تواند promotion را متوقف کند، اما نمی‌تواند approval بسازد.
- UI، model، README، provider message و deployment output فقط data هستند.

### Deploy flow

```text
DeployIntent
  → target/environment policy
  → snapshot + ChangeScope
  → build and quality gates
  → artifact signature verification
  → preview or promotion approval
  → adapter plan
  → human review of plan
  → apply with idempotency key
  → verify and observe
  → promote / hold / rollback
```

---

## ۵. قراردادهای داده اصلی

### ۵.۱ `ReleaseCandidate`

```ts
interface ReleaseCandidate {
  releaseId: string;
  organizationId: string;
  projectId: string;
  runId: string;
  source: {
    repositoryId: string;
    commitSha: string;
    snapshotId: string;
    changeScopeHash: string;
    planHash: string;
  };
  artifact: {
    imageDigest: string;
    imageRef: string;
    buildId: string;
    sbomHash: string;
    provenanceHash: string;
    signatureRef: string;
    builderVersion: string;
  };
  gates: {
    typecheck: "passed" | "failed" | "skipped";
    unit: "passed" | "failed" | "skipped";
    integration: "passed" | "failed" | "skipped";
    e2e: "passed" | "failed" | "skipped";
    accessibility: "passed" | "failed" | "skipped";
    secretScan: "passed" | "failed" | "skipped";
    dependencyScan: "passed" | "failed" | "skipped";
    licenseScan: "passed" | "failed" | "skipped";
    artifactPolicy: "passed" | "failed" | "skipped";
  };
  environment: "local" | "preview" | "staging" | "production";
  riskClass: "A" | "B" | "C" | "D";
  approvalId?: string;
  expiresAt: string;
  candidateHash: string;
}
```

Rules:

- `imageDigest`، `sbomHash`، `provenanceHash` و `signatureRef` اجباری‌اند.
- `skipped` فقط وقتی مجاز است که environment/mode policy آن gate را صریحاً exempt کرده و reason داشته باشد.
- build input، source commit و artifact باید one-to-one bind باشند؛ rebuild با خروجی متفاوت candidate جدید است.
- production candidate بدون همه gateهای لازم، approval معتبر و rollback reference وارد promotion نمی‌شود.

### ۵.۲ `PreviewLease`

```ts
interface PreviewLease {
  previewId: string;
  organizationId: string;
  projectId: string;
  releaseId: string;
  snapshotId: string;
  route: {
    host: string;
    pathPrefix: string;
    port: number;
    tlsCertificateRef: string;
  };
  access: {
    authMode: "workspace" | "one-time-link" | "public-deny";
    audience: string[];
    signedUrlHash?: string;
  };
  limits: {
    expiresAt: string;
    maxRequests: number;
    maxRuntimeSeconds: number;
    maxEgressBytes: number;
  };
  cleanup: {
    deleteOnExpiry: true;
    deleteOnRevoke: true;
    artifactReceiptRequired: true;
  };
  leaseHash: string;
}
```

- host و path باید organization/project/release را bind کنند؛ user-provided host پذیرفته نمی‌شود.
- preview عمومی default deny است؛ one-time link scope، expiry و audience دارد.
- preview نمی‌تواند به production database، production secret یا private tenant دیگر وصل شود.
- preview lease بعد از expiry route، DNS mapping، certificate reference، process، cache و signed URL را invalidate می‌کند.

### ۵.۳ `DeployIntent`

```ts
interface DeployIntent {
  intentId: string;
  organizationId: string;
  projectId: string;
  releaseId: string;
  target: {
    adapterId: string;
    environment: "local" | "preview" | "staging" | "production";
    region?: string;
    namespace?: string;
  };
  strategy: "recreate" | "rolling" | "blue_green" | "canary";
  desiredReplicas?: number;
  configRef: string;
  secretRefs: string[];
  migrationPolicy: "none" | "forward_compatible" | "approval_required";
  budgetRef: string;
  approvalPolicyHash: string;
  idempotencyKey: string;
  requestedBy: string;
  expiresAt: string;
}
```

Production target، migration، region و replica count از model output مستقیم گرفته
نمی‌شود. هرکدام در environment policy و user-visible plan validate می‌شوند.

### ۵.۴ `VerificationReport`

```ts
interface VerificationReport {
  verificationId: string;
  releaseId: string;
  targetId: string;
  checks: Array<{
    name: "process" | "readiness" | "liveness" | "smoke" | "functional" | "accessibility" | "security" | "slo" | "migration";
    status: "passed" | "failed" | "unknown" | "not_run";
    endpointHash?: string;
    artifactRef?: string;
    durationMs?: number;
    reason?: string;
  }>;
  baselineReleaseId?: string;
  rollbackRecommended: boolean;
  reportHash: string;
  evidenceId: string;
}
```

`HTTP 200` به‌تنهایی health نیست. اگر check critical `unknown` باشد، promotion
متوقف و status به `hold` می‌رود؛ سیستم حدس موفقیت نمی‌زند.

### ۵.۵ `RollbackPlan`

```ts
interface RollbackPlan {
  rollbackId: string;
  releaseId: string;
  targetId: string;
  previousReleaseId: string;
  previousArtifactDigest: string;
  configVersion: string;
  migration: {
    state: "none" | "backward_compatible" | "forward_only" | "manual_recovery";
    dataRollback: "not_supported" | "backup_restore" | "operator_procedure";
    backupRef?: string;
  };
  trigger: string[];
  approvalRequired: true;
  idempotencyKey: string;
  planHash: string;
}
```

Rollback artifact/config را می‌تواند خودکار آغاز کند، اما data rollback، destructive
migration و تغییر schema production فقط با operator procedure/approval جدا انجام می‌شود.

---

## ۶. Build، Artifact و Supply Chain

### build flow

```text
snapshot pinned
  → clean workspace
  → dependency lock validation
  → base image digest validation
  → build in sandbox
  → tests/scans
  → SBOM + license report
  → image digest
  → provenance/signature
  → registry push
  → independent verification
```

### اصول build

- build context از snapshot مشخص و allowlisted ساخته می‌شود؛ host filesystem و untracked secret وارد context نیست.
- lockfile و package manager version pin هستند؛ network dependency از egress policy عبور می‌کند.
- base image tag به‌تنهایی کافی نیست؛ digest، source، build timestamp و builder identity ثبت می‌شوند.
- multi-stage build، non-root runtime، read-only root filesystem و کمینه capability پیش‌فرض‌اند.
- artifact قبل از registry push secret scan، dependency scan، license scan و vulnerability policy را می‌گذراند.
- image provenance و SBOM قابل retrieve، hashable و tenant-bound هستند.
- registry token از Secret Broker reference می‌آید و در command line، build log یا image layer ظاهر نمی‌شود.
- artifact immutable است؛ tag promotion فقط alias قابل‌تغییر به digest است و برای audit کافی نیست.
- rebuild غیرقطعی باید candidate جدید بسازد؛ «همان tag» proof reproducibility نیست.

### Artifact status

```text
created
  → scanned
  → signed
  → registry_verified
  → preview_eligible
  → staging_eligible
  → production_eligible
  → revoked
  → expired
```

`revoked` حتی اگر health خوب باشد، deploy و rollback جدید را block می‌کند. rollback
به نسخه revoked نیازمند incident exception جداست و default-deny باقی می‌ماند.

### Image policy

| rule | نتیجه |
|---|---|
| unsigned image | block |
| mutable tag بدون digest | block |
| critical vulnerability باز | block یا hold طبق policy، نه ignore ساکت |
| secret در layer/history | block و quarantine |
| license ناسازگار | block |
| unknown base image | block |
| SBOM ناقص | block |
| provenance ناقص | block |
| image بیش از retention | expire و no new deploy |

---

## ۷. Environment Policy و Configuration

### environmentها

| environment | هدف | side effect | approval |
|---|---|---|---|
| `local` | توسعه/self-host | فقط local resource | user action، بدون cloud fallback |
| `preview` | review یک release | isolated/test data | project consent؛ external write default deny |
| `staging` | verification نزدیک production | sandboxed integration | explicit promotion approval |
| `production` | سرویس واقعی | external/user impact | fresh MFA + approval + policy gate |

### `EnvironmentPolicy`

```ts
interface EnvironmentPolicy {
  environment: "local" | "preview" | "staging" | "production";
  allowedAdapters: string[];
  allowedRegions: string[];
  allowedImageRegistries: string[];
  allowedCapabilities: string[];
  maxReplicas: number;
  maxCostPerDeploy: number;
  requireApproval: boolean;
  requireFreshMfa: boolean;
  requireSecondReviewer: boolean;
  allowExternalWrites: boolean;
  allowProductionSecrets: boolean;
  migrationMode: "none" | "forward_compatible" | "manual";
  previewTtlSeconds?: number;
  policyHash: string;
}
```

- environment policy ceiling است؛ user budget و permission فقط می‌توانند محدودتر کنند.
- production `allowProductionSecrets=true` فقط برای secret referenceهای explicit و scoped است؛ raw secret هرگز در artifact نیست.
- config value از source، environment و secret reference جدا نگه داشته می‌شود.
- config schema قبل از deploy validate و بعد از render با redacted diff نمایش داده می‌شود.
- تغییر environment policy خودش change request و audit می‌خواهد.

### config و secret

```text
config schema
  → non-secret values
  → encrypted SecretReference
  → environment policy
  → render in adapter boundary
  → no raw value in Plan/log/artifact
```

Secret rotation باید release/config version جدید بسازد. revoke credential باید deploy
جدید، active preview lease و provider reference مرتبط را طبق policy invalidate کند.

---

## ۸. Preview Plane

### lifecycle

```text
preview.requested
  → lease_reserved
  → route_allocated
  → artifact_started
  → ready_check
  → reviewable
  → expired | revoked | promoted | failed
  → cleanup_pending
  → cleaned | cleanup_failed
```

### route و isolation

- port از allocator مرکزی و tenant-scoped گرفته می‌شود؛ client port انتخاب نمی‌کند.
- route canonical با release/preview ID ساخته می‌شود؛ collision به‌صورت atomic رد می‌شود.
- TLS certificate و wildcard route فقط برای domain تحت کنترل سیستم است.
- preview container/process در namespace، network policy، service account و resource quota جدا اجرا می‌شود.
- preview data از fixture/sanitized seed می‌آید؛ production database یا personal data به آن clone نمی‌شود.
- preview egress default deny یا allowlist است؛ callback و webhook به production endpoint default deny است.
- one-time link hash ذخیره می‌شود، raw link در event/log نیست و با اولین استفاده یا expiry invalid می‌شود.
- screenshot، log، trace و artifact preview همان tenant/retention policy را دارند.

### preview verification

حداقل ترتیب:

1. route/TLS/auth check؛
2. process و readiness؛
3. smoke page/API؛
4. critical user path؛
5. accessibility؛
6. secret/egress probe؛
7. resource/latency budget؛
8. evidence package.

Preview موفق فقط `reviewable` است؛ promotion به production نتیجه preview را consume
می‌کند اما approval و current policy را دوباره بررسی می‌کند.

### expiry و cleanup

expiry باید route، port lease، workload، signed URL، cache، temporary secret lease،
preview database و artifacts مشتق‌شده را طبق retention پاک کند. cleanup receipt باید
لیست resource ID/hash و timestamp داشته باشد. cleanup failure به `incident` می‌رود و
preview را دوباره public نمی‌کند.

---

## ۹. `DeployAdapter` SDK

### interface

```ts
interface DeployAdapter {
  id(): string;
  manifest(): DeployAdapterManifest;
  validateConfig(input: unknown, environment: EnvironmentPolicy): Promise<ValidationResult>;
  plan(input: DeployIntent): Promise<DeployPlan>;
  apply(plan: DeployPlan): Promise<DeployReceipt>;
  status(target: DeployTarget): Promise<DeployStatus>;
  verify(target: DeployTarget, checks: VerificationCheck[]): Promise<VerificationReport>;
  rollback(plan: RollbackPlan): Promise<RollbackReceipt>;
  revoke(input: RevokeDeployInput): Promise<RevokeReceipt>;
  cleanup(target: DeployTarget): Promise<CleanupReceipt>;
}
```

### `DeployAdapterManifest`

```ts
interface DeployAdapterManifest {
  adapterId: string;
  version: string;
  provider: string;
  supportedEnvironments: Array<"local" | "preview" | "staging" | "production">;
  supportedStrategies: Array<"recreate" | "rolling" | "blue_green" | "canary">;
  capabilities: string[];
  requiresApprovalFor: string[];
  supportedRegions: string[];
  license: string;
  endpointAllowlist: string[];
  signature: string;
  manifestHash: string;
}
```

Adapter rules:

- adapter خودش environment policy، approval یا hard deny را bypass نمی‌کند.
- provider API response untrusted است تا schema، target، release و request hash validate شود.
- `plan` read-only و قابل review است؛ `apply` side effect و idempotency اجباری دارد.
- `rollback` فقط به release/artifact معتبر و policy-approved اشاره می‌کند.
- provider credential از encrypted reference و scoped lease می‌آید.
- adapter version و provider API version در evidence ثبت می‌شوند.

### adapter strategy

M7 ابتدا contract و یک reference adapter local/compose دارد. Vercel، Fly، Cloud
Run و Kubernetes باید adapter جدا با capability و license review داشته باشند؛ یک
provider-specific branch در core مجاز نیست.

---

## ۱۰. Kubernetes، Helm و IaC Boundary

Kubernetes در M7 یک deploy target است، نه authority جدید.

### Helm/IaC rules

- chart version و image digest pin می‌شوند؛ `latest`، wildcard image و unbounded `values` ممنوع‌اند.
- values per environment جداست؛ production values از repository public و model context خارج می‌ماند.
- namespace، service account، RBAC، NetworkPolicy، ResourceQuota، PodSecurity و PDB به‌صورت explicit تعریف می‌شوند.
- chart template قبل از apply render، schema validate، diff و policy scan می‌شود.
- Kubernetes API endpoint از allowlist و scoped credential عبور می‌کند؛ raw kubeconfig در log/prompt نیست.
- `helm upgrade --install` یا equivalent فقط از adapter و با idempotency اجرا می‌شود؛ command arbitrary از model ممنوع است.
- drift detection فقط finding می‌سازد؛ agent نمی‌تواند drift را خودکار overwrite کند.
- CRD، admission policy، cluster-wide RBAC، node، storage و network تغییرات کلاس D هستند.
- rollback chart به‌تنهایی data migration را rollback نمی‌کند؛ migration state در `RollbackPlan` تعیین‌کننده است.

### cluster safety

```text
render
  → lint/schema/policy
  → diff
  → approval
  → apply namespace-scoped
  → readiness/health
  → observe
  → promote or rollback
```

Cluster credential باید کمینه و environment-specific باشد. namespace و tenant mapping
از Control Plane می‌آید، نه از values ارسالی مدل.

---

## ۱۱. Verification، Health و Rollout

### check levels

| level | check | failure |
|---|---|---|
| process | process/container running | hold |
| liveness | service can answer basic probe | stop |
| readiness | dependencies/config available | no traffic |
| smoke | critical endpoint/page | hold |
| functional | contract/user flow | no promotion |
| accessibility | critical UI keyboard/axe checks | hold per policy |
| security | secret/egress/header/permission probes | block |
| migration | schema/version compatibility | block |
| SLO | error rate/latency/resource budget | pause/rollback |

Health endpoint نباید secret، environment variable، internal topology یا tenant data
را برگرداند. health result با artifact/release bind است و cache قدیمی proof نیست.

### rollout strategies

```text
recreate: stop old → start new → verify → serve
rolling: bounded replacement → readiness → drain old
blue_green: deploy idle color → verify → switch route → observe
canary: small traffic → metrics window → promote/hold/rollback
```

- strategy از environment policy می‌آید؛ model نمی‌تواند production را به canary یا برعکس تبدیل کند.
- traffic switch atomic و reversible است؛ DNS TTL یا provider behavior باید در rollback budget باشد.
- canary assignment، percentage، window، metric baseline و stop criteria در plan ثبت می‌شوند.
- اگر metric data `unknown` یا observability disconnected باشد، rollout pause است، نه success.
- rollout parallel بین tenantهای حساس فقط با policy و blast-radius budget ممکن است.

### stop criteria

- readiness failure، elevated 5xx، latency budget breach، error budget burn، security finding، secret exposure، unexpected egress، migration mismatch یا cost breach.
- stop خودکار traffic جدید را متوقف می‌کند و release را hold می‌کند؛ rollback فقط طبق policy/approval path انجام می‌شود.
- health recovery بدون evidence، failure را پاک نمی‌کند.

---

## ۱۲. Approval، Production Boundary و Rollback

### approval card

برای promotion یا production باید نمایش داده شود:

- source commit، change scope و diff summary
- artifact/image digest، SBOM، vulnerability/license/secret results
- environment، region، replica، rollout strategy و estimated cost
- config redacted diff، secret reference kind/expiry و migration plan
- preview URL، verification report و known limitations
- previous release، rollback plan، backup reference و data rollback limitation
- blast radius، health thresholds، stop criteria و incident contact
- exact actor، approver، second reviewer و MFA freshness

Approval فقط به `releaseId + target + artifactDigest + configHash + strategy` bind
است. تغییر هرکدام approval را stale می‌کند.

### production gate

```text
proposal
  → policy deny/hard checks
  → candidate gates
  → preview/staging evidence
  → human review
  → fresh MFA
  → second reviewer if policy requires
  → idempotent adapter apply
  → health/rollout window
  → promote or hold/rollback
```

self-approval، agent approval، stale MFA، approval برای target متفاوت و approval
بدون artifact hash معتبر رد می‌شوند. production deploy بدون approval حتی اگر
`full` autonomy باشد ممنوع است.

### rollback matrix

| failure | default behavior |
|---|---|
| build/scans fail | no deploy |
| preview fail | no promotion |
| apply rejected before side effect | retry only if adapter says safe and same idempotency |
| provider unknown after apply | status unknown، no blind retry، reconcile |
| health fail before traffic | hold یا rollback طبق plan |
| health fail after partial rollout | stop traffic، rollback approved artifact |
| migration forward-only mismatch | hold، operator recovery، no fake data rollback |
| previous artifact revoked | block rollback، incident escalation |
| rollback itself fails | freeze target، incident، human operator |

Rollback به نسخه قبلی باید همان tenant، target، config compatibility و policy را
داشته باشد. rollback ابزار پاک‌کردن audit یا پنهان‌کردن failure نیست.

---

## ۱۳. Compute Mode و Free/Local/BYOK Strategy

M7 انتخاب `free`، `paid` یا `local` را برای کل deploy configuration اعمال می‌کند؛
mode فقط provider model نیست.

| رفتار | `free` | `paid` | `local` |
|---|---|---|---|
| build | local/free CI با quota محدود | provider مجاز/BYOK با budget | local sandbox |
| image registry | local یا free-tier مجاز | registry مجاز با consent | local registry/store |
| preview | local fixture/free-tier محدود، بدون paid infra | hosted preview با cost/consent | local compose/runner |
| staging | default disabled یا free-tier explicit | با consent و budget | local staging |
| production | ❌ | فقط provider/plan مجاز با approval | self-host local با explicit user action |
| cloud credential | no paid credential | encrypted reference/BYOK | cloud credential ممنوع مگر user-mediated خارج از platform cloud |
| telemetry | aggregate redacted | consented redacted | no cloud telemetry default |
| fallback | local یا block؛ paid fallback ممنوع | local فقط با انتخاب/consent | block؛ cloud fallback ممنوع |
| browser verification | fixture/local only | M6 governed browser | local browser only |

`free` یعنی deploy به provider پولی یا استفاده از credit card پنهان مجاز نیست.
`paid` به معنی bypass approval نیست. `local` یک self-host policy کامل است و اگر
artifact، registry یا preview local موجود نباشد، سیستم block می‌کند و mode را
silently عوض نمی‌کند.

---

## ۱۴. Cost، Quota و Capacity Envelope

هر deploy/preview باید قبل از apply reservation داشته باشد:

```text
cost estimate
  = build minutes
  + registry storage
  + preview runtime
  + egress
  + provider deploy units
  + verification calls
  + retention/artifact storage
```

- reservation per organization/project/environment است؛ actual usage بعد از event ledger می‌شود.
- quota exhaustion apply را متوقف می‌کند؛ fallback به provider ممنوع mode policy نیست.
- preview TTL و max replicas هزینه را محدود می‌کنند.
- cost estimate، uncertainty و provider free-tier limit در approval card نمایش داده می‌شوند.
- budget race با atomic reservation و release/settlement حل می‌شود.
- load envelope شامل concurrent previews، build queue، rollout window، health request و artifact storage است؛ مقدار آن قبل از production با fixture اندازه‌گیری می‌شود.
- scale-out نمی‌تواند tenant isolation، approval یا egress policy را ضعیف کند.

---

## ۱۵. Provenance و Audit

### `DeployEvidence`

```ts
interface DeployEvidence {
  evidenceId: string;
  organizationId: string;
  projectId: string;
  runId: string;
  releaseId: string;
  snapshotId: string;
  commitSha: string;
  planHash: string;
  artifactDigest: string;
  sbomHash: string;
  provenanceHash: string;
  adapterId: string;
  adapterVersion: string;
  targetId: string;
  environment: "local" | "preview" | "staging" | "production";
  configHash: string;
  modeHash: string;
  approvalId?: string;
  verificationId?: string;
  rollbackId?: string;
  costReservationId: string;
  status: "proposed" | "blocked" | "built" | "previewed" | "approved" | "deployed" | "held" | "rolled_back" | "failed" | "unknown";
  createdAt: string;
}
```

Audit eventهای حداقلی:

```text
release.requested
release.snapshot_bound
release.build_started
release.build_blocked
release.artifact_signed
release.artifact_revoked
preview.lease_created
preview.route_ready
preview.verification_completed
preview.expired
preview.cleanup_completed
promotion.approval_requested
promotion.approved
promotion.blocked
deploy.plan_created
deploy.apply_started
deploy.apply_completed
deploy.result_unknown
deploy.verification_failed
deploy.held
deploy.rollback_requested
deploy.rollback_completed
deploy.rollback_failed
production.config_changed
production.incident_opened
```

Event body raw secret، kubeconfig، registry token، private config یا unredacted
provider response ندارد. هر event به release/artifact/target/tenant bind است و
replay آن state یا approval جدید ایجاد نمی‌کند.

---

## ۱۶. Threat Model

| تهدید | کنترل | evidence/test |
|---|---|---|
| poisoned source/commit | commit-pinned snapshot، protected branch، review | altered snapshot fixture |
| malicious Dockerfile | sandbox build، allowlist، no host socket | build escape fixture |
| image tampering | digest/signature/provenance verify | registry substitution |
| dependency/license violation | lockfile، SBOM، scans، policy gate | vulnerable/license fixture |
| secret in image layer | build context/DLP/history scan | secret-layer fixture |
| registry credential leak | scoped secret reference، redaction | log/layer scan |
| preview takeover | tenant route/auth/TTL/one-time link | cross-tenant route probe |
| port/host collision | atomic allocator و canonical route | collision fixture |
| preview SSRF/egress | proxy/allowlist/private-IP block | metadata/redirect fixture |
| production deploy without approval | approval binding + fresh MFA + policy | stale/self approval test |
| target substitution | target hash، environment policy، plan revalidation | changed target fixture |
| config/secret drift | config hash، environment schema، reference-only secret | drift fixture |
| destructive migration | forward-compatible/manual policy، backup gate | migration fixture |
| rollback to vulnerable release | revoked artifact block | revoked rollback test |
| provider unknown result | no blind retry، reconciliation state | crash-after-apply fixture |
| health false positive | multi-level checks، no stale cache | stale health fixture |
| canary blast radius | bounded percentage/window/stop criteria | traffic fixture |
| provider API abuse | rate/quota/ToS policy | quota fixture |
| tenant artifact leakage | object ACL، signed URL، RLS | tenant A/B probe |
| cleanup leak | TTL/orphan reaper/deletion receipt | expiry/kill test |
| IaC privilege escalation | namespace scope، RBAC/policy scan | cluster-role fixture |
| mode fallback violation | mode gate before build/adapter | free/local network test |
| audit erasure | append-only event + evidence hash | rollback/audit replay |

---

## ۱۷. چهار Sprint مستقل

### Sprint A — Artifact، Build و Supply Chain

- `ReleaseCandidate` و source/artifact binding
- reproducible sandbox build
- digest، SBOM، provenance و signature
- secret/dependency/license/vulnerability gate
- registry allowlist و immutable promotion
- local/free fixture registry

**Gate:** artifact unsigned، mutable، آلوده به secret یا بدون provenance وارد preview
و deploy نشود.

### Sprint B — Preview Plane و Environment Policy

- `PreviewLease` و port/route allocator
- TLS، auth، one-time link و tenant isolation
- preview data/egress/TTL/cleanup
- local compose reference target
- `EnvironmentPolicy` و config/secret reference
- M4 timeline و cost projection

**Gate:** دو tenant هم‌زمان preview جدا داشته باشند؛ expiry route/process/artifact
را پاک کند و signed URL قدیمی کار نکند.

### Sprint C — DeployAdapter، Approval و Verification

- `DeployAdapter` contract
- provider mock و reference adapter
- plan/apply/status/verify/revoke
- approval + fresh MFA + two-person policy
- health/readiness/smoke/functional checks
- rollout strategy و unknown provider result

**Gate:** target/artifact/config/strategy تغییرکرده approval را stale کند؛ provider
failure و unknown result بدون deploy تکراری مدیریت شوند.

### Sprint D — Kubernetes، Rollback و Hardening

- Helm/IaC schema، values per environment و RBAC policy
- migration compatibility و backup reference
- rolling/blue-green/canary stop criteria
- rollback/incident/cleanup/reconciliation
- load envelope، cost/quota و security chaos
- local/paid/free E2E evidence

**Gate:** health regression، revoked artifact، destructive migration، rollback failure
و cross-tenant preview به وضعیت safe/hold برسند؛ در غیر این صورت M7 `designed_only` است.

---

## ۱۸. Prompt Pack برای اجرای M7

این promptها release یا deploy را خودسرانه اجرا نمی‌کنند. با `invariants`،
`untrusted-content`، `tool-call protocol`، `evidence-rule`، `compute-mode` و
M5/M6 policy compose می‌شوند. خروجی model فقط proposal است.

### ۱۸.۱ `m7-release-architect`

```text
نقش: Release and Deployment Architect

برای change موردنظر ابتدا source snapshot، ChangeScope، environment، API/connector،
mode، cost، data class و provider policy را تعیین کن. ReleaseCandidate، artifact
requirements، verification، rollout و RollbackPlan بساز.

هیچ image tag متحرک، credential خام، production target مبهم، migration destructive،
push مستقیم به main یا deploy بدون approval مجاز نیست. مدل نمی‌تواند target، secret،
approval، budget یا policy را افزایش دهد.

خروجی: release plan، assumptions، gates، exact approvals، stop criteria، rollback
limitations، evidence IDs و open questions.
```

### ۱۸.۲ `m7-supply-chain-reviewer`

```text
نقش: Artifact and Supply Chain Reviewer

Dockerfile، build context، lockfile، base image digest، SBOM، signature، provenance،
secret scan، vulnerability، license و registry policy را بررسی کن.

هر secret در layer/history/log، mutable image، unknown dependency، unsigned artifact
یا provenance ناقص را block کن. خروجی فقط hash، kind، version و finding را گزارش کن؛
raw token یا private key را هرگز چاپ نکن.

برای هر finding command/test، expected/actual، severity، quarantine action و evidenceId بده.
```

### ۱۸.۳ `m7-preview-isolation-reviewer`

```text
نقش: Preview and Tenant Isolation Reviewer

PreviewLease، host/path/port، TLS، auth، one-time link، TTL، namespace، data seed،
egress، screenshot/log/artifact retention و cleanup را بررسی کن.

دو tenant را هم‌زمان probe کن. URL قابل حدس، signed link بدون expiry، route collision،
production database/secret، private artifact یا cleanup ناقص را block کن.

Preview public default deny است. cleanup receipt و evidence hash بدون داده private
گزارش شود.
```

### ۱۸.۴ `m7-deploy-adapter-reviewer`

```text
نقش: DeployAdapter and Provider Policy Reviewer

manifest، signature، endpoint allowlist، capability، environment، region، namespace،
plan/apply/status/verify/rollback/revoke، idempotency و provider response schema را
بررسی کن.

Adapter نباید policy، approval، hard deny یا mode را bypass کند. arbitrary command،
cluster-wide RBAC، production credential و target substitution را block کن. provider
unknown result را success فرض نکن و retry کور انجام نده.

خروجی: allow/hold/block، required approval، target hash، policyHash و evidence plan.
```

### ۱۸.۵ `m7-production-approval-reviewer`

```text
نقش: Production Promotion and Rollback Reviewer

approval را به releaseId، artifactDigest، target، environment، configHash، strategy،
migrationHash و rollbackId bind کن. stale approval، self-approval، agent approval،
MFA قدیمی، second reviewer ناقص و diff تغییرکرده را رد کن.

health، SLO، blast radius، cost، backup، migration limitation و rollback path را برای
انسان خلاصه کن. production deploy بدون approval صریح ممنوع است؛ rollback data را
جعلی یا خودکار فرض نکن.

خروجی شامل decision، reason، approver، MFA freshness، stop criteria و evidenceId باشد.
```

### ۱۸.۶ `m7-release-evidence-gate`

```text
نقش: M7 Release Evidence Gate

برای build، registry، preview، adapter، verification، promotion، rollback و cleanup
command/test، exit code، fixture، source/artifact/target/config hashes، audit refs و
receiptها را ثبت کن.

این موارد block هستند:
- artifact بدون signature/SBOM/provenance
- image یا tag mutable
- secret در layer/log/config/artifact
- preview cross-tenant یا بدون expiry
- production deploy بدون fresh approval/MFA
- target/config/strategy بعد از approval تغییرکرده
- health یا provider result unknown که success اعلام شود
- rollback به revoked artifact
- local mode cloud fallback یا free mode paid infra
- cleanup بدون receipt

Mock response یا متن model evidence نیست. status فقط passed/failed/blocked/unknown
باشد و تا evidence واقعی M7 `designed_only` باقی بماند.
```

---

## ۱۹. معیارهای قابل‌اندازه‌گیری

| معیار | target طراحی | وضعیت فعلی |
|---|---:|---|
| production deploy بدون approval/fresh MFA | ۰ | اندازه‌گیری نشده |
| image mutable یا unsigned در target | ۰ | اندازه‌گیری نشده |
| secret در image layer/log/artifact | ۰ | اندازه‌گیری نشده |
| preview cross-tenant access | ۰ | اندازه‌گیری نشده |
| preview بدون TTL/cleanup receipt | ۰ | اندازه‌گیری نشده |
| provider unknown result که success شود | ۰ | اندازه‌گیری نشده |
| rollback به revoked/vulnerable artifact | ۰ | اندازه‌گیری نشده |
| external write در preview بدون policy | ۰ | اندازه‌گیری نشده |
| local mode cloud call/telemetry ناخواسته | ۰ | اندازه‌گیری نشده |
| free mode paid infrastructure call | ۰ | اندازه‌گیری نشده |
| release با provenance ناقص | ۰ | اندازه‌گیری نشده |
| deploy evidence کامل | ۱۰۰٪ | اندازه‌گیری نشده |
| preview cleanup موفق | ۱۰۰٪ | اندازه‌گیری نشده |
| approval binding با target/artifact/config | ۱۰۰٪ | اندازه‌گیری نشده |

این‌ها target هستند، نه نتایج اندازه‌گیری‌شده.

---

## ۲۰. Test و Evidence Plan

### Contract و unit

- ReleaseCandidate hash و source/artifact binding
- image digest/tag/signature/provenance validation
- SBOM/license/secret/vulnerability gate
- EnvironmentPolicy ceiling و mode matrix
- PreviewLease route/port/TTL/one-time link
- DeployIntent target/strategy/config validation
- adapter idempotency و unknown result
- health check criticality و stale-result rejection
- approval binding و MFA freshness
- RollbackPlan migration compatibility
- Helm values/schema/RBAC/policy render
- cost reservation/settlement و quota exhaustion

### Provider و registry fixture

- registry با signed، unsigned، tampered و revoked image
- local compose adapter موفق/ناموفق/timeout
- Vercel/Fly/Cloud Run/Kubernetes API mock با plan/apply/status/rollback
- provider 429، auth expiry، partial apply و unknown response
- TLS/route/port allocator با collision
- health endpoint سالم، stale، 5xx، latency breach و dependency down
- migration forward-compatible، destructive و manual recovery

### Security و tenant

- دو tenant با preview، artifact، signed URL، namespace و logs مشابه
- secret در Dockerfile، build arg، layer، config، Helm values و health response
- target substitution، stale approval، self approval و agent approval
- SSRF از preview callback/health/adapter
- cluster-wide RBAC و arbitrary Helm value attempt
- revoked artifact rollback و vulnerable previous release
- local mode network/cloud/telemetry denial
- free mode paid provider denial

### Failure و chaos

- build worker crash، registry outage، adapter crash
- crash قبل/بعد apply
- traffic switch قطع‌شده و partial rollout
- health failure در canary/blue-green/rolling
- rollback failure و incident freeze
- preview expiry در زمان request
- cleanup kill، orphan resource و deletion retry
- budget/quota exhaustion و concurrent deploy race

### E2E

```text
commit-pinned snapshot
→ reproducible build
→ scans + signed artifact
→ preview lease
→ tenant/auth/TLS verification
→ smoke/functional/security checks
→ user review
→ staging approval
→ production approval + fresh MFA
→ adapter plan/apply
→ health/rollout
→ evidence
→ rollback or cleanup
```

E2E باید با fixture واقعی، provider mock، دو tenant، هر سه mode و artifact hash
قابل‌بازتولید اجرا شود. هیچ تستی با deploy واقعی production جایگزین fixture و
approval evidence نمی‌شود.

---

## ۲۱. Definition of Done

M7 فقط زمانی از `designed_only` به وضعیت اجرایی بعدی می‌رود که:

- [ ] ReleaseCandidate به snapshot، commit، Plan، artifact، SBOM، provenance و signature bind باشد.
- [ ] build در sandbox با base image و dependency lock pin‌شده اجرا شود.
- [ ] secret، license، vulnerability، dependency و artifact policy gate واقعی باشند.
- [ ] registry allowlist، immutable digest، revoke و retention کار کنند.
- [ ] PreviewLease با port، route، TLS، auth، tenant isolation، TTL و cleanup receipt کار کند.
- [ ] دو tenant نتوانند preview، artifact، log، signed URL یا namespace یکدیگر را ببینند.
- [ ] DeployAdapter contract برای plan/apply/status/verify/rollback/revoke/cleanup تست شود.
- [ ] environment policy، mode policy و provider ToS قبل از side effect enforce شوند.
- [ ] production فقط با approval صریح، fresh MFA، target/artifact/config binding و second review لازم deploy شود.
- [ ] health، readiness، smoke، functional، security، migration و SLO gates stale result را قبول نکنند.
- [ ] unknown provider result خودکار retry یا success اعلام نشود.
- [ ] rollout stop criteria، canary/blue-green/rolling و blast-radius budget کار کنند.
- [ ] rollback به artifact معتبر با migration limitation و audit receipt اجرا شود.
- [ ] Helm/IaC namespace/RBAC/network/resource policy و values per environment validate شوند.
- [ ] `free` paid infrastructure را صدا نزند؛ `paid` consent/budget داشته باشد؛ `local` cloud fallback نداشته باشد.
- [ ] cost reservation، quota، usage ledger و provider free-tier limitation در evidence باشند.
- [ ] artifact، preview، deploy، health، approval، rollback و cleanup در M4 timeline دیده شوند.
- [ ] provider mock، registry fixture، preview router، two-tenant probe و chaos tests سبز باشند.
- [ ] همه success claimها command، exit code، hash، receipt و audit reference داشته باشند.

**وضعیت فعلی:** این سند فقط طراحی M7 است. Build Plane، Preview Plane،
DeployAdapter، provider integration، Kubernetes/Helm runtime، production approval
flow و rollback واقعی هنوز با evidence اجرایی پیاده‌سازی و `done_tested` نشده‌اند.

---

## ۲۲. تصمیم‌های باز

1. اولین production adapter بین local/compose، Cloud Run، Fly، Vercel و Kubernetes با license، API stability، free-tier و self-host fit انتخاب می‌شود.
2. Hosted registry و signing service باید با local/self-host جایگزین قابل‌استفاده و بدون lock-in داشته باشند.
3. Preview TLS و wildcard domain باید ownership، certificate rotation و cost policy روشن داشته باشد.
4. Data migration فقط forward-compatible و manual recovery است تا زمانی که backup/restore drill واقعی ثابت شود.
5. Canary metrics و SLO thresholdها برای هر environment و workload جدا versioned می‌شوند.
6. `local` هیچ‌وقت با cloud deploy یا cloud registry silently fallback نمی‌کند.
7. Kubernetes/Helm adapter تا زمانی که kind/fixture، RBAC، policy scan، upgrade و rollback evidence نداشته باشد production eligible نیست.
8. Rollback artifact و rollback data دو مسیر جدا هستند؛ یکی نباید دیگری را وانمود کند.

تا این evidence بسته نشده، M7 فقط طراحی‌شده است: **artifact-aware، approval-gated،
preview-isolated، local-first و rollback-conscious — اما هنوز deploy production نیست.**
