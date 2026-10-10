/**
 * GuidePage — راهنمای جامع و تعاملی FreeLLMAPI / free-agent007
 * Interactive, bilingual (فارسی / English) guide page.
 *
 * ---------------------------------------------------------------------------
 * این فایل کاملاً خودکفا (self-contained) است: هیچ وابستگی‌ای به فایل‌های
 * i18n پروژه، کامپوننت‌های shadcn یا ماژول‌های داخلی ندارد. تنها وابستگی‌ها:
 *   • react
 *   • lucide-react   (هر دو از قبل در client/package.json هستند)
 * و از کلاس‌های معنایی Tailwind پروژه (bg-card / text-muted-foreground / …)
 * استفاده می‌کند تا با تم روشن و تاریک هماهنگ باشد.
 *
 * نصب (دو خط):
 *   1. این فایل را کپی کنید به:  client/src/pages/GuidePage.tsx
 *   2. در client/src/App.tsx:
 *        const loadGuidePage = () => import('@/pages/GuidePage')
 *        const GuidePage = lazy(loadGuidePage)
 *        …
 *        <Route path="/guide" element={<GuidePage />} />
 *      و در صورت تمایل برای آیکن نوار بالا:
 *        { to: '/guide', labelKey: 'nav.guide' }      // یا برچسب دلخواه
 *        registerRouteLoaders({ '/guide': loadGuidePage })
 *      اگر از i18n استفاده می‌کنید، کلید nav.guide را به
 *      client/src/i18n/locales/*.json اضافه کنید ("راهنما" / "Guide").
 *
 * پیش‌فرض مسیر: /guide
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Bot,
  Bug,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Code2,
  Copy,
  Filter,
  GraduationCap,
  Info,
  Languages,
  Layers,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  Menu,
  Network,
  Plug,
  RefreshCcw,
  Rocket,
  Route,
  ScrollText,
  Search,
  Server,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Table2,
  TestTube,
  Wand2,
  X,
  Zap,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════════════════
 * Types & helpers
 * ═══════════════════════════════════════════════════════════════════════════ */

type Lang = 'fa' | 'en'
type Bi = { fa: string; en: string }

/** Short helper so content below stays readable: bi('سلام', 'Hello') */
const bi = (fa: string, en: string): Bi => ({ fa, en })

type CodeLang =
  | 'bash'
  | 'powershell'
  | 'python'
  | 'javascript'
  | 'json'
  | 'docker'
  | 'env'
  | 'sql'
  | 'text'

type CodeTab = { label: string; lang: CodeLang; code: string }

type Block =
  | { k: 'text'; text: Bi }
  | { k: 'list'; items: Bi[]; ordered?: boolean }
  | { k: 'code'; tabs?: CodeTab[]; code?: string; lang?: CodeLang; caption?: Bi }
  | { k: 'table'; head: Bi[]; rows: Bi[][]; caption?: Bi }
  | { k: 'callout'; tone: 'tip' | 'warn' | 'danger' | 'note'; title?: Bi; text: Bi }
  | { k: 'steps'; items: { title: Bi; text: Bi }[] }
  | { k: 'quiz'; q: Bi; options: Bi[]; answer: number; why: Bi }
  | { k: 'faq'; items: { q: Bi; a: Bi }[] }
  | { k: 'checklist'; id: string; items: Bi[] }
  | { k: 'matrix'; cols: Bi[]; rows: Bi[][]; notes: Bi[] }
  | { k: 'chips'; items: { label: string; title?: Bi; text: Bi; code?: string }[] }
  | { k: 'flow'; items: { title: Bi; text: Bi }[] }
  | { k: 'cards'; items: { title: Bi; text: Bi; meta?: string }[] }
  | { k: 'endpoints'; items: { m: string; p: string; d: Bi; sample?: string }[] }
  | { k: 'env'; items: { name: string; def?: string; d: Bi }[] }
  | { k: 'agents'; items: { name: string; cmd: string; url: string; wire: Bi }[] }
  | { k: 'glossary'; items: { term: string; d: Bi }[] }
  | { k: 'tools'; items: { area: Bi; names: string[]; note: Bi }[] }

type Level = 'start' | 'core' | 'pro'

type Section = {
  id: string
  cat: string
  level: Level
  title: Bi
  summary: Bi
  blocks: Block[]
}

const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(' ')

const STORE_KEY = 'freellmapi.guide.v1'

type Persisted = {
  lang: Lang
  read: string[]
  checks: Record<string, boolean[]>
  bookmarks: string[]
}

function loadState(): Persisted {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Persisted>
      return {
        lang: parsed.lang === 'en' ? 'en' : 'fa',
        read: Array.isArray(parsed.read) ? parsed.read : [],
        checks: parsed.checks && typeof parsed.checks === 'object' ? parsed.checks : {},
        bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
      }
    }
  } catch {
    /* localStorage unavailable (private mode / SSR) — fall through to defaults */
  }
  // No stored language: follow the dashboard's own locale when it is one we speak.
  let initial: Lang = 'fa'
  try {
    const stored = localStorage.getItem('freellmapi.locale')
    if (stored === 'en') initial = 'en'
  } catch {
    /* ignore */
  }
  return { lang: initial, read: [], checks: {}, bookmarks: [] }
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to the textarea path (http origins, denied permission) */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/** Flatten every translatable string of a block into one searchable line. */
function blockText(b: Block, lang: Lang): string {
  const pick = (v?: Bi) => (v ? v[lang] : '')
  switch (b.k) {
    case 'text':
      return pick(b.text)
    case 'list':
      return b.items.map(pick).join(' ')
    case 'code':
      return (
        pick(b.caption) +
        ' ' +
        (b.code ?? '') +
        ' ' +
        (b.tabs ?? []).map((t) => t.label + ' ' + t.code).join(' ')
      )
    case 'table':
      return [pick(b.caption), ...b.head.map(pick), ...b.rows.flat().map(pick)].join(' ')
    case 'callout':
      return pick(b.title) + ' ' + pick(b.text)
    case 'steps':
      return b.items.map((i) => pick(i.title) + ' ' + pick(i.text)).join(' ')
    case 'quiz':
      return [pick(b.q), ...b.options.map(pick), pick(b.why)].join(' ')
    case 'faq':
      return b.items.map((i) => pick(i.q) + ' ' + pick(i.a)).join(' ')
    case 'checklist':
      return b.items.map(pick).join(' ')
    case 'matrix':
      return [
        ...b.cols.map(pick),
        ...b.rows.flat().map(pick),
        ...b.notes.map(pick),
      ].join(' ')
    case 'chips':
      return b.items.map((i) => i.label + ' ' + pick(i.title) + ' ' + pick(i.text) + ' ' + (i.code ?? '')).join(' ')
    case 'flow':
      return b.items.map((i) => pick(i.title) + ' ' + pick(i.text)).join(' ')
    case 'cards':
      return b.items.map((i) => pick(i.title) + ' ' + pick(i.text) + ' ' + (i.meta ?? '')).join(' ')
    case 'endpoints':
      return b.items.map((i) => i.m + ' ' + i.p + ' ' + pick(i.d) + ' ' + (i.sample ?? '')).join(' ')
    case 'env':
      return b.items.map((i) => i.name + ' ' + (i.def ?? '') + ' ' + pick(i.d)).join(' ')
    case 'agents':
      return b.items.map((i) => i.name + ' ' + i.cmd + ' ' + i.url + ' ' + pick(i.wire)).join(' ')
    case 'glossary':
      return b.items.map((i) => i.term + ' ' + pick(i.d)).join(' ')
    case 'tools':
      return b.items.map((i) => pick(i.area) + ' ' + i.names.join(' ') + ' ' + pick(i.note)).join(' ')
    default:
      return ''
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Theme tokens (match the dashboard: bg-card / bg-muted / text-muted-foreground …)
 * ═══════════════════════════════════════════════════════════════════════════ */

const PANEL = 'rounded-xl border border-border bg-card text-card-foreground'
const SUBTLE = 'rounded-lg border border-border bg-muted/40'
const CHIP =
  'inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium'
const BTN =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50'
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50'

const FA_FONT =
  "'Vazirmatn','IRANSansX','Noto Sans Arabic','Segoe UI',Tahoma,system-ui,-apple-system,sans-serif"
const MONO_FONT =
  "'Geist Mono Variable',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"

/* ═══════════════════════════════════════════════════════════════════════════
 * Small primitives
 * ═══════════════════════════════════════════════════════════════════════════ */

function CopyBtn({ value, lang }: { value: string; lang: Lang }) {
  const [done, setDone] = useState(false)
  const label = lang === 'fa' ? 'کپی' : 'Copy'
  const doneLabel = lang === 'fa' ? 'شد ✓' : 'Copied'
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyText(value)
        if (!ok) return
        setDone(true)
        window.setTimeout(() => setDone(false), 1600)
      }}
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-md border border-border/60 bg-background/70 px-2 py-1 text-[11px] transition-colors hover:bg-accent',
        done && 'text-emerald-600 dark:text-emerald-400',
      )}
      aria-label={label}
    >
      {done ? <Check className="size-3" /> : <Copy className="size-3" />}
      {done ? doneLabel : label}
    </button>
  )
}

