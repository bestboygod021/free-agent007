import { describe, expect, it } from "vitest";

import {
  resolveSettings,
  validatePatch,
  checkRunAgainstSettings,
  hashSettings,
  describeSettingsFa,
  DEFAULT_SETTINGS,
  IMMUTABLE_SETTINGS,
} from "../src/core/platform-settings.js";
import {
  authorize,
  validateApproval,
  PERMISSIONS,
  issueSession,
  checkSession,
  recordLoginFailure,
  isLockedOut,
  consumeRate,
  checkIdempotency,
  hashRequest,
  assertSameOrganization,
  verifyCsrf,
  signWebhook,
  verifyWebhook,
  appendAudit,
  verifyAuditChain,
  findRawCredentials,
  secretRotationOverdue,
  THREAT_REGISTER,
  SECURITY_HEADERS,
  SESSION_COOKIE_FLAGS,
} from "../src/core/security-baseline.js";
import type { PlatformSettings, SettingsPatch } from "../src/core/platform-settings.js";
import type { Principal, Session } from "../src/core/security-baseline.js";

const base = resolveSettings({}).settings;

const owner: Principal = {
  userId: "u_owner",
  organizationId: "org_1",
  role: "owner",
  projectId: "proj_1",
  mfaVerifiedAt: Date.now(),
};
const developer: Principal = { ...owner, userId: "u_dev", role: "developer" };
const viewer: Principal = { ...owner, userId: "u_view", role: "viewer" };
const agent: Principal = { userId: "agent_1", organizationId: "org_1", role: "agent", projectId: "proj_1" };

describe("role and permission matrix", () => {
  it("gives the agent almost nothing", () => {
    expect(PERMISSIONS.agent).toEqual(["run.create"]);
    for (const p of ["approval.grant", "deploy.approve", "secret.read", "org.delete"] as const) {
      expect(authorize(agent, p, base).allowed, p).toBe(false);
    }
  });

  it("keeps secret.read and org.delete to the owner", () => {
    expect(authorize(owner, "secret.read", base).allowed).toBe(true);
    expect(authorize(developer, "secret.read", base).allowed).toBe(false);
    expect(authorize(developer, "org.delete", base).allowed).toBe(false);
  });

  it("viewer can read but never change anything", () => {
    expect(authorize(viewer, "settings.read", base).allowed).toBe(true);
    expect(authorize(viewer, "run.create", base).allowed).toBe(false);
    expect(authorize(viewer, "settings.write.project", base).allowed).toBe(false);
  });

  it("requires a projectId for project-scoped writes", () => {
    const noProject: Principal = { ...developer, projectId: undefined };
    const decision = authorize(noProject, "settings.write.project", base);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/projectId/);
  });

  it("blocks MFA-protected actions without a fresh verification", () => {
    const stale: Principal = { ...owner, mfaVerifiedAt: Date.now() - 1000 * 60 * 60 * 24 };
    const decision = authorize(stale, "deploy.approve", base);
    expect(decision.allowed).toBe(false);
    expect(decision.requiresMfa).toBe(true);
  });
});

describe("approval integrity", () => {
  it("refuses an agent approving its own work", () => {
    const v = validateApproval({
      approverUserId: "u_owner",
      requestingUserId: "agent_1",
      approvedByAgent: true,
      approverMfaAt: Date.now(),
      settings: base,
    });
    expect(v.valid).toBe(false);
    expect(v.reason).toMatch(/cannot approve its own/);
  });

  it("refuses self-approval", () => {
    const v = validateApproval({
      approverUserId: "u_dev",
      requestingUserId: "u_dev",
      approvedByAgent: false,
      approverMfaAt: Date.now(),
      settings: base,
    });
    expect(v.valid).toBe(false);
  });

  it("refuses approval with a stale MFA", () => {
    const v = validateApproval({
      approverUserId: "u_owner",
      requestingUserId: "u_dev",
      approvedByAgent: false,
      approverMfaAt: Date.now() - 1000 * 60 * 60,
      settings: base,
    });
    expect(v.valid).toBe(false);
    expect(v.reason).toMatch(/MFA/);
  });

  it("accepts a proper second-person approval with fresh MFA", () => {
    expect(
      validateApproval({
        approverUserId: "u_owner",
        requestingUserId: "u_dev",
        approvedByAgent: false,
        approverMfaAt: Date.now() - 60_000,
        settings: base,
      }).valid,
    ).toBe(true);
  });
});

