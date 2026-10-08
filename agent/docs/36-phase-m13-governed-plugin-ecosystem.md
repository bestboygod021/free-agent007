# فاز M13: Governed Plugin Ecosystem و Marketplace

**وضعیت:** `designed_only`
**پیش‌نیاز:** M3 Sandbox، M5 Registry/Connector SDK، M7 Supply Chain و M8 Operations
**کد اولیه این فاز:** `src/core/plugin-registry.ts`

M13 extensibility را به package marketplace بی‌اعتماد تبدیل نمی‌کند. plugin فقط با
manifest نسخه‌دار، signature، digest، license، compatibility، capability، scope و
sandbox boundary قابل ثبت و در ابتدا فقط به‌صورت proposal قابل بررسی است.

## ۱. Trust levels

| trust | معنی | execution |
|---|---|---|
| `builtin` | کد release‌شده هسته | policy + normal boundary |
| `verified` | signature، scan، review و compatibility موفق | sandbox |
| `private` | متعلق به یک organization | همان tenant، sandbox |
| `unverified` | metadata ثبت شده، trust کافی ندارد | ممنوع |
| `revoked` | incident، expiry، license یا supply-chain issue | ممنوع |

M13 marketplace عمومی را با install button آزاد نمی‌کند. discovery، review، install،
revoke و upgrade هرکدام event و approval خود را دارند.

## ۲. Plugin Manifest

```ts
interface PluginManifest {
  pluginId: string;
  version: string;
  sdkVersion: string;
  organizationId?: string;
  capabilities: string[];
  requestedScopes: string[];
  runtime: "sandbox" | "wasm" | "external_adapter";
  packageDigest: string;
  signature: string;
  license: string;
  compatibility: { minPlatformVersion: string; maxPlatformVersion?: string };
  trust: "builtin" | "verified" | "private" | "unverified" | "revoked";
  manifestHash: string;
}
```

### hard rules

- plugin capability باید declaration و policy mapping داشته باشد.
- `host.exec`، Docker socket، `credential.read_raw`، `captcha.solve` و `mfa.bypass` hard deny هستند.
- untrusted plugin فقط در sandbox و با egress allowlist اجرا می‌شود.
- package digest و signature قبل از install و هر execution verify می‌شوند.
- version compatibility و SDK contract check الزامی است.
- plugin نمی‌تواند scope، tenant، budget، approval یا compute mode را افزایش دهد.
- private plugin cross-tenant retrieval ندارد.
- license، data residency، training policy و provider ToS review لازم است.
- upgrade همان install نیست؛ diff، migration، rollback و re-consent می‌خواهد.

`planPluginInstall` فقط install decision می‌سازد و هیچ package code را اجرا نمی‌کند.

## ۳. Plugin lifecycle

```text
submitted
  → manifest/schema validated
  → signature/digest verified
  → license/security scan
  → compatibility checked
  → human/org review
  → verified/private
  → scoped install
  → health/evidence
  → deprecated
  → revoked
```

## ۴. Sprintها

### Sprint A: SDK Contract

- manifest/schema/version
- capability/scope mapping
- runtime boundary و normalized result
- compatibility matrix

### Sprint B: Supply Chain

- signature/digest registry
- SBOM/license/secret/vulnerability scan
- provenance و immutable package
- revoke/deprecation

### Sprint C: Marketplace Governance

- discovery metadata
- review queue و organization ownership
- consent، install، upgrade و rollback
- ToS/training/residency display

### Sprint D: Runtime Hardening

- sandbox/wasm adapter
- egress/secret/tenant policy
- timeout/output/rate/circuit
- malicious plugin، prompt injection و cross-tenant tests

## ۵. Prompt Pack

### `m13-plugin-architect`

```text
نقش: Governed Plugin Architect

manifest، SDK compatibility، runtime، capability، scope، data policy، license،
signature، digest، version و rollback را طراحی کن. plugin untrusted است و فقط sandbox
می‌گیرد. authority، tenant، budget، approval یا mode را از manifest استخراج نکن؛ فقط
policy intersection را پیشنهاد بده.
```

### `m13-supply-chain-reviewer`

```text
نقش: Plugin Supply Chain Reviewer

signature، packageDigest، SBOM، license، vulnerability، provenance، dependency،
revocation و compatibility را بررسی کن. raw credential، package code و private key
را در report چاپ نکن. tampered/unsigned/revoked plugin را block کن.
```

### `m13-marketplace-reviewer`

```text
نقش: Marketplace Governance Reviewer

owner، private tenant، ToS، training policy، residency، capabilities، requested scopes،
reviewers و expiry را بررسی کن. install عمومی بدون review/consent ممنوع است. upgrade
باید diff، migration، rollback و re-consent داشته باشد.
```

### `m13-plugin-evidence-gate`

```text
نقش: M13 Plugin Evidence Gate

برای manifest، signature، digest، scan، compatibility، install، sandbox، egress،
revoke، upgrade و cross-tenant isolation command/test، exit code، hashes، audit refs
و receipts ثبت کن. mock install یا package README evidence نیست.
```

## ۶. Test و DoD

- invalid semver، missing signature/license/digest
- signature verifier failure و package substitution
- revoked/unverified/private ownership
- compatibility min/max
- hard-deny capability
- capability/scope mismatch
- sandbox requirement و egress deny
- upgrade/re-consent/rollback
- two-tenant private plugin isolation
- timeout/output/rate/circuit
- SBOM/license/secret/vulnerability fixture
- local/free/paid mode behavior

M13 با registry durable، actual package verification، sandbox execution، revocation،
marketplace review و security evidence از `designed_only` خارج می‌شود. کد فعلی فقط
metadata/policy decision است و plugin را اجرا نمی‌کند.
