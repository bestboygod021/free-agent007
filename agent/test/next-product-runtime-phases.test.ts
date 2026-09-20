import { describe, expect, it } from "vitest";

import { decideExperienceClientAction, decideExperienceRelease, validateExperienceAccessibilityEvidence, validateExperienceScreen } from "../src/core/product-experience-runtime.js";
import { decideBenchmarkRegressionGate, decideBenchmarkRun, validateBenchmarkScenario, validateBenchmarkScoreEvidence } from "../src/core/evaluation-harness-runtime.js";
import { decideExecutionTestResult, validateExecutionSandbox, validateSandboxCleanup, validateWorkspacePatch } from "../src/core/execution-fabric-runtime.js";
import { decideDeliveryConnectorAction, decideWebhookIngress, validateConnectorApp, validateConnectorRateLimit } from "../src/core/connector-delivery-runtime.js";
import { decideSelfHostRelease, validateCiPipelineEvidence, validateSelfHostArtifact, validateSelfHostUpgrade } from "../src/core/self-host-release-runtime.js";

describe("M74 product experience runtime", () => {
  it("gates screen states, tenant-safe actions and accessibility", () => {
    expect(validateExperienceScreen({ organizationId: "org", screenId: "runs", surface: "web", route: "/runs", supportedStates: ["empty", "loading", "ready", "error", "degraded"], defaultState: "ready", locale: "fa-IR", theme: "system", rtlSupported: true, tenantScoped: true, labelsHash: "labels" }).allowed).toBe(true);
    expect(decideExperienceClientAction({ organizationId: "org", actorId: "user", actionId: "read-runs", method: "GET", route: "/api/runs", targetOrganizationId: "org", requiresApproval: false, approvalPresent: false, localMode: true }).allowed).toBe(true);
    expect(validateExperienceAccessibilityEvidence({ organizationId: "org", screenId: "runs", axeReportHash: "axe", keyboardNavigationPassed: true, contrastPassed: true, screenReaderPassed: true, rtlPassed: true, reducedMotionPassed: true, checkedAt: 1 }).allowed).toBe(true);
    expect(decideExperienceRelease({ organizationId: "org", surface: "web", artifactHash: "artifact", accessibilityEvidenceHash: "a11y", errorStateEvidenceHash: "errors", approvalPresent: true, production: true }).allowed).toBe(true);
    expect(decideExperienceClientAction({ organizationId: "org", actorId: "user", actionId: "cross-tenant", method: "DELETE", route: "/api/runs/1", targetOrganizationId: "other-org", requiresApproval: true, approvalPresent: true, idempotencyKey: "idem", localMode: false }).allowed).toBe(false);
  });
});

describe("M75 evaluation harness runtime", () => {
  it("requires provenance, blind scoring and regression evidence", () => {
    const scenario = { organizationId: "org", scenarioId: "scenario-1", taskKind: "coding" as const, inputHash: "input", expectedOutputSchemaHash: "schema", rubricHash: "rubric", provenanceHash: "provenance", untrustedInput: true, secretScanPassed: true };
    const run = { organizationId: "org", runId: "run-1", datasetHash: "dataset", scenarioIds: ["scenario-1"], modelReference: "local:model", computeMode: "local" as const, seed: 7, scorerVersion: "scorer-1", blindScoring: true, approvalPresent: false };
    expect(validateBenchmarkScenario(scenario).allowed).toBe(true);
    expect(decideBenchmarkRun(run, [scenario]).allowed).toBe(true);
    expect(validateBenchmarkScoreEvidence({ organizationId: "org", runId: "run-1", scenarioId: "scenario-1", outputHash: "output", score: 0.9, threshold: 0.8, status: "pass", scorerHash: "scorer", contaminationChecked: true, safetyChecked: true, latencyMs: 100 }).allowed).toBe(true);
    expect(decideBenchmarkRegressionGate({ organizationId: "org", gateId: "gate", baselineRunId: "baseline", candidateRunId: "run-1", maxRegressionPercent: 2, candidateScore: 0.79, baselineScore: 0.8, requiredScenarioCount: 1, allScenarioEvidencePresent: true, approvalPresent: true }).allowed).toBe(true);
    expect(decideBenchmarkRun({ ...run, blindScoring: false }, [scenario]).allowed).toBe(false);
  });
});

