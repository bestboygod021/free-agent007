# فاز بعدی: M8 Production Reliability، Capacity، Disaster Recovery و Incident Operations

**نام فاز:** `M8.0 — پایداری قابل‌اندازه‌گیری و بازیابی قابل‌اثبات`
**وضعیت:** `designed_only`
**پیش‌نیاز اجباری:** M1.2 Durable Control Plane، M3.0 Sandbox/Security، M4.0 Observability، M5.0 Governed Integrations و M7.0 Deploy/Preview
**معیار سطح محصول:** پلتفرم بتواند availability، latency، queue، quality، cost و tenant isolation را با SLO و error budget اندازه بگیرد؛ در خرابی storage، provider، worker، region یا release، با RPO/RTO تعریف‌شده restore/failover کند و شواهد قابل‌بازتولید تولید کند.

M8 بعد از M7 می‌آید چون deploy بدون عملیات قابل‌اعتماد، فقط انتقال ریسک به
production است. این فاز «یک داشبورد بیشتر» نیست؛ قرارداد می‌دهد که چه چیزی باید
اندازه‌گیری شود، چه زمانی alert یا incident باز شود، چه کسی اختیار containment دارد،
و چگونه restore/rollback بدون جعل success انجام می‌شود.

تا اجرای واقعی backup/restore، restore drill، failover fixture، k6/chaos test،
capacity measurement، alert delivery، key rotation، دو tenant و incident replay،
هیچ بخش این سند `done_tested` نیست.

---

## ۱. خروجی نهایی فاز

```text
service/change
  → telemetry + tenant-safe metrics
  → SLO/error-budget evaluation
  → capacity envelope + quota reservation
  → alert dedupe/routing
  → incident declaration
  → contain / freeze / failover
  → backup selection + integrity verification
  → isolated restore drill or recovery
  → validation + reconciliation
  → traffic/config recovery
  → evidence + post-incident review
  → capacity/SLO/runbook update
```

M8 باید برای هر سرویس و dependency نشان دهد:

- SLI، SLO، window، error budget و owner چه هستند.
- alert از کدام metric/trace/log آمده و false-positive یا duplicate چگونه dedupe شده است.
- در چه نقطه‌ای capacity plan یا load model می‌گوید worker، queue، DB، storage یا provider quota به اشباع نزدیک است.
- backup شامل چه داده‌ای، با چه encryption، retention، immutability و key versionی است.
- restore چگونه در محیط ایزوله validate شده و RPO/RTO واقعی چه بوده است.
- incident چه severity، commander، timeline، containment، approval و evidenceای دارد.
- runbook چه precondition، command، deny condition، rollback و escalation دارد.
- failover یا degraded mode چگونه tenant، privacy، compute mode و consent را حفظ می‌کند.
- هیچ recovery به‌صورت silent به cloud، paid provider، tenant دیگر یا credential خام fallback نمی‌کند.

---

## ۲. مرز فاز

### در محدوده

| حوزه | خروجی طراحی |
|---|---|
| SLI/SLO | availability، latency، queue wait، correctness، privacy و cost SLO |
| Error Budget | burn rate، freeze policy، release gate و exception expiry |
| Metrics | catalog، cardinality، tenant-safe labels، exemplars و retention |
| Tracing | trace/span برای Run، worker، model، connector، preview، deploy و storage |
| Alerting | threshold، multi-window burn، dedupe، escalation و notification audit |
| Capacity Plan | Run/day، task/Run، tokens/Run، concurrent worker، storage، egress و provider quota |
| Load Model | workload classes، peak، burst، queueing، saturation و headroom |
| Quota | per user/org/project/provider/environment، reservation، fairness و backpressure |
| Backup | PostgreSQL، Redis/queue، object/artifact، config، registry metadata و audit |
| Restore | PITR، snapshot، isolated restore، checksum، tenant validation و reconciliation |
| DR | RPO/RTO، failure domain، regional failover، degraded mode و game day |
| Incident | severity، commander، timeline، containment، communication و postmortem |
| Runbook | failure-mode playbook، precondition، safe command، approval و rollback |
| On-call | ownership، paging، rotation، coverage، handoff و stale alert prevention |
| Chaos | worker kill، queue partition، DB failover، provider outage، clock/skew و storage loss |
| Security | key rotation، backup encryption، restore access و no-secret evidence |
| Cost | free-tier quota، local resource، paid budget، egress و retention cost |
| Tenant Safety | RLS، artifact isolation، restore namespace و cross-tenant probe |
| Evidence | drill report، metric snapshot، alert receipt، restore hash و incident audit |

### خارج از محدوده

- ادعای availability یا SLA تجاری بدون اندازه‌گیری واقعی و قرارداد حقوقی
- restore مستقیم روی production برای «تست کردن»
- backup خام شامل password، token، cookie، API key یا secret بدون encryption policy
- failover به paid provider در `free` یا cloud در `local` بدون انتخاب صریح کاربر
- حذف audit/event برای سریع‌تر شدن recovery
- chaos روی production بدون approval، blast-radius budget و stop control
- auto-remediation که production config، IAM، RBAC یا firewall را بدون approval تغییر دهد
- خرید ظرفیت یا ساخت account انبوه برای دور زدن quota و free-tier
- backup به object store یا region نامعلوم بدون residency و tenant policy
- runbookی که command arbitrary، secret در shell history یا bypass policy پیشنهاد کند
- DR کامل multi-region production پیش از fixture، restore drill و evidence package

---

## ۳. وابستگی و Gateهای اجباری

