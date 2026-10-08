# فاز بعدی: M2 Repository Intelligence و GitHub Loop

**نام فاز:** M2.0 — از Request تا Pull Request قابل بررسی
**وضعیت:** `designed_only`
**پیش‌نیاز اجباری:** عبور M1.2 از migration، persistence، durable queue، worker و RLS gates
**معیار سطح محصول:** یک Run می‌تواند یک repository مجاز را بخواند، scope تغییر را بفهمد، patch اتمیک بسازد، تست نرمال‌شده اجرا کند و یک PR Draft تولید کند؛ بدون push مستقیم به `main` و بدون deploy.

این فاز اولین حلقه واقعی «کدنویسی» است. تمرکز آن بر فهم repository و تولید تغییر
قابل بازبینی است، نه استقلال کامل agent. هر تصمیم model باید به کد deterministic،
policy، evidence و approval متصل شود.

---

## ۱. خروجی نهایی فاز

```text
User Request
  → Intent + Requirement Contract
  → GitHub Installation / Repository Snapshot
  → Repository Map + Symbol/Code Search
  → Task DAG + Scope Policy
  → Isolated Worktree / Branch
  → Patch Transaction
  → Test Runner Adapter
  → Static/Security/License Gates
  → PR Draft + Diff + Evidence
  → Human Approval
```

در پایان فاز، سیستم باید بتواند این موارد را با evidence واقعی نشان دهد:

- repository از GitHub App مجاز خوانده شده است.
- commit پایه و branch هدف immutable در Run ثبت شده‌اند.
- Agent فقط فایل‌های مجاز و scope تأییدشده را تغییر داده است.
- patch قابل rollback و hashپذیر است.
- تست‌ها خارج از API و در Execution/Worker boundary اجرا شده‌اند.
- نتیجه تست به `TestRun` نرمال‌شده تبدیل شده است.
- PR فقط به branch کاری یا Draft PR ارسال شده است.
- هیچ token خام، secret، cookie یا محتوای خصوصی در log یا model context غیرمجاز وارد نشده است.

---

## ۲. مرز این فاز

### در محدوده

| حوزه | طراحی و خروجی |
|---|---|
| GitHub Integration | GitHub App، installation، repository permission و webhook verification |
| Repository Snapshot | commit pin، manifest، file inventory و hash |
| Repository Intelligence | tree، AST symbol index، lexical search، optional embeddings |
| Requirement/Task | requirement contract، DAG و scope change |
| Workspace | worktree ایزوله، base commit و branch policy |
| Patch | diff، precondition، atomic apply، rollback و conflict detection |
| Test Runner | adapter برای Vitest، pytest و generic command با allowlist |
| Quality Gate | typecheck، lint، test، secret scan، license و evidence |
| Pull Request | PR draft، description، checks، labels و approval gate |
| Recovery | replay از snapshot، retry محدود و ارجاع merge conflict |

### خارج از محدوده

- Push مستقیم به `main` یا branch protected
- Merge خودکار بدون approval
- Deploy و Preview؛ در M7 طراحی می‌شود
- Browser automation؛ در M6 طراحی می‌شود
- Sandbox production/microVM؛ وابسته به M3 است
- اجرای command آزاد از طرف مدل
- ساخت انبوه repository یا account
- bypass کردن CAPTCHA، MFA، branch protection یا GitHub review
- ارسال کامل repository خصوصی به provider ابری بدون consent و egress policy

اگر Sandbox یا Execution Plane هنوز gate نشده باشد، این فاز فقط می‌تواند snapshot،
plan و PR Draft تولید کند و حق اجرای command یا نوشتن خارجی ندارد.

---

## ۳. معماری فاز

