import { describe, expect, it } from "vitest";

import { decideIdempotency, decideTenantMutation, planOutboxAppend, type DurableIdempotencyRecord, type TenantSession } from "../src/core/durable-runtime-contract.js";
import { decideSandbox, normalizeTestRun, planSandboxCleanup, validatePatchPlan } from "../src/core/execution-sandbox-contract.js";
import { decideConnectorAction, decideProviderCall, validateOAuthCallback, validateWebhook } from "../src/core/connector-provider-runtime.js";
import { evaluateSloWindow, planRestoreDrill, reconcileCost, validateMetricSample, verifyIncidentAction } from "../src/core/operations-evidence.js";
import { decideApprovalView, evaluateAccessibilitySummary, planSseResume, validateClientCommand, validateScreenModel } from "../src/core/product-surface-contract.js";

describe("M29 durable runtime contract", () => {
  it("keeps mutations, outbox and idempotency tenant-bound", () => {
    const session: TenantSession = { organizationId: "org-1", projectId: "p", actorId: "u", actorRole: "developer", transactionId: "tx" };
    expect(decideTenantMutation({ mutationId: "m", organizationId: "org-1", resource: "run", kind: "insert", idempotencyKey: "i", payloadHash: "p", protectedResource: false }, session).allowed).toBe(true);
    expect(planOutboxAppend([], { eventId: "e", organizationId: "org-1", aggregateId: "run", sequence: 1, type: "run.created", payloadHash: "p", occurredAt: 1 }).allowed).toBe(true);
    const records: DurableIdempotencyRecord[] = [{ organizationId: "org-1", idempotencyKey: "i", requestHash: "p", responseHash: "r", expiresAt: 100 }];
    expect(decideIdempotency(records, "org-1", "i", "p", 1).kind).toBe("replay");
    expect(decideIdempotency(records, "org-1", "i", "different", 1).kind).toBe("conflict");
  });
});

describe("M30 sandbox execution contract", () => {
  it("denies host and credential escape while normalizing evidence", () => {
    expect(decideSandbox({ runId: "r", organizationId: "org", imageDigest: "sha256:abc", allowedPaths: ["src"], networkMode: "none", allowedDomains: [], cpuMillis: 100, memoryMb: 128, timeoutMs: 1000, inheritCredentials: false, hostMounts: [] }).allowed).toBe(true);
    expect(decideSandbox({ runId: "r", organizationId: "org", imageDigest: "sha256:abc", allowedPaths: ["src"], networkMode: "none", allowedDomains: [], cpuMillis: 100, memoryMb: 128, timeoutMs: 1000, inheritCredentials: true, hostMounts: ["/host"] }).allowed).toBe(false);
    expect(validatePatchPlan({ runId: "r", baseRevision: "sha", changes: [{ path: "src/a.ts", operation: "modify", beforeHash: "a", afterHash: "b" }], protectedPaths: ["main"], maxFiles: 2 }).atomic).toBe(true);
    expect(normalizeTestRun({ runner: "vitest", exitCode: 0, passed: 2, failed: 0, skipped: 0, logHash: "log" }).status).toBe("passed");
    expect(planSandboxCleanup("r", ["p"], ["v"], "workspace/r").mustVerifyEmpty).toBe(true);
  });
});

describe("M31 connector and provider runtime", () => {
  it("requires state, signature, scope, consent and privacy gates", () => {
    expect(validateOAuthCallback({ state: "s", organizationId: "org", connectorId: "github", redirectUriHash: "u", codeVerifierHash: "v", issuedAt: 1, expiresAt: 100 }, { state: "s", code: "opaque-code", redirectUriHash: "u", codeVerifierHash: "v", now: 2 }).allowed).toBe(true);
    expect(validateOAuthCallback({ state: "s", organizationId: "org", connectorId: "github", redirectUriHash: "u", codeVerifierHash: "v", issuedAt: 1, expiresAt: 100 }, { state: "s", code: "opaque-code", redirectUriHash: "u", codeVerifierHash: "wrong", now: 2 }).allowed).toBe(false);
    expect(validateWebhook({ eventId: "e", organizationId: "org", connectorId: "c", payloadHash: "p", signatureDigest: "sig", receivedAt: 2 }, [], 2, "sig").allowed).toBe(true);
    expect(decideConnectorAction("org", "write", "repo:write", ["repo:write"], "idempotent").allowed).toBe(true);
    expect(decideProviderCall({ organizationId: "org", mode: "local", privacy: "confidential", provider: "cloud", locality: "cloud", userConsentedToCloud: true, budgetAllowed: true }).allowed).toBe(false);
  });
});

describe("M32 operations evidence", () => {
  it("requires valid telemetry, SLO evidence and restore approval", () => {
    expect(validateMetricSample({ organizationId: "org", runId: "run", name: "latency_ms", value: 10, observedAt: 1, unit: "ms" }).accepted).toBe(true);
    expect(evaluateSloWindow({ targetAvailability: 0.99, observedAvailability: 0.98, targetLatencyMs: 100, observedP95LatencyMs: 20, errorBudgetRemaining: 1, windowMs: 60_000 }).allowed).toBe(false);
    expect(reconcileCost({ organizationId: "org", runId: "run", idempotencyKey: "i", estimatedCost: 1, actualCost: 1.005, tokenCount: 10, currency: "USD" }).withinTolerance).toBe(true);
    expect(planRestoreDrill({ organizationId: "org", backupId: "b", targetEnvironment: "isolated", expectedRpoMs: 10, expectedRtoMs: 100, steps: ["restore"] }).requiresHumanApproval).toBe(true);
    expect(verifyIncidentAction({ incidentId: "i", severity: "high", ownerId: "o", step: "verify", status: "verified", evidenceHash: "e" }).accepted).toBe(true);
  });
});

describe("M33 product surface contract", () => {
  it("keeps resume, approval, clients and accessibility safe", () => {
    expect(validateScreenModel({ organizationId: "org", route: "run", status: "ready", revision: 1, title: "Run", bodyHash: "b", containsSecret: false }).allowed).toBe(true);
    expect(planSseResume({ organizationId: "org", runId: "run", lastEventId: 4, currentRevision: 2 }, 1, 10).fromEventId).toBe(5);
    expect(decideApprovalView({ approvalId: "a", organizationId: "org", runId: "run", requestedBy: "agent", risk: "high", expiresAt: 100, diffHash: "d", costEstimate: 0, reversible: true, status: "pending" }, 2, "human", true).allowed).toBe(true);
    expect(validateClientCommand({ name: "run.start", organizationId: "org", arguments: {}, apiBase: "/api", containsRawCredential: false }).allowed).toBe(true);
    expect(validateClientCommand({ name: "run.start", organizationId: "org", arguments: {}, apiBase: "http://localhost:4310", containsRawCredential: false }).allowed).toBe(false);
    expect(evaluateAccessibilitySummary({ page: "run", locale: "fa-IR", keyboardReachable: true, focusVisible: true, criticalFindings: 0, rtlChecked: true }).allowed).toBe(true);
  });
});
