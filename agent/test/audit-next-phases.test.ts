import { describe, expect, it } from "vitest";

import { decideControlCommand, planEventAppend, type ControlPlanePolicy } from "../src/core/control-plane-contract.js";
import { checkContamination, decideRegression } from "../src/core/evaluation-integrity.js";
import { decideEgress, decideToolAdmission, planSecretLease, type SupplyChainPolicy, type ToolManifest } from "../src/core/secure-supply-chain.js";
import { chooseQuotaEndpoint, decidePreRunBudget, evaluateSlo, planRestore } from "../src/core/resilience-operations.js";
import { planPatch, planWorktree, scanGitSecrets, scanLicenses, verifyAttestation } from "../src/core/delivery-trust.js";

describe("M19 durable control-plane contracts", () => {
  const policy: ControlPlanePolicy = { organizationId: "org-1", allowedCommandTypes: ["create_run"], allowedEventTypes: ["run.created"], maxClockSkewMs: 10 };
  it("keeps commands tenant-bound and events sequential", () => {
    expect(decideControlCommand({ commandId: "c", organizationId: "org-1", actorId: "u", type: "create_run", contractVersion: "1", idempotencyKey: "i", payloadHash: "p", issuedAt: 10 }, policy, 10).allowed).toBe(true);
    expect(planEventAppend([], { eventId: "e", organizationId: "org-1", aggregateId: "run", sequence: 1, type: "run.created", payloadHash: "p", occurredAt: 10 }, policy).allowed).toBe(true);
    expect(planEventAppend([], { eventId: "e2", organizationId: "org-1", aggregateId: "run", sequence: 2, type: "run.created", payloadHash: "p", occurredAt: 10 }, policy).allowed).toBe(false);
  });
});

describe("M20 evaluation integrity", () => {
  it("detects contamination and regression", () => {
    expect(checkContamination([{ caseId: "c", fixtureHash: "fixture", promptHash: "prompt", expectedArtifactHash: "expected", source: "owned", license: "MIT" }], new Set(["fixture"])).passed).toBe(false);
    expect(decideRegression(0.8, 0.9, 1, { minimumScore: 0.9, maximumDrop: 0.02, minimumRequiredPassRate: 1 }).passed).toBe(false);
  });
});

describe("M21 secure supply chain", () => {
  const policy: SupplyChainPolicy = { allowedLicenses: ["MIT"], deniedCapabilities: ["host.exec"], allowedEgressDomains: ["api.example.com"], requireSbom: true, requireSignature: true, dlpPatterns: ["api[_-]?key\\s*:"] };
  const manifest: ToolManifest = { toolId: "tool", version: "1.0.0", packageDigest: "sha", signature: "sig", capabilities: ["project.read"], license: "MIT", sbomHash: "sbom", runtime: "sandbox" };
  it("requires signed governed dependencies and DLP-safe egress", () => {
    expect(decideToolAdmission(manifest, [{ name: "dep", version: "1", license: "MIT", digest: "d" }], policy).allowed).toBe(true);
    expect(decideEgress("api.example.com", "api_key: raw", policy).allowed).toBe(false);
    expect(planSecretLease("secret/ref", "lease", 20, ["secret/ref"], 10).allowed).toBe(true);
  });
});

describe("M22 resilience and operations", () => {
  it("stops over-budget runs and selects healthy quota", () => {
    expect(decidePreRunBudget({ maxCost: 1, maxInputTokens: 10, maxOutputTokens: 10, projectedCost: 2, projectedInputTokens: 1, projectedOutputTokens: 1 }).allowed).toBe(false);
    expect(chooseQuotaEndpoint([{ endpointId: "a", providerId: "p", remainingRequests: 1, remainingTokens: 20, healthy: true }, { endpointId: "b", providerId: "p", remainingRequests: 1, remainingTokens: 10, healthy: true }], 0)).toBe("a");
    expect(evaluateSlo({ targetAvailability: 0.99, observedAvailability: 0.98, targetLatencyMs: 100, observedP95LatencyMs: 20, errorBudgetRemaining: 1 }).allowed).toBe(false);
    expect(() => planRestore({ backupId: "b", targetEnvironment: "production", tenantScope: "org-1", expectedRpoMs: 1, expectedRtoMs: 1, steps: [] })).toThrow("human approval");
  });
});

describe("M23 delivery trust", () => {
  it("requires isolated atomic delivery and scans output", () => {
    expect(planWorktree({ runId: "run", repositoryId: "repo", baseRevision: "sha", isolatedPath: "worktrees/run", protectedBranch: true }).cleanupRequired).toBe(true);
    expect(planPatch({ patchId: "p", runId: "run", files: [{ path: "src/index.ts", beforeHash: "a", afterHash: "b", operation: "modify" }] }).requiresApproval).toBe(true);
    expect(scanLicenses(["GPL-3.0"], ["MIT"]).allowed).toBe(false);
    expect(scanGitSecrets(["api_key: raw"]).allowed).toBe(false);
    expect(verifyAttestation({ artifactId: "a", digest: "d", sourceRevision: "s", buildPlanHash: "b", testEvidenceHash: "t", signer: "ci" }).allowed).toBe(true);
  });
});