| dependency | حداقل gate پیش از اجرای واقعی M8 |
|---|---|
| M1.2 | durable database، queue، outbox، lease، checkpoint و tenant transaction |
| M3.0 | secret broker، encryption، redaction، sandbox و artifact boundary |
| M4.0 | timeline، metrics/trace projection، alert UI و operational control |
| M5.0 | provider/connector quota، revoke، provenance و normalized error |
| M7.0 | release/artifact digest، preview، health، rollback و environment policy |
| Storage | backup target، retention، immutable object، checksum و deletion policy |
| Identity | break-glass identity، MFA، separation of duties و access audit |
| Notification | at-least-once delivery، dedupe، escalation و in-app fallback |
| Fixture | deterministic failure injector، two tenant، clock control و test data |

تا این dependencyها واقعی و قابل‌اثبات نشده‌اند، M8 فقط design و drill fixture است؛
«backup configured» یا «alert exists» بدون restore/alert evidence success نیست.

---

## ۴. مدل معماری و failure domains

```text
┌──────────────────────────────────────────────────────────────┐
│ Control Plane                                                │
│ SLO · policy · tenant · incident · approval · evidence        │
└────────────────┬─────────────────────────────────────────────┘
                 │ telemetry / command with scope
      ┌──────────┼───────────┬────────────┬─────────────┐
      ▼          ▼           ▼            ▼             ▼
┌──────────┐ ┌────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐
│ API/Web  │ │Worker  │ │Database  │ │Queue    │ │Artifact    │
│ + SSE    │ │+Runner │ │+RLS      │ │+Outbox  │ │+Registry   │
└────┬─────┘ └──┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬──────┘
     │          │            │            │              │
     └──────────┴────────────┴────────────┴──────────────┘
                         ▼
              ┌────────────────────────┐
              │ Telemetry / Alerting   │
              │ metric · trace · event │
              └────────────┬───────────┘
                           ▼
              ┌────────────────────────┐
              │ Backup / Restore Plane │
              │ isolated + verified   │
              └────────────────────────┘
```

### failure domains

- process: API، worker، browser-runner، provider adapter
- host/container: CPU، memory، disk، OOM، runtime escape
- dependency: PostgreSQL، Redis، object store، registry، DNS، KMS، provider
- zone/region: network partition، routing، certificate، regional outage
- data: corruption، accidental deletion، bad migration، tenant contamination
- release: image regression، config drift، incompatible schema، feature flag
- human/process: stale approval، missing on-call، bad runbook، notification failure

هر failure domain owner، detector، containment، recovery target، evidence و residual
risk دارد. failure یک domain نباید با metric همان domain به‌تنهایی «healthy» اعلام شود.

### authority boundary

- Telemetry توضیح می‌دهد؛ permission نمی‌سازد.
- Alert incident پیشنهاد می‌دهد؛ auto-remediation فقط action allowlisted و policy-approved دارد.
- Break-glass operator می‌تواند recovery را اجرا کند، اما MFA، reason، TTL، two-person policy و audit لازم است.
- Backup data authority برای user/tenant نیست تا restore validation و ownership check تمام شود.
- Model می‌تواند incident summary و runbook proposal بنویسد، اما command و severity توسط policy/operator تعیین می‌شود.

---

## ۵. قراردادهای داده اصلی

### ۵.۱ `ReliabilityPolicy`

```ts
interface ReliabilityPolicy {
  policyId: string;
  serviceId: string;
  organizationScope: "platform" | "organization" | "project";
  tier: "critical" | "important" | "best_effort";
  slis: Array<{
    name: "availability" | "latency" | "queue_wait" | "correctness" | "privacy" | "cost";
    queryRef: string;
    goodEvent: string;
    badEvent: string;
  }>;
  objectives: Array<{
    sli: string;
    target: number;
    window: "rolling_7d" | "rolling_30d" | "calendar_month";
  }>;
  errorBudget: {
    releaseFreezeBurnRate: number;
    pageBurnRate: number;
    exceptionTtlSeconds: number;
  };
  owners: string[];
  escalationPolicyId: string;
  policyHash: string;
}
```

SLO یک target طراحی است و تا measurement واقعی، status آن `unmeasured` است. target
نباید با dashboard دلخواه یا حذف metric بدتر، سبز شود.

### ۵.۲ `CapacityPlan`

```ts
interface CapacityPlan {
  planId: string;
  version: string;
  workload: {
    runsPerDay: number;
    peakRunsPerMinute: number;
    tasksPerRun: number;
    concurrentRuns: number;
    tokensPerRun: number;
    connectorCallsPerRun: number;
    previewSessions: number;
  };
  resources: {
    apiRps: number;
    workerConcurrency: number;
    cpuMillisPerTask: number;
    memoryBytesPerWorker: number;
    queueThroughputPerSecond: number;
    databaseConnections: number;
    storageBytesPerDay: number;
    egressBytesPerDay: number;
  };
  quotas: {
    modelRpm: number;
    modelTpm: number;
    connectorRpm: number;
    registryPullsPerHour: number;
  };
  headroom: {
    cpuPercent: number;
    memoryPercent: number;
    queuePercent: number;
    storageDays: number;
  };
  assumptions: string[];
  measuredAt?: string;
  planHash: string;
}
```

`CapacityPlan` باید measured و assumed values را جدا کند. عددی که فقط از provider
documentation آمده، capacity evidence نیست.

### ۵.۳ `BackupPolicy`

