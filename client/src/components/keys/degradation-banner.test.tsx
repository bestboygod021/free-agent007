// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { I18nProvider } from '@/i18n'
import { DegradationBanner } from './shared'
import type { DegradationStatus } from '../../../../shared/types'

let root: Root
let container: HTMLDivElement

beforeAll(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function mount(status?: DegradationStatus) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root.render(
      <I18nProvider initialLocale="en">
        <DegradationBanner status={status} />
      </I18nProvider>,
    )
  })
}

const degraded: DegradationStatus = {
  healthyProviders: 2,
  totalProviders: 5,
  ratio: 0.4,
  state: 'degraded',
  degradedAt: Date.UTC(2026, 9, 7, 8, 0, 0),
}

it('renders nothing before health data loads', () => {
  mount(undefined)
  expect(container.textContent).toBe('')
  expect(container.querySelector('[role="alert"]')).toBeNull()
})

it('stays quiet while the machine is normal', () => {
  mount({ ...degraded, state: 'normal', degradedAt: null })
  expect(container.textContent).toBe('')
})

it('announces degraded state with counts and the entry time', () => {
  mount(degraded)
  const alert = container.querySelector('[role="alert"]')
  expect(alert).not.toBeNull()
  const text = alert!.textContent ?? ''
  expect(text).toContain('Routing degraded')
  expect(text).toContain('2 of 5')
  // The stamped entry time is rendered locale-formatted, not as a raw epoch.
  expect(text).not.toContain(String(degraded.degradedAt))
  expect(text).toMatch(/Oct|2026/)
})
