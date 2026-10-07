// @vitest-environment jsdom
//
// A reload mid-countdown must not lose the rate-limit window: the 429 handler
// writes the deadline (+ a replay-safe request descriptor) to sessionStorage
// and `restorePendingRetry()` re-arms the same toast with whatever time is
// left. "Reload" is simulated with vi.resetModules() + a fresh import, which
// gives a pristine module registry exactly like a page refresh.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const KEY = 'freellmapi.pendingRetry'

function rateLimitResponse(retryAfter?: string): Response {
  return {
    ok: false,
    status: 429,
    statusText: 'Too Many Requests',
    headers: new Headers(retryAfter ? { 'Retry-After': retryAfter } : {}),
    json: async () => ({ error: { message: 'Too many requests', type: 'rate_limit_error' } }),
    text: async () => '',
  } as unknown as Response
}

const okResponse = {
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: new Headers({ 'Content-Type': 'application/json' }),
  json: async () => ({ ok: true }),
  text: async () => JSON.stringify({ ok: true }), // parseTextBody reads .text()
} as unknown as Response

type ApiModule = typeof import('./api')
type ToastModule = typeof import('./toast')

/** Fresh registry = a page reload: api.ts, toast.ts, i18n all re-created. */
async function bootModules(): Promise<{ api: ApiModule; toasts: ToastModule }> {
  vi.resetModules()
  const api = await import('./api')
  const toasts = await import('./toast')
  return { api, toasts }
}

beforeEach(() => {
  vi.useFakeTimers()
  sessionStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('pending rate-limit retry survives a reload', () => {
  it('persists the deadline and descriptor, then restores with the remaining time', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(rateLimitResponse('30')),
    )
    const first = await bootModules()
    try {
      await first.api.apiFetch('/api/keys')
      expect.unreachable('the 429 must throw')
    } catch {
      /* expected */
    }

    const raw = sessionStorage.getItem(KEY)
    expect(raw).not.toBeNull()
    const pending = JSON.parse(raw!) as { retryAt: number; path: string }
    expect(pending.path).toBe('/api/keys')
    // Deadline anchored to the header, not to the toast's lifetime.
    expect(pending.retryAt).toBeGreaterThan(Date.now() + 25_000)
    expect(pending.retryAt).toBeLessThanOrEqual(Date.now() + 30_000)

    // Ten seconds pass, then the operator reloads the dashboard.
    await vi.advanceTimersByTimeAsync(10_000)
    const reloaded = await bootModules()
    expect(reloaded.api.restorePendingRetry()).toBe(true)

    const toast = reloaded.toasts.getToasts().find(t => t.message.startsWith('Rate limited'))
    expect(toast?.message).toBe('Rate limited — retry in 20s') // 30 - 10
    expect(toast?.action?.disabled).toBe(true)
    expect(toast?.action?.label).toBe('Retry now')
  })

  it('arms the restored button at zero and the click re-fires the request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(rateLimitResponse('2')).mockResolvedValueOnce(okResponse),
    )
    const first = await bootModules()
    try {
      await first.api.apiFetch('/api/keys', { method: 'GET' })
    } catch {
      /* expected */
    }

    const reloaded = await bootModules()
    expect(reloaded.api.restorePendingRetry()).toBe(true)
    await vi.advanceTimersByTimeAsync(2_000)

    const armed = reloaded.toasts.getToasts().find(t => t.message.startsWith('Rate limited'))
    expect(armed?.message).toBe('Rate limited — retry now')
    expect(armed?.action?.disabled).toBe(false)

    armed!.action!.onClick()
    await vi.advanceTimersByTimeAsync(50)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
    expect(reloaded.toasts.getToasts().some(t => t.message === 'Retried — request succeeded')).toBe(true)
    expect(sessionStorage.getItem(KEY)).toBeNull() // success forgets the window
  })

  it('clears an expired slot instead of restoring a stale countdown', async () => {
    sessionStorage.setItem(KEY, JSON.stringify({ retryAt: Date.now() - 1_000, path: '/api/keys' }))
    const reloaded = await bootModules()
    expect(reloaded.api.restorePendingRetry()).toBe(false)
    expect(reloaded.toasts.getToasts()).toHaveLength(0)
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })

  it('never writes a slot when the 429 carries no Retry-After', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rateLimitResponse(undefined)))
    const { api } = await bootModules()
    try {
      await api.apiFetch('/api/keys')
      expect.unreachable('the 429 must throw')
    } catch {
      /* expected */
    }
    expect(sessionStorage.getItem(KEY)).toBeNull()
    expect(api.restorePendingRetry()).toBe(false)
  })
})
