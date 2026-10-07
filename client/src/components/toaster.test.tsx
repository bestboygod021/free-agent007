// @vitest-environment jsdom
//
// The 429 countdown toast's action button is the dashboard's only interactive
// rate-limit control, but until now it was exercised only through its
// `onClick` callback in api-retry.test.ts. This mounts the real <Toaster />
// and checks the DOM contract: disabled while ticking, dismiss-then-invoke
// when armed, and the dismiss X still works alongside it.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { I18nProvider } from '@/i18n'
import { dismissToast, getToasts, toast, updateToast } from '@/lib/toast'
import { Toaster } from './toaster'

let root: Root
let container: HTMLDivElement

beforeAll(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root.render(
      <I18nProvider initialLocale="en">
        <Toaster />
      </I18nProvider>,
    )
  })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  for (const t of getToasts()) dismissToast(t.id)
})

function findButton(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(b => b.textContent === label)
}

describe('Toaster action button', () => {
  it('renders disabled while the countdown ticks and ignores clicks', async () => {
    const onClick = vi.fn()
    act(() => {
      toast.info('Rate limited — retry in 3s', {
        duration: null,
        action: { label: 'Retry now', onClick, disabled: true },
      })
    })
    const button = findButton('Retry now')
    expect(button).toBeDefined()
    expect(button!.disabled).toBe(true)

    await act(async () => {
      button!.click()
    })
    expect(onClick).not.toHaveBeenCalled()
    expect(getToasts()).toHaveLength(1) // nothing dismissed, nothing ran
  })

  it('dismisses the toast first, then runs the armed action', async () => {
    const onClick = vi.fn()
    let id = 0
    act(() => {
      id = toast.info('Rate limited — retry in 1s', {
        duration: null,
        action: { label: 'Retry now', onClick, disabled: true },
      })
    })
    // The countdown reaching zero flips the button live in place.
    act(() => {
      updateToast(id, 'Rate limited — retry now', { action: { label: 'Retry now', onClick, disabled: false } })
    })
    const button = findButton('Retry now')
    expect(button!.disabled).toBe(false)

    await act(async () => {
      button!.click()
    })
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(getToasts()).toHaveLength(0)
    expect(container.textContent).not.toContain('Rate limited')
  })

  it('keeps the dismiss X working next to an action button', async () => {
    act(() => {
      toast.info('with action', { duration: null, action: { label: 'Retry now', onClick: vi.fn() } })
    })
    const dismiss = container.querySelector<HTMLButtonElement>('button[aria-label]')
    expect(dismiss).not.toBeNull()
    await act(async () => {
      dismiss!.click()
    })
    expect(getToasts()).toHaveLength(0)
    expect(container.textContent).toBe('')
  })
})
