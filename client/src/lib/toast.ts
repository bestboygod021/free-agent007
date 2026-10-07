// Zero-dependency toast store, same spirit as the i18n provider: a module-level
// list plus subscribers, rendered by <Toaster /> (components/toaster.tsx).
// Pages fire `toast.error(...)` / `toast.success(...)`; the App-level
// MutationCache uses toast.error as the global surface for failed mutations so
// no action can fail silently again.

export type ToastKind = 'success' | 'error' | 'info'

export type ToastAction = {
  label: string
  onClick: () => void
  /** Rendered disabled until the countdown lets it through (the 429 button). */
  disabled?: boolean
}

export type ToastItem = {
  id: number
  kind: ToastKind
  message: string
  /** Auto-dismiss delay in ms; `null` means sticky until manually dismissed. */
  duration: number | null
  /** Optional inline button (e.g. "Retry now" on the rate-limit countdown). */
  action?: ToastAction
}

/** Per-call options accepted by `toast.*`: an explicit duration and/or an
 *  inline action button. Always passed as one bag so the surface can grow
 *  without another positional parameter. */
export type ToastOptions = {
  /** Auto-dismiss delay in ms; `null` = sticky. Omit to keep the kind's default. */
  duration?: number | null
  /** Inline button (e.g. "Retry now" on the rate-limit countdown). */
  action?: ToastAction
}

/** Most toasts kept on screen at once; older ones are evicted (see push). */
const MAX_VISIBLE_TOASTS = 4

// Per-severity auto-dismiss defaults (#586). Success/info give the user a
// comfortable read; errors are sticky — they carry information the user may
// need to act on (and copy), every toast has a dismiss button, identical
// messages are deduped in push, and the cap below still bounds the stack, so
// stickiness cannot pile up unbounded. An explicit per-call duration wins.
const DEFAULT_DURATIONS: Record<ToastKind, number | null> = {
  success: 5000,
  info: 5000,
  error: null,
}

type Listener = (toasts: ToastItem[]) => void

let items: ToastItem[] = []
let nextId = 1
const listeners = new Set<Listener>()

function emit() {
  for (const listener of listeners) listener(items)
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getToasts(): ToastItem[] {
  return items
}

export function dismissToast(id: number) {
  if (!items.some(t => t.id === id)) return
  items = items.filter(t => t.id !== id)
  emit()
}

/** Rewrite a toast's text in place (same id, timer untouched) — used by the
 *  429 countdown so seconds tick without stacking a new toast every second.
 *  Pass `action` to replace the inline button (the countdown flips it from
 *  disabled to clickable at zero); omit it and the current action stays. */
export function updateToast(id: number, message: string, options?: Pick<ToastOptions, 'action'>): void {
  if (!items.some(t => t.id === id)) return
  items = items.map(t => (t.id === id ? { ...t, message, ...(options?.action ? { action: options.action } : {}) } : t))
  emit()
}

function push(kind: ToastKind, message: string, options?: ToastOptions): number {
  const id = nextId++
  // An explicit duration wins (null = sticky); otherwise the kind's default.
  const duration = options?.duration !== undefined ? options.duration : DEFAULT_DURATIONS[kind]
  // Replace an identical pending toast instead of stacking duplicates (a
  // failing poll would otherwise pile up the same error every interval).
  const next = [
    ...items.filter(t => !(t.kind === kind && t.message === message)),
    { id, kind, message, duration, ...(options?.action ? { action: options.action } : {}) },
  ]
  // Enforce the cap without silently evicting an unread error: drop the
  // oldest non-error first, and only evict an error once the stack is all
  // errors (the cap itself always holds).
  while (next.length > MAX_VISIBLE_TOASTS) {
    const victim = next.findIndex(t => t.kind !== 'error')
    next.splice(victim === -1 ? 0 : victim, 1)
  }
  items = next
  emit()
  return id
}

export const toast = {
  success: (message: string, options?: ToastOptions) => push('success', message, options),
  error: (message: string, options?: ToastOptions) => push('error', message, options),
  info: (message: string, options?: ToastOptions) => push('info', message, options),
}