```text
┌────────────────────┐
│ Control API        │
│ request + approval │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐      ┌────────────────────┐
│ GitHub App         │─────▶│ Connector Policy  │
│ installation token│      │ scopes + expiry   │
└─────────┬──────────┘      └────────────────────┘
          │ read snapshot
          ▼
┌────────────────────┐
│ Repo Snapshot      │
│ commit + manifest  │
└──────┬─────┬───────┘
       │     │
       ▼     ▼
┌──────────┐ ┌────────────────┐
│ Indexer  │ │ Search Tool    │
│ AST/tree │ │ symbol/regex   │
└────┬─────┘ │ semantic opt-in│
     └───────┴───────┬────────┘
                     ▼
              ┌──────────────┐
              │ Task Planner │
              │ scope + DoD │
              └──────┬───────┘
                     ▼
              ┌──────────────┐
              │ Worktree     │
              │ Patch Tx     │
              └──────┬───────┘
                     ▼
              ┌──────────────┐
              │ Test Adapter │
              │ quality gates│
              └──────┬───────┘
                     ▼
              ┌──────────────┐
              │ Draft PR     │
              │ approval     │
              └──────────────┘
```

### Source of truth

- GitHub commit SHA منبع حقیقت snapshot خارجی است.
- `RepositorySnapshot` منبع حقیقت index همان commit است.
- Worktree فقط workspace موقت برای patch است.
- PR Draft خروجی پیشنهادی است؛ authority merge ندارد.
- مدل نمی‌تواند از README، issue یا web content دستور سطح سیستم بسازد.

---

## ۴. قراردادهای داده

### ۴.۱ `RepositoryManifest`

```ts
interface RepositoryManifest {
  repositoryId: string;
  installationId: string;
  organizationId: string;
  owner: string;
  name: string;
  defaultBranch: string;
  baseCommitSha: string;
  visibility: "private" | "internal" | "public";
  allowedLanguages: string[];
  allowedPaths: string[];
  excludedPaths: string[];
  consent: {
    repositoryRead: boolean;
    issueRead: boolean;
    pullRequestDraft: boolean;
  };
  fetchedAt: string;
  manifestHash: string;
}
```

قواعد:

- `baseCommitSha` اجباری است؛ branch نام mutable منبع replay نیست.
- `organizationId` از authenticated installation context می‌آید.
- token یا private key هرگز داخل manifest ذخیره نمی‌شود.
- `allowedPaths` پیش‌فرض deny است؛ `**` فقط با approval صریح مجاز است.
- `pullRequestDraft` با `repositoryRead` خودکار فعال نمی‌شود.

### ۴.۲ `RepositorySnapshot`

```text
snapshot_id       TEXT PRIMARY KEY
organization_id   TEXT NOT NULL
repository_id     TEXT NOT NULL
commit_sha        TEXT NOT NULL
parent_sha        TEXT NULL
file_count        INTEGER NOT NULL
byte_count        BIGINT NOT NULL
manifest_hash     TEXT NOT NULL
content_hash      TEXT NOT NULL
index_version     TEXT NOT NULL
status            TEXT NOT NULL  -- queued | indexing | ready | failed | expired
created_at        TIMESTAMPTZ NOT NULL
expires_at        TIMESTAMPTZ NULL
```

فایل‌های snapshot باید جداگانه و با retention مشخص نگهداری شوند. محتوای private
repository نباید به‌صورت نامحدود در index یا embedding باقی بماند.

### ۴.۳ `RepositoryFile`

```text
snapshot_id       TEXT NOT NULL
path              TEXT NOT NULL
language          TEXT NULL
size_bytes        INTEGER NOT NULL
content_hash      TEXT NOT NULL
is_binary         BOOLEAN NOT NULL
generated         BOOLEAN NOT NULL
ignored_reason    TEXT NULL
PRIMARY KEY (snapshot_id, path)
```

فایل binary، lockfile بزرگ و generated output به‌صورت پیش‌فرض index کامل نمی‌شوند؛
اما وجود و دلیل ignore باید در manifest ثبت شود.

### ۴.۴ `RepositorySymbol`

