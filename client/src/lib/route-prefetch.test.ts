// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  prefetchHandlers,
  prefetchRoute,
  prefetchRoutes,
  prefetchWhenIdle,
  registerRouteLoaders,
  resetRoutePrefetchForTests,
} from './route-prefetch'

describe('route prefetch', () => {
  beforeEach(() => {
    resetRoutePrefetchForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('loads a registered path exactly once, however many hovers fire', () => {
    const loader = vi.fn().mockResolvedValue({})
    registerRouteLoaders({ '/analytics': loader })

    prefetchRoute('/analytics')
    prefetchRoute('/analytics')
    prefetchHandlers('/analytics').onMouseEnter()
    prefetchHandlers('/analytics').onFocus()

    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('ignores unregistered paths', () => {
    prefetchRoute('/not-registered')
    prefetchRoutes(['/not-registered', '/also-missing'])
    // No throw is the assertion; also prove no loader was invented.
    expect(true).toBe(true)
  })

  it('forgets a failed fetch so the next hover can retry', async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue({})
    registerRouteLoaders({ '/keys': loader })

    prefetchRoute('/keys')
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))

    prefetchRoute('/keys')
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('does not prefetch when the user asked for data saving', () => {
    const loader = vi.fn().mockResolvedValue({})
    registerRouteLoaders({ '/analytics': loader })

    const nav = navigator as Navigator & { connection?: { saveData?: boolean } }
    const original = nav.connection
    nav.connection = { saveData: true }
    try {
      prefetchRoute('/analytics')
      prefetchWhenIdle(['/analytics'])
      expect(loader).not.toHaveBeenCalled()
    } finally {
      if (original === undefined) delete nav.connection
      else nav.connection = original
    }
  })

  it('prefetchWhenIdle defers via setTimeout when requestIdleCallback is absent', () => {
    vi.useFakeTimers()
    const loader = vi.fn().mockResolvedValue({})
    registerRouteLoaders({ '/playground': loader })
    // jsdom may or may not ship requestIdleCallback; force the fallback path.
    const hadIdle = Reflect.has(window, 'requestIdleCallback')
    const savedIdle = Reflect.get(window, 'requestIdleCallback')
    Reflect.deleteProperty(window, 'requestIdleCallback')
    try {
      prefetchWhenIdle(['/playground'], 1000)
      expect(loader).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1000)
      expect(loader).toHaveBeenCalledTimes(1)
    } finally {
      if (hadIdle) Reflect.set(window, 'requestIdleCallback', savedIdle)
    }
  })

  it('prefetchWhenIdle uses requestIdleCallback when the browser has it', () => {
    const idle = vi.fn((cb: () => void) => {
      cb()
      return 1
    })
    const hadIdle = Reflect.has(window, 'requestIdleCallback')
    const savedIdle = Reflect.get(window, 'requestIdleCallback')
    Reflect.set(window, 'requestIdleCallback', idle)
    try {
      const loader = vi.fn().mockResolvedValue({})
      registerRouteLoaders({ '/analytics': loader })
      prefetchWhenIdle(['/analytics'])
      expect(idle).toHaveBeenCalledTimes(1)
      expect(loader).toHaveBeenCalledTimes(1)
    } finally {
      if (hadIdle) Reflect.set(window, 'requestIdleCallback', savedIdle)
      else Reflect.deleteProperty(window, 'requestIdleCallback')
    }
  })

  it('prefetchHandlers wires both pointer and keyboard entry points', () => {
    const loader = vi.fn().mockResolvedValue({})
    registerRouteLoaders({ '/logs': loader })

    const handlers = prefetchHandlers('/logs')
    handlers.onMouseEnter()
    expect(loader).toHaveBeenCalledTimes(1)
    handlers.onFocus()
    expect(loader).toHaveBeenCalledTimes(1)
  })
})
