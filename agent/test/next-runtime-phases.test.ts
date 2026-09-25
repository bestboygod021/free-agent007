import { describe, expect, it } from "vitest";

import { guardToolTarget, planModelOutputStream, planStructuredOutputRepair, reduceStreamFrame, validateStructuredOutputAttempt, type StreamState } from "../src/core/agent-interaction-runtime.js";
import { decideConnectorBackoff, decideDatabaseIntrospection, validateGithubInstallation, validateMcpEnvelope, validateSignedOutboundWebhook } from "../src/core/connector-gateway-runtime.js";
import { decideAnalyticsQuery, decideUsageEntitlement, planLifecycleSweep, validateAnalyticsEvent, validateFullTextQuery } from "../src/core/data-lifecycle-analytics-runtime.js";
import { decideCiQualityGate, normalizeAdapterTestResult, planEndToEndScenario, validateAccessibilityEvidence, validateToolchainCell } from "../src/core/quality-ci-runtime.js";
import { decideChaosExperiment, planReleaseCandidate, planSelfHostRecovery, validateSelfHostProfile, validateUpgradePlan } from "../src/core/self-host-resilience-runtime.js";

describe("M39 agent interaction runtime", () => {
  it("bounds repair, streaming and imagined tool targets", () => {
    expect(validateStructuredOutputAttempt({ organizationId: "org", runId: "run", attempt: 1, schemaHash: "schema", outputHash: "output", status: "schema_error", containsSecret: false }).allowed).toBe(true);
    expect(planStructuredOutputRepair({ organizationId: "org", runId: "run", attempt: 1, schemaHash: "schema", outputHash: "output", status: "schema_error", containsSecret: false }).strategy).toBe("schema_repair");
    expect(planModelOutputStream({ organizationId: "org", runId: "run", streamId: "stream", schemaHash: "schema", maxFrames: 10, maxBytes: 1000, resumable: true }).allowed).toBe(true);
    const initial: StreamState = { streamId: "stream", lastSequence: 0, bytes: 0, terminal: false, stateHash: "initial" };
    expect(reduceStreamFrame(initial, { streamId: "stream", sequence: 1, kind: "delta", contentHash: "h", byteLength: 3 }).lastSequence).toBe(1);
    expect(guardToolTarget({ organizationId: "org", kind: "api", host: "api.example.com", method: "POST", allowedPaths: [], allowedHosts: ["api.example.com"], sideEffect: true, approvalPresent: true }).allowed).toBe(true);
  });
});

describe("M40 connector gateway runtime", () => {
  it("requires opaque installations, rate gates, signatures and scoped protocols", () => {
    expect(validateGithubInstallation({ organizationId: "org", installationId: "install", appId: "app", repositoryId: "repo", permission: "read", tokenReference: "vault-ref", expiresAt: 100 }, 2).allowed).toBe(true);
    expect(decideConnectorBackoff({ organizationId: "org", connectorId: "github", remaining: 5, resetAt: 100, now: 2, requestedUnits: 1 }).allowed).toBe(true);
    expect(validateSignedOutboundWebhook({ organizationId: "org", endpointId: "endpoint", eventId: "event", payloadHash: "payload", signingKeyReference: "vault-ref", attempt: 1, idempotencyKey: "idempotent" }).allowed).toBe(true);
    expect(decideDatabaseIntrospection({ organizationId: "org", connectorId: "db", operation: "describe_columns", requestedSchemas: ["public"], grantedSchemas: ["public"], approvalPresent: false }).allowed).toBe(true);
    expect(validateMcpEnvelope({ organizationId: "org", sessionId: "session", requestId: "request", serverIdentityHash: "server", method: "tools/call", capability: "tool:read", nonce: "nonce", issuedAt: 1, expiresAt: 100, sideEffect: false, approvalPresent: false }, 2).allowed).toBe(true);
  });
});