```text
snapshot_id       TEXT NOT NULL
path              TEXT NOT NULL
symbol_id         TEXT NOT NULL
kind              TEXT NOT NULL       -- class | function | type | route | test
name              TEXT NOT NULL
start_line        INTEGER NOT NULL
end_line          INTEGER NOT NULL
signature_hash    TEXT NULL
parent_symbol_id  TEXT NULL
PRIMARY KEY (snapshot_id, symbol_id)
```

AST parser خطادار نباید index جعلی بسازد. در parse failure، فایل به lexical-only
تنزل می‌کند و این downgrade در evidence ثبت می‌شود.

---

## ۵. Repository Indexing و RAG

### pipeline

1. دریافت commit pinned از GitHub App
2. بررسی size، file count، language و allowed path
3. تشخیص binary، generated، vendor و ignored files
4. hash کردن محتوا و ساخت snapshot
5. parse AST برای زبان‌های پشتیبانی‌شده
6. ساخت symbol graph و import/dependency edges
7. chunking با مرز function/class/module، نه برش تصادفی
8. lexical index برای همه فایل‌های مجاز
9. embedding اختیاری فقط در صورت consent و provider policy
10. ثبت index version و quality metrics

### حالت‌های index

| حالت | توضیح | وابستگی ابری |
|---|---|---|
| `lexical` | path، token، regex و symbol ساده | صفر |
| `ast` | symbol/import/test discovery | صفر، local parser |
| `semantic` | embedding و vector search | اختیاری، با consent |
| `hybrid` | lexical + AST + semantic rerank | اختیاری |

Local-first default باید `ast + lexical` باشد. نبود embedding نباید اجرای پایه را
متوقف کند.

### freshness

- index به `(repositoryId, commitSha, indexVersion)` bind می‌شود.
- تغییر commit، index قبلی را silently reuse نمی‌کند.
- index incremental فقط برای فایل‌هایی مجاز است که parent commit و hash آن‌ها معتبر است.
- stale index در context با warning و evidence همراه است.
- پس از data deletion، embedding و lexical content باید از cache و index حذف شوند.

### quality metrics

- symbol precision روی fixture repository
- top-k retrieval recall برای فایل مرتبط
- false-positive path rate
- stale-result rate
- index duration و byte throughput
- percentage فایل‌های parse شده

ادعای «agent repository را فهمید» بدون retrieval evidence معتبر نیست.

---

## ۶. قرارداد code search و Search Tool

این بخش قرارداد اصلی code search in repo است. code search باید از snapshot و scope
مجاز عبور کند و هیچ‌گاه به‌صورت global روی tenant یا repository دیگر اجرا نشود.

```ts
interface RepositorySearchRequest {
  snapshotId: string;
  query: string;
  mode: "symbol" | "regex" | "lexical" | "semantic" | "hybrid";
  paths?: string[];
  language?: string;
  maxResults: number;
  includeContextLines?: number;
}

interface RepositorySearchResult {
  snapshotId: string;
  results: Array<{
    path: string;
    startLine: number;
    endLine: number;
    score: number;
    matchType: string;
    contentHash: string;
    redactedPreview: string;
  }>;
  truncated: boolean;
  evidenceId: string;
}
```

قواعد امنیتی:

- query از مدل می‌آید، اما path scope از policy می‌آید.
- regex باید timeout و memory limit داشته باشد.
- خروجی search باید redacted و size-limited باشد.
- tool حق network access یا تغییر فایل ندارد.
- semantic search نمی‌تواند item خارج از tenant یا snapshot را برگرداند.
- query injection یا محتوای file نمی‌تواند permission tool را تغییر دهد.

---

## ۷. Worktree، Branch و Scope

### branch policy

```text
base branch: protected default branch
work branch: forgepilot/run-{runId}-{shortHash}
PR target: original default branch
merge: human approval + provider branch protection
```

