import { describe, expect, it } from "vitest";
import { decideM189Promotion, decideM189Rollback, validateM189Attestation, validateM189Manifest } from "../src/core/release-provenance-runtime.js";
import { decideM190Egress, validateM190CredentialLease, validateM190NetworkEvidence, validateM190Policy } from "../src/core/egress-policy-runtime.js";
import { decideM191Deletion, decideM191RetentionException, validateM191DeletionEvidence, validateM191Retention } from "../src/core/data-erasure-runtime.js";
import { decideM192Failover, validateM192ChaosPlan, validateM192RecoveryEvidence, validateM192RestoreProof } from "../src/core/recovery-chaos-runtime.js";
import { decideM193Admission, validateM193Allocation, validateM193FairnessEvidence, validateM193Workload } from "../src/core/fair-scheduler-runtime.js";

describe("M189-M193 deterministic contract kernels", () => {
  it("M189 gates release manifests, promotion, attestation and rollback", () => {
    expect(validateM189Manifest({ organizationId: "org-1", releaseId: "release", artifactDigest: "sha256:a", sourceCommit: "commit", buildRecipeHash: "recipe", sbomHash: "sbom", attestationHash: "attestation", signerId: "signer", target: "staging", approved: true, reproducible: true, secretsScanPassed: true, testsPassed: true, tenantBound: true }).allowed).toBe(true);
    expect(decideM189Promotion({ organizationId: "org-1", releaseId: "release", promotionId: "promotion", fromStage: "build", toStage: "canary", artifactDigest: "sha256:a", smokeEvidenceHash: "smoke", policyHash: "policy", rollbackDigest: "sha256:b", approvalPresent: true, canaryPercent: 10, bounded: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM189Attestation({ organizationId: "org-1", attestationId: "attestation", subjectDigest: "sha256:a", predicateType: "slsaprovenance", issuer: "builder", issuedAt: 1_000, expiresAt: 2_000, signatureVerified: true, trustedBuilder: true, sourceMatch: true, sbomMatch: true, tenantMatch: true }, 1_100).allowed).toBe(true);
    expect(decideM189Rollback({ organizationId: "org-1", rollbackId: "rollback", releaseId: "release", failedDigest: "sha256:a", rollbackDigest: "sha256:b", reasonHash: "reason", healthEvidenceHash: "health", approvalPresent: true, bounded: true, noForwardMutation: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM189Manifest({ organizationId: "org-1", releaseId: "release", artifactDigest: "sha256:a", sourceCommit: "commit", buildRecipeHash: "recipe", sbomHash: "sbom", attestationHash: "attestation", signerId: "signer", target: "staging", approved: true, reproducible: false, secretsScanPassed: true, testsPassed: true, tenantBound: true }).allowed).toBe(false);
  });

  it("M190 gates egress policy, network request, credential lease and evidence", () => {
    expect(validateM190Policy({ organizationId: "org-1", policyId: "policy", mode: "byok", destinationPattern: "api.example.com", allowedSchemes: ["https"], allowedPorts: [443], allowedDataClasses: ["public"], approvalPresent: true, userConsentPresent: true, dlpRequired: true, expiresAt: 2_000, tenantBound: true }, 1_000).allowed).toBe(true);
    expect(decideM190Egress({ organizationId: "org-1", policyId: "policy", requestId: "request", destination: "api.example.com", scheme: "https", port: 443, dataClass: "public", purposeHash: "purpose", estimatedBytes: 100, dnsPinned: true, tlsVerified: true, dlpPassed: true, consentPresent: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM190CredentialLease({ organizationId: "org-1", leaseId: "lease", destinationHash: "destination", credentialReference: "vault-ref", scopes: ["read"], issuedAt: 1_000, expiresAt: 2_000, rotated: true, revoked: false, approvalPresent: true, tenantMatch: true }, 1_100).allowed).toBe(true);
    expect(validateM190NetworkEvidence({ organizationId: "org-1", requestId: "request", destination: "api.example.com", resolvedIps: ["203.0.113.10"], certificateHash: "cert", bytesSent: 100, bytesReceived: 200, redacted: true, policyHash: "policy", dlpPassed: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM190Egress({ organizationId: "org-1", policyId: "policy", requestId: "request", destination: "api.example.com", scheme: "http", port: 80, dataClass: "restricted", purposeHash: "purpose", estimatedBytes: 100, dnsPinned: false, tlsVerified: false, dlpPassed: false, consentPresent: false, tenantMatch: true }).allowed).toBe(false);
  });

  it("M191 gates retention, deletion requests, purge evidence and exceptions", () => {
    expect(validateM191Retention({ organizationId: "org-1", recordIdHash: "record", recordClass: "run", createdAt: 1_000, retentionSeconds: 10_000, legalHold: false, encrypted: true, consentBound: true, tenantBound: true }, 2_000).allowed).toBe(true);
    expect(decideM191Deletion({ organizationId: "org-1", deletionId: "deletion", subjectIdHash: "subject", requestedAt: 2_000, stores: ["db", "object-store"], replicaCount: 2, backupScope: "tenant-backups", legalHold: false, approvalPresent: true, idempotencyKey: "idem", tenantMatch: true }).allowed).toBe(true);
    expect(validateM191DeletionEvidence({ organizationId: "org-1", deletionId: "deletion", subjectIdHash: "subject", completedAt: 3_000, storesPurged: ["db", "object-store"], replicasPurged: 2, backupsPurged: true, residualHash: "residual", verificationHash: "verify", legalHold: false, tenantMatch: true }).allowed).toBe(true);
    expect(decideM191RetentionException({ organizationId: "org-1", exceptionId: "exception", subjectIdHash: "subject", reasonHash: "reason", legalBasisHash: "legal", expiresAt: 5_000, approvalPresent: true, userDisclosed: true, bounded: true, tenantMatch: true }, 2_000).allowed).toBe(true);
    expect(decideM191Deletion({ organizationId: "org-1", deletionId: "deletion", subjectIdHash: "subject", requestedAt: 2_000, stores: ["db"], replicaCount: 1, backupScope: "tenant-backups", legalHold: true, approvalPresent: true, idempotencyKey: "idem", tenantMatch: true }).allowed).toBe(false);
  });

  it("M192 gates chaos plans, recovery evidence, failover and restore proof", () => {
    expect(validateM192ChaosPlan({ organizationId: "org-1", planId: "plan", scenario: "worker_loss", target: "staging-worker", blastRadius: "staging", durationSeconds: 60, budgetCents: 10, approvalPresent: true, sandboxed: true, rollbackReady: true, observabilityReady: true, productionTarget: false, tenantBound: true }).allowed).toBe(true);
    expect(validateM192RecoveryEvidence({ organizationId: "org-1", incidentId: "incident", scenario: "worker_loss", failureStartedAt: 1_000, detectedAt: 1_010, recoveredAt: 1_060, rtoSeconds: 50, rpoSeconds: 0, checkpointHash: "checkpoint", dataLossBytes: 0, runbookHash: "runbook", evidenceHash: "evidence", approved: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM192Failover({ organizationId: "org-1", failoverId: "failover", primary: "region-a", secondary: "region-b", healthEvidenceHash: "health", consistencyHash: "consistency", fencingEvidenceHash: "fencing", quorumPresent: true, approvalPresent: true, bounded: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM192RestoreProof({ organizationId: "org-1", restoreId: "restore", backupId: "backup", backupHash: "backup-hash", restoredHash: "restore-hash", schemaVersion: 2, integrityPassed: true, tenantIsolationPassed: true, replayPassed: true, rollbackReady: true, approvalPresent: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM192ChaosPlan({ organizationId: "org-1", planId: "plan", scenario: "worker_loss", target: "production-worker", blastRadius: "staging", durationSeconds: 60, budgetCents: 10, approvalPresent: true, sandboxed: true, rollbackReady: true, observabilityReady: true, productionTarget: true, tenantBound: true }).allowed).toBe(false);
  });

  it("M193 gates workload, fair admission, allocation and fairness evidence", () => {
    expect(validateM193Workload({ organizationId: "org-1", workloadId: "workload", requestedSlots: 2, estimatedCostCents: 10, deadlineAt: 10_000, fairnessClass: "standard", quotaRemaining: 20, idempotencyKey: "idem", preemptible: true, tenantBound: true }, 1_000).allowed).toBe(true);
    expect(decideM193Admission({ organizationId: "org-1", workloadId: "workload", admissionId: "admission", activeSlots: 4, maxSlots: 10, tenantShareBps: 2_000, maxShareBps: 5_000, starvationSeconds: 5, reservedSlots: 1, requestedSlots: 2, approvalPresent: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM193Allocation({ organizationId: "org-1", allocationId: "allocation", workloadId: "workload", slotsGranted: 2, queuePosition: 1, preemptedWorkloadIds: [], fairnessClass: "standard", leaseSeconds: 60, idempotencyKey: "idem", bounded: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM193FairnessEvidence({ organizationId: "org-1", windowStart: 1_000, windowEnd: 2_000, tenantServiceSharesBps: { "tenant-a": 4_000, "tenant-b": 3_500 }, maxDisparityBps: 500, sampleCount: 10, starvationBoundSeconds: 30, budgetEvidenceHash: "budget", approved: true, redacted: true, tenantBound: true }).allowed).toBe(true);
    expect(decideM193Admission({ organizationId: "org-1", workloadId: "workload", admissionId: "admission", activeSlots: 11, maxSlots: 10, tenantShareBps: 2_000, maxShareBps: 5_000, starvationSeconds: 5, reservedSlots: 1, requestedSlots: 2, approvalPresent: true, tenantMatch: true }).allowed).toBe(false);
  });
});
