import { describe, expect, it } from "vitest";
import { decideM204Handoff, decideM204Resume, validateM204Control, validateM204Termination } from "../src/core/run-handoff-runtime.js";
import { decideM205Activation, decideM205Revocation, validateM205Attestation, validateM205Verification } from "../src/core/capability-attestation-runtime.js";
import { decideM206Placement, decideM206Transfer, validateM206Deletion, validateM206Request } from "../src/core/region-processing-runtime.js";
import { decideM207Apply, decideM207Rollback, validateM207Diff, validateM207Simulation } from "../src/core/action-simulation-runtime.js";
import { decideM208Promotion, decideM208Rollback, validateM208Change, validateM208RollbackEvidence } from "../src/core/policy-change-runtime.js";

describe("M204-M208 deterministic contract kernels", () => {
  it("M204 gates pause, human handoff, resume and termination", () => {
    expect(validateM204Control({ organizationId: "org-1", runId: "run", controlId: "control", currentState: "running", checkpointHash: "checkpoint", actorHash: "actor", reasonHash: "reason", requestedAt: 1_000, expiresAt: 2_000, approvalPresent: true, noUnboundedResume: true, tenantBound: true }, 1_100).allowed).toBe(true);
    expect(decideM204Handoff({ organizationId: "org-1", runId: "run", handoffId: "handoff", fromActorHash: "agent", toActorHash: "human", checkpointHash: "checkpoint", authorityHash: "authority", consentPresent: true, secretFree: true, stateMatch: true, leaseExpiresAt: 2_000, tenantMatch: true }, 1_100).allowed).toBe(true);
    expect(decideM204Resume({ organizationId: "org-1", runId: "run", resumeId: "resume", checkpointHash: "checkpoint", stateHash: "state", actorHash: "human", leaseHash: "lease", replaySafe: true, noDuplicateEffects: true, approvalPresent: true, preconditionsPassed: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM204Termination({ organizationId: "org-1", runId: "run", terminationId: "term", checkpointHash: "checkpoint", terminationReasonHash: "reason", cleanupEvidenceHash: "cleanup", terminatedAt: 2_000, noActiveLease: true, residualWorkers: 0, tenantMatch: true }).allowed).toBe(true);
    expect(decideM204Resume({ organizationId: "org-1", runId: "run", resumeId: "resume", checkpointHash: "checkpoint", stateHash: "state", actorHash: "human", leaseHash: "lease", replaySafe: false, noDuplicateEffects: true, approvalPresent: true, preconditionsPassed: true, tenantMatch: true }).allowed).toBe(false);
  });

  it("M205 gates attestation, activation, revocation and verification", () => {
    expect(validateM205Attestation({ organizationId: "org-1", attestationId: "attestation", subjectHash: "subject", capability: "repo.read", artifactHash: "artifact", issuerHash: "issuer", signatureHash: "signature", environmentHash: "environment", policyHash: "policy", issuedAt: 1_000, expiresAt: 2_000, revocationChecked: true, tenantBound: true }, 1_100).allowed).toBe(true);
    expect(decideM205Activation({ organizationId: "org-1", activationId: "activation", attestationId: "attestation", capability: "repo.read", requestedScope: ["repo:read"], approvedScope: ["repo:read"], attestationValid: true, policyMatch: true, allowNetwork: false, secretFree: true, approvalPresent: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM205Revocation({ organizationId: "org-1", revocationId: "revoke", attestationId: "attestation", reasonHash: "reason", revokedAt: 1_500, propagatedTargets: ["worker-1"], blocked: true, noReactivation: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM205Verification({ organizationId: "org-1", verificationId: "verify", attestationId: "attestation", observedArtifactHash: "artifact", observedEnvironmentHash: "environment", verifierHash: "verifier", verifiedAt: 1_600, signatureValid: true, artifactMatch: true, environmentMatch: true, noUnexpectedPermission: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM205Activation({ organizationId: "org-1", activationId: "activation", attestationId: "attestation", capability: "repo.read", requestedScope: ["repo:write"], approvedScope: ["repo:read"], attestationValid: true, policyMatch: true, allowNetwork: false, secretFree: true, approvalPresent: true, tenantMatch: true }).allowed).toBe(false);
  });

  it("M206 gates residency request, placement, transfer and deletion", () => {
    expect(validateM206Request({ organizationId: "org-1", requestId: "request", dataClass: "confidential", subjectRegion: "us", processingRegion: "us", providerRegion: "us", residencyPolicyHash: "policy", transferBasis: "local", consentPresent: true, encryptedInTransit: true, encryptedAtRest: true, tenantBound: true }).allowed).toBe(true);
    expect(decideM206Placement({ organizationId: "org-1", placementId: "placement", requestId: "request", allowedRegions: ["us"], selectedRegion: "us", policyMatch: true, noCrossBoundary: true, providerDeclared: true, fallbackIsLocal: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM206Transfer({ organizationId: "org-1", transferId: "transfer", sourceRegion: "us", targetRegion: "eu", dataClass: "confidential", legalBasisHash: "basis", safeguardsHash: "safeguards", approvalPresent: true, userVisible: true, minimized: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM206Deletion({ organizationId: "org-1", deletionId: "deletion", subjectHash: "subject", regions: ["us", "eu"], stores: ["db", "backup"], evidenceHash: "evidence", completedAt: 2_000, residualCopies: 0, legalHoldPresent: false, tenantMatch: true }).allowed).toBe(true);
    expect(decideM206Placement({ organizationId: "org-1", placementId: "placement", requestId: "request", allowedRegions: ["us"], selectedRegion: "eu", policyMatch: true, noCrossBoundary: true, providerDeclared: true, fallbackIsLocal: true, tenantMatch: true }).allowed).toBe(false);
  });

  it("M207 gates simulation, reviewed apply, diff and rollback", () => {
    expect(validateM207Simulation({ organizationId: "org-1", simulationId: "simulation", actionType: "update", targetReferenceHash: "target", inputHash: "input", observedBeforeHash: "before", predictedAfterHash: "after", previewHash: "preview", affectedResources: ["file:a"], blastRadius: "bounded", reversible: true, noSideEffect: true, sandboxed: true, tenantBound: true }).allowed).toBe(true);
    expect(decideM207Apply({ organizationId: "org-1", applyId: "apply", simulationId: "simulation", simulationHash: "simulation-hash", preconditionHash: "precondition", currentStateHash: "before", approvalPresent: true, scopeMatch: true, previewReviewed: true, bounded: true, noUnexpectedDiff: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM207Diff({ organizationId: "org-1", simulationId: "simulation", diffId: "diff", beforeHash: "before", afterHash: "after", changedResources: ["file:a"], secretFree: true, redacted: true, reviewable: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM207Rollback({ organizationId: "org-1", rollbackId: "rollback", applyId: "apply", rollbackPlanHash: "plan", reasonHash: "reason", reversible: true, approvalPresent: true, preconditionPassed: true, bounded: true, cleanupEvidenceHash: "cleanup", tenantMatch: true }).allowed).toBe(true);
    expect(validateM207Simulation({ organizationId: "org-1", simulationId: "simulation", actionType: "delete", targetReferenceHash: "target", inputHash: "input", observedBeforeHash: "before", predictedAfterHash: "after", previewHash: "preview", affectedResources: ["file:a"], blastRadius: "unbounded", reversible: true, noSideEffect: true, sandboxed: true, tenantBound: true }).allowed).toBe(false);
  });

  it("M208 gates policy change, canary promotion and rollback", () => {
    expect(validateM208Change({ organizationId: "org-1", changeId: "change", policyId: "policy", currentPolicyHash: "old", proposedPolicyHash: "new", diffHash: "diff", reasonHash: "reason", testsHash: "tests", rollbackPlanHash: "rollback", requestedByHash: "requester", risk: "high", separationOfDuties: true, tenantBound: true }).allowed).toBe(true);
    expect(decideM208Promotion({ organizationId: "org-1", promotionId: "promotion", changeId: "change", policyHash: "new", canaryScope: ["tenant-a"], evidenceHash: "evidence", approverHash: "approver", signatureHash: "signature", testsPassed: true, approvalPresent: true, canaryPassed: true, expiryAt: 2_000, tenantMatch: true }, 1_100).allowed).toBe(true);
    expect(decideM208Rollback({ organizationId: "org-1", rollbackId: "rollback", policyId: "policy", activePolicyHash: "new", targetPolicyHash: "old", reasonHash: "reason", evidenceHash: "evidence", approvalPresent: true, propagationConfirmed: true, blockedUntilReview: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM208RollbackEvidence({ organizationId: "org-1", evidenceId: "evidence", policyId: "policy", expectedPolicyHash: "old", observedPolicyHash: "old", targets: ["tenant-a"], observedAt: 2_000, noDrift: true, noStaleTarget: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM208Promotion({ organizationId: "org-1", promotionId: "promotion", changeId: "change", policyHash: "new", canaryScope: ["tenant-a"], evidenceHash: "evidence", approverHash: "approver", signatureHash: "signature", testsPassed: true, approvalPresent: true, canaryPassed: true, expiryAt: 1_000, tenantMatch: true }, 1_100).allowed).toBe(false);
  });
});
