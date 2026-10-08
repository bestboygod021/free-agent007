# فاز M124: Audit Evidence Ledger، Provenance و Replay

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/audit-evidence-ledger-runtime.ts`
**تست:** `test/next-foundation-hardening-phases.test.ts`
**gap:** `GAP-AUD-01`

## هدف و مرز

M124 زنجیره audit تغییرناپذیر، provenance شواهد، replay قابل‌بازپخش و retention را formalize می‌کند. هر mutation باید tenant scope، actor hash، sequence، predecessor hash، payload hash، redaction و timestamp داشته باشد. evidence باید command، artifact، test و security hash و signer داشته باشد. این فاز event store، WORM storage، امضای KMS، replay worker یا retention provider واقعی ایجاد نمی‌کند.

## معماری

- `validateM124AuditEvent`: رویداد append-only را با sequence، predecessor، tenant scope، redaction و no-secret gate بررسی می‌کند.
- `validateM124EvidenceBundle`: provenance، artifact hash، replayability، signer و trust source را validate می‌کند.
- `decideM124Replay`: chain، sequence، tenant visibility، reviewer و replay command را gate می‌کند.
- `validateM124Retention`: retention class، legal hold، encrypted reference و purge proof را بررسی می‌کند.

Audit payload باید redacted باشد و raw password، token، API key یا key material وارد event یا artifact نشود. replay فقط در همان tenant و sandbox مجاز است.

## sprint plan

### Sprint A — Ledger

canonical event، sequence، predecessor hash، actor/resource reference و append-only writer.

### Sprint B — Evidence provenance

command/artifact/test/security hash، signer، source trust و artifact manifest.

### Sprint C — Replay

fixture lock، tenant-bounded replay، independent review و mismatch classification.

### Sprint D — Retention

retention class، legal hold، encrypted object reference، expiry و purge evidence.

## Threat Model

- **Audit tampering:** chain hash و immutable storage لازم است.
- **False evidence:** signer، provenance و independent replay لازم است.
- **Cross-tenant replay:** tenant scope و visibility check اجباری است.
- **Secret leakage:** payload redaction و opaque reference اجباری است.
- **Premature deletion:** legal hold و retention gate باید fail-closed باشند.

## prompt pack

### `m124-audit-ledger-engineer`

```text
نقش: Audit and Evidence Ledger Engineer

برای هر mutation رویداد tenant-bound با actor hash، sequence، predecessor hash، payload hash،
redaction و timestamp بساز. evidence را به command/artifact/test/security hash و signer متصل کن.
replay باید deterministic، sandboxed، tenant-bounded و مستقل از ادعای مدل باشد.
```

### `m124-evidence-auditor`

```text
نقش: Evidence Auditor

chain، sequence، provenance، signer، source trust، replay command، legal hold و purge proof را
بررسی کن. raw password/token/key material را رد کن. unit test یا mock store را با WORM ledger،
KMS signing، durable event store یا production replay اشتباه نکن.
```

## DoD و production evidence boundary

- audit chain، evidence bundle، replay mismatch و retention negative path تست شده باشد.
- event store durable، WORM/immutability، KMS signer، replay worker، retention scheduler و legal-hold integration لازم است.
- kernel M124 به‌تنهایی audit completeness، evidence authenticity، replay production یا deletion compliance را ثابت نمی‌کند.