function CodeBlock({ block, lang }: { block: Extract<Block, { k: 'code' }>; lang: Lang }) {
  const tabs = block.tabs ?? [
    { label: block.lang ?? 'bash', lang: (block.lang ?? 'bash') as CodeLang, code: block.code ?? '' },
  ]
  const [active, setActive] = useState(0)
  const current = tabs[Math.min(active, tabs.length - 1)]
  return (
    <div className={cx(PANEL, 'overflow-hidden')}>
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-1">
          {tabs.length > 1 &&
            tabs.map((tb, i) => (
              <button
                key={tb.label + i}
                type="button"
                onClick={() => setActive(i)}
                className={cx(
                  'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                  i === active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {tb.label}
              </button>
            ))}
          {tabs.length === 1 && (
            <span className="px-1 font-mono text-[11px] text-muted-foreground">{current.label}</span>
          )}
        </div>
        <CopyBtn value={current.code} lang={lang} />
      </div>
      <pre
        dir="ltr"
        className="overflow-x-auto px-3 py-3 text-start text-[12px] leading-relaxed"
        style={{ fontFamily: MONO_FONT }}
      >
        <code>{current.code}</code>
      </pre>
      {block.caption && (
        <p className="border-t border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          {block.caption[lang]}
        </p>
      )}
    </div>
  )
}

const TONE = {
  tip: {
    wrap: 'border-emerald-500/30 bg-emerald-500/10',
    icon: 'text-emerald-600 dark:text-emerald-400',
    Icon: Lightbulb,
  },
  note: {
    wrap: 'border-sky-500/30 bg-sky-500/10',
    icon: 'text-sky-600 dark:text-sky-400',
    Icon: Info,
  },
  warn: {
    wrap: 'border-amber-500/35 bg-amber-500/10',
    icon: 'text-amber-600 dark:text-amber-400',
    Icon: AlertTriangle,
  },
  danger: {
    wrap: 'border-red-500/35 bg-red-500/10',
    icon: 'text-red-600 dark:text-red-400',
    Icon: ShieldAlert,
  },
} as const

function Callout({ block, lang }: { block: Extract<Block, { k: 'callout' }>; lang: Lang }) {
  const tone = TONE[block.tone]
  const Icon = tone.Icon
  return (
    <div className={cx('flex gap-3 rounded-xl border px-3.5 py-3', tone.wrap)}>
      <Icon className={cx('mt-0.5 size-4 shrink-0', tone.icon)} />
      <div className="min-w-0 space-y-1 text-sm">
        {block.title && <p className="font-semibold">{block.title[lang]}</p>}
        <p className="text-muted-foreground">{block.text[lang]}</p>
      </div>
    </div>
  )
}

function DataTable({ block, lang }: { block: Extract<Block, { k: 'table' }>; lang: Lang }) {
  return (
    <div className={cx(PANEL, 'overflow-hidden')}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-start text-sm">
          <thead>
            <tr className="bg-muted/50">
              {block.head.map((h, i) => (
                <th
                  key={i}
                  className="border-b border-border px-3 py-2 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {h[lang]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className={cx(
                      'px-3 py-2 align-top',
                      c === 0 && 'whitespace-nowrap font-medium',
                      c > 0 && 'text-muted-foreground',
                    )}
                  >
                    {cell[lang]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.caption && (
        <p className="border-t border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          {block.caption[lang]}
        </p>
      )}
    </div>
  )
}

/* ── Quiz ───────────────────────────────────────────────────────────────── */

function Quiz({ block, lang }: { block: Extract<Block, { k: 'quiz' }>; lang: Lang }) {
  const [picked, setPicked] = useState<number | null>(null)
  const correct = picked === block.answer
  return (
    <div className={cx(SUBTLE, 'space-y-3 p-3.5')}>
      <p className="flex items-start gap-2 text-sm font-semibold">
        <GraduationCap className="mt-0.5 size-4 shrink-0 text-primary" />
        {block.q[lang]}
      </p>
      <div className="space-y-1.5">
        {block.options.map((opt, i) => {
          const isPicked = picked === i
          const isAnswer = block.answer === i
          return (
            <button
              key={i}
              type="button"
              onClick={() => setPicked(i)}
              className={cx(
                'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-start text-sm transition-colors',
                !isPicked && 'border-border bg-background hover:bg-accent',
                isPicked && !correct && 'border-red-500/50 bg-red-500/10',
                isPicked && isAnswer && 'border-emerald-500/50 bg-emerald-500/10',
                picked !== null && isAnswer && !isPicked && 'border-emerald-500/40 bg-emerald-500/5',
              )}
            >
              <span
                className={cx(
                  'flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px]',
                  isPicked && isAnswer && 'border-emerald-500 bg-emerald-500 text-white',
                  isPicked && !isAnswer && 'border-red-500 bg-red-500 text-white',
                  !isPicked && 'border-border text-muted-foreground',
                )}
              >
                {isPicked ? (isAnswer ? <Check className="size-3" /> : <X className="size-3" />) : i + 1}
              </span>
              <span className="min-w-0">{opt[lang]}</span>
            </button>
          )
        })}
      </div>
      {picked !== null && (
        <p
          className={cx(
            'rounded-lg border px-3 py-2 text-[13px]',
            correct
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
          )}
        >
          {correct
            ? lang === 'fa'
              ? '✓ درست است. '
              : '✓ Correct. '
            : lang === 'fa'
              ? '✕ نه دقیقاً. '
              : '✕ Not quite. '}
          {block.why[lang]}
        </p>
      )}
    </div>
  )
}

/* ── FAQ accordion ──────────────────────────────────────────────────────── */

function Faq({ block, lang }: { block: Extract<Block, { k: 'faq' }>; lang: Lang }) {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className={cx(PANEL, 'divide-y divide-border overflow-hidden')}>
      {block.items.map((it, i) => {
        const isOpen = open === i
        return (
          <div key={i}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-start transition-colors hover:bg-accent"
              aria-expanded={isOpen}
            >
              <span className="text-sm font-medium">{it.q[lang]}</span>
              <ChevronDown
                className={cx('size-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')}
              />
            </button>
            {isOpen && (
              <div className="px-3.5 pb-3.5 text-[13px] leading-relaxed text-muted-foreground">
                {it.a[lang]}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── Checklist (persisted) ──────────────────────────────────────────────── */

function Checklist({
  block,
  lang,
  value,
  onChange,
}: {
  block: Extract<Block, { k: 'checklist' }>
  lang: Lang
  value: boolean[]
  onChange: (next: boolean[]) => void
}) {
  const done = value.filter(Boolean).length
  const pct = Math.round((done / block.items.length) * 100)
  return (
    <div className={cx(PANEL, 'overflow-hidden')}>
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-3.5 py-2">
        <span className="flex items-center gap-2 text-xs font-semibold">
          <ListChecks className="size-3.5" />
          {done} / {block.items.length}
        </span>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => onChange(block.items.map(() => false))}
          >
            {lang === 'fa' ? 'پاک‌سازی' : 'Reset'}
          </button>
        </div>
      </div>
      <ul className="divide-y divide-border/60">
        {block.items.map((item, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => {
                const next = [...value]
                next[i] = !next[i]
                onChange(next)
              }}
              className="flex w-full items-start gap-2.5 px-3.5 py-2.5 text-start text-sm transition-colors hover:bg-accent"
            >
              <span
                className={cx(
                  'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border',
                  value[i] ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                )}
              >
                {value[i] && <Check className="size-3" />}
              </span>
              <span className={cx('min-w-0', value[i] && 'text-muted-foreground line-through')}>
                {item[lang]}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── Matrix (interactive comparison) ────────────────────────────────────── */

function Matrix({ block, lang }: { block: Extract<Block, { k: 'matrix' }>; lang: Lang }) {
  const [col, setCol] = useState(0)
  return (
    <div className="space-y-3">
      <div className={cx(PANEL, 'overflow-hidden')}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="border-b border-border px-3 py-2 text-start text-xs font-semibold text-muted-foreground">
                  {lang === 'fa' ? 'معیار' : 'Criterion'}
                </th>
                {block.cols.map((c, i) => (
                  <th key={i} className="border-b border-border p-0">
                    <button
                      type="button"
                      onClick={() => setCol(i)}
                      className={cx(
                        'w-full px-3 py-2 text-xs font-semibold transition-colors',
                        i === col ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                      )}
                    >
                      {c[lang]}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 font-medium">{row[0][lang]}</td>
                  {row.slice(1).map((cell, c) => (
                    <td
                      key={c}
                      className={cx(
                        'px-3 py-2 text-center transition-colors',
                        c === col ? 'bg-primary/10 font-medium' : 'text-muted-foreground',
                      )}
                    >
                      {cell[lang]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className={cx(SUBTLE, 'flex items-start gap-2 px-3.5 py-3 text-[13px]')}>
        <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-primary" />
        <span className="text-muted-foreground">
          <strong className="text-foreground">{block.cols[col][lang]}: </strong>
          {block.notes[col][lang]}
        </span>
      </div>
    </div>
  )
}

/* ── Chips (interactive detail picker) ──────────────────────────────────── */

function Chips({ block, lang }: { block: Extract<Block, { k: 'chips' }>; lang: Lang }) {
  const [sel, setSel] = useState(0)
  const item = block.items[sel]
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {block.items.map((it, i) => (
          <button
            key={it.label}
            type="button"
            onClick={() => setSel(i)}
            className={cx(
              'rounded-full border px-3 py-1 font-mono text-[11px] transition-colors',
              i === sel
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {it.label}
          </button>
        ))}
      </div>
      <div className={cx(PANEL, 'p-3.5')}>
        {item.title && <p className="text-sm font-semibold">{item.title[lang]}</p>}
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{item.text[lang]}</p>
        {item.code && (
          <div className="mt-3 flex items-start justify-between gap-3">
            <pre
              dir="ltr"
              className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-muted px-3 py-2 text-start text-[12px]"
              style={{ fontFamily: MONO_FONT }}
            >
              <code>{item.code}</code>
            </pre>
            <CopyBtn value={item.code} lang={lang} />
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Pipeline / flow ────────────────────────────────────────────────────── */

function Flow({ block, lang }: { block: Extract<Block, { k: 'flow' }>; lang: Lang }) {
  return (
    <ol className="space-y-2">
      {block.items.map((it, i) => (
        <li key={i} className={cx(PANEL, 'flex items-start gap-3 p-3')}>
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">{it.title[lang]}</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{it.text[lang]}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

/* ── Cards grid ─────────────────────────────────────────────────────────── */

function Cards({ block, lang }: { block: Extract<Block, { k: 'cards' }>; lang: Lang }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {block.items.map((it, i) => (
        <div key={i} className={cx(PANEL, 'p-3.5')}>
          <p className="text-sm font-semibold">{it.title[lang]}</p>
          {it.meta && (
            <code
              className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
              dir="ltr"
            >
              {it.meta}
            </code>
          )}
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{it.text[lang]}</p>
        </div>
      ))}
    </div>
  )
}

/* ── Searchable table shell ─────────────────────────────────────────────── */

function SearchTable({
  lang,
  placeholder,
  count,
  children,
}: {
  lang: Lang
  placeholder: Bi
  count: number
  children: (query: string) => ReactNode
}) {
  const [q, setQ] = useState('')
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder[lang]}
            className="w-full rounded-md border border-input bg-background py-1.5 pe-3 ps-9 text-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
          />
        </div>
        <span className={CHIP}>
          <Table2 className="size-3" />
          {count} {lang === 'fa' ? 'مورد' : 'rows'}
        </span>
      </div>
      {children(q.trim().toLowerCase())}
    </div>
  )
}

/* ── Endpoints ──────────────────────────────────────────────────────────── */

const METHOD_STYLE: Record<string, string> = {
  GET: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  POST: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  PUT: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  PATCH: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  DELETE: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
}

function Endpoints({ block, lang }: { block: Extract<Block, { k: 'endpoints' }>; lang: Lang }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <SearchTable
      lang={lang}
      placeholder={bi('جست‌وجو در مسیرها… مثال: embeddings، agent، backups', 'Search routes… try: embeddings, agent, backups')}
      count={block.items.length}
    >
      {(q) => {
        const rows = block.items.filter(
          (r) => !q || r.p.toLowerCase().includes(q) || r.d[lang].toLowerCase().includes(q) || r.m.toLowerCase().includes(q),
        )
        if (!rows.length)
          return (
            <p className={cx(SUBTLE, 'px-3.5 py-6 text-center text-xs text-muted-foreground')}>
              {lang === 'fa' ? 'چیزی پیدا نشد.' : 'No match.'}
            </p>
          )
        return (
          <div className={cx(PANEL, 'divide-y divide-border overflow-hidden')}>
            {rows.map((r) => {
              const idx = block.items.indexOf(r)
              const isOpen = open === idx
              return (
                <div key={r.m + r.p}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : idx)}
                    className="flex w-full items-start gap-2.5 px-3 py-2.5 text-start transition-colors hover:bg-accent"
                  >
                    <span
                      className={cx(
                        'mt-0.5 shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold',
                        METHOD_STYLE[r.m] ?? 'border-border bg-muted',
                      )}
                    >
                      {r.m}
                    </span>
                    <span className="min-w-0 flex-1">
                      <code
                        dir="ltr"
                        className="block break-all text-start font-mono text-[12px]"
                        style={{ fontFamily: MONO_FONT }}
                      >
                        {r.p}
                      </code>
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground">
                        {r.d[lang]}
                      </span>
                    </span>
                    {r.sample && (
                      <ChevronDown
                        className={cx('mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')}
                      />
                    )}
                  </button>
                  {isOpen && r.sample && (
                    <div className="bg-muted/40 px-3 pb-3">
                      <div className="mb-1.5 flex justify-end">
                        <CopyBtn value={r.sample} lang={lang} />
                      </div>
                      <pre
                        dir="ltr"
                        className="overflow-x-auto rounded-lg bg-background px-3 py-2 text-start text-[11.5px]"
                        style={{ fontFamily: MONO_FONT }}
                      >
                        <code>{r.sample}</code>
                      </pre>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      }}
    </SearchTable>
  )
}

/* ── Environment table ──────────────────────────────────────────────────── */

function EnvTable({ block, lang }: { block: Extract<Block, { k: 'env' }>; lang: Lang }) {
  return (
    <SearchTable
      lang={lang}
      placeholder={bi('جست‌وجو در متغیرها… مثال: PORT، AGENT_، PROXY', 'Search variables… try: PORT, AGENT_, PROXY')}
      count={block.items.length}
    >
      {(q) => {
        const rows = block.items.filter(
          (r) => !q || r.name.toLowerCase().includes(q) || r.d[lang].toLowerCase().includes(q),
        )
        if (!rows.length)
          return (
            <p className={cx(SUBTLE, 'px-3.5 py-6 text-center text-xs text-muted-foreground')}>
              {lang === 'fa' ? 'چیزی پیدا نشد.' : 'No match.'}
            </p>
          )
        return (
          <div className={cx(PANEL, 'overflow-hidden')}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="border-b border-border px-3 py-2 text-start text-xs font-semibold text-muted-foreground">
                      {lang === 'fa' ? 'متغیر' : 'Variable'}
                    </th>
                    <th className="border-b border-border px-3 py-2 text-start text-xs font-semibold text-muted-foreground">
                      {lang === 'fa' ? 'پیش‌فرض' : 'Default'}
                    </th>
                    <th className="border-b border-border px-3 py-2 text-start text-xs font-semibold text-muted-foreground">
                      {lang === 'fa' ? 'توضیح' : 'What it does'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.name} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2 align-top">
                        <div className="flex items-start gap-1.5">
                          <code
                            dir="ltr"
                            className="font-mono text-[12px] font-medium"
                            style={{ fontFamily: MONO_FONT }}
                          >
                            {r.name}
                          </code>
                          <CopyBtn value={r.name} lang={lang} />
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-top">
                        <code
                          dir="ltr"
                          className="font-mono text-[11px] text-muted-foreground"
                          style={{ fontFamily: MONO_FONT }}
                        >
                          {r.def ?? '—'}
                        </code>
                      </td>
                      <td className="px-3 py-2 align-top text-[13px] leading-relaxed text-muted-foreground">
                        {r.d[lang]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      }}
    </SearchTable>
  )
}

/* ── Agents table ───────────────────────────────────────────────────────── */

function AgentsTable({ block, lang }: { block: Extract<Block, { k: 'agents' }>; lang: Lang }) {
  return (
    <SearchTable
      lang={lang}
      placeholder={bi('جست‌وجوی عامل… مثال: claude، codex، aider', 'Search agents… try: claude, codex, aider')}
      count={block.items.length}
    >
      {(q) => {
        const rows = block.items.filter((r) => !q || (r.name + r.cmd).toLowerCase().includes(q))
        if (!rows.length)
          return (
            <p className={cx(SUBTLE, 'px-3.5 py-6 text-center text-xs text-muted-foreground')}>
              {lang === 'fa' ? 'چیزی پیدا نشد.' : 'No match.'}
            </p>
          )
        return (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.name} className={cx(PANEL, 'p-3')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{r.name}</p>
                  <span className={CHIP}>
                    <Network className="size-3" />
                    {r.wire[lang]}
                  </span>
                </div>
                <div className="mt-2 flex items-start gap-2">
                  <pre
                    dir="ltr"
                    className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-muted px-3 py-2 text-start text-[11.5px]"
                    style={{ fontFamily: MONO_FONT }}
                  >
                    <code>{r.cmd}</code>
                  </pre>
                  <CopyBtn value={r.cmd} lang={lang} />
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground" dir="ltr">
                  base URL: <code className="font-mono">{r.url}</code>
                </p>
              </div>
            ))}
          </div>
        )
      }}
    </SearchTable>
  )
}

/* ── Glossary ───────────────────────────────────────────────────────────── */

function Glossary({ block, lang }: { block: Extract<Block, { k: 'glossary' }>; lang: Lang }) {
  return (
    <SearchTable
      lang={lang}
      placeholder={bi('جست‌وجو… مثال: headroom، bandit، cooldown', 'Search… try: headroom, bandit, cooldown')}
      count={block.items.length}
    >
      {(q) => {
        const rows = block.items.filter(
          (r) => !q || r.term.toLowerCase().includes(q) || r.d[lang].toLowerCase().includes(q),
        )
        if (!rows.length)
          return (
            <p className={cx(SUBTLE, 'px-3.5 py-6 text-center text-xs text-muted-foreground')}>
              {lang === 'fa' ? 'چیزی پیدا نشد.' : 'No match.'}
            </p>
          )
        return (
          <div className={cx(PANEL, 'overflow-hidden')}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.term} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                      <td className="w-[28%] px-3 py-2 align-top">
                        <code
                          dir="ltr"
                          className="font-mono text-[12px] font-semibold"
                          style={{ fontFamily: MONO_FONT }}
                        >
                          {r.term}
                        </code>
                      </td>
                      <td className="px-3 py-2 align-top text-[13px] leading-relaxed text-muted-foreground">
                        {r.d[lang]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      }}
    </SearchTable>
  )
}

/* ── Tools table (agent toolbox) ────────────────────────────────────────── */

function ToolsTable({ block, lang }: { block: Extract<Block, { k: 'tools' }>; lang: Lang }) {
  return (
    <div className={cx(PANEL, 'overflow-hidden')}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="border-b border-border px-3 py-2 text-start text-xs font-semibold text-muted-foreground">
                {lang === 'fa' ? 'حوزه' : 'Area'}
              </th>
              <th className="border-b border-border px-3 py-2 text-start text-xs font-semibold text-muted-foreground">
                {lang === 'fa' ? 'ابزارها' : 'Tools'}
              </th>
              <th className="border-b border-border px-3 py-2 text-start text-xs font-semibold text-muted-foreground">
                {lang === 'fa' ? 'نکته ایمنی / رفتار' : 'Safety note / behaviour'}
              </th>
            </tr>
          </thead>
          <tbody>
            {block.items.map((r, i) => (
              <tr key={i} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                <td className="whitespace-nowrap px-3 py-2 align-top font-medium">{r.area[lang]}</td>
                <td className="px-3 py-2 align-top">
                  <div className="flex flex-wrap gap-1">
                    {r.names.map((n) => (
                      <code
                        key={n}
                        dir="ltr"
                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]"
                        style={{ fontFamily: MONO_FONT }}
                      >
                        {n}
                      </code>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2 align-top text-[13px] leading-relaxed text-muted-foreground">
                  {r.note[lang]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Categories — the sidebar taxonomy
 * ═══════════════════════════════════════════════════════════════════════════ */

type Category = { id: string; title: Bi; Icon: typeof Rocket; blurb: Bi }

const CATEGORIES: Category[] = [
  {
    id: 'start',
    title: bi('شروع سریع', 'Getting started'),
    Icon: Rocket,
    blurb: bi('نصب، اولین راه‌اندازی، اولین درخواست', 'Install, first run, first request'),
  },
  {
    id: 'concepts',
    title: bi('مفاهیم پایه', 'Core concepts'),
    Icon: Layers,
    blurb: bi('معماری، کلید یکپارچه، زنجیره، کاتالوگ', 'Architecture, unified key, chain, catalog'),
  },
  {
    id: 'dashboard',
    title: bi('داشبورد', 'Dashboard'),
    Icon: LayoutDashboard,
    blurb: bi('گشت‌وگذار در همه صفحه‌ها', 'Every page, top to bottom'),
  },
  {
    id: 'api',
    title: bi('رابط برنامه‌نویسی (API)', 'API reference'),
    Icon: Code2,
    blurb: bi('همه مسیرها، هدرها و مثال‌ها', 'Every route, header and sample'),
  },
  {
    id: 'clients',
    title: bi('کلاینت‌ها و عامل‌ها', 'Clients & agents'),
    Icon: Plug,
    blurb: bi('Claude Code، Codex، Cline و …', 'Claude Code, Codex, Cline and more'),
  },
  {
    id: 'routing',
    title: bi('مسیریابی و سهمیه', 'Routing & quota'),
    Icon: Route,
    blurb: bi('امتیازدهی، cooldown، حالت degraded', 'Scoring, cooldowns, degraded mode'),
  },
  {
    id: 'optimize',
    title: bi('کش و فشرده‌سازی', 'Cache & compression'),
    Icon: Zap,
    blurb: bi('کاهش هزینه و تأخیر', 'Less cost, less latency'),
  },
  {
    id: 'agent',
    title: bi('هسته عامل ForgePilot', 'ForgePilot agent'),
    Icon: Bot,
    blurb: bi('۲۳ ابزار، شش دروازه، سندباکس', '23 tools, six gates, sandbox'),
  },
  {
    id: 'security',
    title: bi('امنیت و حریم داده', 'Security & privacy'),
    Icon: ShieldCheck,
    blurb: bi('رمزنگاری، سطح حمله، ToS', 'Encryption, attack surface, ToS'),
  },
  {
    id: 'ops',
    title: bi('عملیات و استقرار', 'Operations'),
    Icon: Server,
    blurb: bi('پشتیبان، به‌روزرسانی، پروکسی، لاگ', 'Backups, updates, proxy, logs'),
  },
  {
    id: 'env',
    title: bi('متغیرهای محیطی', 'Environment variables'),
    Icon: Settings2,
    blurb: bi('مرجع جست‌وجوپذیر پیکربندی', 'Searchable config reference'),
  },
  {
    id: 'trouble',
    title: bi('عیب‌یابی', 'Troubleshooting'),
    Icon: Bug,
    blurb: bi('نشانه ← علت ← درمان', 'Symptom → cause → fix'),
  },
  {
    id: 'limits',
    title: bi('محدودیت‌ها و وضعیت', 'Limits & status'),
    Icon: AlertTriangle,
    blurb: bi('چه چیزی پشتیبانی نمی‌شود', 'What is not supported'),
  },
  {
    id: 'dev',
    title: bi('توسعه و مشارکت', 'Development'),
    Icon: TestTube,
    blurb: bi('تست‌ها، مایگریشن، CI', 'Tests, migrations, CI'),
  },
  {
    id: 'glossary',
    title: bi('واژه‌نامه', 'Glossary'),
    Icon: BookOpen,
    blurb: bi('اصطلاحات کلیدی', 'Key terms'),
  },
]

const LEVELS: { id: Level; title: Bi; color: string }[] = [
  {
    id: 'start',
    title: bi('مبتدی', 'Beginner'),
    color: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  {
    id: 'core',
    title: bi('متوسط', 'Intermediate'),
    color: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  {
    id: 'pro',
    title: bi('پیشرفته', 'Advanced'),
    color: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  },
]

/* ═══════════════════════════════════════════════════════════════════════════
 * CONTENT
 * ═══════════════════════════════════════════════════════════════════════════ */

const SECTIONS: Section[] = [
  /* ─────────────────────────── START ─────────────────────────── */
  {
    id: 'what-is-it',
    cat: 'start',
    level: 'start',
    title: bi('این سیستم چیست؟', 'What is this system?'),
    summary: bi(
      'یک دروازه (gateway) سازگار با OpenAI روی ۳۴ ارائه‌دهنده رایگان + یک هسته عامل قطعی به نام ForgePilot، در یک فرایند.',
      'An OpenAI-compatible gateway over 34 free providers plus a deterministic agent kernel (ForgePilot), in one process.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'دو نیمه در یک فرایند ادغام شده‌اند. نیمهٔ اول «دروازه» است: حدود ۷.۴ میلیارد توکن در ماه، روی ۳۴ ارائه‌دهنده رایگان و ۶۳۵ نقطهٔ پایانی مدل رایگان، به همراه هر نقطهٔ دلخواه سازگار با OpenAI (chat، embedding، image، audio) — همه پشت یک API یکپارچه روی /v1. کلیدها رمزنگاری ذخیره می‌شوند، مسیریاب برای هر درخواست بهترین مدل موجود را انتخاب می‌کند، هنگام محدودیت نرخ به مدل بعدی منتقل می‌شود و مصرف هر کلید را ردیابی می‌کند تا از سقف ردیف رایگان عبور نکنید. نیمهٔ دوم «عامل» است: هستهٔ قطعی ForgePilot متصل به ۲۳ ابزار حسابرسی‌شده که کد می‌خواند، کاربرد هر نماد را پیدا می‌کند، وصله می‌نویسد، کامیت می‌گیرد، تست را درون سندباکس واقعی اجرا می‌کند و Pull Request باز می‌کند — آن هم با اعتبارنامه‌ای که مدل هرگز آن را نمی‌بیند.',
          'Two halves, merged into one process. The gateway: ~7.4 billion tokens a month across 34 free providers and 635 free model endpoints, plus any custom OpenAI-compatible chat, embedding, image or audio endpoint, behind a single /v1 API. Keys are stored encrypted, the router picks the best available model per request, fails over on rate limits, and tracks per-key usage so you stay under every free-tier cap. The agent: the ForgePilot deterministic kernel wired to 23 audited tools — it reads code, finds every use of a symbol, writes patches, commits, runs tests inside a real namespace sandbox and opens pull requests under a credential the model never sees.',
        ),
      },
      {
        k: 'flow',
        items: [
          {
            title: bi('کلاینت شما', 'Your client'),
            text: bi(
              'هر SDK یا ابزار سازگار با OpenAI؛ به جای api.openai.com به آدرس سرور خودتان اشاره می‌دهید و کلید یکپارچه freellmapi-… را می‌دهید.',
              'Any OpenAI-compatible SDK or tool. You point it at your own server instead of api.openai.com and hand it the unified freellmapi-… key.',
            ),
          },
          {
            title: bi('دروازه / مسیریاب (Express روی پورت ۳۰۰۱)', 'Gateway / router (Express on :3001)'),
            text: bi(
              'بالاترین اولویتی را برمی‌گزیند که کلیدِ سالم و زیرِ همه سقف‌های نرخ دارد؛ کلید را در حافظه رمزگشایی می‌کند؛ در ۴۲۹/۵xx آن کلید را «سرد» کرده و سراغ بعدی می‌رود.',
              'It picks the highest-priority model with a healthy key under all its rate limits, decrypts the key in memory, and on a 429/5xx cools that key down and retries the next one.',
            ),
          },
          {
            title: bi('دفتر سهمیه و سلامت', 'Quota ledger & health'),
            text: bi(
              'شمارنده‌های RPM/RPD/TPM/TPD برای هر (پلتفرم، مدل، کلید) به‌صورت درون‌حافظه‌ای با پشتیبان SQLite؛ سقف‌های گزارش‌شده از سمت ارائه‌دهنده یاد گرفته می‌شوند.',
              'In-memory RPM/RPD/TPM/TPD counters per (platform, model, key) backed by SQLite, learning each provider’s reported ceilings.',
            ),
          },
          {
            title: bi('ذخیره‌سازی', 'Storage'),
            text: bi(
              'SQLite با رمزنگاری AES-256-GCM برای کلیدها. هیچ چیز دیگری به بیرون فرستاده نمی‌شود؛ سرور کاتالوگ هرگز پرامپت، پاسخ یا کلید شما را نمی‌بیند.',
              'SQLite with AES-256-GCM envelope encryption for keys. Nothing else leaves the box; the catalog server never sees your prompts, completions or provider keys.',
            ),
          },
          {
            title: bi('هسته عامل ForgePilot', 'ForgePilot agent kernel'),
            text: bi(
              'روی /api/agent در همان فرایند. تصمیم‌ها (انتقال حالت، مجوز ابزار، انتخاب ارائه‌دهنده، پاک‌سازی راز) با کد تست‌شده گرفته می‌شود، نه با مدل.',
              'Served at /api/agent in the same process. Decisions (state transitions, tool permission, provider choice, secret scrubbing) are made by tested code, not by a model.',
            ),
          },
        ],
      },
      {
        k: 'callout',
        tone: 'tip',
        title: bi('قانون زیرین', 'The rule underneath'),
        text: bi(
          '«مدل پیشنهاد می‌دهد، کد تصمیم می‌گیرد.» هر ادعای عامل («این کار انجام شد») باید از فیلتر شواهد عبور کند؛ در غیر این صورت رد می‌شود.',
          '“The model proposes, the code decides.” Every agent claim (“this task is done”) must pass the evidence gate or it is refused.',
        ),
      },
      {
        k: 'cards',
        items: [
          {
            title: bi('دروازه', 'Gateway'),
            text: bi(
              '۷.۴B توکن/ماه · ۳۴ ارائه‌دهنده · ۴۷۴ خانواده مدل · ۶۳۵ نقطه پایانی رایگان',
              '7.4B tokens/mo · 34 providers · 474 model families · 635 free endpoints',
            ),
            meta: '/v1/*',
          },
          {
            title: bi('عامل', 'Agent'),
            text: bi(
              'هستهٔ قطعی، ۲۳ ابزار حسابرسی‌شده، ماشین حالت اجرا با ۱۹ حالت، سندباکس واقعی',
              'Deterministic kernel, 23 audited tools, 19-state run machine, a real sandbox',
            ),
            meta: '/api/agent/*',
          },
          {
            title: bi('داشبورد', 'Dashboard'),
            text: bi(
              'مدیریت کلید، زنجیره، زمین‌بازی، تحلیل p50/p95/TTFT، لاگ‌ها — به ۶۰ زبان',
              'Key management, chains, playground, p50/p95/TTFT analytics, logs — in 60 languages',
            ),
            meta: '/ → :3001',
          },
          {
            title: bi('دسکتاپ و موبایل', 'Desktop & mobile'),
            text: bi(
              'اپ منوبار ویندوز/مک/لینوکس، نصب‌کننده اندروید از طریق Termux، اپلیکیشن iOS/Android',
              'Menu-bar app for Windows/macOS/Linux, Termux install for Android, mobile apps',
            ),
            meta: 'desktop/',
          },
        ],
      },
    ],
  },

  {
    id: 'install',
    cat: 'start',
    level: 'start',
    title: bi('نصب', 'Installation'),
    summary: bi(
      'یک‌خطی با داکر، Compose، اجرای محلی از سورس، یا نصب‌کنندهٔ دسکتاپ.',
      'One-liner with Docker, Compose, local source run, or the desktop installer.',
    ),
    blocks: [
      {
        k: 'steps',
        items: [
          {
            title: bi('یک روش را انتخاب کنید', 'Pick one method'),
            text: bi(
              'داکر ساده‌ترین راه است. برای توسعه، اجرای محلی از سورس را بخواهید. برای استفادهٔ شخصی روی ویندوز/مک، نصب‌کنندهٔ دسکتاپ آسان‌تر است.',
              'Docker is the easiest path. For development you want a local source run. For personal use on Windows/macOS the desktop installer is simpler.',
            ),
          },
          {
            title: bi('در مرورگر باز کنید', 'Open it in a browser'),
            text: bi(
              'آدرس http://localhost:3001 را باز کنید، در صفحهٔ Keys کلیدهای ارائه‌دهنده را بیفزایید و کلید یکپارچه را از بالای همان صفحه بردارید.',
              'Open http://localhost:3001, add provider keys on the Keys page and grab the unified key from that page’s header.',
            ),
          },
          {
            title: bi('کلید یکپارچه را به کلاینت بدهید', 'Point your client at it'),
            text: bi(
              'base_url را روی http://localhost:3001/v1 بگذارید و از کلید freellmapi-… استفاده کنید. تمام.',
              'Set base_url to http://localhost:3001/v1 and use the freellmapi-… key. That is it.',
            ),
          },
        ],
      },
      {
        k: 'code',
        caption: bi(
          'اسکریپت نصب پوشهٔ ~/freellmapi را می‌سازد، کلید رمزنگاری تولید می‌کند، ایمیج را می‌کشد و کانتینر را بالا می‌آورد. اجرای دوباره امن است: فایل .env (و کلید رمزنگاری) حفظ می‌شود.',
          'The installer sets up ~/freellmapi, generates an encryption key, pulls the image and starts the container. Re-running is safe: your .env (and encryption key) is preserved.',
        ),
        tabs: [
          {
            label: 'Docker (یک‌خطی)',
            lang: 'bash',
            code: `curl -fsSL https://freellmapi.co/install.sh | bash

# بازنویسی پیش‌فرض‌ها در صورت نیاز:
# FREELLMAPI_DIR=~/my-dir PORT=4000 HOST_BIND=0.0.0.0 bash -c "$(curl -fsSL https://freellmapi.co/install.sh)"`,
          },
          {
            label: 'Docker Compose',
            lang: 'bash',
            code: `git clone https://github.com/tashfeenahmed/freellmapi.git
cd freellmapi

ENCRYPTION_KEY="$(openssl rand -hex 32)"
printf "ENCRYPTION_KEY=%s\\nPORT=3001\\n" "$ENCRYPTION_KEY" > .env

docker compose up -d
docker compose logs -f freellmapi        # کد راه‌اندازی اولیه اینجا چاپ می‌شود`,
          },
          {
            label: 'Compose (PowerShell)',
            lang: 'powershell',
            code: `$Bytes = New-Object Byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($Bytes)
$ENCRYPTION_KEY = -join ($Bytes | ForEach-Object { "{0:x2}" -f $_ })
"ENCRYPTION_KEY=$ENCRYPTION_KEY\`nPORT=3001" | Out-File -Encoding utf8 .env
docker compose up -d`,
          },
          {
            label: 'اجرای محلی',
            lang: 'bash',
            code: `git clone https://github.com/bestboygod021/free-agent007.git
cd free-agent007
npm install

ENCRYPTION_KEY="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
printf "ENCRYPTION_KEY=%s\\nPORT=3001\\n" "$ENCRYPTION_KEY" > .env

npm run dev          # gateway روی :3001 و داشبورد روی :5173`,
          },
          {
            label: 'دسکتاپ',
            lang: 'text',
            code: `ویندوز:  نصب‌کنندهٔ .exe از صفحهٔ Releases
مک:      .dmg برای arm64 (Apple Silicon) یا x64 (Intel) — macOS 12+
لینوکس:  AppImage / .deb / .rpm از صفحهٔ Releases
اندروید: راهنمای آزمایشی Termux در docs/en/install/02-android-termux.md`,
          },
        ],
      },
      {
        k: 'callout',
        tone: 'warn',
        title: bi('دسترسی از دستگاه دیگر', 'Reaching it from another machine'),
        text: bi(
          'به‌طور پیش‌فرض کانتینر فقط روی 127.0.0.1 منتشر می‌شود. برای دسترسی در شبکهٔ محلی (مثلاً از طریق 192.168.1.x) از HOST_BIND=0.0.0.0 استفاده کنید — فقط در شبکهٔ مورد اعتماد، چون دروازه تک‌کاربره است و تنها با کلید یکپارچه محافظت می‌شود.',
          'By default the container is published only on 127.0.0.1. To use it on your LAN (e.g. via 192.168.1.x) start with HOST_BIND=0.0.0.0 — only on a trusted network, because the gateway is single-user and guarded solely by the unified key.',
        ),
      },
      {
        k: 'faq',
        items: [
          {
            q: bi('آیا به رمز عبور نیاز دارم؟', 'Do I need a password?'),
            a: bi(
              'در اپ دسکتاپ خیر: داشبورد با یک حساب محلی پنهان وارد می‌شود. در نصب‌های سروری (Docker، یک‌خطی، npm run dev) بله — یک حساب ایمیل+رمز می‌سازید.',
              'Not for the desktop app: the dashboard signs itself in with a hidden local account. Server installs (Docker, one-liner, npm run dev) create an email + password account.',
            ),
          },
          {
            q: bi('ENCRYPTION_KEY چیست و چقدر مهم است؟', 'What is ENCRYPTION_KEY and why does it matter?'),
            a: bi(
              'کلید AES-256-GCM برای کلیدهای ارائه‌دهنده در حالت سکون. بدون آن، کلیدها قابل رمزگشایی نیستند. آن را در جای امن نگه دارید و همراه با پشتیبان‌ها نگهداری کنید (فقط تغییر دادن آن همه‌چیز را قفل می‌کند — ابتدا باید دوباره رمزنگاری کنید).',
              'The AES-256-GCM key protecting provider keys at rest. Without it the keys cannot be decrypted. Keep it safe and back it up (changing it alone locks everything — you must re-encrypt first).',
            ),
          },
          {
            q: bi('داده‌های من کجاست؟', 'Where does my data live?'),
            a: bi(
              'دسکتاپ: پوشهٔ دادهٔ هر سیستم‌عامل (ویندوز %APPDATA%\\FreeLLMAPI\\، مک ~/Library/Application Support/FreeLLMAPI/، لینوکس ~/.config/FreeLLMAPI/) که شامل freeapi.db و logs/freeapi.log است. نصب سروری: فایل .env و پایگاه داده در server/data/freeapi.db (یا مسیر FREEAPI_DB_PATH).',
              'Desktop: the per-OS data folder (Windows %APPDATA%\\FreeLLMAPI\\, macOS ~/Library/Application Support/FreeLLMAPI/, Linux ~/.config/FreeLLMAPI/) holding freeapi.db and logs/freeapi.log. Server install: the .env file plus the SQLite DB at server/data/freeapi.db (or FREEAPI_DB_PATH).',
            ),
          },
        ],
      },
    ],
  },

  {
    id: 'first-run',
    cat: 'start',
    level: 'start',
    title: bi('اولین اجرا و حساب کاربری', 'First run and your account'),
    summary: bi(
      'ساخت حساب مالک، کد راه‌اندازی یک‌بارمصرف، گرفتن توکن و کلید یکپارچه.',
      'Create the owner account, the one-time setup code, take a token and the unified key.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'در اولین اجرا، سرور یک «کد راه‌اندازی» در لاگ چاپ می‌کند و پایگاه داده را می‌سازد. اگر سرور از دستگاه‌های دیگر در دسترس باشد، ساخت نخستین حساب به آن کد نیاز دارد تا غریبه‌ای نتواند نصب تازه را تصاحب کند. از طریق API هم می‌توانید حساب را بسازید — پاسخ شامل توکن Bearer است که برای همهٔ مسیرهای /api/agent لازم است (درخواست بدون احراز هویت حتی برای health هم ۴۰۱ می‌گیرد).',
          'On first boot the server prints a one-time setup code and creates the database. If the server is reachable from other devices, creating the first account also requires that code, so a stranger cannot claim a freshly exposed install. You can also create the account through the API — the response carries a Bearer token, which every /api/agent route needs (an unauthenticated request gets 401, including health).',
        ),
      },
      {
        k: 'code',
        caption: bi(
          'ساخت حساب مالک در اولین اجرا (فقط یک‌بار). توکن برگشتی را برای فراخوانی‌های /api/agent نگه دارید.',
          'Create the owner account on first run (once only). Keep the returned token for /api/agent calls.',
        ),
        tabs: [
          {
            label: 'ساخت حساب',
            lang: 'bash',
            code: `curl -X POST localhost:3001/api/auth/setup \\
  -H 'content-type: application/json' \\
  -d '{"email":"you@example.com","password":"a-long-password"}'`,
          },
          {
            label: 'ورود / گرفتن توکن',
            lang: 'bash',
            code: `TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \\
  -H 'Content-Type: application/json' \\
  -d '{"email":"you@example.com","password":"your-password"}' \\
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

echo $TOKEN`,
          },
          {
            label: 'کلید یکپارچه',
            lang: 'bash',
            code: `# کلید یکپارچه با نشست داشبورد خوانده می‌شود (نه با کلید /v1):
curl -s localhost:3001/api/settings/api-key \\
  -H "Authorization: Bearer $TOKEN"
# -> {"apiKey":"freellmapi-..."}`,
          },
        ],
      },
      {
        k: 'callout',
        tone: 'note',
        text: bi(
          'دو نوع اعتبار دارید: (۱) کلید یکپارچهٔ freellmapi-… برای مسیرهای /v1 — این همان چیزی است که به SDK و عامل‌های کدنویسی می‌دهید. (۲) توکن نشست داشبورد برای مسیرهای /api — این را در مرورگر دارید و برای مدیریت استفاده می‌شود.',
          'You hold two kinds of credential: (1) the unified freellmapi-… key for /v1 routes — that is what you hand to SDKs and coding agents. (2) the dashboard session token for /api routes — that is what the browser uses for administration.',
        ),
      },
      {
        k: 'faq',
        items: [
          {
            q: bi('رمز داشبورد را فراموش کردم', 'I forgot my dashboard password'),
            a: bi(
              'در صفحهٔ ورود روی «Forgot password?» و سپس «Send reset code» بزنید. ایمیلی در کار نیست، پس کد یک‌بارمصرف در لاگ سرور چاپ می‌شود (docker compose logs -f freellmapi یا ترمینال یا فایل لاگ دسکتاپ). کد ۱۵ دقیقه اعتبار دارد و درخواستِ کد جدید، قبلی را باطل می‌کند.',
              'Click “Forgot password?” then “Send reset code”. There is no email delivery, so the one-time code is printed to the server log (docker compose logs -f freellmapi, your terminal, or the desktop log file). The code lasts 15 minutes and requesting a new one invalidates the previous.',
            ),
          },
          {
            q: bi('کد راه‌اندازی کجا چاپ می‌شود؟', 'Where is the setup code printed?'),
            a: bi(
              'در خروجی سرور هنگام بالا آمدن، تا زمانی که هیچ حسابی وجود ندارد. برای داکر: docker compose logs -f freellmapi. برای دسکتاپ: منوی سینی ← Open Logs Folder ← freeapi.log.',
              'In the server output at startup, while no account exists. Docker: docker compose logs -f freellmapi. Desktop: tray menu → Open Logs Folder → freeapi.log.',
            ),
          },
        ],
      },
    ],
  },

  {
    id: 'first-steps',
    cat: 'start',
    level: 'start',
    title: bi('چک‌لیستِ سه‌قدمیِ شروع', 'The three-step startup checklist'),
    summary: bi(
      'افزودن کلید ← مرتب‌کردن زنجیره ← ارسال اولین درخواست.',
      'Add a key → order the chain → send the first request.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'یک نصب تازه با جدول مسیریابی خالی بالا می‌آید و هیچ سرنخی دربارهٔ قدم بعدی نمی‌دهد. این سه قدم همان چیزی است که دروازه را واقعاً مفید می‌کند — چک‌لیست زیر وضعیت را در مرورگر شما به خاطر می‌سپارد.',
          'A fresh install boots with an empty routing table and no hint of what to do next. These three steps are what make the router genuinely useful — the checklist below remembers its state in your browser.',
        ),
      },
      {
        k: 'checklist',
        id: 'first-steps',
        items: [
          bi(
            'دست‌کم یک کلید ارائه‌دهنده در صفحهٔ Keys اضافه کنید (Google / Groq / Cerebras شروع‌های خوبی هستند).',
            'Add at least one provider key on the Keys page (Google / Groq / Cerebras are good starts).',
          ),
          bi(
            'زنجیرهٔ Fallback را مرتب کنید: سریع‌ترین/بهترین مدل بالا، مدل‌های پشتیبان بعد از آن.',
            'Order the Fallback chain: your fastest/best model first, backups after it.',
          ),
          bi(
            'کلید یکپارچهٔ freellmapi-… را از بالای صفحهٔ Keys کپی کنید.',
            'Copy the unified freellmapi-… key from the Keys page header.',
          ),
          bi(
            'با دکمهٔ Test در صفحهٔ Keys یا یک درخواست curl سلامت را بررسی کنید.',
            'Verify health with the Test button on the Keys page or a curl request.',
          ),
          bi(
            'اولین درخواست را بفرستید و هدر X-Routed-Via را نگاه کنید تا ببینید چه کسی پاسخ داد.',
            'Send the first request and read the X-Routed-Via header to see who answered.',
          ),
          bi(
            'یک کلاینت واقعی وصل کنید: npx freellmapi setup-claude --url http://localhost:3001',
            'Connect a real client: npx freellmapi setup-claude --url http://localhost:3001',
          ),
        ],
      },
      {
        k: 'callout',
        tone: 'tip',
        text: bi(
          'همان کلید یکپارچه را می‌توانید به چند ابزار مختلف بدهید و برای هر کدام زنجیرهٔ متفاوتی انتخاب کنید: کافی است در فیلد model بنویسید auto:coding یا auto:fast.',
          'The same unified key can serve several tools, each on a different chain: just put auto:coding or auto:fast in the model field.',
        ),
      },
    ],
  },

  {
    id: 'first-request',
    cat: 'start',
    level: 'start',
    title: bi('اولین درخواست', 'Your first request'),
    summary: bi(
      'یک فراخوانی ساده از طریق Python، Node، curl یا Anthropic SDK؛ به همراه استریم.',
      'One simple call from Python, Node, curl or the Anthropic SDK — plus streaming.',
    ),
    blocks: [
      {
        k: 'code',
        caption: bi(
          'model را روی auto بگذارید تا مسیریاب انتخاب کند، یا نام مدل مشخصی بدهید. هدر پاسخ X-Routed-Via نشان می‌دهد کدام ارائه‌دهنده واقعاً پاسخ داده است.',
          'Set model to "auto" to let the router pick, or name a model. The X-Routed-Via response header tells you which provider actually served it.',
        ),
        tabs: [
          {
            label: 'Python',
            lang: 'python',
            code: `from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3001/v1",
    api_key="freellmapi-your-unified-key",
)

resp = client.chat.completions.create(
    model="auto",   # یا "gemini-2.5-flash" و غیره
    messages=[{"role": "user", "content": "سقوط روم را در یک جمله خلاصه کن."}],
)
print(resp.choices[0].message.content)
print("Routed via:", resp.headers.get("x-routed-via"))`,
          },
          {
            label: 'Node',
            lang: 'javascript',
            code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:3001/v1",
  apiKey: "freellmapi-your-unified-key",
});

const res = await client.chat.completions.create({
  model: "auto:fast",
  messages: [{ role: "user", content: "Write a haiku about SQLite." }],
  stream: true,
});

for await (const chunk of res) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`,
          },
          {
            label: 'curl',
            lang: 'bash',
            code: `curl http://localhost:3001/v1/chat/completions \\
  -H "Authorization: Bearer freellmapi-your-unified-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "hi"}]
  }' -i`,
          },
          {
            label: 'Anthropic SDK',
            lang: 'python',
            code: `import anthropic

client = anthropic.Anthropic(
    base_url="http://localhost:3001",   # ریشهٔ سرور؛ خودش /v1/messages را می‌چسباند
    api_key="freellmapi-your-unified-key",
)
msg = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=256,
    messages=[{"role": "user", "content": "hi"}],
)
print(msg.content[0].text)`,
          },
        ],
      },
      {
        k: 'callout',
        tone: 'note',
        text: bi(
          'مدل‌های Claude روی تب Keys → Anthropic نگاشت می‌شوند: هر خانواده (default، opus، sonnet، haiku) یا به auto می‌رود یا به مدلی که خودتان پین کنید.',
          'Claude model names map to your free pool on the Keys → Anthropic tab: each family (default, opus, sonnet, haiku) routes to auto or to a model you pin.',
        ),
      },
      {
        k: 'quiz',
        q: bi(
          'اگر درخواستی با model=auto بفرستید و پاسخ با X-Routed-Via: groq/llama-3.3-70b برگردد، چه اتفاقی افتاده است؟',
          'You send model=auto and the response carries X-Routed-Via: groq/llama-3.3-70b. What happened?',
        ),
        options: [
          bi('درخواست به OpenAI رفته و برگشته است.', 'The request went to OpenAI and came back.'),
          bi('مسیریاب مدلی را از زنجیره انتخاب کرده و Groq پاسخ داده است.', 'The router picked a model from the chain and Groq served it.'),
          bi('کلید نامعتبر بوده و پیام خطاست.', 'The key was invalid and this is an error message.'),
        ],
        answer: 1,
        why: bi(
          'X-Routed-Via همیشه نشان می‌دهد کدام ارائه‌دهنده/مدل واقعاً پاسخ داده است. اگر جابه‌جایی بین ارائه‌دهنده‌ها رخ داده باشد، X-Fallback-Attempts و X-Fallback-Trail هم اضافه می‌شوند.',
          'X-Routed-Via always names the provider/model that actually served the call. If the request hopped between providers, X-Fallback-Attempts and X-Fallback-Trail appear as well.',
        ),
      },
    ],
  },

  /* ─────────────────────────── CONCEPTS ─────────────────────────── */
  {
    id: 'concept-keys',
    cat: 'concepts',
    level: 'start',
    title: bi('کلید یکپارچه در برابر کلیدهای ارائه‌دهنده', 'Unified key vs provider keys'),
    summary: bi(
      'یک Bearer به بیرون می‌دهید؛ تعداد زیادی کلید رمزنگاری‌شده در داخل نگه می‌دارید.',
      'One bearer token goes out; many encrypted keys stay inside.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'کلیدهای ارائه‌دهنده با AES-256-GCM در SQLite رمزنگاری می‌شوند و فقط در حافظه و برای همان درخواست رمزگشایی می‌شوند. برنامه‌های شما تنها یک کلید یکپارچه با پیشوند freellmapi- می‌بینند. این یعنی چرخش، لغو یا جایگزینی یک ارائه‌دهنده هیچ تغییری در سمت کلاینت لازم ندارد.',
          'Provider keys are AES-256-GCM encrypted in SQLite and decrypted in memory per request. Your apps only ever see a single unified freellmapi- bearer token. Rotating, revoking or replacing a provider therefore requires no client-side change at all.',
        ),
      },
      {
        k: 'table',
        head: [bi('نوع', 'Kind'), bi('کجا استفاده می‌شود', 'Used where'), bi('قالب / مثال', 'Shape')],
        rows: [
          [
            bi('کلید ارائه‌دهنده', 'Provider key'),
            bi('فقط داخل سرور؛ در صفحهٔ Keys نگهداری می‌شود', 'Inside the server only; managed on the Keys page'),
            bi('رمزنگاری‌شده در SQLite', 'Encrypted in SQLite'),
          ],
          [
            bi('کلید یکپارچه', 'Unified key'),
            bi('همهٔ مسیرهای /v1 برای SDKها و عامل‌ها', 'Every /v1 route, for SDKs and agents'),
            bi('freellmapi-…', 'freellmapi-…'),
          ],
          [
            bi('توکن نشست داشبورد', 'Dashboard session token'),
            bi('مسیرهای管理 /api/*', 'Admin /api/* routes'),
            bi('Bearer از /api/auth/login', 'Bearer from /api/auth/login'),
          ],
          [
            bi('توکن URL قابل‌لغو', 'Revocable URL token'),
            bi('برای ابزارهایی که فقط پایهٔ URL را می‌پذیرند', 'For tools that accept only a base URL'),
            bi('/v1/t/:token/…', '/v1/t/:token/…'),
          ],
          [
            bi('پروفایل کلاینت', 'Client profile'),
            bi('اعتبار جداگانه برای هر کلاینت متصل', 'Separate credential per connected client'),
            bi('ساخته‌شده در تب API key', 'Created on the API-key tab'),
          ],
        ],
      },
      {
        k: 'callout',
        tone: 'tip',
        title: bi('کلیدهای URL قابل‌لغو', 'Revocable URL tokens'),
        text: bi(
          'برخی ابزارها فقط «پایهٔ URL» می‌گیرند و اجازهٔ ارسال هدر Authorization را نمی‌دهند. برای این‌ها یک توکن URL بسازید و از /v1/t/<token>/chat/completions استفاده کنید؛ هر زمان خواستید همان توکن را باطل کنید بدون آنکه کلید یکپارچه تغییر کند.',
          'Some tools accept only a base URL and cannot send an Authorization header. For those, mint a URL token and use /v1/t/<token>/chat/completions; revoke that one token later without touching the unified key.',
        ),
      },
    ],
  },

  {
    id: 'concept-chain',
    cat: 'concepts',
    level: 'core',
    title: bi('زنجیرهٔ جایگزینی و پروفایل‌ها', 'Fallback chain & profiles'),
    summary: bi(
      'ترتیبِ تلاش، زنجیره‌های نام‌دار و مدلِ مجازی auto:<name>.',
      'The attempt order, named chains, and the auto:<name> virtual model.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          '«زنجیره» همان ترتیب اولویت است: مسیریاب از بالا شروع می‌کند و اولین مدلی را برمی‌گزیند که کلیدِ سالم و زیرِ سقف‌های نرخ دارد. اگر آن مدل ۴۲۹ یا ۵xx بدهد، کلید «سرد» می‌شود و مسیریاب سراغ بعدی می‌رود. زنجیره‌ها نام دارند (پروفایل): مثلاً یک زنجیره برای کدنویسی و یکی برای بینایی؛ هر کدام را می‌توان از داشبورد یا هر درخواست با auto:<name> انتخاب کرد.',
          'The chain is the priority order: the router starts at the top and picks the first model with a healthy key under all its rate limits. On a 429 or 5xx that key is cooled down and the router moves to the next. Chains are named (profiles) — a coding chain, a vision chain — and you can switch them from the dashboard or per request with auto:<name>.',
        ),
      },
      {
        k: 'callout',
        tone: 'warn',
        title: bi('زنجیرهٔ خالی یعنی خطای ۴۰۰ معتبر', 'An empty chain is an authoritative 400'),
        text: bi(
          'اگر زنجیرهٔ فعال هیچ مدل فعالی نداشته باشد، دروازه ۴۰۰ «active chain is empty» برمی‌گرداند و بی‌سر و صدا به کل کاتالوگ برنمی‌گردد. راه حل: در صفحهٔ Fallback مدل‌ها را فعال کنید، یا profiles.auto_include_new_models=1 را تنظیم کنید، یا پروفایل فعال را عوض کنید.',
          'If the active chain has no enabled models the gateway returns 400 “active chain is empty” instead of silently falling back to the catalog. Fix it on the Fallback page, set profiles.auto_include_new_models=1, or switch the active profile.',
        ),
      },
      {
        k: 'code',
        caption: bi(
          'یک کلید، چند زنجیره: با auto:<profile> ابزارهای مختلف از زنجیره‌های متفاوت عبور می‌کنند.',
          'One key, many chains: auto:<profile> sends different tools down different chains.',
        ),
        code: `curl http://localhost:3001/v1/chat/completions \\
  -H "Authorization: Bearer freellmapi-..." -H "Content-Type: application/json" \\
  -d '{"model":"auto:coding","messages":[{"role":"user","content":"binary search in Rust"}]}'

# نام پروفایل ناشناس => خطای 400 واضح (و نه سقوط خاموش روی auto)`,
        lang: 'bash',
      },
      {
        k: 'list',
        items: [
          bi('مدل‌های تکراری روی چند ارائه‌دهنده در یک مدخل یکپارچه ادغام می‌شوند و جایگزینیِ سختِ درون‌گروهی دارند.', 'The same model on several providers collapses into one unified entry with strict in-group failover.'),
          bi('زنجیره‌های سفارشی را می‌توان از مدیر زنجیره در محل تغییر نام داد.', 'Custom chains can be renamed in place from the chain manager.'),
          bi('مدل‌های جدید می‌توانند به‌طور خودکار به زنجیره افزوده شوند (auto_include_new_models).', 'New models can join a chain automatically (auto_include_new_models).'),
          bi('همگام‌سازی کاتالوگ، زنجیره‌های نام‌دار را هم پر می‌کند.', 'Catalog sync backfills named chains too.'),
        ],
      },
    ],
  },

  {
    id: 'concept-catalog',
    cat: 'concepts',
    level: 'core',
    title: bi('کاتالوگ مدل‌ها و همگام‌سازی', 'Model catalog & sync'),
    summary: bi(
      'فید امضاشده، تفاوت نصب رایگان و پریمیوم، و معنای execution_status.',
      'The signed feed, free vs premium freshness, and what execution_status means.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'مسیریاب کاتالوگ مدل‌ها را خودش به‌روز می‌کند: دو بار در روز یک کاتالوگ امضاشده از freellmapi.co می‌گیرد و مدل‌های جدید، تغییرات سهمیه و رفع اشکالات سازگاری را روی پایگاه دادهٔ محلی اعمال می‌کند. انتخاب‌های فعال/غیرفعال شما و ارائه‌دهندگان سفارشی هرگز دست نمی‌خورند و هر بارگیری پیش از اعمال، با کلید Ed25519 پین‌شده بررسی می‌شود. کاتالوگ فعلی شامل ۳۴ ارائه‌دهنده، ۴۷۴ خانواده مدل و ۶۳۵ نقطهٔ پایانی رایگان (۵۸۴ چت، ۴۱ embedding، ۷ رونویسی، ۳ ویدئو) است.',
          'The router updates its own catalog: twice a day it pulls a signed catalog from freellmapi.co and applies new models, quota changes and provider quirk fixes to your local DB. Your enable/disable choices and custom providers are never touched, and every download is verified against a pinned Ed25519 key before it is applied. The catalog currently tracks 34 providers, 474 model families and 635 free endpoints (584 chat, 41 embeddings, 7 transcription, 3 video).',
        ),
      },
      {
        k: 'matrix',
        cols: [bi('رایگان (فید ماهانه)', 'Free (monthly feed)'), bi('پریمیوم (فید زنده)', 'Premium (live feed)')],
        rows: [
          [bi('تأخیر رسیدن مدل جدید', 'New-model delay'), bi('۳۰ روز پس از ورود به فید زنده', '30 days after it joins the live feed'), bi('همان روز', 'Same day')],
          [bi('سهمیه و رفع اشکال', 'Quota & quirk fixes'), bi('حدود ۳۰ روز عقب‌تر', 'About 30 days behind'), bi('همان روز', 'Same day')],
          [bi('تعداد مدل‌های در دسترس', 'Models available today'), bi('حدود ۳۰۳ مدل کمتر', 'Around 303 models fewer'), bi('کل فهرست', 'The whole list')],
          [bi('قیمت', 'Price'), bi('رایگان', 'Free'), bi('۱۹ دلار/سال یا ۴۹ دلار یک‌باره', '$19/yr or $49 once')],
        ],
        notes: [
          bi(
            'هیچ چیز منقضی یا ناقص نمی‌شود — فقط دیرتر می‌رسد. نصب رایگان برای استفادهٔ شخصی کاملاً کافی است.',
            'Nothing expires and nothing is crippled — it just arrives later. The free build is perfectly usable for personal work.',
          ),
          bi(
            'یک کلید fla_ همهٔ دروازه‌های شما را پوشش می‌دهد: دسکتاپ، هوم‌لب، رزبری‌پای. فعال‌سازی از صفحهٔ Premium. خودِ مسیریاب همیشه MIT و رایگان می‌ماند.',
            'One fla_ key covers every router you run: desktop, homelab, Raspberry Pi. Activate it on the Premium page. The router itself stays MIT-licensed and free forever.',
          ),
        ],
      },
      {
        k: 'table',
        head: [bi('execution_status', 'execution_status'), bi('معنا', 'Meaning')],
        rows: [
          [
            bi('ready', 'ready'),
            bi(
              'دست‌کم یک کلید می‌تواند همین الان پاسخ بدهد: فعال، سالم یا هنوز بررسی‌نشده، حذف‌نشده از اسکوپ، در دورهٔ سردشدن نیست و داخل پنجرهٔ نرخ/توکن است.',
              'At least one key can serve it right now: enabled, healthy or not yet probed, not scoped away, not on a rate-limit cooldown and inside its rate/token windows.',
            ),
          ],
          [
            bi('needsKey', 'needsKey'),
            bi('مدل غیرفعال است یا هیچ کلید فعالی با آن تطابق ندارد.', 'The model is disabled, or no enabled key matches it.'),
          ],
          [
            bi('exhausted', 'exhausted'),
            bi(
              'کلیدها با مدل تطابق دارند اما همه همین لحظه مسدودند — وضعیتی که انفجار ۴۲۹ها می‌سازد و با پایان دورهٔ سردشدن خودبه‌خود برطرف می‌شود.',
              'Keys match but every one is blocked at this moment — the state a burst of 429s produces, clearing on its own when cooldowns expire.',
            ),
          ],
        ],
        caption: bi(
          'هر مدخل کاتالوگ یک execution_status دارد: پاسخ زنده به این پرسش که «آیا همین الان یک درخواست جواب می‌دهد؟». با ?execution_status=ready فهرست را فیلتر کنید.',
          'Every catalog entry carries execution_status — a live answer to “would a request work right now?”. Filter the list with ?execution_status=ready.',
        ),
      },
      {
        k: 'code',
        lang: 'bash',
        code: `# همهٔ کاتالوگ (از جمله مدل‌هایی که هنوز قابل فراخوانی نیستند)
curl "http://localhost:3001/v1/models" -H "Authorization: Bearer freellmapi-..."

# فقط مدل‌هایی که همین الان پاسخ می‌دهند
curl "http://localhost:3001/v1/models?execution_status=ready" \\
  -H "Authorization: Bearer freellmapi-..."

# معادل‌های available: ?available=true | ?connected=true | ?ready=true`,
      },
    ],
  },

  {
    id: 'concept-providers',
    cat: 'concepts',
    level: 'start',
    title: bi('ارائه‌دهنده‌ها و ارائه‌دهندهٔ سفارشی', 'Providers and custom endpoints'),
    summary: bi(
      '۳۴ ارائه‌دهندهٔ رایگان + هر نقطهٔ پایانی سازگار با OpenAI که خودتان دارید.',
      '34 free providers plus any OpenAI-compatible endpoint you run yourself.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'ارائه‌دهنده‌های اصلی شامل Google، Groq، Cerebras، OpenCode Zen، Mistral، OpenRouter، Cloudflare، Cohere، Z.ai (Zhipu)، NVIDIA، HuggingFace و ModelScope هستند — به‌علاوه بیش از ۲۲ ارائه‌دهندهٔ رایگان دیگر. فهرست کامل و همیشه به‌روز با سقف نرخ، پنجرهٔ زمینه و بودجهٔ توکن رایگان در freellmapi.co/models است.',
          'Headline providers include Google, Groq, Cerebras, OpenCode Zen, Mistral, OpenRouter, Cloudflare, Cohere, Z.ai (Zhipu), NVIDIA, HuggingFace and ModelScope — plus 22 more free providers. The full, always-current list with per-model rate limits, context windows and free-token budgets lives at freellmapi.co/models.',
        ),
      },
      {
        k: 'callout',
        tone: 'tip',
        title: bi('ارائه‌دهندهٔ سفارشی (custom)', 'The custom provider'),
        text: bi(
          'می‌توانید مدل‌های chat، embedding، image یا audio را به هر نقطهٔ پایانی سازگار با OpenAI اشاره دهید: llama.cpp، LM Studio، vLLM، Ollamaی محلی یا یک دروازهٔ راه‌دور — همه از صفحهٔ Keys. برای Ollama داخل داکر یادتان باشد که 127.0.0.1 درون کانتینر خودِ کانتینر است؛ از host.docker.internal استفاده کنید.',
          'You can point chat, embedding, image or audio models at any OpenAI-compatible endpoint — llama.cpp, LM Studio, vLLM, a local Ollama or a remote gateway — all from the Keys page. For Ollama under Docker, remember 127.0.0.1 inside the container is the container itself; use host.docker.internal.',
        ),
      },
      {
        k: 'table',
        head: [bi('ارائه‌دهنده', 'Provider'), bi('وضعیت ToS (مای ۲۰۲۶)', 'ToS verdict (May 2026)')],
        rows: [
          [bi('Google Gemini', 'Google Gemini'), bi('⚠️ احتیاط — محدوده به «مقاصد حرفه‌ای یا تجاری، نه مصرف‌کننده» باریک شده است', '⚠️ Caution — scope narrowed to “professional or business purposes, not consumer use”')],
          [bi('Groq', 'Groq'), bi('✅ احتمالاً مجاز', '✅ Likely OK')],
          [bi('Cerebras', 'Cerebras'), bi('✅ مجاز؛ فروش/انتقال کلید ممنوع', '✅ Permitted; reselling/transferring keys forbidden')],
          [bi('Mistral', 'Mistral'), bi('✅ استفادهٔ شخصی/داخلی مجاز', '✅ Personal/internal business use allowed')],
          [bi('OpenRouter', 'OpenRouter'), bi('✅ پروکسی تک‌کاربرهٔ خصوصی مشکلی ندارد', '✅ Private single-user proxy is fine')],
          [bi('Cloudflare Workers AI', 'Cloudflare Workers AI'), bi('⚠️ مبهم — بدون بند ضدِ پروکسی', '⚠️ Ambiguous — no anti-proxy clause')],
          [bi('NVIDIA NIM', 'NVIDIA NIM'), bi('⚠️ احتیاط — «فقط ارزیابی، نه تولید»', '⚠️ Caution — “evaluation only, not production”')],
          [bi('GitHub Models', 'GitHub Models'), bi('⚠️ احتیاط — محدود به آزمایش و نمونه‌سازی', '⚠️ Caution — scoped to experimentation and prototyping')],
          [bi('Cohere', 'Cohere'), bi('❌ پرهیز — مصارف شخصی/خانگی ممنوع است', '❌ Avoid — personal/household use forbidden')],
          [bi('Zhipu (open.bigmodel.cn)', 'Zhipu'), bi('✅ کاربری پژوهشی شخصی/غیرتجاری مجاز', '✅ Personal/non-commercial research carve-out')],
        ],
        caption: bi(
          'خلاصهٔ بازبینی شرایط خدمات برای یک استقرار شخصی تک‌کاربره. این مشاورهٔ حقوقی نیست.',
          'Summary of the Terms-of-Service review for a self-hosted, single-user personal setup. Not legal advice.',
        ),
      },
    ],
  },

  /* ─────────────────────────── DASHBOARD ─────────────────────────── */
  {
    id: 'dash-map',
    cat: 'dashboard',
    level: 'start',
    title: bi('نقشهٔ داشبورد', 'Dashboard map'),
    summary: bi(
      'هر صفحه کجاست و چه کاری انجام می‌دهد.',
      'Where every page lives and what it is for.',
    ),
    blocks: [
      {
        k: 'cards',
        items: [
          {
            title: bi('مدل‌ها', 'Models'),
            text: bi(
              'جدول مدل‌های چت با امتیاز سرعت/قابلیت/قابلیت‌اطمینان، به همراه تب‌های Embeddings، Image، Video، Audio و Fusion.',
              'The chat model table with live speed/capability/reliability scores, plus Embeddings, Image, Video, Audio and Fusion tabs.',
            ),
            meta: '/models/chat',
          },
          {
            title: bi('زمین‌بازی', 'Playground'),
            text: bi('گفت‌وگو، تنظیمات نمونه‌برداری، پیوست‌ها و پنل خروجی در کنار هم.', 'Chat, sampling settings, attachments and an output panel side by side.'),
            meta: '/playground',
          },
          {
            title: bi('کلیدها', 'Keys'),
            text: bi(
              'پنج تب: ارائه‌دهنده‌ها، سیگنال‌های سهمیه، کلید یکپارچه، نگاشت Anthropic و سازگاری با عامل‌ها.',
              'Five tabs: providers, quota signals, the unified key, the Anthropic map and agent compatibility.',
            ),
            meta: '/keys',
          },
          {
            title: bi('عامل‌ها', 'Agents'),
            text: bi('کارت‌های آماده برای اتصال هر عامل کدنویسی به همراه دستور و کلید.', 'Ready-made cards for connecting each coding agent, with commands and the key.'),
            meta: '/agents',
          },
          {
            title: bi('جایگزینی (Fallback)', 'Fallback'),
            text: bi('ساخت، تغییر نام، مرتب‌سازی و فعال‌سازی زنجیره‌ها و پروفایل‌ها.', 'Create, rename, reorder and activate chains and profiles.'),
            meta: '/models/fallback',
          },
          {
            title: bi('تحلیل‌ها', 'Analytics'),
            text: bi('p50/p95/TTFT، تفکیک بر اساس مدل/کلید/پلتفرم/کلاینت، بازه‌های ۲۴ ساعت تا ۹۰ روز.', 'p50/p95/TTFT, breakdowns by model/key/platform/client, 24h–90d windows.'),
            meta: '/analytics',
          },
          {
            title: bi('لاگ‌ها', 'Logs'),
            text: bi('گزارش‌های درخواست و لاگ سرور برای یافتن سریع خطاها.', 'Request reports and server logs for fast error hunts.'),
            meta: '/logs',
          },
          {
            title: bi('فورج‌پایلوت', 'ForgePilot'),
            text: bi('نمای فقط‌خواندنیِ تصمیم‌های هستهٔ عامل: حالت محاسباتی، بودجه، دروازه‌ها، حالت‌ها و کتابخانهٔ پرامپت.', 'A read-only view of the kernel’s decisions: compute mode, budget, gates, states and the prompt library.'),
            meta: '/forgepilot',
          },
          {
            title: bi('پریمیوم', 'Premium'),
            text: bi('فعال‌سازی فید زندهٔ کاتالوگ و مدیریت اشتراک.', 'Activate the live catalog feed and manage billing.'),
            meta: '/premium',
          },
        ],
      },
      {
        k: 'callout',
        tone: 'tip',
        title: bi('دو میان‌بر مفید', 'Two shortcuts worth learning'),
        text: bi(
          'پالت فرمان (جست‌وجو در صفحه‌ها و عمل‌ها) و تنظیمات (تم روشن/تاریک، زبان، فشرده‌سازی، کش). داشبورد به ۶۰ زبان از جمله فارسی در دسترس است و در زبان‌های راست‌به‌چپ آینه می‌شود.',
          'The command palette (search pages and actions) and Settings (light/dark theme, language, compression, cache). The dashboard ships in 60 languages including Persian, and mirrors for right-to-left locales.',
        ),
      },
    ],
  },

  {
    id: 'dash-models',
    cat: 'dashboard',
    level: 'start',
    title: bi('صفحهٔ مدل‌ها', 'The Models page'),
    summary: bi(
      'تب‌های چت، embedding، تصویر، ویدئو، صوت و Fusion؛ فعال/غیرفعال و اولویت‌بندی.',
      'Chat, embeddings, image, video, audio and Fusion tabs; enabling and ordering.',
    ),
    blocks: [
      {
        k: 'list',
        items: [
          bi(
            'تب چت: جدول مدل‌ها با امتیاز زنده، پنجرهٔ زمینه، وضعیت اجرا و دکمه‌های فعال/غیرفعال. مرتب‌سازی و جست‌وجو روی ستون‌ها.',
            'Chat tab: the model table with live scores, context windows, execution status and enable toggles. Sortable and searchable.',
          ),
          bi(
            'تب Embeddings: مسیریابی بر اساس «خانواده» است (یک هویت مدل + بُعد) و جایگزینی هرگز از مرز مدل عبور نمی‌کند.',
            'Embeddings tab: routing is by family (one model identity + dimension) and failover never crosses models.',
          ),
          bi(
            'تب‌های Image / Video / Audio: مرور و فعال‌سازی مدل‌های رسانه‌ای؛ تصویر و گفتار از نقاط پایانی سفارشی هم پشتیبانی می‌کنند، ویدئو نه.',
            'Image / Video / Audio tabs: browse and toggle media models; images and speech also accept custom endpoints, video does not.',
          ),
          bi(
            'تب Fusion: انتخاب پانل مدل‌ها و مدلِ داور برای ترکیب چندمدلی.',
            'Fusion tab: choose the model panel and the judge model for multi-model synthesis.',
          ),
        ],
      },
      {
        k: 'callout',
        tone: 'warn',
        title: bi('چرا embedding جایگزینیِ بین‌مدلی ندارد', 'Why embeddings never fail over across models'),
        text: bi(
          'بردارهای مدل‌های مختلف در فضاهای ناسازگارند؛ تعویضِ بی‌صدا هر فروشگاهِ برداری که روی این دروازه ساخته باشید را خراب می‌کند. برای همین جایگزینی فقط بین ارائه‌دهندگانی است که همان خانواده را سرو می‌دهند.',
          'Vectors from different models live in incompatible spaces — silently switching models would corrupt any vector store built on top. Failover therefore walks only the providers serving the same family.',
        ),
      },
      {
        k: 'code',
        lang: 'bash',
        caption: bi('مدل‌های آماده را فیلتر کنید تا عامل‌ها فقط سراغ چیزی بروند که واقعاً کار می‌کند.', 'Filter to ready models so agents only ask for what actually works.'),
        code: `curl "http://localhost:3001/v1/models?execution_status=ready" \\
  -H "Authorization: Bearer freellmapi-..." | jq -r '.data[].id' | head -20`,
      },
    ],
  },

  {
    id: 'dash-keys',
    cat: 'dashboard',
    level: 'start',
    title: bi('صفحهٔ کلیدها', 'The Keys page'),
    summary: bi(
      'پنج تب، بررسی سلامت، سقف‌های ماهانه، واردات/صادرات و پشتیبان‌ها.',
      'Five tabs, health checks, monthly caps, import/export and backups.',
    ),
    blocks: [
      {
        k: 'table',
        head: [bi('تب', 'Tab'), bi('چه چیزی در آن است', 'What lives there')],
        rows: [
          [
            bi('ارائه‌دهنده‌ها', 'Providers'),
            bi(
              'افزودن/ویرایش/تست کلیدها، چک‌لیست ارائه‌دهنده‌ها برای ثبت‌نام سریع، فعال/غیرفعال، سقف ماهانهٔ درخواست و توکن.',
              'Add/edit/test keys, a provider signup checklist, enable/disable, monthly request and token caps.',
            ),
          ],
          [
            bi('سیگنال‌های سهمیه', 'Quota signals'),
            bi('مشاهدات زندهٔ سهمیه (limit/remaining/reset)، پیش‌بینی اتمام و وضعیتِ کلیدها.', 'Live quota observations (limit/remaining/reset), exhaustion forecasts and key states.'),
          ],
          [
            bi('کلید یکپارچه', 'API key'),
            bi('کلید freellmapi-…، بازتولید آن، پروفایل‌های کلاینت، تنظیمات پروکسی و پشتیبان‌های رمزنگاری‌شده.', 'The freellmapi-… key, regeneration, client profiles, proxy settings and encrypted backups.'),
          ],
          [
            bi('Anthropic', 'Anthropic'),
            bi('نگاشت خانواده‌های مدل کلود (default/opus/sonnet/haiku) به auto یا یک مدل پین‌شده.', 'Mapping Claude model families (default/opus/sonnet/haiku) to auto or a pinned model.'),
          ],
          [
            bi('سازگاری با عامل‌ها', 'Agents'),
            bi('فعال/غیرفعال کردن سرور MCP و گزینه‌های مربوط به کلاینت‌های عامل.', 'Toggling the MCP server and agent-client options.'),
          ],
        ],
      },
      {
        k: 'list',
        items: [
          bi(
            'دکمهٔ Check all یک بررسی سلامت روی همهٔ کلیدها اجرا می‌کند؛ بررسی دوره‌ای هم به‌طور خودکار وضعیت را تازه نگه می‌دارد.',
            'Check all runs a health probe over every key; a periodic probe keeps status fresh on its own.',
          ),
          bi(
            'واردات گروهی با چسباندن یک فایل .env (با پیش‌نمایش و انتخاب تک‌تک کلیدها)؛ صادرات به JSON، .env یا CSV.',
            'Bulk-import by pasting an .env file (with preview and per-key selection); export to JSON, .env or CSV.',
          ),
          bi(
            'سقف‌های ماهانه با monthlyRequestCap و monthlyTokenCap از طریق PATCH /api/keys/:id تنظیم می‌شوند؛ مقدار ۰ یعنی نامحدود و در نیمه‌شب UTCِ اول هر ماه بازنشانی می‌شوند.',
            'Monthly caps are set through PATCH /api/keys/:id with monthlyRequestCap and monthlyTokenCap; 0 means unlimited and they reset at 00:00 UTC on the first of the month.',
          ),
          bi(
            'پشتیبان‌ها از پایگاه داده، رمزنگاری‌شده‌اند و هدر هر فایل اثرانگشت کلید رمزنگاری را دارد؛ بازگردانیِ فایلی که با کلید دیگری نوشته شده رد می‌شود.',
            'Database backups are encrypted and each dump header carries the encryption key fingerprint; restoring a dump written under a different key is refused.',
          ),
        ],
      },
    ],
  },

  {
    id: 'dash-fallback',
    cat: 'dashboard',
    level: 'core',
    title: bi('صفحهٔ Fallback و مدیر زنجیره', 'Fallback page & chain manager'),
    summary: bi(
      'ساخت زنجیره، کشیدن و رها کردن برای مرتب‌سازی، تغییر نام و انتخاب پروفایل فعال.',
      'Create chains, drag to reorder, rename in place and pick the active profile.',
    ),
    blocks: [
      {
        k: 'steps',
        items: [
          {
            title: bi('یک پروفایل بسازید', 'Create a profile'),
            text: bi('مثلاً coding یا vision. هر پروفایل یک زنجیرهٔ نام‌دار است.', 'For example coding or vision. Each profile is a named chain.'),
          },
          {
            title: bi('مدل‌ها را اضافه و مرتب کنید', 'Add and order models'),
            text: bi('کشیدن و رها کردن ترتیب تلاش را تعیین می‌کند؛ بالاترین، اول تلاش می‌شود.', 'Drag and drop sets the attempt order; the top one is tried first.'),
          },
          {
            title: bi('آن را فعال کنید یا با نام صدا بزنید', 'Activate it or call it by name'),
            text: bi('پروفایل فعال همان چیزی است که auto استفاده می‌کند؛ هر پروفایل را هم می‌توان با auto:<name> صدا زد.', 'The active profile is what plain auto uses; any profile can also be called as auto:<name>.'),
          },
        ],
      },
      {
        k: 'callout',
        tone: 'note',
        text: bi(
          'مدل همسان روی چند ارائه‌دهنده در یک مدخل یکپارچه ادغام می‌شود و جایگزینیِ درون‌گروهیِ سخت دارد: ابتدا همان مدل روی ارائه‌دهندهٔ دیگر تلاش می‌شود، بعد نوبتِ مدل بعدی در زنجیره است.',
          'The same model across providers collapses into one unified entry with strict in-group failover: the same model on another provider is tried first, then the next model in the chain.',
        ),
      },
    ],
  },

  {
    id: 'dash-observe',
    cat: 'dashboard',
    level: 'core',
    title: bi('زمین‌بازی، تحلیل‌ها و لاگ‌ها', 'Playground, Analytics & Logs'),
    summary: bi(
      'آزمایش دستیِ پرامپت، خواندن p50/p95/TTFT و پیدا کردن خطاها در لاگ.',
      'Manual prompt testing, reading p50/p95/TTFT and hunting errors in logs.',
    ),
    blocks: [
      {
        k: 'cards',
        items: [
          {
            title: bi('زمین‌بازی', 'Playground'),
            text: bi(
              'گفت‌وگو با پارامترهای نمونه‌برداری، پیوست فایل/تصویر، دیکتهٔ صوتی و پنل خروجی — سریع‌ترین راه برای دیدن اینکه مسیریاب واقعاً به کجا می‌رود.',
              'Chat with sampling parameters, file/image attachments, dictation and an output panel — the fastest way to see where the router actually goes.',
            ),
            meta: '/playground',
          },
          {
            title: bi('تحلیل‌ها', 'Analytics'),
            text: bi(
              'چندک‌های p50/p95 و TTFT، تفکیک بر اساس مدل، کلید، پلتفرم و کلاینت؛ بازه‌های ۲۴ ساعت، ۷ روز، ۳۰ روز و ۹۰ روز.',
              'p50/p95 and TTFT percentiles, breakdowns by model, key, platform and client; 24h, 7d, 30d and 90d windows.',
            ),
            meta: '/analytics',
          },
          {
            title: bi('لاگ‌ها', 'Logs'),
            text: bi(
              'نمایش لاگ‌های سرور داخل داشبورد. برای نصب‌های داکر همان خروجیِ docker compose logs است.',
              'Server logs surfaced inside the dashboard. For Docker installs this is the same stream as docker compose logs.',
            ),
            meta: '/logs',
          },
          {
            title: bi('بازرسِ جریمه', 'Penalty inspector'),
            text: bi(
              'دیدنِ اینکه چرا یک مدل تنبیه یا از رده خارج شده — همراه با رویدادهای محدودیت نرخ.',
              'See why a model was penalised or retired — together with rate-limit events.',
            ),
            meta: '/analytics',
          },
        ],
      },
      {
        k: 'callout',
        tone: 'tip',
        title: bi('هدرهای پاسخ را هم بخوانید', 'Read the response headers too'),
        text: bi(
          'X-Fallback-Trail نام هر پرشِ ناموفق و دلیلش را می‌گوید؛ X-Fallback-Detail (که به‌طور پیش‌فرض خاموش است) هزینهٔ هر پرش را هم اضافه می‌کند. این‌ها همان چیزی هستند که در تحلیل‌ها نمی‌بینید.',
          'X-Fallback-Trail names each failed hop and why; X-Fallback-Detail (off by default) adds what each hop cost. That is the part you cannot reconstruct from the analytics charts.',
        ),
      },
    ],
  },

  {
    id: 'dash-agents-forgepilot',
    cat: 'dashboard',
    level: 'core',
    title: bi('صفحهٔ عامل‌ها و صفحهٔ ForgePilot', 'Agents page & ForgePilot page'),
    summary: bi(
      'کارت‌های اتصالِ عامل‌ها در یک سو، و تصمیم‌های خواندنیِ هسته در سوی دیگر.',
      'Agent connection cards on one side, the kernel’s readable decisions on the other.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'صفحهٔ Agents برای هر عامل کدنویسی یک کارت دارد: نام، آنچه باید در کلاینت بگذارید و دکمه‌ای برای کپیِ کلید و فرمانِ راه‌اندازی. همچنین نشان می‌دهد کدام کلاینت‌ها در ۳۰ روز گذشته واقعاً درخواست فرستاده‌اند. صفحهٔ ForgePilot برعکس، فقط‌خواندنی است: یک کلیدِ بالای صفحه (Free / Paid / Local) و تمام صفحه از روی آن بازخوانی می‌شود — کدام ارائه‌دهنده مجاز است، سقف هزینه، بودجهٔ توکن، چند کار موازی، کدام دروازه‌های کیفیت باید بگذرند و کدام قابلیت‌ها در این حالت خاموش‌اند.',
          'The Agents page has a card per coding agent: the name, what to put in the client, and copy buttons for the key and the setup command. It also shows which clients actually sent requests over the last 30 days. The ForgePilot page is read-only: one switch at the top (Free / Paid / Local) and everything re-reads from it — which providers are allowed, the cost ceiling, the token budget, how many tasks run in parallel, which quality gates must pass and which capabilities the mode switches off.',
        ),
      },
      {
        k: 'table',
        head: [bi('بخش صفحه', 'Page section'), bi('چه می‌گویید', 'What it tells you')],
        rows: [
          [bi('سیاست ارائه‌دهنده', 'Provider policy'), bi('مجاز بودنِ محلی / ابری رایگان / ابری پولی / آموزش روی ورودی، و سقف حریم ابری', 'Whether local / free cloud / paid cloud / training-on-input are allowed, and the cloud privacy ceiling')],
          [bi('بودجه', 'Budget'), bi('توکن هر اجرا، توکن روزانهٔ هر کاربر، توقف سخت و حداکثر هزینهٔ هر اجرا', 'Per-run tokens, per-user daily tokens, the hard stop and the max cost per run')],
          [bi('اجرا', 'Execution'), bi('حداکثر کارهای موازی، تلاش‌های تعمیر، زمان‌سنجی سندباکس و دروازه‌های کیفیت', 'Max parallel tasks, repair attempts, sandbox timeout and the quality gates')],
          [bi('قابلیت‌های غیرفعال', 'Disabled capabilities'), bi('مواردی که این حالت محاسباتی خاموش می‌کند', 'What this compute mode switches off')],
          [bi('حالت‌های اجرا', 'Run states'), bi('۱۹ حالت؛ حالت‌های پایانی پررنگ‌اند', 'The 19 run states; terminal ones are filled in')],
          [bi('کتابخانهٔ پرامپت', 'Prompt library'), bi('پرامپت‌های نسخه‌دار با شمارهٔ نسخه', 'The versioned prompts with their version numbers')],
        ],
      },
    ],
  },

  /* ─────────────────────────── API ─────────────────────────── */
  {
    id: 'api-map',
    cat: 'api',
    level: 'core',
    title: bi('نقشهٔ مسیرهای API', 'API route map'),
    summary: bi(
      'همهٔ سطح‌های OpenAI، سطح‌های بومی و مسیرهای مدیریتی — قابل جست‌وجو.',
      'Every OpenAI surface, the native surfaces and the admin routes — searchable.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'دروازه چند «سطحِ wire» را هم‌زمان سرو می‌کند: سازگار با OpenAI روی /v1، پیام‌های Anthropic روی /v1/messages، Gemini بومی روی /v1beta، شبیه‌سازی Ollama برای کلاینت‌های محلی، /v1/responses برای Codex، MCP روی /mcp و مستندات تعاملی روی /v1/docs. روی هر ردیف بزنید تا نمونهٔ فراخوانی باز شود.',
          'The gateway serves several wire surfaces at once: OpenAI-compatible on /v1, Anthropic Messages on /v1/messages, native Gemini on /v1beta, Ollama emulation for local-model clients, /v1/responses for Codex, MCP on /mcp and an interactive docs viewer on /v1/docs. Click any row to expand a sample call.',
        ),
      },
      {
        k: 'endpoints',
        items: [
          {
            m: 'GET',
            p: '/v1/models',
            d: bi('کل کاتالوگ — از جمله مدل‌هایی که هنوز نمی‌توانید صدا بزنید.', 'The whole catalog, including models you cannot call yet.'),
            sample: `curl "http://localhost:3001/v1/models?execution_status=ready" \\
  -H "Authorization: Bearer freellmapi-..."`,
          },
          {
            m: 'POST',
            p: '/v1/chat/completions',
            d: bi('سطح اصلی چت؛ استریم و غیراستریم، ابزارها و ورودی تصویر.', 'The main chat surface; streaming and non-streaming, tools and vision input.'),
            sample: `curl http://localhost:3001/v1/chat/completions \\
  -H "Authorization: Bearer freellmapi-..." -H "Content-Type: application/json" \\
  -d '{"model":"auto","messages":[{"role":"user","content":"hi"}]}'`,
          },
          {
            m: 'POST',
            p: '/v1/responses',
            d: bi('سطح Responses — همان چیزی که Codex CLI لازم دارد.', 'The Responses surface — what Codex CLI needs.'),
          },
          {
            m: 'POST',
            p: '/v1/completions',
            d: bi('تکمیلِ متنیِ قدیمی برای ghost-text ویرایشگرها.', 'Legacy text completion for editor ghost-text autocomplete.'),
          },
          {
            m: 'POST',
            p: '/v1/embeddings',
            d: bi('بردارسازی؛ جایگزینی فقط درون همان خانوادهٔ مدل.', 'Embeddings; failover stays inside the same model family.'),
            sample: `curl http://localhost:3001/v1/embeddings \\
  -H "Authorization: Bearer freellmapi-..." -H "Content-Type: application/json" \\
  -d '{"model":"auto","input":"hello world"}'`,
          },
          {
            m: 'POST',
            p: '/v1/images/generations',
            d: bi('تولید تصویر؛ نقاط پایانی سفارشیِ سازگار هم پذیرفته می‌شود.', 'Image generation; custom OpenAI-compatible endpoints accepted.'),
          },
          {
            m: 'POST',
            p: '/v1/videos/generations',
            d: bi('تولید ویدئو با سقف ۵ دقیقه؛ MP4 کامل برمی‌گرداند.', 'Video generation bounded to a 5-minute timeout; returns a completed MP4.'),
            sample: `curl http://localhost:3001/v1/videos/generations \\
  -H "Authorization: Bearer freellmapi-..." -H "Content-Type: application/json" \\
  -d '{"model":"auto","prompt":"a sunrise over a quiet lake","duration":6}' \\
  --output video.mp4`,
          },
          {
            m: 'POST',
            p: '/v1/audio/speech · /v1/audio/transcriptions',
            d: bi('تبدیل متن به گفتار و رونویسی گفتار.', 'Text-to-speech and speech transcription.'),
          },
          {
            m: 'POST',
            p: '/v1/messages',
            d: bi('سطح پیام‌های Anthropic (کلود کد و SDKهای رسمی).', 'The Anthropic Messages surface (Claude Code and official SDKs).'),
            sample: `curl http://localhost:3001/v1/messages \\
  -H "x-api-key: freellmapi-..." -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"claude-sonnet-4-5","max_tokens":256,"messages":[{"role":"user","content":"hi"}]}'`,
          },
          {
            m: 'POST',
            p: '/v1/messages/count_tokens',
            d: bi('شمارش توکن به سبک Anthropic.', 'Anthropic-style token counting.'),
          },
          {
            m: 'POST',
            p: '/v1beta/…',
            d: bi('سطح بومی Gemini: generateContent، استریم، شمارش توکن، فهرست مدل‌ها.', 'Native Gemini: generateContent, streaming, token counting, model listing.'),
          },
          {
            m: 'GET',
            p: '/v1/t/:token/…',
            d: bi('کلیدهای URL قابل‌لغو برای ابزارهایی که هدر نمی‌فرستند.', 'Revocable URL tokens for tools that cannot send headers.'),
          },
          {
            m: 'POST',
            p: '/v1/embeddings · /v1/audio/transcriptions (مدل‌های رسانه)',
            d: bi('مدل‌های رسانه‌ای از تب‌های مربوط در داشبورد فعال می‌شوند.', 'Media models are enabled from their dashboard tabs.'),
          },
          {
            m: 'GET',
            p: '/v1/openapi.json · /v1/docs',
            d: bi('مشخصات OpenAPI ۳.۰ و یک نمایشگر بدون وابستگی (بدون نیاز به کلید).', 'OpenAPI 3.0 spec and a dependency-free viewer (no key required).'),
          },
          {
            m: 'GET',
            p: '/livez · /readyz · /v1/providers',
            d: bi('کاوشگرهای عملیاتی برای ترازبارها و دروازه‌های لایه‌بالا.', 'Operational probes for load balancers and meta-gateways.'),
          },
        ],
      },
      {
        k: 'callout',
        tone: 'note',
        text: bi(
          'مشخصات کامل و همیشه به‌روزِ سطح عمومی در /v1/openapi.json است؛ آن را مستقیماً به ابزارهای تولید کلاینت بدهید.',
          'The complete, always-current spec for the public surface is at /v1/openapi.json — feed it straight to client generators.',
        ),
      },
      {
        k: 'endpoints',
        items: [
          { m: 'GET', p: '/api/agent/modes', d: bi('سه پروفایل حالت محاسباتی به‌طور کامل.', 'All three compute-mode profiles in full.') },
          { m: 'POST', p: '/api/agent/modes/validate', d: bi('آیا این فضای‌کاری می‌تواند این حالت را استفاده کند؟', 'Can this workspace use this mode?') },
          { m: 'POST', p: '/api/agent/route', d: bi('کدام ارائه‌دهنده باید این کار را اجرا کند — به همراه دلیل ردِ بقیه.', 'Which provider should run this job — plus why every other candidate lost.') },
          { m: 'POST', p: '/api/agent/policy/tool-call', d: bi('آیا این فراخوانی ابزار مجاز است؟', 'Is this tool call allowed?') },
          { m: 'POST', p: '/api/agent/policy/egress', d: bi('آیا این داده اجازه دارد از دستگاه خارج شود؟', 'May this data leave the machine?') },
          { m: 'POST', p: '/api/agent/redact', d: bi('پاک‌سازی رازها از هر متن.', 'Scrub secrets out of any text.') },
          { m: 'POST', p: '/api/agent/evidence/audit', d: bi('آیا ادعای «کار تمام شد» درست است؟', 'Is this “task complete” claim true?') },
          { m: 'GET', p: '/api/agent/states', d: bi('۱۹ حالت اجرا و تعیینِ حالت‌های پایانی.', 'The 19 run states and which are terminal.') },
          { m: 'POST', p: '/api/agent/states/transition', d: bi('اعمال یک رویداد؛ غیرقانونی‌ها با دلیل رد می‌شوند.', 'Apply one event; illegal ones are refused with a reason.') },
          { m: 'POST', p: '/api/agent/dag/validate', d: bi('تشخیص دور در وابستگی‌ها، برنامه‌ریزی موج‌های موازی، یافتن تضاد فایل.', 'Detect dependency cycles, plan parallel waves, find file conflicts.') },
          { m: 'GET', p: '/api/agent/schemas', d: bi('قراردادهای خروجی (JSON Schema).', 'The output contracts (JSON Schema).') },
          { m: 'POST', p: '/api/agent/schemas/validate', d: bi('بررسی خروجی مدل در برابر یک قرارداد.', 'Check a model’s JSON against a contract.') },
          { m: 'GET', p: '/api/agent/prompts', d: bi('کتابخانهٔ پرامپت به صورت JSON.', 'The prompt library as JSON.') },
          { m: 'POST', p: '/api/agent/prompts/:file/compose', d: bi('رندر کردن یک پرامپت با متغیرهای شما.', 'Render a prompt with your variables.') },
          { m: 'GET', p: '/api/agent/tools', d: bi('فهرست ۲۳ ابزار.', 'List the 23 tools.') },
          { m: 'POST', p: '/api/agent/tools/invoke', d: bi('فراخوانی یک ابزار از شش دروازه.', 'Invoke a tool through the six gates.') },
          {
            m: 'POST',
            p: '/api/agent/runs',
            d: bi('ساخت یک اجرا با هدف، حالت و سقف گام‌ها.', 'Create a run with a goal, mode and step cap.'),
            sample: `curl -s -X POST http://localhost:3001/api/agent/runs \\
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \\
  -d '{"organizationId":"acme","projectId":"web","goal":"Add rate limiting","mode":"paid","maxSteps":50}'`,
          },
          { m: 'POST', p: '/api/agent/runs/:runId/step', d: bi('یک گام جلو بردن اجرا با یک رویداد.', 'Advance the run one event at a time.') },
          { m: 'POST', p: '/api/agent/runs/:runId/advance', d: bi('حلقهٔ خودران: پرسش از مدل و نگاشت پاسخ به یک رویداد مجاز.', 'The self-driving loop: ask the model and map the reply onto one legal event.') },
          { m: 'POST', p: '/api/agent/runs/:runId/decision', d: bi('تصمیم انسانی در دروازهٔ تأیید.', 'The human decision at an approval gate.') },
          { m: 'GET', p: '/api/agent/runs/:runId/checkpoints', d: bi('تاریخچهٔ زنجیره‌ایِ هش‌شده.', 'The hash-chained history.') },
          { m: 'POST', p: '/api/agent/runs/:runId/verify', d: bi('صحت‌سنجی زنجیره؛ محل شکست را نام می‌برد.', 'Verify the chain; names where it broke.') },
          { m: 'GET', p: '/api/agent/runs/resumable', d: bi('اجراهایی که پس از خاموشی ادامه‌پذیرند.', 'Runs that can be resumed after a crash.') },
          { m: 'GET', p: '/api/agent/jobs/claim · /jobs/stats', d: bi('صف کار؛ بدون توکنِ کارگر با ۵۰۳ بسته است.', 'The job queue; it fails closed with 503 without worker tokens.') },
          { m: 'GET', p: '/api/free-tier', d: bi('بودجهٔ ردیف رایگان به‌صورت یک‌پارچه‌شده بر حسب «استخر سهمیه».', 'The free-tier budget, pool-deduped.') },
          { m: 'GET', p: '/api/backups', d: bi('فهرست پشتیبان‌های رمزنگاری‌شدهٔ پایگاه داده.', 'List the encrypted database snapshots.') },
          { m: 'GET', p: '/api/analytics/summary', d: bi('خلاصهٔ تحلیل‌ها برای بازه‌های ۲۴ ساعت تا ۹۰ روز.', 'Analytics summary over 24h–90d windows.') },
          { m: 'GET', p: '/api/health · /api/health/check-all', d: bi('سلامت کلیدها و بررسیِ دستیِ همه.', 'Key health plus a manual check of all.') },
          { m: 'GET', p: '/api/ping', d: bi('ساده‌ترین کاوشگر زنده‌بودن.', 'The simplest liveness probe.') },
        ],
      },
    ],
  },

  {
    id: 'api-chat',
    cat: 'api',
    level: 'start',
    title: bi('چت، استریم و پارامترها', 'Chat, streaming and parameters'),
    summary: bi(
      'پارامترهای نمونه‌برداری، استریم، ورودی تصویر و پیوست سند.',
      'Sampling params, streaming, vision input and document attachments.',
    ),
    blocks: [
      {
        k: 'list',
        items: [
          bi(
            'response_format، seed، logprobs، جریمه‌ها و بقیهٔ پارامترهای نمونه‌برداری به‌صورت هر-ارائه‌دهنده عبور داده می‌شوند.',
            'response_format, seed, logprobs, penalties and the rest of the sampling params pass through per provider.',
          ),
          bi(
            'استریم به‌صورت SSE انجام می‌شود و در صورت برخورد به کش، جریان ذخیره‌شده عیناً پخش می‌شود.',
            'Streaming is SSE; a cache hit replays the stored stream verbatim.',
          ),
          bi(
            'ورودی تصویر (vision) و پیوست سند در قالب content-partهای استاندارد پشتیبانی می‌شوند.',
            'Vision input and document attachments work through the standard content parts.',
          ),
          bi(
            'زمینه‌سازیِ Google Search برای Gemini در دسترس است (grounding).',
            'Gemini Google Search grounding is available.',
          ),
        ],
      },
      {
        k: 'code',
        caption: bi('استریم در پایتون، همراه با خواندن هدر مسیریابی.', 'Streaming in Python, reading the routing header.'),
        lang: 'python',
        code: `stream = client.chat.completions.create(
    model="auto:fast",
    messages=[{"role": "user", "content": "Stream me a haiku about SQLite."}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)

# بعد از پایان: resp.headers.get("x-routed-via") -> "groq/llama-3.3-70b"`,
      },
      {
        k: 'callout',
        tone: 'warn',
        title: bi('n > 1 پشتیبانی نمی‌شود', 'n > 1 is not supported'),
        text: bi(
          'چند خروجی در یک درخواست، moderation و احراز هویت چندمستأجره عمداً پیاده‌سازی نشده‌اند (دروازه تک‌کاربره است).',
          'Multiple completions per request, moderation and multi-tenant auth are deliberately out of scope (the gateway is single-user by design).',
        ),
      },
    ],
  },

  {
    id: 'api-strategies',
    cat: 'api',
    level: 'core',
    title: bi('استراتژی‌های مسیریابی (auto:*)', 'Routing strategies (auto:*)'),
    summary: bi(
      'شش استراتژی برای جهت‌دهی به یک درخواست بدون تغییر در داشبورد.',
      'Six strategies to steer a single request without touching the dashboard.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'auto ساده، زنجیرهٔ فعال شما را دنبال می‌کند. افزودنِ پسوند، همان یک درخواست را هدایت می‌کند: این استراتژی‌ها «همهٔ مدل‌های فعال» را رتبه‌بندی می‌کنند و ترتیب زنجیرهٔ شما را نادیده می‌گیرند. مترادف‌ها هم پذیرفته می‌شوند (auto:fastest، auto:smartest، auto:cheapest و …) و کل رشته نسبت به بزرگی/کوچکی حروف حساس نیست.',
          'Plain auto follows your active fallback chain. Adding a suffix steers that one request: these strategies rank every enabled model and ignore your chain order. Common synonyms resolve too (auto:fastest, auto:smartest, auto:cheapest, …) and the whole model string is case-insensitive.',
        ),
      },
      {
        k: 'chips',
        items: [
          {
            label: 'auto',
            title: bi('زنجیرهٔ فعال', 'Your active chain'),
            text: bi(
              'همان ترتیبی که در صفحهٔ Fallback چیده‌اید. پیش‌فرضِ امن.',
              'Exactly the order you arranged on the Fallback page. The safe default.',
            ),
            code: '"model": "auto"',
          },
          {
            label: 'auto:smart',
            title: bi('هوشمندترین', 'Highest intelligence'),
            text: bi(
              'به مدل‌های با بالاترین هوش گرایش دارد. برای کارهای استدلالی و کدنویسیِ سخت.',
              'Favours the highest-intelligence models. Use for reasoning and hard coding tasks.',
            ),
            code: '"model": "auto:smart"',
          },
          {
            label: 'auto:fast',
            title: bi('سریع‌ترین', 'Fastest'),
            text: bi(
              'بر اساس سرعتِ اندازه‌گیری‌شده (توان عملیاتی و زمان تا نخستین توکن). مناسب تعامل‌های زنده.',
              'Favours measured speed (throughput and time-to-first-byte). Good for live interaction.',
            ),
            code: '"model": "auto:fast"',
          },
          {
            label: 'auto:reliable',
            title: bi('قابل‌اطمینان‌ترین', 'Most reliable'),
            text: bi('بر اساس نرخ موفقیت اخیر. وقتی شکست پرهزینه است.', 'Favours recent success rate. Use when a failure is expensive.'),
            code: '"model": "auto:reliable"',
          },
          {
            label: 'auto:balanced',
            title: bi('متوازن (پیش‌فرض)', 'Balanced (default)'),
            text: bi('قابلیت‌اطمینان در اولویت، بعد سرعت و هوش به‌طور مساوی.', 'Reliability first, with speed and intelligence splitting the rest.'),
            code: '"model": "auto:balanced"',
          },
          {
            label: 'auto:cheap',
            title: bi('کم‌هزینه', 'Budget-leaning'),
            text: bi(
              'در عمل همان ترکیب balanced است، چون همه‌چیز در استخر رایگان است.',
              'Currently the same blend as balanced, since everything in the pool is already free.',
            ),
            code: '"model": "auto:cheap"',
          },
          {
            label: 'auto:<profile>',
            title: bi('زنجیرهٔ نام‌دار', 'Named chain'),
            text: bi(
              'عبور از زنجیرهٔ یک پروفایل مشخص؛ نام ناشناس خطای ۴۰۰ واضح می‌دهد و بی‌سر و صدا به auto برنمی‌گردد.',
              'Route through one profile’s chain; an unknown name returns a clear 400 instead of silently falling back.',
            ),
            code: '"model": "auto:coding"',
          },
          {
            label: 'fusion',
            title: bi('ترکیب چندمدلی', 'Multi-model synthesis'),
            text: bi(
              'پرامپت به‌صورت موازی به پانلی از مدل‌های متنوع فرستاده می‌شود و یک مدل داور پاسخ نهایی را ترکیب می‌کند.',
              'The prompt fans out to a panel of diverse models, then a judge model synthesises one answer.',
            ),
            code: '"model": "fusion"',
          },
        ],
      },
      {
        k: 'callout',
        tone: 'tip',
        title: bi('هدر نوع کار', 'The task-type header'),
        text: bi(
          'X-FreeLLM-Task-Type: code|chat|auto به مسیریاب می‌گوید این نوبت چه نوعی است: برای code کمی از وزن سرعت به هوش منتقل می‌شود (پاسخ غلط گران‌تر از پاسخ کند است) و برای chat برعکس. این فقط ترجیح نرم است و روی دروازه‌های توانمندی اثری ندارد. سهمِ جابه‌جایی با PUT /api/settings/task-weight-share قابل تنظیم است (پیش‌فرض ۰٫۳). استراتژی‌های fastest، reliable و custom این هدر را نادیده می‌گیرند.',
          'X-FreeLLM-Task-Type: code|chat|auto tells the router what kind of turn this is: code trades some speed weight for intelligence (a wrong answer costs more than a slow one), chat does the reverse. It is a soft preference only and never touches capability gates. The shift is tunable via PUT /api/settings/task-weight-share (default 0.3). The fastest, reliable and custom strategies ignore it.',
        ),
      },
    ],
  },

  {
    id: 'api-tools',
    cat: 'api',
    level: 'core',
    title: bi('فراخوانی ابزار و خروجی ساختاریافته', 'Tool calling & structured outputs'),
    summary: bi(
      'ابزارها به سبک OpenAI روی همهٔ ارائه‌دهنده‌ها، به‌علاوه نجاتِ ابزارهای متنی.',
      'OpenAI-style tools across every provider, plus rescue of plain-text tool calls.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'ابزارها و tool_choice به سبک OpenAI می‌گردند و پاسخ دستیار دقیقاً مانند API خود OpenAI برمی‌گردد. جریان‌های چندمرحله‌ای (tool_calls از assistants → پیگیری با نقش tool → پاسخ نهایی) روی همهٔ ارائه‌دهندگان کار می‌کنند. مدل‌هایی که فراخوانی ابزار را به‌صورت متن ساده بیرون می‌دهند، به‌طور خودکار به tool_calls واقعی «نجات» داده می‌شوند؛ و درخواست‌های ابزار فقط به مدل‌هایی می‌روند که واقعاً ابزار را پشتیبانی می‌کنند.',
          'OpenAI-style tools and tool_choice round-trip, and the assistant response comes back exactly like the OpenAI API. Multi-step flows (assistant tool_calls → tool-role follow-up → final answer) work across every provider. Models that emit tool calls as plain text are rescued into real tool_calls, and tool requests only route to models that genuinely support them.',
        ),
      },
      {
        k: 'code',
        lang: 'python',
        code: `tools = [{
  "type": "function",
  "function": {
    "name": "get_weather",
    "description": "Get current weather for a city",
    "parameters": {
      "type": "object",
      "properties": {"city": {"type": "string"}},
      "required": ["city"],
    },
  },
}]

resp = client.chat.completions.create(
    model="auto:smart",
    messages=[{"role": "user", "content": "Weather in Tehran?"}],
    tools=tools,
    tool_choice="auto",
)
call = resp.choices[0].message.tool_calls[0]
print(call.function.name, call.function.arguments)

# ادامهٔ گفت‌وگو:
messages = [
    {"role": "user", "content": "Weather in Tehran?"},
    resp.choices[0].message,
    {"role": "tool", "tool_call_id": call.id, "content": '{"temp_c": 31}'},
]
final = client.chat.completions.create(model="auto:smart", messages=messages)
print(final.choices[0].message.content)`,
      },
      {
        k: 'callout',
        tone: 'note',
        text: bi(
          'VALIDATE_TOOL_ARGUMENTS بررسیِ آرگومان‌ها را کنترل می‌کند و دروازهٔ agent از JSON Schema برای اعتبارسنجیِ هر فراخوانی استفاده می‌کند (نگاه کنید به بخش ابزارها).',
          'VALIDATE_TOOL_ARGUMENTS controls argument validation, and the agent gate validates every invocation against JSON Schema (see the tools section).',
        ),
      },
    ],
  },

  {
    id: 'api-media',
    cat: 'api',
    level: 'core',
    title: bi('Embedding، تصویر، ویدئو و صوت', 'Embeddings, image, video & audio'),
    summary: bi(
      'مسیریابی بر پایهٔ خانواده برای بردارها، و رفتار متفاوت هر مدالیته.',
      'Family-based routing for vectors, and how each modality behaves.',
    ),
    blocks: [
      {
        k: 'table',
        head: [bi('مدالیته', 'Modality'), bi('مسیر', 'Route'), bi('نکتهٔ مهم', 'Important note')],
        rows: [
          [
            bi('Embeddings', 'Embeddings'),
            bi('/v1/embeddings', '/v1/embeddings'),
            bi('جایگزینی هرگز از مرز مدل عبور نمی‌کند؛ مسیریابی بر اساس خانواده است.', 'Failover never crosses models; routing is by family.'),
          ],
          [
            bi('تصویر', 'Image'),
            bi('/v1/images/generations', '/v1/images/generations'),
            bi('نقاط پایانی سفارشی پذیرفته می‌شود؛ نرمال‌سازی و فشرده‌سازی با IMAGE_NORMALIZE* تنظیم می‌شود.', 'Custom endpoints accepted; normalisation and compression via IMAGE_NORMALIZE*.'),
          ],
          [
            bi('ویدئو', 'Video'),
            bi('/v1/videos/generations', '/v1/videos/generations'),
            bi('دو پلتفرم (pollinations و huggingface از طریق صف fal)؛ سقف ۵ دقیقه وگرنه ۵۰۴؛ خروجی MP4 باینری.', 'Two platforms (pollinations and huggingface via the fal queue); 5-minute cap else 504; binary MP4 out.'),
          ],
          [
            bi('گفتار', 'Speech'),
            bi('/v1/audio/speech', '/v1/audio/speech'),
            bi('نقاط پایانی سفارشی پذیرفته می‌شود.', 'Custom endpoints accepted.'),
          ],
          [
            bi('رونویسی', 'Transcription'),
            bi('/v1/audio/transcriptions', '/v1/audio/transcriptions'),
            bi('مدل‌ها در تب Audio فعال می‌شوند.', 'Models are enabled on the Audio tab.'),
          ],
        ],
      },
      {
        k: 'code',
        lang: 'python',
        caption: bi('دریافت بردارها؛ family را می‌توانید با نام مشخص کنید یا به auto بسپارید.', 'Fetch vectors; name a family or leave it to auto.'),
        code: `resp = client.embeddings.create(
    model="auto",          # family پیش‌فرض؛ یا نامی مانند "bge-m3"
    input=["the quick brown fox", "pack my box with five dozen liquor jugs"],
)
print(len(resp.data), "vectors of", len(resp.data[0].embedding), "dims")`,
      },
      {
        k: 'callout',
        tone: 'warn',
        title: bi('قطع شدنِ کلاینت در میانهٔ ویدئو', 'A client hanging up mid-video'),
        text: bi(
          'اگر کلاینت در میانهٔ تولید ویدئو قطع شود، رویداد close روی سوکت کار را لغو می‌کند تا دروازه برای پاسخی که کسی منتظرش نیست، به polling ادامه ندهد و سراغ ارائه‌دهندهٔ دوم نرود.',
          'If a client disconnects mid-generation, the socket close event aborts the work so the gateway does not keep polling — or fail over to a second provider — for a response nobody is waiting for.',
        ),
      },
    ],
  },

  {
    id: 'api-fusion',
    cat: 'api',
    level: 'pro',
    title: bi('Fusion (ترکیب چندمدلی)', 'Fusion (multi-model synthesis)'),
    summary: bi(
      'پانلِ موازی + مدل داور؛ پیکربندی از داشبورد یا فیلد fusion در درخواست.',
      'A parallel panel plus a judge model; configure it on the dashboard or per request.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'با درخواستِ مدل مجازی fusion، مسیریاب پرامپت را به‌صورت موازی به پانلی از مدل‌های رایگانِ متنوع می‌فرستد و سپس یک مدل داور پاسخ نهایی را از پیش‌نویس‌ها ترکیب می‌کند. پانل، داور و استراتژی را می‌توان در صفحهٔ Fusion تنظیم کرد یا برای یک درخواست با فیلد fusion مشخص نمود؛ هر فراخوانیِ زیرمجموعه از مسیریابی، سهمیه و تحلیل‌های عادی عبور می‌کند.',
          'Requesting the virtual fusion model fans your prompt out to a panel of diverse free models in parallel, then a judge model synthesises one answer from the drafts. Panel, judge and strategy are configurable on the Fusion page or per request via the fusion field; each sub-call goes through normal routing, quotas and analytics.',
        ),
      },
      {
        k: 'list',
        items: [
          bi('برای پرسش‌هایی مناسب است که یک پاسخِ «میانگینِ چند دیدگاه» از یک پاسخِ تکی بهتر است.', 'Good for questions where averaging several viewpoints beats one answer.'),
          bi('هزینه: N فراخوانیِ موازی از سهمیهٔ شما مصرف می‌شود.', 'Cost: N parallel calls come out of your quota.'),
          bi('هر زیرفراخوانی در تحلیل‌ها ثبت می‌شود، پس در نمودارها می‌بینید چه اتفاقی افتاده.', 'Every sub-call is recorded in analytics, so the charts show what happened.'),
        ],
      },
      {
        k: 'quiz',
        q: bi('کدام گزاره دربارهٔ Fusion درست است؟', 'Which statement about Fusion is true?'),
        options: [
          bi('Fusion سهمیه مصرف نمی‌کند چون از کش استفاده می‌کند.', 'Fusion consumes no quota because it uses the cache.'),
          bi('هر زیرفراخوانی از مسیریابی، سهمیه و تحلیل‌های عادی عبور می‌کند.', 'Each sub-call goes through normal routing, quotas and analytics.'),
          bi('Fusion همیشه کندتر از ارسالِ یک درخواستِ معمولی نیست چون موازی است، اما سهمیهٔ بیشتری مصرف می‌کند.', 'Fusion is never slower than a single request because it is parallel, but it uses more quota.'),
        ],
        answer: 1,
        why: bi(
          'گزینهٔ دوم دقیقاً همان چیزی است که مستندات می‌گوید. گزینهٔ اول غلط است (کش چیز دیگری است) و سوم هم درست به نظر می‌رسد اما ادعای رسمیِ متن نیست — آنچه تضمین شده عبورِ هر زیرفراخوانی از مسیریابی، سهمیه و تحلیل‌هاست.',
          'Option two is exactly what the docs say. The first is wrong (the cache is a separate feature) and the third sounds plausible but is not the documented guarantee — what is guaranteed is that each sub-call traverses routing, quotas and analytics.',
        ),
      },
    ],
  },

  {
    id: 'api-compat',
    cat: 'api',
    level: 'pro',
    title: bi('سطوح بومی: Anthropic، Gemini، Ollama، Responses', 'Native surfaces: Anthropic, Gemini, Ollama, Responses'),
    summary: bi(
      'کلود کد، Gemini CLI و کلاینت‌های مدل محلی، همه روی یک مسیریاب.',
      'Claude Code, Gemini CLI and local-model clients, all over one router.',
    ),
    blocks: [
      {
        k: 'table',
        head: [bi('سطح', 'Surface'), bi('پایهٔ URL', 'Base URL'), bi('توضیح', 'Notes')],
        rows: [
          [
            bi('Anthropic Messages', 'Anthropic Messages'),
            bi('http://localhost:3001 (ریشه)', 'http://localhost:3001 (origin)'),
            bi('کلاینت‌های Anthropic خودشان /v1/messages را می‌چسبانند. هر دو هدر x-api-key و Authorization پذیرفته است. استریم، system prompt، ابزار و تصویر همگی ترجمه می‌شوند.', 'Anthropic clients append /v1/messages themselves. Both x-api-key and Authorization are accepted. Streaming, system prompts, tool use and images all translate.'),
          ],
          [
            bi('Gemini بومی', 'Native Gemini'),
            bi('http://localhost:3001/v1beta', 'http://localhost:3001/v1beta'),
            bi('generateContent، استریم، شمارش توکن و فهرست مدل‌ها برای Gemini CLI.', 'generateContent, streaming, token counting and model listing for Gemini CLI.'),
          ],
          [
            bi('شبیه‌سازی Ollama', 'Ollama emulation'),
            bi('http://localhost:3001 (اختیاری)', 'http://localhost:3001 (opt-in)'),
            bi('NDJSON chat/generate، tags، metadata و embedding برای Zed، JetBrains و دیگر کلاینت‌های مدل محلی.', 'NDJSON chat/generate, tags, metadata and embeddings for Zed, JetBrains and other local-model clients.'),
          ],
          [
            bi('Responses', 'Responses'),
            bi('http://localhost:3001/v1', 'http://localhost:3001/v1'),
            bi('برای Codex CLI با wire_api = "responses".', 'For Codex CLI with wire_api = "responses".'),
          ],
        ],
      },
      {
        k: 'callout',
        tone: 'danger',
        title: bi('ANTHROPIC_AUTH_TOKEN، نه ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN, not ANTHROPIC_API_KEY'),
        text: bi(
          'کلود کد اگر ANTHROPIC_API_KEY تنظیم شده باشد، آن را اعتبارِ درجه‌یکِ متعارض می‌بیند و بالا نمی‌آید. از ANTHROPIC_AUTH_TOKEN (ارسال‌شده به صورت Bearer) استفاده کنید.',
          'Claude Code treats a set ANTHROPIC_API_KEY as a conflicting first-party credential and refuses to start. Use ANTHROPIC_AUTH_TOKEN (sent as a Bearer token).',
        ),
      },
      {
        k: 'code',
        tabs: [
          {
            label: 'Claude Code (Bash)',
            lang: 'bash',
            code: `export ANTHROPIC_BASE_URL=http://localhost:3001
export ANTHROPIC_AUTH_TOKEN=freellmapi-your-unified-key   # NOT ANTHROPIC_API_KEY
claude`,
          },
          {
            label: 'Claude Code (PowerShell)',
            lang: 'powershell',
            code: `$env:ANTHROPIC_BASE_URL="http://localhost:3001"
$env:ANTHROPIC_AUTH_TOKEN="freellmapi-your-unified-key"
claude`,
          },
          {
            label: 'Gemini / Ollama',
            lang: 'bash',
            code: `# Gemini CLI از /v1beta استفاده می‌کند
export GOOGLE_GEMINI_BASE_URL=http://localhost:3001/v1beta

# شبیه‌سازی Ollama برای کلاینت‌های مدل محلی (Zed / JetBrains)
curl http://localhost:3001/api/tags
curl http://localhost:3001/api/chat -d '{"model":"auto","messages":[{"role":"user","content":"hi"}]}'`,
          },
        ],
      },
    ],
  },

  {
    id: 'api-headers',
    cat: 'api',
    level: 'pro',
    title: bi('هدرهای پاسخ، idempotency و توکن‌های URL', 'Response headers, idempotency & URL tokens'),
    summary: bi(
      'ردیابیِ دقیقِ مسیر، تلاشِ امنِ دوباره، و کلیدهایی که فقط URL می‌پذیرند.',
      'Precise hop tracing, safe retries, and clients that only accept a URL.',
    ),
    blocks: [
      {
        k: 'table',
        head: [bi('هدر', 'Header'), bi('معنا', 'Meaning')],
        rows: [
          [bi('X-Routed-Via', 'X-Routed-Via'), bi('پلتفرم/مدلی که واقعاً پاسخ داده است.', 'The platform/model that actually served the call.')],
          [bi('X-Fallback-Attempts', 'X-Fallback-Attempts'), bi('تعداد پرش‌های ناموفق پیش از پاسخ.', 'How many hops failed before the answer.')],
          [bi('X-Fallback-Trail', 'X-Fallback-Trail'), bi('نام هر پرشِ ناموفق و دلیلش.', 'Names each failed hop and why.')],
          [bi('X-Fallback-Detail', 'X-Fallback-Detail'), bi('زمان و هزینهٔ هر پرش (پیش‌فرض خاموش؛ با FALLBACK_DETAIL_HEADER=1).', 'Timing and cost per hop (off by default; FALLBACK_DETAIL_HEADER=1).')],
          [bi('X-FreeLLM-Cache', 'X-FreeLLM-Cache'), bi('روشن/خاموش کردن کش برای همین درخواست.', 'Turn the cache on/off for this request.')],
          [bi('X-FreeLLM-Compress', 'X-FreeLLM-Compress'), bi('غیرفعال یا پایین‌آوردنِ حالت فشرده‌سازیِ همین درخواست.', 'Disable or lower compression for this request.')],
          [bi('X-FreeLLM-Task-Type', 'X-FreeLLM-Task-Type'), bi('code | chat | auto — گرایش نرمِ وزن‌های مسیریابی.', 'code | chat | auto — a soft bias on routing weights.')],
          [bi('Idempotency-Key', 'Idempotency-Key'), bi('کلید تکرارِ امن برای درخواست‌های یکسان.', 'A safe retry key for identical requests.')],
        ],
      },
      {
        k: 'callout',
        tone: 'note',
        text: bi(
          'فقط پرش‌هایی که «شکست خورده‌اند» در Trail ظاهر می‌شوند: زمانِ پرشِ موفق پس از بسته‌شدنِ جریان اندازه‌گیری می‌شود، یعنی بعد از آن که هدرها دیگر قابل تغییر نیستند. برای دانستن اینکه چه کسی پاسخ داده، از X-Routed-Via استفاده کنید.',
          'Only hops that already failed appear in the Trail: the successful hop’s duration is recorded after its response finishes, once the headers are closed. Use X-Routed-Via to see who served you.',
        ),
      },
      {
        k: 'faq',
        items: [
          {
            q: bi('چرا با Idempotency-Key خطای ۴۰۹ می‌گیرم؟', 'Why do I get 409 with Idempotency-Key?'),
            a: bi(
              'چون همان کلید را با بدنهٔ متفاوتی فرستاده‌اید (model، messages، temperature، top_p، max_tokens، tools یا tool_choice فرق کرده). برای هر درخواستِ متمایز یک UUID تازه بفرستید یا همان بدنه را عیناً تکرار کنید. پنجرهٔ در-حال-اجرا تکرار را حذف نمی‌کند — تلاشِ هم‌زمان با یک کلید هنوز می‌تواند مسابقه بدهد.',
              'Because the same key was sent with a different fingerprint (model, messages, temperature, top_p, max_tokens, tools or tool_choice differ). Send a fresh UUID per distinct request, or replay the identical body. The in-flight window is not deduplicated — a concurrent retry with the same key may still race.',
            ),
          },
          {
            q: bi('ابزاری دارم که فقط «آدرس پایه» می‌گیرد و هدر نمی‌فرستد. چه کار کنم؟', 'My tool accepts only a base URL and cannot send headers. Now what?'),
            a: bi(
              'یک توکن URL بسازید و از /v1/t/<token>/chat/completions استفاده کنید. هر زمان لازم شد همان توکن را باطل کنید بی‌آنکه کلید یکپارچه تغییر کند.',
              'Mint a URL token and use /v1/t/<token>/chat/completions. Revoke that one token later without touching the unified key.',
            ),
          },
          {
            q: bi('مدلی با نام غیرلاتین در هدرها عجیب نشان داده می‌شود.', 'A model with a non-Latin name looks mangled in the headers.'),
            a: bi(
              'هدرهای HTTP فقط ASCII چاپ‌پذیر را حمل می‌کنند، بنابراین شناسه‌های خارج از این محدوده درصد-رمزنگاری می‌شوند. مقدار را با decodeURIComponent یا urllib.parse.unquote بخوانید.',
              'HTTP headers carry only printable ASCII, so ids outside that range are percent-encoded. Read the value back with decodeURIComponent or urllib.parse.unquote.',
            ),
          },
        ],
      },
    ],
  },

  {
    id: 'api-admin',
    cat: 'api',
    level: 'pro',
    title: bi('APIهای مدیریتی: بودجه، پشتیبان، MCP', 'Admin APIs: budget, backups, MCP'),
    summary: bi(
      'گزارشِ بودجهٔ ردیف رایگان، چرخهٔ پشتیبان‌گیری و سرور MCP.',
      'Free-tier budget reporting, the backup lifecycle and the MCP server.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'GET /api/free-tier بودجهٔ ردیف رایگان را به‌صورت «یکی‌شده بر حسب استخر سهمیه» برمی‌گرداند: بسیاری از مدل‌های یک پلتفرم یک استخرِ سهمیه دارند، پس جمع‌زدنِ برچسبِ هر مدل دوبرابر می‌شمارد. هر استخر یک بودجهٔ مستند (بزرگ‌ترین مقدارِ قابلِ تجزیه در استخر) دارد که در تعداد کلیدهای قابل استفاده ضرب می‌شود؛ ردیف‌های غیرفعالِ زنجیره هم در استخر حساب می‌شوند (فقط علامت می‌خورند، حذف نمی‌شوند).',
          'GET /api/free-tier returns the free-tier budget pool-deduped: many models on one platform share a quota pool, so summing every model’s label would double-count. Each pool reports one documented budget (the largest parseable value in it), scaled by the number of usable keys; chain-disabled rows still contribute and are only marked, never dropped.',
        ),
      },
      {
        k: 'code',
        lang: 'json',
        caption: bi('پاسخِ خلاصه‌شدهٔ /api/free-tier', 'An abridged /api/free-tier response'),
        code: `{
  "generatedAt": "2026-08-25T12:00:00.000Z",
  "summary": { "poolCount": 18, "documentedMonthlyTokens": 7400000000,
               "creditsBasedPools": 2, "unpublishedPools": 3 },
  "pools": [{
    "poolKey": "google", "platform": "google",
    "memberModelIds": ["gemini-3.0-flash", "gemini-2.5-flash"],
    "modelCount": 2, "disabledModelCount": 0, "keyCount": 1,
    "documentedBudget": 120000000, "bestLabel": "~120M", "kind": "documented",
    "quota": { "limit": 150000000, "remaining": 98000000,
               "resetAt": "2026-08-26T00:00:00.000Z", "metric": "tokens", "keyCount": 1 }
  }]
}`,
      },
      {
        k: 'table',
        head: [bi('متد', 'Method'), bi('مسیر', 'Path'), bi('هدف', 'Purpose')],
        rows: [
          [bi('GET', 'GET'), bi('/api/backups', '/api/backups'), bi('فهرست صفحه‌بندی‌شده (?page و ?pageSize، حداکثر ۲۰۰)', 'Paginated listing (?page & ?pageSize, max 200)')],
          [bi('POST', 'POST'), bi('/api/backups', '/api/backups'), bi('ساخت پشتیبان همین حالا؛ با فهرستِ اختیاری tables', 'Create a backup now, with an optional tables whitelist')],
          [bi('GET', 'GET'), bi('/api/backups/:id/download', '/api/backups/:id/download'), bi('دریافت فایل رمزنگاری‌شده', 'Download the encrypted dump')],
          [bi('POST', 'POST'), bi('/api/backups/:id/restore', '/api/backups/:id/restore'), bi('بازیابی در پایگاه دادهٔ زنده (رد کردنِ کلید یا قالبِ متفاوت)', 'Restore into the live DB (refuses mismatched key/format)')],
          [bi('DELETE', 'DELETE'), bi('/api/backups/:id', '/api/backups/:id'), bi('حذف یک پشتیبان', 'Delete one backup')],
          [bi('GET / PUT', 'GET / PUT'), bi('/api/backups/schedule', '/api/backups/schedule'), bi('خواندن/نوشتن برنامهٔ زمانی (HH:mm، فاصلهٔ روزانه، مسیر)', 'Read/write the schedule (HH:mm, interval days, path)')],
          [bi('PUT', 'PUT'), bi('/api/settings/enable-mcp', '/api/settings/enable-mcp'), bi('روشن/خاموش کردن سرور MCP', 'Toggle the MCP server')],
          [bi('PATCH', 'PATCH'), bi('/api/keys/:id', '/api/keys/:id'), bi('سقف ماهانهٔ درخواست و توکن (۰ یعنی نامحدود)', 'Monthly request and token caps (0 = unlimited)')],
        ],
      },
      {
        k: 'callout',
        tone: 'tip',
        title: bi('MCP پیش‌فرض خاموش است', 'MCP is off by default'),
        text: bi(
          'نصب‌های تازه با MCP خاموش شروع می‌شوند؛ نصب‌هایی که هنگام ارتقا کلید داشتند روشن می‌مانند تا نشستِ Claude Code یا Cline نشکند. هنگام خاموش بودن، هر فعلی روی /mcp با خطای JSON-RPC و ۴۰۳ پاسخ می‌گیرد.',
          'Fresh installs start with MCP off; installs that already had provider keys keep it on so an existing session does not break. While off, every verb on /mcp answers 403 with a JSON-RPC error.',
        ),
      },
      {
        k: 'code',
        lang: 'bash',
        code: `# فعال کردن MCP
curl -X PUT http://localhost:3001/api/settings/enable-mcp \\
  -H "Authorization: Bearer <dashboard-token>" -H "Content-Type: application/json" \\
  -d '{"enabled": true}'

# افزودن به Claude Code
claude mcp add --transport http freellmapi http://localhost:3001/mcp \\
  --header "Authorization: Bearer freellmapi-your-unified-key"`,
      },
    ],
  },

  /* ─────────────────────────── CLIENTS ─────────────────────────── */
  {
    id: 'clients-agents',
    cat: 'clients',
    level: 'start',
    title: bi('اتصال عامل‌های کدنویسی', 'Connecting coding agents'),
    summary: bi(
      'جدولِ جست‌وجوپذیرِ عامل‌ها با فرمان آماده و پایهٔ URL درست.',
      'A searchable agents table with the ready command and the right base URL.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'هر کلاینتی که بتواند به یک پایهٔ URL سازگار با OpenAI اشاره کند، کار می‌کند. یک تفاوت مهم وجود دارد: کلود کد انتظار دارد پایهٔ URL ریشهٔ سرور باشد (چون خودش مسیر Messages را می‌چسباند)، در حالی که بقیه — Cline، Aider، Goose، Codex، Continue، OpenCode، Qwen، Roo، Kilo، Crush و … — انتظار دارند /v1 در آدرس باشد.',
          'Any client that can target an OpenAI-compatible base URL works. One distinction matters: Claude Code expects the server root (because it appends the Anthropic Messages path itself), while the rest — Cline, Aider, Goose, Codex, Continue, OpenCode, Qwen, Roo, Kilo, Crush and friends — expect /v1 in the URL.',
        ),
      },
      {
        k: 'agents',
        items: [
          { name: 'Claude Code', cmd: 'npx freellmapi setup-claude --url http://localhost:3001', url: 'http://localhost:3001', wire: bi('Anthropic Messages', 'Anthropic Messages') },
          { name: 'Codex CLI', cmd: 'npx freellmapi setup-codex --url http://localhost:3001', url: 'http://localhost:3001/v1', wire: bi('Responses (wire_api = "responses")', 'Responses (wire_api = "responses")') },
          { name: 'Cline', cmd: 'npx freellmapi setup-cline --url http://localhost:3001', url: 'http://localhost:3001/v1', wire: bi('OpenAI Chat', 'OpenAI Chat') },
          { name: 'Continue', cmd: 'npx freellmapi setup-continue --url http://localhost:3001', url: 'http://localhost:3001/v1', wire: bi('Chat / legacy Completions', 'Chat / legacy Completions') },
          { name: 'Aider', cmd: 'npx freellmapi setup-aider --url http://localhost:3001', url: 'http://localhost:3001/v1', wire: bi('OpenAI Chat', 'OpenAI Chat') },
          { name: 'OpenCode', cmd: 'npx freellmapi setup-opencode --url http://localhost:3001', url: 'http://localhost:3001/v1', wire: bi('OpenAI Chat', 'OpenAI Chat') },
          { name: 'Goose', cmd: 'npx freellmapi setup-goose --url http://localhost:3001', url: 'http://localhost:3001/v1', wire: bi('OpenAI Chat', 'OpenAI Chat') },
          { name: 'Qwen Code', cmd: 'npx freellmapi setup-qwen --url http://localhost:3001', url: 'http://localhost:3001/v1', wire: bi('OpenAI Chat (Gemini بومی هم کار می‌کند)', 'OpenAI Chat (native Gemini works too)') },
          { name: 'Roo Code', cmd: 'npx freellmapi setup-roo --url http://localhost:3001', url: 'http://localhost:3001/v1', wire: bi('OpenAI Chat', 'OpenAI Chat') },
          { name: 'Kilo Code', cmd: 'npx freellmapi setup-kilo --url http://localhost:3001', url: 'http://localhost:3001/v1', wire: bi('OpenAI Chat', 'OpenAI Chat') },
          { name: 'Crush', cmd: 'npx freellmapi setup-crush --url http://localhost:3001', url: 'http://localhost:3001/v1', wire: bi('OpenAI Chat', 'OpenAI Chat') },
          { name: 'DeepSeek Harness (dsh)', cmd: 'npx freellmapi setup-dsh --url http://localhost:3001', url: 'http://localhost:3001/v1', wire: bi('api: openai-completions', 'api: openai-completions') },
          { name: 'MiMo Code', cmd: 'npx freellmapi setup-mimo --url http://localhost:3001', url: 'http://localhost:3001/v1', wire: bi('OpenAI Chat', 'OpenAI Chat') },
          { name: 'AtomCode', cmd: 'npx freellmapi setup-atomcode --url http://localhost:3001', url: 'http://localhost:3001/v1', wire: bi('type = "openai"', 'type = "openai"') },
          { name: 'OpenClaw', cmd: 'npx freellmapi setup-openclaw --url http://localhost:3001', url: 'http://localhost:3001/v1', wire: bi('api: openai-completions', 'api: openai-completions') },
          { name: 'Hermes Agent', cmd: 'npx freellmapi setup-hermes --url http://localhost:3001', url: 'http://localhost:3001/v1', wire: bi('provider: custom', 'provider: custom') },
          { name: 'Pi', cmd: 'npx freellmapi setup-pi --url http://localhost:3001', url: 'http://localhost:3001/v1', wire: bi('api: openai-completions', 'api: openai-completions') },
          { name: 'Reasonix', cmd: 'npx freellmapi setup-reasonix --url http://localhost:3001', url: 'http://localhost:3001/v1', wire: bi('kind = "openai"', 'kind = "openai"') },
          { name: 'QwenPaw', cmd: 'تنظیم دستی: base URL + کلید یکپارچه', url: 'http://localhost:3001/v1', wire: bi('chat.completions', 'chat.completions') },
          { name: 'Cursor', cmd: 'npx freellmapi setup-cursor', url: 'https://…/v1 (عمومی)', wire: bi('OpenAI Chat', 'OpenAI Chat') },
          { name: 'هر چیز دیگر', cmd: 'npx freellmapi setup-generic --url http://localhost:3001', url: 'http://localhost:3001/v1', wire: bi('OpenAI Chat', 'OpenAI Chat') },
        ],
      },
    ],
  },

  {
    id: 'clients-cli',
    cat: 'clients',
    level: 'core',
    title: bi('CLI خودکار (npx freellmapi)', 'The CLI generator (npx freellmapi)'),
    summary: bi(
      'تولید پیکربندی از روی کاتالوگ زنده، با dry-run و پشتیبانِ زمان‌دار.',
      'Generate config from the live catalog, with dry-run and timestamped backups.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'به جای ویرایش دستی فایل‌های پیکربندی از مولد استفاده کنید: این ابزار مدل‌هایی را که سرور واقعاً سرو می‌کند می‌خواند و همان فایلی را می‌نویسد که هر ابزار انتظار دارد. --dry-run فقط یک diff چاپ می‌کند؛ نوشتنِ واقعی با پیکربندی موجود ادغام می‌شود و ابتدا یک پشتیبانِ زمان‌دار می‌سازد.',
          'Use the generator instead of hand-editing a client configuration: it reads the models your server is actually serving and writes the file each tool expects. --dry-run prints a diff; real writes merge with the existing configuration and create a timestamped backup first.',
        ),
      },
      {
        k: 'code',
        tabs: [
          {
            label: 'راه‌اندازی',
            lang: 'bash',
            code: `export FREELLMAPI_API_KEY=<unified-key>   # یا --api-key در هر فرمان
npx freellmapi setup-claude --url http://localhost:3001 --dry-run
npx freellmapi setup-claude --url http://localhost:3001
npx freellmapi setup-dsh --url http://localhost:3001 --api-key <unified-key>
npx freellmapi list            # ابزارهای پشتیبانی‌شده و پایهٔ URL هر کدام`,
          },
          {
            label: 'کلیدهای ارائه‌دهنده',
            lang: 'bash',
            code: `# این فرمان‌ها به «توکن نشست داشبورد» نیاز دارند، نه کلید یکپارچه
export FREELLMAPI_URL=http://localhost:3001
export FREELLMAPI_DASHBOARD_TOKEN='<dashboard-session-token>'

npx freellmapi keys add groq                 # درخواست کلید به‌صورت پنهان
npx freellmapi keys add groq --key '<key>'   # حالت غیرتعاملی
npx freellmapi keys list
npx freellmapi keys test groq                # بررسی همهٔ کلیدهای ذخیره‌شده
npx freellmapi keys test groq --id 7         # بررسی یک کلید`,
          },
          {
            label: 'اجرا با تزریق اعتبار',
            lang: 'bash',
            code: `# بدون نوشتنِ هیچ چیز روی دیسک: اعتبار در فرایند فرزند تزریق می‌شود
npx freellmapi launch        --url http://localhost:3001
npx freellmapi launch-codex  --url http://localhost:3001`,
          },
        ],
      },
      {
        k: 'table',
        head: [bi('نشان', 'Flag'), bi('معنا', 'Meaning')],
        rows: [
          [bi('--url URL', '--url URL'), bi('پایهٔ URL دروازه (پیش‌فرض http://localhost:3001)', 'Gateway base URL (default http://localhost:3001)')],
          [bi('--api-key KEY', '--api-key KEY'), bi('کلید یکپارچه', 'The unified API key')],
          [bi('--profile NAME', '--profile NAME'), bi('نام‌گذاری پروفایل/مدخلِ تولیدشده', 'Name the generated profile/provider entry')],
          [bi('--model ID', '--model ID'), bi('پین کردن یک مدل به جای پیش‌فرض کاتالوگ', 'Pin a model instead of the catalog default')],
          [bi('--dry-run', '--dry-run'), bi('چاپ diff و ننوشتنِ هیچ چیز', 'Print the diff and write nothing')],
        ],
        caption: bi(
          'FREELLMAPI_URL و FREELLMAPI_API_KEY جایگزینِ --url و --api-key هستند.',
          'FREELLMAPI_URL and FREELLMAPI_API_KEY work in place of --url and --api-key.',
        ),
      },
      {
        k: 'callout',
        tone: 'warn',
        text: bi(
          'فرمان‌های keys به توکن نشستِ داشبورد نیاز دارند (در مرورگرِ واردشده با نام freellmapi_dashboard_token در localStorage). کلید یکپارچه برای این فرمان‌ها کار نمی‌کند و CLI توکن را ذخیره نمی‌کند.',
          'The keys commands need a dashboard session token (stored in the signed-in browser as freellmapi_dashboard_token). The unified API key cannot authenticate them, and the CLI does not persist the token.',
        ),
      },
    ],
  },

  {
    id: 'clients-extras',
    cat: 'clients',
    level: 'pro',
    title: bi('تحویل زمینه، autocomplete و کلاینت‌های بدون هدر', 'Context handoff, autocomplete & headerless clients'),
    summary: bi(
      'وقتی مدل در میانهٔ گفت‌وگو عوض می‌شود چه می‌ماند، و ابزارهایی که هدر نمی‌فرستند.',
      'What survives a mid-chat model switch, and the tools that send no headers.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'وقتی دروازه به‌دلیل سهمیه، محدودیت نرخ یا دورهٔ سردشدن به مدل دیگری منتقل می‌شود، مدل جدید نمی‌داند دارد کارِ دیگری را ادامه می‌دهد. «تحویل زمینه» یک پیام system فشرده به درخواست خروجی می‌افزاید که دقیقاً همین را توضیح می‌دهد و خلاصه‌ای از چند نوبت اخیر را هم می‌آورد.',
          'When the gateway falls over to a different model mid-conversation (quota, rate limit, cooldown), the new model has no idea it is picking up someone else’s task. Context handoff adds one compact system message to the outbound request saying exactly that, plus a short summary of recent turns.',
        ),
      },
      {
        k: 'code',
        lang: 'env',
        caption: bi('فعال‌سازی تحویل زمینه', 'Enabling context handoff'),
        code: `FREELLMAPI_CONTEXT_HANDOFF=on_model_switch`,
      },
      {
        k: 'list',
        items: [
          bi('پیام‌ها در حافظه نگهداری می‌شوند (TTL سه ساعت) و چیزی روی دیسک نوشته یا لاگ نمی‌شود.', 'Messages are stored in memory (3-hour TTL); nothing is written to disk or logged.'),
          bi('فقط زمانی تزریق می‌شود که مدلِ انتخاب‌شده برای آن کلیدِ نشست تغییر کند — نه در نخستین درخواست و نه در ادامه با همان مدل.', 'Injected only when the selected model changes for a session key — not on the first request, not on same-model continuations.'),
          bi('کلید نشست: هدر X-Session-Id در صورت وجود، وگرنه SHA-1ِ نخستین پیام کاربر (همان منطقِ نشست‌های چسبنده).', 'Session key: the X-Session-Id header if present, otherwise SHA-1 of the first user message (same as sticky sessions).'),
          bi('نشست‌های چسبنده گفت‌وگو را ۳۰ دقیقه روی یک مدل نگه می‌دارند؛ تحویل زمینه فقط برای تعویضِ واقعی است.', 'Sticky sessions keep a conversation on one model for 30 minutes; handoff covers the switch that still happens.'),
        ],
      },
      {
        k: 'callout',
        tone: 'tip',
        title: bi('Ghost-text در VS Code با Continue', 'VS Code ghost-text with Continue'),
        text: bi(
          'Continue از مسیر /v1/completions (تکمیلِ متنیِ قدیمی) برای پیشنهاد درون‌خطی استفاده می‌کند؛ دروازه این سطح را هم سرو می‌کند، پس تکمیلِ خودکار در ویرایشگر هم از استخرِ رایگان شما عبور می‌کند.',
          'Continue uses the legacy /v1/completions surface for inline suggestions; the gateway serves that too, so editor autocomplete runs against your free pool as well.',
        ),
      },
      {
        k: 'callout',
        tone: 'warn',
        text: bi(
          'تحویل زمینه نمی‌تواند وضعیتِ پنهانِ درونِ ارائه‌دهنده یا پیام‌هایی را که هرگز از پروکسی عبور نکرده‌اند بازیابی کند؛ این محدودیت را در طراحیِ برنامه‌تان در نظر بگیرید.',
          'Handoff cannot recover provider-internal hidden state or messages that were never sent through the proxy — design around that limit.',
        ),
      },
    ],
  },

  /* ─────────────────────────── ROUTING ─────────────────────────── */
  {
    id: 'routing-pipeline',
    cat: 'routing',
    level: 'core',
    title: bi('مسیر یک درخواست', 'The life of a request'),
    summary: bi('از Bearer تا توکنِ استریم‌شده، گام‌به‌گام.', 'From bearer token to streamed tokens, step by step.'),
    blocks: [
      {
        k: 'flow',
        items: [
          {
            title: bi('ورود و محدودسازی', 'Ingress & limits'),
            text: bi('محدودکنندهٔ نرخ پروکسی بر اساس IP، احراز هویت با کلید یکپارچه یا توکن URL، و محدودکنندهٔ نرخِ هر کلید.', 'The per-IP proxy rate limiter, auth via the unified key or a URL token, and the per-key rate limiter.'),
          },
          {
            title: bi('فشرده‌سازی (در صورت فعال بودن)', 'Compression (if enabled)'),
            text: bi('حذف تکرار، فیلتر خروجی ابزار، فشرده‌سازی JSON و هرسِ زمینهٔ کهنه — پیش از جست‌وجوی کش و مسیریابی.', 'Deduplication, tool-output filtering, JSON compaction and stale-context pruning — before cache lookup and routing.'),
          },
          {
            title: bi('جست‌وجوی کش (در صورت فعال بودن)', 'Cache lookup (if enabled)'),
            text: bi('کلیدِ SHA-256 روی کل درخواست؛ برخورد یعنی پاسخ بدون مصرفِ سهمیه (استریم هم عیناً پخش می‌شود).', 'A SHA-256 key over the full request; a hit costs zero provider quota (a streamed hit replays verbatim).'),
          },
          {
            title: bi('انتخاب مدل', 'Model selection'),
            text: bi('رتبه‌بندی بر اساس استراتژی، امتیازهای زنده، دروازه‌های توانمندی و نوع کار؛ سپس انتخاب کلید با بیشترین سهمیهٔ باقی‌مانده.', 'Rank by strategy, live scores, capability gates and task type; then pick the key with the most remaining quota.'),
          },
          {
            title: bi('رمزگشایی و فراخوانی', 'Decrypt & call'),
            text: bi('کلید ارائه‌دهنده فقط در حافظه رمزگشایی می‌شود و آداپتورِ آن ارائه‌دهنده فراخوانی می‌شود.', 'The provider key is decrypted in memory only and that provider’s adapter is called.'),
          },
          {
            title: bi('جایگزینی در خطا', 'Failover on error'),
            text: bi('در ۴۲۹/۵xx (و stall استریم) کلید سرد می‌شود، مدل بعدی تلاش می‌شود و همه‌چیز در Trail/Detail ثبت می‌گردد.', 'On a 429/5xx (or a stream stall) the key is cooled, the next model is tried, and everything is recorded in Trail/Detail.'),
          },
          {
            title: bi('نجات ابزار و پاسخ', 'Tool rescue & response'),
            text: bi('فراخوانی‌های ابزارِ متنی به tool_calls واقعی تبدیل می‌شوند و پاسخ با هدرهای مسیریابی برمی‌گردد.', 'Plain-text tool calls are converted into real tool_calls, and the response goes back with the routing headers.'),
          },
          {
            title: bi('ثبت و اندازه‌گیری', 'Record & measure'),
            text: bi('دفتر سهمیه، تحلیل‌ها، شمارنده‌های نرخ و در صورت نیاز لاگِ درخواست — برای امتیازدهیِ بعدی.', 'Quota ledger, analytics, rate counters and (optionally) request logs — feeding the next round of scoring.'),
          },
        ],
      },
    ],
  },

  {
    id: 'routing-scoring',
    cat: 'routing',
    level: 'pro',
    title: bi('امتیازدهی و مسیریابِ bandit', 'Scoring and the bandit router'),
    summary: bi(
      'قابلیت‌اطمینان، سرعت، هوش و سهمیهٔ باقی‌مانده — با ۱۰٪ کاوش.',
      'Reliability, speed, intelligence and headroom — with 10% exploration.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'مسیریاب یک مسیریابِ Thompson-sampling است که پسین‌های قابلیت‌اطمینان، سرعت، هوش و سهمیهٔ باقی‌مانده را با حدود ۱۰٪ کاوش متوازن می‌کند. یعنی هم از بهترین گزینهٔ شناخته‌شده استفاده می‌کند و هم همیشه مقدار کمی ترافیک را صرفِ یادگیری دربارهٔ بقیه می‌کند — وقتی یک مدل افت می‌کند یا یک مدل تازه وارد می‌شود، این همان چیزی است که تغییر را کشف می‌کند.',
          'The router is a Thompson-sampling bandit balancing reliability, speed, intelligence and headroom posteriors with about 10% exploration. It exploits the best-known option while always spending a slice of traffic on learning about the rest — which is what notices when a model degrades or a new one arrives.',
        ),
      },
      {
        k: 'table',
        head: [bi('بُعد', 'Axis'), bi('چه چیزی اندازه‌گیری می‌شود', 'What is measured')],
        rows: [
          [bi('قابلیت‌اطمینان', 'Reliability'), bi('نرخ موفقیت اخیر؛ در balanced وزنِ اول را دارد.', 'Recent success rate; carries the first weight in balanced.')],
          [bi('سرعت', 'Speed'), bi('توان عملیاتی و زمان تا نخستین توکن (TTFT).', 'Throughput and time-to-first-byte (TTFT).')],
          [bi('هوش', 'Intelligence'), bi('امتیاز توانمندیِ مدل در کاتالوگ.', 'The model’s capability score in the catalog.')],
          [bi('سهمیهٔ باقی‌مانده', 'Headroom'), bi('یک منهای بیشینهٔ مصرفِ RPM/RPD/TPM/TPD؛ صفر یعنی ته‌کشیده.', '1 − max(RPM/RPD/TPM/TPD used); 0 means exhausted.')],
        ],
      },
      {
        k: 'list',
        items: [
          bi('استراتژیِ انتخاب کلید، بیشترین سهمیهٔ باقی‌مانده در استخر را برمی‌گزیند («least-remaining» برعکسِ نامش).', 'The key-selection strategy picks the key with the most remaining quota in the pool.'),
          bi('وزن‌های سفارشی را می‌توان با MODEL_ROUTING_OVERRIDES تغییر داد.', 'Custom weights are available through MODEL_ROUTING_OVERRIDES.'),
          bi('بودجهٔ TTFT برای حذف مدل‌هایی که خیلی کند پاسخ می‌دهند قابل تنظیم است (TTFB_BUDGET_*).', 'A TTFB budget drops models that answer too slowly (TTFB_BUDGET_*).'),
          bi('درخواست‌های ابزار فقط به مدل‌هایی می‌روند که ابزار را پشتیبانی می‌کنند؛ این یک دروازه است، نه ترجیح.', 'Tool requests only go to models that support tools — a gate, not a preference.'),
        ],
      },
    ],
  },

  {
    id: 'routing-quota',
    cat: 'routing',
    level: 'core',
    title: bi('سهمیه، دوره‌های سردشدن و پیش‌بینی', 'Quota, cooldowns and forecasts'),
    summary: bi(
      'شمارنده‌های هر کلید، یادگیریِ سقف‌ها و پیش‌بینیِ اتمام.',
      'Per-key counters, learned ceilings and exhaustion forecasts.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'شمارنده‌های RPM/RPD/TPM/TPD برای هر (پلتفرم، مدل، کلید) در حافظه نگهداری می‌شوند و پشتیبانِ SQLite دارند؛ سقف‌هایی که ارائه‌دهنده گزارش می‌دهد یاد گرفته می‌شوند تا مسیریابی همیشه زیرِ همهٔ سقف‌ها بماند. یک ۴۲۹ باعث می‌شود آن کلید برای مدتی «سرد» شود (و مدل بعدی تلاش شود)، و وضعیتِ exhausted در کاتالوگ دقیقاً همین است: کلیدها هستید اما همه در همین لحظه مسدودند.',
          'In-memory RPM/RPD/TPM/TPD counters per (platform, model, key) are backed by SQLite, and providers’ reported ceilings are learned so routing stays under every cap. A 429 cools that key down for a while (and the next model is tried); the catalog’s exhausted state is exactly this — keys match, but all are blocked at this moment.',
        ),
      },
      {
        k: 'table',
        head: [bi('مفهوم', 'Concept'), bi('توضیح', 'Explanation')],
        rows: [
          [bi('استخر سهمیه', 'Quota pool'), bi('چند مدل/کلید یک پلتفرم یک مجوزِ مشترک دارند (مثلاً openrouter::free یا google::project).', 'Several models/keys on a platform share one allowance (e.g. openrouter::free, google::project).')],
          [bi('سهمیهٔ باقی‌مانده', 'Headroom'), bi('۱ منهای بیشینهٔ مصرف در چهار پنجره؛ صفر یعنی ته‌کشیده، یک یعنی کامل.', '1 − max used across the four windows; 0 is exhausted, 1 is full.')],
          [bi('دورهٔ سردشدن', 'Cooldown'), bi('پس از ۴۲۹/۵xx، کلید تا پایان دوره کنار گذاشته می‌شود و مدل بعدی امتحان می‌گردد.', 'After a 429/5xx a key is sidelined until the cooldown expires while the next model is tried.')],
          [bi('مشاهدهٔ زنده', 'Live observation'), bi('limit / remaining / reset که ارائه‌دهنده گزارش می‌دهد؛ متریک به ترتیب tokens → credits → neurons → requests.', 'Limit / remaining / reset reported by the provider; metric prefers tokens → credits → neurons → requests.')],
          [bi('پیش‌بینی', 'Forecast'), bi('تخمینِ زمانِ اتمام بر اساس روند مصرف (در /api/quota-forecast و تب Quota signals).', 'Estimated exhaustion time from the usage trend (on /api/quota-forecast and the Quota signals tab).')],
        ],
      },
      {
        k: 'callout',
        tone: 'warn',
        title: bi('هوش در پایان روز افت می‌کند', 'Intelligence degrades as the day goes on'),
        text: bi(
          'مدل‌های رتبهٔ اول معمولاً کمترین سقفِ روزانه را دارند. وقتی سهمیه‌شان تمام می‌شود، مسیریاب به مدل‌های کوچک‌ترِ پایینِ زنجیره می‌رود و سطحِ مؤثرِ هوش تا نیمه‌شب UTC پایین می‌آید.',
          'Your top-ranked models usually carry the lowest daily caps. Once they hit their limits the router walks down the chain to smaller models, and the effective intelligence of the endpoint drops until UTC midnight.',
        ),
      },
    ],
  },

  {
    id: 'routing-degraded',
    cat: 'routing',
    level: 'pro',
    title: bi('حالت تنزل‌یافته، نشست‌های چسبنده و نجات ابزار', 'Degraded mode, sticky sessions & tool rescue'),
    summary: bi(
      'وقتی استخر زخمی است چه می‌شود، و چگونه جابه‌جایی بی‌صدا انجام می‌شود.',
      'What happens when the pool is wounded, and how switches are smoothed.',
    ),
    blocks: [
      {
        k: 'list',
        items: [
          bi('حالت تنزل‌یافته (degraded) وقتی بخشی از استخر در دسترس نیست اعلام می‌شود و در داشبورد با یک نوار وضعیت دیده می‌شود.', 'Degraded mode is declared when part of the pool is unavailable and surfaces as a status banner in the dashboard.'),
          bi('نشست‌های چسبنده گفت‌وگو را ۳۰ دقیقه روی یک مدل نگه می‌دارند تا تعویضِ بی‌دلیلِ مدل رخ ندهد.', 'Sticky sessions keep a conversation on one model for 30 minutes to avoid needless model switching.'),
          bi('اگر با وجود این، جابه‌جایی لازم شود، تحویل زمینه یک پیام system فشرده می‌افزاید تا مدل جدید کار را از نو شروع نکند.', 'If a switch is still needed, context handoff adds a compact system message so the new model does not restart the task.'),
          bi('مدل‌هایی که فراخوانی ابزار را به‌صورت متن می‌نویسند، به tool_calls واقعی نجات داده می‌شوند؛ و درخواست‌های ابزار فقط به مدل‌های پشتیبان‌کننده می‌روند.', 'Models that write tool calls as text are rescued into real tool_calls, and tool requests only route to models that support them.'),
          bi('رویدادهای محدودیت نرخ (و جهش‌ها) در داشبورد ثبت و نمایش داده می‌شوند تا الگو را ببینید.', 'Rate-limit events (and spikes) are recorded and shown in the dashboard so you can see the pattern.'),
        ],
      },
      {
        k: 'quiz',
        q: bi('اگر مدلی که استفاده می‌کنید در اواسط روز شروع به دریافت ۴۲۹ کند، چه رفتاری انتظار دارید؟', 'A model you rely on starts getting 429s mid-day. What do you expect?'),
        options: [
          bi('دروازه همان مدل را تا ابد دوباره تلاش می‌کند.', 'The gateway retries the same model forever.'),
          bi('کلید وارد دورهٔ سردشدن می‌شود، مدل بعدی در زنجیره تلاش می‌شود و Trail دلیل را ثبت می‌کند.', 'The key enters cooldown, the next model in the chain is tried, and the Trail records why.'),
          bi('کلِ سرویس تا نیمه‌شب از کار می‌افتد.', 'The whole service goes down until midnight.'),
        ],
        answer: 1,
        why: bi(
          'دقیقاً همین اتفاق می‌افتد — و نتیجه این است که سطحِ هوش در ساعات پایانی روز پایین می‌آید تا زمانی که سهمیه‌ها در نیمه‌شب UTC بازنشانی شوند.',
          'Exactly — and the consequence is that effective intelligence drops in the late hours until quotas reset at UTC midnight.',
        ),
      },
    ],
  },

  /* ─────────────────────────── OPTIMIZE ─────────────────────────── */
  {
    id: 'opt-compression',
    cat: 'optimize',
    level: 'pro',
    title: bi('فشرده‌سازیِ پرامپت', 'Prompt compression'),
    summary: bi(
      'چهار حالت، موتورهای مستقل و کنترلِ هر درخواست با هدر.',
      'Four modes, independent engines and per-request control via a header.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'نشست‌های طولانیِ عامل‌های کدنویسی بارها system prompt، خواندنِ فایل، خروجیِ فرمان و طرح‌وارهٔ ابزارها را می‌فرستند. فشرده‌سازی این زمینه را پیش از جست‌وجوی کش، بودجه‌بندی توکن و مسیریابی کوچک می‌کند، در نتیجه مسیریاب برآوردِ کمتری می‌بیند و مدل‌های با زمینهٔ کوچک‌تر هم واجد شرایط می‌مانند. پاسخ ارائه‌دهنده هرگز بازنویسی نمی‌شود و فشرده‌سازی به‌طور پیش‌فرض خاموش است.',
          'Long coding-agent sessions repeatedly send system prompts, file reads, command output and tool schemas. Compression shrinks that context before cache lookup, token budgeting and routing, so the router sees a smaller estimate and more small-context models stay eligible. Provider responses are never rewritten, and compression is off by default.',
        ),
      },
      {
        k: 'matrix',
        cols: [bi('off', 'off'), bi('lossless', 'lossless'), bi('standard', 'standard'), bi('aggressive', 'aggressive')],
        rows: [
          [
            bi('موتورها', 'Engines'),
            bi('هیچ', 'None'),
            bi('حذف تکرارِ بلوک‌ها، بهداشتِ فاصله‌ها، رمزگذاریِ جدولیِ JSON همگن', 'Repeated-block dedup, whitespace hygiene, reversible homogeneous-JSON table encoding'),
            bi('lossless + فیلتر خروجیِ ابزارِ آگاه‌از-فرمان و جایگزینیِ خواندنِ فایل کهنه', 'lossless + command-aware tool-output filtering and stale file-read supersession'),
            bi('standard + چگالشِ نوبت‌های قدیمی‌تر، فیلترِ مرتبط‌بودنِ واژگانی و هدفِ سختِ توکن', 'standard + older-turn condensation, lexical relevance filtering and an optional hard token target'),
          ],
          [
            bi('قابل افزایش با هدر؟', 'Raisable by header?'),
            bi('خیر — کلید اصلی است', 'No — it is a master switch'),
            bi('هدر فقط می‌تواند پایین بیاورد', 'Header can only lower it'),
            bi('هدر فقط می‌تواند پایین بیاورد', 'Header can only lower it'),
            bi('هدر فقط می‌تواند پایین بیاورد', 'Header can only lower it'),
          ],
        ],
        notes: [
          bi('پیش‌فرض و امن‌ترین حالت: هیچ بازنویسی‌ای روی درخواست انجام نمی‌شود.', 'The default and the safest: no request rewriting at all.'),
          bi('برگشت‌پذیر است؛ برای بیشتر بارهای کاری بی‌خطر.', 'Reversible; safe for most workloads.'),
          bi('تعادلی که برای عامل‌های کدنویسی طراحی شده است.', 'The balance designed for coding agents.'),
          bi('بیشترین صرفه‌جویی، اما ممکن است متنِ کهنه را خلاصه کند — ابتدا با یک نشست واقعی بسنجید.', 'The biggest saving, but it may condense older text — measure on a real session first.'),
        ],
      },
      {
        k: 'code',
        tabs: [
          {
            label: 'فعال‌سازی',
            lang: 'env',
            code: `# یا در داشبورد: Settings → Prompt compression
FREELLMAPI_COMPRESSION=lossless`,
          },
          {
            label: 'کنترل هر درخواست',
            lang: 'bash',
            code: `curl http://localhost:3001/v1/chat/completions \\
  -H "Authorization: Bearer freellmapi-..." \\
  -H "X-FreeLLM-Compress: off" -H "Content-Type: application/json" \\
  -d '{"model":"auto","messages":[{"role":"user","content":"hi"}]}'

# پاسخ گزارش می‌دهد: X-FreeLLM-Compress: standard; saved~=1840`,
          },
        ],
      },
      {
        k: 'callout',
        tone: 'note',
        text: bi(
          'همین خط‌لوله روی Chat Completions، Responses، پیام‌های Anthropic و شمارش توکنِ Anthropic اجرا می‌شود. پس از ذخیرهٔ تنظیم در داشبورد، مقدارِ ذخیره‌شده بر متغیر محیطی مقدم است.',
          'The same pipeline runs on Chat Completions, Responses, Anthropic Messages and Anthropic token counting. Once saved in the dashboard, the stored setting takes precedence over the environment value.',
        ),
      },
    ],
  },

  {
    id: 'opt-cache',
    cat: 'optimize',
    level: 'core',
    title: bi('کش پاسخ', 'Response cache'),
    summary: bi(
      'حافظهٔ LRU با کلیدِ SHA-256، دروازهٔ دما و TTL — خاموش به‌طور پیش‌فرض.',
      'An in-memory LRU with SHA-256 keys, a temperature gate and a TTL — off by default.',
    ),
    blocks: [
      {
        k: 'list',
        items: [
          bi('تطابقِ دقیق برای درخواست‌های کاملاً یکسان، استریم هم شامل می‌شود (برخورد، SSE ذخیره‌شده را عیناً پخش می‌کند).', 'Exact match for identical requests, streaming included (a hit replays the stored SSE verbatim).'),
          bi('کلیدها SHA-256ِ متعارف روی کل درخواست هستند؛ برخوردها صفر سهمیه مصرف می‌کنند.', 'Keys are canonical SHA-256 over the full request; hits consume zero provider quota.'),
          bi('یک دروازهٔ دما وجود دارد (RESPONSE_CACHE_MAX_TEMPERATURE) تا پاسخ‌های خلاقانه کش نشوند.', 'A temperature gate (RESPONSE_CACHE_MAX_TEMPERATURE) keeps creative responses out of the cache.'),
          bi('با هدر X-FreeLLM-Cache: on|off می‌توان آن را برای یک درخواست روشن یا خاموش کرد.', 'Toggle per request with X-FreeLLM-Cache: on|off.'),
          bi('آمارِ توکن‌های صرفه‌جویی‌شده در داشبورد نشان داده می‌شود.', 'Saved-token stats are shown in the dashboard.'),
        ],
      },
      {
        k: 'table',
        head: [bi('متغیر', 'Variable'), bi('پیش‌فرض', 'Default'), bi('نقش', 'Role')],
        rows: [
          [bi('RESPONSE_CACHE', 'RESPONSE_CACHE'), bi('خاموش', 'off'), bi('روشن/خاموش کردن کل قابلیت', 'Master switch')],
          [bi('RESPONSE_CACHE_TTL_SECONDS', 'RESPONSE_CACHE_TTL_SECONDS'), bi('—', '—'), bi('عمر هر مدخل در حافظه', 'Lifetime of an entry')],
          [bi('RESPONSE_CACHE_MAX_ENTRIES', 'RESPONSE_CACHE_MAX_ENTRIES'), bi('—', '—'), bi('اندازهٔ LRU', 'LRU size')],
          [bi('RESPONSE_CACHE_PERSIST', 'RESPONSE_CACHE_PERSIST'), bi('—', '—'), bi('ماندگاری در بازراه‌اندازی', 'Survive restarts')],
          [bi('RESPONSE_CACHE_MAX_TEMPERATURE', 'RESPONSE_CACHE_MAX_TEMPERATURE'), bi('—', '—'), bi('بالاتر از این دما کش نمی‌شود', 'Above this temperature nothing is cached')],
        ],
      },
    ],
  },

  /* ─────────────────────────── AGENT ─────────────────────────── */
  {
    id: 'agent-philosophy',
    cat: 'agent',
    level: 'core',
    title: bi('فلسفه: مدل پیشنهاد می‌دهد، کد تصمیم می‌گیرد', 'The model proposes, the code decides'),
    summary: bi(
      'هستهٔ قطعی چیست و چرا با یک «عاملِ پرامپتی» فرق دارد.',
      'What the deterministic kernel is and why it differs from a prompt-driven agent.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'دروازه به عامل مدل می‌دهد؛ هسته به آن قضاوت می‌دهد؛ ابزارها دست می‌دهند. انتقالِ حالتِ اجرا، مجوزِ فراخوانی ابزار، انتخابِ ارائه‌دهنده، پاک‌سازیِ راز، ترتیبِ کارها و اینکه آیا ادعای «کار تمام شد» باور شود — همه با کدِ تست‌شده تصمیم گرفته می‌شود، نه با یک مدل زبانی.',
          'The gateway gives the agent models; the kernel gives it judgement; the tools give it hands. Run-state transitions, tool-call permission, provider choice, secret scrubbing, task ordering and whether a “task complete” claim is believed are all decided by tested code, not by a language model.',
        ),
      },
      {
        k: 'code',
        lang: 'bash',
        code: `npm run agent:test        # تست‌های هسته
npm test -w @freellmapi/server   # تست‌های سرور
npm run agent:typecheck   # tsc سخت‌گیرانه، بدون @ts-ignore`,
      },
      {
        k: 'callout',
        tone: 'note',
        title: bi('نام ابزارها بخشی از رابط امنیتی است', 'Tool names are part of the security interface'),
        text: bi(
          'موتورِ سیاست بر اساس پسوندِ نقطه‌ای طبقه‌بندی می‌کند: ‎*.read، ‎*.search و ‎*.list واژگانِ خواندنی هستند. ابزاری که به جای code.references.search نام code.usages.find داشته باشد، بی‌سر و صدا در ردهٔ high / external_write می‌افتد و از هر فاز خودران حذف می‌شود — ثبت می‌شود، اما هرگز به مدل پیشنهاد نمی‌گردد. هر نام ابزار در این پروژه پیش از ثبت، در برابر evaluateToolCall زنده بررسی شده است.',
          'The policy engine classifies by dotted suffix: *.read, *.search and *.list are the read vocabulary. A tool named code.usages.find instead of code.references.search is silently classified high / external_write and dropped from every autonomous phase — registered, but never offered to a model. Every tool name here was verified against a live evaluateToolCall before being committed.',
        ),
      },
    ],
  },

  {
    id: 'agent-modes',
    cat: 'agent',
    level: 'core',
    title: bi('حالت‌های محاسباتی', 'Compute modes'),
    summary: bi(
      'یک کلید بالای صفحه که همه‌چیز را پیکربندی می‌کند: Free / Paid / Local.',
      'One switch at the top that configures everything: Free / Paid / Local.',
    ),
    blocks: [
      {
        k: 'matrix',
        cols: [bi('رایگان (Free)', 'Free'), bi('پولی (Paid)', 'Paid'), bi('محلی (Local)', 'Local')],
        rows: [
          [bi('ابرِ پولی', 'Paid cloud'), bi('❌', '❌'), bi('✅', '✅'), bi('❌', '❌')],
          [bi('هزینهٔ هر اجرا', 'Cost per run'), bi('۰', '0'), bi('تا سقف شما', 'up to your ceiling'), bi('۰', '0')],
          [bi('خروج داده از دستگاه', 'Data leaves the machine'), bi('با رضایت', 'with consent'), bi('با رضایت', 'with consent'), bi('هرگز', 'never')],
          [bi('تلاش تعمیر / کار موازی', 'Repair attempts / parallel'), bi('۲ / ۲', '2 / 2'), bi('۳ / ۴', '3 / 4'), bi('۳ / ۱', '3 / 1')],
          [bi('دروازه‌های کیفیت', 'Quality gates'), bi('۶', '6'), bi('۹', '9'), bi('۸', '8')],
        ],
        notes: [
          bi(
            'پیش‌فرض: سهمیهٔ ابریِ رایگان به‌علاوهٔ مدل محلی. برای شروع و برای کارهای کم‌خطر مناسب است.',
            'The default: free cloud quota plus a local model. Right for getting started and for low-stakes work.',
          ),
          bi(
            'دسترسی کامل با سقف هزینه. بیشترین دروازه‌های کیفیت و بیشترین کار موازی را دارد.',
            'Full access with a cost ceiling. It carries the most quality gates and the most parallelism.',
          ),
          bi(
            'هیچ چیز از دستگاه خارج نمی‌شود — حالت محلی یک دیوار است، نه یک ترجیح؛ رضایتِ صریح هم آن را باز نمی‌کند.',
            'Nothing leaves the machine — local mode is a wall, not a preference; explicit consent does not open it.',
          ),
        ],
      },
      {
        k: 'code',
        lang: 'bash',
        caption: bi(
          'پرس‌وجو از هسته: آیا این فضای‌کاری می‌تواند این حالت را اجرا کند؟ پاسخ در زمانِ انتخاب می‌آید، نه ده دقیقه بعد از شروع اجرا.',
          'Ask the kernel whether a workspace can run a mode — you learn it at selection time, not ten minutes into a run.',
        ),
        code: `curl -s -X POST http://localhost:3001/api/agent/modes/validate \\
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \\
  -d '{"mode":"free","privacyLevel":"confidential","hasLocalRuntime":false,"hasPaidAccess":false}'
# -> {"ok":false,"problems":["..."]}`,
      },
    ],
  },

  {
    id: 'agent-tools',
    cat: 'agent',
    level: 'pro',
    title: bi('۲۳ ابزار حسابرسی‌شده', 'The 23 audited tools'),
    summary: bi(
      'فایل‌سیستم، ناوبری کد، گیت، سندباکس، وب، بازسازی و داده.',
      'Filesystem, code navigation, git, sandbox, web, refactoring and data.',
    ),
    blocks: [
      {
        k: 'tools',
        items: [
          {
            area: bi('فایل‌سیستم', 'Filesystem'),
            names: ['fs.read_file', 'fs.list', 'fs.search', 'fs.file.write'],
            note: bi(
              'محدود به ریشهٔ فضای‌کاری که فراخوان نمی‌تواند انتخاب کند؛ realpath بررسی می‌شود و فایل‌های شکل‌کلید رد می‌شوند. نوشتن از مسیر اتمی می‌گذرد، پس نوشتنِ ناموفق فایل قدیمی را باقی می‌گذارد نه یک فایل ناقص.',
              'Confined to a workspace root the caller cannot choose; realpath is checked and credential-shaped files are refused. Writes go through the atomic path, so a failed write leaves the old file rather than a truncated one.',
            ),
          },
          {
            area: bi('ناوبری کد', 'Code navigation'),
            names: ['code.symbol.search', 'code.outline.read', 'code.file.outline.read', 'code.references.search'],
            note: bi('تعریف‌ها و کاربردها؛ هر کاربرد به عنوان کد / رشته / توضیح / import / تعریف طبقه‌بندی می‌شود.', 'Declarations and uses; each reference is classified as code / string / comment / import / declaration.'),
          },
          {
            area: bi('گیت', 'Git'),
            names: ['git.status.read', 'git.diff.read', 'git.branch.create', 'git.patch.file.write', 'git.commit.create'],
            note: bi('شاخه‌های حفاظت‌شده را نمی‌توان با حذفِ ref دور زد — نوشتن‌ها هدف خود را خودشان حل می‌کنند.', 'Protected branches cannot be evaded by omitting the ref — writes resolve their own target.'),
          },
          {
            area: bi('فورج', 'Forge'),
            names: ['git.pull_request.create'],
            note: bi('با اعتبارِ جداگانه و قابل‌لغو که هرگز در .git/config نوشته نمی‌شود; مخزن از تنظیمات می‌آید، نه از آرگومان ابزار.', 'Under a separate, revocable credential never written to .git/config; the repository comes from configuration, not a tool argument.'),
          },
          {
            area: bi('اجرا', 'Execution'),
            names: ['sandbox.test'],
            note: bi('فضای‌نام user/mount/net/pid: ریشه فقط‌خواندنی، فضای‌کاری نوشتنی، بدون شبکه.', 'A user/mount/net/pid namespace: read-only root, writable workspace, no network.'),
          },
          {
            area: bi('وب', 'Web'),
            names: ['web.page.read', 'web.page.search'],
            note: bi('خروج کنترل‌شده: IPهای متادیتای ابر، بازه‌های خصوصی و آدرس‌های ده‌دهی رد می‌شوند و در هر پرشِ تغییرمسیر دوباره بررسی می‌گردند.', 'Egress-controlled: cloud metadata IPs, private ranges and decimal-encoded addresses are refused and re-checked on every redirect hop.'),
          },
          {
            area: bi('بازسازی', 'Refactoring'),
            names: ['code.rename.preview.read', 'code.rename.apply'],
            note: bi('پیش‌نمایش یک خواندن است؛ اِعمال، پیش‌نمایش را دوباره می‌سازد، digest کهنه را رد می‌کند و یا همهٔ فایل‌ها را می‌نویسد یا هیچ‌کدام را.', 'Preview is a read; apply re-derives the preview, refuses a stale digest and writes every file or none.'),
          },
          {
            area: bi('داده', 'Data'),
            names: ['data.csv.query', 'data.csv.schema.read', 'data.xlsx.query', 'data.xlsx.schema.read'],
            note: bi('SQL روی صفحه‌گسترده در سندباکسی که نمی‌تواند به پایگاه دادهٔ خودِ دروازه برسد. ستون‌ها از مرجعِ r="C2" هر سلول می‌آیند، چون اکسل سلول‌های خالی را حذف می‌کند.', 'SQL over a spreadsheet in a sandbox that cannot reach the gateway’s own database. Columns come from each cell’s r="C2" reference, because Excel omits empty cells.'),
          },
        ],
      },
      {
        k: 'code',
        lang: 'bash',
        caption: bi('فهرست کردن و فراخوانی ابزارها؛ فراخوانیِ ردشده یک پاسخ عادی است، نه خطا.', 'Listing and invoking tools; a denied call is a normal response, not an error.'),
        code: `curl -s localhost:3001/api/agent/tools -H "Authorization: Bearer $TOKEN"

curl -s -X POST localhost:3001/api/agent/tools/invoke \\
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \\
  -d '{"tool":"code.references.search","args":{"name":"resolveScope"}}'

# نمونهٔ پاسخِ ردشده:
# {"outcome":"denied","reason":"connector is missing required scopes: pull_request:write",
#  "riskLevel":"medium","sideEffect":"external_write"}`,
      },
    ],
  },

  {
    id: 'agent-gates',
    cat: 'agent',
    level: 'pro',
    title: bi('شش دروازهٔ هر فراخوانی', 'Six gates per tool call'),
    summary: bi(
      'از ثبت تا ردیفِ حسابرسی — و چرا رد شدن هم ثبت می‌شود.',
      'From registration to the audit row — and why a refusal is recorded too.',
    ),
    blocks: [
      {
        k: 'flow',
        items: [
          { title: bi('ثبت (registration)', 'Registration'), text: bi('ابزار باید در رجیستری باشد؛ تعداد و فهرست ابزارها خودشان با تست بررسی می‌شوند.', 'The tool must exist in the registry; the count and roster are themselves test-checked.') },
          { title: bi('اعتبارسنجی JSON Schema', 'JSON Schema validation'), text: bi('آرگومان‌ها پیش از هر چیز در برابر طرح‌واره بررسی می‌شوند.', 'Arguments are validated against the schema before anything else.') },
          { title: bi('موتور سیاست (policy engine)', 'Policy engine'), text: bi('طبقه‌بندیِ ریسک بر اساس نام، اسکوپ‌ها، شاخه‌ها و حالت محاسباتی.', 'Risk classification from the name, scopes, branches and compute mode.') },
          { title: bi('تأیید انسانی', 'Human approval'), text: bi('در حالت supervised هر چیز با اثرِ جانبیِ بیرونی نیازمند تأیید است.', 'In supervised mode anything with an external side effect needs approval.') },
          { title: bi('سقف زمان', 'Timeout ceiling'), text: bi('هر فراخوانی سقفی دارد؛ اجرا در سندباکس زمان‌سنجی می‌شود.', 'Every call has a ceiling; sandbox execution is timed.') },
          { title: bi('ردیف حسابرسی', 'Audit row'), text: bi('در agent_tool_calls ثبت می‌شود — حتی تلاش‌های ردشده.', 'It lands in agent_tool_calls — including the refused attempts.') },
        ],
      },
      {
        k: 'callout',
        tone: 'tip',
        text: bi(
          'فراخوانیِ ردشده outcome: "denied" با دلیل برمی‌گرداند. پرتابِ استثنا ندارد و همچنان ثبت می‌شود — یک تلاشِ ردشده دقیقاً همان چیزی است که می‌خواهید در ردیف حسابرسی داشته باشید.',
          'A refused call returns outcome: "denied" with a reason. It does not throw, and it is still recorded — a denied attempt is exactly what you want in an audit trail.',
        ),
      },
      {
        k: 'code',
        lang: 'json',
        caption: bi('سه پرسشِ سیاستی و پاسخ‌شان. حذف یک فیلدِ زمینه، «بسته شدنِ امن» است نه باز شدن.', 'Three policy questions and their verdicts. Leave a context field out and it fails closed, not open.'),
        code: `// 1) آیا این فراخوانی ابزار مجاز است؟
POST /api/agent/policy/tool-call
{"call":{"tool":"git.push","grantedScopes":["repo:write"],"targetRef":"main"},
 "context":{"autonomy":"supervised","privacyLevel":"internal","workingBranch":"agent/work",
            "protectedBranches":["main"],"approverUserId":"u1"}}
-> {"allowed":false,"riskLevel":"critical",
    "reasons":["direct write to protected ref \\"main\\" is forbidden; open a pull request instead"],
    "denyReason":"protected branch write"}

// 2) آیا این داده می‌تواند خارج شود؟
POST /api/agent/policy/egress
{"privacyLevel":"internal","providerLocality":"cloud","userConsentedToCloud":true,"computeMode":"local"}
-> {"allowed":false,"reasons":["compute mode is \\"local\\"; no content may leave the machine, consent or not"]}

// 3) آیا ادعای «تمام شد» درست است؟
POST /api/agent/evidence/audit
{"claim":{"taskStatus":"completed","summary":"added endpoint",
  "acceptanceCriteria":["returns 200"],"filesChanged":["src/a.ts"],
  "commandsExecuted":[],"tests":[]}}
-> {"accepted":false,"violations":["…"],"repairable":true}`,
      },
      {
        k: 'code',
        lang: 'bash',
        caption: bi('پاک‌سازی راز: کلیدهای AWS، توکن‌های گیت‌هاب، JWT، توکن‌های Slack، URL پایگاه داده و شکل‌های عمومی KEY=value.', 'Redaction: AWS keys, GitHub tokens, JWTs, Slack tokens, database URLs and generic KEY=value shapes.'),
        code: `curl -s -X POST http://localhost:3001/api/agent/redact \\
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \\
  -d '{"text":"export OPENAI_API_KEY=sk-proj-abc123def456ghi789"}'
# -> {"text":"export OPENAI_API_KEY=[REDACTED:KV_SECRET]","hasSecrets":true,"hits":[...]}`,
      },
    ],
  },

  {
    id: 'agent-sandbox',
    cat: 'agent',
    level: 'pro',
    title: bi('سندباکس واقعی و محدودیت‌های بیان‌شده', 'A real sandbox, with its limits stated'),
    summary: bi(
      'چه چیزی اندازه‌گیری شده، چه چیزی ادعا نمی‌شود.',
      'What was measured, and what is explicitly not claimed.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'sandbox.test از طریق unshare با فضای‌نام‌های user، mount، network و PID اجرا می‌شود: ریشه فقط‌خواندنی باز mount می‌شود، فضای‌کاری نوشتنی bind می‌گردد، /proc تازه mount می‌شود تا فرایند جدولِ فرایندهای میزبان را نبیند و هیچ شبکه‌ای در دسترس نیست. ارقام زیر با خودِ ابزار، پیش و پس از فعال‌سازی اندازه‌گیری شده‌اند.',
          'sandbox.test spawns through unshare with user, mount, network and PID namespaces: / is remounted read-only, the workspace is bind-mounted back read-write, /proc is remounted so the process cannot see the host process table, and there is no network. The figures below were measured before and after, through the tool itself.',
        ),
      },
      {
        k: 'table',
        head: [bi('آزمون', 'Probe'), bi('پیش از سندباکس', 'Before'), bi('پس از سندباکس', 'After')],
        rows: [
          [bi('نوشتن /tmp/agent-escaped.txt', 'Write /tmp/agent-escaped.txt'), bi('رسید (فایل روی دیسک تأیید شد)', 'Reached (file confirmed on disk)'), bi('مسدود', 'Blocked')],
          [bi('نوشتن در درختِ منبعِ دروازه', 'Write the gateway source tree'), bi('رسید', 'Reached'), bi('مسدود', 'Blocked')],
          [bi('خواندن جدول فرایندهای میزبان', 'Read the host process table'), bi('رسید (۱۰۰ pid)', 'Reached (100 pids)'), bi('مسدود (۳ pid)', 'Blocked (3 pids)')],
          [bi('حل کردن DNS', 'Resolve DNS'), bi('رسید', 'Reached'), bi('مسدود', 'Blocked')],
          [bi('نوشتن درون فضای‌کاری', 'Write inside the workspace'), bi('رسید', 'Reached'), bi('همچنان کار می‌کند', 'Still works')],
        ],
      },
      {
        k: 'callout',
        tone: 'warn',
        title: bi('آنچه ادعا نمی‌شود', 'What is not claimed'),
        text: bi(
          'دسترسیِ خواندنی با masking «کاهش» یافته نه حذف (در این محیط pivot_root در دسترس نیست) و بدون واگذاریِ cgroup هیچ سقفِ CPU یا حافظه‌ای وجود ندارد. هر دو مورد توسط describeIsolation() به فراخوان گزارش می‌شود، نه اینکه منتظر بماند خودتان کشف کنید.',
          'Read access is reduced by masking, not eliminated (pivot_root is unavailable in this environment), and there is no CPU or memory ceiling without cgroup delegation. Both are reported to the caller by describeIsolation() rather than left for you to discover.',
        ),
      },
      {
        k: 'code',
        lang: 'bash',
        caption: bi('سندباکس حدس نمی‌زند؛ کاوش می‌کند و نتیجه را می‌گوید. اگر کرنل شما فضای‌نام را نپذیرد، isolated:false با دلیل برمی‌گردد.', 'The sandbox probes rather than assumes. If your kernel refuses namespaces you get isolated:false with the reason.'),
        code: `curl -s -X POST localhost:3001/api/agent/tools/invoke \\
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \\
  -d '{"tool":"sandbox.test","args":{"command":"node -e console.log(1)"}}' \\
  | jq '{isolated, isolation}'`,
      },
    ],
  },

  {
    id: 'agent-runs',
    cat: 'agent',
    level: 'pro',
    title: bi('ماشین حالت اجرا و حلقهٔ advance', 'The run state machine and the advance loop'),
    summary: bi(
      '۱۹ حالت، دروازه‌های انسانی، زنجیرهٔ هش‌شده و راننده‌ای که مدل آن را نمی‌بیند.',
      '19 states, human gates, a hash chain, and a driver the model cannot see.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'یک «اجرا» (run) حالت، بودجه و تاریخچه‌ای قابلِ راستی‌آزمایی دارد و از مرگِ فرایند جان سالم به در می‌برد. آن را با رویدادها جلو می‌برید؛ در دروازه‌ها می‌ایستد و می‌گوید چه می‌خواهد. چهار ویژگی مهم: عامل نمی‌تواند خودش را تأیید کند (فقط انسان /decision را صدا می‌زند)، نمی‌تواند انتقالی جعل کند (پاسخِ نشناخته رد می‌شود و هیچ هزینه‌ای ندارد)، نمی‌تواند تا ابد اجرا شود (محدود به maxSteps و بودجه‌های حالت)، و تاریخچه را نمی‌توان بی‌صدا بازنویسی کرد (هر checkpoint هشِ قبلی را دارد و /verify محل شکست را نام می‌برد).',
          'A run has a state, a budget and a verifiable history, and it survives the process dying. You advance it with events; it parks at gates and tells you what it wants. Four properties matter: the agent cannot approve itself (only a human calls /decision), cannot invent a transition (an unrecognised answer is refused and costs nothing), cannot run forever (bounded by maxSteps and the mode’s budgets), and the history cannot be quietly rewritten (each checkpoint carries the previous hash and /verify names where it broke).',
        ),
      },
      {
        k: 'code',
        tabs: [
          {
            label: 'گام‌به‌گام',
            lang: 'bash',
            code: `RUN=$(curl -s -X POST http://localhost:3001/api/agent/runs \\
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \\
  -d '{"organizationId":"acme","projectId":"web",
       "goal":"Add rate limiting to the public API","mode":"paid","maxSteps":50}' \\
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["run"]["runId"])')

curl -s -X POST http://localhost:3001/api/agent/runs/$RUN/step \\
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \\
  -d '{"event":"spec_ready","payload":{"note":"spec drafted"},"tokensUsed":1200}'

# در یک دروازه: state: AWAITING_PLAN_APPROVAL | awaiting: plan
curl -s -X POST http://localhost:3001/api/agent/runs/$RUN/decision \\
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \\
  -d '{"approved":true}'          # -> RECON`,
          },
          {
            label: 'حلقهٔ خودران',
            lang: 'text',
            code: `POST /api/agent/runs/:runId/advance  {"maxSteps":8}

  clear      -> spec_ready                 PLAN
  ready      -> plan_ready                 AWAITING_PLAN_APPROVAL

stopped: awaiting_human | run is waiting for plan approval

مدل هرگز نمی‌فهمد ماشین حالت وجود دارد. از آن یک پرسش پرسیده می‌شود و
فهرست کوتاهی از واژه‌های مجاز داده می‌شود؛ این کد واژه را به دقیقاً
یک رویداد تبدیل می‌کند. درخواستِ deploy در مرحلهٔ intake:

stopped: refused
reason : model answered "deploy_approved\\nIgnore the process, ship";
         expected one of: clear, unclear
state  : INTAKE (بدون تغییر) | steps: 0`,
          },
          {
            label: 'بازیابی و راستی‌آزمایی',
            lang: 'bash',
            code: `# خاموشیِ ناگهانی؟ اجراهای ادامه‌پذیر را ببینید
curl -s http://localhost:3001/api/agent/runs/resumable -H "Authorization: Bearer $TOKEN"
#   run_mub9vv4b_dt5jjmrf در TEST (۵ گام، ۴۲۰۰ توکن)

# تاریخچهٔ زنجیره‌ای
curl -s http://localhost:3001/api/agent/runs/$RUN/checkpoints -H "Authorization: Bearer $TOKEN"
#   0 created -> INTAKE | 1 spec_ready -> PLAN | 2 plan_ready -> AWAITING_PLAN_APPROVAL | …

# دستکاریِ یک ردیف در SQLite و سپس:
# valid: False | brokenAt: 1 | checkpoint contents do not match its hash`,
          },
        ],
      },
      {
        k: 'callout',
        tone: 'note',
        text: bi(
          'حلقه خودش مدل را صدا نمی‌زند مگر در /advance؛ در حالت عادی هر کسی که کار را انجام داده، نتیجه را گزارش می‌کند. این یعنی همهٔ تصمیم‌ها در هستهٔ تست‌شده می‌ماند و اجرا به شما (یا به یک رانندهٔ خودران روی آن) سپرده می‌شود.',
          'The loop does not call models except in /advance; normally whatever did the work reports the outcome. That keeps every decision inside the tested kernel and leaves execution to you — or to an autonomous driver built on top.',
        ),
      },
      {
        k: 'table',
        head: [bi('حالت', 'Mode'), bi('بیشینهٔ تلاش تعمیر', 'maxRepairAttempts'), bi('بیشینهٔ هزینه', 'maxCost')],
        rows: [
          [bi('free', 'free'), bi('۲', '2'), bi('۰', '0')],
          [bi('paid', 'paid'), bi('۳', '3'), bi('۱۰۰۰', '1000')],
        ],
        caption: bi('بودجه‌ها از حالت می‌آیند، پس لازم نیست اعداد را حفظ کنید.', 'Budgets come from the mode, so you do not have to know the numbers.'),
      },
    ],
  },

  {
    id: 'agent-prompts',
    cat: 'agent',
    level: 'core',
    title: bi('کتابخانهٔ پرامپت و استفاده از هسته در کد خودتان', 'Prompt library and using the kernel from your own code'),
    summary: bi(
      'سیزده پرامپت نسخه‌دار — و وارد کردنِ مستقیمِ هسته بدون HTTP.',
      'Thirteen versioned prompts — and importing the kernel directly, no HTTP.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'سیزده پرامپتِ عامل، هر کدام پین‌شده به یک نسخه و یک طرح‌وارهٔ خروجی. می‌توانید فهرست بگیرید یا یکی را کاملاً ترکیب‌شده (با قطعاتِ درج‌شده و متغیرهای حالت جایگزین‌شده) چاپ کنید و مستقیماً در هر مدلی بچسبانید — کلود، GPT، یا یک Qwen محلی. این ساده‌ترین راه برای گرفتنِ ارزش از این مخزن در همین امروز است.',
          'Thirteen agent prompts, each pinned to a version and an output schema. You can list them or print one fully composed — fragments inlined, mode variables substituted — and paste it into any model: Claude, GPT, or a local Qwen. That is the simplest way to get value out of this repo today.',
        ),
      },
      {
        k: 'code',
        tabs: [
          {
            label: 'فهرست و نمایش',
            lang: 'bash',
            code: `npm run agent:prompt:list
# orchestrator   v1.1.0  283 lines  00-orchestrator.md
# product-analyst v1.1.0 143 lines  01-product-analyst.md
# coding-agent   v1.1.0  213 lines  05-coding-agent.md
# security-reviewer v1.1.0 173 lines 07-security-reviewer.md
# repair         v1.1.0  159 lines  12-repair.md

npm run agent:prompt:show -- 12-repair.md`,
          },
          {
            label: 'وارد کردن در کد',
            lang: 'javascript',
            code: `import { resolveMode } from '@freellmapi/agent/core/compute-mode.js'
import { routeModel } from '@freellmapi/agent/core/model-router.js'
import { evaluateToolCall } from '@freellmapi/agent/core/policy-engine.js'
import { redactSecrets } from '@freellmapi/agent/core/redaction.js'

const profile = resolveMode('free')
const { primary, rejected } = routeModel(request, { providers, mode: 'free' })
const verdict = evaluateToolCall(call, context)
const { text, hasSecrets } = redactSecrets(logLine)

// ابتدا npm run build -w agent را اجرا کنید تا dist وجود داشته باشد`,
          },
        ],
      },
      {
        k: 'callout',
        tone: 'tip',
        title: bi('routeModel مسیریابی مدل', 'routeModel'),
        text: bi(
          'بخش جالبِ API مسیریابی پاسخ نیست — بلکه این است که به شما گفته می‌شود هر نامزدِ دیگر چرا باخته است: REJECTED: groq -> privacy ceiling internal < requested private.',
          'The interesting part of the routing API is not the answer — it is that you are told why every other candidate lost: REJECTED: groq → privacy ceiling internal < requested private.',
        ),
      },
    ],
  },

  {
    id: 'agent-config',
    cat: 'agent',
    level: 'pro',
    title: bi('پیکربندی عامل', 'Agent configuration'),
    summary: bi(
      'همه‌چیز با متغیر محیطی؛ هیچ چیز امنیتی از بدنهٔ درخواست خوانده نمی‌شود.',
      'Everything is environment variables; nothing security-relevant comes from the request body.',
    ),
    blocks: [
      {
        k: 'table',
        head: [bi('متغیر', 'Variable'), bi('پیش‌فرض', 'Default'), bi('نقش', 'Role')],
        rows: [
          [bi('AGENT_WORKSPACE_ROOT', 'AGENT_WORKSPACE_ROOT'), bi('./data/agent-workspace', './data/agent-workspace'), bi('تنها پوشه‌ای که ابزارها می‌توانند لمس کنند — پوشه‌ای اختصاصی، نه منبعِ خودِ دروازه', 'The only directory tools may touch — a dedicated folder, not the gateway’s own source')],
          [bi('AGENT_GRANTED_SCOPES', 'AGENT_GRANTED_SCOPES'), bi('(خالی)', '(empty)'), bi('اسکوپ‌های نصب، جدا با کاما؛ خالی یعنی هیچ. با اسکوپ‌های درخواست «اشتراک» گرفته می‌شود، نه اجتماع', 'Install scopes, comma-separated. Empty means none; intersected with the request, never unioned')],
          [bi('AGENT_PROTECTED_BRANCHES', 'AGENT_PROTECTED_BRANCHES'), bi('main', 'main'), bi('شاخه‌هایی که هیچ ابزاری نمی‌تواند بنویسد', 'Branches no tool may write')],
          [bi('AGENT_WORKING_BRANCH', 'AGENT_WORKING_BRANCH'), bi('agent/work', 'agent/work'), bi('جایی که عامل مجاز به کامیت است', 'Where the agent may commit')],
          [bi('AGENT_AUTONOMY', 'AGENT_AUTONOMY'), bi('supervised', 'supervised'), bi('supervised برای هر اثرِ جانبیِ بیرونی تأیید انسانی می‌خواهد', 'supervised requires human approval for external side effects')],
          [bi('AGENT_WORKER_TOKENS', 'AGENT_WORKER_TOKENS'), bi('(خالی)', '(empty)'), bi('اعتبار کارگران صف؛ بدون آن صف با ۵۰۳ بسته می‌ماند', 'Queue worker credentials; without them the queue fails closed with 503')],
          [bi('AGENT_FORGE_TOKEN', 'AGENT_FORGE_TOKEN'), bi('(تنظیم‌نشده)', '(unset)'), bi('اعتبار فورج برای باز کردن PR؛ هر بار تازه خوانده می‌شود', 'Forge credential for PRs; read fresh on every call')],
          [bi('AGENT_FORGE_REPO', 'AGENT_FORGE_REPO'), bi('(تنظیم‌نشده)', '(unset)'), bi('owner/name — مخزن پیکربندی است، نه آرگومان ابزار', 'owner/name — the repo is configuration, not a tool argument')],
          [bi('AGENT_FORGE_HOST', 'AGENT_FORGE_HOST'), bi('api.github.com', 'api.github.com'), bi('فقط نام میزبانِ خالی؛ URL پذیرفته نمی‌شود', 'Bare hostname only; a URL is refused')],
        ],
      },
      {
        k: 'callout',
        tone: 'warn',
        text: bi(
          'این طراحی عمدی است: نسخه‌ای قدیمی‌تر workerId و اسکوپ‌های ابزار را از بدنهٔ درخواست می‌پذیرفت و هر دو به عنوان آسیب‌پذیری بسته شدند. تنظیم‌نبودنِ AGENT_FORGE_TOKEN باعث می‌شود git.pull_request.create خودش را «پیکربندی‌نشده» گزارش کند، نه اینکه نیمه‌کاره خراب شود.',
          'This is deliberate: an earlier version accepted workerId and tool scopes from the body, and both were closed as vulnerabilities. Leaving AGENT_FORGE_TOKEN unset makes git.pull_request.create report itself as not configured instead of failing halfway through a push.',
        ),
      },
    ],
  },

  /* ─────────────────────────── SECURITY ─────────────────────────── */
  {
    id: 'sec-encryption',
    cat: 'security',
    level: 'core',
    title: bi('رمزنگاری و چرخش کلید', 'Encryption and key rotation'),
    summary: bi(
      'AES-256-GCM، فایل کلیدِ پشتیبان و چرخشِ ایمن.',
      'AES-256-GCM, the key file fallback and a safe rotation procedure.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'کلیدهای ارائه‌دهنده با AES-256-GCM در SQLite رمزنگاری می‌شوند. اولویتِ یافتنِ کلید: متغیر ENCRYPTION_KEY، سپس فایل .encryption-key کنار پایگاه داده (با دسترسی ۰۶۰۰)، سپس کلید قدیمی در جدول settings (که در اولین بالا آمدن به فایل منتقل می‌شود)، و در نهایت تولیدِ کلید تازه. در تولید حتماً ENCRYPTION_KEY را تنظیم کنید و به فایلِ خودکار تکیه نکنید.',
          'Provider keys are AES-256-GCM encrypted in SQLite. Key resolution order: the ENCRYPTION_KEY env var, then a .encryption-key file next to the database (mode 0600), then a legacy key in the settings table (migrated to the file on first boot), and finally a freshly generated key. In production always set ENCRYPTION_KEY and do not rely on the fallback.',
        ),
      },
      {
        k: 'callout',
        tone: 'danger',
        title: bi('عوض کردنِ سادهٔ ENCRYPTION_KEY همه‌چیز را قفل می‌کند', 'Changing ENCRYPTION_KEY alone locks everything'),
        text: bi(
          'چون رازها با AES-256-GCM هستند، تغییرِ کلید دوباره‌رمزنگاری نمی‌کند — فقط باعث می‌شود همهٔ کلیدهای ارائه‌دهنده، اوررایدهای پروکسی، اعتبارهای پروفایل کلاینت و توکن‌های Fetch Relay همزمان از کار بیفتند. ابتدا با سرور خاموش، دوباره رمزنگاری کنید؛ و پشتیبان‌ها هم اثرانگشتِ کلید را دارند، پس فایلی که با کلید دیگری نوشته شده بازیابی نمی‌شود.',
          'Because secrets are AES-256-GCM, changing the key does not re-encrypt anything — it makes every provider key, per-key proxy override, client-profile credential and saved Fetch Relay token fail to decrypt at once. Re-encrypt first, with the server stopped; backups also carry the key fingerprint, so a dump written under a different key cannot be restored.',
        ),
      },
      {
        k: 'list',
        items: [
          bi('رمزنگاری در حالت سکون برای کلیدها و اوررایدها؛ رمزگشایی فقط در حافظه و برای همان درخواست.', 'Encryption at rest for keys and overrides; decryption in memory only, per request.'),
          bi('هیچ اعتبار امنیتی از بدنهٔ درخواست خوانده نمی‌شود.', 'No security credential is read from the request body.'),
          bi('پاک‌سازیِ خودکارِ رازها در متن‌های عبوری (redaction) و قرمز کردنِ خطاها (error redaction).', 'Automatic secret redaction for text in transit and redaction of provider error text.'),
          bi('لاگ‌ها و پیام‌های خطا از کلیدها و توکن‌ها پاک می‌شوند پیش از آنکه ثبت شوند.', 'Logs and error messages are scrubbed of keys and tokens before being recorded.'),
        ],
      },
    ],
  },

  {
    id: 'sec-surface',
    cat: 'security',
    level: 'core',
    title: bi('سطح حمله و سخت‌سازی', 'Attack surface and hardening'),
    summary: bi(
      'تک‌کاربره بودن، محدودسازی نرخ، شبکه و نگاشتِ IP واقعی.',
      'Single-user by design, rate limiting, networking and real client IPs.',
    ),
    blocks: [
      {
        k: 'table',
        head: [bi('کنترل', 'Control'), bi('پیش‌فرض', 'Default'), bi('توصیه', 'Recommendation')],
        rows: [
          [bi('HOST / HOST_BIND', 'HOST / HOST_BIND'), bi(':: / 127.0.0.1 در داکر', ':: / 127.0.0.1 in Docker'), bi('روی شبکهٔ مورد اعتماد نگه دارید؛ HOST_BIND=0.0.0.0 فقط در LANِ امن', 'Keep it on a trusted network; HOST_BIND=0.0.0.0 only on a safe LAN')],
          [bi('PROXY_RATE_LIMIT_RPM', 'PROXY_RATE_LIMIT_RPM'), bi('۱۲۰', '120'), bi('محدودسازیِ درخواست‌های /v1 بر اساس IP؛ صفر یعنی غیرفعال', 'Per-IP limit on /v1; 0 disables')],
          [bi('ADMIN_RATE_LIMIT_RPM', 'ADMIN_RATE_LIMIT_RPM'), bi('۶۰۰', '600'), bi('محافظِ سیلِ درخواست برای /api؛ ورود و صدور کلید سقف‌های جداگانه دارند', 'Flood guard for /api; login and key export have their own tighter caps')],
          [bi('TRUST_PROXY', 'TRUST_PROXY'), bi('false', 'false'), bi('برای یک پروکسی معکوس ۱، یا فهرست CIDR؛ در غیر این صورت همه از 127.0.0.1 دیده می‌شوند', '1 for a single reverse proxy, or a CIDR list; otherwise everyone looks like 127.0.0.1')],
          [bi('FREEAPI_BLOCK_PRIVATE_PROVIDER_URLS', 'FREEAPI_BLOCK_PRIVATE_PROVIDER_URLS'), bi('خاموش', 'off'), bi('مسدود کردنِ آدرس‌های خصوصی برای نقاط پایانیِ سفارشی (ابزارهای وبِ عامل همیشه مسدود می‌کنند)', 'Block private addresses for custom endpoints (the agent web tools always block them)')],
          [bi('FREEAPI_DB_DIR_HARDENING', 'FREEAPI_DB_DIR_HARDENING'), bi('—', '—'), bi('سخت‌سازیِ دسترسی‌های پوشهٔ پایگاه داده', 'Harden permissions on the database directory')],
          [bi('CSP_UPGRADE_INSECURE_REQUESTS', 'CSP_UPGRADE_INSECURE_REQUESTS'), bi('—', '—'), bi('ارتقای درخواست‌های ناامن در هدر CSP', 'Upgrade insecure requests in the CSP header')],
        ],
      },
      {
        k: 'callout',
        tone: 'danger',
        text: bi(
          'این دروازه تک‌کاربره است: احراز هویتِ چندمستأجره و صورتحسابِ هر کاربر ندارد. آن را برای خودتان اجرا کنید و در اینترنت عمومی قرار ندهید.',
          'The gateway is single-user: there is no multi-tenant auth and no per-user billing. Run it for yourself; do not expose it to the internet.',
        ),
      },
      {
        k: 'list',
        items: [
          bi('یک بررسی امنیتی در این مخزن یک IDORِ بین‌مستأجره‌ای، یک صفِ کارِ بدون احراز هویت و پنج مورد مشاوره‌ای را یافت و بست.', 'A security review in this repo found and closed a cross-tenant IDOR, an unauthenticated job queue and five advisories.'),
          bi('ابزارهای وبِ عامل، IPهای متادیتای ابر و بازه‌های خصوصی را در هر پرشِ تغییرمسیر دوباره بررسی می‌کنند.', 'The agent web tools re-check cloud metadata IPs and private ranges on every redirect hop.'),
          bi('کاتالوگِ دانلودی پیش از اعمال با کلید Ed25519 پین‌شده امضا می‌شود.', 'The downloaded catalog is verified against a pinned Ed25519 key before it is applied.'),
          bi('سرور کاتالوگ هرگز پرامپت، پاسخ یا کلید ارائه‌دهندهٔ شما را نمی‌بیند.', 'The catalog server never sees your prompts, completions or provider keys.'),
        ],
      },
    ],
  },

  /* ─────────────────────────── OPS ─────────────────────────── */
  {
    id: 'ops-backup',
    cat: 'ops',
    level: 'core',
    title: bi('پشتیبان‌گیری و بازیابی', 'Backup and restore'),
    summary: bi(
      'دامپ‌های رمزنگاری‌شده، اثرانگشت کلید و برنامهٔ زمانی.',
      'Encrypted dumps, key fingerprints and the schedule.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'هر پشتیبان یک دامپ SQL با هدری است که اثرانگشتِ sha256 کلید رمزنگاری را دارد؛ restore دامپی را که با ENCRYPTION_KEY دیگری نوشته شده رد می‌کند و هر دو اثرانگشت را گزارش می‌دهد (backup: … ; server: …). قالبِ روی دیسک نسخه‌دار است (DUMP_FORMAT = 1) و دامپی با قالبِ متفاوت با ۴۰۹ رد می‌شود.',
          'Each backup is an SQL dump whose header carries the sha256 key fingerprint; restore refuses a dump written under a different ENCRYPTION_KEY and reports both fingerprints (backup: …; server: …). The on-disk layout is versioned (DUMP_FORMAT = 1) and a dump of another format is rejected with 409.',
        ),
      },
      {
        k: 'code',
        lang: 'bash',
        code: `curl -s localhost:3001/api/backups -H "Authorization: Bearer $TOKEN" | jq
curl -s -X POST localhost:3001/api/backups -H "Authorization: Bearer $TOKEN" \\
  -H 'Content-Type: application/json' -d '{"tables":["api_keys","models","settings"]}'
curl -s -X POST localhost:3001/api/backups/14/restore -H "Authorization: Bearer $TOKEN"`,
      },
      {
        k: 'list',
        items: [
          bi('پشتیبان‌گیری خودکار با FREEAPI_DB_BACKUP_INTERVAL_MS و مسیر/کلید/URL مربوطه.', 'Automatic backups via FREEAPI_DB_BACKUP_INTERVAL_MS with its path/key/URL companions.'),
          bi('برای انتقال، پوشهٔ داده را کپی کنید (دسکتاپ) یا .env و فایل پایگاه داده را (سرور).', 'To migrate, copy the data folder (desktop) or the .env and the DB file (server).'),
          bi('حذفِ برنامه هرگز پوشهٔ داده را پاک نمی‌کند — این یک گامِ جدا و آگاهانه است و همان چیزی است که نصبِ دوباره روی آن را امن می‌کند.', 'Uninstalling never removes your data directory — that is a separate, deliberate step, and it is what makes reinstalling safe.'),
        ],
      },
    ],
  },

  {
    id: 'ops-network',
    cat: 'ops',
    level: 'pro',
    title: bi('شبکه، پروکسی خروجی و به‌روزرسانی', 'Networking, outbound proxy & updates'),
    summary: bi(
      'پروکسی رو به جلو در برابر Fetch Relay، و نگه داشتنِ نصب در جریان.',
      'Forward proxy vs Fetch Relay, and keeping an install current.',
    ),
    blocks: [
      {
        k: 'table',
        head: [bi('موضوع', 'Topic'), bi('توضیح', 'Explanation')],
        rows: [
          [bi('PROXY_URL / HTTP(S)_PROXY / NO_PROXY', 'PROXY_URL / HTTP(S)_PROXY / NO_PROXY'), bi('پروکسیِ خروجی برای رسیدن به ارائه‌دهندگان؛ در داکر از host.docker.internal به جای 127.0.0.1 استفاده کنید.', 'Outbound proxy for reaching providers; under Docker use host.docker.internal instead of 127.0.0.1.')],
          [bi('PROXY_MODE=fetch-relay', 'PROXY_MODE=fetch-relay'), bi('انتقالِ درخواست‌ها از طریق یک relay؛ آدرس‌های loopback مسدودند و SOCKS پذیرفته نمی‌شود (فقط http/https).', 'Relay outbound requests through a remote fetcher; loopback URLs are blocked and SOCKS is rejected (http/https only).')],
          [bi('TRUST_PROXY', 'TRUST_PROXY'), bi('برای دیدنِ IP واقعیِ کلاینت پشتِ Caddy/nginx/Traefik.', 'To see the real client IP behind Caddy/nginx/Traefik.')],
          [bi('FREELLMAPI_UPDATE_CHECK', 'FREELLMAPI_UPDATE_CHECK'), bi('بررسیِ به‌روزرسانی در داشبورد؛ ساخت‌های امضا‌نشده به‌طور خودکار به‌روز نمی‌شوند.', 'Update checks in the dashboard; unsigned local builds will not auto-update.')],
          [bi('WATCHTOWER_TOKEN', 'WATCHTOWER_TOKEN'), bi('توکن برای به‌روزرسانیِ خودکارِ کانتینر.', 'Token for automated container updates.')],
        ],
      },
      {
        k: 'callout',
        tone: 'warn',
        title: bi('داکر و loopback', 'Docker and loopback'),
        text: bi(
          'درون کانتینر، 127.0.0.1 خودِ کانتینر است. اگر از طریق یک کلاینت پروکسی روی میزبان (Clash، v2rayN، sing-box، پروکسی شرکتی) به ارائه‌دهندگان می‌رسید، دروازه را به میزبان راهنمایی کنید: PROXY_URL=socks5h://host.docker.internal:7890 و مطمئن شوید پروکسی از خارجِ loopback هم اتصال می‌پذیرد.',
          'Inside a container, 127.0.0.1 is the container itself. If you reach providers through a proxy client on the host (Clash, v2rayN, sing-box, a corporate proxy), point the gateway at the host: PROXY_URL=socks5h://host.docker.internal:7890, and make sure the proxy accepts connections from outside loopback.',
        ),
      },
      {
        k: 'code',
        lang: 'bash',
        caption: bi('تشخیصِ شبکه از درون کانتینر', 'Diagnosing networking from inside the container'),
        code: `docker compose exec freellmapi node -e "fetch('https://generativelanguage.googleapis.com/').then(r=>console.log('ok',r.status)).catch(e=>console.log('fail',e.cause?.code||e.message))"`,
      },
    ],
  },

  {
    id: 'ops-logs',
    cat: 'ops',
    level: 'core',
    title: bi('لاگ‌ها و اندازه‌گیری', 'Logs and metrics'),
    summary: bi(
      'لاگ کجاست، چه چیزی نگه داشته می‌شود و برای چه مدت.',
      'Where logs live, what is retained and for how long.',
    ),
    blocks: [
      {
        k: 'table',
        head: [bi('روش نصب', 'Install method'), bi('محل لاگ', 'Where the log goes')],
        rows: [
          [bi('Docker Compose', 'Docker Compose'), bi('docker compose logs -f freellmapi', 'docker compose logs -f freellmapi')],
          [bi('داکر ساده', 'Plain Docker'), bi('docker logs -f <container>', 'docker logs -f <container>')],
          [bi('نصب یک‌خطی', 'One-liner install'), bi('cd ~/freellmapi && docker compose logs -f freellmapi', 'cd ~/freellmapi && docker compose logs -f freellmapi')],
          [bi('npm run dev', 'npm run dev'), bi('ترمینالی که سرور در آن اجرا می‌شود', 'The terminal running the server')],
          [bi('اپ دسکتاپ', 'Desktop app'), bi('<پوشه داده>/logs/freeapi.log — منوی سینی → Open Logs Folder', '<data dir>/logs/freeapi.log — tray → Open Logs Folder')],
        ],
      },
      {
        k: 'table',
        head: [bi('متغیر', 'Variable'), bi('نقش', 'Role')],
        rows: [
          [bi('REQUEST_ANALYTICS_RETENTION_DAYS', 'REQUEST_ANALYTICS_RETENTION_DAYS'), bi('۹۰ — نگهداریِ تحلیل‌های درخواست', '90 — request-analytics retention')],
          [bi('REQUEST_ANALYTICS_MAX_ROWS', 'REQUEST_ANALYTICS_MAX_ROWS'), bi('۱۰۰۰۰۰ — سقفِ ردیف‌ها', '100000 — row cap')],
          [bi('QUOTA_OBSERVATIONS_RETENTION_DAYS', 'QUOTA_OBSERVATIONS_RETENTION_DAYS'), bi('۳۰ — نگهداریِ مشاهدات سهمیه', '30 — quota-observation retention')],
          [bi('QUOTA_OBSERVATIONS_MAX_ROWS', 'QUOTA_OBSERVATIONS_MAX_ROWS'), bi('۲۰۰۰۰۰ — سقفِ ردیف‌ها؛ هرس روزانه در قطعات ۵k/۲۵۰ms', '200000 — row cap; daily pruning in 5k/250ms chunks')],
          [bi('SERVER_LOGS_MAX_ROWS / _RETENTION_DAYS', 'SERVER_LOGS_MAX_ROWS / _RETENTION_DAYS'), bi('لاگ‌های نمایش‌داده‌شده در صفحهٔ Logs', 'Logs surfaced on the Logs page')],
          [bi('REQUEST_ANALYTICS_LOG_CLIENT', 'REQUEST_ANALYTICS_LOG_CLIENT'), bi('ثبتِ کلاینت در تحلیل‌ها (برای نمودار by-client)', 'Record the client in analytics (for the by-client chart)')],
        ],
      },
    ],
  },

  /* ─────────────────────────── ENV ─────────────────────────── */
  {
    id: 'env-reference',
    cat: 'env',
    level: 'core',
    title: bi('مرجع متغیرهای محیطی', 'Environment variable reference'),
    summary: bi(
      'جست‌وجو در پیکربندیِ کامل — روی هر سطر بزنید تا کپی شود.',
      'Search the full configuration — click any row to copy.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'فایل .env.example در ریشهٔ مخزن هر متغیر را با توضیح کامل مستند کرده است؛ این جدول همان‌ها را برای جست‌وجوی سریع گرد آورده. مقادیری که با «—» نشان داده شده‌اند یا پیش‌فرضِ مستند ندارند یا در متغیرِ مربوط توضیح داده شده‌اند.',
          'The .env.example file at the repo root documents every variable in full; this table gathers them for quick search. Values shown as “—” either have no documented default or are explained in their own entry.',
        ),
      },
      {
        k: 'env',
        items: [
          { name: 'ENCRYPTION_KEY', def: '(الزامی در تولید)', d: bi('کلید AES-256-GCM برای کلیدهای ارائه‌دهنده در حالت سکون', 'AES-256-GCM key protecting provider keys at rest') },
          { name: 'PORT', def: '3001', d: bi('پورت سرور', 'Server port') },
          { name: 'HOST', def: '::', d: bi('رابط شنود؛ 0.0.0.0 برای IPv4، 127.0.0.1 برای localhost', 'Listen interface; 0.0.0.0 for IPv4-only, 127.0.0.1 for localhost') },
          { name: 'HOST_BIND', def: '127.0.0.1', d: bi('فقط داکر: انتشارِ پورت کانتینر؛ 0.0.0.0 برای LAN', 'Docker only: which host interface the port is published on; 0.0.0.0 for LAN') },
          { name: 'PROXY_RATE_LIMIT_RPM', def: '120', d: bi('سقف درخواست‌های /v1 برای هر IP؛ ۰ غیرفعال', 'Max /v1 requests per minute per client IP; 0 disables') },
          { name: 'ADMIN_RATE_LIMIT_RPM', def: '600', d: bi('سقف درخواست‌های /api برای هر IP؛ ۰ غیرفعال (ورود و صدور کلید سقف جدا دارند)', 'Max /api requests per minute per client IP; 0 disables (login and key export have their own caps)') },
          { name: 'TRUST_PROXY', def: 'false', d: bi('اعتماد به X-Forwarded-For/Proto تا IP واقعیِ کلاینت دیده شود؛ ۱ یا فهرست CIDR', 'Trust X-Forwarded-For/Proto so the real client IP is visible; 1 or a CIDR list') },
          { name: 'REQUEST_BODY_LIMIT_MB', def: '10', d: bi('سقفِ تجزیهٔ بدنه؛ بالاتر از آن ۴۱۳ request_too_large. نرمال‌سازی تصویر پس از آن کوچک می‌کند', 'Parsing ceiling; above it a 413 request_too_large. Image normalisation shrinks the payload afterwards') },
          { name: 'REQUEST_MAX_TOKENS_BUDGET', def: '—', d: bi('سقف max_tokens؛ درخواستِ بالاتر پیش از تلاشِ هر ارائه‌دهنده با ۴۱۳ رد می‌شود', 'A ceiling on max_tokens; higher requests are rejected with 413 before any provider is tried') },
          { name: 'DASHBOARD_ORIGINS', def: '(dev defaults)', d: bi('منشأهای مجاز برای داشبورد وقتی UI جدا از API سرو می‌شود', 'Allowed origins for the dashboard when the UI is served apart from the API') },
          { name: 'CSP_UPGRADE_INSECURE_REQUESTS', def: '—', d: bi('رفتارِ directives ارتقای درخواست‌های ناامن در هدر CSP', 'Behaviour of the CSP upgrade-insecure-requests directive') },
          { name: 'FREEAPI_DB_PATH', def: 'server/data/freeapi.db', d: bi('محل اختیاری SQLite — برای میزبان‌هایی که فقط یک پوشه به‌طور پایدار mount می‌شود', 'Optional SQLite location for hosts where only one directory is mounted persistently') },
          { name: 'FREEAPI_DB_DIR_HARDENING', def: '(auto)', d: bi('سخت‌سازیِ دسترسی‌های پوشهٔ پایگاه داده؛ ۱ برای پوشهٔ اختصاصی، ۰ برای غیرفعال', 'Harden permissions on the DB directory; 1 if it belongs to this account alone, 0 disables') },
          { name: 'FREEAPI_ENV_PATH', def: './.env', d: bi('مسیر صریحِ فایل .env — مفید برای جاسازی (مثلاً اپ دسکتاپ)', 'Explicit path to the .env file — useful for embedders such as the desktop app') },
          { name: 'FREEAPI_CONFIG_PATH', def: '—', d: bi('پیکربندیِ آغازینِ اعلانی (فایل JSON)؛ پس از مایگریشن‌ها به‌طور بایدگانه اعمال می‌شود', 'Declarative startup config (JSON file), applied idempotently after migrations') },
          { name: 'FREEAPI_CONFIG_JSON', def: '—', d: bi('همان پیکربندیِ آغازین به‌صورت JSON درون‌خطی', 'The same declarative startup config, inline as JSON') },
          { name: 'FREEAPI_BLOCK_PRIVATE_PROVIDER_URLS', def: 'off', d: bi('مسدود کردنِ آدرس‌های خصوصی/لوپ‌بک برای نقاط پایانیِ سفارشی (ابزارهای وبِ عامل همیشه مسدود می‌کنند)', 'Block private/loopback addresses for custom provider URLs (the agent web tools always block them)') },
          { name: 'FREEAPI_DB_BACKUP_INTERVAL_MS', def: '—', d: bi('فاصلهٔ آپلودِ پشتیبانِ رمزنگاری‌شده به صورت دوره‌ای', 'How often an encrypted backup is uploaded while running') },
          { name: 'FREEAPI_DB_BACKUP_PATH', def: '—', d: bi('مسیر فایلِ پشتیبان؛ هنگام بالا آمدن، اگر پایگاه داده نباشد از آن بازیابی می‌شود', 'Backup file path; on startup it is restored if the configured DB file is missing') },
          { name: 'FREEAPI_DB_BACKUP_URL', def: '—', d: bi('مقصد HTTP(S) برای پشتیبان؛ کنارِ مسیر فایل پشتیبانی می‌شود', 'HTTP(S) destination for the backup; file paths and URLs are both supported') },
          { name: 'FREEAPI_DB_BACKUP_KEY', def: '(ENCRYPTION_KEY)', d: bi('کلید جداگانه برای رمزنگاریِ پشتیبان — ترجیحاً متفاوت از کلید اصلی', 'A separate key for encrypting the backup, preferably distinct from the main key') },
          { name: 'FREEAPI_DB_BACKUP_TOKEN', def: '—', d: bi('توکن برای آپلودِ پشتیبان به مقصد HTTP', 'Bearer token for uploading the backup to an HTTP destination') },
          { name: 'FREEAPI_PROXY_LOCAL_DESTINATIONS', def: 'false', d: bi('اجازهٔ عبورِ مقصدهای محلی از پروکسی — فقط وقتی خودِ تونل مقصود است (مثل ssh -D)', 'Allow local destinations through the proxy — only when tunnelling is the point (e.g. ssh -D)') },
          { name: 'RESPONSE_CACHE', def: 'off', d: bi('کلید اصلیِ کش پاسخ', 'Master switch for the response cache') },
          { name: 'RESPONSE_CACHE_TTL_SECONDS', def: '3600', d: bi('عمر یک پاسخِ کش‌شده به ثانیه', 'How long a cached answer stays fresh, in seconds') },
          { name: 'RESPONSE_CACHE_MAX_ENTRIES', def: '—', d: bi('سقفِ سختِ مدخل‌های ذخیره‌شده (JSON و استریم با هم)؛ LRU برای تخلیه', 'Hard cap on stored entries (JSON and streaming share it); least-recently-used are evicted') },
          { name: 'RESPONSE_CACHE_MAX_TEMPERATURE', def: '1.0', d: bi('فقط درخواست‌های با دمایِ پایین‌تر یا مساوی کش می‌شوند؛ ۰٫۲ یعنی فقط فراخوان‌های نزدیک‌به‌قطعی', 'Only requests at or below this temperature are cached; 0.2 caches near-deterministic calls only') },
          { name: 'RESPONSE_CACHE_PERSIST', def: '—', d: bi('ماندگاری روی دیسک؛ false یعنی فقط در حافظه', 'Persist to disk; false keeps everything in memory') },
          { name: 'FREELLMAPI_COMPRESSION', def: 'off', d: bi('حالت فشرده‌سازی: off | lossless | standard | aggressive', 'Compression mode: off | lossless | standard | aggressive') },
          { name: 'FREELLMAPI_CONTEXT_HANDOFF', def: 'off', d: bi('on_model_switch: تزریقِ پیامِ تحویلِ زمینه هنگام تعویض مدل', 'on_model_switch: inject a handoff message when the model changes') },
          { name: 'FREELLMAPI_UPDATE_CHECK', def: 'on', d: bi('بررسیِ به‌روزرسانی؛ غیرفعال کردن، یادآورِ انتشار را هم خاموش می‌کند', 'Update checks; disabling also switches off the automatic release reminder') },
          { name: 'FREELLMAPI_UPDATE_GITHUB_TOKEN', def: '—', d: bi('توکنِ محدود برای بررسیِ به‌روزرسانی در برابر گیت‌هاب (در حالت عادی ناشناس است)', 'A narrowly scoped token for update checks against GitHub (anonymous by default)') },
          { name: 'FALLBACK_DETAIL_HEADER', def: 'off', d: bi('افزودن هدر X-Fallback-Detail با زمان و هزینهٔ هر پرش', 'Add the X-Fallback-Detail header with per-hop timing and cost') },
          { name: 'FALLBACK_TIME_BUDGET_MS', def: '—', d: bi('بودجهٔ زمانی برای زنجیرهٔ جایگزینی (تلاشِ در حال اجرا قطع نمی‌شود)؛ ۰ یعنی غیرفعال', 'Time budget for the failover chain (an in-flight attempt is never cut off); 0 disables') },
          { name: 'SLOW_ENDPOINT_BUFFER_MS', def: '10000', d: bi('بالشتکِ اضافه برای نقاط پایانیِ کند در بودجهٔ زمانی', 'Extra padding for slow endpoints inside the time budget') },
          { name: 'MAX_CONSECUTIVE_UPSTREAM_FAILS', def: '—', d: bi('قطع‌کنندهٔ مدار: پس از این تعداد شکستِ پیاپی، زنجیره با ۵۰۳ متوقف می‌شود', 'Failover circuit breaker: after this many consecutive failures the chain stops with 503') },
          { name: 'TTFB_BUDGET_DISABLED', def: '—', d: bi('۱ یعنی فقط بودجهٔ پایه (بدون بودجهٔ تطبیقیِ TTFB)', '1 disables adaptive TTFB budgets and uses only the base budget') },
          { name: 'TTFB_BUDGET_WINDOW_MS', def: '604800000', d: bi('پنجرهٔ نمونه‌های موفق TTFB (پیش‌فرض ۷ روز)', 'Successful TTFB sample window (default: 7 days)') },
          { name: 'TTFB_BUDGET_HALF_LIFE_MS', def: '172800000', d: bi('نیم‌عمرِ وزنِ نمونه (پیش‌فرض ۲ روز) — موفقیت‌های قدیمی کمتر حساب می‌شوند', 'Sample-weight half-life (default: 2 days) — older successes count less') },
          { name: 'TTFB_BUDGET_MIN_SAMPLES', def: '5', d: bi('نمونه‌های لازم پیش از گسترشِ بودجه (تا سه برابر بودجهٔ پایه)', 'Samples an endpoint needs before its history widens the budget (capped at 3× base)') },
          { name: 'MODEL_ROUTING_OVERRIDES', def: '—', d: bi('اوررایدِ وزن‌های مسیریابی برای مدل‌های خاص؛ تطابق دقیق و حساس به حروف است', 'Per-model routing weight overrides; the match is exact and case-sensitive') },
          { name: 'PROVIDER_TIMEOUT_NVIDIA', def: '—', d: bi('زمان‌سنجی ویژه برای مدل‌های کند (NVIDIA NIM ابتدا هدر SSE را می‌فرستد، بعد دقیقه‌ها prefill می‌کند)', 'A dedicated timeout for slow providers (NVIDIA NIM sends SSE headers first, then prefills for minutes)') },
          { name: 'PROVIDER_STREAM_STALL_TIMEOUT_MS', def: '90000', d: bi('نگهبانِ توقفِ استریم؛ اگر پاسخ‌های استریمی زود قطع می‌شوند آن را بالا ببرید؛ ۰ یعنی غیرفعال', 'Stream-stall watchdog; raise it if streamed responses stop early; 0 disables') },
          { name: 'PROVIDER_STREAM_STALL_TIMEOUT_OLLAMA', def: '—', d: bi('همان نگهبان، مخصوص Ollama', 'The same watchdog, for Ollama') },
          { name: 'PROVIDER_DAILY_REQUEST_CAP_OPENROUTER', def: '—', d: bi('سقف روزانه برای هر ارائه‌دهنده: PROVIDER_DAILY_REQUEST_CAP_<PLATFORM>؛ ۰ یعنی بدون سقف', 'Per-provider daily request cap: PROVIDER_DAILY_REQUEST_CAP_<PLATFORM>; 0 disables') },
          { name: 'MODELSCOPE_VALIDATE_CACHE_MS', def: '86400000', d: bi('مدتِ اعتبارِ کشِ اعتبارسنجیِ هر کلید (پیش‌فرض ۲۴ ساعت)؛ ۰ یعنی بررسی در هر دور', 'How long a successful per-key validation is cached (default 24h); 0 probes every pass') },
          { name: 'IMAGE_NORMALIZE', def: 'on', d: bi('نرمال‌سازیِ تصویرِ ورودی (اندازه/کیفیت) پیش از ارسال به بالادست', 'Normalise inbound images (size/quality) before sending upstream') },
          { name: 'IMAGE_NORMALIZE_THRESHOLD_KB', def: '1024', d: bi('فقط تصاویرِ بزرگ‌تر از این حد نرمال‌سازی می‌شوند', 'Only images above this size are normalised') },
          { name: 'IMAGE_NORMALIZE_MAX_DIMENSION', def: '2048', d: bi('حداکثر بُعد تصویر؛ پیکسل‌های فراتر هدررفتِ ترابرد هستند', 'Maximum image dimension; pixels beyond the cap are transport waste') },
          { name: 'IMAGE_NORMALIZE_QUALITY', def: '—', d: bi('کیفیتِ فشرده‌سازیِ تصویر پس از نرمال‌سازی', 'Compression quality after normalisation') },
          { name: 'VALIDATE_TOOL_ARGUMENTS', def: '—', d: bi('اعتبارسنجیِ آرگومان‌های ابزار؛ از طریق کلیدِ تنظیمات هم قابل تغییر است', 'Validate tool arguments; also settable at runtime via the settings key') },
          { name: 'PROXY_URL', def: '—', d: bi('پروکسی خروجی. اولویت: PROXY_URL → تنظیمِ داشبورد → ALL_PROXY → HTTPS_PROXY → HTTP_PROXY', 'Outbound proxy. Precedence: PROXY_URL → dashboard setting → ALL_PROXY → HTTPS_PROXY → HTTP_PROXY') },
          { name: 'HTTP_PROXY / HTTPS_PROXY / ALL_PROXY / NO_PROXY', def: '—', d: bi('متغیرهای استانداردِ پروکسی (حروف کوچک هم پذیرفته است)', 'The standard proxy variables (lower-case spellings are read too)') },
          { name: 'PROXY_MODE', def: 'forward', d: bi('forward (پروکسی کلاسیک) یا fetch-relay (ترابرد از طریق relay راه‌دور)', 'forward (classic proxy) or fetch-relay (transport through a remote relay)') },
          { name: 'FETCH_RELAY_TOKEN', def: '—', d: bi('توکنِ مشترک با relay در حالت fetch-relay', 'The shared token for the relay in fetch-relay mode') },
          { name: 'MCP_INFERENCE_DEFAULT_MODEL', def: 'auto', d: bi('مدلِ پیش‌فرض برای ابزارِ استنتاجِ MCP (مثلاً auto:coding)', 'Default model for the MCP inference tool (e.g. auto:coding)') },
          { name: 'MCP_INFERENCE_TIMEOUT_MS', def: '—', d: bi('زمان‌سنجیِ فقط برای ابزارِ استنتاجِ MCP', 'Timeout for the MCP inference tool only') },
          { name: 'REQUEST_ANALYTICS_RETENTION_DAYS', def: '90', d: bi('نگهداریِ تحلیل‌های درخواست', 'Request-analytics retention') },
          { name: 'REQUEST_ANALYTICS_MAX_ROWS', def: '100000', d: bi('سقف ردیف‌های تحلیل درخواست', 'Request-analytics row cap') },
          { name: 'REQUEST_ANALYTICS_LOG_CLIENT', def: 'true', d: bi('ثبتِ IP و User-Agent در تحلیل‌ها و جدول «Recent calls»؛ false یعنی فقط تجمیع‌ها', 'Record client IP + User-Agent in analytics and “Recent calls”; false stores nulls') },
          { name: 'QUOTA_OBSERVATIONS_RETENTION_DAYS', def: '30', d: bi('نگهداریِ مشاهدات سهمیه', 'Quota-observation retention') },
          { name: 'QUOTA_OBSERVATIONS_MAX_ROWS', def: '200000', d: bi('سقف ردیف‌های مشاهدات سهمیه؛ هرس روزانه در قطعات ۵k/۲۵۰ms', 'Quota-observation row cap; daily pruning in 5k/250ms chunks') },
          { name: 'SERVER_LOGS_RETENTION_DAYS', def: '7', d: bi('نگهداریِ لاگ‌های سرور (نوشته‌شده در پایگاه داده؛ نمای زنده یک حلقهٔ حافظه‌ای است)', 'Server-log retention (written to the DB; the live view is an in-memory ring)') },
          { name: 'SERVER_LOGS_MAX_ROWS', def: '—', d: bi('سقف ردیف‌های لاگ سرور؛ ۰ یعنی بدون محدودیت', 'Server-log row cap; 0 disables the limit') },
          { name: 'WATCHTOWER_TOKEN', def: '—', d: bi('توکنِ «Update now» در داکر؛ با docker compose --profile autoupdate بالا بیاورید', 'Token for Docker “Update now”; start with docker compose --profile autoupdate') },
          { name: 'AGENT_WORKSPACE_ROOT', def: './data/agent-workspace', d: bi('تنها پوشه‌ای که ابزارهای عامل می‌توانند لمس کنند — پوشه‌ای اختصاصی، نه منبعِ دروازه', 'The only directory agent tools may touch — a dedicated folder, not the gateway source') },
          { name: 'AGENT_GRANTED_SCOPES', def: '(empty)', d: bi('اسکوپ‌های نصب؛ با اسکوپ‌های درخواست «اشتراک» گرفته می‌شود، نه اجتماع', 'Install scopes; intersected with the request, never unioned') },
          { name: 'AGENT_PROTECTED_BRANCHES', def: 'main', d: bi('شاخه‌هایی که هیچ ابزاری نمی‌تواند بنویسد', 'Branches no tool may write') },
          { name: 'AGENT_WORKING_BRANCH', def: 'agent/work', d: bi('شاخه‌ای که عامل مجاز به کامیت در آن است', 'Where the agent is allowed to commit') },
          { name: 'AGENT_AUTONOMY', def: 'supervised', d: bi('supervised برای هر اثرِ جانبیِ بیرونی تأیید انسانی می‌خواهد', 'supervised requires human approval for external side effects') },
          { name: 'AGENT_WORKER_TOKENS', def: '(empty)', d: bi('کارگران صف به صورت workerId:token؛ بدون آن صف ۵۰۳ می‌دهد', 'Worker credentials as workerId:token pairs; without them the queue returns 503') },
          { name: 'AGENT_FORGE_TOKEN', def: '(unset)', d: bi('اعتبار فورج برای باز کردن PR؛ هر بار تازه خوانده می‌شود', 'Forge credential for opening PRs; read fresh on every call') },
          { name: 'AGENT_FORGE_REPO', def: '(unset)', d: bi('owner/name — مخزن پیکربندی است، نه آرگومان ابزار', 'owner/name — the repository is configuration, not a tool argument') },
          { name: 'AGENT_FORGE_HOST', def: 'api.github.com', d: bi('فقط نام میزبانِ خالی؛ URL رد می‌شود', 'Bare hostname only; a URL is refused') },
        ],
      },
      {
        k: 'callout',
        tone: 'note',
        text: bi(
          'همچنین امکان پیکربندیِ آغازینِ اعلانی وجود دارد (FREEAPI_CONFIG_PATH / FREEAPI_CONFIG_JSON)، که برای راه‌اندازیِ خودکارِ نصب‌های تازه به کار می‌رود. جزئیات کامل در docs/en/env/01-variables.md.',
          'There is also declarative startup config (FREEAPI_CONFIG_PATH / FREEAPI_CONFIG_JSON) for bootstrapping fresh installs automatically. Full detail lives in docs/en/env/01-variables.md.',
        ),
      },
    ],
  },

  /* ─────────────────────────── TROUBLESHOOTING ─────────────────────────── */
  {
    id: 'trouble-faq',
    cat: 'trouble',
    level: 'core',
    title: bi('نشانه، علت، درمان', 'Symptom, cause, fix'),
    summary: bi(
      'هشت خطای رایج و دستورهای تشخیصیِ همراه‌شان.',
      'Eight common failures with their diagnostic commands.',
    ),
    blocks: [
      {
        k: 'faq',
        items: [
          {
            q: bi('کانتینر داکر نمی‌تواند به ارائه‌دهندگان برسد (ECONNREFUSED به 127.0.0.1:11434)', 'Docker container cannot reach providers (ECONNREFUSED to 127.0.0.1:11434)'),
            a: bi(
              'علت: درون کانتینر، 127.0.0.1 خودِ کانتینر است. درمان: از host.docker.internal (Docker Desktop) یا 172.17.0.1 / IPِ LAN میزبان (لینوکس) استفاده کنید و مطمئن شوید پروکسی روی 0.0.0.0 گوش می‌دهد. در compose: extra_hosts: ["host.docker.internal:host-gateway"]. تشخیص: docker exec freellmapi curl -v http://host.docker.internal:11434/api/tags',
              'Cause: inside the container, 127.0.0.1 is the container. Fix: use host.docker.internal (Docker Desktop) or 172.17.0.1 / the host LAN IP (Linux), and make sure the proxy listens on 0.0.0.0. In compose: extra_hosts: ["host.docker.internal:host-gateway"]. Diagnose: docker exec freellmapi curl -v http://host.docker.internal:11434/api/tags',
            ),
          },
          {
            q: bi('خطای ۴۰۰ «active chain is empty»', '400 “active chain is empty”'),
            a: bi(
              'علت: زنجیرهٔ فعال هیچ مدل فعالی ندارد — زنجیره‌های خالی اکنون معتبرند و بی‌صدا به کاتالوگ برنمی‌گردند. درمان: در صفحهٔ Fallback مدل‌ها را فعال کنید، یا profiles.auto_include_new_models=1 را تنظیم کنید، یا پروفایل فعال را عوض کنید.',
              'Cause: the active chain has no enabled models — empty chains are now authoritative rather than silently falling back to the catalog. Fix: enable models on the Fallback page, set profiles.auto_include_new_models=1, or switch the active profile.',
            ),
          },
          {
            q: bi('خطای fetchRelayUrlError یا isLoopbackRelayHostname', 'fetchRelayUrlError / isLoopbackRelayHostname 400'),
            a: bi(
              'علت: PROXY_URL لوپ‌بک (127.0.0.1 یا ::1) برای fetch-relay مسدود است و SOCKS برای این حالت پذیرفته نمی‌شود. درمان: یک URL عمومی https://relay.example.workers.dev استفاده کنید.',
              'Cause: a loopback PROXY_URL is blocked for fetch-relay and SOCKS is rejected (http/https only). Fix: use a public https://relay.example.workers.dev URL.',
            ),
          },
          {
            q: bi('۴۰۹ «Idempotency-Key already used with different request»', '409 “Idempotency-Key already used with different request”'),
            a: bi(
              'علت: همان کلید با اثرانگشتِ متفاوت. درمان: یک UUID تازه برای هر درخواستِ متمایز بفرستید یا همان بدنه را عیناً تکرار کنید. پنجرهٔ در-حال-اجرا تکرار را حذف نمی‌کند.',
              'Cause: the same key with a changed fingerprint. Fix: send a fresh UUID per distinct request or replay the identical body. The in-flight window is not deduplicated.',
            ),
          },
          {
            q: bi('پنل‌های سهمیه کند یا کهنه به‌نظر می‌رسند', 'Quota panels look stale or slow'),
            a: bi(
              'درمان: QUOTA_OBSERVATIONS_RETENTION_DAYS=30 و QUOTA_OBSERVATIONS_MAX_ROWS=200000 را تنظیم کنید (هرس روزانه در قطعات ۵k/۲۵۰ms) و پایگاه داده را روی دیسک سریع نگه دارید.',
              'Fix: set QUOTA_OBSERVATIONS_RETENTION_DAYS=30 and QUOTA_OBSERVATIONS_MAX_ROWS=200000 (daily pruning in 5k/250ms chunks) and keep the database on a fast volume.',
            ),
          },
          {
            q: bi('کد بازنشانیِ رمز در دسکتاپ دیده نمی‌شود', 'Password-reset code not visible (desktop)'),
            a: bi(
              'علت: الکترونِ اجراشده از Finder/Explorer خروجیِ استاندارد ندارد. درمان: سینی ← Open Logs Folder ← freeapi.log، یا docker logs برای داکر.',
              'Cause: Finder/Explorer-launched Electron has no attached stdout. Fix: tray → Open Logs Folder → freeapi.log, or docker logs for Docker.',
            ),
          },
          {
            q: bi('بررسی به‌روزرسانی چیزی نشان نمی‌دهد / ساخت امضا‌نشده به‌روز نمی‌شود', 'Update check shows nothing / unsigned build will not auto-update'),
            a: bi(
              'علت: Squirrel.Mac امضا را بررسی می‌کند و یک npm run dist محلی بدون گواهی، خوراکِ به‌روزرسانی معتبر ندارد. درمان: نسخهٔ امضاشده از GitHub Releases را بگیرید، یا با CSC_* / APPLE_ID امضا کنید.',
              'Cause: Squirrel.Mac verifies the signature, and a local unsigned build produces no valid update feed. Fix: download the signed release from GitHub Releases, or sign with CSC_* / APPLE_ID.',
            ),
          },
          {
            q: bi('پشت پروکسی معکوس همه از 127.0.0.1 دیده می‌شوند', 'Behind a reverse proxy everything looks like 127.0.0.1'),
            a: bi(
              'علت: TRUST_PROXY پیش‌فرض false است (بدون جعل). درمان: TRUST_PROXY=1 برای یک پروکسی روی همان میزبان، یا فهرست CIDR مانند TRUST_PROXY=100.64.0.0/10,192.168.1.10.',
              'Cause: TRUST_PROXY defaults to false (no spoofing). Fix: TRUST_PROXY=1 for a single reverse proxy on the same host, or a CIDR list such as TRUST_PROXY=100.64.0.0/10,192.168.1.10.',
            ),
          },
        ],
      },
      {
        k: 'code',
        lang: 'bash',
        caption: bi('دستورهای تشخیصیِ روزمره', 'Everyday diagnostics'),
        code: `# آیا زنده است؟
curl -s localhost:3001/api/ping
curl -s localhost:3001/livez ; curl -s localhost:3001/readyz

# چه مدل‌هایی همین الان کار می‌کنند؟
curl -s "localhost:3001/v1/models?execution_status=ready" \\
  -H "Authorization: Bearer freellmapi-..." | jq -r '.data[].id'

# چه کسی پاسخ داد و چند پرش خورد؟
curl -s localhost:3001/v1/chat/completions -D- -o /dev/null \\
  -H "Authorization: Bearer freellmapi-..." -H 'Content-Type: application/json' \\
  -d '{"model":"auto","messages":[{"role":"user","content":"ping"}]}' \\
  | grep -i 'x-routed-via\\|x-fallback'

# سلامت کلیدها
curl -s -X POST localhost:3001/api/health/check-all -H "Authorization: Bearer $TOKEN"`,
      },
    ],
  },

  /* ─────────────────────────── LIMITS ─────────────────────────── */
  {
    id: 'limits-supported',
    cat: 'limits',
    level: 'core',
    title: bi('محدودیت‌ها و آنچه پشتیبانی نمی‌شود', 'Limitations and what is not supported'),
    summary: bi(
      'سقفِ واقعیِ ردیف‌های رایگان و بخش‌هایی که عمداً پیاده‌سازی نشده‌اند.',
      'The real ceiling of free tiers, and what is deliberately out of scope.',
    ),
    blocks: [
      {
        k: 'list',
        items: [
          bi(
            'سهمیه و در دسترس بودن سقف هستند، نه کلاس مدل. کاتالوگ ردیف‌های کلاسِ اول را هم دارد (GPT-5.x، Grok 4.x، Kimi K3، DeepSeek V4 Pro، Gemini 3.x) اما دسترسیِ «پایدار» به آن‌ها را ندارید: این‌ها دقیقاً همان‌هایی هستند که کمترین سهمیهٔ روزانه و بیشترین احتمالِ حذف یا پولی‌شدن را دارند.',
            'Quota and availability are the ceiling, not model class. The catalog does carry frontier-class rows (GPT-5.x, Grok 4.x, Kimi K3, DeepSeek V4 Pro, Gemini 3.x) — what you do not get is sustained access to them: those are exactly the rows with the smallest daily allowances and the highest chance of being pulled or paywalled.',
          ),
          bi(
            'هوش در پایان روز افت می‌کند و در نیمه‌شب UTC بازنشانی می‌شود.',
            'Intelligence degrades as the day progresses and resets at UTC midnight.',
          ),
          bi('تأخیر بسیار متغیر است — Cerebras و Groq فوق‌العاده سریع‌اند، بقیه نه.', 'Latency is highly variable — Cerebras and Groq are extremely fast, others are not.'),
          bi('ردیف‌های رایگان بدون اطلاع قبلی تغییر می‌کنند؛ نصب‌های دارای فید زنده ظرف چند روز و نصب‌های رایگان در مسیر ۳۰روزه به‌روز می‌شوند.', 'Free tiers can change without notice; live-feed installs get fixes within days, free installs on the 30-day trail.'),
          bi('هیچ SLAای وجود ندارد — برای قابلیت اطمینانِ قراردادی، ارائه‌دهندهٔ پولی بخرید.', 'There is no SLA — if you need reliability, use a paid provider with a contract.'),
          bi('محلی‌محور و تک‌کاربره؛ آن را در اینترنت عمومی قرار ندهید.', 'Local-first and single-user; do not expose it to the internet.'),
        ],
      },
      {
        k: 'callout',
        tone: 'warn',
        title: bi('پشتیبانی‌نشده', 'Not supported'),
        text: bi(
          'moderation (/v1/moderations)، n > 1 (چند خروجی در یک درخواست) و احراز هویتِ چندمستأجره / صورتحسابِ هر کاربر. Pull Request‌هایی که این‌ها را اضافه کنند بسیار خوش‌آمدند.',
          'Moderation (/v1/moderations), n > 1 (multiple completions per request) and per-user billing / multi-tenant auth. PRs adding any of these are very welcome.',
        ),
      },
    ],
  },

  {
    id: 'limits-status',
    cat: 'limits',
    level: 'pro',
    title: bi('وضعیت صادقانهٔ هسته', 'Honest kernel status'),
    summary: bi(
      'چه تعداد ماژول سیم‌کشی شده و چرا این عدد خودبه‌خود کم نمی‌شود.',
      'How many modules are wired — and why that number does not shrink by itself.',
    ),
    blocks: [
      {
        k: 'text',
        text: bi(
          'هسته ۲۲۵ ماژول در agent/src/core دارد که ۱۶ تای آن‌ها به یک فراخوانِ تولیدی متصل‌اند و ۲۰۹ تا نه. این فهرستِ کارهایی نیست که خودبه‌خود کوتاه شود، و دلیلش را پیش از برنامه‌ریزی بهتر است بدانید: از آن ۲۰۹ ماژولِ بدون سیم، ۲۰۰ تا «واقعیت‌های ایمنی» را به عنوان ورودیِ بولی می‌گیرند — یعنی ادعایی را که فراخوان می‌کند اعتبارسنجی می‌کنند، نه اینکه خودشان آن را اثبات کنند. روی یکی از آن‌ها به‌صورت زنده نشان داده شده است که همان افزونه یک اجرا را وقتی به آن گفته می‌شود sandboxed: true و networkAllowed: false مجاز می‌داند و وقتی حقیقت گفته می‌شود رد می‌کند. کد یکسان، ورودی یکسان، صداقتِ فراخوان متفاوت.',
          'The kernel ships 225 modules in agent/src/core. 16 are wired to a production caller; 209 are not. That is not a to-do list that shrinks by itself, and the reason is worth knowing before you plan around it: of the 209 unwired modules, 200 take safety facts as boolean inputs — they validate a claim the caller makes rather than establishing it. Demonstrated live on one of them: the same plugin allows an execution when told sandboxed: true, networkAllowed: false, and denies it when told the truth. Same code, same inputs, different caller honesty.',
        ),
      },
      {
        k: 'callout',
        tone: 'tip',
        title: bi('۱۶ ماژولی که واقعاً متصل‌اند', 'The 16 modules that are wired'),
        text: bi(
          'دقیقاً همان‌هایی هستند که بدون اینکه چیزی به آن‌ها گفته شود، تصمیم می‌گیرند: موتور سیاست، ماشین حالت، مسیریاب، پاک‌سازِ راز. اتصالِ بقیه یعنی ساختنِ لایهٔ اندازه‌گیری، که agent-attestation.ts آغازش کرده است: هر ادعا همراه دارد «چگونه اثبات شده» (measured / configured / derived) و «هرگز بررسی نشده» پاسخی متفاوت از «بررسی شد و غلط بود» است. از حدود ۵۰۰ قابلیتِ فهرست‌شده، حدود ۱۷۵ مورد پیاده‌سازی و در دسترس‌اند.',
          'They are precisely the ones that decide something without being told it — the policy engine, the state machine, the router, the redactor. Wiring the rest means building the measurement layer first, which agent-attestation.ts started: a claim carries how it was established (measured / configured / derived), and “never checked” is a different answer from “checked and false”. Roughly 175 of the 500 catalogued capabilities are implemented and reachable.',
        ),
      },
    ],
  },

  /* ─────────────────────────── DEV ─────────────────────────── */
  {
    id: 'dev-tests',
    cat: 'dev',
    level: 'core',
    title: bi('تست‌ها، مایگریشن و CI', 'Tests, migrations and CI'),
    summary: bi(
      'فرمان‌هایی که پیش از هر Pull Request باید اجرا کنید.',
      'The commands to run before any pull request.',
    ),
    blocks: [
      {
        k: 'code',
        lang: 'bash',
        code: `npm test                          # همه چیز
npm test -w @freellmapi/server    # تست‌های سرور (~۴ دقیقه)
npm run agent:test                # تست‌های هسته
npm run lint && npm run build

npm run db:migration:create -- <name>   # ساخت مایگریشن
npm run db:migration:up                 # اعمال
npm run db:migration:status             # وضعیت
npm run db:migration:down               # بازگشت`,
      },
      {
        k: 'list',
        items: [
          bi('هر ابزار تست دارد که اگر نگهبانش برداشته شود، شکست می‌خورد؛ تعداد و فهرست ابزارها هم با تست بررسی می‌شوند.', 'Every tool has a test that fails if its guard is removed; the tool count and roster are test-checked too.'),
          bi('برچسبِ سندباکس (isolated) سخت‌کد نشده است و اگر سخت‌کد شود یک تست شکست می‌خورد.', 'The sandbox isolated flag is never hard-coded — a test fails if it is.'),
          bi('تست‌های ناسازگاری (compatibility suite) رفتار ارائه‌دهندگان را روی wireهای مختلف بررسی می‌کنند.', 'The compatibility suite checks provider behaviour across the different wire surfaces.'),
        ],
      },
      {
        k: 'callout',
        tone: 'note',
        text: bi(
          'راهنمای کاملِ مشارکت در CONTRIBUTING.md است: حلقهٔ توسعه، انتظارهای تست و سیاستِ پذیرش. مخزن دارای بررسیِ خودکار برای این است که آیا مستندات به‌روزرسانی شده‌اند (‎.claude/hooks/contributing-check.mjs).',
          'The full contributor guide is in CONTRIBUTING.md: the development loop, testing expectations and contribution policy. The repo ships a hook that checks whether documentation was updated (.claude/hooks/contributing-check.mjs).',
        ),
      },
    ],
  },

  {
    id: 'dev-structure',
    cat: 'dev',
    level: 'core',
    title: bi('ساختار مخزن', 'Repository layout'),
    summary: bi('هر پوشه چه چیزی را نگه می‌دارد.', 'What each top-level folder holds.'),
    blocks: [
      {
        k: 'cards',
        items: [
          { title: bi('سرور', 'server/'), text: bi('Express، مسیریاب، آداپتورهای ارائه‌دهنده، دفتر سهمیه، پایگاه داده و مایگریشن‌ها', 'Express, the router, provider adapters, the quota ledger, the database and migrations'), meta: 'server/src' },
          { title: bi('کلاینت', 'client/'), text: bi('داشبورد React + Vite + shadcn، i18n با ۶۰ زبان، صفحه‌ها و کامپوننت‌ها', 'The React + Vite + shadcn dashboard, i18n across 60 languages, pages and components'), meta: 'client/src' },
          { title: bi('عامل', 'agent/'), text: bi('هستهٔ قطعی در agent/src/core، ابزارها و ۱۳ پرامپت نسخه‌دار در agent/docs', 'The deterministic kernel in agent/src/core, the tools and 13 versioned prompts in agent/docs'), meta: 'agent/' },
          { title: bi('CLI', 'cli/'), text: bi('مولدهای پیکربندی برای ابزارهای کدنویسی و مدیریت کلیدها', 'Config generators for coding tools and key management'), meta: 'cli/src' },
          { title: bi('دسکتاپ', 'desktop/'), text: bi('اپ Electron منوبار با پاپ‌اورِ شیشه‌ای و پنجرهٔ داشبورد', 'The Electron menu-bar app with its glass popover and dashboard window'), meta: 'desktop/src' },
          { title: bi('اشتراکی', 'shared/'), text: bi('انواع و طرح‌واره‌های مشترک بین سرور و کلاینت', 'Types and schemas shared by server and client'), meta: 'shared/' },
          { title: bi('مستندات', 'docs/'), text: bi('راهنماهای نصب، API، کلاینت‌ها، معماری، استقرار، عیب‌یابی و واژه‌نامه (انگلیسی و چینی)', 'Install, API, clients, architecture, deployment, troubleshooting and glossary guides (English and Chinese)'), meta: 'docs/en' },
          { title: bi('اسکریپت‌ها', 'scripts/'), text: bi('راه‌اندازیِ توسعه و ابزارهای کمکی', 'Development bootstrap and helper tooling'), meta: 'scripts/' },
        ],
      },
    ],
  },

  /* ─────────────────────────── GLOSSARY ─────────────────────────── */
  {
    id: 'glossary-terms',
    cat: 'glossary',
    level: 'start',
    title: bi('واژه‌نامه', 'Glossary'),
    summary: bi('اصطلاحات کلیدی در یک نگاه.', 'Key terms at a glance.'),
    blocks: [
      {
        k: 'glossary',
        items: [
          {
            term: 'Headroom',
            d: bi('سهمیهٔ باقی‌ماندهٔ یک مدل/کلید پیش از محدودیت نرخ: ۱ منهای بیشینهٔ مصرفِ RPM/RPD/TPM/TPD. صفر یعنی ته‌کشیده، یک یعنی کامل.', 'Remaining quota for a model/key before the rate limit: 1 − max(RPM/RPD/TPM/TPD used). 0 is exhausted, 1 is full.'),
          },
          { term: 'RPD / TPD', d: bi('درخواست‌ها/توکن‌های روزانه — پنجره‌های سهمیهٔ روزانه.', 'Requests / tokens per day — the daily quota windows.') },
          { term: 'RPM / TPM', d: bi('درخواست‌ها/توکن‌های دقیقه‌ای — پنجرهٔ سهمیهٔ کوتاه.', 'Requests / tokens per minute — the short-window quota.') },
          { term: 'Pool key', d: bi('شناسهٔ استخرِ سهمیهٔ مشترک، مثلاً openrouter::free یا google::project. کلیدهای یک استخر یک مجوز دارند.', 'Shared quota-pool identifier, e.g. openrouter::free or google::project. Keys in one pool share one allowance.') },
          { term: 'Least-remaining', d: bi('استراتژیِ انتخاب کلید که کلیدی با بیشترین سهمیهٔ باقی‌مانده در استخر را برمی‌گزیند.', 'Key-selection strategy picking the key with the most remaining quota in the pool.') },
          { term: 'auto:<name>', d: bi('زنجیرهٔ نام‌دار که در GET /v1/models به عنوان یک مدلِ قابل انتخاب نمایش داده می‌شود.', 'A named fallback chain exposed as a selectable model in GET /v1/models.') },
          { term: 'Bandit router', d: bi('مسیریابِ Thompson-sampling که پسین‌های قابلیت‌اطمینان/سرعت/هوش/سهمیه را با ۱۰٪ کاوش متوازن می‌کند.', 'A Thompson-sampling router balancing reliability/speed/intelligence/headroom posteriors with 10% explore.') },
          { term: 'In-flight window', d: bi('پنجرهٔ حذفِ تکرارِ درخواست‌های هم‌زمان — برای idempoency حذف نمی‌شود، پس تلاشِ هم‌زمان با یک کلید می‌تواند مسابقه بدهد.', 'The concurrent-request dedup window — not deduplicated for idempotency, so a concurrent retry with the same key may race.') },
          { term: 'Cooldown', d: bi('پس از ۴۲۹/۵xx کلید برای مدتی کنار گذاشته می‌شود و مدل بعدی تلاش می‌گردد.', 'After a 429/5xx a key is sidelined for a while while the next model is tried.') },
          { term: 'Sticky session', d: bi('نگه داشتنِ گفت‌وگو روی یک مدل برای ۳۰ دقیقه تا از تعویضِ بی‌دلیل جلوگیری شود.', 'Keeping a conversation on one model for 30 minutes to avoid needless switching.') },
          { term: 'Context handoff', d: bi('یک پیام system فشرده هنگام تعویضِ مدل در میانهٔ گفت‌وگو که می‌گوید ادامهٔ کارِ دیگری را بر عهده گرفته‌اید.', 'A compact system message on a mid-chat model switch saying you are taking over someone else’s task.') },
          { term: 'Tool-call rescue', d: bi('تبدیلِ فراخوانی‌های ابزارِ متنیِ مدل‌ها به tool_calls واقعی.', 'Converting plain-text tool calls into real tool_calls.') },
          { term: 'Degraded mode', d: bi('وقتی بخشی از استخر در دسترس نیست؛ در داشبورد با نوار وضعیت نشان داده می‌شود.', 'When part of the pool is unavailable; surfaced as a status banner in the dashboard.') },
          { term: 'execution_status', d: bi('ready | needsKey | exhausted — پاسخ زنده به «آیا همین الان یک درخواست جواب می‌دهد؟»', 'ready | needsKey | exhausted — a live answer to “would a request work right now?”.') },
          { term: 'Fusion', d: bi('مدل مجازی که پرامپت را به پانلی از مدل‌ها می‌فرستد و یک داور پاسخ را ترکیب می‌کند.', 'A virtual model that fans the prompt out to a panel and synthesises one answer.') },
          { term: 'ForgePilot', d: bi('هستهٔ قطعیِ عامل: حالت‌های محاسباتی، موتور سیاست، ماشین حالت، پاک‌سازیِ راز و حسابرسیِ شواهد.', 'The deterministic agent kernel: compute modes, policy engine, state machine, redaction and evidence auditing.') },
          {
            term: 'Compute mode',
            d: bi('free | paid | local — یک کلید که سیاستِ ارائه‌دهنده، بودجه، اجرا و قابلیت‌های مجاز را تعیین می‌کند.', 'free | paid | local — one switch setting provider policy, budget, execution and allowed capabilities.'),
          },
          { term: 'Egress policy', d: bi('تصمیم دربارهٔ اینکه آیا داده می‌تواند از دستگاه خارج شود؛ حالت local یک دیوار است، نه ترجیح.', 'The decision on whether data may leave the machine; local mode is a wall, not a preference.') },
          { term: 'Evidence audit', d: bi('بررسیِ ادعای «کار تمام شد» در برابر شواهد (تست‌ها، فرمان‌ها، معیارهای پذیرش).', 'Checking a “task complete” claim against evidence (tests, commands, acceptance criteria).') },
          { term: 'Checkpoint chain', d: bi('هر نقطه‌بازبینی هشِ قبلی را دارد؛ /verify محل شکست را نام می‌برد.', 'Each checkpoint carries the previous hash; /verify names where it broke.') },
          { term: 'Fetch Relay', d: bi('ترابردی که درخواست‌های خروجی را از طریق یک relay راه‌دور می‌فرستد؛ آدرس‌های لوپ‌بک مسدودند.', 'A transport that sends outbound requests through a remote relay; loopback URLs are blocked.') },
          { term: 'TRUST_PROXY', d: bi('متغیری که به Express می‌گوید به X-Forwarded-For/Proto اعتماد کند تا IP واقعیِ کلاینت دیده شود.', 'A variable telling Express to trust X-Forwarded-For/Proto so the real client IP is visible.') },
          { term: 'Client profile', d: bi('اعتبارِ جداگانه برای هر کلاینت متصل، ساخته‌شده در تب API key.', 'A separate credential per connected client, created on the API-key tab.') },
          { term: 'URL token', d: bi('توکنِ قابل‌لغو برای ابزارهایی که فقط پایهٔ URL را می‌پذیرند: /v1/t/<token>/…', 'A revocable token for tools that accept only a base URL: /v1/t/<token>/…') },
        ],
      },
    ],
  },
]

