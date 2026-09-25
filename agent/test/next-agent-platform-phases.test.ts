import { describe, expect, it } from "vitest";
import {
  decideAgentToolTarget,
  decideStructuredOutputRecovery,
  validateAgentDelegation,
  validateAgentStreamResume,
} from "../src/core/agent-delegation-stream-runtime.js";
import {
  decideWorkflowJobLease,
  decideWorkflowRetry,
  validateWorkflowDeadLetter,
  validateWorkflowTrigger,
} from "../src/core/workflow-queue-runtime.js";
import {
  decideConnectorOperation,
  decideConnectorRateLimit,
  validateConnectorConnection,
  validateGitHubAppInstallation,
} from "../src/core/connector-platform-runtime.js";
import {
  decidePrivacyErasure,
  decidePrivacyOutputFilter,
  validateM102RetentionPolicy,
  validateM102TenantIsolationProbe,
} from "../src/core/privacy-retention-runtime.js";
import {
  decideM103RegressionGate,
  validateEndToEndReleaseEvidence,
  validateEvaluationDataset,
  validateEvaluationRun,
} from "../src/core/evaluation-quality-runtime.js";

describe("M99-M103 deterministic contract kernels", () => {
  it("M99 bounds delegation, stream replay, repair and tool targets", () => {
    expect(validateAgentDelegation({
      organizationId: "org-1", delegationId: "del-1", parentTaskId: "parent", childTaskId: "child",
      issuerHash: "issuer", recipientHash: "recipient", mode: "parallel", inputSchemaHash: "in",
      outputSchemaHash: "out", allowedTools: ["read_file"], allowedPaths: ["src"], tokenBudget: 1000,
      expiresAt: Date.now() + 60_000, approvalPresent: false, nonce: "nonce-1",
    }).allowed).toBe(true);
    expect(validateAgentStreamResume({ organizationId: "org-1", streamId: "stream", taskId: "task", lastEventId: "evt-4", requestedAt: Date.now(), eventsRedacted: true, terminalEventSeen: false, tenantMatch: true }).allowed).toBe(true);
    expect(decideStructuredOutputRecovery({ organizationId: "org-1", taskId: "task", schemaHash: "schema", outputHash: "output", valid: false, repairAttempts: 2, refusalDetected: false, repairEvidenceHash: "repair", humanReview: true }).allowed).toBe(true);
    expect(decideAgentToolTarget({ organizationId: "org-1", taskId: "task", targetId: "target", kind: "api", target: "https://example.test", allowed: true, approvalPresent: true, untrustedInputSeparated: true, pathRelative: true, endpointHttps: true, idempotencyKey: "idem" }).allowed).toBe(true);
    expect(decideAgentToolTarget({ organizationId: "org-1", taskId: "task", targetId: "target", kind: "api", target: "http://unsafe", allowed: true, approvalPresent: true, untrustedInputSeparated: true, pathRelative: true, endpointHttps: false, idempotencyKey: "idem" }).allowed).toBe(false);
  });

  it("M100 validates triggers, leases, bounded retries and redacted DLQ", () => {
    expect(validateWorkflowTrigger({ organizationId: "org-1", triggerId: "trg", workflowId: "flow", kind: "event", eventType: "run.completed", sourceAllowlisted: true, consentPresent: true, enabled: true, dedupeKey: "run-id", maxConcurrency: 2, payloadSchemaHash: "schema" }).allowed).toBe(true);
    expect(decideWorkflowJobLease({ organizationId: "org-1", jobId: "job", workflowId: "flow", triggerId: "trg", state: "queued", payloadHash: "payload", idempotencyKey: "idem", attempt: 0, maxAttempts: 3, notBefore: Date.now() - 1, priority: 1, traceId: "trace" }).allowed).toBe(true);
    expect(decideWorkflowRetry({ organizationId: "org-1", jobId: "job", attempt: 1, maxAttempts: 3, errorClass: "rate_limit", retryAfterMs: 1000, idempotent: true, sideEffectCommitted: false }).allowed).toBe(true);
    expect(validateWorkflowDeadLetter({ organizationId: "org-1", jobId: "job", finalAttempt: 3, failureHash: "failure", payloadRedacted: true, replayRequiresApproval: true, operatorHash: "operator" }).allowed).toBe(true);
    expect(decideWorkflowRetry({ organizationId: "org-1", jobId: "job", attempt: 1, maxAttempts: 3, errorClass: "policy", idempotent: true, sideEffectCommitted: false }).allowed).toBe(false);
  });

  it("M101 requires consent, least privilege and rate-limit cooldown", () => {
    expect(validateConnectorConnection({ organizationId: "org-1", connectionId: "conn", provider: "github", accountReference: "account", oauthStateHash: "state", pkceVerified: true, requestedScopes: ["repo:read"], grantedScopes: ["repo:read"], credentialReference: "ref-opaque", consentRecorded: true, expiresAt: Date.now() + 60_000, revoked: false }).allowed).toBe(true);
    expect(validateGitHubAppInstallation({ organizationId: "org-1", installationId: "installation", repositoryAllowlist: ["org/repo"], permissionManifestHash: "manifest", installationTokenReference: "ref-installation", webhookSecretReference: "ref-webhook", webhookSignatureVerified: true, shortLivedToken: true, approved: true }).allowed).toBe(true);
    expect(decideConnectorOperation({ organizationId: "org-1", connectionId: "conn", provider: "github", operation: "write", resource: "org/repo/issues", scopeGranted: true, resourceAllowlisted: true, approvalPresent: true, idempotencyKey: "idem", requestHash: "request", readOnlyMode: false }).allowed).toBe(true);
    expect(decideConnectorRateLimit({ organizationId: "org-1", connectionId: "conn", provider: "github", remaining: 0, resetAt: Date.now() + 1000, retryAfterMs: 1000, responseClass: "rate_limited", cooldownApplied: true, rotatedCredential: false }).allowed).toBe(true);
    expect(decideConnectorRateLimit({ organizationId: "org-1", connectionId: "conn", provider: "github", remaining: 0, resetAt: Date.now() + 1000, responseClass: "rate_limited", cooldownApplied: false, rotatedCredential: false }).allowed).toBe(false);
  });

  it("M102 enforces reviewed retention, erasure evidence and tenant-safe output", () => {
    expect(validateM102RetentionPolicy({ organizationId: "org-1", policyId: "policy", dataClass: "workspace", retentionDays: 30, deletionGraceDays: 2, legalHoldAllowed: true, region: "local", reviewed: true, defaultDenyUnknownClass: true }).allowed).toBe(true);
    expect(decidePrivacyErasure({ organizationId: "org-1", requestId: "request", subjectHash: "subject", requestedAction: "erase", scope: "workspace", receivedAt: Date.now(), identityVerified: true, legalHold: false, approvalPresent: true, propagationPlanHash: "plan", tombstoneHash: "tombstone" }).allowed).toBe(true);
    expect(validateM102TenantIsolationProbe({ organizationId: "org-1", probeId: "probe", actorTenantId: "tenant-a", targetTenantId: "tenant-b", attemptedResource: "run", denied: true, responseRedacted: true, queryBoundToTenant: true }).allowed).toBe(true);
    expect(decidePrivacyOutputFilter({ organizationId: "org-1", outputHash: "output", dataClasses: ["workspace"], containsSecret: false, containsOtherTenantData: false, redacted: true, sourceTenantId: "tenant-a", targetTenantId: "tenant-a", humanReview: false }).allowed).toBe(true);
    expect(decidePrivacyOutputFilter({ organizationId: "org-1", outputHash: "output", dataClasses: ["secret"], containsSecret: true, containsOtherTenantData: false, redacted: false, sourceTenantId: "tenant-a", targetTenantId: "tenant-a", humanReview: true }).allowed).toBe(false);
  });

  it("M103 gates dataset provenance, replay, regression and E2E release evidence", () => {
    expect(validateEvaluationDataset({ organizationId: "org-1", datasetId: "dataset", version: "v1", datasetHash: "dataset-hash", provenanceHash: "provenance", piiRedacted: true, contaminationChecked: true, cases: 10, rubricHash: "rubric", approved: true }).allowed).toBe(true);
    expect(validateEvaluationRun({ organizationId: "org-1", runId: "run", datasetId: "dataset", datasetVersion: "v1", mode: "offline", modelReference: "local:model", seed: 42, caseCount: 10, completedCases: 10, score: 0.9, safetyViolations: 0, latencyP95Ms: 500, resultHash: "result" }).allowed).toBe(true);
    expect(decideM103RegressionGate({ organizationId: "org-1", gateId: "gate", baselineScore: 0.8, candidateScore: 0.82, allowedRegression: 0.02, safetyBaseline: 1, safetyCandidate: 1, latencyP95Ms: 500, latencyBudgetMs: 1000, status: "pass", approvalPresent: true }).allowed).toBe(true);
    expect(validateEndToEndReleaseEvidence({ organizationId: "org-1", evidenceId: "e2e", scenarioId: "happy-path", steps: ["request", "approve", "pr"], tenantIsolationPassed: true, securityScanPassed: true, accessibilityPassed: true, loadEvidenceHash: "load", artifactsRedacted: true, exitCode: 0, rollbackEvidenceHash: "rollback" }).allowed).toBe(true);
    expect(decideM103RegressionGate({ organizationId: "org-1", gateId: "gate", baselineScore: 0.9, candidateScore: 0.7, allowedRegression: 0.02, safetyBaseline: 1, safetyCandidate: 0.8, latencyP95Ms: 2000, latencyBudgetMs: 1000, status: "fail", approvalPresent: true }).allowed).toBe(false);
  });
});
