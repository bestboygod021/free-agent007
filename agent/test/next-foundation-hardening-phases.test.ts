import { describe, expect, it } from "vitest";
import {
  decideM124Replay,
  validateM124AuditEvent,
  validateM124EvidenceBundle,
  validateM124Retention,
} from "../src/core/audit-evidence-ledger-runtime.js";
import {
  decideM125Delegation,
  decideM125RoleChange,
  validateM125MfaRecovery,
  validateM125Session,
} from "../src/core/identity-continuity-runtime.js";
import {
  decideM126Action,
  decideM126Webhook,
  validateM126Consent,
  validateM126Reconciliation,
} from "../src/core/connector-consent-delivery-runtime.js";
import {
  decideM127QualityGate,
  validateM127Corpus,
  validateM127ReleaseEvidence,
  validateM127Replay,
} from "../src/core/evaluation-release-runtime.js";
import {
  decideM128Quota,
  validateM128CostReconciliation,
  validateM128ProviderAllocation,
  validateM128UsageLedger,
} from "../src/core/finops-quota-runtime.js";

describe("M124-M128 deterministic contract kernels", () => {
  it("M124 enforces immutable audit, evidence provenance, replay and retention", () => {
    expect(validateM124AuditEvent({ organizationId: "org-1", eventId: "event", sequence: 1, actorHash: "actor", action: "run.completed", resourceType: "run", resourceReference: "run-1", tenantScopeHash: "tenant", previousHash: "previous", payloadHash: "payload", redacted: true, immutable: true, occurredAt: Date.now() }).allowed).toBe(true);
    expect(validateM124EvidenceBundle({ organizationId: "org-1", evidenceId: "evidence", phase: "M124", kind: "audit", artifactHashes: ["artifact"], commandHash: "command", testEvidenceHash: "tests", securityEvidenceHash: "security", signerHash: "signer", replayable: true, redacted: true, sourceTrust: "ci" }).allowed).toBe(true);
    expect(decideM124Replay({ organizationId: "org-1", replayId: "replay", evidenceId: "evidence", expectedPreviousHash: "previous", actualPreviousHash: "previous", chainValid: true, sequenceValid: true, tenantVisible: true, independentReviewerHash: "reviewer", replayCommandHash: "command" }).allowed).toBe(true);
    expect(validateM124Retention({ organizationId: "org-1", evidenceId: "evidence", retentionClass: "standard", retainUntil: Date.now() + 60_000, legalHold: false, deletionApprovalPresent: false, encryptedReference: "opaque-ref" }).allowed).toBe(true);
    expect(decideM124Replay({ organizationId: "org-1", replayId: "replay", evidenceId: "evidence", expectedPreviousHash: "a", actualPreviousHash: "b", chainValid: false, sequenceValid: true, tenantVisible: true, independentReviewerHash: "reviewer", replayCommandHash: "command" }).allowed).toBe(false);
  });

  it("M125 enforces session revocation, delegation, role separation and MFA recovery", () => {
    expect(validateM125Session({ organizationId: "org-1", sessionId: "session", subjectHash: "subject", authMethod: "passkey", tokenReference: "opaque-ref", issuedAt: Date.now() - 1000, expiresAt: Date.now() + 60_000, lastSeenAt: Date.now(), revoked: false, revocationVersion: 1, mfaSatisfied: true, deviceBound: true }).allowed).toBe(true);
    expect(decideM125Delegation({ organizationId: "org-1", delegationId: "delegation", delegatorHash: "owner", delegateHash: "member", role: "admin", scopeHash: "scope", expiresAt: Date.now() + 60_000, approvalPresent: true, revocable: true, active: true }).allowed).toBe(true);
    expect(decideM125RoleChange({ organizationId: "org-1", membershipId: "membership", actorHash: "admin", subjectHash: "member", fromRole: "member", toRole: "viewer", reasonHash: "reason", approvalPresent: true, separationOfDuties: true, privilegedSessionsRevoked: true }).allowed).toBe(true);
    expect(validateM125MfaRecovery({ organizationId: "org-1", subjectHash: "subject", challengeId: "challenge", method: "backup_code", identityVerified: true, attempts: 1, recoveryReference: "opaque-ref", rotatedAfterUse: true, approvalPresent: true, observedAt: Date.now() }).allowed).toBe(true);
    expect(decideM125Delegation({ organizationId: "org-1", delegationId: "delegation", delegatorHash: "owner", delegateHash: "member", role: "owner", scopeHash: "scope", expiresAt: Date.now() + 60_000, approvalPresent: true, revocable: true, active: true }).allowed).toBe(false);
  });

  it("M126 enforces consent, signed webhook delivery, reconciliation and connector actions", () => {
    expect(validateM126Consent({ organizationId: "org-1", connectorId: "github", grantId: "grant", subjectHash: "subject", provider: "github", scopes: ["repo:read"], purpose: "repository read", mode: "byok", consentRecorded: true, termsReviewed: true, credentialReference: "opaque-ref", expiresAt: Date.now() + 60_000, revoked: false }).allowed).toBe(true);
    expect(decideM126Webhook({ organizationId: "org-1", connectorId: "github", deliveryId: "delivery", eventType: "push", payloadHash: "payload", signatureValid: true, observedAt: Date.now(), maxAgeSeconds: 300, dedupeKey: "dedupe", outboxLinked: true, outputRedacted: true }, Date.now()).allowed).toBe(true);
    expect(validateM126Reconciliation({ organizationId: "org-1", connectorId: "github", reconciliationId: "reconcile", localCursor: 2, remoteCursor: 2, lastEventHash: "event", missingEvents: 0, duplicateEvents: 0, conflicts: 0, replaySafe: true, evidenceHash: "evidence" }).allowed).toBe(true);
    expect(decideM126Action({ organizationId: "org-1", connectorId: "github", actionId: "action", actorHash: "actor", risk: "write", targetOrganizationId: "org-1", scope: "repo:write", idempotencyKey: "idem", approvalPresent: true, mode: "byok", sandboxed: true, localFallbackAvailable: true }).allowed).toBe(true);
    expect(decideM126Webhook({ organizationId: "org-1", connectorId: "github", deliveryId: "delivery", eventType: "push", payloadHash: "payload", signatureValid: false, observedAt: Date.now() - 1000, maxAgeSeconds: 300, dedupeKey: "dedupe", outboxLinked: true, outputRedacted: true }, Date.now()).allowed).toBe(false);
  });

  it("M127 enforces benchmark provenance, deterministic replay, quality and release gates", () => {
    expect(validateM127Corpus({ organizationId: "org-1", corpusId: "corpus", version: "v1", caseCount: 10, corpusHash: "corpus-hash", provenanceHash: "provenance", rubricHash: "rubric", piiRedacted: true, contaminationChecked: true, fixtureLocked: true, approved: true }).allowed).toBe(true);
    expect(validateM127Replay({ organizationId: "org-1", replayId: "replay", corpusId: "corpus", corpusVersion: "v1", modelReference: "local:model", mode: "offline", seed: 42, expectedCases: 10, completedCases: 10, resultHash: "result", environmentHash: "environment", deterministic: true, logsRedacted: true }).allowed).toBe(true);
    expect(decideM127QualityGate({ organizationId: "org-1", gateId: "gate", baselineScore: 0.8, candidateScore: 0.81, allowedRegression: 0.02, baselineSafetyViolations: 1, candidateSafetyViolations: 1, latencyP95Ms: 100, latencyBudgetMs: 150, state: "pass", reviewerHash: "reviewer", approvalPresent: true }).allowed).toBe(true);
    expect(validateM127ReleaseEvidence({ organizationId: "org-1", evidenceId: "evidence", releaseId: "release", scenarioId: "scenario", exitCode: 0, tenantIsolationPassed: true, securityPassed: true, accessibilityPassed: true, loadEvidenceHash: "load", rollbackEvidenceHash: "rollback", artifactsRedacted: true, customerImpactRedacted: true }).allowed).toBe(true);
    expect(decideM127QualityGate({ organizationId: "org-1", gateId: "gate", baselineScore: 0.8, candidateScore: 0.7, allowedRegression: 0.02, baselineSafetyViolations: 1, candidateSafetyViolations: 2, latencyP95Ms: 200, latencyBudgetMs: 150, state: "fail", reviewerHash: "reviewer", approvalPresent: false }).allowed).toBe(false);
  });

  it("M128 enforces append-only usage, quota, provider allocation and reconciliation", () => {
    expect(validateM128UsageLedger({ organizationId: "org-1", entryId: "entry", runId: "run", providerReference: "local:model", mode: "local", unit: "token", quantity: 100, estimatedCost: 0, currency: "USD", idempotencyKey: "idem", appendOnly: true, sourceHash: "source", recordedAt: Date.now() }).allowed).toBe(true);
    expect(decideM128Quota({ organizationId: "org-1", requestId: "request", mode: "free", requestedUnits: 100, usedUnits: 10, quotaLimit: 1000, costEstimate: 0, costLimit: 0, localFallbackAvailable: true, userConsent: true, approvalPresent: false }).allowed).toBe(true);
    expect(validateM128ProviderAllocation({ organizationId: "org-1", allocationId: "allocation", providerReference: "free:model", mode: "free", quotaRemaining: 100, rpmRemaining: 10, privacyBoundaryPassed: true, termsReviewed: true, fallbackRank: 1, selected: true, allocationEvidenceHash: "allocation" }).allowed).toBe(true);
    expect(validateM128CostReconciliation({ organizationId: "org-1", reportId: "report", periodStart: 1, periodEnd: 2, ledgerCost: 1, providerCost: 1.01, varianceAllowed: 0.02, budgetLimit: 2, reconciled: true, sourceHash: "source", reviewerHash: "reviewer" }).allowed).toBe(true);
    expect(decideM128Quota({ organizationId: "org-1", requestId: "request", mode: "paid", requestedUnits: 100, usedUnits: 950, quotaLimit: 1000, costEstimate: 2, costLimit: 1, localFallbackAvailable: false, userConsent: true, approvalPresent: false }).allowed).toBe(false);
  });
});