```ts
interface BackupPolicy {
  policyId: string;
  resource: "postgres" | "redis_queue" | "object_storage" | "registry_metadata" | "config" | "audit";
  scope: "platform" | "organization" | "project";
  schedule: string;
  retentionDays: number;
  targetRegions: string[];
  encryptionKeyRef: string;
  immutableForSeconds: number;
  rpoSeconds: number;
  restoreRtoSeconds: number;
  includes: string[];
  excludes: string[];
  checksumAlgorithm: "sha256" | "sha512";
  deletionPolicy: "expiry" | "legal_hold" | "manual_review";
  policyHash: string;
}
```

Backup policy باید raw secret را exclude یا با envelope encryption پوشش دهد. `targetRegions`
باید با data residency و tenant consent سازگار باشد.

### ۵.۴ `RestoreDrill`

```ts
interface RestoreDrill {
  drillId: string;
  incidentClass: "data_corruption" | "region_loss" | "operator_error" | "ransomware" | "queue_loss";
  backupRefs: string[];
  isolatedTarget: string;
  startedAt: string;
  completedAt?: string;
  observedRpoSeconds?: number;
  observedRtoSeconds?: number;
  checks: Array<{
    name: "checksum" | "schema" | "tenant_isolation" | "row_count" | "event_order" | "artifact_hash" | "application_smoke";
    status: "passed" | "failed" | "unknown";
    evidenceRef?: string;
  }>;
  productionTouched: false;
  dataExposure: "none" | "quarantined";
  result: "passed" | "failed" | "blocked";
  drillHash: string;
}
```

### ۵.۵ `IncidentRecord`

```ts
interface IncidentRecord {
  incidentId: string;
  severity: "SEV0" | "SEV1" | "SEV2" | "SEV3";
  serviceIds: string[];
  organizationScope: "platform" | "organization" | "project";
  detectedBy: string;
  startedAt: string;
  commanderId?: string;
  roles: {
    operations?: string;
    communications?: string;
    security?: string;
    scribe?: string;
  };
  impact: {
    users?: number;
    tenants?: number;
    regions?: string[];
    dataRisk: "none" | "suspected" | "confirmed";
  };
  state: "detected" | "triaged" | "contained" | "recovering" | "monitoring" | "resolved" | "closed";
  runbookRef?: string;
  changeFreeze: boolean;
  timelineEventIds: string[];
  evidenceIds: string[];
  postmortemRef?: string;
}
```

### ۵.۶ `Runbook`

```ts
interface Runbook {
  runbookId: string;
  serviceId: string;
  failureMode: string;
  version: string;
  triggerSignals: string[];
  preconditions: string[];
  safeActions: Array<{
    actionId: string;
    commandRef: string;
    requiredRole: string;
    requiresApproval: boolean;
    destructive: boolean;
    timeoutSeconds: number;
    rollbackActionRef?: string;
  }>;
  denyConditions: string[];
  escalationAfterSeconds: number;
  verification: string[];
  exitCriteria: string[];
  lastDrilledAt?: string;
  owner: string;
  runbookHash: string;
}
```

Runbook commandها reference و parameterized هستند؛ secret، shell interpolation و
command آزاد از model ممنوع است.

---

## ۶. SLI، SLO و Error Budget

### SLI catalogue

| SLI | good event | bad event | label boundary |
|---|---|---|---|
| API availability | valid response within contract | 5xx، timeout، invalid response | service/region، نه raw tenant ID |
| Run completion | terminal result با evidence | lost، duplicate، unexplained failure | project tier |
| Queue wait | claim در budget زمانی | wait بالاتر از threshold | queue class |
| Worker success | task result valid | crash، lease loss، invalid result | runner/profile |
| Connector success | normalized response | auth/rate/schema/provider error | connector class |
| Preview readiness | ready + smoke pass | not ready، route/TLS/auth fail | environment |
| Deploy safety | gate + approval + verification | bypass، unknown، rollback failure | release class |
| Restore integrity | checksum/schema/tenant checks | mismatch، missing event | backup class |
| Privacy | no cross-tenant/secret event | confirmed leak or unredacted sink | severity |
| Cost adherence | usage within reservation | budget overrun | mode/provider |

### SLO rules

- numerator/denominator، window، exclusion و burn policy versioned می‌شوند.
- maintenance window فقط با approval، expiry و public/internal reason از SLO مستثنا می‌شود.
- provider outage می‌تواند attribution جدا داشته باشد اما user impact پنهان نمی‌شود.
- tenant privacy/security failure حتی اگر availability خوب باشد، incident و error budget مصرف می‌کند.
- SLO dashboard query باید deterministic و قابل replay باشد؛ manual spreadsheet source of truth نیست.

### Error budget

```text
budget = 1 - SLO target
burnRate = badEvents / allowedBadEvents

if burnRate >= page threshold:
  page on-call + open incident
if burnRate >= freeze threshold:
  freeze risky release/promotion
if budget exhausted:
  only reliability/security changes with exception TTL
```

Error budget policy جلوی deploy risk جدید را می‌گیرد اما emergency security fix را
با exception ثبت‌شده و rollback نگه می‌دارد.

---

## ۷. Observability و Alerting

### telemetry pipeline

```text
API/worker/adapter/preview/storage
  → OpenTelemetry context
  → metric + trace + structured event
  → redaction/cardinality gate
  → collector buffer
  → metric store / trace store / audit projection
  → SLO evaluator
  → alert router
```

