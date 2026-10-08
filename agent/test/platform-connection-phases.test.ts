import { describe, expect, it } from "vitest";

import { decidePlatformConnection, revokePlatformConnection, validateConnectionSecretReference, validatePlatformDescriptor } from "../src/core/platform-connection-runtime.js";
import { decideUnifiedPlatformAction, negotiateConnectorCapabilities, validateConnectorCapabilityManifest } from "../src/core/unified-connector-runtime.js";
import { planContextHandoff, validatePlatformBundle, validatePlatformDeepLink } from "../src/core/platform-handoff-runtime.js";
import { advancePlatformCursor, decidePlatformInboundEvent, resolvePlatformConflict, validatePlatformOutboundDelivery } from "../src/core/platform-sync-runtime.js";
import { decideConnectionHealth, decideFallbackRoute, planConnectionReconnect, validateConnectionCenterScope } from "../src/core/connection-health-runtime.js";

describe("M49 platform connection runtime", () => {
  it("gates platform descriptors, OAuth consent, PKCE and opaque references", () => {
    const descriptor = { platform: "github" as const, authorizationEndpoint: "https://github.example/authorize", tokenEndpoint: "https://github.example/token", allowedRedirectUris: ["/connections/callback"], supportedScopes: ["repo:read"], authMethods: ["oauth2" as const], requiresPkce: true };
    expect(validatePlatformDescriptor(descriptor).allowed).toBe(true);
    expect(decidePlatformConnection({ organizationId: "org", userId: "user", connectionId: "github-1", platform: "github", authMethod: "oauth2", requestedScopes: ["repo:read"], redirectUri: "/connections/callback", stateHash: "state-hash", codeChallenge: "pkce", codeChallengeMethod: "S256", mode: "free", userConsentPresent: true, storesRawCredential: false }, descriptor).allowed).toBe(true);
    expect(validateConnectionSecretReference({ organizationId: "org", connectionId: "github-1", tokenReference: "ref_opaque", expiresAt: 100, revocable: true, rawCredentialPresent: false }, 1).allowed).toBe(true);
    expect(revokePlatformConnection("org", "github-1", true).allowed).toBe(true);
  });
});

describe("M50 unified connector runtime", () => {
  it("negotiates normalized capabilities and requires approval for writes", () => {
    const manifest = { platform: "github" as const, adapterId: "github-adapter", adapterVersion: "1", supportedOperations: ["issue_read", "issue_write"] as const, operationScopes: { issue_read: ["issues:read"], issue_write: ["issues:write"] }, riskByOperation: { issue_read: "read" as const, issue_write: "write" as const }, sandboxed: true, source: "built_in" as const };
    expect(validateConnectorCapabilityManifest(manifest).allowed).toBe(true);
    expect(negotiateConnectorCapabilities({ organizationId: "org", connectionId: "connection", platform: "github", requestedOperations: ["issue_read"], grantedScopes: ["issues:read"], manifest, userConsentPresent: true }).allowed).toBe(true);
    expect(decideUnifiedPlatformAction({ organizationId: "org", userId: "user", connectionId: "connection", platform: "github", operation: "issue_write", resourceReference: "github:issue:1", idempotencyKey: "idempotent", approvalPresent: true, egressConsent: true }, manifest).allowed).toBe(true);
    expect(decideUnifiedPlatformAction({ organizationId: "org", userId: "user", connectionId: "connection", platform: "github", operation: "issue_write", resourceReference: "github:issue:1", idempotencyKey: "idempotent", approvalPresent: false, egressConsent: true }, manifest).allowed).toBe(false);
  });
});

describe("M51 platform handoff runtime", () => {
  it("keeps deep links, context handoff and bundles bounded and reviewable", () => {
    expect(validatePlatformDeepLink({ organizationId: "org", linkId: "link", sourcePlatform: "github", targetPlatform: "linear", targetUrl: "https://linear.example/task", signedCapability: "signature", expiresAt: 100, oneTime: true, consumed: false }, 1).allowed).toBe(true);
    expect(planContextHandoff({ organizationId: "org", runId: "run", sourcePlatform: "github", targetPlatform: "linear", projectReference: "github:repo", taskReference: "github:issue:1", contextFields: { title: "Fix issue", summary: "bounded" }, handoffHash: "handoff", userApproved: true, containsSecret: false }).allowed).toBe(true);
    expect(validatePlatformBundle({ organizationId: "org", bundleId: "bundle", format: "json", schemaVersion: "1", sourcePlatform: "github", targetPlatform: "linear", payloadHash: "payload", recordCount: 2, encryptedAtRest: true, containsRawCredential: false }).allowed).toBe(true);
  });
});

describe("M52 platform sync runtime", () => {
  it("verifies inbound events, monotonic cursors, conflicts and outbound consent", () => {
    const inbound = { organizationId: "org", connectionId: "connection", platform: "github" as const, providerEventId: "event-1", eventKind: "issue_changed" as const, payloadHash: "payload", signatureVerified: true, receivedAt: 1, cursor: "cursor-1", deliveryAttempt: 1, replayed: false };
    expect(decidePlatformInboundEvent(inbound).allowed).toBe(true);
    expect(advancePlatformCursor({ organizationId: "org", connectionId: "connection", platform: "github", cursor: "cursor-0", lastProviderEventId: "event-0", updatedAt: 1, monotonic: true }, { organizationId: "org", connectionId: "connection", platform: "github", cursor: "cursor-1", lastProviderEventId: "event-1", updatedAt: 2, monotonic: true }).allowed).toBe(true);
    expect(resolvePlatformConflict({ organizationId: "org", conflictId: "conflict", sourceVersion: "2", targetVersion: "1", sourceHash: "source", targetHash: "target", resolution: "manual_review", approvalPresent: true }).allowed).toBe(true);
    expect(validatePlatformOutboundDelivery({ organizationId: "org", connectionId: "connection", platform: "github", deliveryId: "delivery", eventHash: "event", idempotencyKey: "idempotent", attempt: 1, maxAttempts: 3, egressConsent: true }).allowed).toBe(true);
  });
});

describe("M53 connection health and fallback runtime", () => {
  it("gives users health, reconnect and honest local fallback paths", () => {
    expect(decideConnectionHealth({ organizationId: "org", connectionId: "connection", platform: "github", health: "healthy", checkedAt: 1, grantedScopes: ["repo:read"], lastSuccessfulOperation: "issue_read", userVisibleMessage: "Connected" }, 2).allowed).toBe(true);
    expect(decideFallbackRoute({ organizationId: "org", connectionId: "connection", platform: "github", requestedRoute: "local_runtime", mode: "local", dataEgressAllowed: false, localCapabilityAvailable: true, byokConfigured: false, freeProviderAvailable: false }).selectedRoute).toBe("local_runtime");
    expect(planConnectionReconnect({ organizationId: "org", connectionId: "connection", platform: "github", reason: "expired", preserveLocalContext: true, redirectUri: "/connections/callback", userInitiated: true }, 1).allowed).toBe(true);
    expect(validateConnectionCenterScope("org", ["connection"], ["connection", "other"]).allowed).toBe(true);
  });
});
