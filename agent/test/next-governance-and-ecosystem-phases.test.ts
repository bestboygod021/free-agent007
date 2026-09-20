import { describe, expect, it } from "vitest";

import { decideEnterpriseInvitation, validateEnterpriseDelegation, validateEnterpriseIdentityProvider, validateEnterpriseMembershipChange } from "../src/core/enterprise-identity-runtime.js";
import { decidePrivacySubjectRequest, validatePrivacyDeletionEvidence, validatePrivacyLegalHold, validatePrivacyRetentionPolicy } from "../src/core/privacy-lifecycle-runtime.js";
import { decideDeveloperSdkCompatibility, validateDeveloperApiContract, validateDeveloperWebhookClient, validateForgeCommand } from "../src/core/developer-experience-runtime.js";
import { decideExtensionInstallation, decideExtensionReview, validateExtensionManifest, validateExtensionSecurityEvidence } from "../src/core/extension-marketplace-runtime.js";
import { decidePlatformIncident, validateBackupRestoreEvidence, validatePlatformChaosExperiment, validatePlatformSlo } from "../src/core/platform-resilience-runtime.js";

describe("M69 enterprise identity runtime", () => {
  it("keeps federation, invitations, membership and delegation bounded", () => {
    expect(validateEnterpriseIdentityProvider({ organizationId: "org", providerId: "oidc", method: "oidc", issuerUrl: "https://id.example", clientIdReference: "client-ref", signingKeyReference: "key-ref", allowedDomains: ["example.com"], mfaRequired: true, reviewed: true }).allowed).toBe(true);
    expect(decideEnterpriseInvitation({ organizationId: "org", invitationId: "invite", invitedEmailHash: "email", role: "developer", expiresAt: 100, invitedBy: "owner", revoked: false }, 1, "user").allowed).toBe(true);
    expect(validateEnterpriseMembershipChange({ organizationId: "org", membershipId: "member", actorId: "admin", subjectId: "user", fromRole: "viewer", toRole: "developer", fromState: "invited", toState: "active", approvalPresent: true, reasonHash: "reason" }).allowed).toBe(true);
    expect(validateEnterpriseDelegation({ organizationId: "org", delegationId: "delegation", delegatorId: "owner", delegateId: "reviewer", capability: "approve", resourceScope: "run:1", expiresAt: 100, revocable: true, approvalPresent: true }, 1).allowed).toBe(true);
    expect(validateEnterpriseIdentityProvider({ organizationId: "org", providerId: "bad", method: "oidc", issuerUrl: "http://id.example", clientIdReference: "raw-secret", allowedDomains: ["example.com"], mfaRequired: false, reviewed: false }).allowed).toBe(false);
    expect(validateEnterpriseMembershipChange({ organizationId: "org", membershipId: "member", actorId: "user", subjectId: "user", fromRole: "viewer", toRole: "admin", fromState: "active", toState: "active", approvalPresent: false, reasonHash: "reason" }).allowed).toBe(false);
  });
});

describe("M70 privacy lifecycle runtime", () => {
  it("requires approved retention, verified rights and deletion evidence", () => {
    expect(validatePrivacyRetentionPolicy({ organizationId: "org", policyId: "policy", dataClass: "run", retentionDays: 90, deletionGraceDays: 7, legalHoldOverrides: true, region: "global", approved: true }).allowed).toBe(true);
    expect(decidePrivacySubjectRequest({ organizationId: "org", requestId: "request", subjectHash: "subject", requestType: "delete", state: "processing", receivedAt: 1, verifiedAt: 2, evidenceHash: "evidence", approvalPresent: true }, 3).allowed).toBe(true);
    expect(validatePrivacyLegalHold({ organizationId: "org", holdId: "hold", matterHash: "matter", dataClasses: ["run"], subjectHashes: ["subject"], startsAt: 1, approvedBy: "legal", active: true }, 2).allowed).toBe(true);
    expect(validatePrivacyDeletionEvidence({ organizationId: "org", requestId: "request", dataClass: "run", storeName: "store", deletedRecordCount: 3, tombstoneHash: "tombstone", completedAt: 3, legalHoldChecked: true, residualSearchHash: "residual", residualFound: false }).allowed).toBe(true);
    expect(validatePrivacyRetentionPolicy({ organizationId: "org", policyId: "bad", dataClass: "run", retentionDays: 0, deletionGraceDays: 7, legalHoldOverrides: true, region: "global", approved: true }).allowed).toBe(false);
    expect(decidePrivacySubjectRequest({ organizationId: "org", requestId: "request", subjectHash: "subject", requestType: "delete", state: "processing", receivedAt: 1, evidenceHash: "evidence", approvalPresent: true }, 3).allowed).toBe(false);
  });
});

