import { describe, expect, it } from "vitest";
import { decideM199Freeze, decideM199Scope, validateM199Intent, validateM199Plan } from "../src/core/intent-scope-runtime.js";
import { decideM200Commit, decideM200Compensation, validateM200Journal, validateM200Receipt } from "../src/core/side-effect-journal-runtime.js";
import { decideM201Reconcile, validateM201Change, validateM201Drift, validateM201Snapshot } from "../src/core/reconciliation-drift-runtime.js";
import { decideM202Approval, decideM202Revocation, validateM202Escalation, validateM202Request } from "../src/core/approval-integrity-runtime.js";
import { decideM203Export, validateM203Aggregate, validateM203Deletion, validateM203Event } from "../src/core/privacy-analytics-runtime.js";

describe("M199-M203 deterministic contract kernels", () => {
  it("M199 gates intent, scope, plan and scope freeze", () => {
    expect(validateM199Intent({ organizationId: "org-1", intentId: "intent", actorHash: "actor", goalHash: "goal", constraints: ["tests pass"], allowedTools: ["read"], targetPaths: ["src/"], riskLevel: "medium", budgetCents: 10, expiresAt: 2_000, approvalPresent: true, noScopeExpansion: true, tenantBound: true }, 1_000).allowed).toBe(true);
    expect(decideM199Scope({ organizationId: "org-1", intentId: "intent", scopeId: "scope", requestedTargets: ["src/"], approvedTargets: ["src/"], approvedTools: ["read"], policyHash: "policy", changesHash: "changes", noExpansion: true, approvalPresent: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM199Plan({ organizationId: "org-1", intentId: "intent", planId: "plan", requirementHashes: ["req"], acceptanceHashes: ["accept"], dependencyHashes: [], estimatedCostCents: 10, estimatedDurationSeconds: 30, scopeHash: "scope", policyHash: "policy", tenantMatch: true }).allowed).toBe(true);
    expect(decideM199Freeze({ organizationId: "org-1", intentId: "intent", freezeId: "freeze", scopeHash: "scope", planHash: "plan", approvedAt: 1_000, expiresAt: 2_000, changeRequestAllowed: false, approvalPresent: true, tenantMatch: true }, 1_100).allowed).toBe(true);
    expect(decideM199Scope({ organizationId: "org-1", intentId: "intent", scopeId: "scope", requestedTargets: ["src/"], approvedTargets: ["src/", "secrets/"], approvedTools: ["read"], policyHash: "policy", changesHash: "changes", noExpansion: true, approvalPresent: true, tenantMatch: true }).allowed).toBe(false);
  });

  it("M200 gates side-effect journal, commit, receipt and compensation", () => {
    expect(validateM200Journal({ organizationId: "org-1", operationId: "operation", idempotencyKey: "idem", actionType: "write", targetReferenceHash: "target", preconditionHash: "precondition", inputHash: "input", compensationHash: "compensation", state: "prepared", approvalPresent: true, tenantBound: true }).allowed).toBe(true);
    expect(decideM200Commit({ organizationId: "org-1", operationId: "operation", commitId: "commit", sideEffectHash: "effect", attempt: 1, dedupeChecked: true, preconditionPassed: true, atomicBoundary: true, receiptHash: "receipt", noDuplicate: true, approvalPresent: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM200Receipt({ organizationId: "org-1", operationId: "operation", receiptId: "receipt", idempotencyKey: "idem", targetReferenceHash: "target", sideEffectHash: "effect", providerReceiptHash: "provider-receipt", committedAt: 2_000, replaySafe: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM200Compensation({ organizationId: "org-1", operationId: "operation", compensationId: "compensation", originalSideEffectHash: "effect", compensationHash: "undo", reasonHash: "reason", reversible: true, approvalPresent: true, bounded: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM200Commit({ organizationId: "org-1", operationId: "operation", commitId: "commit", sideEffectHash: "effect", attempt: 2, dedupeChecked: false, preconditionPassed: true, atomicBoundary: true, receiptHash: "receipt", noDuplicate: false, approvalPresent: true, tenantMatch: true }).allowed).toBe(false);
  });

  it("M201 gates connector snapshot, changes, reconciliation and drift repair", () => {
    expect(validateM201Snapshot({ organizationId: "org-1", connectorId: "github", snapshotId: "snapshot", resourceType: "issue", cursor: "cursor", localRevisionHash: "local", remoteRevisionHash: "remote", aclHash: "acl", consentPresent: true, capturedAt: 1_000, tenantBound: true }).allowed).toBe(true);
    expect(validateM201Change({ organizationId: "org-1", connectorId: "github", changeId: "change", direction: "local_to_remote", operation: "update", resourceReferenceHash: "resource", baseRevisionHash: "base", localRevisionHash: "local", remoteRevisionHash: "remote", conflictState: "none", idempotencyKey: "idem", tenantMatch: true }).allowed).toBe(true);
    expect(decideM201Reconcile({ organizationId: "org-1", connectorId: "github", reconciliationId: "reconcile", snapshotId: "snapshot", changeIds: ["change"], conflicts: [], mergePlanHash: "merge", reviewApproved: true, safeToApply: true, noClobber: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM201Drift({ organizationId: "org-1", connectorId: "github", driftId: "drift", expectedRevisionHash: "expected", observedRevisionHash: "observed", detectedAt: 1_000, repairedAt: 2_000, repairEvidenceHash: "repair", residualDrift: false, redacted: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM201Reconcile({ organizationId: "org-1", connectorId: "github", reconciliationId: "reconcile", snapshotId: "snapshot", changeIds: ["change"], conflicts: ["conflict"], mergePlanHash: "merge", reviewApproved: true, safeToApply: true, noClobber: true, tenantMatch: true }).allowed).toBe(false);
  });

  it("M202 gates approval requests, signed decisions, revocation and escalation", () => {
    expect(validateM202Request({ organizationId: "org-1", requestId: "request", actionType: "deploy", targetReferenceHash: "target", riskLevel: "high", evidenceHash: "evidence", policyHash: "policy", requestedAt: 1_000, expiresAt: 2_000, requesterHash: "requester", selfApprovalForbidden: true, tenantBound: true }, 1_100).allowed).toBe(true);
    expect(decideM202Approval({ organizationId: "org-1", requestId: "request", decisionId: "decision", outcome: "approve", decisionHash: "decision-hash", approverHash: "approver", signed: true, requestMatch: true, policyMatch: true, decidedAt: 1_200, expiresAt: 2_000, humanPresent: true, tenantMatch: true }, 1_300).allowed).toBe(true);
    expect(decideM202Revocation({ organizationId: "org-1", requestId: "request", revocationId: "revocation", decisionHash: "decision-hash", reasonHash: "reason", revokedAt: 1_500, propagated: true, blocked: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM202Escalation({ organizationId: "org-1", requestId: "request", escalationId: "escalation", fromRisk: "high", toRisk: "critical", reasonHash: "reason", secondReviewerRequired: true, secondReviewerPresent: true, approvalPresent: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM202Approval({ organizationId: "org-1", requestId: "request", decisionId: "decision", outcome: "approve", decisionHash: "decision-hash", approverHash: "approver", signed: true, requestMatch: false, policyMatch: true, decidedAt: 1_200, expiresAt: 2_000, humanPresent: true, tenantMatch: true }, 1_300).allowed).toBe(false);
  });

  it("M203 gates analytics events, privacy aggregates, exports and deletion propagation", () => {
    expect(validateM203Event({ organizationId: "org-1", eventId: "event", metricName: "run.latency", dimensionsHash: "dimensions", subjectHash: "subject", consentPresent: true, samplingRateBps: 1_000, redacted: true, privacyBudgetEpsilon: 1, tenantBound: true }).allowed).toBe(true);
    expect(validateM203Aggregate({ organizationId: "org-1", aggregateId: "aggregate", metricName: "run.latency", windowStart: 1_000, windowEnd: 2_000, sampleCount: 100, cohortCount: 10, epsilon: 1, noiseHash: "noise", minCohortSize: 5, kAnonymitySatisfied: true, approved: true, redacted: true, tenantBound: true }).allowed).toBe(true);
    expect(decideM203Export({ organizationId: "org-1", exportId: "export", aggregateId: "aggregate", purposeHash: "purpose", recipientHash: "recipient", fields: ["mean"], userVisible: true, consentPresent: true, noRawSubjectData: true, expiryAt: 2_000, tenantMatch: true }, 1_100).allowed).toBe(true);
    expect(validateM203Deletion({ organizationId: "org-1", subjectHash: "subject", deletionId: "deletion", stores: ["events", "aggregates"], derivedAggregates: ["aggregate"], propagationEvidenceHash: "propagation", completedAt: 2_000, residualSubjectData: false, tenantMatch: true }).allowed).toBe(true);
    expect(validateM203Aggregate({ organizationId: "org-1", aggregateId: "aggregate", metricName: "run.latency", windowStart: 1_000, windowEnd: 2_000, sampleCount: 3, cohortCount: 1, epsilon: 1, noiseHash: "noise", minCohortSize: 5, kAnonymitySatisfied: false, approved: true, redacted: true, tenantBound: true }).allowed).toBe(false);
  });
});
