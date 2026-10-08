# معماری

## چهار صفحه

```
┌───────────────────────────────────────────────────────────────┐
│  Control Plane                                                │
│  کاربران، سازمان‌ها، پروژه‌ها، Plan، Approval، Audit، Policy    │
│  → هرگز کد ناامن اجرا نمی‌کند                                   │
└───────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
┌───────▼──────────────────────┐   ┌────────────────▼───────────┐
│  Intelligence Plane          │   │  Integration Plane         │
│  Model Router، حافظه،         │   │  Connector SDK، OAuth،      │
│  Prompt Library، Orchestrator │   │  GitHub App، MCP، Browser  │
└───────┬──────────────────────┘   └────────────────┬───────────┘
        │                                           │
┌───────▼───────────────────────────────────────────▼───────────┐
│  Execution Plane                                              │
│  Sandbox (Docker → gVisor/Firecracker)، تست، build، preview    │
│  → هیچ دسترسی به Control Plane جز از طریق صف و رویداد          │
└───────────────────────────────────────────────────────────────┘
```

**قاعده جداسازی:** Execution Plane هیچ‌گاه مستقیم به دیتابیس Control Plane وصل
نمی‌شود. نتیجه کار را به‌صورت رویداد و artifact برمی‌گرداند. این یعنی یک Sandbox
مخرب نمی‌تواند Approval یا Audit Log را دستکاری کند.

## شکل استقرار در MVP

**Modular Monolith + Worker**، نه Microservices.

```
apps/web          Next.js 15 (App Router) — UI، SSE، BFF با tRPC
apps/worker       Node — مصرف صف BullMQ، اجرای ماشین حالت، فراخوانی مدل
apps/browser-runner  Playwright worker جداگانه، ایزوله از بقیه
packages/*        دامنه‌های مشترک
```

دلیل: سرعت توسعه، دیباگ‌پذیری، و اینکه مرزهای واقعی سیستم هنوز کشف نشده‌اند.
مرزها با `packages/` حفظ می‌شوند تا بعداً بتوان سرویس را جدا کرد بدون بازنویسی.

## جریان داده یک Run

```
کاربر → POST /v1/projects/:id/runs
      → Run در INTAKE ساخته می‌شود
      → Worker صف را مصرف می‌کند
      → Orchestrator خروجی JSON می‌دهد (guard شده با schema)
      → proposedEvent به state machine داده می‌شود
      → اگر قانونی بود: state عوض می‌شود و رویداد منتشر می‌شود
      → اگر نه: دلیل در Audit Log ثبت و به Orchestrator برگردانده می‌شود
      → UI از طریق SSE به‌روز می‌شود
```

**نکته کلیدی:** مدل هرگز مستقیم state را تغییر نمی‌دهد. این همان چیزی است که
«ایجنت حلقه بی‌نهایت می‌زند» را غیرممکن می‌کند.

## ساختار مخزن

```
forgepilot/
├── apps/
│   ├── web/                  # Next.js UI + BFF
│   ├── api/                  # REST/OpenAPI عمومی و webhook receiver
│   ├── worker/               # orchestrator runtime + state machine
│   └── browser-runner/       # Playwright worker
├── packages/
│   ├── types/                # قراردادها (همان چیزی که در src/core/types.ts است)
│   ├── config/               # eslint, tsconfig, prettier مشترک
│   ├── database/             # Prisma schema + migrations + client
│   ├── auth/                 # session، RBAC، MFA
│   ├── agent-core/           # state machine، policy engine، router، evidence
│   ├── agent-prompts/        # کتابخانه پرامپت + composer
│   ├── tool-registry/        # ثبت ابزارها و نگاشت به کانکتور
│   ├── connector-sdk/        # manifest، OAuth، token vault adapter
│   ├── policy-engine/        # قواعد ریسک و approval
│   ├── sandbox-sdk/          # قرارداد اجرای ایزوله
│   ├── redaction/            # پاک‌سازی secret
│   ├── telemetry/            # OpenTelemetry
│   └── ui/                   # کامپوننت‌های مشترک با پشتیبانی RTL
├── connectors/
│   ├── github/
│   ├── postgres/
│   ├── docker/
│   └── generic-browser/
├── infrastructure/
│   ├── docker/               # image sandbox، network policy
│   ├── k8s/                  # Jobs برای فاز بعد
│   ├── terraform/
│   └── monitoring/           # Prometheus + Grafana + alert rules
├── schema/                   # JSON Schemas
├── prompts/                  # کتابخانه پرامپت
├── docs/
├── tests/
│   ├── e2e/
│   ├── security/
│   └── fixtures/
├── prisma/schema.prisma
├── turbo.json
└── package.json
```

