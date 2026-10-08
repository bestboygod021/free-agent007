# فاز M136: Policy Distribution و Configuration Drift

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/policy-drift-runtime.ts`
**تست:** `test/next-platform-hardening-phases-2.test.ts`
**gap:** `GAP-SE-14`

## هدف و مرز

M136 policy را از یک فایل static به signed bundle با expiry، target، fail mode، tenant scope و
version تبدیل می‌کند. distribution فقط وقتی مجاز است که expected policy با target یکی باشد و
active enforcement برقرار باشد. drift باید missing/stale/tampered/unauthorized را طبقه‌بندی کند و
fail-closed بماند. exception باید کوتاه‌عمر، approval-bound، rollback-ready و بدون privilege
expansion باشد. این فاز policy service، signer/KMS، config agent، fleet reconciler یا runtime
admission واقعی نیست.

## معماری و قراردادها

- `validateM136PolicyBundle`: digest، rules، signer، lifetime، target، fail mode و no-secret policy.
- `decideM136Distribution`: target expectation، tenant match و enforcement active.
- `decideM136Drift`: digest mismatch، remediation approval و fail-closed state.
- `validateM136Exception`: expiry، approver، compensating control، rollback و no privilege expansion.

fail modeهای مجاز `deny`، `read_only` و `safe_default` هستند؛ silent fallback یا exception دائمی مجاز نیست.

## sprint plan

### Sprint A — Bundle signing

policy schema، digest، signer، version، expiry و target selector.

### Sprint B — Fleet distribution

target handshake، expected/observed version، active enforcement و retry boundary.

### Sprint C — Drift detection

missing/stale/tampered/unauthorized، alert، fail-closed و evidence.

### Sprint D — Exception governance

approval، expiry، compensating control، rollback و review.

## Threat Model

- **Policy tamper:** bundle digest و signer reference لازم است.
- **Configuration drift:** observed/expected version و periodic check لازم است.
- **Fail-open outage:** explicit fail mode و enforcement active gate می‌شود.
- **Permanent exception:** expiry و rollback plan اجباری است.
- **Privilege expansion:** exception با no-privilege-expansion رد می‌شود.
- **Cross-tenant policy:** organization و tenant scope در distribution چک می‌شود.

## prompt pack

### `m136-policy-engineer`

```text
نقش: Runtime Policy Distribution Engineer

policy bundle را با digest، rules hash، signer reference، version، expiry، target kind، tenant
scope و fail mode بساز. distribution فقط با target match و active enforcement مجاز است. drift را
fail-closed ثبت کن و exception را کوتاه‌عمر، approval-bound، rollback-ready و بدون privilege expansion نگه دار.
```

### `m136-drift-auditor`

```text
نقش: Policy Drift Auditor

signature، version، target، stale/tampered drift، remediation approval، exception expiry و
compensating control را بررسی کن. mock config یا signed fixture جای policy service، fleet agent و
KMS integration واقعی نیست.
```

## DoD و production evidence boundary

- bundle، distribution، digest drift، unauthorized remediation و expired exception تست شوند.
- signed policy service، KMS/signer، fleet agent، reconciler، runtime enforcement و alert route باید integration شوند.
- kernel M136 به‌تنهایی policy authenticity، fleet convergence، fail-closed enforcement یا configuration compliance production claim نیست.
