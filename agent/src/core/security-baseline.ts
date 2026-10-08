import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { PlatformSettings } from "./platform-settings.js";

/**
 * Security baseline.
 *
 * World-class security is not a document; it is a set of decisions the system
 * cannot get wrong even when the caller tries. Everything here is deterministic,
 * dependency-free and unit-testable, and every control is traceable to a
 * STRIDE threat in `docs/19-security-standard.md`.
 *
 * Threat model summary (full version in the doc):
 *
 *   S — Spoofing          → signed sessions, MFA for approvals, lockout
 *   T — Tampering         → hash-chained audit log, webhook signatures
 *   R — Repudiation       → append-only audit with actor + reason + settings hash
 *   I — Information disc. → redaction, egress wall, tenant scoping
 *   D — Denial of service → token-bucket rate limits, quotas, hard token stop
 *   E — Elevation         → RBAC, autonomy ceiling, protected refs, approval
 */

// ── identity and authorisation ──────────────────────────────────────────────

export type Role = "owner" | "admin" | "developer" | "viewer" | "agent";

export type Permission =
  | "run.create"
  | "run.cancel"
  | "approval.grant"
  | "deploy.approve"
  | "settings.read"
  | "settings.write.org"
  | "settings.write.project"
  | "connector.add"
  | "connector.remove"
  | "secret.read"
  | "audit.read"
  | "member.invite"
  | "member.remove"
  | "org.delete";

/**
 * The permission matrix. Note what `agent` can do: almost nothing. An agent is
 * a service principal that acts *on behalf of* a user inside a run, and every
 * sensitive action still requires that user's approval.
 */
export const PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: [
    "run.create", "run.cancel", "approval.grant", "deploy.approve", "settings.read",
    "settings.write.org", "settings.write.project", "connector.add", "connector.remove",
    "secret.read", "audit.read", "member.invite", "member.remove", "org.delete",
  ],
  admin: [
    "run.create", "run.cancel", "approval.grant", "deploy.approve", "settings.read",
    "settings.write.org", "settings.write.project", "connector.add", "connector.remove",
    "audit.read", "member.invite", "member.remove",
  ],
  developer: [
    "run.create", "run.cancel", "approval.grant", "deploy.approve", "settings.read",
    "settings.write.project", "connector.add", "audit.read",
  ],
  viewer: ["settings.read", "audit.read"],
  agent: ["run.create"],
};

export interface Principal {
  userId: string;
  organizationId: string;
  role: Role;
  /** project the principal is acting in; required for project-scoped actions */
  projectId?: string;
  mfaVerifiedAt?: number;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason: string;
  /** present when the action needs MFA the principal has not proved */
  requiresMfa?: boolean;
}

const MFA_PROTECTED: readonly Permission[] = ["approval.grant", "deploy.approve", "org.delete", "secret.read"];

export function authorize(
  principal: Principal,
  permission: Permission,
  settings: PlatformSettings,
  now = Date.now(),
): AuthorizationDecision {
  const granted = PERMISSIONS[principal.role];
  if (!granted.includes(permission)) {
    return {
      allowed: false,
      reason: `role "${principal.role}" does not hold "${permission}"`,
    };
  }
  if (MFA_PROTECTED.includes(permission)) {
    const fresh =
      principal.mfaVerifiedAt !== undefined &&
      now - principal.mfaVerifiedAt <= settings.security.sessionTtlMinutes * 60_000;
    if (settings.security.requireMfaForApproval && !fresh) {
      return {
        allowed: false,
        requiresMfa: true,
        reason: `"${permission}" requires a fresh MFA verification`,
      };
    }
  }
  if (permission.startsWith("settings.write.project") && !principal.projectId) {
    return { allowed: false, reason: "project-scoped write requires a projectId" };
  }
  return { allowed: true, reason: "permitted" };
}

/**
 * Approvals granted by the agent that performed the work are worthless. This is
 * the single most important authorisation rule in the product.
 */