- نام branch از user content خام ساخته نمی‌شود.
- branch کاری باید به `runId`، `baseCommitSha` و organization متصل باشد.
- حذف worktree پس از retention و ثبت cleanup evidence انجام می‌شود.
- `main` و branchهای protected در `allowedWriteRefs` وجود ندارند.

### scope contract

هر Task باید این موارد را داشته باشد:

```ts
interface ChangeScope {
  taskId: string;
  snapshotId: string;
  allowedPaths: string[];
  forbiddenPaths: string[];
  allowedOperations: Array<"create" | "modify" | "delete" | "rename">;
  maxFiles: number;
  maxBytes: number;
  requireApprovalFor: Array<"delete" | "lockfile" | "migration" | "workflow" | "secret-adjacent">;
  scopeHash: string;
}
```

هر patch خارج از scope باید قبل از apply متوقف شود، نه بعد از commit.

### monorepo

در monorepo:

1. workspace manager شناسایی می‌شود.
2. package graph ساخته می‌شود.
3. change scope از package متأثر مشتق می‌شود.
4. test matrix فقط packageهای متأثر و contractهای مشترک را اجرا می‌کند.
5. تغییر root config، lockfile یا workspace definition approval جدا می‌خواهد.

---

## ۸. Patch Transaction

```ts
interface PatchTransaction {
  patchId: string;
  runId: string;
  taskId: string;
  baseCommitSha: string;
  beforeTreeHash: string;
  afterTreeHash?: string;
  operations: Array<{
    path: string;
    operation: "create" | "modify" | "delete" | "rename";
    beforeHash?: string;
    afterHash?: string;
    unifiedDiff: string;
  }>;
  scopeHash: string;
  status: "proposed" | "validated" | "applied" | "rolled_back" | "conflicted" | "rejected";
}
```

### apply algorithm

1. بررسی base commit و tree hash
2. بررسی scope hash و path allowlist
3. بررسی before hash هر فایل
4. اجرای patch روی worktree موقت
5. بررسی path traversal، symlink escape و forbidden file
6. محاسبه after tree hash
7. اجرای static/security checks
8. ثبت patch transaction
9. commit روی branch کاری، نه `main`
10. در failure، rollback worktree و ثبت evidence

Patch apply باید atomic باشد. اگر یکی از operationها fail شود، نصف patch نباید در
workspace بعدی باقی بماند.

### merge conflict

اگر base branch جلو رفته باشد:

- patch روی base جدید silently rebase نمی‌شود.
- context تعارض محدود و redacted به agent داده می‌شود.
- حداکثر retry مشخص است.
- تعارض در migration، workflow، permission یا secret-adjacent به انسان ارجاع می‌شود.
- merge conflict resolution خودش یک approval و audit event دارد.

---

## ۹. Test Runner Adapter

### قرارداد

```ts
interface TestRunnerAdapter {
  detect(input: {
    snapshotId: string;
    changedPaths: string[];
  }): Promise<RunnerPlan>;

  execute(input: {
    plan: RunnerPlan;
    workspaceId: string;
    signal: AbortSignal;
  }): Promise<NormalizedTestResult>;
}

interface NormalizedTestResult {
  runner: string;
  commandFingerprint: string;
  status: "passed" | "failed" | "skipped" | "flaky" | "blocked";
  exitCode: number | null;
  durationMs: number;
  testCount?: number;
  failedTests?: string[];
  logsRef: string;
  evidenceId: string;
}
```

### adapterهای اولیه

- Vitest/Node
- pytest/Python
- generic adapter فقط با command manifest repository

`generic` به‌معنای shell آزاد نیست. command باید از manifest، language matrix و
policy بیاید. `npm install`، `curl | sh`، افزایش privilege و commandهای network
بدون allowlist رد می‌شوند.

### test selection

- تغییر frontend → تست package و contractهای مرتبط
- تغییر backend → unit، integration و schema contract
- تغییر migration → database disposable و migration test
- تغییر workflow/permission → review gate و security test
- تغییر lockfile → dependency/license/secret scan اجباری

