import type { ErrorResponse } from '../../../shared/types'
import { dismissToast, getToasts, toast, updateToast, type ToastAction } from './toast'
import { formatCount, translate } from '../i18n/translate'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const TOKEN_KEY = 'freellmapi_dashboard_token';

// Dashboard session token (#35). Stored in localStorage; sent as a Bearer on
// every /api request and cleared on a 401.
export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token: string): void {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
}
export function clearToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

export const UNAUTHORIZED_EVENT = 'freellmapi:unauthorized'

// The /v1 base URL for ready-to-run snippets, derived the same way as the chat
// model page + Keys page: the dev server port in DEV, the page origin in a
// packaged/hosted build. Lives with the rest of the base-URL logic in lib/api.
export function apiBaseUrl(): string {
  return import.meta.env.DEV
    ? `http://${window.location.hostname}:${__SERVER_PORT__}/v1`
    : `${window.location.origin}/v1`
};

// Error thrown by apiFetch on a non-2xx response. Carries the HTTP status and
// the server's machine-readable `error.type` so callers can branch on them.
export type ApiError = Error & {
  status?: number;
  code?: string;
  /** Whole seconds from a 429's Retry-After header, when present. */
  retryAfterSec?: number;
}

/**
 * Retry-After: delta-seconds per RFC 9110, or an HTTP-date. Returns whole
 * seconds (at least 1) or null when the header is absent/unparseable.
 */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | null {
  if (value === null) return null;
  const raw = value.trim();
  if (raw === '') return null;
  if (/^\d+$/.test(raw)) return Math.max(1, Number(raw));
  const at = Date.parse(raw);
  if (Number.isNaN(at)) return null;
  return Math.max(1, Math.ceil((at - now) / 1000));
}

// The label is fully localized: the dictionary carries the phrasing per locale
// and formatCount renders the digits the locale expects (۷ in fa, ٧ in ar, …).
export const retryWaitLabel = (seconds: number): string => {
  if (seconds < 60) return translate('rateLimit.countdownSec', { n: formatCount(seconds) });
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0
    ? translate('rateLimit.countdownMin', { m: formatCount(minutes) })
    : translate('rateLimit.countdownMinSec', { m: formatCount(minutes), s: formatCount(rest) });
};

/** Extra seconds the finished countdown stays on screen so the now-enabled
 *  "Retry now" button has a usable window before the toast auto-dismisses. */
const READY_GRACE_SEC = 10;

/** Observable mirror of the countdown for persistent UI (the FloatingBar chip,
 *  beforeunload guard): secondsLeft ticks down, ready flips at zero, active
 *  clears when the toast is dismissed or the retry lands. */
export type RetryCountdownSnapshot = {
  active: boolean;
  secondsLeft: number;
  ready: boolean;
  /** Armed once the window opens: runs the original request (and folds the
   *  countdown away) so the chip can offer the toast's retry without waiting. */
  retryNow?: () => void;
};

let retryCountdownSnapshot: RetryCountdownSnapshot = { active: false, secondsLeft: 0, ready: false };
const retryCountdownListeners = new Set<(snapshot: RetryCountdownSnapshot) => void>();

export function getRetryCountdown(): RetryCountdownSnapshot {
  return retryCountdownSnapshot;
}

export function subscribeRetryCountdown(listener: (snapshot: RetryCountdownSnapshot) => void): () => void {
  retryCountdownListeners.add(listener);
  return () => {
    retryCountdownListeners.delete(listener);
  };
}

function setRetryCountdown(next: RetryCountdownSnapshot): void {
  retryCountdownSnapshot = next;
  for (const listener of retryCountdownListeners) listener(next);
}

/** sessionStorage slot for the pending rate-limited retry: the deadline plus
 *  the minimal request descriptor, so a reload mid-countdown re-arms the same
 *  toast (and button) instead of losing the window to a refresh. */
const PENDING_RETRY_KEY = 'freellmapi.pendingRetry';

type PendingRetry = { retryAt: number; path: string; method?: string; body?: string };

