import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { useI18n } from '@/i18n'

// Live count of recent 429s on the "Keys" nav entry: a quiet dashboard shows
// nothing, a throttling episode is visible before the operator opens the page.
// Mounted inside App's nav loops — i.e. inside AuthGate — so a pre-auth 401 can
// never reach the global unauthorized handler and sign the user out.
export function KeysNavBadge() {
  const { t } = useI18n()
  const { data } = useQuery<{ events: unknown[] }>({
    queryKey: ['rate-limit-events', 'badge'],
    queryFn: () => apiFetch('/api/health/rate-limits'),
    refetchInterval: 120_000,
    retry: false,
  })
  const count = data?.events.length ?? 0
  if (count === 0) return null
  return (
    <span
      aria-label={t('rateLimitEvents.title')}
      title={t('rateLimitEvents.title')}
      className="ms-1.5 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-destructive tabular-nums"
    >
      {count}
    </span>
  )
}
