import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Express } from 'express';
import type { Server } from 'node:http';
import { createRequire } from 'node:module';
import { createApp } from '../../app.js';
import { initDb, getUnifiedApiKey } from '../../db/index.js';

// update.ts reads FREELLMAPI_UPDATE_CHECK at import time (createUpdateRouter()
// runs at module scope), so the knob has to be set before the app graph loads
// — vi.hoisted runs above the imports. With it off, the explicit update-check
// route answers locally instead of dialling api.github.com; the route stays
// under test, the test stays hermetic.
vi.hoisted(() => {
  process.env.FREELLMAPI_UPDATE_CHECK = 'off';
});

// ─────────────────────────────────────────────────────────────────────────────
// Route-table smoke test.
//
// Per-route suites assert behaviour; this file asserts WIRING: every route the
// app registers answers its own method+path with JSON (the one intentional
// HTML surface, /v1/docs, excepted) and nothing crashes with a 500. A route
// that 404s is either unmounted or mounted under a path nothing reaches — the
// classic client/server drift — and an unmatched API path that falls through
// to the static/SPA block answers HTML, which is exactly what this catches.
//
// The inventory is taken from the LIVE Express router, so a route added
// tomorrow is smoke-covered the moment it is registered, with no test to
// remember to write.
// ─────────────────────────────────────────────────────────────────────────────

// ── Mount recorder ───────────────────────────────────────────────────────────
// Express 5 compiles each mount into an opaque matcher closure (layer.regexp
// is gone), so a mount's prefix cannot be read back off the layer. It can,
// however, be watched as it happens: `express/lib/application.js`'s `use` is
// the same function instance every app receives (createApplication mixes the
// reference in at creation), so patching it before createApp() records every
// app-level mount, keyed by the router identity the walker will find later.
// Nested `parentRouter.use(childRouter)` mounts inside a router are NOT
// recorded — they carry no path in this app, and an unrecorded router
// therefore resolves to prefix '', which is exactly right for them. A future
// nested mount WITH a path would resolve wrong, produce unreachable probe
// paths, and fail this test loudly — the intended failure mode.
type RouterLike = { stack?: unknown[] };
const mountRecords = new Map<RouterLike, string[]>();

function isRouter(value: unknown): value is RouterLike {
  return typeof value === 'function' && Array.isArray((value as RouterLike).stack);
}

const requireCjs = createRequire(import.meta.url);
const application = requireCjs('express/lib/application.js') as {
  use: (this: unknown, ...args: unknown[]) => unknown;
};
const originalUse = application.use;
application.use = function patchedUse(this: unknown, ...args: unknown[]): unknown {
  const first = args[0];
  const hasPrefix = typeof first === 'string' || Array.isArray(first);
  const prefixes: string[] = hasPrefix
    ? (typeof first === 'string' ? [first] : (first as unknown[]).filter((p): p is string => typeof p === 'string'))
    : [''];
  const handles = hasPrefix ? args.slice(1) : args;
  for (const handle of handles) {
    if (isRouter(handle)) {
      const list = mountRecords.get(handle) ?? [];
      for (const p of prefixes) if (!list.includes(p)) list.push(p);
      mountRecords.set(handle, list);
    }
  }
  return originalUse.apply(this, args as Parameters<typeof originalUse>);
};

// ── Route inventory ──────────────────────────────────────────────────────────
interface RouteEntry {
  method: string;
  path: string;
}

interface RouteLayerLike {
  route?: { path: string | RegExp | (string | RegExp)[]; methods: Record<string, boolean> };
  handle?: { stack?: unknown[] };
  matchers?: ((input: string) => { path: string } | false)[];
}

// Prefixes recorded for a mount layer. A layer WITH a path compiles a matcher
// that accepts `prefix/<anything>`, so the recorded candidate it accepts is
// the truth (this also disambiguates a router mounted at several prefixes).
// A nested pathless mount (`parentRouter.use(childRouter)`) never matches an
// extended probe — its fast_slash matcher only accepts '/' — so a rejection
// means prefix '', which is exactly what a pathless nested mount needs. An
// unrecorded router (nested under a router, invisible to the app.use patch)
// resolves to '' the same way.
function resolveMountPrefix(layer: RouteLayerLike): string {
  const handle = layer.handle as RouterLike;
  const candidates = mountRecords.get(handle) ?? [''];
  const matcher = layer.matchers?.[0];
  if (!matcher) return candidates[0] ?? '';
  for (const candidate of candidates) {
    if (matcher(`${candidate}/__smoke_probe__`) !== false) return candidate;
  }
  return '';
}