- trace context از Run/Task/Call/Release عبور می‌کند اما secret و raw prompt وارد span نمی‌شود.
- tenant label hash/aggregate است؛ high-cardinality user input، URL query و token ممنوع‌اند.
- metrics در local mode local-only باقی می‌مانند و telemetry cloud ناخواسته ارسال نمی‌شود.
- event/audit source of truth با metric store قابل مقایسه است؛ dashboard data قابل اصلاح بدون event نیست.
- clock skew، collector outage و dropped span به‌عنوان telemetry health اندازه‌گیری می‌شوند.

### alert contract

هر alert شامل `alertId`, `ruleVersion`, `firedAt`, `sourceRef`, `severity`, `dedupeKey`,
`tenantScope`, `runbookRef`, `owner`, `expiresAt` و `evidenceRef` است. alert بدون
owner یا runbook به paging نمی‌رود؛ به backlog برمی‌گردد و finding تولید می‌کند.

Alert states:

```text
pending → firing → acknowledged → investigating → mitigated → resolved
                                      └──────→ escalated
```

duplicate alert نباید incident duplicate بسازد. resolution باید metric recovery و
human/automated action evidence داشته باشد.

---

## ۸. Capacity Plan و Load Model

### workload classes

| class | نمونه | رفتار بار | isolation |
|---|---|---|---|
| interactive | intake، plan، approval UI | low latency، burst | API priority |
| execution | build، test، repair | CPU/memory، queue | worker pool |
| integration | OAuth، webhook، connector | provider quota | adapter bucket |
| preview | route، smoke، review | long-lived resource | preview quota |
| recovery | backup، restore، reconciliation | storage/network | recovery pool |
| evaluation | eval، canary، benchmark | batch | low priority |

### capacity formula

```text
requiredWorkers
  = ceil(peakTasksPerMinute × p95TaskSeconds / 60 / targetUtilization)

queueCapacity
  = peakArrivalRate × longestExpectedOutageSeconds × retryMultiplier

storageGrowth/day
  = runs/day × (logs/run + artifacts/run + traces/run)
    + previews/day × previewArtifactBytes

providerBudget
  = calls/day × tokens/call × safetyFactor
```

تمام ورودی‌ها range دارند، نه یک عدد قطعی. burst، retry storm، provider 429،
slow model، preview leak و restore traffic باید در load model جدا سنجیده شوند.

### capacity plan process

1. workload inventory از event/usage ledger استخراج می‌شود.
2. baseline با fixture و measurement ثبت می‌شود.
3. peak، burst، seasonality و failure multiplier تعیین می‌شوند.
4. worker، DB connection، queue، storage، egress و provider quota محاسبه می‌شوند.
5. headroom و saturation point با k6/benchmark/chaos اعتبارسنجی می‌شوند.
6. capacity plan با mode و free-tier محدودیت join می‌شود.
7. alert پیش از saturation و quota exhaustion فعال می‌شود.
8. هر تغییر release/connector/preview profile می‌تواند plan را invalid کند.

### backpressure و fairness

- queue admission بر اساس tenant، tier، mode، budget و safety class انجام می‌شود.
- tenant پرمصرف نمی‌تواند worker/DB/provider quota همه را بگیرد.
- وقتی capacity پر است، system با `capacity_exhausted`، ETA تقریبی و nextAction متوقف می‌شود؛ silent drop ممنوع است.
- free mode quota محدود و local mode resource-bound است؛ paid mode هم hard budget دارد.
- autoscaling فقط resource count را تغییر می‌دهد، نه authority، privacy، approval یا egress.

---

## ۹. Backup، Encryption و Retention

### backup matrix

| resource | method | cadence | target RPO | restore validation |
|---|---|---:|---:|---|
| PostgreSQL | full + WAL/PITR | daily + continuous | ۵ دقیقه | schema/RLS/query/smoke |
| Redis/BullMQ | snapshot + durable outbox | hourly/event-based | ۱۵ دقیقه | queue ordering/dedupe |
| Object storage | versioned immutable copy | daily | ۱۵ دقیقه | hash/artifact/read ACL |
| Registry metadata | signed export | daily | ۲۴ ساعت | digest/signature lookup |
| Config/policy | versioned encrypted export | per change + daily | ۵ دقیقه | hash/policy evaluation |
| Audit/events | append-only export | continuous/daily seal | ۵ دقیقه | sequence/hash/replay |
| Key metadata | encrypted envelope metadata | per rotation | ۲۴ ساعت | key version/reference |

Raw credential و secret value در backup عمومی نیست. Backup encryption key باید
KMS/OpenBao/self-host equivalent با rotation، access log و recovery procedure داشته
باشد. اگر key unavailable است، backup «قابل restore» ادعا نمی‌شود.

### retention

- retention per resource، tenant، legal hold و mode است.
- delete request با backup copy، object version، cache، trace و derived artifact join می‌شود.
- legal hold deletion را pause می‌کند و reason/owner/expiry دارد.
- object expiry بدون deletion receipt کامل نیست.
- backup خارج از residency یا retention user بدون consent و policy مجاز نیست.

### integrity

```text
backup bytes
  → checksum
  → encryption envelope
  → immutable object
  → manifest + key version
  → signed backup index
```

Index backup خودش نباید secret یا tenant content خام داشته باشد؛ restore از manifest و
hash شروع می‌شود، نه از نام فایل قابل حدس.

---

## ۱۰. Restore، Failover و DR

### RPO/RTO tiers