export function validateApproval(params: {
  approverUserId: string;
  requestingUserId: string;
  approvedByAgent: boolean;
  approverMfaAt?: number;
  settings: PlatformSettings;
  now?: number;
}): { valid: boolean; reason: string } {
  const now = params.now ?? Date.now();
  if (params.approvedByAgent) {
    return { valid: false, reason: "an agent cannot approve its own action" };
  }
  if (params.approverUserId === params.requestingUserId) {
    return { valid: false, reason: "the requester cannot approve their own request" };
  }
  if (
    params.settings.security.requireMfaForApproval &&
    (params.approverMfaAt === undefined || now - params.approverMfaAt > 15 * 60_000)
  ) {
    return { valid: false, reason: "approval requires MFA verified within the last 15 minutes" };
  }
  return { valid: true, reason: "approval is valid" };
}

// ── sessions ────────────────────────────────────────────────────────────────

export interface Session {
  sessionId: string;
  userId: string;
  organizationId: string;
  issuedAt: number;
  lastSeenAt: number;
  mfaVerifiedAt?: number;
  revokedAt?: number;
}

export const SESSION_COOKIE_FLAGS = [
  "HttpOnly",
  "Secure",
  "SameSite=Strict",
  "Path=/",
] as const;

export type SessionVerdict =
  | { ok: true; session: Session }
  | { ok: false; reason: "expired" | "idle" | "revoked" | "unknown" };

export function issueSession(params: {
  sessionId: string;
  userId: string;
  organizationId: string;
  mfaVerifiedAt?: number;
  now?: number;
}): Session {
  const now = params.now ?? Date.now();
  return {
    sessionId: params.sessionId,
    userId: params.userId,
    organizationId: params.organizationId,
    issuedAt: now,
    lastSeenAt: now,
    mfaVerifiedAt: params.mfaVerifiedAt,
  };
}

export function checkSession(
  session: Session | undefined,
  settings: PlatformSettings,
  now = Date.now(),
): SessionVerdict {
  if (!session) return { ok: false, reason: "unknown" };
  if (session.revokedAt !== undefined) return { ok: false, reason: "revoked" };
  if (now - session.issuedAt > settings.security.sessionTtlMinutes * 60_000) {
    return { ok: false, reason: "expired" };
  }
  if (now - session.lastSeenAt > settings.security.sessionIdleTimeoutMinutes * 60_000) {
    return { ok: false, reason: "idle" };
  }
  return { ok: true, session: { ...session, lastSeenAt: now } };
}

// ── login throttling ────────────────────────────────────────────────────────

export interface LoginAttemptState {
  identifier: string;
  failures: number;
  lockedUntil: number;
}

export function recordLoginFailure(
  state: LoginAttemptState | undefined,
  identifier: string,
  settings: PlatformSettings,
  now = Date.now(),
): { state: LoginAttemptState; locked: boolean } {
  const failures = (state?.failures ?? 0) + 1;
  const locked = failures >= settings.security.maxFailedLogins;
  return {
    state: {
      identifier,
      failures: locked ? 0 : failures,
      lockedUntil: locked ? now + settings.security.lockoutMinutes * 60_000 : 0,
    },
    locked,
  };
}

export function isLockedOut(state: LoginAttemptState | undefined, now = Date.now()): boolean {
  return Boolean(state && state.lockedUntil > now);
}

// ── rate limiting ───────────────────────────────────────────────────────────

export interface RateBucket {
  key: string;
  tokens: number;
  updatedAt: number;
}

export interface RateDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  /** headers a compliant API must return */
  headers: { "X-RateLimit-Limit": string; "X-RateLimit-Remaining": string; "Retry-After"?: string };
}

