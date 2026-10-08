import type { Request, Response, NextFunction } from 'express';
import { getDb, getSetting, getUnifiedApiKey, setSetting } from '../db/index.js';
import { getClientContext } from '../lib/client-context.js';
import { decrypt } from '../lib/crypto.js';
import { recordLogEntry } from '../lib/server-logs.js';
import { createHash } from 'node:crypto';

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
  /** Read-time decoration for scope 'key': the api_keys label matching the
   *  fingerprint (null when the key was deleted or undecryptable). */
  label?: string | null;
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
  const now = Date.now();
  events.unshift(event);
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
  maybeDetectSpike(now);
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
      label: labelSubject(r.subject),
    }));
  }
  return events.map(e => ({ ...e, label: labelSubject(e.subject) }));
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

// ── Runtime settings (dashboard-editable caps) ──────────────────────────────
// Precedence per cap: explicit env > dashboard setting > factory/default.
// The middleware resolves per request so a dashboard save takes effect on the
// next request — no restart, no stale factory closure.

export type RateLimitSettingKind = 'proxy' | 'admin' | 'key' | 'unified';
type RateLimitSource = 'env' | 'settings' | 'default';

const SETTING_KEYS: Record<RateLimitSettingKind, string> = {
  proxy: 'rateLimit.proxyRpm',
  admin: 'rateLimit.adminRpm',
  key: 'rateLimit.keyRpm',
  unified: 'rateLimit.unifiedRpm',
};
const ENV_NAMES: Record<RateLimitSettingKind, string> = {
  proxy: 'PROXY_RATE_LIMIT_RPM',
  admin: 'ADMIN_RATE_LIMIT_RPM',
  key: 'KEY_RATE_LIMIT_RPM',
  unified: 'UNIFIED_RATE_LIMIT_RPM',
};

const settingOverrides: Partial<Record<RateLimitSettingKind, number>> = {};
let settingsLoaded = false;

function loadSettingOverrides(): void {
  if (settingsLoaded) return;
  settingsLoaded = true; // set first: a missing DB must not retry every request
  try {
    for (const kind of ['proxy', 'admin', 'key', 'unified'] as RateLimitSettingKind[]) {
      const raw = getSetting(SETTING_KEYS[kind]);
      if (raw === undefined) continue;
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) settingOverrides[kind] = Math.floor(n);
    }
  } catch {
    /* no DB yet (unit tests) — defaults it is */
  }
}

function envLimit(kind: RateLimitSettingKind): number | undefined {
  const raw = process.env[ENV_NAMES[kind]];
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}

function resolveLimit(kind: RateLimitSettingKind, fallback: number): number {
  const fromEnv = envLimit(kind);
  if (fromEnv !== undefined) return fromEnv;
  loadSettingOverrides();
  const fromSettings = settingOverrides[kind];
  if (fromSettings !== undefined) return fromSettings;
  return fallback;
}

function limitSource(kind: RateLimitSettingKind): RateLimitSource {
  if (envLimit(kind) !== undefined) return 'env';
  loadSettingOverrides();
  return settingOverrides[kind] !== undefined ? 'settings' : 'default';
}

export function getRateLimitSettings() {
  return {
    proxyRpm: resolveLimit('proxy', DEFAULT_RPM),
    adminRpm: resolveLimit('admin', ADMIN_DEFAULT_RPM),
    keyRpm: resolveLimit('key', KEY_DEFAULT_RPM),
    unifiedRpm: resolveLimit('unified', UNIFIED_DEFAULT_RPM),
    sources: {
      proxy: limitSource('proxy'),
      admin: limitSource('admin'),
      key: limitSource('key'),
      unified: limitSource('unified'),
    } as Record<RateLimitSettingKind, RateLimitSource>,
  };
}

export function setRateLimitSettings(update: {
  proxyRpm?: number;
  adminRpm?: number;
  keyRpm?: number;
  unifiedRpm?: number;
}) {
  const map: Array<[RateLimitSettingKind, number | undefined]> = [
    ['proxy', update.proxyRpm],
    ['admin', update.adminRpm],
    ['key', update.keyRpm],
    ['unified', update.unifiedRpm],
  ];
  for (const [kind, value] of map) {
    if (value === undefined) continue;
    setSetting(SETTING_KEYS[kind], String(value));
    settingOverrides[kind] = value;
  }
  settingsLoaded = true;
  return getRateLimitSettings();
}

// ── Spike detection (server-log WARN + dashboard banner) ────────────────────
// Ten or more rejections inside five minutes means something is actively
// hammering the server, not a lone client hitting its budget. Fires at most
// once per cooldown so a sustained flood logs one warning, not one per 429.

const SPIKE_WINDOW_MS = 5 * 60_000;
const SPIKE_COOLDOWN_MS = 10 * 60_000;
const SPIKE_DEFAULT_THRESHOLD = 10;

