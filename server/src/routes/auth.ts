import { Router } from 'express';
<<<<<<< HEAD
import { ensureDefaultOrganization } from '../services/agent-tenancy.js';
import { acceptInvite, previewInvite, isInviteFailure } from '../services/agent-invites.js';
=======
>>>>>>> upstream/main
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  userCount,
  createUser,
  verifyCredentials,
<<<<<<< HEAD
  findUserByEmail,
=======
>>>>>>> upstream/main
  createSession,
  validateSession,
  deleteSession,
  updateEmail,
  updatePassword,
  resetUserPassword,
<<<<<<< HEAD
} from '../services/auth.js';
import {
  signupInputSchema,
  loginInputSchema,
  changeEmailInputSchema,
  changePasswordInputSchema,
  resetPasswordInputSchema,
} from '@freellmapi/shared/schemas.js';
=======
  normalizeEmail,
} from '../services/auth.js';
>>>>>>> upstream/main
import { setupCodeMatches, clearSetupCode } from '../lib/setup-code.js';
import { generateResetCode, resetCodeMatches, clearResetCode } from '../lib/reset-code.js';

export const authRouter = Router();

const failedPasswordAttempts = new Map<number, number>();

// Dashboard auth (#35). These routes are mounted BEFORE requireAuth, so
// /status, /setup and /login are reachable without a session (bootstrap);
// /logout and /me validate the token themselves.

