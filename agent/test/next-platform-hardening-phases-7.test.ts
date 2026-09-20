import { describe, expect, it } from "vitest";
import { decideM159Deletion, decideM159Placement, validateM159Policy, validateM159Transfer } from "../src/core/data-residency-runtime.js";
import { decideM160Exposure, decideM160Rollout, validateM160Flag, validateM160KillSwitch } from "../src/core/feature-rollout-runtime.js";
import { decideM161Lease, decideM161Rotation, validateM161Binding, validateM161Identity } from "../src/core/workload-identity-runtime.js";
import { decideM162Export, decideM162Hold, validateM162Deletion, validateM162Request } from "../src/core/data-rights-runtime.js";
import { decideM163Circuit, decideM163Reservation, validateM163Budget, validateM163Usage } from "../src/core/finops-guardrail-runtime.js";

describe("M159-M163 deterministic contract kernels", () => {
  it("M159 gates residency, placement, transfer and deletion", () => {
    const policy = { organizationId: "org-1", policyId: "policy", allowedRegions: ["us-west", "us-east"] as ("us-west" | "us-east" | "eu-central" | "ap-southeast" | "local")[], defaultRegion: "us-west" as const, classifications: ["confidential"] as ("public" | "internal" | "confidential" | "restricted")[], crossBorderAllowed: false, approvalPresent: true, legalBasisHash: "legal", tenantScoped: true, effectiveAt: 1_000 };
    expect(validateM159Policy(policy).allowed).toBe(true);
    expect(decideM159Placement({ organizationId: "org-1", placementId: "placement", datasetReference: "dataset-ref", classification: "confidential", requestedRegion: "us-west", policyId: "policy", encrypted: true, tenantBound: true, retentionPolicyHash: "retention", approvalPresent: true }, policy).allowed).toBe(true);
    expect(validateM159Transfer({ organizationId: "org-1", transferId: "transfer", datasetReference: "dataset-ref", sourceRegion: "us-west", destinationRegion: "us-west", classification: "confidential", purpose: "backup", legalBasisHash: "legal", destinationApproved: true, encryptedInTransit: true, redacted: true, tenantMatch: true }, policy).allowed).toBe(true);
    expect(decideM159Deletion({ organizationId: "org-1", deletionId: "deletion", datasetReference: "dataset-ref", regions: ["us-west", "us-east"], proofHash: "proof", legalHold: false, approvalPresent: true, replicasEnumerated: true }).allowed).toBe(true);
    expect(validateM159Transfer({ organizationId: "org-1", transferId: "transfer", datasetReference: "dataset-ref", sourceRegion: "us-west", destinationRegion: "eu-central", classification: "confidential", purpose: "backup", legalBasisHash: "legal", destinationApproved: true, encryptedInTransit: true, redacted: true, tenantMatch: true }, policy).allowed).toBe(false);
  });

  it("M160 gates flags, progressive rollout, kill switch and exposure", () => {
    expect(validateM160Flag({ organizationId: "org-1", flagId: "flag", key: "preview.v2", state: "active", defaultValue: false, rolloutMode: "percentage", ownerReference: "owner", expiresAt: 2_000, approvalPresent: true, auditReasonHash: "reason", noSecretValue: true, tenantScoped: true }, 1_000).allowed).toBe(true);
    expect(decideM160Rollout({ organizationId: "org-1", flagId: "flag", rolloutId: "rollout", percentage: 10, cohortHash: "cohort", previousPercentage: 0, monotonic: true, guardrailSloHash: "slo", canaryEvidenceHash: "evidence", approvalPresent: true, rollbackAvailable: true }).allowed).toBe(true);
    expect(validateM160KillSwitch({ organizationId: "org-1", flagId: "flag", switchId: "switch", activated: true, reasonHash: "reason", operatorReference: "operator", propagationDeadlineMs: 5_000, auditHash: "audit", tenantMatch: true }).allowed).toBe(true);
    expect(decideM160Exposure({ organizationId: "org-1", flagId: "flag", subjectReference: "subject", evaluatedAt: 1_000, result: true, ruleVersion: 1, deterministicKey: "key", tenantMatch: true, redacted: true }).allowed).toBe(true);
    expect(decideM160Rollout({ organizationId: "org-1", flagId: "flag", rolloutId: "rollout", percentage: 5, cohortHash: "cohort", previousPercentage: 10, monotonic: true, guardrailSloHash: "slo", canaryEvidenceHash: "evidence", approvalPresent: true, rollbackAvailable: true }).allowed).toBe(false);
  });

  it("M161 gates workload identity, lease, binding and rotation", () => {
    expect(validateM161Identity({ organizationId: "org-1", identityId: "identity", kind: "worker", subjectReference: "worker-ref", issuerReference: "issuer-ref", audience: "forgepilot", scopes: ["runs:write"], state: "active", tenantBound: true, proofHash: "proof", approvalPresent: true, humanOwned: true }).allowed).toBe(true);
    expect(decideM161Lease({ organizationId: "org-1", identityId: "identity", leaseId: "lease", credentialReference: "opaque-ref", issuedAt: 1_000, expiresAt: 2_000, scopes: ["runs:write"], state: "active", rawCredentialStored: false, renewable: true, idempotencyKey: "idem" }, 1_100).allowed).toBe(true);
    expect(validateM161Binding({ organizationId: "org-1", bindingId: "binding", identityId: "identity", resourceReference: "run-ref", actions: ["run:write"], conditionsHash: "conditions", tenantMatch: true, leastPrivilege: true, approvalPresent: true, expiresAt: 2_000 }, 1_100).allowed).toBe(true);
    expect(decideM161Rotation({ organizationId: "org-1", identityId: "identity", oldLeaseId: "old", newLeaseId: "new", reasonHash: "reason", oldRevoked: true, overlapSeconds: 30, evidenceHash: "evidence" }).allowed).toBe(true);
    expect(decideM161Rotation({ organizationId: "org-1", identityId: "identity", oldLeaseId: "old", newLeaseId: "old", reasonHash: "reason", oldRevoked: true, overlapSeconds: 30, evidenceHash: "evidence" }).allowed).toBe(false);
  });

  it("M162 gates rights requests, exports, deletion and holds", () => {
    expect(validateM162Request({ organizationId: "org-1", requestId: "request", subjectReference: "subject", kind: "export", state: "verified", identityProofHash: "identity", scopeHash: "scope", receivedAt: 1_000, dueAt: 2_000, legalHold: false, approvalPresent: true, tenantMatch: true, noRawSecrets: true }, 1_100).allowed).toBe(true);
    expect(decideM162Export({ organizationId: "org-1", requestId: "request", exportId: "export", format: "manifest", datasetHashes: ["dataset"], encryptionReference: "opaque-ref", expiresAt: 2_000, redacted: true, signed: true, recipientVerified: true, noClobber: true }, 1_100).allowed).toBe(true);
    expect(validateM162Deletion({ organizationId: "org-1", requestId: "request", deletionId: "deletion", stores: ["primary", "backup"], tombstoneHash: "tombstone", replicasEnumerated: true, completedAt: 2_000, residualProofHash: "proof", legalHold: false, approvalPresent: true }).allowed).toBe(true);
    expect(decideM162Hold({ organizationId: "org-1", holdId: "hold", requestId: "request", reasonHash: "reason", stores: ["primary"], expiresAt: 2_000, authorizedBy: "legal", tenantMatch: true }, 1_100).allowed).toBe(true);
    expect(validateM162Deletion({ organizationId: "org-1", requestId: "request", deletionId: "deletion", stores: ["primary"], tombstoneHash: "tombstone", replicasEnumerated: true, legalHold: true, approvalPresent: true }).allowed).toBe(false);
  });

  it("M163 gates budgets, reservations, usage reconciliation and circuit breaks", () => {
    const policy = { organizationId: "org-1", budgetId: "budget", mode: "byok" as const, periodStart: 1_000, periodEnd: 10_000, tokenLimit: 1_000, costLimitMicros: 10_000, egressAllowed: true, approvalPresent: true, tenantScoped: true, hardStop: true, fallbackMode: "local" as const };
    expect(validateM163Budget(policy).allowed).toBe(true);
    expect(decideM163Reservation({ organizationId: "org-1", budgetId: "budget", reservationId: "reservation", tokenUnits: 100, costMicros: 100, providerReference: "provider-ref", idempotencyKey: "idem", expiresAt: 2_000, remainingTokens: 1_000, remainingCostMicros: 10_000, state: "reserved" }, 1_100).allowed).toBe(true);
    expect(validateM163Usage({ organizationId: "org-1", budgetId: "budget", usageId: "usage", reservationId: "reservation", estimatedTokens: 100, actualTokens: 90, estimatedCostMicros: 100, actualCostMicros: 90, state: "reconciled", providerReceiptHash: "receipt", reconciledAt: 2_000, redacted: true }).allowed).toBe(true);
    expect(decideM163Circuit({ organizationId: "org-1", budgetId: "budget", circuitId: "circuit", open: true, reasonHash: "reason", observedFailureRate: 0.8, observedCostMicros: 1_000, thresholdRate: 0.5, thresholdCostMicros: 500, cooldownUntil: 2_000, approvalPresent: true }, 1_100).allowed).toBe(true);
    expect(decideM163Reservation({ organizationId: "org-1", budgetId: "budget", reservationId: "reservation", tokenUnits: 2_000, costMicros: 100, providerReference: "provider-ref", idempotencyKey: "idem", expiresAt: 2_000, remainingTokens: 1_000, remainingCostMicros: 10_000, state: "reserved" }, 1_100).allowed).toBe(false);
  });
});