function spikeThreshold(): number {
  const raw = process.env.RATE_LIMIT_ALERT_THRESHOLD;
  if (raw === undefined || raw.trim() === '') return SPIKE_DEFAULT_THRESHOLD;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return SPIKE_DEFAULT_THRESHOLD;
  return Math.floor(n);
}

let lastSpikeAlertAt = 0;
let lastSpike: { at: number; count: number } | null = null;

/** Most recent spike, kept for SPIKE_COOLDOWN_MS so the dashboard banner and
 *  the /rate-limits response stay consistent, then nulled. */
export function getRateLimitSpike(): { at: number; count: number } | null {
  if (!lastSpike) return null;
  if (Date.now() - lastSpike.at >= SPIKE_COOLDOWN_MS) return null;
  return lastSpike;
}

function maybeDetectSpike(now: number): void {
  const threshold = spikeThreshold();
  // The ring is newest-first; count the tail inside the window.
  let recent = 0;
  for (const event of events) {
    if (event.ts < now - SPIKE_WINDOW_MS) break;
    recent += 1;
  }
  if (recent < threshold) return;
  if (now - lastSpikeAlertAt < SPIKE_COOLDOWN_MS) return;
  lastSpikeAlertAt = now;
  lastSpike = { at: now, count: recent };
  try {
    recordLogEntry({
      level: 'warn',
      source: 'rate-limit',
      event: 'spike',
      message: `Rate-limit spike: ${recent} rejections in the last 5 minutes (threshold ${threshold}).`,
      tsMs: now,
    });
  } catch {
    /* logging must never break a rejection */
  }
}

// ── Unified-key identity (pre-auth bucket split) ────────────────────────────
// The dashboard-issued unified key is plaintext in `settings` (that is how
// GET /api/settings/api-key serves it), so its fingerprint can be derived
// without the api_keys decryption path. Cached for a minute like the label
// map: one settings read per 60s instead of one per request.

let unifiedFpCache: { at: number; fp: string | null } | null = null;

function unifiedFingerprint(): string | null {
  if (unifiedFpCache && Date.now() - unifiedFpCache.at < 60_000) return unifiedFpCache.fp;
  let fp: string | null = null;
  try {
    const secret = getUnifiedApiKey();
    if (secret) fp = `key:${createHash('sha256').update(secret).digest('hex').slice(0, 8)}`;
  } catch {
    /* no DB / no row yet — nothing can match */
  }
  unifiedFpCache = { at: Date.now(), fp };
  return fp;
}

// ── Approaching-cap warning (fires once per subject per window) ──────────────
// At 80% of the cap the pass path logs a soft warn so the operator hears about
// the budget BEFORE the first 429. Keyed by subject+window so a sustained
// stream cannot spam the log.

const approachNotified = new Map<string, number>(); // key → window resetAt

function noteApproaching(subject: string, resetAt: number, limit: number, count: number, now: number): void {
  const key = `${subject}|${resetAt}`;
  if (approachNotified.has(key)) return;
  approachNotified.set(key, resetAt);
  if (approachNotified.size > MAX_TRACKED_KEYS) {
    for (const [k, until] of approachNotified) if (now >= until) approachNotified.delete(k);
  }
  try {
    const pct = Math.round((count / limit) * 100);
    recordLogEntry({
      level: 'warn',
      source: 'rate-limit',
      event: 'approaching',
      message: `Approaching rate limit: ${subject} at ${pct}% of the ${limit}/req-min cap (${count}/${limit}).`,
      tsMs: now,
    });
  } catch {
    /* logging must never break a passing request */
  }
}

// ── Key-label join (fingerprint → api_keys.label, read time) ────────────────

let keyLabelCache: { at: number; map: Map<string, string> } | null = null;

function keyLabelMap(): Map<string, string> {
  if (keyLabelCache && Date.now() - keyLabelCache.at < 60_000) return keyLabelCache.map;
  const map = new Map<string, string>();
  try {
    const rows = getDb()
      .prepare(`SELECT label, encrypted_key, iv, auth_tag FROM api_keys`)
      .all() as Array<{ label: string; encrypted_key: string; iv: string; auth_tag: string }>;
    for (const row of rows) {
      try {
        const secret = decrypt(row.encrypted_key, row.iv, row.auth_tag);
        const fingerprint = `key:${createHash('sha256').update(secret).digest('hex').slice(0, 8)}`;
        map.set(fingerprint, row.label);
      } catch {
        /* undecryptable with the current ENCRYPTION_KEY — show the fingerprint */
      }
    }
  } catch {
    /* no DB — empty map */
  }
  keyLabelCache = { at: Date.now(), map };
  return map;
}

