import { useState } from 'react'
import { ArrowDown, Check, CircleHelp, Lightbulb, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/i18n'
import { TAB_TUTORIALS, type TutorialId } from '@/lib/tab-tutorials'

const LABELS = {
  fa: {
    button: 'آموزش کار با این تب',
    title: 'راهنمای مرحله‌به‌مرحله',
    flow: 'مسیر انجام کار',
    result: 'نتیجهٔ نهایی',
    tip: 'نکتهٔ کاربردی',
    close: 'بستن راهنما',
    step: 'گام',
  },
  en: {
    button: 'How to use this tab',
    title: 'Step-by-step guide',
    flow: 'Your workflow',
    result: 'What you will get',
    tip: 'Helpful tip',
    close: 'Close guide',
    step: 'Step',
  },
} as const

export function TabTutorialButton({
  tutorialId,
  compact = false,
  className,
}: {
  tutorialId: TutorialId
  /** Use an icon-only control when this button sits in the collapsed Playground rail. */
  compact?: boolean
  className?: string
}) {
  const { locale } = useI18n()
  const [open, setOpen] = useState(false)
  const isPersian = locale === 'fa'
  const language = isPersian ? 'fa' : 'en'
  const direction = isPersian ? 'rtl' : 'ltr'
  const strings = LABELS[language]
  const tutorial = TAB_TUTORIALS[tutorialId]
  const formatNumber = new Intl.NumberFormat(isPersian ? 'fa-IR' : 'en-US')

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={compact ? 'icon-sm' : 'sm'}
        className={className}
        aria-label={strings.button}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={strings.button}
        onClick={() => setOpen(true)}
      >
        <CircleHelp aria-hidden="true" />
        {compact ? <span className="sr-only">{strings.button}</span> : strings.button}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup maxWidth="max-w-2xl" className="p-0" dir={direction} lang={language}>
          <div className="border-b bg-gradient-to-br from-primary/[0.07] via-card to-card px-5 py-4 sm:px-7 sm:py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl border bg-background text-primary shadow-sm">
                  <CircleHelp className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{tutorial.page[language]}</p>
                  <DialogTitle className="mt-0.5 text-lg font-semibold tracking-tight">
                    {strings.title}
                  </DialogTitle>
                  <DialogDescription className="mt-1 max-w-prose leading-relaxed">
                    {tutorial.intro[language]}
                  </DialogDescription>
                </div>
              </div>
              <DialogClose
                aria-label={strings.close}
                className="-me-1 rounded-lg p-1.5 text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <X className="size-4" aria-hidden="true" />
              </DialogClose>
            </div>
          </div>

          <div className="px-5 py-5 sm:px-7">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">{strings.flow}</h3>
              <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                {formatNumber.format(tutorial.steps.length)} {strings.step}
              </span>
            </div>

            <ol aria-label={strings.flow}>
              {tutorial.steps.map((item, index) => {
                const last = index === tutorial.steps.length - 1
                return (
                  <li
                    key={`${tutorialId}-${index}`}
                    className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3"
                  >
                    <div className="flex flex-col items-center">
                      <span className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-semibold tabular-nums text-primary shadow-sm">
                        <span aria-hidden="true">{formatNumber.format(index + 1)}</span>
                      </span>
                      {!last && (
                        <span
                          aria-hidden="true"
                          className="my-1 min-h-5 w-px flex-1 bg-gradient-to-b from-primary/40 to-border"
                        />
                      )}
                    </div>

                    <article className={`mb-3 rounded-2xl border bg-card p-3.5 sm:p-4 ${last ? 'mb-0' : ''}`}>
                      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold leading-snug">
                          {item.title[language]}
                        </h4>
                        <span className="rounded-full bg-muted/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {item.where[language]}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {item.action[language]}
                      </p>
                      <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-foreground/85">
                        {last ? (
                          <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                        ) : (
                          <ArrowDown className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                        )}
                        <span>{item.expect[language]}</span>
                      </p>
                    </article>
                  </li>
                )
              })}
            </ol>

            <section className="mt-4 rounded-2xl border border-primary/20 bg-primary/[0.035] p-3.5 sm:p-4">
              <div className="flex items-start gap-2.5">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h3 className="text-xs font-semibold">{strings.result}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {tutorial.outcome[language]}
                  </p>
                </div>
              </div>
            </section>

            <aside className="mt-3 flex items-start gap-2.5 rounded-xl bg-muted/55 px-3.5 py-3">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <div>
                <h3 className="text-xs font-semibold">{strings.tip}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {tutorial.tip[language]}
                </p>
              </div>
            </aside>
          </div>
        </DialogPopup>
      </Dialog>
    </>
  )
}