describe("sessions", () => {
  const session: Session = {
    sessionId: "s1",
    userId: "u_dev",
    organizationId: "org_1",
    issuedAt: 0,
    lastSeenAt: 0,
  };

  it("expires on the absolute TTL when the session stayed active", () => {
    const ttl = base.security.sessionTtlMinutes * 60_000;
    // lastSeenAt tracks the clock so only the absolute TTL can end it
    const active = (t: number): Session => ({ ...session, lastSeenAt: t });
    expect(checkSession(active(ttl - 1), base, ttl - 1).ok).toBe(true);
    expect(checkSession(active(ttl + 1), base, ttl + 1)).toEqual({ ok: false, reason: "expired" });
  });

  it("expires on idle timeout even inside the TTL", () => {
    const idle = base.security.sessionIdleTimeoutMinutes * 60_000;
    expect(checkSession(session, base, idle + 1)).toEqual({ ok: false, reason: "idle" });
  });

  it("rejects revoked and unknown sessions", () => {
    expect(checkSession({ ...session, revokedAt: 1 }, base, 1)).toEqual({ ok: false, reason: "revoked" });
    expect(checkSession(undefined, base, 1)).toEqual({ ok: false, reason: "unknown" });
  });

  it("cookie flags are the hardened set", () => {
    expect(SESSION_COOKIE_FLAGS).toContain("HttpOnly");
    expect(SESSION_COOKIE_FLAGS).toContain("Secure");
    expect(SESSION_COOKIE_FLAGS).toContain("SameSite=Strict");
  });
});

describe("login throttling", () => {
  it("locks out at the configured threshold and not before", () => {
    let state;
    const max = base.security.maxFailedLogins;
    for (let i = 1; i < max; i += 1) {
      const r = recordLoginFailure(state, "attacker", base);
      expect(r.locked, `attempt ${i}`).toBe(false);
      state = r.state;
    }
    const locked = recordLoginFailure(state, "attacker", base);
    expect(locked.locked).toBe(true);
    expect(isLockedOut(locked.state)).toBe(true);
    expect(isLockedOut(locked.state, Date.now() + (base.security.lockoutMinutes + 1) * 60_000)).toBe(false);
  });

  it("rejects a lockout threshold so low it becomes self-DoS", () => {
    const issues = validatePatch({ security: { maxFailedLogins: 1 } });
    expect(issues.some((i) => i.path === "security.maxFailedLogins")).toBe(true);
  });
});

describe("rate limiting", () => {
  it("drains the bucket and returns Retry-After", () => {
    let bucket;
    for (let i = 0; i < 5; i += 1) {
      bucket = consumeRate(bucket, { key: "u1", capacity: 5, refillPerSecond: 1 }).bucket;
    }
    const denied = consumeRate(bucket, { key: "u1", capacity: 5, refillPerSecond: 1 });
    expect(denied.decision.allowed).toBe(false);
    expect(denied.decision.retryAfterSeconds).toBeGreaterThan(0);
    expect(denied.decision.headers["Retry-After"]).toBeDefined();
  });

  it("refills over time", () => {
    let bucket = consumeRate(undefined, { key: "u2", capacity: 2, refillPerSecond: 1 }).bucket;
    bucket = consumeRate(bucket, { key: "u2", capacity: 2, refillPerSecond: 1 }).bucket;
    expect(consumeRate(bucket, { key: "u2", capacity: 2, refillPerSecond: 1 }).decision.allowed).toBe(false);
    const later = Date.now() + 2_000;
    expect(
      consumeRate(bucket, { key: "u2", capacity: 2, refillPerSecond: 1, now: later }).decision.allowed,
    ).toBe(true);
  });
});

