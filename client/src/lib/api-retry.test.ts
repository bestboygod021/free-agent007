import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, hasRetryCountdown, parseRetryAfter, type ApiError } from './api'
import { dismissToast, getToasts } from './toast'
import { resetRuntimeLocaleForTests, syncRuntimeLocale } from '../i18n/translate'

function rateLimitResponse(retryAfter?: string): Response {
  return {
    ok: false,
    status: 429,
    statusText: 'Too Many Requests',
    headers: new Headers(retryAfter === undefined ? {} : { 'Retry-After': retryAfter }),
    json: async () => ({
      error: {
        message: 'Rate limit exceeded: more than 600 requests per minute. Retry in 30s.',
        type: 'rate_limit_error',
      },
    }),
    text: async () => '',
  } as unknown as Response
}

describe('parseRetryAfter', () => {
  it('reads delta-seconds (with surrounding whitespace)', () => {
    expect(parseRetryAfter('30')).toBe(30)
    expect(parseRetryAfter(' 1 ')).toBe(1)
    expect(parseRetryAfter('0')).toBe(1) // never promise an instant retry
  })

  it('reads an HTTP-date relative to now', () => {
    const now = Date.parse('2026-01-01T00:00:00Z')
    expect(parseRetryAfter('Thu, 01 Jan 2026 00:00:30 GMT', now)).toBe(30)
    expect(parseRetryAfter('Thu, 01 Jan 2026 00:00:00.200Z', now)).toBe(1) // sub-second rounds up
  })

  it('returns null for absent or unparseable values', () => {
    expect(parseRetryAfter(null)).toBeNull()
    expect(parseRetryAfter('')).toBeNull()
    expect(parseRetryAfter('soon')).toBeNull()
  })
})

describe('429 handling in apiFetch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    getToasts().forEach(t => dismissToast(t.id))
  })
  afterEach(() => {
    getToasts().forEach(t => dismissToast(t.id))
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('stamps retryAfterSec and runs one ticking countdown toast', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rateLimitResponse('3')))

    let caught: ApiError | undefined
    try {
      await apiFetch('/api/keys')
    } catch (e) {
      caught = e as ApiError
    }
    expect(caught?.status).toBe(429)
    expect(caught?.retryAfterSec).toBe(3)
    expect(hasRetryCountdown(caught)).toBe(true)

    const first = getToasts().find(t => t.message.startsWith('Rate limited'))
    expect(first?.kind).toBe('info')
    expect(first?.message).toBe('Rate limited — retry in 3s')
    expect(first?.duration).toBe(13000) // wait + 10s grace so the armed button is clickable
    expect(first?.action?.label).toBe('Retry now')
    expect(first?.action?.disabled).toBe(true) // armed only once the window opens

    await vi.advanceTimersByTimeAsync(1000)
    expect(getToasts().find(t => t.id === first!.id)?.message).toBe('Rate limited — retry in 2s')

    await vi.advanceTimersByTimeAsync(2000)
    const finished = getToasts().find(t => t.id === first!.id)
    expect(finished?.message).toBe('Rate limited — retry now')
    expect(finished?.action?.disabled).toBe(false) // the window is open: button live

    // The interval stopped itself; the text stays put afterwards.
    await vi.advanceTimersByTimeAsync(5000)
    expect(getToasts().find(t => t.id === first!.id)?.message).toBe('Rate limited — retry now')
  })

  it('a second 429 while the countdown ticks does not stack another toast', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rateLimitResponse('60')))
    try { await apiFetch('/api/keys') } catch { /* expected */ }
    try { await apiFetch('/api/keys') } catch { /* expected */ }
    expect(getToasts().filter(t => t.message.startsWith('Rate limited')).length).toBe(1)
  })

  it('a 429 without Retry-After is a plain error: no countdown, no toast', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rateLimitResponse()))
    let caught: ApiError | undefined
    try {
      await apiFetch('/api/auth/login')
    } catch (e) {
      caught = e as ApiError
    }
    expect(caught?.status).toBe(429)
    expect(caught?.retryAfterSec).toBeUndefined()
    expect(hasRetryCountdown(caught)).toBe(false)
    expect(getToasts().filter(t => t.message.startsWith('Rate limited')).length).toBe(0)
  })

  it('formatting: waits of a minute or more read as Xm Ys', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rateLimitResponse('90')))
    try { await apiFetch('/api/keys') } catch { /* expected */ }
    const first = getToasts().find(t => t.message.startsWith('Rate limited'))
    expect(first?.message).toBe('Rate limited — retry in 1m 30s')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(getToasts().find(t => t.id === first!.id)?.message).toBe('Rate limited — retry in 1m')
  })

  it('the armed button re-runs the request and reports success', async () => {
    const okResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ ok: true }),
      text: async () => JSON.stringify({ ok: true }), // parseTextBody reads .text(), not .json()
    } as unknown as Response
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(rateLimitResponse('2')).mockResolvedValueOnce(okResponse))

    try { await apiFetch('/api/settings/update-check') } catch { /* expected */ }
    const first = getToasts().find(t => t.message.startsWith('Rate limited'))
    expect(first?.action?.disabled).toBe(true)

    await vi.advanceTimersByTimeAsync(2000)
    const armed = getToasts().find(t => t.id === first!.id)
    expect(armed?.action?.disabled).toBe(false)

    dismissToast(first!.id) // the Toaster button dismisses the countdown first
    armed!.action!.onClick()
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
    expect(getToasts().some(t => t.message === 'Retried — request succeeded')).toBe(true)
    expect(getToasts().some(t => t.message.startsWith('Rate limited'))).toBe(false)
  })

  it('a retry that 429s again starts a fresh countdown instead of erroring twice', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rateLimitResponse('5')))
    try { await apiFetch('/api/keys') } catch { /* expected */ }
    const first = getToasts().find(t => t.message.startsWith('Rate limited'))
    await vi.advanceTimersByTimeAsync(5000)
    const armed = getToasts().find(t => t.id === first!.id)
    dismissToast(first!.id) // Toaster-button behaviour: dismiss, then run
    armed!.action!.onClick()
    await vi.advanceTimersByTimeAsync(0)

    const rateLimited = getToasts().filter(t => t.message.startsWith('Rate limited'))
    expect(rateLimited.length).toBe(1)
    expect(rateLimited[0].id).not.toBe(first!.id) // a NEW countdown, not the old toast
    expect(getToasts().some(t => t.message === 'Retried — request succeeded')).toBe(false)
  })

  it('renders the countdown in the active locale (Persian digits in fa)', async () => {
    syncRuntimeLocale('fa', {
      rateLimit: {
        countdownSec: 'محدودیت نرخ — {n} ثانیه دیگر تلاش مجدد',
        ready: 'محدودیت نرخ — هم‌اکنون تلاش کنید',
        retryNow: 'هم‌اکنون تلاش کنید',
      },
    })
    try {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rateLimitResponse('3')))
      try { await apiFetch('/api/keys') } catch { /* expected */ }
      const first = getToasts().find(t => t.message.includes('محدودیت نرخ'))
      expect(first?.message).toBe('محدودیت نرخ — ۳ ثانیه دیگر تلاش مجدد')
      expect(first?.action?.label).toBe('هم‌اکنون تلاش کنید')
      await vi.advanceTimersByTimeAsync(3000)
      expect(getToasts().find(t => t.id === first!.id)?.message).toBe('محدودیت نرخ — هم‌اکنون تلاش کنید')
    } finally {
      resetRuntimeLocaleForTests()
    }
  })
})
