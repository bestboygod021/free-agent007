import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, hasRetryCountdown, parseRetryAfter, type ApiError } from './api'
import { dismissToast, getToasts } from './toast'

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
    expect(first?.duration).toBe(3000) // Toaster dismisses exactly when retry opens

    await vi.advanceTimersByTimeAsync(1000)
    expect(getToasts().find(t => t.id === first!.id)?.message).toBe('Rate limited — retry in 2s')

    await vi.advanceTimersByTimeAsync(2000)
    expect(getToasts().find(t => t.id === first!.id)?.message).toBe('Rate limited — retry now')

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
})
