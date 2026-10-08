// @vitest-environment jsdom
//
// The Keys-page rate-limit card grew an interactive layer: scope filters, an
// expandable detail row with the caller-history pivot, the hourly trend, and
// the live per-key counters. This mounts the real component against a stubbed
// API and exercises each of those paths.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nProvider } from '@/i18n'
import { RateLimitEvents } from './rate-limit-events'

let root: Root
let container: HTMLDivElement

const EVENT = {
  ts: Date.parse('2026-10-08T10:30:00Z'),
  scope: 'admin' as const,
  method: 'GET',
  path: '/api/ping',
  ip: '203.0.113.9',
  subject: null,
  limit: 5,
  retryAfter: 51,
}
const KEY_EVENT = {
  ...EVENT,
  ts: Date.parse('2026-10-08T10:31:00Z'),
  scope: 'key' as const,
  path: '/v1/chat/completions',
  subject: 'key:ab12cd34',
  label: 'prod groq',
  limit: 180,
}
const KEY_USAGE = [{ subject: 'key:ab12cd34', label: 'prod groq', count: 118, limit: 180, resetAt: Date.now() + 30_000 }]
const hour = new Date().toISOString().slice(0, 13)
const STATS = {
  windowHours: 24,
  buckets: [{ hour, count: 3 }],
  byPath: [{ path: '/api/ping', scope: 'admin', count: 3 }],
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

async function flush() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })
  }
}

beforeAll(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('rate-limits/stats')) return jsonResponse(STATS)
      return jsonResponse({ events: [KEY_EVENT, EVENT], keyUsage: KEY_USAGE })
    }),
  )
  act(() => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    root.render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <I18nProvider initialLocale="en">
            <RateLimitEvents />
          </I18nProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    )
  })
})

afterEach(async () => {
  await flush()
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

function buttonWithText(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(b => b.textContent === text)
}

describe('RateLimitEvents card', () => {
  it('lists events, renders the trend strip and the per-key usage bars', async () => {
    await flush()
    expect(container.textContent).toContain('Recently rate-limited requests')
    expect(container.textContent).toContain('/api/ping')
    // The read-time label join shows the operator's name wherever the bare
    // fingerprint used to appear; the fingerprint survives as a hover title.
    expect(container.textContent).toContain('prod groq')
    expect(container.querySelector('[title="key:ab12cd34"]')).not.toBeNull()
    // Hourly trend: 24 slots, at least one filled for the stubbed hour.
    const bars = [...container.querySelectorAll('[role="img"] > div')]
    expect(bars).toHaveLength(24)
    expect(bars.some(b => b.getAttribute('title')?.includes('— 3'))).toBe(true)
    // Per-key usage: 118/180 with a progressbar.
    expect(container.textContent).toContain('118/180')
    const progress = container.querySelector('[role="progressbar"]')
    expect(progress).not.toBeNull()
    expect(progress!.getAttribute('aria-valuenow')).toBe('118')
  })

  it('filters by scope with the pill group', async () => {
    await flush()
    const keyPill = buttonWithText('Per-key /v1')
    expect(keyPill).toBeDefined()
    const eventRows = () =>
      [...container.querySelectorAll('button[aria-expanded]')].map(b => b.textContent ?? '')

    await act(async () => keyPill!.click())
    // The event list filters (byPath under the trend is unfiltered by design).
    expect(eventRows().some(text => text.includes('/v1/chat/completions'))).toBe(true)
    expect(eventRows().some(text => text.includes('/api/ping'))).toBe(false)

    const allPill = buttonWithText('All')
    await act(async () => allPill!.click())
    expect(eventRows().some(text => text.includes('/api/ping'))).toBe(true)
    expect(eventRows().some(text => text.includes('/v1/chat/completions'))).toBe(true)
  })

  it('expands a row into details with the caller-history pivot link', async () => {
    await flush()
    const row = [...container.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')].find(b =>
      b.textContent?.includes('/api/ping'),
    )
    expect(row).toBeDefined()
    expect(row!.getAttribute('aria-expanded')).toBe('false')

    await act(async () => row!.click())
    expect(row!.getAttribute('aria-expanded')).toBe('true')
    expect(container.textContent).toContain('IP 203.0.113.9')
    expect(container.textContent).toContain('cap 5/min')
    expect(container.textContent).toContain('retry after 51s')

    const link = [...container.querySelectorAll('a')].find(a => a.textContent?.includes('Caller history'))
    expect(link).toBeDefined()
    expect(link!.getAttribute('href')).toBe('/analytics?clientIp=203.0.113.9')

    // Collapsing closes the detail block again.
    await act(async () => row!.click())
    expect(row!.getAttribute('aria-expanded')).toBe('false')
    expect(container.textContent).not.toContain('cap 5/min')
  })
})
