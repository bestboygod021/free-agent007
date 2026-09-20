# فاز M83: Data Governance، Analytics، Legal Acceptance و Disclosure

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-DA-03`، `GAP-DA-04`، `GAP-DA-05`، `GAP-LG-01`، `GAP-LG-04`، `GAP-LG-05`، `GAP-SE-08`
**کد kernel:** `src/core/data-governance-runtime.ts`
**تست:** `test/next-governance-and-trust-phases.test.ts`

## هدف و مرز

M83 data governance را از retention به event envelope، analytics query، full-text/search boundary،
Terms/Privacy/output rights و vulnerability disclosure می‌رساند. هر analytics event باید PII
redacted، retention-aware و organization-bound باشد. این فاز event store، search index، legal
review، Redis/Vault replacement decision، bug bounty platform یا pen-test execution واقعی را
راه‌اندازی نمی‌کند.

## معماری

`AnalyticsEventEnvelope` actor/payload hash، data class، retention و sequence را ثبت می‌کند.
`decideGovernedAnalyticsQuery` time range، aggregate/export، row limit و audit approval را gate
می‌کند. `LegalPolicyAcceptance` نسخه، locale، subject hash و consent evidence دارد. `VulnerabilityDisclosure`
report/fix hash، severity، public approval و bounty decision را جدا می‌کند.

## قراردادهای اصلی

- `validateAnalyticsEventEnvelope` redaction، sequence، retention و confidential data را بررسی می‌کند.
- `decideGovernedAnalyticsQuery` raw audit/export، time range و row limit را محدود می‌کند.
- `validateLegalPolicyAcceptance` policy version، locale، acceptance و consent evidence را validate می‌کند.
- `decideVulnerabilityDisclosure` severity، fix، public disclosure و bounty approval را gate می‌کند.

## sprintها

### Sprint A — Event Store و Search

- append-only event envelope
- sequence/idempotency
- full-text scope و redaction
- retention/legal hold integration

### Sprint B — Analytics

- usage/quality/latency/cost datasets
- aggregate-first query
- per org/run dashboard
- controlled export

### Sprint C — Legal/Output Rights

- Terms/Privacy versioning
- output ownership/training disclosure
- disclaimer و locale
- acceptance audit

### Sprint D — Security Disclosure

- vulnerability intake
- severity/SLA
- remediation/fix reference
- coordinated public disclosure و bounty review

## Threat Model

- **Analytics PII leak:** event payload raw نیست و PII redaction قبل از append اجباری است.
- **Audit export abuse:** raw audit و export approval و row limit دارند.
- **Legal ambiguity:** policy version، locale و consent evidence بدون حدس ثبت می‌شوند.
- **Secret in disclosure:** report فقط hash/reference دارد و raw credential رد می‌شود.
- **Premature disclosure:** high/critical finding تا fix و public approval منتشر نمی‌شود.

## Prompt pack

### `m83-data-governance-engineer`

```text
نقش: Data Governance Engineer

eventها را append-only، organization-bound، sequenceدار و PII-redacted کن. analytics را aggregate-first
و export را approval-bound نگه دار. Terms/Privacy/output rights را version و localeدار با consent
ثبت کن. vulnerability report فقط hash/reference داشته باشد و disclosure هماهنگ پس از fix انجام شود.
```

### `m83-governance-evidence-gate`

```text
نقش: Governance Evidence Gate

برای event append، query/export، policy acceptance، output-rights disclosure، vulnerability triage
و public release، event/payload/report hash، version، approval، command و exit code ثبت کن. سند legal
یا dashboard fixture جای event store، query authorization و coordinated disclosure evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای event envelope، analytics query، legal acceptance و vulnerability disclosure.
- event store/search، dashboard/export، legal review، secret manager decision و disclosure/bounty workflow باید integration شوند.
- kernel M83 به‌تنهایی analytics compliance، legal enforceability یا vulnerability response production را ثابت نمی‌کند و `done_tested` نیست.
