# فاز M206: Region-bound Processing و Residency Enforcement

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/region-processing-runtime.ts`
**تست:** `test/next-platform-hardening-phases-16.test.ts`
**gap:** `GAP-DA-13`

## هدف و مرز

M206 پردازش را به subject region، provider declaration، allowed placement، encryption، transfer basis،
minimization و regional deletion bind می‌کند. این contract جایگزین region-aware router، provider location
verification، legal review، encrypted stores یا multi-region erasure worker نیست.

## معماری و قرارداد

- `validateM206Request`: data class، regionها، policy/basis، consent، encryption و tenant.
- `decideM206Placement`: allowed region، selected region، policy match، no-cross-boundary و local fallback.
- `decideM206Transfer`: distinct regions، legal basis، safeguards، approval، visibility و minimization.
- `validateM206Deletion`: region/store coverage، completion، residual copies و legal hold.

Local-first ابتدا انتخاب می‌شود؛ در BYOK محل provider باید explicit و قابل‌بررسی باشد و free-tier
بدون region evidence یا consent صادقانه deny شود. داده در transit/at rest encrypted فرض production
نیست مگر evidence واقعی ارائه شود.

## Threat model

- **Region spoofing:** provider location verifier.
- **Cross-border leakage:** placement gate و explicit transfer approval.
- **Unencrypted replica:** encryption evidence و store inventory.
- **Deletion residue:** همه region/storeها و residual scan.
- **Purpose creep:** data class، minimization و user visibility.
- **Fallback bypass:** local fallback باید واقعاً local و bounded باشد.

## Sprint plan

### Sprint A — Residency policy

data classes، subject region، allowed regions، provider catalog و policy hash.

### Sprint B — Placement

region router، provider verifier، local/BYOK/free fallback و admission gate.

### Sprint C — Transfer

legal basis، safeguards، consent UI، minimization و audit disclosure.

### Sprint D — Erasure

region-aware deletion، backup/replica sweep، residual scan و evidence.

## prompt pack

### `m206-residency-engineer`

```text
نقش: Regional Data Engineer
پردازش را فقط در allowed region و provider declared اجرا کن. cross-region transfer نیازمند legal basis،
safeguards، approval، visibility و minimization است. local-first و BYOK را حفظ کن و deletion را در همه store/regionها prove کن.
```

### `m206-residency-auditor`

```text
نقش: Residency Auditor
region spoofing، replica leakage، unapproved transfer، unencrypted store و deletion residue را بررسی کن.
field region یا mock provider declaration جای network routing، encrypted storage، legal workflow و erasure evidence واقعی نیست.
```

## DoD و production evidence boundary

- placement خارج از allowlist، transfer بدون approval و deletion با residual copy deny شوند.
- regional router، provider verifier، consent/transfer gateway، encrypted stores و erasure worker متصل شوند.
- kernel M206 به‌تنهایی data residency compliance، cross-border legality، encryption یا deletion guarantee claim نیست.
