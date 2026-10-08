// @vitest-environment jsdom
//
// The Keys-page spike callout: a fresh 5-minute rejection burst renders the
// alert banner, a stale one (older than the server's ten-minute gate) stays
// out of the way. Mounts the real component against a stubbed API.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n'
import { RateLimitSpikeBanner } from './rate-limit-events'

let root: Root
let container: HTMLDivElement

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

function renderBanner() {
  act(() => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    root.render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <I18nProvider initialLocale="en">
            <RateLimitSpikeBanner />
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

describe('RateLimitSpikeBanner', () => {
  it('announces a fresh spike', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ events: [], keyUsage: [], spike: { at: Date.now(), count: 17 } })),
    )
    renderBanner()
    await flush()
    expect(container.textContent).toContain('17 requests rate-limited in the last 5 minutes')
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
  })

  it('stays hidden without a spike, or once it goes stale', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ events: [], keyUsage: [], spike: null })))
    renderBanner()
    await flush()
    expect(container.textContent).toBe('')

    act(() => root.unmount())
    act(() => {
      root = createRoot(container)
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ events: [], keyUsage: [], spike: { at: Date.now() - 11 * 60_000, count: 4 } })),
    )
    renderBanner()
    await flush()
    expect(container.textContent).toBe('')
  })
})