/** Token bucket. `capacity` refills at `refillPerSecond`. */
export function consumeRate(
  bucket: RateBucket | undefined,
  params: { key: string; capacity: number; refillPerSecond: number; cost?: number; now?: number },
): { decision: RateDecision; bucket: RateBucket } {
  const now = params.now ?? Date.now();
  const cost = params.cost ?? 1;
  const elapsedSeconds = bucket ? Math.max(0, (now - bucket.updatedAt) / 1000) : 0;
  const tokens = Math.min(
    params.capacity,
    (bucket?.tokens ?? params.capacity) + elapsedSeconds * params.refillPerSecond,
  );

  const headers = {
    "X-RateLimit-Limit": String(params.capacity),
    "X-RateLimit-Remaining": String(Math.max(0, Math.floor(tokens - cost))),
  };

  if (tokens < cost) {
    const deficit = cost - tokens;
    const retryAfterSeconds = Math.ceil(deficit / params.refillPerSecond);
    return {
      decision: {
        allowed: false,
        remaining: Math.max(0, Math.floor(tokens)),
        retryAfterSeconds,
        headers: { ...headers, "Retry-After": String(retryAfterSeconds) },
      },
      bucket: { key: params.key, tokens, updatedAt: now },
    };
  }

  const next = tokens - cost;
  return {
    decision: { allowed: true, remaining: Math.floor(next), retryAfterSeconds: 0, headers },
    bucket: { key: params.key, tokens: next, updatedAt: now },
  };
}

// ── idempotency ─────────────────────────────────────────────────────────────

export interface IdempotencyRecord {
  key: string;
  organizationId: string;
  requestHash: string;
  createdAt: number;
  responseRef?: string;
}

export type IdempotencyVerdict =
  | { kind: "new" }
  | { kind: "replay"; responseRef?: string }
  | { kind: "conflict"; reason: string };

/**
 * Same key + same body = replay the stored response.
 * Same key + different body = a client bug, and must be a loud 409, never a
 * silent second execution.
 */
export function checkIdempotency(
  existing: IdempotencyRecord | undefined,
  params: { key: string; organizationId: string; requestHash: string },
): IdempotencyVerdict {
  if (!existing) return { kind: "new" };
  if (existing.organizationId !== params.organizationId) {
    return { kind: "conflict", reason: "idempotency key belongs to another organization" };
  }
  if (existing.requestHash !== params.requestHash) {
    return {
      kind: "conflict",
      reason: "idempotency key was reused with a different request body",
    };
  }
  return { kind: "replay", responseRef: existing.responseRef };
}

export function hashRequest(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

// ── tenant isolation ────────────────────────────────────────────────────────

/**
 * Every row read or written must carry the caller's organization. This helper
 * exists so the check is one call at the data layer rather than a habit.
 */
export function assertSameOrganization(
  caller: { organizationId: string },
  row: { organizationId: string } | undefined,
  label = "row",
): void {
  if (!row) throw new Error(`${label} not found`);
  if (row.organizationId !== caller.organizationId) {
    throw new Error(
      `tenant isolation violation: ${label} belongs to another organization`,
    );
  }
}

// ── transport hardening ─────────────────────────────────────────────────────

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cache-Control": "no-store",
};

export interface CsrfDecision {
  allowed: boolean;
  reason: string;
}

/** Double-submit cookie check: the header must match the cookie, constant-time. */
export function verifyCsrf(params: {
  cookieToken: string | undefined;
  headerToken: string | undefined;
  method: string;
  sameSiteStrict: boolean;
}): CsrfDecision {
  const safe = ["GET", "HEAD", "OPTIONS"].includes(params.method.toUpperCase());
  if (safe) return { allowed: true, reason: "safe method" };
  if (!params.sameSiteStrict) {
    return { allowed: false, reason: "session cookie must be SameSite=Strict" };
  }
  const { cookieToken, headerToken } = params;
  if (!cookieToken || !headerToken) {
    return { allowed: false, reason: "missing CSRF token" };
  }
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { allowed: false, reason: "CSRF token mismatch" };
  }
  return { allowed: true, reason: "token matched" };
}

/** Webhook signatures, verified in constant time with a bounded timestamp skew. */
export function signWebhook(payload: string, secret: string, timestamp: number): string {
  return `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")}`;
}