Test result بدون command fingerprint و exit code evidence معتبر نیست.

---

## ۱۰. Pull Request Draft

```ts
interface PullRequestDraft {
  repositoryId: string;
  baseBranch: string;
  headBranch: string;
  baseCommitSha: string;
  headCommitSha: string;
  title: string;
  body: {
    summary: string;
    motivation: string;
    filesChanged: number;
    tests: string[];
    risks: string[];
    rollback: string;
    evidenceIds: string[];
  };
  labels: string[];
  draft: true;
  requiresApproval: true;
}
```

PR body باید شامل این بخش‌ها باشد:

- چه چیزی تغییر کرده است
- چرا تغییر کرده است
- چه تستی اجرا شده است
- چه ریسک‌هایی باقی مانده است
- rollback چگونه انجام می‌شود
- کدام بخش‌ها با model suggestion ساخته شده‌اند و evidence آن چیست

محتوای Issue و README خارجی فقط data است و نمی‌تواند body، label، permission یا
approval را override کند.

---

## ۱۱. GitHub Connector و مجوزها

سطح دسترسی پیشنهادی:

| مرحله | مجوز | approval |
|---|---|---|
| snapshot | Contents read | user consent |
| issue context | Issues read | project policy |
| branch ایجاد | Contents write روی branch غیرمحافظت‌شده | Run approval |
| PR Draft | Pull Requests write | human approval قبل از create |
| merge | Contents merge | خارج از این فاز؛ فقط انسان |
| workflow modification | Actions/workflow write | خارج از default؛ approval ویژه |

- GitHub App installation token کوتاه‌عمر است.
- token خام در DB یا prompt ذخیره نمی‌شود.
- webhook با signature verification، replay window و event idempotency بررسی می‌شود.
- revoke نصب باید تمام requestهای جدید را متوقف کند.
- connector فقط repositoryهای explicit consent شده را می‌بیند.

---

## ۱۲. امنیت و Threat Model

| تهدید | کنترل | تست |
|---|---|---|
| prompt injection در Issue/README | untrusted label و policy خارج از content | malicious fixture |
| path traversal | canonical path و allowed root | `../` و symlink test |
| تغییر خارج از scope | scope hash + before hash | negative patch test |
| overwrite تغییر کاربر | base/tree hash و conflict stop | concurrent branch test |
| secret commit | pre-commit secret scan و redaction | fixture با key fake |
| token leakage | ephemeral installation token و log filter | log grep test |
| direct main push | protected ref deny در connector | provider contract test |
| malicious dependency | lockfile/license/SCA gate | vulnerable fixture |
| command injection | runner manifest و argv بدون shell interpolation | command fuzz test |
| private code egress | local lexical/AST default و egress policy | network denial test |
| oversized repository | byte/file limit و backpressure | quota test |
| stale index | commit binding و freshness check | old snapshot test |
| malicious PR title/body | output contract و content sanitization | XSS/markdown fixture |

هیچ‌کدام از این کنترل‌ها با «مدل گفته امن است» bypass نمی‌شوند.

---

## ۱۳. اجرای چهار اسپرینت

### Sprint A — GitHub Read و Snapshot

- GitHub App installation context
- webhook signature و event idempotency
- `RepositoryManifest`
- commit-pinned snapshot
- file inventory و retention
- contract test با fixture repository

### Sprint B — Index و Search

- AST parser adapter
- symbol graph
- lexical/symbol search
- semantic mode به‌صورت opt-in
- retrieval evaluation
- tenant و snapshot isolation

### Sprint C — Worktree و Patch

- branch/worktree manager
- `ChangeScope`
- atomic patch transaction
- before/after hash
- conflict detection
- rollback و cleanup evidence

### Sprint D — Test و Draft PR

