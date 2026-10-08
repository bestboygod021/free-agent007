import { createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/index.js';
import { getClientContext } from '../lib/client-context.js';

// Per-IP fixed-window rate limiters for the public /v1 proxy (#35, item #6)
// and the dashboard /api surface, plus a per-API-key bucket on the proxy.
//
// The /v1 surface authenticates with the unified API key but has no password
// login like the dashboard does, so without a limiter an attacker who can
// reach the server could brute-force the key or flood upstream providers.
// FreeLLMAPI is a single-user tool, so the default ceilings are generous.
//
// Every rejection is (a) answered with an honest Retry-After + OpenAI-shaped
// 429 and (b) recorded for the operator: a 200-entry in-memory ring for the
// hot path, mirrored into the rate_limit_events table (7-day retention) so
// the trail survives a restart. GET /api/health/rate-limits serves both.

const WINDOW_MS = 60_000;
const DEFAULT_RPM = 120;
// Bound the IP map so a flood of distinct (e.g. spoofed) source addresses can't
// grow it without limit; expired entries are pruned opportunistically.
const MAX_TRACKED_IPS = 10_000;

interface WindowState {
  count: number;
  resetAt: number;
}

/** One rejected request, as surfaced on GET /api/health/rate-limits. `scope`
 *  names the limiter that rejected it: 'proxy' guards /v1 (+ siblings),
 *  'admin' guards the dashboard /api surface, 'key' is the per-API-key bucket
 *  on the proxy. `subject` carries the key fingerprint for scope 'key';
 *  `ip` is the normalized caller address (null when client logging is opted
 *  out) — the same normalization request-analytics stores, so the operator
 *  can pivot from an event to that caller's history. */
export interface RateLimitEvent {
  ts: number;
  scope: 'proxy' | 'admin' | 'key';
  method: string;
  path: string;
  ip: string | null;
  subject: string | null;
  limit: number;
  retryAfter: number;
}

const MAX_EVENTS = 200;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const events: RateLimitEvent[] = [];

type RateLimitDb = ReturnType<typeof getDb>;

/** Best-effort DB access: unit tests run without a database, and a rejection
 *  must never fail because storage did. */
function withDb<T>(fn: (db: RateLimitDb) => T): T | undefined {
  try {
    return fn(getDb());
  } catch {
    return undefined;
  }
}

export function recordRateLimitEvent(event: RateLimitEvent): void {
  events.unshift(event);
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
  withDb(db => {
    db.prepare(
      `INSERT INTO rate_limit_events (ts, scope, method, path, ip, subject, limit_rpm, retry_after)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(event.ts, event.scope, event.method, event.path, event.ip, event.subject, event.limit, event.retryAfter);
    // Rejections are rare (that is the point), so pruning on insert is enough.
    db.prepare(`DELETE FROM rate_limit_events WHERE ts < ?`).run(Date.now() - RETENTION_MS);
    return undefined;
  });
}

/** Newest first — from the durable table when a database is up, from the ring
 *  otherwise (unit tests, DB-less embedders). */
export function getRateLimitEvents(): RateLimitEvent[] {
  const rows = withDb(db =>
    db
      .prepare(
        `SELECT ts, scope, method, path, ip, subject, limit_rpm, retry_after
         FROM rate_limit_events
         ORDER BY ts DESC, id DESC
         LIMIT ?`,
      )
      .all(MAX_EVENTS) as Array<{
      ts: number;
      scope: RateLimitEvent['scope'];
      method: string;
      path: string;
      ip: string | null;
      subject: string | null;
      limit_rpm: number;
      retry_after: number;
    }>,
  );
  if (rows) {
    return rows.map(r => ({
      ts: r.ts,
      scope: r.scope,
      method: r.method,
      path: r.path,
      ip: r.ip,
      subject: r.subject,
      limit: r.limit_rpm,
      retryAfter: r.retry_after,
    }));
  }
  return [...events];
}

export interface RateLimitStatsBucket {
  /** Hour label in UTC: `YYYY-MM-DDTHH` (matches SQLite's strftime output). */
  hour: string;
  count: number;
}

export interface RateLimitStatsPath {
  path: string;
  scope: RateLimitEvent['scope'];
  count: number;
}

export interface RateLimitStats {
  windowHours: number;
  buckets: RateLimitStatsBucket[];
  byPath: RateLimitStatsPath[];
}

/** Hourly totals + per-path breakdown over the trailing window — the feed for
 *  the trend strip on the Keys page. Falls back to the ring without a DB. */
export function getRateLimitStats(windowHours = 24): RateLimitStats {
  const since = Date.now() - windowHours * 60 * 60 * 1000;
  const fromDb = withDb(db => ({
    buckets: db
      .prepare(
        `SELECT strftime('%Y-%m-%dT%H', ts / 1000, 'unixepoch') AS hour, COUNT(*) AS count
         FROM rate_limit_events WHERE ts >= ?
         GROUP BY hour ORDER BY hour ASC`,
      )
      .all(since) as RateLimitStatsBucket[],
    byPath: db
      .prepare(
        `SELECT path, scope, COUNT(*) AS count
         FROM rate_limit_events WHERE ts >= ?
         GROUP BY path, scope
         ORDER BY count DESC, path ASC
         LIMIT 20`,
      )
      .all(since) as RateLimitStatsPath[],
  }));
  if (fromDb) return { windowHours, buckets: fromDb.buckets, byPath: fromDb.byPath };

  const recent = events.filter(e => e.ts >= since);
  const bucketMap = new Map<string, number>();
  const pathMap = new Map<string, RateLimitStatsPath>();
  for (const event of recent) {
    const hour = new Date(event.ts).toISOString().slice(0, 13);
    bucketMap.set(hour, (bucketMap.get(hour) ?? 0) + 1);
    const key = `${event.path} ${event.scope}`;
    const entry = pathMap.get(key);
    if (entry) entry.count += 1;
    else pathMap.set(key, { path: event.path, scope: event.scope, count: 1 });
  }
  return {
    windowHours,
    buckets: [...bucketMap.entries()]
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour.localeCompare(b.hour)),
    byPath: [...pathMap.values()]
      .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
      .slice(0, 20),
  };
}

/** Caller identity for the event trail: the AsyncLocalStorage context the
 *  clientContextMiddleware sets (exactly what request-analytics stores in
 *  requests.client_ip), falling back to a normalized socket address. */
function callerIp(req: Request): string | null {
  const ctx = getClientContext();
  if (ctx.ip) return ctx.ip;
  const raw = req.ip ?? req.socket.remoteAddress ?? null;
  return raw?.replace(/^::ffff:/i, '') ?? null;
}

function parseLimit(): number {
  const raw = process.env.PROXY_RATE_LIMIT_RPM;
  if (raw === undefined || raw.trim() === '') return DEFAULT_RPM;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_RPM;
  return Math.floor(n);
}

export function createProxyRateLimiter(rpmLimit?: number) {
  const limit = rpmLimit !== undefined ? Math.floor(Math.max(0, rpmLimit)) : parseLimit();
  const windows = new Map<string, WindowState>();
  const scope = 'proxy' as const;

  return function proxyRateLimit(req: Request, res: Response, next: NextFunction): void {
    if (limit === 0) {
      next();
      return;
    }

    const now = Date.now();
    const ip = callerIp(req) ?? 'unknown';

    let state = windows.get(ip);
    if (!state || now >= state.resetAt) {
      state = { count: 0, resetAt: now + WINDOW_MS };
      windows.set(ip, state);
    }
    state.count += 1;

    if (windows.size > MAX_TRACKED_IPS) {
      for (const [key, value] of windows) {
        if (now >= value.resetAt) windows.delete(key);
      }
    }

    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - state.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(state.resetAt / 1000)));

    if (state.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      // Keep a short operator-visible trail of what the limiter rejected —
      // surfaced on GET /api/health/rate-limits (admin dashboard).
      recordRateLimitEvent({
        ts: now,
        scope,
        method: req.method,
        path: req.originalUrl ?? req.url,
        ip: callerIp(req),
        subject: null,
        limit,
        retryAfter,
      });
      res.status(429).json({
        error: {
          message: `Rate limit exceeded: more than ${limit} requests per minute. Retry in ${retryAfter}s.`,
          type: 'rate_limit_error',
        },
      });
      return;
    }

    next();
  };
}

// Per-IP fixed-window rate limiter for the /api/* admin surface.
//
// This is a flood guard, not the brute-force guard: dashboard login already has
// its own per-email lockout (routes/auth.ts), and the one admin endpoint that
// verifies a password — GET /api/keys/export — gets its own much tighter
// limiter mounted in app.ts. The broad cap therefore has to clear normal
// dashboard traffic with room to spare. Opening the dashboard fans out across
// keys, health, models, analytics, settings and profiles, and several of those
// poll, so a single user legitimately spends dozens of requests a minute.
//
// Tune with ADMIN_RATE_LIMIT_RPM (requests per minute per IP); 0 disables it.
const ADMIN_DEFAULT_RPM = 600;

function parseAdminLimit(): number {
  const raw = process.env.ADMIN_RATE_LIMIT_RPM;
  if (raw === undefined || raw.trim() === '') return ADMIN_DEFAULT_RPM;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return ADMIN_DEFAULT_RPM;
  return Math.floor(n);
}

export function createAdminRateLimiter(rpm?: number) {
  const limit = rpm !== undefined ? Math.floor(Math.max(0, rpm)) : parseAdminLimit();
  const windows = new Map<string, WindowState>();
  const scope = 'admin' as const;

  return function adminRateLimit(req: Request, res: Response, next: NextFunction): void {
    if (limit === 0) {
      next();
      return;
    }

    const now = Date.now();
    const ip = callerIp(req) ?? 'unknown';

    let state = windows.get(ip);
    if (!state || now >= state.resetAt) {
      state = { count: 0, resetAt: now + WINDOW_MS };
      windows.set(ip, state);
    }
    state.count += 1;

    if (windows.size > MAX_TRACKED_IPS) {
      for (const [key, value] of windows) {
        if (now >= value.resetAt) windows.delete(key);
      }
    }

    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - state.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(state.resetAt / 1000)));

    if (state.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      recordRateLimitEvent({
        ts: now,
        scope,
        method: req.method,
        path: req.originalUrl ?? req.url,
        ip: callerIp(req),
        subject: null,
        limit,
        retryAfter,
      });
      res.status(429).json({
        error: {
          message: `Rate limit exceeded: more than ${limit} requests per minute. Retry in ${retryAfter}s.`,
          type: 'rate_limit_error',
        },
      });
      return;
    }

    next();
  };
}

// ── Per-API-key burst bucket for the proxy ──────────────────────────────────
//
// The IP buckets above stop a single address; a runaway agent loop (or a
// leaked key hammering upstream from many addresses) needs a ceiling tied to
// the credential itself. This runs BESIDE the IP limiter on the same mounts
// and — deliberately — before key validation: the bucket keys off the
// PRESENTED credential, so a brute-forcer cycling candidate keys gets a
// per-candidate ceiling too, and no routing work happens on a rejection.
//
// The subject is a short SHA-256 fingerprint (never the raw key), so the
// event trail and the dashboard usage view can correlate without storing the
// credential. Requests with no API-credential header fall through to the IP
// bucket alone. Tune with KEY_RATE_LIMIT_RPM; 0 disables it.

const KEY_DEFAULT_RPM = 180;
const MAX_TRACKED_KEYS = 5_000;
const keyWindows = new Map<string, WindowState>();
// The usage view needs the cap; every mount parses the same env so the last
// factory's value is the live one.
let activeKeyLimit = KEY_DEFAULT_RPM;

function parseKeyLimit(): number {
  const raw = process.env.KEY_RATE_LIMIT_RPM;
  if (raw === undefined || raw.trim() === '') return KEY_DEFAULT_RPM;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return KEY_DEFAULT_RPM;
  return Math.floor(n);
}

/** Mirrors routes/proxy.ts extractApiToken (Bearer / x-api-key /
 *  x-goog-api-key) as a header-only read. Duplicated on purpose: importing the
 *  proxy module here would drag the whole routing graph into the middleware. */
function presentedApiToken(req: Request): string | undefined {
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
  if (bearer) return bearer;
  const apiKeyHeader = req.headers['x-api-key'];
  const xApiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
  const trimmed = xApiKey?.trim();
  if (trimmed) return trimmed;
  const googleHeader = req.headers['x-goog-api-key'];
  const xGoog = Array.isArray(googleHeader) ? googleHeader[0] : googleHeader;
  return xGoog?.trim() || undefined;
}

export function createKeyRateLimiter(rpmLimit?: number) {
  const limit = rpmLimit !== undefined ? Math.floor(Math.max(0, rpmLimit)) : parseKeyLimit();
  activeKeyLimit = limit;
  const scope = 'key' as const;

  return function keyRateLimit(req: Request, res: Response, next: NextFunction): void {
    if (limit === 0) {
      next();
      return;
    }
    const token = presentedApiToken(req);
    if (!token) {
      // No credential presented — the IP bucket already counts this request.
      next();
      return;
    }
    const subject = `key:${createHash('sha256').update(token).digest('hex').slice(0, 8)}`;

    const now = Date.now();
    let state = keyWindows.get(subject);
    if (!state || now >= state.resetAt) {
      state = { count: 0, resetAt: now + WINDOW_MS };
      keyWindows.set(subject, state);
    }
    state.count += 1;

    if (keyWindows.size > MAX_TRACKED_KEYS) {
      for (const [key, value] of keyWindows) {
        if (now >= value.resetAt) keyWindows.delete(key);
      }
    }

    if (state.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      recordRateLimitEvent({
        ts: now,
        scope,
        method: req.method,
        path: req.originalUrl ?? req.url,
        ip: callerIp(req),
        subject,
        limit,
        retryAfter,
      });
      res.status(429).json({
        error: {
          message: `Rate limit exceeded: more than ${limit} requests per minute. Retry in ${retryAfter}s.`,
          type: 'rate_limit_error',
        },
      });
      return;
    }

    next();
  };
}

/** Live per-key window counters for the Keys page ("118/180 this minute").
 *  Expired windows are pruned as they are read. */
export function getKeyRateLimitUsage(): Array<{ subject: string; count: number; limit: number; resetAt: number }> {
  const now = Date.now();
  const usage: Array<{ subject: string; count: number; limit: number; resetAt: number }> = [];
  for (const [subject, state] of keyWindows) {
    if (now >= state.resetAt) {
      keyWindows.delete(subject);
      continue;
    }
    usage.push({ subject, count: state.count, limit: activeKeyLimit, resetAt: state.resetAt });
  }
  usage.sort((a, b) => b.count - a.count);
  return usage;
}

export function clearRateLimitEventsForTests(): void {
  events.length = 0;
  keyWindows.clear();
  withDb(db => {
    db.prepare(`DELETE FROM rate_limit_events`).run();
    return undefined;
  });
}