describe("M41 data lifecycle and analytics runtime", () => {
  it("keeps deletion, analytics, entitlement and search tenant-scoped", () => {
    expect(planLifecycleSweep({ organizationId: "org", dataClass: "run", before: 10, legalHoldIds: ["hold"], candidateIds: ["run", "hold"], requestedBy: "admin", approvalPresent: true }).selectedIds).toEqual(["run"]);
    expect(validateAnalyticsEvent({ organizationId: "org", projectId: "project", runId: "run", eventId: "event", name: "provider_call", occurredAt: 1, payloadHash: "payload", sequence: 1 }).allowed).toBe(true);
    expect(decideAnalyticsQuery({ organizationId: "org", visibility: "project", projectId: "project", from: 1, to: 2, metric: "cost" }).allowed).toBe(true);
    expect(decideUsageEntitlement({ organizationId: "org", mode: "free", includedUnits: 10, consumedUnits: 2, requestedUnits: 3, budgetAllowed: true, localOnly: false }).allowed).toBe(true);
    expect(validateFullTextQuery({ organizationId: "org", scope: "project", queryHash: "query", projectId: "project", maxResults: 20, includeDeleted: false }).allowed).toBe(true);
  });
});

describe("M42 quality and CI runtime", () => {
  it("requires pinned toolchains, normalized results and complete gates", () => {
    expect(validateToolchainCell({ organizationId: "org", language: "node", runner: "vitest", imageDigest: "sha256:abcdef12", version: "20", allowed: true }).allowed).toBe(true);
    const result = normalizeAdapterTestResult({ runner: "vitest", exitCode: 0, passed: 3, failed: 0, skipped: 0, durationMs: 10, logHash: "log", artifactHash: "artifact" });
    expect(result.status).toBe("passed");
    expect(planEndToEndScenario({ organizationId: "org", scenarioId: "critical", steps: ["signup", "connect", "plan", "approve", "pr"], environment: "self_host", requiresExternalConnector: false, approvalStepPresent: true }).allowed).toBe(true);
    expect(decideCiQualityGate({ organizationId: "org", commitSha: "abcdef1", requiredSurfaces: ["e2e"], passedSurfaces: ["e2e"], testResults: [result], securityFindings: 0, accessibilityCriticalFindings: 0, approvalPresent: true }).allowed).toBe(true);
    expect(validateAccessibilityEvidence({ organizationId: "org", page: "run", locale: "fa-IR", keyboard: true, focusVisible: true, rtlChecked: true, criticalFindings: 0, reportHash: "report" }).allowed).toBe(true);
  });
});

describe("M43 self-host and resilience runtime", () => {
  it("requires pinned self-host releases, recovery evidence and bounded chaos", () => {
    expect(validateSelfHostProfile({ organizationId: "org", mode: "docker_compose", appVersion: "1.0.0", imageDigests: ["sha256:abcdef12"], databaseUrlReference: "vault-ref", secretStore: "local_encrypted", externalEgressAllowed: false, approvalPresent: false }).allowed).toBe(true);
    expect(planReleaseCandidate({ organizationId: "org", version: "1.0.1", commitSha: "abcdef1", channel: "stable", artifactDigests: ["sha256:abcdef12"], changelogHash: "change", testsPassed: true, securityPassed: true, approvalPresent: true }).allowed).toBe(true);
    expect(planSelfHostRecovery({ organizationId: "org", backupId: "backup", target: "isolated", expectedRpoMs: 10, expectedRtoMs: 100, restoreSteps: ["restore", "verify"], rollbackPlanHash: "rollback", approvalPresent: true }).allowed).toBe(true);
    expect(decideChaosExperiment({ organizationId: "org", experimentId: "chaos", target: "worker", blastRadius: "single_run", durationMs: 1000, stopConditionHash: "stop", isolated: true, approvalPresent: false }).allowed).toBe(true);
    expect(validateUpgradePlan({ organizationId: "org", fromVersion: "1.0.0", toVersion: "1.0.1", migrationPlanHash: "migration", rollbackPlanHash: "rollback", compatibilityChecked: true, backupVerified: true, approvalPresent: true }).allowed).toBe(true);
  });
});
