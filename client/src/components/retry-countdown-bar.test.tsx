// @vitest-environment jsdom
//
// The FloatingBar countdown chip is the persistent half of the rate-limit UX:
// it must track the countdown snapshot (seconds → ready), stay on screen until
// the window is resolved, and arm beforeunload while active so a stray
// navigation mid-window asks first.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { I18nProvider } from '@/i18n'
import { apiFetch, getRetryCountdown } from '@/lib/api'
import { dismissToast, getToasts } from '@/lib/toast'
import { RetryCountdownBar } from './retry-countdown-bar'

let root: Root
let container: HTMLDivElement

function rateLimitResponse(retryAfter: string): Response {
  return {
    ok: false,
    status: 429,
    statusText: 'Too Many Requests',
    headers: new Headers({ 'Retry-After': retryAfter }),
    json: async () => ({ error: { message: 'Too many requests', type: 'rate_limit_error' } }),
    text: async () => '',
  } as unknown as Response
}

// Microtask-only flush: setTimeout never fires under vi.useFakeTimers().
async function flush() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

function renderBar() {
  act(() => {
    root.render(
      <I18nProvider initialLocale="en">
        <RetryCountdownBar />
      </I18nProvider>,
    )
  })
}

async function triggerCountdown(seconds: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rateLimitResponse(seconds)))
  try {
    await apiFetch('/api/keys')
    expect.unreachable('the 429 must throw')
  } catch {
    /* expected */
  }
}

beforeAll(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  vi.useFakeTimers()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  sessionStorage.clear()
})

afterEach(async () => {
  // Resolve any live countdown so the snapshot returns to idle between tests.
  for (const t of getToasts()) dismissToast(t.id)
  await vi.advanceTimersByTimeAsync(1_000)
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('RetryCountdownBar', () => {
  it('renders nothing while no countdown is active', async () => {
    renderBar()
    await flush()
    expect(container.textContent).toBe('')
    expect(getRetryCountdown().active).toBe(false)
  })

  it('tracks the countdown and warns on unload until the window resolves', async () => {
    renderBar()
    await triggerCountdown('3')
    await flush()

    expect(container.textContent).toBe('Rate limited — retry in 3s')
    expect(getRetryCountdown()).toMatchObject({ active: true, secondsLeft: 3, ready: false })

    // while active: an unload attempt is cancelable (the browser asks first)
    const during = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(during)
    expect(during.defaultPrevented).toBe(true)

    await vi.advanceTimersByTimeAsync(1_000)
    await flush()
    expect(container.textContent).toBe('Rate limited — retry in 2s')
    expect(getRetryCountdown().secondsLeft).toBe(2)

    await vi.advanceTimersByTimeAsync(2_000)
    await flush()
    expect(container.textContent).toBe('Rate limited — retry now')
    expect(getRetryCountdown()).toMatchObject({ active: true, ready: true })
  })

  it('drops the chip and the unload guard once the countdown is dismissed', async () => {
    renderBar()
    await triggerCountdown('30')
    await flush()
    expect(container.textContent).toContain('retry in 30s')

    await act(async () => {
      for (const t of getToasts()) dismissToast(t.id)
    })
    await vi.advanceTimersByTimeAsync(1_000)
    await flush()

    expect(container.textContent).toBe('')
    expect(getRetryCountdown().active).toBe(false)
    const after = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)
  })
})
