// @vitest-environment jsdom
//
// The Settings → Rate limits section: defaults load with Save disabled (a
// no-op save must never burn an admin-bucket slot), an edit re-enables it, a
// double-click stacks exactly one PUT, and env-pinned rows render locked.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { I18nProvider } from '@/i18n'
import { RateLimitSection } from './settings-dialog'

let root: Root
let container: HTMLDivElement

const DEFAULTS = {
  proxyRpm: 120,
  adminRpm: 600,
  keyRpm: 180,
  unifiedRpm: 180,
  sources: { proxy: 'default', admin: 'default', key: 'default', unified: 'default' },
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

function renderSection() {
  act(() => {
    root.render(
      <I18nProvider initialLocale="en">
        <RateLimitSection />
      </I18nProvider>,
    )
  })
}

function saveButton(): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(b => b.textContent === 'Save changes')
}

function setInput(selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(selector)
  expect(input).not.toBeNull()
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input!, value)
    input!.dispatchEvent(new Event('input', { bubbles: true }))
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

describe('RateLimitSection', () => {
  it('loads the caps with Save disabled until something changes', async () => {
    const putBodies: string[] = []
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT' && String(url).includes('/api/settings/rate-limits')) {
        putBodies.push(String(init.body))
      }
      return jsonResponse(DEFAULTS)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderSection()
    await flush()

    const adminInput = container.querySelector<HTMLInputElement>('input[aria-label="Dashboard /api cap (requests/min)"]')
    expect(adminInput?.value).toBe('600')
    expect(saveButton()?.disabled).toBe(true)

    // One edit arms the button…
    setInput('input[aria-label="Dashboard /api cap (requests/min)"]', '99')
    await flush()
    expect(saveButton()?.disabled).toBe(false)

    // …and a double-click still issues exactly ONE PUT (the 800ms guard).
    const button = saveButton()!
    await act(async () => {
      button.click()
      button.click()
    })
    await flush()
    await new Promise(r => setTimeout(r, 0))

    expect(putBodies).toHaveLength(1)
    expect(JSON.parse(putBodies[0])).toMatchObject({ proxyRpm: 120, adminRpm: 99, keyRpm: 180, unifiedRpm: 180 })

    // Save completes → form mirrors the response → disabled again (no-op).
    await flush()
    expect(saveButton()?.disabled).toBe(true)
  })

  it('locks rows whose cap is pinned by an env var', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ ...DEFAULTS, sources: { ...DEFAULTS.sources, unified: 'env' } })),
    )
    renderSection()
    await flush()

    const unified = container.querySelector<HTMLInputElement>('input[aria-label="Unified-key /v1 cap (requests/min)"]')
    expect(unified).not.toBeNull()
    expect(unified!.disabled).toBe(true)
    const admin = container.querySelector<HTMLInputElement>('input[aria-label="Dashboard /api cap (requests/min)"]')
    expect(admin!.disabled).toBe(false)
  })
})
