import { describe, expect, it } from "vitest";
import { createBearerAuthenticator, InMemoryAuthSessionStore, issueBearerToken, verifyBearerToken } from "../src/core/session-auth.js";
import { DEFAULT_SETTINGS } from "../src/core/platform-settings.js";

const secret = "0123456789abcdef0123456789abcdef";
const now = 1_700_000_000_000;

function token(overrides: Partial<Parameters<typeof issueBearerToken>[0]> = {}): string {
  return issueBearerToken({
    sessionId: "session-1",
    userId: "user-1",
    organizationId: "org-1",
    role: "developer",
    projectId: "project-1",
    issuedAt: now,
    expiresAt: now + 10 * 60_000,
    secret,
    ...overrides,
  });
}

describe("signed session authentication", () => {
  it("issues and verifies a short-lived bearer token without storing a password", () => {
    const claims = verifyBearerToken({ token: token(), secret, now: now + 1_000 });
    expect(claims).toMatchObject({ sid: "session-1", sub: "user-1", org: "org-1", role: "developer", project: "project-1" });
  });

  it("rejects tampering, wrong secrets, expiry and weak signing keys", () => {
    expect(() => issueBearerToken({
      sessionId: "s", userId: "u", organizationId: "o", role: "viewer",
      issuedAt: now, expiresAt: now + 60_000, secret: "short",
    })).toThrow("at least 32 bytes");
    expect(() => verifyBearerToken({ token: `${token()}x`, secret, now })).toThrow("signature");
    expect(() => verifyBearerToken({ token: token(), secret: "abcdefabcdefabcdefabcdefabcdefabce", now })).toThrow("signature");
    expect(() => verifyBearerToken({ token: token(), secret, now: now + 10 * 60_000 })).toThrow("expired");
    expect(() => issueBearerToken({ ...JSON.parse(JSON.stringify({
      sessionId: "s", userId: "u", organizationId: "o", role: "viewer",
      issuedAt: now, expiresAt: now + 16 * 60_000, secret,
    })) })).toThrow("lifetime");
  });

  it("enforces revocation and idle timeout when a session lookup is supplied", async () => {
    const sessions = new InMemoryAuthSessionStore();
    sessions.issue({ sessionId: "session-1", userId: "user-1", organizationId: "org-1", role: "developer", projectId: "project-1", now });
    const auth = createBearerAuthenticator({
      secret,
      settings: DEFAULT_SETTINGS,
      lookupSession: (sessionId) => sessions.get(sessionId),
      now: () => now + 1_000,
    });
    const request = { headers: { authorization: `Bearer ${token()}` } } as never;
    expect(await auth(request)).toMatchObject({ userId: "user-1", organizationId: "org-1", projectId: "project-1" });
    sessions.revoke("session-1", now + 2_000);
    expect(await auth(request)).toBeUndefined();
  });

  it("rejects missing or malformed Authorization headers", async () => {
    const auth = createBearerAuthenticator({ secret, settings: DEFAULT_SETTINGS, now: () => now });
    expect(await auth({ headers: {} } as never)).toBeUndefined();
    expect(await auth({ headers: { authorization: "Basic abc" } } as never)).toBeUndefined();
  });
});
