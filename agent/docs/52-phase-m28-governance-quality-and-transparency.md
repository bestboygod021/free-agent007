# فاز M28: Governance، Quality، Accessibility و Transparency

**وضعیت:** `designed_only`
**proposalهای هدف:** `UP-091` تا `UP-099`
**کد kernel:** `src/core/governance-quality.ts`
**تست:** `test/audit-next-phases-2.test.ts`

## هدف و مرز

M28 policy و change را با owner، version، expiry، approval و rollback قابل بررسی
می‌کند؛ model card و language quality را از vendor claim جدا نگه می‌دارد؛ accessibility،
plugin publication، transparency و ADR را به evidence متصل می‌کند.

این فاز policy را در runtime اعمال نمی‌کند، marketplace را منتشر نمی‌کند، UI/axe را
اجرا نمی‌کند، billing یا metrics backend ندارد و هیچ exception را silently قبول نمی‌کند.

## قراردادهای اصلی

- `validatePolicyBundle` owner، hash و expiry را بررسی می‌کند.
- `planGovernedChange` widening access، self-approval و نبود rollback را رد می‌کند.
- `validateModelCard` limitations، cost و measured evidence را الزام می‌کند.
- `evaluateFairness` حداقل score و maximum language gap را گزارش می‌دهد.
- `evaluateAccessibility` unresolved critical finding را block می‌کند.
- `decidePluginPublication` signature، SBOM، license، sandbox test و independent review
  را قبل از publication الزام می‌کند.
- `buildTransparencyProjection` فقط aggregateهای tenant-bound را می‌سازد و secret ندارد.
- `validateAdr` alternative، trade-off، evidence و rollback reference را برای ADR accepted
  الزام می‌کند.

## sprintها

### Sprint A — Policy as Code و Change Management

- policy bundle owner/version/expiry
- change request و independent reviewer
- widening access با approval و rollback
- immutable audit و policy regression

### Sprint B — Model Cards و Fairness

- vendor claim در برابر measured evidence
- limitation، language، risk و cost
- language score و sample size
- minimum score و maximum gap

### Sprint C — Accessibility و Persian RTL QA

- critical/serious/minor finding
- keyboard، screen reader، contrast و focus در adapter UI
- mixed-direction identifier/path و fa-IR fixture
- accessibility CI بعد از ساخت Web App

### Sprint D — Marketplace، Transparency و ADR

- publication gate با signature/SBOM/license/sandbox/reviewer
- dashboard projection بدون tenant leak و secret
- ADR با alternatives، trade-offs، evidence و rollback
- اعتراض، supersede و revoke در persistence بعدی

## Prompt pack

### `m28-governance-reviewer`

```text
نقش: Governance and Quality Reviewer

برای هر policy/change/model/plugin/ADR owner، version، expiry، evidence، approval و
rollback را بررسی کن. vendor claim را measured جلو نزن. self-approval، exception بدون
expiry، unsigned plugin، license ناشناخته، raw secret و promotion بدون evidence را deny
کن. خروجی reason code و decision hash داشته باشد.
```

### `m28-transparency-a11y-gate`

```text
نقش: Transparency and Accessibility Gate

گزارش aggregate فقط برای همان tenant تولید کن و هرگز secret یا raw content نشان نده.
critical accessibility finding، language regression و fairness gap را block کن. برای
fa-IR متن mixed-direction، code، path و عدد را جدا تست کن؛ ادعای WCAG بدون automated
و manual evidence معتبر نیست.
```

## DoD و evidence boundary

- تست policy expiry، self-approval، model-card evidence، fairness gap، critical a11y،
  plugin publication gate، transparency tenant boundary و ADR evidence اجرا شود.
- admin UI، policy runtime، marketplace، signer، dashboard backend و accessibility
  browser audit هنوز integrationهای بعدی هستند.
- `partial` فقط وضعیت kernel/test است و به معنی compliance، WCAG یا production governance
  نیست.