| tier | نمونه | target RPO | target RTO | mode |
|---|---|---:|---:|---|
| Critical | auth، tenant، approval، audit | ۵ دقیقه | ۳۰ دقیقه | failover/recovery drill |
| Important | Run، queue، artifact index | ۱۵ دقیقه | ۶۰ دقیقه | restore + reconciliation |
| Best effort | preview cache، analytics | ۲۴ ساعت | ۲۴ ساعت | rebuild/expiry |

این targetها design target هستند؛ measured RPO/RTO فقط بعد از drill معتبر است.

### recovery sequence

```text
incident declared
  → freeze risky mutations
  → identify last known-good backup
  → verify checksum/signature/key access
  → restore into isolated target
  → schema/version validation
  → tenant/RLS and artifact ACL probe
  → event sequence/dedupe reconciliation
  → application smoke + privacy/security checks
  → operator approval
  → traffic/failover switch
  → observe burn/SLO
  → unfreeze or rollback recovery
```

- restore هیچ‌گاه مستقیم روی production برای first test نیست.
- old اور new system هم‌زمان write نمی‌کنند مگر dual-write policy صریح و idempotent باشد.
- event replay فقط missing projection را پر می‌کند؛ side effect connector/deploy دوباره اجرا نمی‌شود.
- queue restore duplicate prevention، lease expiry و outbox ordering را بررسی می‌کند.
- بعد از failover، provider/connector consent، mode، region و residency دوباره بررسی می‌شوند.
- failback نیز change/approval/reconciliation مستقل است؛ «بازگشت شبکه» به‌تنهایی failback نیست.

### degraded modes

| failure | degraded behavior |
|---|---|
| model provider outage | local/free fallback طبق mode؛ otherwise hold |
| connector outage | read-only یا queued hold؛ external write retry کور ممنوع |
| queue unavailable | intake محدود؛ durable request بدون claim اجرا نمی‌شود |
| artifact store unavailable | no new build/deploy؛ existing service continues if safe |
| telemetry unavailable | risky deploy/promotion hold؛ privacy events fail-closed |
| preview router unavailable | preview creation blocked؛ production unaffected |
| primary DB unavailable | read-only/cache محدود؛ no unsafe writes |
| region loss | tier policy failover یا explicit incident hold |

---

## ۱۱. Incident Response، Runbook و On-call

### lifecycle

```text
detect
  → acknowledge
  → classify severity/impact
  → appoint commander + scribe
  → contain / freeze / isolate
  → investigate with evidence
  → recover / failover / rollback
  → monitor
  → resolve
  → postmortem + corrective action
```

### severity

| severity | نمونه | response |
|---|---|---|
| SEV0 | confirmed cross-tenant/secret leak، integrity loss، unsafe production action | immediate freeze، security lead، executive/legal path |
| SEV1 | critical service outage، data unavailable، RTO risk | page primary/secondary on-call، commander، incident channel |
| SEV2 | degraded SLO، provider outage، preview fleet failure | business-hours/on-call، mitigation و follow-up |
| SEV3 | isolated low-impact defect، alert noise | ticket، owner و deadline |

Severity بر اساس impact و data risk است، نه تعداد logها. downgrade نیازمند reason و
commander است؛ incident را برای بهتر شدن dashboard پنهان نمی‌کنیم.

### runbook structure

هر runbook باید داشته باشد:

1. symptom و trigger metric؛
2. scope و affected tenant/service؛
3. precondition و دسترسی لازم؛
4. first safe action و deny condition؛
5. command reference با parameterهای allowlisted؛
6. expected output و evidence؛
7. escalation timeout؛
8. rollback/abort؛
9. verification؛
10. exit criteria و postmortem link.

runbook بدون owner، version، last drilled، expiration و rollback action معتبر نیست.
commandی که raw secret می‌خواهد یا policy را خاموش می‌کند hard-deny است.

### on-call

- rotation، timezone، primary/secondary، holiday coverage و handoff versioned است.
- on-call alert را acknowledge می‌کند اما approval production یا security exception را خودکار ندارد.
- paging باید dedupe، quiet hours policy، escalation timeout و notification fallback داشته باشد.
- handoff شامل active incident، risk، pending approval، backup/drill status و known unknownهاست.
- alert بدون response در timeout escalate و audit می‌شود؛ silent paging success نیست.
- break-glass access کوتاه‌عمر، MFA، reason، ticket/incident و automatic revoke دارد.

### communications

incident message باید impact، start time، affected scope، current mitigation، next update و known unknown را بدون secret/PII اعلام کند. پیام provider یا status page untrusted
است و به‌تنهایی incident را resolve نمی‌کند.

### postmortem

postmortem blameless اما evidence-driven است:

- timeline و detection gap
- root/contributing causes
- what went well/badly
- customer/tenant/data impact
- exact commands and changes
- SLO/error budget cost
- corrective actions with owner/due date
- runbook/test/alert changes
- verification evidence

---

## ۱۲. Chaos، Load و Recovery Testing

### failure injection matrix

| injection | expected result |
|---|---|
| kill worker before claim | lease سالم، no lost task |
| kill worker after connector proposal | no duplicate side effect |
| queue partition | backpressure، no unsafe claim |
| DB primary failover | RTO measured، RLS intact |
| object store unavailable | build/deploy hold، no false success |
| registry tamper | signature block |
| provider 429/5xx | bounded retry/circuit/hold |
| clock skew | TTL/MFA/lease fail-safe |
| telemetry drop | risky mutation hold |
| key rotation during backup | versioned restore or hold |
| corrupted backup | checksum reject |
| region loss | tier-specific failover/hold |
| notification outage | alternate channel + audit |
| preview leak attempt | tenant deny + incident |

### load model scenarios