describe("M76 execution fabric runtime", () => {
  it("bounds untrusted execution, workspace patches and cleanup", () => {
    expect(validateExecutionSandbox({ organizationId: "org", projectId: "project", jobId: "job", runtime: "node", workspaceSnapshotHash: "snapshot", allowedPaths: ["src"], networkMode: "none", allowedDomains: [], cpuSeconds: 60, memoryMb: 512, timeoutMs: 30_000, untrustedCode: true, approvalPresent: true }).allowed).toBe(true);
    expect(validateWorkspacePatch({ organizationId: "org", projectId: "project", jobId: "job", baseSnapshotHash: "snapshot", patchHash: "patch", touchedPaths: ["src/app.ts"], allowedPaths: ["src"], atomic: true, reverted: false, conflictChecked: true }).allowed).toBe(true);
    expect(decideExecutionTestResult({ organizationId: "org", jobId: "job", runner: "vitest", commandHash: "command", exitCode: 0, outcome: "passed", testCount: 4, failedTestCount: 0, artifactHash: "artifact", outputRedacted: true }).allowed).toBe(true);
    expect(validateSandboxCleanup({ organizationId: "org", jobId: "job", filesystemClean: true, processClean: true, volumeClean: true, secretLeaseRevoked: true, cleanupHash: "cleanup" }).allowed).toBe(true);
    expect(validateWorkspacePatch({ organizationId: "org", projectId: "project", jobId: "job", baseSnapshotHash: "snapshot", patchHash: "patch", touchedPaths: ["../escape"], allowedPaths: ["src"], atomic: true, reverted: false, conflictChecked: true }).allowed).toBe(false);
  });
});

describe("M77 connector delivery runtime", () => {
  it("requires reviewed connector boundaries, signed webhooks and rate-aware actions", () => {
    expect(validateConnectorApp({ organizationId: "org", connectorId: "github-app", platform: "github", authMode: "oauth_app", requestedScopes: ["repo:read"], webhookEndpointReference: "https://example.com/webhook", signingKeyReference: "signing-ref", shortLivedTokenRequired: true, reviewed: true, mode: "free" }).allowed).toBe(true);
    expect(decideWebhookIngress({ organizationId: "org", connectorId: "github-app", deliveryId: "delivery", eventType: "push", payloadHash: "payload", signatureValid: true, observedAt: 95, maxAgeSeconds: 10, dedupeKey: "dedupe", sourceReference: "github" }, 100).allowed).toBe(true);
    expect(validateConnectorRateLimit({ organizationId: "org", connectorId: "github-app", remaining: 5, limit: 10, resetAt: 200, responseClass: "success" }, 100).allowed).toBe(true);
    expect(decideDeliveryConnectorAction({ organizationId: "org", connectorId: "github-app", actorId: "user", actionId: "read", platform: "github", risk: "read", targetReference: "repo:1", scope: "repo:read", approvalPresent: false, idempotencyKey: "idem", mode: "free", targetOrganizationId: "org" }).allowed).toBe(true);
    expect(decideWebhookIngress({ organizationId: "org", connectorId: "github-app", deliveryId: "bad", eventType: "push", payloadHash: "payload", signatureValid: false, observedAt: 95, maxAgeSeconds: 10, dedupeKey: "dedupe", sourceReference: "github" }, 100).allowed).toBe(false);
  });
});

describe("M78 self-host release runtime", () => {
  it("requires CI evidence, signed artifacts, rollback and upgrade rehearsal", () => {
    const artifact = { organizationId: "org", artifactId: "artifact-1", version: "1.2.0", mode: "docker_compose" as const, imageDigest: "sha256:image", sbomHash: "sbom", signatureHash: "signature", vulnerabilityScanPassed: true, licenseScanPassed: true, backupBeforeUpgrade: true, rollbackHash: "rollback" };
    const ci = { organizationId: "org", pipelineId: "ci-1", commitHash: "commit", typecheckPassed: true, testsPassed: true, lintPassed: true, securityScanPassed: true, testCount: 481, artifactHash: "artifact-hash", completedAt: 1 };
    expect(validateSelfHostArtifact(artifact).allowed).toBe(true);
    expect(validateCiPipelineEvidence(ci).allowed).toBe(true);
    expect(decideSelfHostRelease({ organizationId: "org", releaseId: "release", artifactId: "artifact-1", channel: "stable", environment: "production", rollout: "canary", changelogHash: "changelog", approvalPresent: true, rollbackVerified: true, production: true }, artifact, ci).allowed).toBe(true);
    expect(validateSelfHostUpgrade({ organizationId: "org", upgradeId: "upgrade", fromVersion: "1.1.0", toVersion: "1.2.0", migrationDryRunPassed: true, compatibilityCheckPassed: true, backupHash: "backup", rollbackTestPassed: true, downtimeMinutes: 5, operatorId: "operator" }).allowed).toBe(true);
    expect(decideSelfHostRelease({ organizationId: "org", releaseId: "release", artifactId: "artifact-1", channel: "nightly", environment: "production", rollout: "manual", changelogHash: "changelog", approvalPresent: true, rollbackVerified: true, production: true }, artifact, ci).allowed).toBe(false);
  });
});
