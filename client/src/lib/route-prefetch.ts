// Route-chunk prefetching for the nav.
//
// The dashboard code-splits one chunk per page (turn-14), so the first click on
// Analytics used to stall on ~400 kB of network. The loaders below are the SAME
// functions React.lazy consumes: the browser/module map caches the dynamic
// import, so warming one on hover costs nothing extra when the route is actually
// opened — React.lazy resolves from the same request.
//
// Design notes:
// - One loader per path, registered once by App at module load.
// - A path is fetched at most once; a FAILED fetch is forgotten so the next
//   hover/click can retry (the click always works: React.lazy owns its own
//   promise and shows the Suspense fallback as before).
// - Data-saver users never get speculative fetches: navigator.connection.saveData
//   suppresses both hover and idle prefetches; navigation itself is untouched.

type RouteLoader = () => Promise<unknown>

const loaders = new Map<string, RouteLoader>()
const warmed = new Set<string>()

function saveDataEnabled(): boolean {
  if (typeof navigator === 'undefined') return false
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  return conn?.saveData === true
}

export function registerRouteLoaders(map: Record<string, RouteLoader>): void {
  for (const [path, loader] of Object.entries(map)) {
    if (!loaders.has(path)) loaders.set(path, loader)
  }
}

/** Warm the chunk behind `path` if it has not been fetched yet. */
export function prefetchRoute(path: string): void {
  const loader = loaders.get(path)
  if (!loader || warmed.has(path) || saveDataEnabled()) return
  warmed.add(path)
  try {
    void loader().catch(() => {
      // Forget the failure so a later hover (or the click itself) can retry.
      warmed.delete(path)
    })
  } catch {
    warmed.delete(path)
  }
}

export function prefetchRoutes(paths: readonly string[]): void {
  for (const path of paths) prefetchRoute(path)
}

/**
 * Spread onto a nav link: starts the fetch on pointer hover AND keyboard focus,
 * so keyboard users get the same first-click latency as mouse users.
 */
export function prefetchHandlers(path: string): {
  onMouseEnter: () => void
  onFocus: () => void
} {
  return {
    onMouseEnter: () => prefetchRoute(path),
    onFocus: () => prefetchRoute(path),
  }
}

/**
 * Prefetch after the browser is done with the first paint. Used for the heavy
 * route chunks (Analytics ~400 kB, Keys/Playground ~110 kB) so their first
 * click never waits on the network. requestIdleCallback when available (with a
 * timeout so a busy main thread cannot starve it), setTimeout otherwise.
 */
export function prefetchWhenIdle(paths: readonly string[], timeoutMs = 4000): void {
  if (saveDataEnabled() || paths.length === 0) return
  const run = () => prefetchRoutes(paths)
  if (typeof window === 'undefined') return
  const ric = (window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void
  }).requestIdleCallback
  if (typeof ric === 'function') {
    ric(run, { timeout: timeoutMs })
  } else {
    setTimeout(run, Math.min(timeoutMs, 3000))
  }
}

/** Test hook: clear registry and warmed state between cases. */
export function resetRoutePrefetchForTests(): void {
  loaders.clear()
  warmed.clear()
}