- steady interactive load
- burst intake and approval
- many concurrent builds
- provider quota exhaustion
- preview expiration wave
- restore traffic همراه با normal traffic
- incident paging storm
- two tenants با skewed usage

Load test باید p50/p95/p99، queue wait، CPU/memory، DB pool، error rate، provider
quota، cost و fairness را جمع کند. یک run سبز بدون threshold report evidence نیست.

### game day

Game day با fixture و approval اجرا می‌شود:

```text
declare scenario
  → assign commander/on-call
  → inject failure
  → detect/page
  → runbook action
  → contain
  → restore/failover
  → validate tenant/privacy/SLO
  → resolve
  → measure RPO/RTO
  → postmortem
```

Production game day تا زمانی که local/staging drill، stop control و data safety سبز
نشده، خارج از scope است.

---

## ۱۳. Compute Mode و Free/Local/BYOK Strategy

M8 mode را در telemetry، backup، recovery، capacity و incident action نیز اعمال
می‌کند؛ mode فقط model/router نیست.

| رفتار | `free` | `paid` | `local` |
|---|---|---|---|
| metrics/trace | local یا free-tier محدود، redacted | managed/self-host با consent | local-only |
| backup | local/free storage با retention محدود | target مجاز با budget/consent | local encrypted target |
| restore drill | fixture/local | staging با approval | local staging |
| load test | محدود و کم‌مصرف | budget-bound | hardware-bound |
| failover | local hold/fallback | provider مجاز با consent | local only |
| incident notification | in-app/free channel | configured channels | local UI/log |
| model for summary | free/local | BYOK/provider مجاز | local model |
| cloud telemetry | no private/raw data | redacted consented | ممنوع پیش‌فرض |
| paid capacity | ❌ | با budget | ❌ |
| fallback | local یا hold | فقط انتخاب explicit | cloud fallback ممنوع |

`free` بودن به معنی حذف backup، security gate یا restore evidence نیست؛ فقط ظرفیت و
retention محدودتر است. `local` اگر target backup یا operator notification نداشته باشد
باید transparent hold بدهد، نه اینکه cloud backup مخفی بسازد.

---

## ۱۴. Security و Threat Model

| تهدید | کنترل | test/evidence |
|---|---|---|
| backup secret leakage | encryption/exclusion/redaction | backup content scan |
| restore cross-tenant | isolated target + RLS probe | tenant A/B restore |
| ransomware/corruption | immutable version + checksum + offline/isolated copy | corrupt backup drill |
| key loss | key escrow/recovery/rotation evidence | key rotation drill |
| false healthy dashboard | independent SLI/query freshness | stale metric fixture |
| alert suppression | append-only alert/audit + owner/escalation | dropped alert test |
| incident authority escalation | runbook allowlist + approval | arbitrary command fixture |
| break-glass abuse | MFA/TTL/two-person/audit | expired access test |
| capacity starvation | fair queue/quota/backpressure | noisy tenant load |
| quota bypass | provider/mode gate before retry | free-tier exhaustion |
| unsafe failover | target policy/residency/consent recheck | region fixture |
| duplicate side effect on replay | event idempotency/outbox reconciliation | crash/replay test |
| stale runbook | version/owner/expiry/drill gate | stale runbook fixture |
| paging storm | dedupe/rate/escalation | alert storm test |
| telemetry PII | label allowlist/redaction | trace scan |
| postmortem leakage | redacted incident projection | artifact scan |
| unverified RPO/RTO claim | drill-only status | failed drill test |
| hidden cloud fallback | mode gate + network deny | local/free egress test |

---

## ۱۵. چهار Sprint مستقل

### Sprint A — Reliability Signals و SLO

- SLI catalog و `ReliabilityPolicy`
- metrics/traces/events با tenant-safe labels
- SLO evaluator و error budget
- alert contract، dedupe، routing و notification evidence
- M4 Timeline و incident projection
- telemetry failure/clock skew handling

**Gate:** هر SLO query، owner، window، target، error budget و alert receipt داشته
باشد؛ dashboard بدون source یا metric stale green نشود.

### Sprint B — Capacity Plan و Load Model

- workload inventory و `CapacityPlan`
- k6/benchmark scenarios
- queue/worker/DB/storage/provider quota model
- fairness، reservation، backpressure و saturation alert
- free/paid/local capacity matrix
- cost/headroom report

**Gate:** peak/burst/noisy tenant/provider quota در fixture اندازه‌گیری شود و
`capacity_exhausted` با دلیل و nextAction تولید شود.

### Sprint C — Backup، Restore و DR

- `BackupPolicy` per resource
- encryption/key rotation/immutable retention
- `RestoreDrill` در isolated target
- PITR/queue/object/config/audit restore sequence
- RPO/RTO measurement
- failover/failback و degraded modes

**Gate:** checksum، schema، RLS، tenant، artifact و application smoke بعد از restore
سبز باشند؛ production در first drill touch نشود.

### Sprint D — Incident، Runbook و On-call Hardening

- `IncidentRecord` و severity/escalation
- Runbook registry، command allowlist و drill status
- on-call rotation، paging، handoff و break-glass
- chaos/game day و postmortem
- security/cost/privacy evidence
- corrective-action tracking و release freeze policy

**Gate:** failure fixture از detect تا recovery با commander، runbook، evidence،
RPO/RTO و postmortem کامل عبور کند؛ در غیر این صورت M8 `designed_only` باقی می‌ماند.

---

## ۱۶. Prompt Pack برای اجرای M8