export function verifyWebhook(params: {
  payload: string;
  signature: string | undefined;
  secret: string;
  now?: number;
  maxSkewSeconds?: number;
}): { valid: boolean; reason: string } {
  const now = params.now ?? Date.now();
  const maxSkew = (params.maxSkewSeconds ?? 300) * 1000;
  if (!params.signature) return { valid: false, reason: "missing signature" };
  const match = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(params.signature);
  if (!match) return { valid: false, reason: "malformed signature header" };
  const timestamp = Number(match[1]);
  if (Math.abs(now - timestamp) > maxSkew) {
    return { valid: false, reason: "signature timestamp outside the allowed skew" };
  }
  const expected = createHmac("sha256", params.secret)
    .update(`${timestamp}.${params.payload}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(match[2] as string);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: "signature mismatch" };
  }
  return { valid: true, reason: "signature verified" };
}

// ── audit log ───────────────────────────────────────────────────────────────

export interface AuditEntry {
  seq: number;
  at: number;
  actorUserId: string;
  actorRole: Role;
  organizationId: string;
  action: string;
  target: string;
  outcome: "allowed" | "denied" | "error";
  reason: string;
  /** effective settings at the time, so a decision can be replayed */
  settingsHash: string;
  ipAddress?: string;
  /** sha256 of the previous entry's hash + this entry's body */
  prevHash: string;
  hash: string;
}

export const GENESIS_HASH = "0".repeat(64);

export function auditEntryHash(entry: Omit<AuditEntry, "hash">): string {
  const canonical = JSON.stringify({
    seq: entry.seq,
    at: entry.at,
    actorUserId: entry.actorUserId,
    actorRole: entry.actorRole,
    organizationId: entry.organizationId,
    action: entry.action,
    target: entry.target,
    outcome: entry.outcome,
    reason: entry.reason,
    settingsHash: entry.settingsHash,
    ipAddress: entry.ipAddress ?? null,
    prevHash: entry.prevHash,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Append-only, hash-chained: editing any entry breaks every hash after it. */
export function appendAudit(
  chain: readonly AuditEntry[],
  entry: Omit<AuditEntry, "seq" | "prevHash" | "hash">,
): AuditEntry[] {
  const prev = chain[chain.length - 1];
  const prevHash = prev ? prev.hash : GENESIS_HASH;
  const partial = { ...entry, seq: chain.length + 1, prevHash };
  const hash = auditEntryHash(partial);
  return [...chain, { ...partial, hash }];
}

export interface ChainVerification {
  valid: boolean;
  brokenAtSeq: number | null;
  reason: string;
}

export function verifyAuditChain(chain: readonly AuditEntry[]): ChainVerification {
  let prevHash = GENESIS_HASH;
  for (const entry of chain) {
    if (entry.prevHash !== prevHash) {
      return {
        valid: false,
        brokenAtSeq: entry.seq,
        reason: `entry ${entry.seq} does not link to the previous hash`,
      };
    }
    const recomputed = auditEntryHash({ ...entry, hash: "" } as Omit<AuditEntry, "hash">);
    if (recomputed !== entry.hash) {
      return { valid: false, brokenAtSeq: entry.seq, reason: `entry ${entry.seq} was modified` };
    }
    prevHash = entry.hash;
  }
  return { valid: true, brokenAtSeq: null, reason: "chain intact" };
}

// ── secrets ─────────────────────────────────────────────────────────────────

/**
 * Secrets are referenced, never stored. This is the shape the data layer must
 * use; a raw password has no representation in the system at all.
 */
export interface SecretReference {
  kind: "vault" | "env" | "oauth_token";
  /** opaque locator; never the secret */
  ref: string;
  createdAt: number;
  rotatedAt?: number;
  /** ISO date; secrets without a rotation date are a finding */
  expiresAt?: string;
}

export const FORBIDDEN_CREDENTIAL_FIELDS: readonly string[] = [
  "password",
  "passwd",
  "rawPassword",
  "userPassword",
  "accountPassword",
];

/** Reject any payload that tries to smuggle a raw credential in. */
export function findRawCredentials(payload: unknown, path = "$"): string[] {
  const found: string[] = [];
  if (payload === null || typeof payload !== "object") return found;
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    const here = `${path}.${key}`;
    if (FORBIDDEN_CREDENTIAL_FIELDS.some((f) => f.toLowerCase() === key.toLowerCase())) {
      found.push(here);
    }
    found.push(...findRawCredentials(value, here));
  }
  return found;
}

export function secretRotationOverdue(
  ref: SecretReference,
  now = Date.now(),
  maxAgeDays = 90,
): boolean {
  const last = ref.rotatedAt ?? ref.createdAt;
  return now - last > maxAgeDays * 86_400_000;
}

// ── threat register ─────────────────────────────────────────────────────────

export interface ThreatControl {
  id: string;
  stride: "S" | "T" | "R" | "I" | "D" | "E";
  threat: string;
  control: string;
  /** the function or test that proves the control works */
  enforcedBy: string;
}

export const THREAT_REGISTER: readonly ThreatControl[] = [
  {
    id: "THR-S1",
    stride: "S",
    threat: "Session hijacking or replay after logout",
    control: "HttpOnly + Secure + SameSite=Strict cookie, absolute TTL and idle timeout, revocation list",
    enforcedBy: "checkSession / SESSION_COOKIE_FLAGS",
  },
  {
    id: "THR-S2",
    stride: "S",
    threat: "Credential stuffing against the login endpoint",
    control: "per-identifier failure counter with lockout, minimum 5 attempts / 15 minutes",
    enforcedBy: "recordLoginFailure / isLockedOut",
  },
  {
    id: "THR-S3",
    stride: "S",
    threat: "Approval performed without the user present",
    control: "MFA freshness window for every approval-class permission",
    enforcedBy: "authorize / validateApproval",
  },
  {
    id: "THR-T1",
    stride: "T",
    threat: "Audit log edited or entries removed after an incident",
    control: "hash-chained append-only log; verification fails at the first altered entry",
    enforcedBy: "appendAudit / verifyAuditChain",
  },
  {
    id: "THR-T2",
    stride: "T",
    threat: "Forged or replayed inbound webhook",
    control: "HMAC-SHA256 signature over timestamp+body, constant-time compare, 300 s skew bound",
    enforcedBy: "verifyWebhook",
  },
  {
    id: "THR-T3",
    stride: "T",
    threat: "Idempotency key reused with a different body to double-execute",
    control: "request hash bound to the key; mismatch is a 409, never a second execution",
    enforcedBy: "checkIdempotency",
  },
  {
    id: "THR-R1",
    stride: "R",
    threat: "Actor denies having triggered a destructive action",
    control: "every decision logged with actor, role, outcome, reason and the settings hash in force",
    enforcedBy: "appendAudit + hashSettings",
  },
  {
    id: "THR-I1",
    stride: "I",
    threat: "Secret leaked into a model prompt or a log line",
    control: "redaction before egress, egress wall, block-on-unredacted setting",
    enforcedBy: "redactSecrets / evaluateEgress",
  },
  {
    id: "THR-I2",
    stride: "I",
    threat: "Cross-tenant read through a guessed identifier",
    control: "organizationId asserted on every row access; RLS as the second line",
    enforcedBy: "assertSameOrganization",
  },
  {
    id: "THR-I3",
    stride: "I",
    threat: "Raw third-party password stored in the database",
    control: "no field can hold one; payload scan rejects the key names outright",
    enforcedBy: "findRawCredentials / connecters.allowRawPasswordAuth",
  },
  {
    id: "THR-D1",
    stride: "D",
    threat: "Runaway agent loop exhausting the free tier or the budget",
    control: "token bucket per principal, token-aware quotas, hard token stop",
    enforcedBy: "consumeRate / tryAcquire",
  },
  {
    id: "THR-D2",
    stride: "D",
    threat: "Unbounded parallelism starving the worker pool",
    control: "monotonic maxParallelTasks ceiling that a project cannot raise",
    enforcedBy: "resolveSettings / checkRunAgainstSettings",
  },
  {
    id: "THR-E1",
    stride: "E",
    threat: "Agent escalates itself to write a protected branch or deploy",
    control: "agent role holds run.create only; protected refs hard-denied; deploy needs approval",
    enforcedBy: "PERMISSIONS / evaluateToolCall",
  },
  {
    id: "THR-E2",
    stride: "E",
    threat: "Project settings loosened to bypass an organization policy",
    control: "monotonic safety settings: lower scopes may tighten, never loosen",
    enforcedBy: "resolveSettings + MONOTONIC_RULES",
  },
  {
    id: "THR-E3",
    stride: "E",
    threat: "Cross-site request forgery against a state-changing endpoint",
    control: "SameSite=Strict plus double-submit token compared in constant time",
    enforcedBy: "verifyCsrf",
  },
];