function labelSubject(subject: string | null | undefined): string | null {
  if (!subject) return null;
  return keyLabelMap().get(subject) ?? null;
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


export function createProxyRateLimiter(rpmLimit?: number) {
  // Resolved per request: env > dashboard setting > the mount's fallback.
  const fallback = rpmLimit !== undefined ? Math.floor(Math.max(0, rpmLimit)) : DEFAULT_RPM;
  const windows = new Map<string, WindowState>();
  const scope = 'proxy' as const;

  return function proxyRateLimit(req: Request, res: Response, next: NextFunction): void {
    const limit = resolveLimit('proxy', fallback);
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


export function createAdminRateLimiter(
  rpm?: number,
  // 'admin' (default) follows env > dashboard setting > fallback. `null` is a
  // dedicated bucket (the key-export limiter) that answers ONLY to its own
  // explicit cap — the broad dashboard knobs must not loosen it.
  options?: { settingKind?: 'admin' | null },
) {
  const settingKind = options?.settingKind === undefined ? 'admin' : options.settingKind;
  const fallback = rpm !== undefined ? Math.floor(Math.max(0, rpm)) : ADMIN_DEFAULT_RPM;
  const windows = new Map<string, WindowState>();
  const scope = 'admin' as const;

  return function adminRateLimit(req: Request, res: Response, next: NextFunction): void {
    const limit = settingKind ? resolveLimit(settingKind, fallback) : fallback;
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
/** The unified key is one credential shared by every client — it rides the
 *  same per-minute default as a single api key until an operator retunes it. */
const UNIFIED_DEFAULT_RPM = KEY_DEFAULT_RPM;
const MAX_TRACKED_KEYS = 5_000;
const keyWindows = new Map<string, WindowState>();
// The usage view needs the cap; every mount parses the same env so the last
// factory's value is the live one.
let activeKeyLimit = KEY_DEFAULT_RPM;


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
  const fallback = rpmLimit !== undefined ? Math.floor(Math.max(0, rpmLimit)) : KEY_DEFAULT_RPM;
  // Snapshot for the usage view; requests below refresh it with the resolved
  // (env/settings-aware) value so the bar shows the cap actually enforced.
  activeKeyLimit = fallback;
  const scope = 'key' as const;

  return function keyRateLimit(req: Request, res: Response, next: NextFunction): void {
    activeKeyLimit = resolveLimit('key', fallback);
    const token = presentedApiToken(req);
    if (!token) {
      // No credential presented — the IP bucket already counts this request.
      next();
      return;
    }
    const fingerprint = `key:${createHash('sha256').update(token).digest('hex').slice(0, 8)}`;
    // The unified key gets its OWN bucket: without the split, one shared
    // credential would both dodge the per-key view (T22: subject null) and be
    // at the mercy of whatever cap an api-key row would impose.
    const isUnified = fingerprint === unifiedFingerprint();
    const subject = isUnified ? `unified:${fingerprint.slice(4)}` : fingerprint;
    const limit = isUnified ? resolveLimit('unified', UNIFIED_DEFAULT_RPM) : activeKeyLimit;
    if (limit === 0) {
      next(); // 0 disables this bucket entirely
      return;
    }

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

    // Still passing, but at/over 80% of the cap: warn once per window so the
    // budget is visible before the first rejection.
    const approachAt = Math.max(1, Math.ceil(limit * 0.8));
    if (state.count === approachAt && approachAt <= limit) {
      noteApproaching(subject, state.resetAt, limit, state.count, now);
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
export function getKeyRateLimitUsage(): Array<{
  subject: string;
  label: string | null;
  count: number;
  limit: number;
  percent: number;
  resetAt: number;
}> {
  const now = Date.now();
  const usage: Array<{
    subject: string;
    label: string | null;
    count: number;
    limit: number;
    percent: number;
    resetAt: number;
  }> = [];
  for (const [subject, state] of keyWindows) {
    if (now >= state.resetAt) {
      keyWindows.delete(subject);
      continue;
    }
    // Live per-row caps: the unified bucket resolves its own kind, the rest
    // show the cap the last key-limiter mount enforces.
    const limit = subject.startsWith('unified:') ? resolveLimit('unified', UNIFIED_DEFAULT_RPM) : activeKeyLimit;
    usage.push({
      subject,
      // api_keys labels only — an `unified:` fingerprint has no key row.
      label: subject.startsWith('unified:') ? null : labelSubject(subject),
      count: state.count,
      limit,
      percent: limit > 0 ? Math.min(100, Math.round((state.count / limit) * 100)) : 0,
      resetAt: state.resetAt,
    });
  }
  usage.sort((a, b) => b.count - a.count);
  return usage;
}

export function clearRateLimitEventsForTests(): void {
  events.length = 0;
  keyWindows.clear();
  approachNotified.clear();
  lastSpike = null;
  lastSpikeAlertAt = 0;
  unifiedFpCache = null;
  withDb(db => {
    db.prepare(`DELETE FROM rate_limit_events`).run();
    return undefined;
  });
}
