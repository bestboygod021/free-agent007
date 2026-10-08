import type { HealthPlatform, HealthData, HealthKeyRow, DegradationStatus } from '../../../../shared/types'
export type { HealthPlatform, HealthData, HealthKeyRow }
import { AlertTriangle, ExternalLink } from 'lucide-react'
import { useI18n } from '@/i18n'

// Small "Get API key" external link shown next to a provider (#137).
export function GetKeyLink({ url }: { url: string }) {
  const { t } = useI18n()
  if (!url) return null
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {t('keys.getApiKey')}
      <ExternalLink className="size-3" />
    </a>
  )
}

// Page-level banner for the gateway's degradation machine: rendered only
// while routing is actually degraded, so a healthy dashboard stays quiet.
// `degradedAt` is epoch ms (null only if the state machine never stamped it).
export function DegradationBanner({ status }: { status?: DegradationStatus }) {
  const { t, locale } = useI18n()
  if (!status || status.state !== 'degraded') return null
  const since = status.degradedAt == null
    ? '\u2014'
    : new Date(status.degradedAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>
        {t('keys.degradedBanner', { healthy: status.healthyProviders, total: status.totalProviders, since })}
      </span>
    </div>
  )
}
