import { describe, expect, it } from "vitest";

import { decideAgentRunScheduling, decideAgentToolCall, validateAgentCheckpointEnvelope, validateAgentWorkflowGraph } from "../src/core/agent-orchestration-runtime.js";
import { decideApiStreamSession, validateJobCompletionEvidence, validatePublicApiRequest, validateWorkerLease } from "../src/core/api-worker-runtime.js";
import { decideProviderRoute, validateCostReconciliation, validateProviderOffer, validateProviderQuotaBudget } from "../src/core/provider-economics-runtime.js";
import { decideQualityE2eEvidence, validateQualityAccessibilityEvidence, validateQualityLoadSecurityEvidence, validateQualityScenario } from "../src/core/quality-integration-runtime.js";
import { decideReleaseCutover, validateReleaseCanaryEvidence, validateReleaseCandidate, validateReleaseRollbackEvidence } from "../src/core/release-certification-runtime.js";

describe("M84 agent orchestration runtime", () => {
  it("bounds workflow graphs, schedules, checkpoints and tool calls", () => {
    const graph = { organizationId: "org", workflowId: "workflow", version: "1", nodes: [{ nodeId: "start", kind: "model" as const, capability: "plan", sideEffect: false }, { nodeId: "tool", kind: "tool" as const, capability: "read", sideEffect: false }], edges: [{ from: "start", to: "tool" }], entryNodeId: "start", graphHash: "graph", acyclic: true, approved: true };
    expect(validateAgentWorkflowGraph(graph).allowed).toBe(true);
    expect(decideAgentRunScheduling({ organizationId: "org", runId: "run", workflowId: "workflow", requestedBy: "user", mode: "local", maxSteps: 10, maxRuntimeMs: 30_000, idempotencyKey: "idem", approvalPresent: false, state: "queued" }, graph).allowed).toBe(true);
    expect(validateAgentCheckpointEnvelope({ organizationId: "org", runId: "run", checkpointId: "checkpoint", sequence: 1, stateHash: "state", inputHash: "input", outputHash: "output", toolCallCount: 1, durable: true, encrypted: true, createdAt: 1 }, 2).allowed).toBe(true);
    expect(decideAgentToolCall({ organizationId: "org", runId: "run", toolCallId: "call", toolName: "read", operation: "read", targetOrganizationId: "org", risk: "low", approvalPresent: false, idempotencyKey: "idem" }).allowed).toBe(true);
    expect(decideAgentToolCall({ organizationId: "org", runId: "run", toolCallId: "call", toolName: "deploy", operation: "execute", targetOrganizationId: "other-org", risk: "high", approvalPresent: true, idempotencyKey: "idem" }).allowed).toBe(false);
    expect(validateAgentWorkflowGraph({ ...graph, edges: [{ from: "start", to: "tool" }, { from: "tool", to: "start" }] }).allowed).toBe(false);
  });
});

describe("M85 API and worker runtime", () => {
  it("requires tenant-safe requests, valid leases, resumable redacted streams and completion evidence", () => {
    expect(validatePublicApiRequest({ organizationId: "org", requestId: "request", route: "/api/runs", method: "POST", transport: "rest", schemaHash: "schema", tenantHeaderPresent: true, authContextHash: "auth", idempotencyKey: "idem", bodyHash: "body", localMode: true }).allowed).toBe(true);
    expect(validateWorkerLease({ organizationId: "org", jobId: "job", workerId: "worker", leaseId: "lease", attempt: 1, leasedAt: 1, expiresAt: 100, heartbeatAt: 2, state: "running", fencingToken: 1 }, 3).allowed).toBe(true);
    expect(decideApiStreamSession({ organizationId: "org", sessionId: "session", runId: "run", transport: "sse", cursor: 4, resumeTokenHash: "resume", heartbeatAt: 2, lastClientAck: 3, outputRedacted: true, reconnectAllowed: true }, 3).allowed).toBe(true);
    expect(validateJobCompletionEvidence({ organizationId: "org", jobId: "job", attempt: 1, state: "succeeded", exitCode: 0, outputHash: "output", artifactHash: "artifact", cleanupPassed: true, secretScanPassed: true, acknowledged: true }).allowed).toBe(true);
    expect(validatePublicApiRequest({ organizationId: "org", requestId: "request", route: "/api/runs", method: "POST", transport: "rest", schemaHash: "schema", tenantHeaderPresent: false, authContextHash: "auth", bodyHash: "body", localMode: true }).allowed).toBe(false);
    expect(validateWorkerLease({ organizationId: "org", jobId: "job", workerId: "worker", leaseId: "lease", attempt: 1, leasedAt: 1, expiresAt: 2, heartbeatAt: 2, state: "running", fencingToken: 1 }, 3).allowed).toBe(false);
  });
});