این promptها incident، failover یا recovery را خودسرانه اجرا نمی‌کنند. با
`invariants`، `untrusted-content`، `evidence-rule`، `tool-call protocol` و
`compute-mode` compose می‌شوند. Model فقط analysis/proposal تولید می‌کند.

### ۱۶.۱ `m8-reliability-architect`

```text
نقش: Production Reliability Architect

برای service/workload، SLI/SLO، error budget، failure domain، owner، alert،
capacity plan، load model، backup policy، RPO/RTO و degraded mode تعریف کن.
Measured و assumed values را جدا نگه دار. SLO، availability یا RTO را بدون
measurement ادعا نکن.

هر auto-remediation باید allowlisted، bounded، reversible و approval-aware باشد.
Mode free/paid/local، tenant isolation، privacy، cost و provider quota را در plan
بیاور. خروجی شامل assumptions، missing evidence، stop criteria و nextAction باشد.
```

### ۱۶.۲ `m8-capacity-reviewer`

```text
نقش: Capacity and Load Model Reviewer

workload class، peak/burst، retry multiplier، queue، worker، DB pool، storage،
egress، provider RPM/TPM، preview و recovery traffic را بررسی کن.
Capacity plan را با فرمول، range، utilization target و headroom بساز؛ noisy tenant
نباید منابع همه را بگیرد.

هر عدد بدون fixture/benchmark را assumed علامت بزن. quota exhaustion باید hold و
explain شود، نه fallback پنهان یا account creation. خروجی شامل saturation point،
load scenarios، cost estimate و evidenceNeeded باشد.
```

### ۱۶.۳ `m8-backup-restore-reviewer`

```text
نقش: Backup, Restore and DR Reviewer

برای PostgreSQL، queue، object، registry metadata، config و audit، backup method،
retention، encryption key version، residency، immutability، checksum، RPO/RTO و
restore sequence بررسی کن.

اولین restore همیشه isolated است و productionTouched=false باید بماند. checksum،
schema، RLS، دو tenant، event order، artifact hash و smoke را validate کن. raw
secret را report نکن. اگر key/backup/integrity نامطمئن است verdict را blocked نگه دار.
```

### ۱۶.۴ `m8-incident-commander-reviewer`

```text
نقش: Incident Commander and Runbook Reviewer

incident را با severity، impact، commander، roles، timeline، containment، escalation،
runbook، approval و evidence تحلیل کن. runbook باید precondition، safe action،
deny condition، timeout، rollback و verification داشته باشد.

هیچ command آزاد، secret در shell، policy bypass یا production mutation بدون approval
اجرا نکن. break-glass فقط با MFA، TTL، reason و audit مجاز است. downgrade/resolve بدون
metric recovery و evidence ممنوع است.
```

### ۱۶.۵ `m8-slo-alert-reviewer`

```text
نقش: SLO, Alert and Error-Budget Reviewer

SLI query، good/bad event، denominator، window، exclusion، target، burn threshold،
dedupe key، owner، escalation و alert freshness را بررسی کن.

metric stale، collector outage یا high-cardinality tenant data را healthy فرض نکن.
Error budget freeze باید release gate را متوقف کند اما emergency security fix باید
exception TTL و rollback داشته باشد. raw tenant content یا PII در label/report نباشد.
```

### ۱۶.۶ `m8-recovery-evidence-gate`

```text
نقش: M8 Recovery Evidence Gate

برای SLO، capacity، alert، incident، backup، restore، failover، chaos و postmortem،
command/test، exit code، fixture، timestamps، metric snapshot، backup hash، restore
hash، tenant probe، RPO/RTO، audit refs و operator approvals را ثبت کن.

این موارد block هستند:
- restore بدون checksum/RLS/tenant validation
- RPO/RTO بدون drill واقعی
- backup یا trace دارای raw secret/PII
- incident بدون owner/severity/runbook/evidence
- auto-remediation خارج از allowlist
- local mode cloud fallback یا free mode paid capacity
- capacity claim بدون load measurement
- alert سبز با metric stale یا missing

Mock، dashboard screenshot یا متن model evidence نیست. status فقط
passed/failed/blocked/unknown باشد و تا evidence واقعی M8 `designed_only` بماند.
```

---

## ۱۷. معیارهای قابل‌اندازه‌گیری

| معیار | target طراحی | وضعیت فعلی |
|---|---:|---|
| SLO بدون owner/query/window | ۰ | اندازه‌گیری نشده |
| alert بدون runbook/escalation | ۰ | اندازه‌گیری نشده |
| metric stale که healthy اعلام شود | ۰ | اندازه‌گیری نشده |
| backup بدون checksum/encryption/retention | ۰ | اندازه‌گیری نشده |
| restore cross-tenant یا production-touch ناخواسته | ۰ | اندازه‌گیری نشده |
| RPO/RTO بدون drill | ۰ | اندازه‌گیری نشده |
| raw secret/PII در backup/trace/incident | ۰ | اندازه‌گیری نشده |
| auto-remediation خارج از allowlist | ۰ | اندازه‌گیری نشده |
| capacity claim بدون load evidence | ۰ | اندازه‌گیری نشده |
| free mode paid capacity call | ۰ | اندازه‌گیری نشده |
| local mode cloud telemetry/fallback | ۰ | اندازه‌گیری نشده |
| incident دارای commander، timeline و evidence | ۱۰۰٪ | اندازه‌گیری نشده |
| restore drill با tenant/privacy validation | ۱۰۰٪ | اندازه‌گیری نشده |
| runbookهای critical که در مهلت drill شده‌اند | ۱۰۰٪ | اندازه‌گیری نشده |

