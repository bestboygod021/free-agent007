// @vitest-environment jsdom
//
// The timeline → Keys hand-off: /keys?rlHour=<epoch>&rlSpan=<ms> pins the
// event list to exactly that bucket, shows a removable filter chip, and
// clearing the chip restores the full list.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nProvider } from '@/i18n'
import { RateLimitEvents } from './rate-limit-events'

let root: Root
let container: HTMLDivElement

// One event inside the pinned hour, one an hour earlier.
const HOUR = Date.parse('2026-10-08T14:00:00Z')
const IN_HOUR = {
  ts: HOUR + 5 * 60_000,
  scope: 'admin' as const,
  method: 'GET',
  path: '/api/ping',
  ip: '203.0.113.9',
  subject: null,
  limit: 5,
  retryAfter: 30,
}
const BEFORE = { ...IN_HOUR, ts: HOUR - 60 * 60_000, path: '/api/other' }

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

function renderCard(entry = '/keys') {
  act(() => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <QueryClientProvider client={client}>
          <I18nProvider initialLocale="en">
            <RateLimitEvents />
          </I18nProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    )
  })
}

beforeAll(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await flush()
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

function eventRows(): string[] {
  return [...container.querySelectorAll('button[aria-expanded]')].map(b => b.textContent ?? '')
}

describe('RateLimitEvents hour hand-off', () => {
  it('pins the list to the bucket, shows the chip, and clears it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ events: [IN_HOUR, BEFORE], keyUsage: [], spike: null })),
    )
    renderCard(`/keys?rlHour=${HOUR}&rlSpan=3600000`)
    await flush()

    expect(eventRows().some(text => text.includes('/api/ping'))).toBe(true)
    expect(eventRows().some(text => text.includes('/api/other'))).toBe(false)

    const chip = [...container.querySelectorAll('button')].find(b =>
      b.textContent?.includes('Hour:'),
    )
    expect(chip).toBeDefined()

    // Dismiss → unfiltered list comes back.
    await act(async () => chip!.click())
    await flush()
    expect(eventRows().some(text => text.includes('/api/other'))).toBe(true)
    const chipGone = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('Hour:'))
    expect(chipGone).toBeUndefined()
  })

  it('shows the full list when no bucket is pinned', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ events: [IN_HOUR, BEFORE], keyUsage: [], spike: null })),
    )
    renderCard('/keys')
    await flush()
    expect(eventRows()).toHaveLength(2)
    const chip = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('Hour:'))
    expect(chip).toBeUndefined()
  })
})
