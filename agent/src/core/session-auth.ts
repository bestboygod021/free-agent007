/**
 * Signed session-token boundary for the API.
 *
 * This is not a password login flow. The platform never receives or stores a
 * raw password here. An upstream OAuth/OIDC/MFA service creates a short-lived
 * session, and this module signs a reference to that session. Production must
 * keep the signing secret in KMS/HSM and should provide `lookupSession` so
 * revocation and idle timeout are enforced server-side.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

import {
  checkSession,
  issueSession,
  type Principal,
  type Role,
  type Session,
} from "./security-baseline.js";
import type { PlatformSettings } from "./platform-settings.js";

const TOKEN_VERSION = 1;
const TOKEN_PREFIX = "fp1";
const MIN_SECRET_BYTES = 32;
const DEFAULT_MAX_LIFETIME_MS = 15 * 60_000;
const CLOCK_SKEW_MS = 30_000;
const ROLES: readonly Role[] = ["owner", "admin", "developer", "viewer", "agent"];

export interface AuthTokenClaims {
  v: 1;
  sid: string;
  sub: string;
  org: string;
  role: Role;
  project?: string;
  iat: number;
  exp: number;
  mfaAt?: number;
}

export interface IssueBearerTokenParams {
  sessionId: string;
  userId: string;
  organizationId: string;
  role: Role;
  projectId?: string;
  mfaVerifiedAt?: number;
  issuedAt: number;
  expiresAt: number;
  secret: string | Buffer;
}

export interface AuthSessionRecord {
  session: Session;
  role: Role;
  projectId?: string;
}

export interface BearerAuthenticatorOptions {
  secret: string | Buffer;
  settings: PlatformSettings;
  /** If supplied, revocation and idle timeout are checked on every request. */
  lookupSession?: (sessionId: string) => AuthSessionRecord | undefined;
  now?: () => number;
  maxLifetimeMs?: number;
}

export class SessionAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionAuthError";
  }
}

function secretBytes(secret: string | Buffer): Buffer {
  const bytes = Buffer.isBuffer(secret) ? secret : Buffer.from(secret, "utf8");
  if (bytes.length < MIN_SECRET_BYTES) {
    throw new SessionAuthError(`session signing secret must be at least ${MIN_SECRET_BYTES} bytes`);
  }
  return bytes;
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signature(input: string, secret: string | Buffer): string {
  return createHmac("sha256", secretBytes(secret)).update(input).digest("base64url");
}

function claimsPayload(claims: AuthTokenClaims): string {
  return encode(JSON.stringify(claims));
}

function validateIdentity(value: string, label: string): void {
  if (!value || value.length > 256 || /[\r\n]/.test(value)) {
    throw new SessionAuthError(`${label} is invalid`);
  }
}

function validateClaims(claims: AuthTokenClaims, now: number, maxLifetimeMs: number): void {
  if (claims.v !== TOKEN_VERSION) throw new SessionAuthError("unsupported session token version");
  validateIdentity(claims.sid, "session id");
  validateIdentity(claims.sub, "user id");
  validateIdentity(claims.org, "organization id");
  if (!ROLES.includes(claims.role)) throw new SessionAuthError("invalid role in session token");
  if (claims.project !== undefined) validateIdentity(claims.project, "project id");
  if (!Number.isInteger(claims.iat) || !Number.isInteger(claims.exp)) {
    throw new SessionAuthError("session timestamps must be integers");
  }
  if (claims.exp <= claims.iat || claims.exp - claims.iat > maxLifetimeMs) {
    throw new SessionAuthError("session token lifetime is invalid");
  }
  if (claims.iat - now > CLOCK_SKEW_MS) throw new SessionAuthError("session token is from the future");
  if (now >= claims.exp) throw new SessionAuthError("session token is expired");
  if (claims.mfaAt !== undefined && !Number.isInteger(claims.mfaAt)) {
    throw new SessionAuthError("mfa timestamp must be an integer");
  }
}

export function issueBearerToken(params: IssueBearerTokenParams): string {
  const claims: AuthTokenClaims = {
    v: TOKEN_VERSION,
    sid: params.sessionId,
    sub: params.userId,
    org: params.organizationId,
    role: params.role,
    ...(params.projectId ? { project: params.projectId } : {}),
    iat: params.issuedAt,
    exp: params.expiresAt,
    ...(params.mfaVerifiedAt === undefined ? {} : { mfaAt: params.mfaVerifiedAt }),
  };
  validateClaims(claims, params.issuedAt, DEFAULT_MAX_LIFETIME_MS);
  const payload = claimsPayload(claims);
  return `${TOKEN_PREFIX}.${payload}.${signature(`${TOKEN_PREFIX}.${payload}`, params.secret)}`;
}

export function verifyBearerToken(params: {
  token: string;
  secret: string | Buffer;
  now?: number;
  maxLifetimeMs?: number;
}): AuthTokenClaims {
  const now = params.now ?? Date.now();
  const maxLifetimeMs = params.maxLifetimeMs ?? DEFAULT_MAX_LIFETIME_MS;
  const parts = params.token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX || !parts[1] || !parts[2]) {
    throw new SessionAuthError("malformed session token");
  }
  const signed = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(signature(signed, params.secret), "utf8");
  const received = Buffer.from(parts[2], "utf8");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new SessionAuthError("invalid session token signature");
  }
  let claims: AuthTokenClaims;
  try {
    claims = JSON.parse(decode(parts[1])) as AuthTokenClaims;
  } catch {
    throw new SessionAuthError("invalid session token payload");
  }
  validateClaims(claims, now, maxLifetimeMs);
  return claims;
}