describe("idempotency", () => {
  it("replays the same body and conflicts on a different one", () => {
    const body = { a: 1 };
    const hash = hashRequest(body);
    expect(checkIdempotency(undefined, { key: "k", organizationId: "org_1", requestHash: hash })).toEqual({ kind: "new" });
    const record = { key: "k", organizationId: "org_1", requestHash: hash, createdAt: 0, responseRef: "run_1" };
    expect(checkIdempotency(record, { key: "k", organizationId: "org_1", requestHash: hash })).toEqual({
      kind: "replay",
      responseRef: "run_1",
    });
    const conflict = checkIdempotency(record, {
      key: "k",
      organizationId: "org_1",
      requestHash: hashRequest({ a: 2 }),
    });
    expect(conflict.kind).toBe("conflict");
  });

  it("refuses to reuse another organization's key", () => {
    const record = { key: "k", organizationId: "org_other", requestHash: "h", createdAt: 0 };
    expect(
      checkIdempotency(record, { key: "k", organizationId: "org_1", requestHash: "h" }).kind,
    ).toBe("conflict");
  });
});

describe("tenant isolation", () => {
  it("throws on a cross-tenant row", () => {
    expect(() =>
      assertSameOrganization({ organizationId: "org_1" }, { organizationId: "org_2" }, "project"),
    ).toThrow(/tenant isolation/);
  });

  it("throws on a missing row rather than returning nothing", () => {
    expect(() => assertSameOrganization({ organizationId: "org_1" }, undefined, "project")).toThrow(
      /not found/,
    );
  });

  it("allows the same organization", () => {
    expect(() =>
      assertSameOrganization({ organizationId: "org_1" }, { organizationId: "org_1" }, "project"),
    ).not.toThrow();
  });
});

