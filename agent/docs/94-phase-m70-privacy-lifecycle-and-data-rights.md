# فاز M70: Privacy Lifecycle، Data Rights و Deletion Evidence

**وضعیت:** `designed_only` از نظر production integration
**دامنه شکاف‌ها:** `GAP-SE-04`، `GAP-SE-06`، `GAP-LG-01`، `GAP-LG-04`، `GAP-DA-04`
**کد kernel:** `src/core/privacy-lifecycle-runtime.ts`
**تست:** `test/next-governance-and-ecosystem-phases.test.ts`

## هدف و مرز

M70 چرخه data subject access/export/rectify/delete/restrict، retention، legal hold و deletion
proof را تعریف می‌کند. prompt، output، telemetry، identity و credential reference باید policy
و retention مستقل داشته باشند. این فاز deletion worker، object/database store، DSAR portal،
legal review service یا GDPR certification واقعی را اجرا نمی‌کند.

## معماری

`PrivacyRetentionPolicy` data class، retention/grace، region، legal hold override و approval
دارد. `PrivacySubjectRequestRecord` subject hash، request state، verification و evidence را
ثبت می‌کند. `PrivacyLegalHold` matter، data class و subject scope را freeze می‌کند. deletion
تنها با legal-hold check، tombstone، residual search و `residualFound: false` کامل می‌شود.

## قراردادهای اصلی

- `validatePrivacyRetentionPolicy` retention bounds، region، approval و grace را بررسی می‌کند.
- `decidePrivacySubjectRequest` verification، state transition، delete/export review و timestamp را gate می‌کند.
- `validatePrivacyLegalHold` matter، scope، interval و approver را validate می‌کند.
- `validatePrivacyDeletionEvidence` tombstone، deleted count، legal hold و residual search را enforce می‌کند.

## sprintها

### Sprint A — Data Inventory

- identity/run/prompt/output/telemetry map
- store/region/owner metadata
- retention policy و version
- credential reference isolation

### Sprint B — Subject Rights

- access/export bundle
- rectify/restrict workflow
- delete request و verification
- user/legal review

### Sprint C — Deletion Propagation

- database/object/cache/search deletion
- tombstone و idempotency
- residual search
- queue retry و dead-letter

### Sprint D — Legal Hold و Evidence

- matter/hold lifecycle
- hold override
- deletion audit/retention
- privacy incident drill

## Threat Model

- **Deletion bypass:** active legal hold deletion را متوقف می‌کند؛ delete بدون verification/approval وارد worker نمی‌شود.
- **Residual data:** store، cache، search و telemetry باید جداگانه probe شوند؛ tombstone بدون residual search کافی نیست.
- **Subject mix-up:** subject hash و organization scope از access به داده کاربر دیگر جلوگیری می‌کنند.
- **Output/IP ambiguity:** output rights و provider training policy در request/export surface شفاف می‌ماند.
- **Retention overreach:** policy bounds و grace period مانع نگهداری بی‌حد داده می‌شود.

## Prompt pack

### `m70-privacy-lifecycle-engineer`

```text
نقش: Privacy Lifecycle Engineer

هر data class را با retention، region، owner و legal hold مدل کن. DSAR را subject hash و
organization-bound نگه دار. delete فقط پس از verification، approval و legal-hold check اجرا
شود و database/cache/search/telemetry residual search داشته باشد. raw prompt/output/identity
را در log عمومی نگذار.
```

### `m70-privacy-evidence-gate`

```text
نقش: Privacy Evidence Gate

برای access/export/delete، retention، legal hold، tombstone، store deletion، residual search و
completion، request hash، store evidence، count، timestamp، command و exit code ثبت کن. unit
policy یا یک حذف از database جای propagation و privacy drill evidence نیست.
```

## DoD و production evidence boundary

- unit/contract برای retention، rights state، legal hold، deletion approval و residual proof.
- data inventory، deletion worker، DSAR portal، store/cache/search propagation و legal review باید integration شوند.
- privacy kernel به‌تنهایی deletion completeness یا compliance certification را ثابت نمی‌کند و `done_tested` نیست.
