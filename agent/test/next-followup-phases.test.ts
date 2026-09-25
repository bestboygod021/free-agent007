import { describe, expect, it } from "vitest";

import { decideMembershipInvite, decideRoleChange, planNotification, resolveIdentitySettings, validateSessionProof } from "../src/core/identity-access-contract.js";
import { aggregateEvaluation, decideRegressionGate, planBenchmarkRun, validateEvaluationCase, validateHumanFeedback } from "../src/core/evaluation-runtime-contract.js";
import { decideAgentDelegation, decideRepositoryMutation, planContextPack, validateRepositoryPath, validateRepositorySnapshot } from "../src/core/repository-context-runtime.js";
import { decideDeployment, planArtifactRetention, planRollback, validateArtifactReference, validatePreviewRequest } from "../src/core/delivery-preview-runtime.js";
import { classifyUntrustedInput, decideDataDeletion, decideGovernedEgress, planKeyRotation, validateTenantIsolationProbe } from "../src/core/security-privacy-governance-runtime.js";

describe("M34 identity and access contract", () => {
  it("keeps sessions, membership, settings and notifications safe", () => {
    expect(validateSessionProof({ organizationId: "org", userId: "u", sessionId: "s", tokenDigest: "digest", issuedAt: 1, expiresAt: 100, mfaVerified: true }, 2, true).allowed).toBe(true);
    expect(decideMembershipInvite({ inviteId: "i", organizationId: "org", inviteeDigest: "email-hash", role: "developer", inviterId: "admin", expiresAt: 100 }, "admin", 2).allowed).toBe(true);
    expect(decideRoleChange({ organizationId: "org", subjectId: "u2", actorId: "admin", actorRole: "admin", currentRole: "viewer", nextRole: "developer" }).allowed).toBe(true);
    const settings = resolveIdentitySettings({ mode: "free", retries: 1 }, { organizationId: "org", values: { retries: 2 } }, { organizationId: "org", values: {} }, { organizationId: "org", values: { mode: "local" } });
    expect(settings).toEqual({ mode: "local", retries: 2 });
    expect(planNotification({ organizationId: "org", recipientId: "u", kind: "approval", channel: "in_app", dedupeKey: "a", payloadHash: "p", containsSecret: false }).allowed).toBe(true);
  });
});

describe("M35 evaluation runtime contract", () => {
  it("requires provenance, deterministic planning and regression evidence", () => {
    expect(validateEvaluationCase({ caseId: "c", datasetId: "d", split: "test", promptVersion: "p1", inputHash: "i", expectedOutputHash: "o", provenanceHash: "prov", markedTrainingData: false }).accepted).toBe(true);
    expect(planBenchmarkRun({ runId: "r", organizationId: "org", datasetId: "d", caseIds: ["c"], runner: "sandbox", environmentDigest: "sha256:image", seed: 7, budgetAllowed: true }).allowed).toBe(true);
    const aggregate = aggregateEvaluation([{ caseId: "c", passed: true, qualityScore: 0.9, latencyMs: 20, cost: 0.1, outputHash: "o", evidenceHash: "e" }]);
    expect(aggregate.passRate).toBe(1);
    expect(decideRegressionGate(aggregate, { passRate: 0.99, meanQuality: 0.89, p95LatencyMs: 30, maxCost: 1 }).allowed).toBe(true);
    expect(validateHumanFeedback({ organizationId: "org", caseId: "c", evaluatorId: "human", rating: 4, feedbackHash: "f" }).accepted).toBe(true);
  });
});

describe("M36 repository and context runtime", () => {
  it("keeps authority, path, context and delegation boundaries explicit", () => {
    expect(validateRepositorySnapshot({ organizationId: "org", projectId: "p", commitSha: "abcdef1", rootHash: "root", fileCount: 3, capturedAt: 1, sourceTrust: "git" }).allowed).toBe(true);
    expect(validateRepositoryPath({ path: "src/core/a.ts", allowedPaths: ["src"], protectedPaths: ["src/generated"], operation: "read" }).allowed).toBe(true);
    expect(planContextPack({ organizationId: "org", queryHash: "q", candidates: [{ id: "a", path: "src/a.ts", contentHash: "a", tokenCount: 10, relevance: 0.9, aclAllows: true, sourceTrust: "git" }, { id: "b", path: "README.md", contentHash: "b", tokenCount: 10, relevance: 0.8, aclAllows: false, sourceTrust: "untrusted" }], maxTokens: 20, maxItems: 2 }).selectedIds).toEqual(["a"]);
    expect(decideAgentDelegation({ organizationId: "org", parentAgentId: "a", childAgentId: "b", taskHash: "t", inputContractHash: "i", outputContractHash: "o", requestedCapabilities: ["read"], grantedCapabilities: ["read"], sideEffect: false, approvalPresent: false }).allowed).toBe(true);
    expect(decideRepositoryMutation({ organizationId: "org", projectId: "p", branch: "feature/x", baseCommitSha: "abcdef1", patchHash: "patch", operation: "merge", protectedBranch: true, approvalPresent: true }).allowed).toBe(true);
  });
});

describe("M37 delivery and preview runtime", () => {
  it("requires bounded previews, signed artifacts and approval for release", () => {
    expect(validatePreviewRequest({ organizationId: "org", projectId: "p", runId: "r", commitSha: "abcdef1", target: "local", requestedPort: 3000, expiresAt: 1000, networkAllowlist: [], approvalPresent: false }, 2).allowed).toBe(true);
    const artifact = { organizationId: "org", artifactId: "a", digest: "sha256:abcdef12", mediaType: "application/oci", createdAt: 1, expiresAt: 100, signed: true } as const;
    expect(validateArtifactReference(artifact, 2).allowed).toBe(true);
    expect(planArtifactRetention({ organizationId: "org", artifactId: "a", class: "preview", createdAt: 1, retentionMs: 100, legalHold: false }).deleteAfter).toBe(101);
    expect(decideDeployment({ organizationId: "org", projectId: "p", artifact, target: "production", branch: "release/v1", approvalPresent: true, verificationPassed: true, canaryPercent: 10 }, 2).allowed).toBe(true);
    expect(planRollback({ organizationId: "org", deploymentId: "d", currentArtifactDigest: "sha256:current", previousArtifactDigest: "sha256:previous", reasonHash: "reason", approvalPresent: true }).allowed).toBe(true);
  });
});

describe("M38 security and privacy governance contract", () => {
  it("denies cross-tenant, unsafe untrusted input and uncontrolled egress", () => {
    expect(validateTenantIsolationProbe({ organizationId: "org", actorOrganizationId: "org", resourceOrganizationId: "org", resourceId: "r", operation: "read", probeHash: "p" }).allowed).toBe(true);
    expect(planKeyRotation({ organizationId: "org", keyReference: "vault-ref", previousVersion: 1, nextVersion: 2, reason: "scheduled", approvalPresent: false }).allowed).toBe(true);
    expect(decideDataDeletion({ organizationId: "org", subjectId: "u", retentionClass: "run", requestedBy: "admin", legalHold: false, cascadeResourceIds: ["r"], approvalPresent: false }).allowed).toBe(true);
    expect(classifyUntrustedInput({ source: "readme", contentHash: "h", containsInstruction: true, containsCredentialPattern: false, requestedAction: "write" }).allowed).toBe(false);
    expect(decideGovernedEgress({ organizationId: "org", destination: "approved_provider", dataClass: "private", payloadHash: "p", userConsent: true, dlpPassed: true, approvalPresent: true }).allowed).toBe(true);
  });
});