describe("M71 developer experience runtime", () => {
  it("validates API contracts, SDK compatibility, CLI and signed webhooks", () => {
    const contract = { apiName: "runs", version: "v1", transport: "rest" as const, route: "/api/runs", requestSchemaHash: "request", responseSchemaHash: "response", tenantHeaderRequired: true, idempotencyRequired: true, deprecated: false };
    expect(validateDeveloperApiContract(contract, 1).allowed).toBe(true);
    expect(decideDeveloperSdkCompatibility({ organizationId: "org", sdkName: "forge-sdk", language: "typescript", sdkVersion: "1", apiVersion: "v1", generatedFromSchemaHash: "response", supportsStreaming: true, supportsRetries: true, compatibilityReviewed: true }, contract).allowed).toBe(true);
    expect(validateForgeCommand({ organizationId: "org", userId: "user", command: "logs", projectPath: "project", argsHash: "args", interactive: true, approvalPresent: false, localMode: false }).allowed).toBe(true);
    expect(validateDeveloperWebhookClient({ organizationId: "org", clientId: "client", endpointReference: "https://example.com/hook", subscribedEvents: ["run.completed"], signingSecretReference: "signing-ref", retryPolicyVersion: "1", verified: true }).allowed).toBe(true);
    expect(validateForgeCommand({ organizationId: "org", userId: "user", command: "run", projectPath: "../escape", argsHash: "args", interactive: false, approvalPresent: false, localMode: false }).allowed).toBe(false);
    expect(validateDeveloperWebhookClient({ organizationId: "org", clientId: "client", endpointReference: "https://example.com/hook", subscribedEvents: ["run.completed"], signingSecretReference: "raw-secret", retryPolicyVersion: "1", verified: true }).allowed).toBe(false);
  });
});

describe("M72 extension marketplace runtime", () => {
  it("requires signed, scanned, sandboxed extensions and declared permissions", () => {
    const manifest = { organizationId: "org", extensionId: "extension", version: "1", displayName: "Safe extension", runtime: "wasm" as const, entrypointHash: "entry", packageHash: "package", requestedPermissions: ["run:read"], allowedDomains: [], risk: "low" as const, signerReference: "signer-ref", sandboxed: true, source: "reviewed_upload" as const };
    const evidence = { organizationId: "org", extensionId: "extension", version: "1", checksumVerified: true, signatureVerified: true, sandboxProbePassed: true, networkProbePassed: true, secretScanPassed: true, artifactHash: "artifact" };
    expect(validateExtensionManifest(manifest).allowed).toBe(true);
    expect(validateExtensionSecurityEvidence(evidence).allowed).toBe(true);
    expect(decideExtensionReview({ organizationId: "org", extensionId: "extension", version: "1", reviewerId: "reviewer", license: "MIT", securityScanHash: "security", dependencyScanHash: "deps", approved: true, reviewedAt: 1 }, manifest).allowed).toBe(true);
    expect(decideExtensionInstallation({ organizationId: "org", userId: "user", extensionId: "extension", version: "1", grantedPermissions: ["run:read"], egressConsent: false, approvalPresent: true, state: "reviewed" }, manifest, evidence).allowed).toBe(true);
    expect(validateExtensionManifest({ ...manifest, requestedPermissions: ["run:read", "run:read"] }).allowed).toBe(false);
    expect(decideExtensionInstallation({ organizationId: "org", userId: "user", extensionId: "extension", version: "1", grantedPermissions: ["run:write"], egressConsent: false, approvalPresent: true, state: "reviewed" }, manifest, evidence).allowed).toBe(false);
    expect(decideExtensionReview({ organizationId: "other-org", extensionId: "extension", version: "1", reviewerId: "reviewer", license: "MIT", securityScanHash: "security", dependencyScanHash: "deps", approved: true, reviewedAt: 1 }, manifest).allowed).toBe(false);
  });
});

describe("M73 platform resilience runtime", () => {
  it("gates SLOs, backup restore, incidents and bounded chaos", () => {
    expect(validatePlatformSlo({ organizationId: "org", serviceId: "api", window: "day", availabilityTarget: 0.99, latencyP95TargetMs: 500, errorBudgetPercent: 1, alertThresholdPercent: 80, ownerId: "owner", approved: true }).allowed).toBe(true);
    expect(validateBackupRestoreEvidence({ organizationId: "org", backupId: "backup", storeName: "db", backupHash: "backup-hash", encrypted: true, createdAt: 1, restoredAt: 2, restoreExitCode: 0, restoredRecordCount: 10, rpoMinutes: 15, rtoMinutes: 30, verificationHash: "verify" }, 3).allowed).toBe(true);
    expect(decidePlatformIncident({ organizationId: "org", incidentId: "incident", serviceId: "api", severity: "high", observedAt: 1, evidenceHash: "evidence", runbookId: "runbook", selectedAction: "failover", acknowledged: true }).allowed).toBe(true);
    expect(validatePlatformChaosExperiment({ organizationId: "org", experimentId: "chaos", target: "queue", failureMode: "latency", durationMs: 10_000, blastRadiusPercent: 5, rollbackPlanHash: "rollback", approvalPresent: true, production: false }, 1).allowed).toBe(true);
    expect(validateBackupRestoreEvidence({ organizationId: "org", backupId: "backup", storeName: "db", backupHash: "backup-hash", encrypted: false, createdAt: 1, restoredAt: 2, restoreExitCode: 0, restoredRecordCount: 10, rpoMinutes: 15, rtoMinutes: 30, verificationHash: "verify" }, 3).allowed).toBe(false);
    expect(decidePlatformIncident({ organizationId: "org", incidentId: "incident", serviceId: "api", severity: "critical", observedAt: 1, evidenceHash: "evidence", runbookId: "runbook", selectedAction: "observe", acknowledged: true }).allowed).toBe(false);
    expect(validatePlatformChaosExperiment({ organizationId: "org", experimentId: "prod-chaos", target: "queue", failureMode: "latency", durationMs: 10_000, blastRadiusPercent: 5, rollbackPlanHash: "rollback", approvalPresent: false, production: true }, 1).allowed).toBe(false);
  });
});