/* ═══════════════════════════════════════════════════════════════════════════
 * UI chrome strings (bilingual)
 * ═══════════════════════════════════════════════════════════════════════════ */

const UI = {
  title: bi('راهنمای جامع FreeLLMAPI', 'The complete FreeLLMAPI guide'),
  subtitle: bi(
    'از نصب تا هستهٔ عامل — تعاملی، دو زبانه، با پیشرفتِ ذخیره‌شده در مرورگر شما.',
    'From install to the agent kernel — interactive, bilingual, with progress saved in your browser.',
  ),
  search: bi('جست‌وجو در همهٔ مطالب…', 'Search all content…'),
  contents: bi('فهرست', 'Contents'),
  allLevels: bi('همه سطوح', 'All levels'),
  allCats: bi('همه دسته‌ها', 'All categories'),
  bookmarked: bi('نشان‌شده‌ها', 'Bookmarked'),
  focus: bi('حالت تمرکز', 'Focus mode'),
  focusHint: bi('فقط بخش انتخاب‌شده باز می‌ماند', 'Only the selected section stays open'),
  read: bi('خواندم', 'Mark read'),
  unread: bi('خوانده‌شده', 'Read'),
  progress: bi('پیشرفت', 'Progress'),
  reset: bi('پاک‌سازی پیشرفت', 'Reset progress'),
  print: bi('چاپ', 'Print'),
  langLabel: bi('زبان', 'Language'),
  sections: bi('بخش', 'sections'),
  noResults: bi('هیچ بخشی با این جست‌وجو پیدا نشد.', 'No section matches this search.'),
  noResultsHint: bi('کلمهٔ کوتاه‌تری امتحان کنید یا فیلتر سطح را روی «همه» بگذارید.', 'Try a shorter word, or set the level filter back to “All”.'),
  expand: bi('باز کردن', 'Expand'),
  collapse: bi('بستن', 'Collapse'),
  next: bi('بخش بعدی', 'Next section'),
  prev: bi('بخش قبلی', 'Previous section'),
  top: bi('بالای صفحه', 'Back to top'),
  hintSearch: bi('هر چیزی: auto:fast، sandbox، ENCRYPTION_KEY، ۴۰۰، MCP…', 'Anything: auto:fast, sandbox, ENCRYPTION_KEY, 400, MCP…'),
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Block renderer
 * ═══════════════════════════════════════════════════════════════════════════ */

function BlockView({
  block,
  lang,
  checks,
  onChecks,
}: {
  block: Block
  lang: Lang
  checks: boolean[]
  onChecks: (next: boolean[]) => void
}) {
  switch (block.k) {
    case 'text':
      return <p className="text-[13.5px] leading-7 text-muted-foreground">{block.text[lang]}</p>
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul'
      return (
        <Tag className="space-y-1.5 ps-5 text-[13.5px] leading-7 text-muted-foreground">
          {block.items.map((it, i) => (
            <li key={i} className={block.ordered ? 'list-decimal' : 'list-disc'}>
              {it[lang]}
            </li>
          ))}
        </Tag>
      )
    }
    case 'code':
      return <CodeBlock block={block} lang={lang} />
    case 'table':
      return <DataTable block={block} lang={lang} />
    case 'callout':
      return <Callout block={block} lang={lang} />
    case 'steps':
      return (
        <ol className="space-y-2">
          {block.items.map((it, i) => (
            <li key={i} className={cx(SUBTLE, 'flex items-start gap-3 p-3')}>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-background text-[11px] font-semibold">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{it.title[lang]}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{it.text[lang]}</p>
              </div>
            </li>
          ))}
        </ol>
      )
    case 'quiz':
      return <Quiz block={block} lang={lang} />
    case 'faq':
      return <Faq block={block} lang={lang} />
    case 'checklist':
      return <Checklist block={block} lang={lang} value={checks} onChange={onChecks} />
    case 'matrix':
      return <Matrix block={block} lang={lang} />
    case 'chips':
      return <Chips block={block} lang={lang} />
    case 'flow':
      return <Flow block={block} lang={lang} />
    case 'cards':
      return <Cards block={block} lang={lang} />
    case 'endpoints':
      return <Endpoints block={block} lang={lang} />
    case 'env':
      return <EnvTable block={block} lang={lang} />
    case 'agents':
      return <AgentsTable block={block} lang={lang} />
    case 'glossary':
      return <Glossary block={block} lang={lang} />
    case 'tools':
      return <ToolsTable block={block} lang={lang} />
    default:
      return null
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Section renderer
 * ═══════════════════════════════════════════════════════════════════════════ */

function SectionView({
  section,
  lang,
  index,
  total,
  isRead,
  isBookmarked,
  open,
  onToggleOpen,
  onToggleRead,
  onToggleBookmark,
  checks,
  onChecks,
  onNext,
}: {
  section: Section
  lang: Lang
  index: number
  total: number
  isRead: boolean
  isBookmarked: boolean
  open: boolean
  onToggleOpen: () => void
  onToggleRead: () => void
  onToggleBookmark: () => void
  checks: boolean[]
  onChecks: (next: boolean[]) => void
  onNext: () => void
}) {
  const cat = CATEGORIES.find((c) => c.id === section.cat)
  const CatIcon = cat?.Icon ?? BookOpen
  const level = LEVELS.find((l) => l.id === section.level)
  return (
    <section
      id={`guide-sec-${section.id}`}
      className={cx(PANEL, 'scroll-mt-24 overflow-hidden', isRead && 'ring-1 ring-emerald-500/20')}
    >
      <header className="flex flex-wrap items-start gap-3 border-b border-border bg-muted/40 px-4 py-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CatIcon className="size-4" />
        </span>
        <button
          type="button"
          onClick={onToggleOpen}
          className="min-w-0 flex-1 text-start"
          aria-expanded={open}
        >
          <h2 className="text-base font-semibold leading-tight">{section.title[lang]}</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            {section.summary[lang]}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={CHIP}>
              <Layers className="size-3" />
              {cat?.title[lang]}
            </span>
            {level && <span className={cx(CHIP, level.color)}>{level.title[lang]}</span>}
            <span className={CHIP}>
              <ClipboardCheck className="size-3" />
              {index + 1} / {total}
            </span>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onToggleBookmark}
            className={cx(
              'rounded-md border border-border p-1.5 transition-colors hover:bg-accent',
              isBookmarked && 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400',
            )}
            aria-label={UI.bookmarked[lang]}
            title={UI.bookmarked[lang]}
          >
            <Sparkles className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggleRead}
            className={cx(
              'inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors',
              isRead
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-border hover:bg-accent',
            )}
          >
            <Check className="size-3" />
            {isRead ? UI.unread[lang] : UI.read[lang]}
          </button>
          <button
            type="button"
            onClick={onToggleOpen}
            className="rounded-md border border-border p-1.5 transition-colors hover:bg-accent"
            aria-label={open ? UI.collapse[lang] : UI.expand[lang]}
          >
            <ChevronDown className={cx('size-3.5 transition-transform', !open && '-rotate-90')} />
          </button>
        </div>
      </header>
      {open && (
        <div className="space-y-4 px-4 py-4">
          {section.blocks.map((b, i) => (
            <BlockView key={i} block={b} lang={lang} checks={checks} onChecks={onChecks} />
          ))}
          <div className="flex justify-end border-t border-border pt-3">
            <button type="button" onClick={onNext} className={BTN}>
              {UI.next[lang]}
              <ChevronRight className={cx('size-3.5', lang === 'fa' && 'rotate-180')} />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Page
 * ═══════════════════════════════════════════════════════════════════════════ */

export default function GuidePage() {
  const [store, setStore] = useState<Persisted>(loadState)
  const lang = store.lang
  const [query, setQuery] = useState('')
  const [catFilter, setCatFilter] = useState<string>('all')
  const [levelFilter, setLevelFilter] = useState<Level | 'all'>('all')
  const [focus, setFocus] = useState(false)
  const [active, setActive] = useState<string>(SECTIONS[0].id)
  const [openCats, setOpenCats] = useState<string[]>(() => CATEGORIES.map((c) => c.id))
  const [drawer, setDrawer] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store))
    } catch {
      /* storage unavailable — the guide still works, it just will not remember */
    }
  }, [store])

  const readSet = useMemo(() => new Set(store.read), [store.read])
  const bmSet = useMemo(() => new Set(store.bookmarks), [store.bookmarks])

  const haystack = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of SECTIONS) {
      map.set(
        s.id,
        [s.title.fa, s.title.en, s.summary.fa, s.summary.en, ...s.blocks.flatMap((b) => [blockText(b, 'fa'), blockText(b, 'en')])]
          .join(' ')
          .toLowerCase(),
      )
    }
    return map
  }, [])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return SECTIONS.filter((s) => {
      if (catFilter === 'bookmarks') {
        if (!bmSet.has(s.id)) return false
      } else if (catFilter !== 'all' && s.cat !== catFilter) {
        return false
      }
      if (levelFilter !== 'all' && s.level !== levelFilter) return false
      if (!q) return true
      return (haystack.get(s.id) ?? '').includes(q)
    })
  }, [query, catFilter, levelFilter, bmSet, haystack])

  const visibleIds = useMemo(() => visible.map((s) => s.id), [visible])

  const patch = useCallback((fn: (prev: Persisted) => Persisted) => setStore(fn), [])

  const toggleRead = useCallback(
    (id: string) =>
      patch((prev) => ({
        ...prev,
        read: prev.read.includes(id) ? prev.read.filter((x) => x !== id) : [...prev.read, id],
      })),
    [patch],
  )

  const toggleBookmark = useCallback(
    (id: string) =>
      patch((prev) => ({
        ...prev,
        bookmarks: prev.bookmarks.includes(id)
          ? prev.bookmarks.filter((x) => x !== id)
          : [...prev.bookmarks, id],
      })),
    [patch],
  )

  const setChecks = useCallback(
    (id: string, next: boolean[]) =>
      patch((prev) => ({ ...prev, checks: { ...prev.checks, [id]: next } })),
    [patch],
  )

  const goTo = useCallback((id: string) => {
    setActive(id)
    setDrawer(false)
    // Let React commit the (possibly collapsed) section before scrolling to it.
    window.setTimeout(() => {
      document.getElementById(`guide-sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 30)
  }, [])

  const goNext = useCallback(() => {
    const i = visibleIds.indexOf(active)
    const nextId = visibleIds[Math.min(i + 1, visibleIds.length - 1)]
    if (nextId) goTo(nextId)
  }, [active, visibleIds, goTo])

  const isOpen = (id: string) => (focus ? active === id : true)

  const pct = Math.round((store.read.length / SECTIONS.length) * 100)

  const catCounts = useMemo(() => {
    const m = new Map<string, { total: number; read: number }>()
    for (const c of CATEGORIES) m.set(c.id, { total: 0, read: 0 })
    for (const s of SECTIONS) {
      const e = m.get(s.cat)
      if (!e) continue
      e.total += 1
      if (readSet.has(s.id)) e.read += 1
    }
    return m
  }, [readSet])

  const sidebar = (
    <nav className="space-y-1" aria-label={UI.contents[lang]}>
      <button
        type="button"
        onClick={() => setCatFilter('all')}
        className={cx(
          'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-start text-xs font-semibold transition-colors',
          catFilter === 'all' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
        )}
      >
        <span>{UI.allCats[lang]}</span>
        <span className="opacity-70">{SECTIONS.length}</span>
      </button>
      <button
        type="button"
        onClick={() => setCatFilter('bookmarks')}
        className={cx(
          'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-start text-xs font-medium transition-colors',
          catFilter === 'bookmarks' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
        )}
      >
        <span className="flex items-center gap-1.5">
          <Sparkles className="size-3" />
          {UI.bookmarked[lang]}
        </span>
        <span className="opacity-70">{store.bookmarks.length}</span>
      </button>
      <div className="pt-2" />
      {CATEGORIES.map((cat) => {
        const Icon = cat.Icon
        const counts = catCounts.get(cat.id) ?? { total: 0, read: 0 }
        const isOpenCat = openCats.includes(cat.id)
        const items = SECTIONS.filter((s) => s.cat === cat.id)
        return (
          <div key={cat.id}>
            <div className="flex items-stretch gap-0.5">
              <button
                type="button"
                onClick={() => setCatFilter(catFilter === cat.id ? 'all' : cat.id)}
                className={cx(
                  'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-start text-xs transition-colors',
                  catFilter === cat.id ? 'bg-accent font-semibold text-accent-foreground' : 'hover:bg-accent/60',
                )}
                title={cat.blurb[lang]}
              >
                <Icon className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{cat.title[lang]}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {counts.read}/{counts.total}
                </span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setOpenCats((prev) =>
                    prev.includes(cat.id) ? prev.filter((x) => x !== cat.id) : [...prev, cat.id],
                  )
                }
                className="rounded-lg px-1 text-muted-foreground transition-colors hover:bg-accent"
                aria-label={isOpenCat ? UI.collapse[lang] : UI.expand[lang]}
              >
                <ChevronDown className={cx('size-3.5 transition-transform', !isOpenCat && '-rotate-90')} />
              </button>
            </div>
            {isOpenCat && (
              <ul className="mt-0.5 space-y-0.5 border-s border-border ps-2 ms-2">
                {items.map((s) => {
                  const dim = !visibleIds.includes(s.id)
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => goTo(s.id)}
                        className={cx(
                          'flex w-full items-start gap-1.5 rounded-md px-2 py-1 text-start text-[11.5px] leading-snug transition-colors',
                          active === s.id ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-accent/60',
                          dim && 'opacity-40',
                        )}
                      >
                        <span className="mt-0.5 shrink-0">
                          {readSet.has(s.id) ? (
                            <CheckCircle2 className="size-3 text-emerald-500" />
                          ) : (
                            <Circle className="size-3 text-muted-foreground" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">{s.title[lang]}</span>
                        {bmSet.has(s.id) && <Sparkles className="mt-0.5 size-3 shrink-0 text-amber-500" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </nav>
  )

  return (
    <div
      dir={lang === 'fa' ? 'rtl' : 'ltr'}
      className="guide-root text-foreground"
      style={lang === 'fa' ? { fontFamily: FA_FONT } : undefined}
    >
      <style>{`
        @media print {
          .guide-no-print { display: none !important; }
          .guide-root section { break-inside: avoid; }
        }
      `}</style>

      {/* Header */}
      <div className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
              <BookOpen className="size-5 text-primary" />
              {UI.title[lang]}
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              {UI.subtitle[lang]}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1 rounded-md border border-border bg-background p-0.5">
              <button
                type="button"
                onClick={() => patch((p) => ({ ...p, lang: 'fa' }))}
                className={cx(
                  'inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors',
                  lang === 'fa' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                )}
              >
                <Languages className="size-3" />
                فارسی
              </button>
              <button
                type="button"
                onClick={() => patch((p) => ({ ...p, lang: 'en' }))}
                className={cx(
                  'rounded px-2 py-1 text-[11px] font-medium transition-colors',
                  lang === 'en' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                )}
              >
                English
              </button>
            </div>
            <button type="button" className={BTN} onClick={() => setFocus((f) => !f)} aria-pressed={focus}>
              <Wand2 className="size-3.5" />
              {UI.focus[lang]}
            </button>
            <button type="button" className={BTN} onClick={() => window.print()}>
              <ScrollText className="size-3.5" />
              {UI.print[lang]}
            </button>
            <button
              type="button"
              className={BTN}
              onClick={() => patch((p) => ({ ...p, read: [], checks: {}, bookmarks: [] }))}
            >
              <RefreshCcw className="size-3.5" />
              {UI.reset[lang]}
            </button>
          </div>
        </div>

        {/* Progress + filters */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className={cx(PANEL, 'flex items-center gap-2.5 px-3 py-1.5')}>
            <span className="relative inline-flex size-7 items-center justify-center">
              <svg viewBox="0 0 36 36" className="size-7 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" className="stroke-border" />
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  strokeWidth="3"
                  strokeLinecap="round"
                  className="stroke-primary transition-all"
                  strokeDasharray={`${(pct / 100) * 97.4} 97.4`}
                />
              </svg>
              <span className="absolute text-[9px] font-semibold tabular-nums">{pct}</span>
            </span>
            <div className="text-[11px] leading-tight">
              <div className="font-semibold">{UI.progress[lang]}</div>
              <div className="text-muted-foreground">
                {store.read.length} / {SECTIONS.length} {UI.sections[lang]}
              </div>
            </div>
          </div>

          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`${UI.search[lang]} — ${UI.hintSearch[lang]}`}
              className="w-full rounded-md border border-input bg-background py-2 pe-3 ps-9 text-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
              aria-label={UI.search[lang]}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent"
                aria-label="clear"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <Filter className="size-3.5 text-muted-foreground" />
            <button
              type="button"
              onClick={() => setLevelFilter('all')}
              className={cx(
                'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                levelFilter === 'all' ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent',
              )}
            >
              {UI.allLevels[lang]}
            </button>
            {LEVELS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLevelFilter(l.id)}
                className={cx(
                  'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                  levelFilter === l.id ? 'border-primary bg-primary text-primary-foreground' : cx('border-border hover:bg-accent', l.color),
                )}
              >
                {l.title[lang]}
              </button>
            ))}
          </div>

          <button type="button" className={cx(BTN, 'lg:hidden')} onClick={() => setDrawer((d) => !d)}>
            <Menu className="size-3.5" />
            {UI.contents[lang]}
          </button>
        </div>

        {focus && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            <Wand2 className="me-1 inline size-3" />
            {UI.focusHint[lang]}
          </p>
        )}
      </div>

      <div className="flex gap-4">
        {/* Sidebar (desktop) */}
        <aside className="guide-no-print hidden w-64 shrink-0 lg:block">
          <div className={cx(PANEL, 'sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto p-2')}>
            {sidebar}
          </div>
        </aside>

        {/* Mobile drawer */}
        {drawer && (
          <div className="guide-no-print fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setDrawer(false)}
              aria-hidden
            />
            <div
              className={cx(
                'absolute inset-y-0 max-h-full w-72 overflow-y-auto p-3',
                lang === 'fa' ? 'start-0' : 'end-0',
              )}
            >
              <div className={cx(PANEL, 'p-3')}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold">{UI.contents[lang]}</span>
                  <button
                    type="button"
                    onClick={() => setDrawer(false)}
                    className="rounded p-1 hover:bg-accent"
                    aria-label="close"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                <div className="max-h-[70dvh] overflow-y-auto">{sidebar}</div>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <main className="min-w-0 flex-1 space-y-4">
          {visible.length === 0 && (
            <div className={cx(PANEL, 'px-4 py-10 text-center')}>
              <Search className="mx-auto mb-2 size-5 text-muted-foreground" />
              <p className="text-sm font-medium">{UI.noResults[lang]}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{UI.noResultsHint[lang]}</p>
              <button
                type="button"
                className={cx(BTN_PRIMARY, 'mt-3')}
                onClick={() => {
                  setQuery('')
                  setCatFilter('all')
                  setLevelFilter('all')
                }}
              >
                <RefreshCcw className="size-3.5" />
                {UI.reset[lang]}
              </button>
            </div>
          )}

          {visible.map((s, i) => {
            const checklist = s.blocks.find((b): b is Extract<Block, { k: 'checklist' }> => b.k === 'checklist')
            const saved = store.checks[checklist?.id ?? ''] ?? []
            return (
              <SectionView
                key={s.id}
                section={s}
                lang={lang}
                index={i}
                total={visible.length}
                isRead={readSet.has(s.id)}
                isBookmarked={bmSet.has(s.id)}
                open={isOpen(s.id)}
                onToggleOpen={() => setActive((prev) => (focus && prev === s.id ? '' : s.id))}
                onToggleRead={() => toggleRead(s.id)}
                onToggleBookmark={() => toggleBookmark(s.id)}
                checks={checklist ? checklist.items.map((_, idx) => Boolean(saved[idx])) : []}
                onChecks={(next) => checklist && setChecks(checklist.id, next)}
                onNext={goNext}
              />
            )
          })}

          <div className="flex justify-center pb-6">
            <button
              type="button"
              className={BTN}
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              <ChevronDown className="size-3.5 rotate-180" />
              {UI.top[lang]}
            </button>
          </div>
        </main>
      </div>
    </div>
  )
}

