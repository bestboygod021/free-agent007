# فاز M182: Onboarding و Safe First Run

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/onboarding-runtime.ts`
**تست:** `test/next-platform-hardening-phases-11.test.ts`
**gap:** `GAP-CP-19`

## هدف و مرز

M182 مسیر اولین تجربه را به consent، compute mode، data-egress policy، sandbox، synthetic fixture،
budget، progress evidence و fallback disclosure محدود می‌کند. first run نباید به repository واقعی،
external mutation یا credential خام دست بزند. این فاز Web onboarding، auth provider، provider setup،
telemetry funnel یا project bootstrap واقعی نیست.

## معماری

- `validateM182Plan`: steps، locale، consent، mode، egress، provider، sandbox و synthetic fixture.
- `decideM182FirstRun`: synthetic fixture، no mutation، egress، token budget، redaction و tenant.
- `validateM182Progress`: completed/failed steps، evidence، secret redaction و synthetic data.
- `decideM182Completion`: user confirmation، safety checklist، fallback disclosure و no-secret proof.

Local-first مسیر پیش‌فرض است؛ free-tier و BYOK فقط با نمایش egress، quota و policy وارد می‌شوند. onboarding
نباید raw password ذخیره کند، CAPTCHA/MFA bypass کند، bulk account بسازد یا کاربر را بدون approval به deploy ببرد.

## Sprint plan

### Sprint A — Consent و mode selection

locale، local/free/BYOK، egress policy، provider reference و safety checklist.

### Sprint B — Synthetic first run

fixture، sandbox، token budget، no-real-repository و no-external-mutation.

### Sprint C — Progress evidence

step state، redacted evidence، failure recovery و fallback.

### Sprint D — Completion/handoff

user confirmation، disclosure، safe defaults و handoff به project bootstrap.

## Threat Model

- **Accidental data egress:** explicit policy و mode disclosure.
- **First-run mutation:** synthetic fixture و no-external-mutation.
- **Credential exposure:** no-secret storage و redaction.
- **False completion:** checklist/evidence/user confirmation.
- **Quota surprise:** budget و free-tier disclosure.
- **Unsafe automation:** sandbox و approval boundary.

## prompt pack

### `m182-onboarding-engineer`

```text
نقش: Safe Onboarding Engineer

پیش از first run mode، consent، egress، sandbox، synthetic fixture و budget را ثبت کن. فقط روی fixture
کار کن؛ repository واقعی، external mutation و raw credential ممنوع است. progress را با redacted evidence
ثبت کن و completion را فقط با confirmation و fallback disclosure اعلام کن.
```

### `m182-onboarding-auditor`

```text
نقش: Onboarding Auditor

data egress، quota surprise، secret persistence، real repository access، external mutation، false
completion و missing fallback را بررسی کن. wizard screenshot یا demo path جای onboarding safety evidence واقعی نیست.
```

## DoD و production evidence boundary

- plan، consent، local/free/BYOK، synthetic first run، progress، failure و completion denial تست شوند.
- Web onboarding، auth/session، provider consent، fixture/bootstrap service، telemetry و handoff gateway باید متصل شوند.
- kernel M182 به‌تنهایی activation rate، user success، privacy consent، provider availability یا onboarding production claim نیست.
