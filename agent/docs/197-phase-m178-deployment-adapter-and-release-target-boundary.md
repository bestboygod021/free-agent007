# فاز M178: Deployment Adapter و Release Target Boundary

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/deployment-adapter-runtime.ts`
**تست:** `test/next-platform-hardening-phases-10.test.ts`
**gap:** `GAP-PO-13`

## هدف و مرز

M178 فاصله میان release manifest و deployment target را با adapter request، preflight، idempotency،
egress policy، smoke evidence، target match و rollback contract کنترل می‌کند. production و protected
target بدون approval رد می‌شوند و هیچ adapterی مجاز به mutation مستقیم `main` نیست. این فاز cloud
provider، orchestrator، deployment controller، DNS/TLS یا production cutover واقعی نیست.

## معماری

- `validateM178Plan`: artifact/manifest، target، approval، protected target، rollback و sandbox.
- `decideM178AdapterRequest`: adapter، preflight، egress، timeout، idempotency و tenant.
- `validateM178AdapterResult`: deployed digest، smoke، target match، rollback و evidence.
- `decideM178Rollback`: digestهای متفاوت، operator، approval، bound و evidence.

Local-first adapter می‌تواند فقط local/preview را فعال کند. BYOK، free-tier و deployment provider
نباید approval یا target policy را دور بزنند. production deploy بدون approval، secret در request، یا
کد untrusted خارج از sandbox ممنوع است.

## Sprint plan

### Sprint A — Target registry

environment، target reference، protected target و adapter capability.

### Sprint B — Preflight

artifact digest، manifest، egress policy، sandbox و idempotency.

### Sprint C — Apply و evidence

bounded timeout، target match، smoke test، response evidence و audit.

### Sprint D — Rollback و cutover

rollback digest، operator approval، bounded reversal و failure containment.

## Threat Model

- **Wrong-environment deploy:** target registry و protected target guard.
- **Artifact substitution:** digest/manifest match و preflight evidence.
- **Provider side effect:** adapter timeout، idempotency و egress policy.
- **Unauthorized production change:** explicit approval و no-main mutation.
- **False success:** smoke، target match، rollback availability و evidence.
- **Irreversible cutover:** bounded rollback و operator review.

## prompt pack

### `m178-deployment-boundary-engineer`

```text
نقش: Deployment Boundary Engineer

هر deployment را با artifact digest، release manifest، adapter، target environment، preflight، egress
policy، approval و rollback بساز. production/protected target را default-deny کن. success فقط با smoke،
target match، rollback availability و evidence معتبر است.
```

### `m178-deployment-auditor`

```text
نقش: Deployment Auditor

wrong target، digest substitution، main mutation، missing approval، provider side effect، false smoke
و rollback fiction را بررسی کن. deploy script یا provider mock جای controller، cutover evidence و rollback واقعی نیست.
```

## DoD و production evidence boundary

- plan، preflight، staging request، production denial، adapter result و rollback تست شوند.
- target registry، adapter gateway، artifact verifier، secret/egress boundary، smoke runner و rollback controller باید متصل شوند.
- kernel M178 به‌تنهایی deployment safety، availability، cutover correctness یا production release claim نیست.