<<<<<<< HEAD
=======
// Signing up is the one place the address has to look like an address.
const signupSchema = z.object({
  email: z.string().email('A valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// Logging in is a lookup, not a registration, so the address is matched rather
// than validated. The desktop app seeds its hidden account as
// `desktop@localhost` (server-host.ts), which has no TLD and so could never
// satisfy z.email() — every login attempt on a desktop install failed with
// "A valid email is required" before the password was even checked, including
// the reset-then-sign-in-from-a-browser route suggested in #807. Length rules
// belong to signup too: an account created under an older policy must still be
// able to get in.
const loginSchema = z.object({
  email: z.string().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
});

>>>>>>> upstream/main
// ── Brute-force throttle ──────────────────────────────────────────────────
// Simple in-memory per-email limiter. A local single-user tool doesn't need a
// distributed store; this just blunts online password guessing.
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
<<<<<<< HEAD
const attempts = new Map<string, { count: number; lockedUntil: number }>();

function isLockedOut(email: string): boolean {
  const a = attempts.get(email.toLowerCase());
  return !!a && a.lockedUntil > Date.now();
}
/** Seconds left on the per-email lockout — published as Retry-After so the
 *  dashboard can count the wait down instead of showing a frozen message. */
function lockoutRemainingSec(email: string): number {
  const a = attempts.get(email.toLowerCase());
  if (!a || a.lockedUntil <= Date.now()) return 1;
  return Math.max(1, Math.ceil((a.lockedUntil - Date.now()) / 1000));
}
function recordFailure(email: string): void {
  const key = email.toLowerCase();
=======
// Bound the map so a flood of distinct addresses cannot grow it without limit;
// expired buckets are pruned opportunistically, mirroring the per-IP limiter in
// middleware/rateLimit.ts.
const MAX_TRACKED_EMAILS = 10_000;
const attempts = new Map<string, { count: number; lockedUntil: number }>();

// The bucket key MUST be the same spelling verifyCredentials looks the user up
// by. Keying on `.toLowerCase()` alone while the lookup also trimmed meant
// " admin@example.com" authenticated against the admin row but landed in its
// own bucket, so every whitespace variant handed the guesser another five
// tries and the lockout never engaged.
function throttleKey(email: string): string {
  return normalizeEmail(email);
}
function isLockedOut(email: string): boolean {
  const a = attempts.get(throttleKey(email));
  return !!a && a.lockedUntil > Date.now();
}
// Seconds until the per-email lockout lifts (0 when not locked). The 429
// carries this as Retry-After so a client (or a scripted login retry loop)
// backs off for the ACTUAL remaining time instead of the worst-case 15 min.
function lockoutRetryAfterSec(email: string, now = Date.now()): number {
  const a = attempts.get(throttleKey(email));
  if (!a || a.lockedUntil <= now) return 0;
  return Math.max(1, Math.ceil((a.lockedUntil - now) / 1000));
}
function recordFailure(email: string): void {
  const key = throttleKey(email);
>>>>>>> upstream/main
  const a = attempts.get(key) ?? { count: 0, lockedUntil: 0 };
  a.count++;
  if (a.count >= MAX_ATTEMPTS) {
    a.lockedUntil = Date.now() + LOCKOUT_MS;
    a.count = 0;
  }
  attempts.set(key, a);
<<<<<<< HEAD
}
function clearFailures(email: string): void {
  attempts.delete(email.toLowerCase());
=======
  if (attempts.size > MAX_TRACKED_EMAILS) {
    const now = Date.now();
    for (const [tracked, state] of attempts) {
      if (tracked !== key && state.lockedUntil <= now) attempts.delete(tracked);
    }
  }
}
function clearFailures(email: string): void {
  attempts.delete(throttleKey(email));
>>>>>>> upstream/main
}

function bearer(req: Request): string | undefined {
  return req.headers.authorization?.replace(/^Bearer\s+/i, '')
    ?? (req.headers['x-dashboard-token'] as string | undefined);
}

<<<<<<< HEAD
// Is the caller connecting from the local machine? We check the actual socket
// peer address, NOT req.ip or X-Forwarded-For: those are attacker-controlled
// behind a proxy (and trust proxy is off by default anyway), so trusting them
// here would let a remote caller pretend to be local and skip the setup code.
function isLoopbackRemote(req: Request): boolean {
  let addr = req.socket.remoteAddress ?? '';
=======
function isLoopbackAddress(value: string | undefined): boolean {
  let addr = (value ?? '').trim();
>>>>>>> upstream/main
  // Node reports IPv4 loopback over a dual-stack socket as "::ffff:127.0.0.1".
  if (addr.startsWith('::ffff:')) addr = addr.slice(7);
  if (addr === '::1') return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(addr);
}

<<<<<<< HEAD
=======
// Is the caller connecting from the local machine? The socket peer address is
// the authority, NOT req.ip: forwarded headers are attacker-controlled, so
// letting one of them ASSERT locality would hand a remote caller the setup
// code exemption outright.
//
// But the socket peer alone is not sufficient either, because the reverse-proxy
// deployment this project documents (docs/en/proxy/OVERVIEW.md, and
// docs/en/troubleshooting/01-common-issues.md on TRUST_PROXY) puts Caddy/nginx/
// Traefik on the SAME host: every request then arrives from 127.0.0.1 and the
// socket test is true for the entire internet. So a forwarded hop can never
// grant locality, but it can withdraw it — exactly the treatment the Ollama
// open-loopback mode already applies in routes/ollama.ts:25-38.
function isLoopbackRemote(req: Request): boolean {
  if (!isLoopbackAddress(req.socket.remoteAddress)) return false;
  const forwarded = req.headers['x-forwarded-for'];
  const firstForwarded = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
    ?.split(',')[0];
  // A local reverse proxy is itself a loopback socket, but its first forwarded
  // hop may be remote. Refuse that request rather than silently widening the
  // no-code first-run path through the proxy.
  return !firstForwarded || isLoopbackAddress(firstForwarded);
}

>>>>>>> upstream/main
// Has the dashboard been set up yet, and is this caller authenticated?
authRouter.get('/status', (req: Request, res: Response) => {
  const session = validateSession(bearer(req));
  res.json({
    needsSetup: userCount() === 0,
    authenticated: !!session,
    email: session?.email ?? null,
  });
});

// First-run account creation. Only allowed while there are zero users, so it
// can't be used to add accounts once the dashboard is claimed.
authRouter.post('/setup', (req: Request, res: Response) => {
  if (userCount() > 0) {
    clearSetupCode();
    res.status(409).json({ error: { message: 'Setup already completed. Use login instead.', type: 'setup_complete' } });
    return;
  }

  // Local/desktop first-run stays frictionless: a browser on this machine can
  // claim the dashboard without any code. A remote caller must present the
  // one-time setup code logged at boot, so an exposed fresh install can't be
  // claimed by a stranger who finds it first.
  if (!isLoopbackRemote(req) && !setupCodeMatches((req.body ?? {}).setupCode)) {
    res.status(403).json({
      error: {
        message: 'A setup code is required to create the first account from a remote device. ' +
          'Check the server logs for the code, or open the dashboard from a browser on the machine running FreeLLMAPI.',
        type: 'setup_code_required',
      },
    });
    return;
  }

<<<<<<< HEAD
  const parsed = signupInputSchema.safeParse(req.body);
=======
  const parsed = signupSchema.safeParse(req.body);
>>>>>>> upstream/main
  if (!parsed.success) {
    res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
    return;
  }
  const user = createUser(parsed.data.email, parsed.data.password);
<<<<<<< HEAD
  // Agent data is scoped to an organisation and project, so the first account
  // needs one or every agent call fails on a scope it has no way to create.
  ensureDefaultOrganization(user.userId);
=======
>>>>>>> upstream/main
  clearSetupCode(); // one-time: the dashboard is now claimed
  const token = createSession(user.userId);
  res.status(201).json({ token, email: user.email });
});

authRouter.post('/login', (req: Request, res: Response) => {
<<<<<<< HEAD
  const parsed = loginInputSchema.safeParse(req.body);
=======
  const parsed = loginSchema.safeParse(req.body);
>>>>>>> upstream/main
  if (!parsed.success) {
    res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
    return;
  }
  const { email, password } = parsed.data;

  if (isLockedOut(email)) {
<<<<<<< HEAD
    res.setHeader('Retry-After', String(lockoutRemainingSec(email)));
=======
    // RFC 6585: a 429 must say when the client may return. The whole gateway
    // already does this (proxy limiter, exhaustion Retry-After, monthly budget
    // cap); the dashboard's own lockout was the one 429 that didn't.
    res.setHeader('Retry-After', String(lockoutRetryAfterSec(email)));
>>>>>>> upstream/main
    res.status(429).json({ error: { message: 'Too many attempts. Wait 15 minutes or restart the app.', type: 'rate_limit_error' } });
    return;
  }

  const user = verifyCredentials(email, password);
  if (!user) {
    recordFailure(email);
    // Same message whether the email exists or not — don't leak which.
    res.status(401).json({ error: { message: 'Invalid email or password', type: 'authentication_error' } });
    return;
  }

  clearFailures(email);
  const token = createSession(user.userId);
  res.json({ token, email: user.email });
});

authRouter.post('/logout', (req: Request, res: Response) => {
  deleteSession(bearer(req));
  res.json({ success: true });
});

authRouter.get('/me', (req: Request, res: Response) => {
  const session = validateSession(bearer(req));
  if (!session) {
    res.status(401).json({ error: { message: 'Authentication required', type: 'authentication_error' } });
    return;
  }
  res.json({ email: session.email });
});

<<<<<<< HEAD
=======
// Change email (requires active session + current password)
const changeEmailSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newEmail: z.string().email('A valid email is required'),
});

>>>>>>> upstream/main
authRouter.post('/change-email', (req: Request, res: Response) => {
  const session = validateSession(bearer(req));
  if (!session) {
    res.status(401).json({ error: { message: 'Authentication required', type: 'authentication_error' } });
    return;
  }
<<<<<<< HEAD
  const parsed = changeEmailInputSchema.safeParse(req.body);
=======
  const parsed = changeEmailSchema.safeParse(req.body);
>>>>>>> upstream/main
  if (!parsed.success) {
    res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
    return;
  }
  try {
    const ok = updateEmail(session.userId, parsed.data.currentPassword, parsed.data.newEmail);
    if (!ok) {
      const attempts = (failedPasswordAttempts.get(session.userId) || 0) + 1;
      if (attempts >= 3) {
        deleteSession(bearer(req));
        failedPasswordAttempts.delete(session.userId);
        res.status(401).json({ error: { message: 'Too many incorrect attempts. You have been signed out.', type: 'authentication_error' } });
        return;
      }
      failedPasswordAttempts.set(session.userId, attempts);
      res.status(403).json({ error: { message: 'Current password is incorrect', type: 'invalid_password' } });
      return;
    }
    failedPasswordAttempts.delete(session.userId);
    res.json({ success: true, email: parsed.data.newEmail.trim().toLowerCase() });
  } catch (err: any) {
    if (err.code === 'email_taken') {
      res.status(409).json({ error: { message: err.message, type: 'email_taken' } });
    } else {
      throw err;
    }
  }
});

<<<<<<< HEAD
=======
// Change password (requires active session + current password)
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

>>>>>>> upstream/main
authRouter.post('/change-password', (req: Request, res: Response) => {
  const session = validateSession(bearer(req));
  if (!session) {
    res.status(401).json({ error: { message: 'Authentication required', type: 'authentication_error' } });
    return;
  }
<<<<<<< HEAD
  const parsed = changePasswordInputSchema.safeParse(req.body);
=======
  const parsed = changePasswordSchema.safeParse(req.body);
>>>>>>> upstream/main
  if (!parsed.success) {
    res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
    return;
  }
  const ok = updatePassword(session.userId, parsed.data.currentPassword, parsed.data.newPassword);
  if (!ok) {
    const attempts = (failedPasswordAttempts.get(session.userId) || 0) + 1;
    if (attempts >= 3) {
      deleteSession(bearer(req));
      failedPasswordAttempts.delete(session.userId);
      res.status(401).json({ error: { message: 'Too many incorrect attempts. You have been signed out.', type: 'authentication_error' } });
      return;
    }
    failedPasswordAttempts.set(session.userId, attempts);
    res.status(403).json({ error: { message: 'Current password is incorrect', type: 'invalid_password' } });
    return;
  }
  failedPasswordAttempts.delete(session.userId);
  res.json({ success: true });
});

// Forgot password: mint a reset code and log it
const RESET_CODE_MIN_INTERVAL_MS = 10_000;
let lastResetCodeAt = 0;
authRouter.post('/forgot-password', (_req: Request, res: Response) => {
  // Always respond 200 regardless of account existence to avoid user enumeration.
  if (userCount() === 0) {
    res.json({ success: true });
    return;
  }
  const now = Date.now();
  if (now - lastResetCodeAt < RESET_CODE_MIN_INTERVAL_MS) {
<<<<<<< HEAD
    const waitSec = Math.max(1, Math.ceil((lastResetCodeAt + RESET_CODE_MIN_INTERVAL_MS - now) / 1000));
    res.setHeader('Retry-After', String(waitSec));
=======
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((RESET_CODE_MIN_INTERVAL_MS - (now - lastResetCodeAt)) / 1000))));
>>>>>>> upstream/main
    res.status(429).json({ error: { message: 'Too many reset-code requests. Try again later.', type: 'rate_limit_error' } });
    return;
  }
  lastResetCodeAt = now;
  generateResetCode();
  res.json({ success: true });
});