## پشته فنی

### نسخه اول

| لایه | انتخاب | دلیل |
|---|---|---|
| Frontend | Next.js 15، TypeScript، Tailwind، shadcn/ui، TanStack Query، next-intl | یک deployable، RTL کامل، PWA |
| ارتباط داخلی | tRPC | type-safety سرتاسری بدون codegen |
| API عمومی | REST + OpenAPI | کلاینت غیر وب و CLI |
| ORM | Prisma | schema تایپ‌شده = مدل داده قابل بررسی برای ایجنت |
| دیتابیس | PostgreSQL 16 | RLS برای multi-tenant |
| صف | Redis + BullMQ | ساده، قابل اعتماد، تأخیر و retry دارد |
| مدل محلی | Ollama | هزینه صفر، داده خارج نمی‌شود |
| Git | GitHub App | نصب per-repo، توکن کوتاه‌مدت، scope دقیق |
| Sandbox | Docker (MVP) → gVisor/Firecracker | ایزوله‌سازی مرحله‌ای |
| تست | Vitest، Playwright، axe-core، k6 | واحد، E2E، دسترسی‌پذیری، بار |
| Observability | OpenTelemetry + Prometheus | ردیابی سرتاسری یک Run |

### نسخه Production

API Gateway، Orchestrator مستقل، Temporal یا workflow engine اختصاصی برای
Runهای طولانی و قابل بازیابی، Kubernetes Jobs، Firecracker/gVisor، Vault،
pgvector برای حافظه معنایی، Object Storage برای artifact، Model Router با
حسابداری سهمیه، Connector Marketplace.

## تصمیم‌های کلیدی (ADR خلاصه)

| # | تصمیم | دلیل | هزینه |
|---|---|---|---|
| 1 | Modular Monolith نه Microservices | سرعت و دیباگ | جداسازی بعدی نیاز به انضباط دارد |
| 2 | State Machine قطعی در کد | حذف حلقه بی‌نهایت و ادعای دروغین | انعطاف مدل کمتر می‌شود |
| 3 | Policy Engine جدا از مدل | مدل نمی‌تواند مجوز خودش را زیاد کند | هر ابزار جدید نیاز به قاعده دارد |
| 4 | GitHub App نه PAT | scope دقیق، توکن کوتاه‌مدت | نیاز به نصب App توسط کاربر |
| 5 | Local-first نه cloud-first | حریم خصوصی و هزینه صفر | نیاز به سخت‌افزار کاربر |
| 6 | JSON Schema برای هر خروجی | اعتبارسنجی قبل از مصرف | پرامپت باید با schema همگام بماند |
| 7 | SSE برای MVP نه WebSocket | ساده‌تر، یک‌طرفه، کافی برای لاگ زنده | تعامل دوطرفه محدود است |
| 8 | Prisma نه SQL خام | مهاجرت برگشت‌پذیر و مدل خوانا | انعطاف کمتر در کوئری پیچیده |
| 9 | Approval با انقضا | تأیید بی‌پایان یک حفره است | نیاز به UX یادآوری |
| 10 | Prompt به‌عنوان فایل نسخه‌دار | قابل review، diff و تست | نیاز به composer |

## الگوهای شکست و بازیابی

| شکست | رفتار سیستم |
|---|---|
| مدل پاسخ نامعتبر JSON می‌دهد | guard خطا را برمی‌گرداند و یک بار repair می‌کند، سپس BLOCKED |
| سهمیه ارائه‌دهنده تمام می‌شود | Router به fallback می‌رود؛ اگر نبود، Run متوقف و دلیل اعلام می‌شود |
| Worker وسط کار می‌میرد | Run از آخرین state پایدار ادامه می‌یابد (idempotency key) |
| Sandbox timeout | Task به `needs_repair` و پس از ۳ بار به `BLOCKED` |
| Connector قطع می‌شود | Run در نزدیک‌ترین نقطه امن متوقف و از کاربر درخواست اتصال مجدد می‌شود |
| Approval منقضی می‌شود | Run در همان state می‌ماند و دوباره درخواست تأیید می‌دهد |
| Security finding بحرانی | Run در SECURITY_REVIEW قفل می‌شود |
| Deploy verification fail | توقف فوری، پیشنهاد rollback، بدون retry خودکار |
