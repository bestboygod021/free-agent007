# فاز M153: Product E2E Orchestration و Failure Containment

**وضعیت:** `designed_only` از نظر production integration
**کد kernel:** `src/core/product-e2e-orchestration-runtime.ts`
**تست:** `test/next-platform-hardening-phases-5.test.ts`
**gap:** `GAP-QA-10`

## هدف و مرز

M153 product E2E را به flow plan، deterministic step، isolated test data، cleanup، failure evidence و
bounded retry تبدیل می‌کند. plan باید scenario، steps hash، test-data hash، local fallback، tenant
isolation، approval، no-raw-secrets، determinism و cleanup داشته باشد. هر step باید order، action،
evidence، timeout و no-side-effects داشته باشد. flow run باید counts، artifacts، correlation، cleanup
و customer-impact redaction داشته باشد. failure evidence باید containment، rollback، secret purge و
bounded retry داشته باشد. این فاز browser/API runner، test tenant, artifact collector یا failure
containment controller واقعی نیست.

## معماری و قراردادها

- `validateM153Plan`: scenario، test data، fallback، tenant، approval، no-secret و determinism.
- `validateM153Step`: order، status، evidence، timeout و side-effect/tenant guards.
- `decideM153FlowRun`: counts، state، artifacts، cleanup و impact redaction.
- `validateM153Failure`: reason، containment، rollback، secret purge و retry bound.

تست data باید synthetic و isolated باشد؛ raw password، token، private key و customer data واقعی وارد E2E نمی‌شود.

## sprint plan

### Sprint A — Flow catalog

scenario registry، step graph، test data و tenant isolation.

### Sprint B — Runner

browser/API actions، timeout، evidence، correlation و deterministic replay.

### Sprint C — Cleanup

workspace/environment teardown، secret purge، artifact retention و no-customer-impact.

### Sprint D — Failure containment

bounded retry، rollback، containment، failure report و CI gate.

## Threat Model

- **Production data in tests:** synthetic data و isolated tenant اجباری است.
- **E2E side effect:** no-side-effects، approval و cleanup gate می‌شوند.
- **Secret leakage:** no-raw-secrets و purge evidence لازم است.
- **Flaky green test:** determinism، timeout و evidence hash لازم است.
- **Failure blast radius:** containment، rollback و bounded retry اجباری است.
- **Cross-tenant fixture:** tenant match و isolation probe لازم است.

## prompt pack

### `m153-product-e2e-engineer`

```text
نقش: Product E2E Orchestration Engineer

flow را با scenario، steps hash، synthetic test data، local fallback، tenant isolation، approval،
no-raw-secrets، determinism و cleanup plan بساز. stepها order، timeout، evidence، no-side-effects
و tenant match داشته باشند. failure را با containment، rollback، secret purge و bounded retry ثبت کن.
```

### `m153-e2e-auditor`

```text
نقش: Product E2E Auditor

test data، tenant isolation، determinism، step timeout، side effect، cleanup، secret purge، rollback
و retry bound را بررسی کن. green unit suite یا browser mock جای product E2E runner، isolated tenant
و failure containment واقعی نیست.
```

## DoD و production evidence boundary

- plan، step، passed/failed run، cleanup failure، secret purge و retry denial تست شوند.
- scenario runner، isolated test tenant/data، browser/API E2E، evidence collector، cleanup worker، rollback و containment باید integration شوند.
- kernel M153 به‌تنهایی product flow correctness، E2E reliability، no-data-loss یا release readiness production claim نیست.