describe("transport hardening", () => {
  it("ships the hardened header set", () => {
    expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
    expect(SECURITY_HEADERS["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(SECURITY_HEADERS["Strict-Transport-Security"]).toContain("preload");
    // no inline scripts: the playground is served as a separate file for this reason
    expect(SECURITY_HEADERS["Content-Security-Policy"]).not.toContain("'unsafe-inline'");
  });

  it("rejects a mismatched CSRF token and accepts a match", () => {
    expect(
      verifyCsrf({ cookieToken: "abc", headerToken: "xyz", method: "POST", sameSiteStrict: true }).allowed,
    ).toBe(false);
    expect(
      verifyCsrf({ cookieToken: "abc", headerToken: "abc", method: "POST", sameSiteStrict: true }).allowed,
    ).toBe(true);
  });

  it("lets safe methods through but still demands SameSite", () => {
    expect(verifyCsrf({ cookieToken: undefined, headerToken: undefined, method: "GET", sameSiteStrict: true }).allowed).toBe(true);
    expect(
      verifyCsrf({ cookieToken: "a", headerToken: "a", method: "POST", sameSiteStrict: false }).reason,
    ).toMatch(/SameSite/);
  });

  it("verifies webhook signatures and rejects tampering, replay and skew", () => {
    const secret = "whsec_demo";
    const payload = '{"event":"push"}';
    const now = Date.now();
    const good = signWebhook(payload, secret, now);
    expect(verifyWebhook({ payload, signature: good, secret, now }).valid).toBe(true);
    expect(verifyWebhook({ payload: '{"event":"other"}', signature: good, secret, now }).valid).toBe(false);
    expect(
      verifyWebhook({ payload, signature: good, secret, now: now + 10 * 60_000 }).reason,
    ).toMatch(/skew/);
    expect(verifyWebhook({ payload, signature: undefined, secret, now }).valid).toBe(false);
    expect(verifyWebhook({ payload, signature: "t=abc,v1=zzz", secret, now }).reason).toMatch(/malformed/);
  });
});

describe("audit chain", () => {
  const entry = (action: string) => ({
    at: Date.now(),
    actorUserId: "u_dev",
    actorRole: "developer" as const,
    organizationId: "org_1",
    action,
    target: "x",
    outcome: "allowed" as const,
    reason: "ok",
    settingsHash: "abc",
  });

  it("verifies an intact chain", () => {
    let chain = appendAudit([], entry("a"));
    chain = appendAudit(chain, entry("b"));
    chain = appendAudit(chain, entry("c"));
    expect(verifyAuditChain(chain).valid).toBe(true);
    expect(chain).toHaveLength(3);
  });

  it("detects a modified entry and names the sequence number", () => {
    let chain = appendAudit([], entry("a"));
    chain = appendAudit(chain, entry("b"));
    chain = appendAudit(chain, entry("c"));
    const tampered = chain.map((e, i) => (i === 1 ? { ...e, reason: "rewritten" } : e));
    const result = verifyAuditChain(tampered);
    expect(result.valid).toBe(false);
    expect(result.brokenAtSeq).toBe(2);
  });

  it("detects a removed entry", () => {
    let chain = appendAudit([], entry("a"));
    chain = appendAudit(chain, entry("b"));
    chain = appendAudit(chain, entry("c"));
    const without = [chain[0]!, chain[2]!];
    expect(verifyAuditChain(without).valid).toBe(false);
  });
});

describe("secret handling", () => {
  it("finds raw credentials nested in a payload", () => {
    const found = findRawCredentials({
      connector: { type: "basic", password: "hunter2", user: "bob" },
      other: [{ rawPassword: "x" }],
    });
    expect(found).toContain("$.connector.password");
    expect(found).toContain("$.other.0.rawPassword");
    expect(found).toHaveLength(2);
  });

  it("ignores a bare field whose name merely contains the word", () => {
    expect(findRawCredentials({ passwordPolicy: "strong", note: "no secrets here" })).toEqual([]);
  });

  it("passes a payload that uses secret references", () => {
    expect(findRawCredentials({ connector: { auth: "oauth", secretRef: "vault://k" } })).toEqual([]);
  });

  it("flags secrets that have not been rotated", () => {
    const now = Date.now();
    expect(secretRotationOverdue({ kind: "vault", ref: "v", createdAt: now - 100 * 86_400_000 }, now, 90)).toBe(true);
    expect(secretRotationOverdue({ kind: "vault", ref: "v", createdAt: now - 10 * 86_400_000 }, now, 90)).toBe(false);
  });
});

describe("monotonic settings", () => {
  it("lets a project tighten a safety setting", () => {
    const r = resolveSettings({ project: { security: { autonomyCeiling: "readonly" } } });
    expect(r.settings.security.autonomyCeiling).toBe("readonly");
    expect(r.resolutions.find((x) => x.path === "security.autonomyCeiling")?.scope).toBe("project");
  });

  it("refuses a project loosening a safety setting, with a reason", () => {
    const r = resolveSettings({ project: { security: { autonomyCeiling: "full" } } });
    expect(r.settings.security.autonomyCeiling).toBe(DEFAULT_SETTINGS.security.autonomyCeiling);
    const res = r.resolutions.find((x) => x.path === "security.autonomyCeiling");
    expect(res?.refused?.requested).toBe("full");
    expect(res?.refused?.reason).toMatch(/more autonomy/);
  });

  it("refuses to switch off MFA, deploy approval or the Evidence Rule", () => {
    const r = resolveSettings({
      project: {
        security: { requireMfaForApproval: false, requireApprovalForDeploy: false, blockOnUnredactedSecrets: false },
        quality: { requireEvidenceForCompletion: false },
      },
    });
    expect(r.settings.security.requireMfaForApproval).toBe(true);
    expect(r.settings.security.requireApprovalForDeploy).toBe(true);
    expect(r.settings.security.blockOnUnredactedSecrets).toBe(true);
    expect(r.settings.quality.requireEvidenceForCompletion).toBe(true);
  });

  it("refuses to raise the token budget or the hard stop", () => {
    const r = resolveSettings({
      project: { execution: { perRunTokenBudget: 99_999_999, hardStopTokens: 99_999_999 } },
    });
    expect(r.settings.execution.perRunTokenBudget).toBe(DEFAULT_SETTINGS.execution.perRunTokenBudget);
    expect(r.settings.execution.hardStopTokens).toBe(DEFAULT_SETTINGS.execution.hardStopTokens);
  });

  it("lets a project lower the budget", () => {
    const r = resolveSettings({ project: { execution: { perRunTokenBudget: 10_000 } } });
    expect(r.settings.execution.perRunTokenBudget).toBe(10_000);
  });

  it("never allows raw password auth, in any scope", () => {
    for (const scope of ["platform", "organization", "project"] as const) {
      const r = resolveSettings({ [scope]: { connectors: { allowRawPasswordAuth: true } } });
      expect(r.settings.connectors.allowRawPasswordAuth, scope).toBe(false);
    }
    expect(IMMUTABLE_SETTINGS).toContain("connectors.allowRawPasswordAuth");
  });

  it("never allows audit log deletion or a retention window too short to investigate", () => {
    const r = resolveSettings({
      project: { retention: { allowAuditLogDeletion: true, auditLogRetentionDays: 1 } },
    });
    expect(r.settings.retention.allowAuditLogDeletion).toBe(false);
    expect(r.settings.retention.auditLogRetentionDays).toBe(DEFAULT_SETTINGS.retention.auditLogRetentionDays);
  });

  it("only lets audit retention grow", () => {
    const r = resolveSettings({ project: { retention: { auditLogRetentionDays: 2000 } } });
    expect(r.settings.retention.auditLogRetentionDays).toBe(2000);
  });

  it("narrowing connector tiers is allowed, widening is not", () => {
    const narrow = resolveSettings({ project: { connectors: { allowedConnectorTiers: ["A"] } } });
    expect(narrow.settings.connectors.allowedConnectorTiers).toEqual(["A"]);
    const wide = resolveSettings({ project: { connectors: { allowedConnectorTiers: ["A", "B", "C", "D"] } } });
    expect(wide.settings.connectors.allowedConnectorTiers).toEqual(
      DEFAULT_SETTINGS.connectors.allowedConnectorTiers,
    );
  });

  it("drops unknown keys instead of inventing settings", () => {
    const patch = { security: { backdoor: true } } as unknown as SettingsPatch;
    const r = resolveSettings({ project: patch });
    expect(JSON.stringify(r.settings)).not.toContain("backdoor");
  });

  it("reports type errors instead of coercing them", () => {
    const issues = validatePatch({ security: { maxFailedLogins: -1 } });
    expect(issues.some((i) => i.problem.includes("non-negative integer"))).toBe(true);
  });

  it("rejects a hard stop below the per-run budget", () => {
    const issues = validatePatch({ execution: { perRunTokenBudget: 1000, hardStopTokens: 100 } });
    expect(issues.some((i) => i.path === "execution.hardStopTokens")).toBe(true);
  });

  it("produces a stable hash for replay", () => {
    expect(hashSettings(base)).toBe(hashSettings(resolveSettings({}).settings));
    expect(hashSettings(base)).toHaveLength(16);
  });

  it("summarises itself in Persian for the UI", () => {
    const text = describeSettingsFa(base);
    expect(text).toContain("حالت محاسباتی");
    expect(text).toContain("MFA برای تصویب: بله");
  });
});

describe("run gate", () => {
  it("refuses a run that wants more trust than the settings allow", () => {
    const local = resolveSettings({ project: { execution: { computeMode: "local" } } }).settings;
    const v = checkRunAgainstSettings({ settings: local, requestedMode: "paid" });
    expect(v.some((x) => x.path === "execution.computeMode")).toBe(true);
  });

  it("refuses a direct write to a protected ref", () => {
    const v = checkRunAgainstSettings({ settings: base, protectedBranchWrites: ["main"] });
    expect(v[0]?.problem).toMatch(/pull request/);
  });

  it("refuses parallelism above the ceiling", () => {
    const v = checkRunAgainstSettings({ settings: base, requestedParallelism: 64 });
    expect(v.some((x) => x.path === "execution.maxParallelTasks")).toBe(true);
  });

  it("accepts a run inside the settings", () => {
    expect(
      checkRunAgainstSettings({
        settings: base,
        requestedMode: "local",
        requestedParallelism: 1,
        requestedAutonomy: "readonly",
        protectedBranchWrites: ["agent/run-1"],
      }),
    ).toEqual([]);
  });
});

describe("threat register", () => {
  it("covers every STRIDE category", () => {
    const categories = new Set(THREAT_REGISTER.map((t) => t.stride));
    for (const c of ["S", "T", "R", "I", "D", "E"] as const) {
      expect(categories.has(c), `STRIDE ${c} uncovered`).toBe(true);
    }
  });

  it("names an enforcing function for every threat", () => {
    for (const t of THREAT_REGISTER) {
      expect(t.enforcedBy.length, t.id).toBeGreaterThan(3);
      expect(t.control.length, t.id).toBeGreaterThan(10);
    }
  });

  it("has unique ids", () => {
    const ids = THREAT_REGISTER.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
