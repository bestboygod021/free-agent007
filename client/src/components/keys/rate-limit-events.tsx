import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { useI18n } from '@/i18n'

// Operator view over the rate limiter's rejection trail: every 429 the server
// itself answered (dashboard /api and proxy /v1 buckets) lands here, newest
// first. Data is in-memory server-side and resets on restart; the query
// refetches every minute so a live throttling episode stays visible.
type RateLimitEvent = {
  ts: number
  scope: 'proxy' | 'admin'
  method: string
  path: string
  ip: string
  limit: number
  retryAfter: number
}

export function RateLimitEvents() {
  const { t, locale } = useI18n()
  const { data } = useQuery<{ events: RateLimitEvent[] }>({
    queryKey: ['rate-limit-events'],
    queryFn: () => apiFetch('/api/health/rate-limits'),
    refetchInterval: 60_000,
    retry: false,
  })

  const events = data?.events ?? []

  return (
    <section aria-labelledby="rate-limit-events-title" className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 id="rate-limit-events-title" className="text-sm font-semibold">
          {t('rateLimitEvents.title')}
        </h3>
        <span className="text-xs tabular-nums text-muted-foreground">{events.length}</span>
      </div>
      {events.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">{t('rateLimitEvents.empty')}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {events.slice(0, 5).map(event => (
            <li key={event.ts} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="rounded bg-muted px-1.5 py-0.5 font-medium">
                {event.scope === 'proxy' ? t('rateLimitEvents.proxyScope') : t('rateLimitEvents.adminScope')}
              </span>
              <span className="font-mono">
                {event.method} {event.path}
              </span>
              <span className="text-muted-foreground">{new Date(event.ts).toLocaleString(locale)}</span>
              <span className="text-muted-foreground">Retry-After: {event.retryAfter}s</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
