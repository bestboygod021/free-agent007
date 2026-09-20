# فاز M114: Legal، Licensing، Disclosure و Output Rights

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-LG-01`، `GAP-LG-02`، `GAP-LG-04`، `GAP-LG-05`، `GAP-SE-08`
**کد kernel:** `src/core/legal-disclosure-runtime.ts`
**تست:** `test/next-governance-integration-phases.test.ts`

## هدف و مرز

M114 policyهای Terms/Privacy، output rights، provider terms و vulnerability disclosure را به
قراردادهای قابل audit تبدیل می‌کند. output publication باید license، provider terms، attribution،
disclaimer و approval داشته باشد. provider terms باید training/retention/compute mode را روشن کند.
vulnerability report باید private، triaged و remediation-owner دار باشد. این فاز legal counsel،
Terms/Privacy website، provider contract automation، bug bounty portal یا public disclosure workflow
واقعی را اجرا نمی‌کند.

## معماری

`M114LegalPolicyContract` artifact/version/jurisdiction، validity، owner/reviewer و consent را
ثبت می‌کند. `M114OutputRightsEvidence` مدل، license، provider terms، user-input separation،
third-party attribution و publication approval را gate می‌کند. `M114ProviderTermsReview` hash،
training/retention، allowed compute mode و acceptance را نگه می‌دارد. `M114DisclosureReport`
private channel، triage، remediation owner و disclosure approval را enforce می‌کند.

## قراردادهای اصلی

- `validateM114LegalPolicy`: validity window، independent review، consent و public notice را بررسی می‌کند.
- `decideM114OutputPublication`: license، terms، attribution، disclaimer و approval را gate می‌کند.
- `validateM114ProviderTerms`: HTTPS، hash، data/training/retention policy و acceptance را validate می‌کند.
- `validateM114DisclosureReport`: private channel، triage، remediation و safe disclosure را enforce می‌کند.

## sprintها

### Sprint A — Policy Artifacts

- Terms/Privacy version
- jurisdiction و effective date
- consent record
- public notice

### Sprint B — Output Rights

- provider/model terms
- license matrix
- attribution
- disclaimer و publication approval

### Sprint C — Provider Review

- ToS URL/hash
- training/retention policy
- allowed compute modes
- acceptance/revalidation

### Sprint D — Disclosure

- private report channel
- triage/severity
- remediation owner
- coordinated disclosure

## Threat Model

- **Unlicensed output:** license و provider terms پیش‌شرط publication هستند.
- **Training/retention surprise:** unknown provider policy activation را متوقف می‌کند.
- **Public vulnerability leakage:** report تا triage/remediation private می‌ماند.
- **Conflicted review:** owner و reviewer مستقل‌اند.
- **Misleading output:** disclaimer و attribution اجباری است.

## Prompt pack

### `m114-legal-governance-engineer`

```text
نقش: Legal and Disclosure Governance Engineer

policy را با version، jurisdiction، validity، owner/reviewer، consent و public notice ثبت کن. output
فقط با license، provider terms، attribution، disclaimer و publication approval منتشر شود. provider
terms باید training/retention/compute mode را روشن کند. vulnerability report private، triaged و ownerدار باشد.
```

### `m114-legal-evidence-gate`

```text
نقش: Legal Evidence Gate

برای policy، output rights، provider terms و vulnerability report، URL/hash، reviewer، consent،
license/attribution، triage، remediation، command و exit code ثبت کن. متن Terms یا provider claim
جای legal review، acceptance، license matrix و coordinated disclosure evidence واقعی نیست.
```

## DoD و production evidence boundary

- unit/contract برای policy، output rights، provider terms و disclosure.
- legal review workflow، Terms/Privacy publication، license scanner، provider ToS registry و disclosure portal باید integration شوند.
- kernel M114 به‌تنهایی legal compliance، output ownership یا vulnerability disclosure production را ثابت نمی‌کند و `done_tested` نیست.