function persistPendingRetry(retryAt: number, path: string, options?: RequestInit): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const pending: PendingRetry = { retryAt, path };
    // Only the serializable, replay-safe parts of RequestInit survive the trip:
    // method + string body. Headers (auth, content-type) are rebuilt inside
    // apiFetch on the way back out.
    if (typeof options?.method === 'string') pending.method = options.method;
    if (typeof options?.body === 'string') pending.body = options.body;
    sessionStorage.setItem(PENDING_RETRY_KEY, JSON.stringify(pending));
  } catch {
    /* storage unavailable/full — this session's countdown still works */
  }
}

export function clearPendingRetry(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(PENDING_RETRY_KEY);
  } catch {
    /* ignore */
  }
}

function readPendingRetry(): PendingRetry | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PENDING_RETRY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingRetry>;
    if (typeof parsed.retryAt !== 'number' || typeof parsed.path !== 'string') return null;
    return parsed as PendingRetry;
  } catch {
    return null;
  }
}

/** Rebuild the countdown after a reload: while the saved deadline is still in
 *  the future, re-arm the same toast with the remaining time and a retry
 *  closure reconstructed from the stored descriptor. Called once from App. */
export function restorePendingRetry(): boolean {
  const pending = readPendingRetry();
  if (!pending) return false;
  const remainingMs = pending.retryAt - Date.now();
  if (remainingMs <= 0) {
    // The window already opened (or the slot is stale) — nothing to restore.
    clearPendingRetry();
    return false;
  }
  const active = countdown; // snapshot: closures lose the narrowing of a module-level let
  if (active && getToasts().some(t => t.id === active.id)) return false;
  const retry = () =>
    apiFetch(pending.path, {
      ...(pending.method ? { method: pending.method } : {}),
      ...(pending.body !== undefined ? { body: pending.body } : {}),
    });
  startRetryCountdown(Math.max(1, Math.ceil(remainingMs / 1000)), retry);
  return true;
}

/** Dispatched after the toast's retry button successfully re-runs the request
 *  that hit the 429 — App listens and refetches so the UI shows the data the
 *  opened window just allowed through. */
export const RETRY_SUCCEEDED_EVENT = 'freellmapi:retry-succeeded';

async function runRetry(retry: () => Promise<unknown>): Promise<void> {
  try {
    await retry();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(RETRY_SUCCEEDED_EVENT));
    }
    clearPendingRetry();
    setRetryCountdown({ active: false, secondsLeft: 0, ready: false });
    toast.success(translate('rateLimit.retried'));
  } catch (e) {
    const err = e as ApiError;
    // A fresh 429 already started its own countdown (or, without Retry-After,
    // surfaced as a plain error toast elsewhere) — do not double-report.
    if (err?.status === 429) return;
    toast.error(e instanceof Error ? e.message : String(e));
  }
}

// One live countdown at a time: further 429s while it ticks are ignored, so a
// polling query can't stack a new toast every interval.
let countdown: { id: number; timer: ReturnType<typeof setInterval> } | null = null;