describe("M86 provider economics runtime", () => {
  it("keeps provider routing, quota and cost reconciliation explicit", () => {
    const offer = { organizationId: "org", providerId: "local", modelReference: "local:model", mode: "local" as const, endpointReference: "local:ollama", priceMicrosPerUnit: 0, quotaReference: "quota", privacy: "local_only" as const, termsReviewed: true, healthScore: 1, supportsStructuredOutput: true, fallbackRank: 0 };
    expect(validateProviderOffer(offer).allowed).toBe(true);
    expect(decideProviderRoute({ organizationId: "org", requestId: "request", dataClass: "confidential", allowedModes: ["local"], selectedProviderId: "local", fallbackProviderIds: [], budgetMicros: 0, consentPresent: false, approvalPresent: false, localPreferred: true }, [offer]).allowed).toBe(true);
    expect(validateProviderQuotaBudget({ organizationId: "org", budgetId: "budget", providerId: "local", period: "month", allowanceMicros: 100, usedMicros: 10, requestedMicros: 5, requestsPerMinute: 10, requestsUsedThisMinute: 2, approved: true }).allowed).toBe(true);
    expect(validateCostReconciliation({ organizationId: "org", reconciliationId: "recon", providerId: "local", usageUnits: 10, expectedCostMicros: 0, reportedCostMicros: 0, ledgerHash: "ledger", deltaMicros: 0, reconciled: true, localMode: true }).allowed).toBe(true);
    expect(validateProviderOffer({ ...offer, endpointReference: "http://unsafe", mode: "free_api" }).allowed).toBe(false);
    expect(validateProviderQuotaBudget({ organizationId: "org", budgetId: "budget", providerId: "local", period: "month", allowanceMicros: 10, usedMicros: 10, requestedMicros: 1, requestsPerMinute: 10, requestsUsedThisMinute: 2, approved: true }).allowed).toBe(false);
  });
});

describe("M87 quality integration runtime", () => {
  it("requires reproducible scenarios and complete E2E, load/security and accessibility evidence", () => {
    const scenario = { organizationId: "org", scenarioId: "e2e-1", kind: "e2e" as const, environment: "staging" as const, seed: 7, fixtureHash: "fixture", expectedOutcomeHash: "expected", tenantIsolationRequired: true, untrustedInputPresent: true, secretsRedacted: true, approvalPresent: false };
    expect(validateQualityScenario(scenario).allowed).toBe(true);
    expect(decideQualityE2eEvidence({ organizationId: "org", scenarioId: "e2e-1", runId: "run", steps: [{ name: "login", evidenceHash: "step", exitCode: 0 }], tenantIsolationPassed: true, securityPassed: true, accessibilityPassed: true, artifactHash: "artifact", completedAt: 1 }, scenario).allowed).toBe(true);
    expect(validateQualityLoadSecurityEvidence({ organizationId: "org", evidenceId: "load", kind: "load", runnerReference: "k6", reportHash: "report", threshold: 100, measured: 80, passed: true, secretsRedacted: true, environment: "staging" }).allowed).toBe(true);
    expect(validateQualityAccessibilityEvidence({ organizationId: "org", evidenceId: "a11y", screenId: "runs", axeReportHash: "axe", keyboardPassed: true, contrastPassed: true, screenReaderPassed: true, rtlPassed: true, reducedMotionPassed: true, locale: "fa-IR" }).allowed).toBe(true);
    expect(decideQualityE2eEvidence({ organizationId: "org", scenarioId: "e2e-1", runId: "run", steps: [{ name: "login", evidenceHash: "step", exitCode: 1 }], tenantIsolationPassed: true, securityPassed: true, accessibilityPassed: true, artifactHash: "artifact", completedAt: 1 }, scenario).allowed).toBe(false);
    expect(validateQualityAccessibilityEvidence({ organizationId: "org", evidenceId: "a11y", screenId: "runs", axeReportHash: "axe", keyboardPassed: false, contrastPassed: true, screenReaderPassed: true, rtlPassed: true, reducedMotionPassed: true, locale: "fa-IR" }).allowed).toBe(false);
  });
});

describe("M88 release certification runtime", () => {
  it("gates release candidates, production cutover, canary and rollback", () => {
    const candidate = { organizationId: "org", releaseId: "release", version: "1.0.0", commitHash: "commit", artifactHash: "artifact", sbomHash: "sbom", signatureHash: "signature", ciEvidenceHash: "ci", e2eEvidenceHash: "e2e", securityEvidenceHash: "security", accessibilityEvidenceHash: "a11y", changelogHash: "changelog", backupVerified: true, rollbackVerified: true, approved: true };
    expect(validateReleaseCandidate(candidate).allowed).toBe(true);
    expect(decideReleaseCutover({ organizationId: "org", releaseId: "release", environment: "canary", rollout: "canary", trafficPercent: 10, operatorId: "operator", approvalPresent: false, incidentOpen: false, rollbackHash: "rollback" }, candidate).allowed).toBe(true);
    expect(validateReleaseCanaryEvidence({ organizationId: "org", releaseId: "release", observationId: "observation", trafficPercent: 10, errorRate: 0.01, latencyP95Ms: 200, availability: 0.999, thresholdPassed: true, tenantIsolationPassed: true, observedAt: 1 }).allowed).toBe(true);
    expect(validateReleaseRollbackEvidence({ organizationId: "org", releaseId: "release", rollbackId: "rollback", targetVersion: "0.9.0", backupHash: "backup", commandHash: "command", exitCode: 0, restoredHealth: true, dataIntegrityPassed: true, completedAt: 2 }).allowed).toBe(true);
    expect(decideReleaseCutover({ organizationId: "org", releaseId: "release", environment: "production", rollout: "manual", trafficPercent: 100, operatorId: "operator", approvalPresent: false, incidentOpen: false, rollbackHash: "rollback" }, candidate).allowed).toBe(false);
    expect(validateReleaseCanaryEvidence({ organizationId: "org", releaseId: "release", observationId: "observation", trafficPercent: 10, errorRate: 0.01, latencyP95Ms: 200, availability: 0.999, thresholdPassed: false, tenantIsolationPassed: true, observedAt: 1 }).allowed).toBe(false);
  });
});
