# فاز M27: Privacy-Aware Retrieval، Deletion و Local Repository Index

**وضعیت:** `designed_only`
**proposalهای هدف:** `UP-087`، `UP-088`، `UP-089`، `UP-090`
**کد kernel:** `src/core/privacy-retrieval.ts`
**تست:** `test/audit-next-phases-2.test.ts`

## هدف و مرز

M27 تشخیص PII، تصمیم redact/block، حذف propagation، ارزیابی retrieval و local-only
repository index را قرارداد می‌کند. حالت local الزاماً network را خاموش نگه می‌دارد؛
BYOK/free fallback باید با consent، privacy و budget سازگار بماند.

این فاز classifier production، vector store، deletion worker، backup erasure یا
embedding runtime را اجرا نمی‌کند. match متن raw را ذخیره نمی‌کند و نتیجه PII فقط
نوع، بازه و hash evidence را دارد.

## قراردادهای اصلی

- `classifyPii` email، phone، identity، medical و secret-like را بدون raw storage
  تشخیص می‌دهد؛ secret-like مسیر block دارد.
- `planDeletionPropagation` assetهای همان organization را به locationهای DB/index/cache/
  log/artifact/backup map می‌کند و legal hold را block می‌کند.
- `evaluateRetrieval` precision، recall و grounding را با threshold و reason گزارش می‌کند.
- `planLocalRepositoryIndex` مسیرهای امن workspace را می‌پذیرد و `networkAllowed: false`
  و `embeddingProvider: local` را hard-code می‌کند.

## sprintها

### Sprint A — PII Classification و DLP

- الگوهای فارسی/انگلیسی و false-positive review
- secret-like block و PII redact
- no raw match in log/artifact
- taint handoff به M21/M26

### Sprint B — Deletion Propagation

- asset inventory و location map
- legal hold و retention boundary
- receipt hash و tombstone
- reappearance test پس از delete در integration

### Sprint C — Retrieval Evaluation

- gold query، expected result و ACL
- precision/recall/grounding
- retrieval regression gate
- عدم ادعای کیفیت با fixture کوچک

### Sprint D — Local Repository Index

- allowed path و traversal denial
- local parser/index/embedding adapter
- network deny integration
- opt-in cloud fallback فقط با consent و policy

## Prompt pack

### `m27-privacy-retrieval-engineer`

```text
نقش: Privacy-Aware Retrieval Engineer

PII و secret را قبل از index یا egress طبقه‌بندی کن. raw content را در finding، log یا
receipt نگذار؛ فقط type، range و evidence hash ثبت کن. deletion باید همه locationها و
legal hold را نشان دهد. در local mode networkAllowed باید false بماند و fallback cloud
بدون رضایت صریح ممنوع است.
```

### `m27-retrieval-quality-gate`

```text
نقش: Retrieval Quality Gate

gold set، ACL، precision، recall و grounding را جدا گزارش کن. نتیجه aggregate نباید
tenant دیگر، داده حذف‌شده یا stale document را پنهان کند. failure را با reason و
threshold ثبت کن؛ ادعای «retrieval خوب است» بدون result evidence مجاز نیست.
```

## DoD و evidence boundary

- تست multilingual PII، secret block، legal hold، deletion location، retrieval metrics و
  path traversal اجرا شود.
- index/vector storage، classifier model، durable deletion و backup erasure در این سری
  production محسوب نمی‌شود.
- `local` به معنی مسیر deterministic و network-denied است، نه ادعای وجود Ollama یا
  embedding service واقعی.