export function principalFromClaims(claims: AuthTokenClaims): Principal {
  return {
    userId: claims.sub,
    organizationId: claims.org,
    role: claims.role,
    ...(claims.project ? { projectId: claims.project } : {}),
    ...(claims.mfaAt === undefined ? {} : { mfaVerifiedAt: claims.mfaAt }),
  };
}

export function createBearerAuthenticator(options: BearerAuthenticatorOptions): (request: IncomingMessage) => Promise<Principal | undefined> {
  const now = options.now ?? (() => Date.now());
  return async (request) => {
    const header = request.headers.authorization;
    if (!header || !/^Bearer\s+\S+$/i.test(header)) return undefined;
    const token = header.replace(/^Bearer\s+/i, "");
    try {
      const claims = verifyBearerToken({
        token,
        secret: options.secret,
        now: now(),
        maxLifetimeMs: options.maxLifetimeMs,
      });
      if (!options.lookupSession) return principalFromClaims(claims);
      const record = options.lookupSession(claims.sid);
      if (!record) return undefined;
      const verdict = checkSession(record.session, options.settings, now());
      if (!verdict.ok) return undefined;
      if (record.session.userId !== claims.sub || record.session.organizationId !== claims.org) return undefined;
      return {
        userId: record.session.userId,
        organizationId: record.session.organizationId,
        role: record.role,
        ...(record.projectId ? { projectId: record.projectId } : {}),
        ...(verdict.session.mfaVerifiedAt === undefined ? {} : { mfaVerifiedAt: verdict.session.mfaVerifiedAt }),
      };
    } catch {
      return undefined;
    }
  };
}

/** Reference session registry; persistence and KMS-backed secrets belong to the adapter layer. */
export class InMemoryAuthSessionStore {
  private readonly sessions = new Map<string, AuthSessionRecord>();

  issue(params: {
    sessionId: string;
    userId: string;
    organizationId: string;
    role: Role;
    projectId?: string;
    mfaVerifiedAt?: number;
    now: number;
  }): AuthSessionRecord {
    const session = issueSession({
      sessionId: params.sessionId,
      userId: params.userId,
      organizationId: params.organizationId,
      ...(params.mfaVerifiedAt === undefined ? {} : { mfaVerifiedAt: params.mfaVerifiedAt }),
      now: params.now,
    });
    const record: AuthSessionRecord = {
      session,
      role: params.role,
      ...(params.projectId ? { projectId: params.projectId } : {}),
    };
    this.sessions.set(params.sessionId, structuredClone(record));
    return structuredClone(record);
  }

  get(sessionId: string): AuthSessionRecord | undefined {
    const record = this.sessions.get(sessionId);
    return record ? structuredClone(record) : undefined;
  }

  revoke(sessionId: string, now: number): void {
    const record = this.sessions.get(sessionId);
    if (!record) return;
    record.session.revokedAt = now;
    this.sessions.set(sessionId, record);
  }
}