<<<<<<< HEAD
authRouter.post('/reset-password', (req: Request, res: Response) => {
  const parsed = resetPasswordInputSchema.safeParse(req.body);
=======
// Reset password: accept the logged code + new password
const resetPasswordSchema = z.object({
  resetCode: z.string().min(1, 'Reset code is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

authRouter.post('/reset-password', (req: Request, res: Response) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
>>>>>>> upstream/main
  if (!parsed.success) {
    res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
    return;
  }
  if (!resetCodeMatches(parsed.data.resetCode)) {
    res.status(403).json({ error: { message: 'Invalid or expired reset code', type: 'authentication_error' } });
    return;
  }
  const ok = resetUserPassword(parsed.data.newPassword);
  if (!ok) {
    res.status(404).json({ error: { message: 'No account found', type: 'not_found' } });
    return;
  }
  clearResetCode();
  res.json({ success: true });
});
<<<<<<< HEAD

/**
 * POST /api/auth/accept-invite — redeem an invite and get an account.
 *
 * There is no open registration route, by design: an install is claimed once
 * at setup. An invite is the only way a second account can exist, so this
 * endpoint does double duty — it creates the user *and* joins them, in one
 * transaction, because an account created without the membership it was issued
 * for would be a stranded login on a single-user product.
 *
 * It is unauthenticated because the invitee has no account yet. The token is
 * the authorisation, which is why it is single-use, expiring, bound to one
 * email address, and stored only as a hash.
 */
authRouter.post('/accept-invite', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (token === '') {
    res.status(400).json({ error: { message: '"token" is required', type: 'invalid_request_error' } });
    return;
  }

  const preview = previewInvite(token);
  if (preview === null) {
    // One answer for wrong, used and expired, so this cannot probe tokens.
    res.status(404).json({ error: { message: 'That invite is not valid', type: 'not_found' } });
    return;
  }

  const existing = findUserByEmail(preview.email);
  let userId: number;

  if (existing) {
    // The address already has an account, so joining requires proving it is
    // theirs. Otherwise a leaked token would add an attacker's session to
    // someone else's organisation.
    const password = typeof body.password === 'string' ? body.password : '';
    if (!verifyCredentials(preview.email, password)) {
      res.status(403).json({
        error: { message: 'That address already has an account — sign in to accept', type: 'authentication_error' },
      });
      return;
    }
    userId = existing.userId;
  } else {
    const parsed = z.object({ password: z.string().min(8, 'Password must be at least 8 characters') })
      .safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
      return;
    }
    userId = createUser(preview.email, parsed.data.password).userId;
  }

  const result = acceptInvite({ token, userId, userEmail: preview.email });
  if (isInviteFailure(result)) {
    res.status(result.status).json({ error: { message: result.message, type: 'invalid_request_error' } });
    return;
  }

  res.status(201).json({
    token: createSession(userId),
    email: preview.email,
    organizationId: result.organizationId,
    role: result.role,
  });
});
=======
>>>>>>> upstream/main