- Vitest/Pytest adapters
- normalized `TestRun`
- static/security/license gates
- PR body و evidence links
- Draft PR با approval gate
- E2E از request تا PR Draft

---

## ۱۴. معیارهای قابل اندازه‌گیری

| معیار | هدف اولیه |
|---|---:|
| snapshot reproducibility | ۱۰۰٪ برای commit یکسان |
| path scope escape | صفر |
| cross-tenant retrieval | صفر |
| stale retrieval در commit pinned | صفر |
| patch atomicity failure | صفر artifact نیمه‌اعمال‌شده |
| secret در diff/log | صفر |
| direct main push | صفر |
| normalized test result با evidence | ۱۰۰٪ test runها |
| duplicate PR برای idempotency یکسان | صفر |
| retrieval top-k recall روی fixture | حداقل ۰٫۸۵ |
| false-positive changed-path rate | حداکثر ۰٫۱۵ |

این اعداد target طراحی هستند و تا زمان اجرای benchmark نباید به‌عنوان نتیجه واقعی
گزارش شوند.

---

## ۱۵. Test و Evidence Plan

### Unit

- manifest validation
- commit/hash binding
- path canonicalization
- scope matching
- symbol extraction
- search ranking
- patch operation validation
- PR title/body contract

### Integration

- GitHub App mock با signature واقعی fixture
- snapshot دو commit
- index incremental
- monorepo package graph
- PostgreSQL repository metadata با RLS
- disposable worktree
- test runner normalization
- Draft PR idempotency

### Negative/Security

- Issue prompt injection
- path traversal و symlink
- fake secret در فایل
- branch `main` write
- expired/revoked installation token
- oversized binary
- malicious regex
- shell metacharacter
- stale base commit
- cross-tenant snapshot ID

### End-to-end

```text
authenticated user
→ select repository
→ approve read scope
→ fetch pinned commit
→ retrieve relevant files
→ approve plan and ChangeScope
→ create isolated branch
→ apply patch
→ run allowed tests
→ scan diff
→ create Draft PR
→ show diff/evidence/rollback
```

Evidence معتبر شامل commit SHA، snapshot hash، scope hash، diff hash، test report،
scan report، PR number و audit event است. متن مدل به‌تنهایی Evidence نیست.

---

## ۱۶. Definition of Done فاز

فاز M2 فقط وقتی از `designed_only` به وضعیت اجرایی بعدی می‌رود که:

- [ ] M1.2 durable persistence و worker gate سبز باشد.
- [ ] GitHub App فقط repository و scope consent شده را ببیند.
- [ ] snapshot به commit SHA و manifest hash bind باشد.
- [ ] index lexical/AST برای fixture repository قابل‌بازپخش باشد.
- [ ] semantic search optional باشد و local-first مسیر پایه باقی بماند.
- [ ] search خارج از snapshot یا tenant، نتیجه ندهد.
- [ ] worktree از branch اصلی ایزوله باشد.
- [ ] `main` و protected branch هرگز write target نباشند.
- [ ] patch خارج از ChangeScope قبل از apply رد شود.
- [ ] patch atomic، hashپذیر و rollbackپذیر باشد.
- [ ] merge conflict به‌جای silent rebase به انسان ارجاع شود.
- [ ] TestRunner command آزاد اجرا نکند.
- [ ] TestRun با exit code، fingerprint و logsRef ذخیره شود.
- [ ] secret، license و security gate پیش از PR اجرا شوند.
- [ ] PR همیشه Draft و نیازمند approval باشد.
- [ ] duplicate webhook، duplicate patch و duplicate PR idempotent باشند.
- [ ] E2E evidence واقعی از request تا PR Draft ثبت شود.

**وضعیت فعلی:** این سند طراحی M2 است. تا زمانی که این شواهد با ابزار واقعی
اجرا نشوند، GitHub Integration، repository intelligence یا PR flow
`done_tested` اعلام نمی‌شوند.