// A probe URL for a route path: :params get a sentinel, regex routes get their
// structure with capture groups replaced. The sentinel is numeric so handlers
// that parseInt() it fail with "not found" rather than NaN arithmetic.
function concretePath(path: string | RegExp): string {
  if (path instanceof RegExp) {
    return path.source
      .replace(/^\^/, '')
      .replace(/\$$/, '')
      .replace(/\([^)]*\)/g, '424244')
      .replace(/\\\//g, '/');
  }
  return path.replace(/:[A-Za-z0-9_]+/g, '424244').replace(/\*/g, '424244');
}

function collectRoutes(router: { stack?: unknown[] }, prefix: string, out: RouteEntry[]): void {
  // Mount prefixes can carry params too ('/v1/t/:token') — concretize before
  // joining so the inventory holds the URL a client would actually type.
  const concretePrefix = concretePath(prefix);
  for (const layer of router.stack ?? []) {
    const l = layer as RouteLayerLike;
    if (l.route) {
      const paths = Array.isArray(l.route.path) ? l.route.path : [l.route.path];
      for (const p of paths) {
        let joined = `${concretePrefix}${concretePath(p)}` || '/';
        // Normalize: router.get('/') under a '/api/models' mount is the path
        // callers actually type — no trailing slash (root '/' stays '/').
        if (joined.length > 1) joined = joined.replace(/\/+$/, '');
        for (const method of Object.keys(l.route.methods)) {
          out.push({ method: method.toUpperCase(), path: joined });
        }
      }
    } else if (l.handle?.stack) {
      collectRoutes(l.handle, prefix + resolveMountPrefix(l), out);
    }
  }
}

// ── Egress allowlist ─────────────────────────────────────────────────────────
// Routes that dial user-supplied or third-party endpoints. A smoke test in CI
// has no meaningful host to dial, and a blocked network can stall far longer
// than the assertion is worth. Each entry must match a REAL registered route —
// a stale skip fails below, so the list cannot rot.
const SKIP_EGRESS = new Set([
  'POST /api/premium/sync',        // catalog call to freellmapi.co
  'POST /api/settings/proxy/test', // dials the operator's proxy URL
  'POST /api/keys/custom/probe',   // dials a user-registered endpoint
  'POST /api/keys/custom/discover-models', // dials a user-registered endpoint
]);

