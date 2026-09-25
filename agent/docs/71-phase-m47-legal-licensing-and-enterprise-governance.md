# فاز M47: Legal، Licensing و Enterprise Governance Runtime

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-SE-08`، `GAP-LG-01`، `GAP-LG-04`، `GAP-LG-05`، `GAP-PO-04`، `GAP-PO-06`
**کد kernel:** `src/core/legal-enterprise-governance-runtime.ts`
**تست:** `test/future-runtime-phases.test.ts`

## هدف و مرز

M47 قرارداد versioned Terms/Privacy/Disclaimer، output rights، provider training opt-out،
dependency license review، vulnerability disclosure و Enterprise upgrade را مشخص می‌کند.
این فاز legal counsel، public policy website، billing/enterprise service، bug bounty
program، license scanner یا support system واقعی اجرا نمی‌کند. متن حقوقی authority فنی
برای bypass policy نیست و باید human/legal review شود.

## معماری

Legal document registry با kind، locale، version، effective time، content hash و reviewer
کار می‌کند. output-rights policy مالکیت کاربر، provider training opt-out، third-party
license و disclaimer را پیش از release بررسی می‌کند. dependency review برای Redis/Vault/KMS
و provider، self-host allowlist و replacement decision ثبت می‌کند. disclosure plan با
opaque contact reference، SLA و severity matrix ساخته می‌شود؛ Enterprise upgrade data
portability، support، version و approval را gate می‌کند.

## قراردادهای اصلی

- `validateLegalDocument` document version، locale، review، approval و effective time را بررسی می‌کند.
- `decideOutputRights` ownership، provider opt-out، third-party license و disclaimer را enforce می‌کند.
- `decideDependencyLicense` license، self-host allowance، reviewer و replacement decision را validate می‌کند.
- `planVulnerabilityDisclosure` contact reference، SLA، severity matrix و public disclosure approval را gate می‌کند.
- `validateEnterpriseUpgrade` edition، version، data portability، support plan و approval را بررسی می‌کند.

## sprintها

### Sprint A — Terms و Privacy

- Terms of Service و Privacy Policy versioning
- fa-IR/en-US publication و consent
- output ownership/training disclaimer
- change notice و effective date

### Sprint B — Dependency و Provider Licensing

- Redis/Vault/KMS/license matrix
- provider ToS/locality/privacy review
- self-host redistribution decision
- replacement/upgrade ADR

### Sprint C — Vulnerability Governance

- security contact و disclosure policy
- severity matrix و response SLA
- private report، remediation و public disclosure
- periodic pen-test/bug-bounty review

### Sprint D — Enterprise Lifecycle

- community → self-host → enterprise boundary
- data portability و support plan
- upgrade/renewal/change notice
- audit و customer-facing transparency

## Threat Model

- **Legal status overclaim:** document بدون reviewer/approval/effective version منتشر نمی‌شود؛
  contract به‌تنهایی legal advice یا compliance certification نیست.
- **Output/IP ambiguity:** third-party content بدون license review و provider training بدون
  opt-out روشن، release را متوقف می‌کند.
- **Dependency license risk:** self-host allowlist و replacement decision برای Redis/Vault/
  provider ثبت می‌شود؛ license نامعلوم به production package راه ندارد.
- **Vulnerability suppression:** disclosure contact، SLA، severity و public decision audit می‌شود؛
  raw secret یا private report در log عمومی چاپ نمی‌شود.
- **Enterprise data loss:** edition upgrade بدون portability، support، compatibility و approval
  انجام نمی‌شود؛ billing یا support claim بدون integration evidence معتبر نیست.

## Prompt pack

### `m47-legal-enterprise-governance-engineer`

```text
نقش: Legal, Licensing and Enterprise Governance Engineer

هر document را با version، locale، hash، reviewer و approval ثبت کن. output rights، provider
training opt-out و third-party license را صریح کن. Redis/Vault/KMS/provider را با ToS/license
review و replacement decision بررسی کن. vulnerability disclosure و Enterprise upgrade را
بدون raw contact secret، data portability و human/legal approval اجرا نکن.
```

### `m47-governance-evidence-gate`

```text
نقش: Legal and Governance Evidence Gate

برای Terms/Privacy، output-rights، dependency license، disclosure SLA، pen-test/bounty و
Enterprise upgrade، document hash، reviewer، approval، command و change evidence ثبت کن.
یک markdown policy یا unit test به‌تنهایی legal/compliance/enterprise evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای document approval، ownership/opt-out، license allowance، disclosure
  SLA و upgrade portability.
- legal review، policy publication/consent، license scanner، vulnerability process، support/
billing و Enterprise upgrade باید جداگانه اجرا و ثبت شوند.
- هیچ claim درباره legal compliance، output ownership، license safety، bug bounty یا Enterprise
  readiness بدون review و evidence مستقل `done_tested` نیست.
