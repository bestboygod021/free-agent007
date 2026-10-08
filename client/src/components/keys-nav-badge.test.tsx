// @vitest-environment jsdom
//
// The Keys-nav rejection counter: hidden on a quiet dashboard, a count with an
// accessible label once recent 429s exist.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nProvider } from '@/i18n'
import { KeysNavBadge } from './keys-nav-badge'

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

function renderBadge() {
  act(() => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    root.render(
      <QueryClientProvider client={client}>
        <I18nProvider initialLocale="en">
          <KeysNavBadge />
        </I18nProvider>
      </QueryClientProvider>,
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

describe('KeysNavBadge', () => {
  it('stays hidden while no rejections are on record', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ events: [], keyUsage: [], spike: null })))
    renderBadge()
    await flush()
    expect(container.textContent).toBe('')
    expect(container.querySelector('span')).toBeNull()
  })

  it('shows the rejection count with an accessible label', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ events: [{}, {}, {}], keyUsage: [], spike: null })),
    )
    renderBadge()
    await flush()
    const badge = container.querySelector('span')
    expect(badge?.textContent).toBe('3')
    expect(badge?.getAttribute('aria-label')).toBe('Recently rate-limited requests')
  })
})
