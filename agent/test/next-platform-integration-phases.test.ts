import { describe, expect, it } from "vitest";

import { decideProductAction, validateProductApiRequest, validateProductScreenProjection } from "../src/core/product-control-plane-runtime.js";
import { decideDurableJobLease, validateDurableOutboxEvent, validateDurableTransaction } from "../src/core/durable-persistence-runtime.js";
import { decideWorkspacePatch, validateCleanupEvidence, validateSandboxExecution, validateTestRunEvidence } from "../src/core/execution-integration-runtime.js";
import { decideExternalIntegrationRun, validateExternalAdapterManifest, validateExternalIntegrationProbe } from "../src/core/external-integration-gate-runtime.js";
import { decidePilotReleaseGate, validateEndToEndFlowEvidence, validatePilotCohort } from "../src/core/pilot-release-gate-runtime.js";

describe("M64 product control-plane runtime", () => {
  it("validates tenant-safe API, screen states and approval actions", () => {
    expect(validateProductApiRequest({ organizationId: "org", userId: "user", requestId: "request", route: "/api/runs", method: "GET", screen: "runs", csrfProof: "csrf", sessionValid: true, tenantScoped: true }).allowed).toBe(true);
    expect(validateProductScreenProjection({ organizationId: "org", screen: "runs", state: "ready", dataHash: "data", allowedActions: [], tenantScoped: true, generatedAt: 1 }, 2).allowed).toBe(true);
    expect(decideProductAction({ organizationId: "org", approvalId: "approval", action: "run_start", requestedBy: "owner", assignedTo: "reviewer", payloadHash: "payload", expiresAt: 100, alreadyDecided: false }, 1, "reviewer", true).allowed).toBe(true);
  });
});

describe("M65 durable persistence runtime", () => {
  it("requires RLS, idempotency and durable outbox/job boundaries", () => {
    expect(validateDurableTransaction({ organizationId: "org", transactionId: "tx", operation: "update", entityType: "run", entityId: "run", isolation: "serializable", rlsTenantSet: true, idempotencyKey: "idempotent", expectedVersion: 1, approvalPresent: false }).allowed).toBe(true);
    expect(validateDurableOutboxEvent({ organizationId: "org", eventId: "event", aggregateType: "run", aggregateId: "run", eventType: "run.updated", payloadHash: "payload", transactionId: "tx", sequence: 1, published: false, attempts: 0 }).allowed).toBe(true);
    expect(decideDurableJobLease({ organizationId: "org", jobId: "job", workerId: "worker", state: "leased", leaseVersion: 1, leasedAt: 1, leaseExpiresAt: 100, maxAttempts: 3, attempts: 1, payloadHash: "payload" }, 2, "worker").allowed).toBe(true);
  });
});

describe("M66 execution integration runtime", () => {
  it("keeps untrusted execution sandboxed and workspace patches atomic", () => {
    expect(validateSandboxExecution({ organizationId: "org", jobId: "job", sandboxId: "sandbox", imageDigest: "sha256:image", commandHash: "command", allowedPaths: ["src"], networkPolicy: "none", cpuMs: 1000, memoryMb: 256, timeoutMs: 1000, untrustedCode: true, approvalPresent: false }).allowed).toBe(true);
    expect(decideWorkspacePatch({ organizationId: "org", workspaceId: "workspace", baseSnapshotHash: "base", patchHash: "patch", changedPaths: ["src/app.ts"], allowedPaths: ["src"], atomic: true, approvalPresent: true }).allowed).toBe(true);
    expect(validateTestRunEvidence({ organizationId: "org", jobId: "job", runnerId: "runner", commandHash: "command", resultHash: "result", exitCode: 0, durationMs: 100, testsPassed: 2, testsFailed: 0, artifactHash: "artifact", observedAt: 1 }).allowed).toBe(true);
    expect(validateCleanupEvidence({ organizationId: "org", sandboxId: "sandbox", state: "cleaned", deletedPaths: ["/tmp/job"], deletedAt: 1, resourceProbeHash: "probe", noResidualProcess: true }, 2).allowed).toBe(true);
  });
});

describe("M67 external integration gate runtime", () => {
  it("requires reviewed adapters, tenant probes and capability evidence", () => {
    const manifest = { organizationId: "org", adapterId: "github-adapter", adapterKind: "connector" as const, platformOrProvider: "github", version: "1", endpointReference: "https://github.example", capabilityNames: ["issue_read"], sandboxed: true, reviewed: true, environment: "staging" as const };
    const probe = { organizationId: "org", adapterId: "github-adapter", capability: "issue_read", environment: "staging" as const, requestHash: "request", responseHash: "response", status: "passed" as const, exitCode: 0, tenantProbePassed: true, signatureVerified: true, observedAt: 1 };
    expect(validateExternalAdapterManifest(manifest).allowed).toBe(true);
    expect(validateExternalIntegrationProbe(probe, 2).allowed).toBe(true);
    expect(decideExternalIntegrationRun({ organizationId: "org", integrationId: "integration", adapterId: "github-adapter", environment: "staging", capabilities: ["issue_read"], egressConsent: true, approvalPresent: true, evidenceRequired: true }, manifest, [probe]).allowed).toBe(true);
  });
});

describe("M68 pilot release gate runtime", () => {
  it("requires E2E, accessibility, security, rollback and approval evidence", () => {
    const flow = { organizationId: "org", flowId: "connect-to-run", steps: ["connect", "run"], stepEvidenceHashes: ["connect-evidence", "run-evidence"], passed: true, exitCode: 0, tenantIsolationPassed: true, accessibilityPassed: true, securityPassed: true, observedAt: 1 };
    expect(validatePilotCohort({ organizationId: "org", cohortId: "cohort", environment: "staging", tenantIds: ["tenant"], percentage: 10, startAt: 100, durationMs: 60_000, approvalPresent: true, rollbackPlanHash: "rollback" }, 1).allowed).toBe(true);
    expect(validateEndToEndFlowEvidence(flow, 2).allowed).toBe(true);
    expect(decidePilotReleaseGate({ organizationId: "org", releaseId: "release", requiredFlowIds: ["connect-to-run"], flowEvidence: [flow], openIncidents: 0, securityFindings: 0, rollbackEvidenceHash: "rollback", approvalPresent: true, gateState: "ready" }).allowed).toBe(true);
  });
});
