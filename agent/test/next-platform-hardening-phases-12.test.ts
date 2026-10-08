import { describe, expect, it } from "vitest";
import { decideM184Compatibility, decideM184StateHandoff, validateM184Adapter, validateM184NodeBinding } from "../src/core/graph-interop-runtime.js";
import { decideM185Refresh, decideM185Retrieval, validateM185CodeEvidence, validateM185Snapshot } from "../src/core/repository-intelligence-runtime.js";
import { decideM186Disclosure, decideM186PreferenceUpdate, validateM186Aggregate, validateM186Feedback } from "../src/core/human-feedback-runtime.js";
import { decideM187Advisory, decideM187Response, validateM187Dependency, validateM187Update } from "../src/core/dependency-risk-runtime.js";
import { decideM188Cutover, decideM188Migration, validateM188Consumer, validateM188Schema } from "../src/core/schema-evolution-runtime.js";

describe("M184-M188 deterministic contract kernels", () => {
  it("M184 gates graph adapters, state handoff, node binding and compatibility", () => {
    expect(validateM184Adapter({ organizationId: "org-1", adapterId: "adapter", engine: "langgraph", protocolVersion: "1.0", graphHash: "graph", stateSchemaHash: "state", checkpointFormat: "checkpoint-v1", transitionPolicyHash: "policy", state: "verified", deterministic: true, supportsResume: true, sandboxed: true, approved: true, tenantBound: true }).allowed).toBe(true);
    expect(decideM184StateHandoff({ organizationId: "org-1", handoffId: "handoff", adapterId: "adapter", sourceEngine: "internal", targetEngine: "langgraph", sequence: 2, stateHash: "state", checkpointHash: "checkpoint", capability: "resume", issuedAt: 1_000, expiresAt: 2_000, noSecrets: true, approvalPresent: true, tenantMatch: true }, 1_100).allowed).toBe(true);
    expect(validateM184NodeBinding({ organizationId: "org-1", adapterId: "adapter", nodeId: "node", inputSchemaHash: "input", outputSchemaHash: "output", allowedTools: ["read"], policyHash: "policy", sandboxed: true, noTransitiveTools: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM184Compatibility({ organizationId: "org-1", adapterId: "adapter", compatibilityId: "compat", internalVersion: "1.0", externalVersion: "1.0", migrationHash: "migration", backwardsCompatible: true, replayable: true, approvalPresent: true, evidenceHash: "evidence", tenantMatch: true }).allowed).toBe(true);
    expect(decideM184StateHandoff({ organizationId: "org-1", handoffId: "handoff", adapterId: "adapter", sourceEngine: "internal", targetEngine: "langgraph", sequence: 2, stateHash: "state", checkpointHash: "checkpoint", capability: "resume", issuedAt: 1_000, expiresAt: 1_050, noSecrets: true, approvalPresent: true, tenantMatch: true }, 1_100).allowed).toBe(false);
  });

  it("M185 gates repository snapshots, exact-commit retrieval, code evidence and refresh", () => {
    expect(validateM185Snapshot({ organizationId: "org-1", snapshotId: "snapshot", repositoryReference: "repo", commitHash: "commit", snapshotHash: "snapshot-hash", indexHash: "index", aclHash: "acl", pathCount: 10, state: "indexed", consentPresent: true, secretsRedacted: true, tenantBound: true }).allowed).toBe(true);
    expect(decideM185Retrieval({ organizationId: "org-1", snapshotId: "snapshot", retrievalId: "retrieval", queryHash: "query", expectedCommitHash: "commit", pathAllowlist: ["src/"], resultCount: 1, evidenceHashes: ["evidence"], exactCommit: true, aclChecked: true, fresh: true, redacted: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM185CodeEvidence({ organizationId: "org-1", snapshotId: "snapshot", evidenceId: "evidence", path: "src/index.ts", lineStart: 1, lineEnd: 4, symbol: "entry", contentHash: "content", snapshotMatch: true, aclChecked: true, redacted: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM185Refresh({ organizationId: "org-1", snapshotId: "snapshot", refreshId: "refresh", newCommitHash: "commit-2", oldIndexHash: "index", newIndexHash: "index-2", deletedPaths: ["old.ts"], deletionEvidenceHash: "deletion", approvalPresent: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM185Retrieval({ organizationId: "org-1", snapshotId: "snapshot", retrievalId: "retrieval", queryHash: "query", expectedCommitHash: "commit", pathAllowlist: ["src/"], resultCount: 1, evidenceHashes: ["evidence"], exactCommit: false, aclChecked: true, fresh: true, redacted: true, tenantMatch: true }).allowed).toBe(false);
  });

  it("M186 gates consented feedback, privacy-reviewed aggregation, preference updates and disclosure", () => {
    expect(validateM186Feedback({ organizationId: "org-1", feedbackId: "feedback", taskId: "task", subjectHash: "subject", label: "approve", score: 1, rubricHash: "rubric", sourceHash: "source", consentPresent: true, redacted: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM186Aggregate({ organizationId: "org-1", aggregateId: "aggregate", taskFamily: "coding", sampleCount: 10, positiveCount: 8, negativeCount: 2, meanScore: 0.8, metricHash: "metric", privacyReviewed: true, biasReviewed: true, noDirectModelUpdate: true, approved: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM186PreferenceUpdate({ organizationId: "org-1", updateId: "update", datasetHash: "dataset", evaluationHash: "evaluation", canaryHash: "canary", rollbackHash: "rollback", bounded: true, approvalPresent: true, regressionPassed: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM186Disclosure({ organizationId: "org-1", disclosureId: "disclosure", purposeHash: "purpose", retentionSeconds: 3_600, userVisible: true, optOutAvailable: true, noTrainingByDefault: true, approved: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM186Feedback({ organizationId: "org-1", feedbackId: "feedback", taskId: "task", subjectHash: "subject", label: "approve", score: 1, rubricHash: "rubric", sourceHash: "source", consentPresent: false, redacted: true, tenantMatch: true }).allowed).toBe(false);
  });

  it("M187 gates dependency manifests, advisories, updates and bounded response", () => {
    expect(validateM187Dependency({ organizationId: "org-1", dependencyId: "dependency", packageName: "safe-lib", version: "1.0.0", digest: "digest", lockHash: "lock", license: "MIT", kind: "direct", vulnerabilityScanHash: "scan", licenseAllowed: true, approved: true, tenantBound: true }).allowed).toBe(true);
    expect(decideM187Advisory({ organizationId: "org-1", advisoryId: "advisory", dependencyId: "dependency", severity: "high", cveReference: "CVE-1", affectedRange: "<1.1.0", fixedVersion: "1.1.0", exploitabilityHash: "exploit", evidenceHash: "evidence", active: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM187Update({ organizationId: "org-1", dependencyId: "dependency", updateId: "update", fromVersion: "1.0.0", toVersion: "1.1.0", newDigest: "digest-2", diffHash: "diff", testEvidenceHash: "tests", licenseAllowed: true, rollbackVersion: "1.0.0", approvalPresent: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM187Response({ organizationId: "org-1", responseId: "response", dependencyId: "dependency", action: "patch", reasonHash: "reason", severity: "high", approvalPresent: true, bounded: true, evidenceHash: "evidence", noProductionMutation: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM187Response({ organizationId: "org-1", responseId: "response", dependencyId: "dependency", action: "accept_risk", reasonHash: "reason", severity: "critical", approvalPresent: true, bounded: true, evidenceHash: "evidence", noProductionMutation: true, tenantMatch: true }).allowed).toBe(false);
  });

  it("M188 gates versioned schemas, expand-contract migration, consumers and cutover", () => {
    expect(validateM188Schema({ organizationId: "org-1", schemaId: "run", version: 1, fields: ["id", "state"], compatibility: "backward", schemaHash: "schema", policyHash: "policy", state: "approved", tenantBound: true, approved: true }).allowed).toBe(true);
    expect(decideM188Migration({ organizationId: "org-1", migrationId: "migration", schemaId: "run", fromVersion: 1, toVersion: 2, migrationHash: "migration", state: "backfilled", expandContract: true, backfillEvidenceHash: "backfill", rollbackHash: "rollback", approvalPresent: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM188Consumer({ organizationId: "org-1", schemaId: "run", consumerId: "consumer", acceptedVersion: 2, contractTestHash: "contract", unknownFieldPolicy: "ignore", replayPassed: true, tenantMatch: true, approved: true }).allowed).toBe(true);
    expect(decideM188Cutover({ organizationId: "org-1", cutoverId: "cutover", schemaId: "run", targetVersion: 2, consumerCount: 1, allConsumersProven: true, rollbackReady: true, evidenceHash: "evidence", approvalPresent: true, bounded: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM188Migration({ organizationId: "org-1", migrationId: "migration", schemaId: "run", fromVersion: 2, toVersion: 1, migrationHash: "migration", state: "planned", expandContract: false, backfillEvidenceHash: "backfill", rollbackHash: "rollback", approvalPresent: true, tenantMatch: true }).allowed).toBe(false);
  });
});
