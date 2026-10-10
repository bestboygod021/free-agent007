import type { ReactNode } from 'react'
import { TabTutorialButton } from '@/components/tab-tutorial'
import { tutorialIdForPath, type TutorialId } from '@/lib/tab-tutorials'

export function PageHeader({
  title,
  description,
  actions,
  tutorialId,
  divider = true,
}: {
  title: string
  description?: string
  actions?: ReactNode
  tutorialId?: TutorialId
  divider?: boolean
}) {
  const resolvedTutorialId = tutorialId ?? (
    typeof window === 'undefined' ? null : tutorialIdForPath(window.location.pathname)
  )

  return (
    <div className={`flex flex-wrap lg:flex-nowrap items-end justify-between gap-6 mb-6 ${divider ? 'pb-6 border-b' : ''}`}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {(actions || resolvedTutorialId) && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {actions}
          {resolvedTutorialId && <TabTutorialButton tutorialId={resolvedTutorialId} />}
        </div>
      )}
    </div>
  )
}