این targetها نتیجه measurement نیستند.

---

## ۱۸. Test و Evidence Plan

### Contract و unit

- SLI query، SLO window و error-budget burn
- alert dedupe، escalation و stale metric
- capacity formula، range، headroom و quota reservation
- fair queue و noisy tenant isolation
- backup manifest، checksum، encryption key version و retention
- restore state machine و `productionTouched=false`
- RPO/RTO timer و evidence hash
- incident severity، role، state، runbook expiry
- break-glass TTL/MFA/revoke
- mode matrix برای telemetry/backup/fallback

### Integration و fixture

- PostgreSQL full/PITR mock و RLS restore probe
- Redis/BullMQ snapshot، outbox و dedupe restore
- object/registry/config/audit immutable backup mock
- key rotation وسط backup و restore
- alert provider با duplicate/delayed/dropped notifications
- k6 load fixture برای interactive/execution/preview/recovery
- provider 429/5xx و quota exhaustion
- local/free/paid storage and telemetry endpoints

### Security و tenant

- backup scan برای secret/PII
- دو tenant با row/artifact/event/restore isolation
- corrupted/tampered backup و revoked key
- runbook arbitrary command/secret/policy bypass
- stale on-call/break-glass access
- metric label injection و high-cardinality abuse
- hidden cloud fallback در local/free
- audit deletion یا incident evidence tampering

### Chaos/Game Day

```text
worker kill
→ queue partition
→ DB failover
→ object-store outage
→ provider outage
→ telemetry drop
→ alert/page
→ incident commander
→ runbook containment
→ isolated restore/failover
→ tenant/privacy/smoke validation
→ RPO/RTO report
→ postmortem
```

### E2E

```text
normal workload
→ SLO measurement
→ capacity threshold
→ alert
→ incident declaration
→ freeze risky release
→ backup selection
→ isolated restore
→ reconciliation
→ approval
→ failover/recovery
→ observe
→ resolve + postmortem
```

هر E2E باید artifact hash، metric snapshot، alert receipt، backup/restore hash،
operator identity و audit event داشته باشد.

---

## ۱۹. Definition of Done

M8 فقط زمانی از `designed_only` به وضعیت اجرایی بعدی می‌رود که:

- [ ] SLI/SLO، owner، window، error budget و query versioned باشند.
- [ ] metric، trace و event tenant-safe، redacted و دارای freshness check باشند.
- [ ] alert dedupe، routing، escalation، notification fallback و audit واقعی باشد.
- [ ] CapacityPlan و load model با workload، peak، burst، retry، headroom و quota measurement شوند.
- [ ] noisy tenant، capacity exhaustion و provider quota با backpressure امن مدیریت شوند.
- [ ] PostgreSQL، queue، object، registry، config و audit backup policy و checksum داشته باشند.
- [ ] backup encryption، key rotation، immutability، residency و retention enforce شوند.
- [ ] restore drill در isolated target با `productionTouched=false` انجام شود.
- [ ] restore schema، RLS، دو tenant، event order، artifact hash و application smoke را validate کند.
- [ ] RPO/RTO مشاهده‌شده با timestamp و evidence ثبت شود؛ target بدون drill claim نشود.
- [ ] incident state، severity، commander، roles، timeline، containment و postmortem کار کند.
- [ ] runbook critical owner، version، precondition، safe action، deny condition، rollback و drill status داشته باشد.
- [ ] on-call rotation، escalation، handoff، break-glass TTL/MFA و revoke تست شود.
- [ ] chaos/game day بدون secret، cross-tenant leakage یا production damage انجام شود.
- [ ] `free` paid capacity را صدا نزند؛ `paid` budget/consent داشته باشد؛ `local` cloud fallback نداشته باشد.
- [ ] recovery هرگز audit، approval، privacy یا hard deny را دور نزند.
- [ ] M4 UI incident، SLO، alert، capacity، restore، RPO/RTO و nextAction را نمایش دهد.
- [ ] all evidence commands، exit codes، hashes، timestamps و audit references قابل replay باشند.

**وضعیت فعلی:** این سند فقط طراحی M8 است. SLO/alert runtime، capacity/load
measurement، backup/restore، DR failover، incident/on-call، runbook execution و
chaos evidence هنوز به‌صورت واقعی پیاده‌سازی و `done_tested` نشده‌اند.

---

## ۲۰. تصمیم‌های باز

1. backend نهایی metrics/trace/log بین self-hosted OpenTelemetry/Prometheus و managed option باید با privacy و cost انتخاب شود.
2. PostgreSQL PITR، object immutability و queue durability باید برای هر deployment target جدا verify شوند.
3. RPO/RTO tierها target طراحی هستند و پس از دو restore drill بازبینی می‌شوند.
4. multi-region failover تا زمانی که residency، credential، DNS، traffic switch و reconciliation مستقل تست نشده، production-eligible نیست.
5. auto-remediation در ابتدا فقط actions read-only، queue pause، release freeze و isolation محدود است؛ config/IAM changes manual approval می‌خواهند.
6. on-call برای self-host/local ممکن است user-owned باشد؛ محصول باید نبود coverage را transparent و fail-safe نشان دهد.
7. error budget exception برای security/data incident نمی‌تواند privacy gate یا audit را خاموش کند.

تا این evidence بسته نشده، M8 فقط طراحی‌شده است: **measured، recoverable،
operator-owned و local-first — اما هنوز عملیات production اثبات‌شده نیست.**