function startRetryCountdown(seconds: number, retry?: () => Promise<unknown>): void {
  if (countdown && getToasts().some(t => t.id === countdown!.id)) return;
  if (countdown) clearInterval(countdown.timer);
  let remaining = seconds;
  // The action is born disabled: retrying before the window opens is a
  // guaranteed second 429. At zero the tick below flips it live.
  const action: ToastAction | undefined = retry
    ? {
        label: translate('rateLimit.retryNow'),
        disabled: true,
        onClick: () => void runRetry(retry),
      }
    : undefined;
  // retryWaitLabel already renders the full localized sentence (the dictionary
  // carries the "Rate limited —" phrasing), so it is the message verbatim.
  const id = toast.info(retryWaitLabel(remaining), {
    duration: (seconds + READY_GRACE_SEC) * 1000,
    action,
  });
  // clearSnapshot=false keeps the chip in its `ready` state after zero — the
  // toast (and its button) still have READY_GRACE_SEC left to live.
  const stop = (clearSnapshot = true) => {
    clearInterval(timer);
    if (countdown?.timer === timer) countdown = null;
    if (clearSnapshot) setRetryCountdown({ active: false, secondsLeft: 0, ready: false });
  };
  const timer = setInterval(() => {
    if (!getToasts().some(t => t.id === id)) {
      clearPendingRetry(); // user dismissed the countdown — forget the window
      return stop();
    }
    remaining -= 1;
    if (remaining <= 0) {
      // The Toaster's own duration timer keeps running (with the READY_GRACE_SEC
      // headroom, pausing on hover like every toast); this line flips the copy
      // to the ready state and arms the retry button.
      updateToast(
        id,
        translate('rateLimit.ready'),
        action ? { action: { ...action, disabled: false } } : undefined,
      );
      setRetryCountdown({
        active: true,
        secondsLeft: 0,
        ready: true,
        retryNow: retry
          ? () => {
              // Fold everything down BEFORE the request: the chip unmounts, the
              // countdown toast disappears, and a duplicate click is impossible.
              setRetryCountdown({ active: false, secondsLeft: 0, ready: false });
              dismissToast(id);
              void runRetry(retry);
            }
          : undefined,
      });
      return stop(false);
    }
    updateToast(id, retryWaitLabel(remaining));
    setRetryCountdown({ active: true, secondsLeft: remaining, ready: false });
  }, 1000);
  countdown = { id, timer };
  setRetryCountdown({ active: true, secondsLeft: seconds, ready: false });
}

/** True when the error already has a live countdown toast on screen — callers
 *  (and the global mutation-cache handler) must not add a second, frozen one. */
export function hasRetryCountdown(error: unknown): boolean {
  const apiError = error as ApiError;
  return apiError?.status === 429 && typeof apiError.retryAfterSec === 'number';
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers = new Headers(options?.headers);
  const isFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData;
  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(`${BASE}${path}`, {
    // `...options` first so an explicit method/body/signal applies, but headers
    // are merged last — otherwise an options.headers would clobber the
    // Content-Type and Authorization we set here.
    ...options,
    headers,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: { message: res.statusText } }))) as ErrorResponse;
    // A 401 ends the dashboard session ONLY when it is OUR auth saying so.
    // Discover/probe endpoints deliberately relay an upstream provider's 401
    // ("the endpoint rejected the key") with its status intact; treating those
    // as session-expired signed the operator out every time they tested a bad
    // provider key. The auth middleware and every session 401 carry
    // type 'authentication_error'; upstream relays never do.
    if (res.status === 401 && body.error?.type === 'authentication_error') {
      clearToken();
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    // Surface the HTTP status and the machine-readable error type on the thrown
    // Error so callers can branch on them (e.g. the setup form reveals a code
    // field on a `setup_code_required` 403). `.message` behaviour is unchanged.
    const err = new Error(body.error?.message ?? `HTTP ${res.status}`) as ApiError;
    err.status = res.status;
    err.code = body.error?.type;
    if (res.status === 429) {
      const retryAfterSec = parseRetryAfter(res.headers.get('Retry-After'));
      if (retryAfterSec !== null) {
        err.retryAfterSec = retryAfterSec;
        persistPendingRetry(Date.now() + retryAfterSec * 1000, path, options);
        startRetryCountdown(retryAfterSec, () => apiFetch(path, options));
      }
    }
    throw err;
  }
  if (res.status === 204) return undefined as T;
  // A 200 whose body isn't JSON means this request never reached the API — the
  // usual cause is a reverse proxy (or static host) serving the dashboard's
  // index.html for /api/* instead of forwarding it to the backend. Without this
  // guard the raw res.json() throws an opaque "Unexpected token '<'", which on
  // the setup/login form surfaces as "sign up page cannot work". Say what's
  // actually wrong. (#257)
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Expected JSON from ${path} but got a non-JSON response. The API isn't reachable at this origin — ` +
      `make sure the backend is running and that /api is forwarded to it, not served as the dashboard's static files.`,
    );
  }
}

export async function logout(): Promise<void> {
  try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  clearToken();
  window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
}
