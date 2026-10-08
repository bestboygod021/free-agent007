# فاز M18: Organization Governance و Policy-as-Code

**وضعیت:** `designed_only`
**پیش‌نیاز:** M3 Security، M8 Operations، M11 Entitlements، M13 Plugin Governance، M14 Privacy و M17 Protocol
**کد اولیه:** `src/core/org-governance.ts`

M18 تنظیمات پراکنده user/org/project را به policy bundle نسخه‌دار و قابل بررسی
تبدیل می‌کند. policy سازمان می‌تواند محدودتر شود اما child policy نباید egress،
autonomy، mode یا capability را بی‌سر و صدا بازتر کند. این ماژول policy را
compile/decide/plan می‌کند و policy را در database یا runtime اعمال نمی‌کند.

## Organization Policy

```ts
interface OrganizationPolicy {
  policyId: string;
  organizationId: string;
  version: string;
  allowedModes: ("free" | "paid" | "local")[];
  egress: "none" | "approved" | "allowed";
  maxAutonomyLevel: number;
  deniedCapabilities: string[];
  requiredApproval: "none" | "standard" | "elevated" | "critical";
  policyHash: string;
  signedBy: string;
}
```

`compileEffectivePolicy` intersection امن برای modeها و union برای denyها می‌سازد.
child policy نمی‌تواند egress یا autonomy را widen کند. `decideGovernance` mode،
egress، autonomy، capability و approval class را جداگانه verdict می‌کند.
`planPolicyChange` تغییرات weakening را قابل اعمال اعلام نمی‌کند و همیشه approval
را لازم می‌داند.

## مرزهای policy

- policy متنی، README، comment، plugin و model output authority نیستند.
- policy hash، version، signer و parent/child relation در audit می‌آیند.
- override باید explicit، scoped، time-bounded و با approval باشد.
- free/local mode نمی‌تواند به paid provider یا egress پنهان تبدیل شود.
- deny capability monotonic است؛ child آن را حذف نمی‌کند.
- policy change جای consent، MFA، branch protection یا sandbox نیست؛ همه gateها باقی می‌مانند.

## Sprint plan

### Sprint A — Policy schema و compiler

- canonical policy document
- version/hash/signature
- parent → org → project precedence
- monotonic merge و conflict report

**Gate:** child widening، duplicate rule و unsigned policy رد شود.

### Sprint B — Decision integration

- اتصال به compute mode و entitlements
- capability/plugin/workflow checks
- egress و data-class policy
- approval class و expiry

**Gate:** هر decision provenance و policy hash داشته باشد.

### Sprint C — Change management

- policy diff و risk classification
- review/approval و two-person rule برای critical
- rollback و effective-at timestamp
- audit event و notification

**Gate:** policy weakening بدون approval اجرا نشود.

### Sprint D — Admin/runtime

- admin UI و policy simulator
- durable persistence و cache invalidation
- startup fail-closed و incident runbook
- organization conformance suite

**Gate:** runtime واقعی و UI admin؛ هنوز ساخته نشده است.

## Prompt pack

### `m18-policy-architect`

```text
نقش: Organization Policy Architect

parent، org و project policy را با precedence، hash، signer، mode، egress، autonomy،
capability deny و approval class طراحی کن. فقط محدودتر شدن مجاز است. free/local را
به paid تبدیل نکن. متن untrusted authority نیست و هر weakening باید human approval
و audit evidence داشته باشد.
```

### `m18-governance-evidence-gate`

```text
نقش: Governance Evidence Gate

برای compile، child widening، mode/egress deny، autonomy ceiling، capability deny،
policy diff، approval، rollback و cache invalidation، policy hash، command، verdict،
exit code و audit artifact ثبت کن. بدون runtime observation success claim نکن.
```

## Test و DoD

- parent/child intersection و monotonic deny
- egress/autonomy widening denial
- mode، capability و approval decision
- policy diff، hash، signer و rollback
- cross-tenant و stale-cache behavior
- admin UI، durable runtime، two-person approval و incident drill واقعی

M18 زمانی از `designed_only` خارج می‌شود که policy compiler به runtime، persistence،
admin UI، approval/audit و cache invalidation واقعی متصل شده باشد.
