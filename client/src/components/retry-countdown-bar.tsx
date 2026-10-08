import { useEffect, useSyncExternalStore } from 'react'
import { FloatingBar } from './floating-bar'
import { getRetryCountdown, retryWaitLabel, subscribeRetryCountdown } from '@/lib/api'
import { useI18n } from '@/i18n'

// Persistent companion to the 429 toast: a FloatingBar pill that keeps the
// countdown visible even when the toast is dismissed, covered, or the operator
// switched pages — and it arms a beforeunload warning while the window is
// still ticking. (A reload now restores the deadline from sessionStorage, but
// a stray navigation mid-window still costs the operator their place in line,
// so the browser asks first.)
export function RetryCountdownBar() {
  const { t } = useI18n()
  const snapshot = useSyncExternalStore(subscribeRetryCountdown, getRetryCountdown, getRetryCountdown)

  useEffect(() => {
    if (!snapshot.active) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [snapshot.active])

  if (!snapshot.active) return null
  const label = snapshot.ready ? t('rateLimit.ready') : retryWaitLabel(snapshot.secondsLeft)
  return (
    <FloatingBar show>
      <span role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {label}
      </span>
    </FloatingBar>
  )
}
