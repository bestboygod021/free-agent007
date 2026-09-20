import { describe, expect, it } from "vitest";
import {
  decideM129Migration,
  decideM129StreamResume,
  validateM129ApiContract,
  validateM129Error,
} from "../src/core/api-evolution-runtime.js";
import {
  decideM130Admission,
  decideM130Egress,
  validateM130Artifact,
  validateM130SecretLease,
} from "../src/core/artifact-supply-chain-runtime.js";
import {
  decideM131Assignment,
  decideM131Escalation,
  validateM131Approval,
  validateM131DecisionRecord,
} from "../src/core/approval-operations-runtime.js";
import {
  decideM132Context,
  validateM132Freshness,
  validateM132Index,
  validateM132Source,
} from "../src/core/knowledge-freshness-runtime.js";
import {
  decideM133Cutover,
  validateM133BackupRestore,
  validateM133Drill,
  validateM133ReleasePlan,
} from "../src/core/self-host-cutover-runtime.js";

describe("M129-M133 deterministic contract kernels", () => {
  it("M129 gates API evolution, errors, stream resume and migration", () => {
    expect(validateM129ApiContract({ organizationId: "org-1", apiId: "runs", protocol: "rest", version: "v2", operation: "create", lifecycle: "stable", requestSchemaHash: "request", responseSchemaHash: "response", tenantScoped: true, documented: true, backwardsCompatible: true, compatibilityWindowDays: 30 }).allowed).toBe(true);
    expect(validateM129Error({ organizationId: "org-1", errorId: "error", code: "RATE_LIMIT", class: "rate_limit", httpStatus: 429, retryable: true, publicMessage: "retry later", internalDetailHash: "internal", correlationId: "correlation", redacted: true }).allowed).toBe(true);
    expect(decideM129StreamResume({ organizationId: "org-1", streamId: "stream", lastEventId: "event-1", protocolVersion: "v2", tenantMatch: true, cursorExpired: false, replayLimit: 100, eventsRedacted: true, terminalEventSeen: false }).allowed).toBe(true);
    expect(decideM129Migration({ organizationId: "org-1", apiId: "runs", fromVersion: "v1", toVersion: "v2", breakingChanges: true, compatibilityWindowDays: 30, migrationGuideHash: "guide", consumerTestHash: "tests", rollbackTested: true, approvalPresent: true, noSilentBreakingChange: true }).allowed).toBe(true);
    expect(decideM129StreamResume({ organizationId: "org-1", streamId: "stream", lastEventId: "event-1", protocolVersion: "v2", tenantMatch: false, cursorExpired: false, replayLimit: 100, eventsRedacted: true, terminalEventSeen: false }).allowed).toBe(false);
  });

  it("M130 gates artifact admission, attestation, secret leases and egress", () => {
    const policy = { organizationId: "org-1", allowedLicenses: ["MIT"], deniedCapabilities: ["network_admin"], requireSignature: true, requireSbom: true, requireAttestation: true, allowedSourceTrust: ["signed_registry", "ci"] as const, reviewed: true };
    const artifact = { organizationId: "org-1", artifactId: "tool", version: "1.0.0", packageDigest: "digest", signatureHash: "signature", sbomHash: "sbom", attestationHash: "attestation", provenanceHash: "provenance", license: "MIT", runtime: "sandbox" as const, capabilities: ["read_workspace"], sourceTrust: "signed_registry" as const, sandboxed: true };
    expect(validateM130Artifact(artifact, policy).allowed).toBe(true);
    expect(decideM130Admission(artifact, policy).allowed).toBe(true);
    expect(validateM130SecretLease({ organizationId: "org-1", leaseId: "lease", reference: "opaque-ref", scopeHash: "scope", issuedAt: Date.now() - 1000, expiresAt: Date.now() + 60_000, sandboxed: true, revoked: false, oneShot: true }, Date.now()).allowed).toBe(true);
    expect(decideM130Egress({ organizationId: "org-1", artifactId: "tool", destinationDomain: "api.example", contentHash: "content", allowlisted: true, dlpPassed: true, outputRedacted: true, approvalPresent: true, userConsent: true }).allowed).toBe(true);
    expect(validateM130Artifact({ ...artifact, capabilities: ["network_admin"] }, policy).allowed).toBe(false);
  });

  it("M131 gates human approval requests, assignments, decisions and escalation", () => {
    expect(validateM131Approval({ organizationId: "org-1", requestId: "request", subjectType: "release", subjectHash: "subject", queue: "release", risk: "high", requestedByHash: "requester", evidenceHash: "evidence", expiresAt: Date.now() + 60_000, separationRequired: true, customerImpactRedacted: true }, Date.now()).allowed).toBe(true);
    expect(decideM131Assignment({ organizationId: "org-1", requestId: "request", reviewerHash: "reviewer", reviewerRole: "security", assignedAt: 1, selfReviewForbidden: true, secondReviewerRequired: true, secondReviewerPresent: true, unavailableAfter: 1000 }).allowed).toBe(true);
    expect(validateM131DecisionRecord({ organizationId: "org-1", requestId: "request", reviewerHash: "reviewer", decision: "approve", reasonHash: "reason", observedAt: Date.now(), evidenceReviewed: true, conflictOfInterest: false, signatureReference: "signature" }).allowed).toBe(true);
    expect(decideM131Escalation({ organizationId: "org-1", requestId: "request", fromLevel: 1, toLevel: 2, trigger: "timeout", notifiedRole: "admin", approvalPresent: false, escalatedAt: Date.now(), customerImpactRedacted: true }).allowed).toBe(true);
    expect(validateM131Approval({ organizationId: "org-1", requestId: "request", subjectType: "deletion", subjectHash: "subject", queue: "deletion", risk: "critical", requestedByHash: "requester", evidenceHash: "evidence", expiresAt: Date.now() + 60_000, separationRequired: false, customerImpactRedacted: true }, Date.now()).allowed).toBe(false);
  });

  it("M132 gates trusted ACL context, freshness, lineage and repository indexes", () => {
    expect(validateM132Source({ organizationId: "org-1", projectId: "project", sourceId: "source", kind: "repository", contentHash: "content", lineageHash: "lineage", aclSubjectHash: "subject", trust: "git", piiRedacted: true, deletionMarked: false, capturedAt: Date.now() }).allowed).toBe(true);
    expect(decideM132Context({ organizationId: "org-1", queryHash: "query", maxTokens: 100, maxItems: 2, requireFresh: true, candidates: [{ organizationId: "org-1", sourceId: "source", path: "src/a.ts", tokenCount: 20, relevance: 0.9, aclAllowed: true, trust: "git", stale: false, contentHash: "content", lineageHash: "lineage" }] }).allowed).toBe(true);
    expect(validateM132Freshness({ organizationId: "org-1", sourceId: "source", capturedAt: 1, checkedAt: 2, maxAgeSeconds: 60, sourceRevisionHash: "old", observedRevisionHash: "new", stale: true, deletionMarked: false, refreshPlanHash: "refresh" }).allowed).toBe(true);
    expect(validateM132Index({ organizationId: "org-1", projectId: "project", snapshotHash: "snapshot", rootHash: "root", fileCount: 2, symbolCount: 4, importEdgeCount: 3, incremental: true, previousIndexHash: "previous", aclFiltered: true, sourceTrust: "workspace" }).allowed).toBe(true);
    expect(decideM132Context({ organizationId: "org-1", queryHash: "query", maxTokens: 100, maxItems: 2, requireFresh: true, candidates: [{ organizationId: "org-2", sourceId: "other", path: "secret", tokenCount: 20, relevance: 1, aclAllowed: true, trust: "git", stale: false, contentHash: "content", lineageHash: "lineage" }] }).allowed).toBe(false);
  });

  it("M133 gates self-host release, backup restore, cutover and resilience drills", () => {
    expect(validateM133ReleasePlan({ organizationId: "org-1", releaseId: "release", version: "1.0.0", target: "compose", imageDigest: "image", configSchemaHash: "config", sbomHash: "sbom", signatureHash: "signature", migrationPlanHash: "migration", rollbackPlanHash: "rollback", tlsConfigured: true, noClobberConfig: true, approvalPresent: true }).allowed).toBe(true);
    expect(validateM133BackupRestore({ organizationId: "org-1", backupId: "backup", createdAt: Date.now() - 1000, encrypted: true, checksum: "checksum", retentionUntil: Date.now() + 60_000, restoreTested: true, restoredVersion: "1.0.0", rtoSeconds: 10, rpoSeconds: 5, exitCode: 0, operatorHash: "operator" }, Date.now()).allowed).toBe(true);
    expect(decideM133Cutover({ organizationId: "org-1", releaseId: "release", stage: "canary", artifactDigest: "artifact", canaryPercent: 10, smokeEvidenceHash: "smoke", openIncident: false, errorBudgetAvailable: true, approvalPresent: true, rollbackReady: true, localFallbackAvailable: true }).allowed).toBe(true);
    expect(validateM133Drill({ organizationId: "org-1", drillId: "drill", kind: "process_restart", blastRadius: "single_worker", approvalPresent: false, sandboxed: true, steadyStateHash: "steady", recoveryEvidenceHash: "recovery", observedRecoverySeconds: 10, recoveryBudgetSeconds: 60, noDataLoss: true, customerImpactRedacted: true }).allowed).toBe(true);
    expect(decideM133Cutover({ organizationId: "org-1", releaseId: "release", stage: "promote", artifactDigest: "artifact", canaryPercent: 10, smokeEvidenceHash: "smoke", openIncident: false, errorBudgetAvailable: true, approvalPresent: true, rollbackReady: true, localFallbackAvailable: true }).allowed).toBe(false);
  });
});
