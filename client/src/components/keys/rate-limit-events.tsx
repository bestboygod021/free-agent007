import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { useI18n } from '@/i18n'

// Operator view over the rate limiters' rejection trail: every 429 the server
// answered (dashboard /api, proxy /v1, per-key buckets) lands here, newest
// first, with filters, an expandable detail row, the pivot into the caller's
// request history, an hourly trend, and the live per-key window counters.
// Events are durable server-side (rate_limit_events, 7-day retention); the
// key counters are in-memory by nature. The query refetches every minute so a
// live throttling episode stays visible.
type RateLimitEvent = {
  ts: number
  scope: 'proxy' | 'admin' | 'key'
  method: string
  path: string
  ip: string | null
  subject: string | null
  limit: number
  retryAfter: number
}

type KeyUsage = { subject: string; count: number; limit: number; resetAt: number }

type Stats = {
  windowHours: number
  buckets: Array<{ hour: string; count: number }>
  byPath: Array<{ path: string; scope: RateLimitEvent['scope']; count: number }>
}

type ScopeFilter = 'all' | RateLimitEvent['scope']

const SCOPES: ScopeFilter[] = ['all', 'proxy', 'admin', 'key']

function scopeLabel(t: (k: string) => string, scope: RateLimitEvent['scope']): string {
  if (scope === 'proxy') return t('rateLimitEvents.proxyScope')
  if (scope === 'admin') return t('rateLimitEvents.adminScope')
  return t('rateLimitEvents.keyScope')
}

export function RateLimitEvents() {
  const { t, locale } = useI18n()
  const [filter, setFilter] = useState<ScopeFilter>('all')
  const [openKey, setOpenKey] = useState<string | null>(null)
  // Pinned once so the trend strip's hour labels stay stable across re-renders
  // (react-hooks/purity forbids Date.now() in the render body).
  const [now] = useState(() => Date.now())

  const { data } = useQuery<{ events: RateLimitEvent[]; keyUsage: KeyUsage[] }>({
    queryKey: ['rate-limit-events'],
    queryFn: () => apiFetch('/api/health/rate-limits'),
    refetchInterval: 60_000,
    retry: false,
  })
  const { data: stats } = useQuery<Stats>({
    queryKey: ['rate-limit-events', 'stats'],
    queryFn: () => apiFetch('/api/health/rate-limits/stats'),
    refetchInterval: 60_000,
    retry: false,
  })

  const allEvents = data?.events ?? []
  const events = filter === 'all' ? allEvents : allEvents.filter(e => e.scope === filter)
  const keyUsage = data?.keyUsage ?? []
  const buckets = stats?.buckets ?? []
  const maxBucket = Math.max(1, ...buckets.map(b => b.count))

  return (
    <section aria-labelledby="rate-limit-events-title" className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="rate-limit-events-title" className="text-sm font-semibold">
          {t('rateLimitEvents.title')}
        </h3>
        <div role="group" aria-label={t('rateLimitEvents.title')} className="flex flex-wrap gap-1">
          {SCOPES.map(scope => (
            <button
              key={scope}
              type="button"
              aria-pressed={filter === scope}
              onClick={() => {
                setFilter(scope)
                setOpenKey(null)
              }}
              className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                filter === scope ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {scope === 'all' ? t('rateLimitEvents.filterAll') : scopeLabel(t, scope)}
            </button>
          ))}
        </div>
      </div>

      {events.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">{t('rateLimitEvents.empty')}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {events.slice(0, 5).map(event => {
            const key = `${event.ts}|${event.path}|${event.scope}`
            const open = openKey === key
            return (
              <li key={key}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenKey(open ? null : key)}
                  className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted"
                >
                  <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{scopeLabel(t, event.scope)}</span>
                  <span className="font-mono">
                    {event.method} {event.path}
                  </span>
                  {event.subject && <span className="font-mono text-muted-foreground">{event.subject}</span>}
                  <span className="text-muted-foreground">{new Date(event.ts).toLocaleString(locale)}</span>
                </button>
                {open && (
                  <div className="mb-1 rounded-md border bg-muted/40 px-2.5 py-1.5 text-xs">
                    <p className="text-muted-foreground">
                      {t('rateLimitEvents.details', {
                        ip: event.ip ?? '—',
                        limit: event.limit,
                        retry: event.retryAfter,
                      })}
                    </p>
                    {event.ip && (
                      <Link
                        to={`/analytics?clientIp=${encodeURIComponent(event.ip)}`}
                        className="mt-1 inline-block font-medium text-primary hover:underline"
                      >
                        {t('rateLimitEvents.callerHistory')} →
                      </Link>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Hourly trend — empty buckets render as a hairline so the 24h shape stays readable. */}
      <div className="mt-4">
        <p className="text-xs font-medium text-muted-foreground">{t('rateLimitEvents.hourlyTrend')}</p>
        <div className="mt-1 flex h-8 items-end gap-0.5" role="img" aria-label={t('rateLimitEvents.hourlyTrend')}>
          {Array.from({ length: 24 }, (_, i) => {
            const date = new Date(now - (23 - i) * 3_600_000)
            const hour = date.toISOString().slice(0, 13)
            const found = buckets.find(b => b.hour === hour)
            const count = found?.count ?? 0
            return (
              <div
                key={hour}
                title={`${hour}:00 — ${count}`}
                className={`flex-1 rounded-sm ${count > 0 ? 'bg-primary/70' : 'bg-muted'}`}
                style={{ height: count > 0 ? `${Math.max(12, (count / maxBucket) * 100)}%` : '2px' }}
              />
            )
          })}
        </div>
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {(stats?.byPath ?? []).slice(0, 5).map(row => (
            <li key={`${row.scope}|${row.path}`} className="font-mono">
              {row.path} ×{row.count}
            </li>
          ))}
        </ul>
      </div>

      {/* Live per-key window counters (proxy key buckets). */}
      {keyUsage.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-muted-foreground">{t('rateLimitEvents.keyUsage')}</p>
          <ul className="mt-1 space-y-1.5">
            {keyUsage.map(row => (
              <li key={row.subject} className="text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono">{row.subject}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {row.count}/{row.limit}
                  </span>
                </div>
                <div
                  className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuenow={row.count}
                  aria-valuemin={0}
                  aria-valuemax={row.limit}
                >
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${Math.min(100, (row.count / Math.max(1, row.limit)) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