describe('route-table smoke', () => {
  let app: Express;
  let server: Server;
  let baseUrl = '';
  let dashToken = '';
  const routes: RouteEntry[] = [];

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    // The sweep issues hundreds of requests in seconds; the per-IP limiters
    // would 429 the test itself. Both are per-app instances, disabled here.
    process.env.PROXY_RATE_LIMIT_RPM = '0';
    process.env.ADMIN_RATE_LIMIT_RPM = '0';

    initDb(':memory:');
    app = createApp();

    // Inventory from the live router, before anything serves.
    const root = (app as unknown as { router: { stack?: unknown[] } }).router;
    collectRoutes(root, '', routes);

    server = app.listen(0, '127.0.0.1');
    if (!server.listening) {
      await new Promise<void>(resolve => server.once('listening', () => resolve()));
    }
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('no tcp address');
    baseUrl = `http://127.0.0.1:${addr.port}`;

    // The REAL first-run flow: claim the dashboard over loopback (no setup
    // code required) and keep the session for the /api sweep below.
    const setup = await fetch(`${baseUrl}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'smoke@example.com', password: 'password123' }),
    });
    const setupBody = (await setup.json()) as { token?: string };
    expect(setup.status).toBe(201);
    dashToken = setupBody.token ?? '';
    expect(dashToken).not.toBe('');
  });

  afterAll(async () => {
    application.use = originalUse;
    await new Promise<void>(resolve => server.close(() => resolve()));
    delete process.env.PROXY_RATE_LIMIT_RPM;
    delete process.env.ADMIN_RATE_LIMIT_RPM;
    delete process.env.FREELLMAPI_UPDATE_CHECK;
  });

  // Guards the inventory itself: if the recorder or walker silently breaks,
  // every later assertion gets weaker, not louder.
  it('enumerates the whole mounted surface', () => {
    expect(routes.length).toBeGreaterThanOrEqual(200);
    const seen = new Set(routes.map(r => `${r.method} ${r.path}`));
    for (const critical of [
      'GET /api/auth/status',
      'POST /api/auth/setup',
      'GET /api/models',
      'GET /api/fallback',
      'GET /api/analytics/summary',
      'GET /api/keys/export',
      'GET /v1/models',
      'POST /v1/chat/completions',
      'POST /v1/messages',        // Anthropic surface
      'POST /v1/responses',       // OpenAI Responses surface
      'GET /v1beta/models',       // native Gemini surface
      'POST /mcp',                // MCP surface
      'GET /api/agent/modes',     // ForgePilot surface
      'GET /livez',
      'GET /readyz',
      'GET /api/tags',            // Ollama emulation
      'POST /v1/t/424244/chat/completions', // URL-token surface
    ]) {
      expect(seen, `missing critical route: ${critical}`).toContain(critical);
    }
    // Every egress skip must still name a real route, so the list can't rot.
    for (const skip of SKIP_EGRESS) {
      const [method, ...rest] = skip.split(' ');
      expect(
        routes.some(r => r.method === method && r.path === rest.join(' ')),
        `stale egress skip (no such route): ${skip}`,
      ).toBe(true);
    }
  });

  it('serves the real first-run auth lifecycle', async () => {
    const status = await (await fetch(`${baseUrl}/api/auth/status`)).json();
    expect(status.needsSetup).toBe(false);

    const me = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${dashToken}` },
    });
    expect(me.status).toBe(200);
    expect(((await me.json()) as { email: string }).email).toBe('smoke@example.com');

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'smoke@example.com', password: 'password123' }),
    });
    expect(login.status).toBe(200);
    const loginToken = ((await login.json()) as { token: string }).token;

    // The admin surface is session-gated end to end…
    const unauth = await fetch(`${baseUrl}/api/keys`);
    expect(unauth.status).toBe(401);
    const auth = await fetch(`${baseUrl}/api/keys`, {
      headers: { Authorization: `Bearer ${loginToken}` },
    });
    expect(auth.status).toBe(200);

    // …and logout actually revokes.
    const logout = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${loginToken}` },
    });
    expect(logout.status).toBe(200);
    const afterLogout = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${loginToken}` },
    });
    expect(afterLogout.status).toBe(401);
  });

  it('answers every registered route with JSON and no 500', async () => {
    const sessionHeaders = { Authorization: `Bearer ${dashToken}` };
    const unifiedHeaders = { Authorization: `Bearer ${getUnifiedApiKey()}` };
    const violations: string[] = [];
    let probed = 0;

    for (const route of routes) {
      if (SKIP_EGRESS.has(`${route.method} ${route.path}`)) continue;
      probed++;

      // Dashboard routes ride the session; /v1 & /mcp ride the unified key;
      // the bootstrap, ollama-emulation and probe endpoints need neither.
      const headers: Record<string, string> = {};
      if (route.path.startsWith('/api/') && !route.path.startsWith('/api/auth')) {
        Object.assign(headers, sessionHeaders);
      } else if (
        route.path.startsWith('/v1') ||
        route.path.startsWith('/v1beta') ||
        route.path.startsWith('/mcp')
      ) {
        Object.assign(headers, unifiedHeaders);
      }

      const res = await fetch(`${baseUrl}${route.path}`, {
        method: route.method,
        headers,
      }).catch((err: unknown) => ({ ok: false, status: 0, headers: null, text: async () => String(err) }) as const);
      const contentType = res.headers?.get('content-type') ?? '';
      const raw = res.status === 0 ? '' : await res.text();
      const label = `${route.method} ${route.path}`;

      // Express's default 404 and the SPA fallback are both HTML; a registered
      // API route must never end up in either. /v1/docs is HTML by design.
      if (contentType.includes('text/html') && route.path !== '/v1/docs') {
        violations.push(`${label} → ${res.status} HTML (fell through: ${raw.slice(0, 120).replace(/\n/g, ' ')})`);
        continue;
      }
      // The JSON 404 catch-all means a registered path that fell through no
      // longer shows up as HTML — catch it by its envelope type instead.
      if (res.status === 404 && raw.includes('"route_not_found"')) {
        violations.push(`${label} → 404 route_not_found (fell through to the API catch-all)`);
        continue;
      }
      if (res.status === 0) {
        violations.push(`${label} → transport error: ${raw}`);
        continue;
      }
      // 500 = an unhandled crash. 502/503 are legitimate proxy/probe answers
      // (no upstreams configured, provider unreachable), 401/403/404/400/409/
      // 429 are all normal handler verdicts for a synthetic request.
      if (res.status === 500) {
        violations.push(`${label} → 500: ${raw.slice(0, 200).replace(/\n/g, ' ')}`);
      }
    }

    expect(probed).toBeGreaterThanOrEqual(routes.length - SKIP_EGRESS.size);
    expect(violations, `${violations.length} route(s) miswired:\n${violations.join('\n')}`).toEqual([]);
  }, 120_000);
});
