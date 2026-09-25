import { describe, expect, it } from "vitest";

import {
  classifyIntent,
  decideCollaborationAction,
  decidePluginAdmission,
  planDecomposition,
  queryCapabilityGraph,
  validateRequirement,
  type PluginManifestContract,
  type StructuredRequirement,
} from "../src/core/intake-and-collaboration.js";
import {
  addTraceSpan,
  calibrateClaims,
  computeParetoFrontier,
  detectCapabilityDrift,
  explainRoute,
  normalizeExternalClaim,
  normalizeFailure,
  planShadowRoute,
  startTrace,
  type NormalizedExternalClaim,
} from "../src/core/evidence-routing-operations.js";
import {
  buildCodeGraph,
  createLineageRef,
  detectStaleDocumentation,
  filterContextByAcl,
  packContext,
  planMemoryPlacement,
} from "../src/core/knowledge-fabric.js";
import {
  classifyPii,
  evaluateRetrieval,
  planDeletionPropagation,
  planLocalRepositoryIndex,
} from "../src/core/privacy-retrieval.js";
import {
  buildTransparencyProjection,
  decidePluginPublication,
  evaluateAccessibility,
  evaluateFairness,
  planGovernedChange,
  validateAdr,
  validateModelCard,
  validatePolicyBundle,
} from "../src/core/governance-quality.js";

describe("M24 intake, planning and collaboration", () => {
  it("keeps ambiguity, plugin trust and human collaboration explicit", () => {
    expect(classifyIntent({ text: "fix the broken parser bug", locale: "en-US", source: "user" }).intent).toBe("bug_fix");
    const requirement: StructuredRequirement = {
      requirementId: "req-1", organizationId: "org-1", goal: "repair parser", risk: "medium", sourceHash: "source",
      constraints: [{ id: "c-1", kind: "branch", value: "feature/parser", source: "user" }], acceptanceCriteria: ["tests pass"],
    };
    expect(validateRequirement(requirement).accepted).toBe(true);
    expect(planDecomposition(requirement, [{ taskId: "test", dependsOn: ["code"], owner: "qa", output: "report", acceptanceCriteria: ["report exists"] }, { taskId: "code", dependsOn: [], owner: "dev", output: "patch", acceptanceCriteria: ["patch exists"] }]).allowed).toBe(true);
    expect(planDecomposition(requirement, [{ taskId: "a", dependsOn: ["b"], owner: "dev", output: "a", acceptanceCriteria: ["a"] }, { taskId: "b", dependsOn: ["a"], owner: "dev", output: "b", acceptanceCriteria: ["b"] }]).allowed).toBe(false);
    expect(queryCapabilityGraph([{ nodeId: "tool", organizationId: "org-1", kind: "tool", capabilities: ["repo.read"], enabled: true }, { nodeId: "other", organizationId: "org-2", kind: "tool", capabilities: ["repo.read"], enabled: true }], { organizationId: "org-1", required: ["repo.read"], allowKinds: ["tool"] })).toHaveLength(1);
    const manifest: PluginManifestContract = { pluginId: "p", version: "1", organizationId: "org-1", packageDigest: "sha", signature: "sig", capabilities: ["repo.read"], requestedScopes: ["project:read"], runtime: "sandbox" };
    expect(decidePluginAdmission(manifest, { organizationId: "org-1", allowedCapabilities: ["repo.read"], deniedCapabilities: ["host.exec"], allowedScopes: ["project:read"], allowedRuntimes: ["sandbox"], requireSignature: true }).allowed).toBe(true);
    expect(decideCollaborationAction({ actionId: "a", organizationId: "org-1", runId: "r", actorId: "u", actorKind: "agent", kind: "approve", targetUserId: "u", approvalReference: "x" }).allowed).toBe(false);
  });
});

describe("M25 evidence-grounded routing and operations", () => {
  it("caps external evidence, keeps shadow side-effect free and normalizes failures", () => {
    const claim: NormalizedExternalClaim = normalizeExternalClaim({ subject: "model/a", sourceUrl: "https://vendor.example/model", domain: "vendor.example", tier: "vendor_claim", value: 0.9, sampleSize: 1, observedAt: 1, provenanceHash: "p" });
    expect(claim.trustedForPolicy).toBe(false);
    expect(calibrateClaims([claim], { "model/a": 0.7 })[0]?.calibratedValue).toBeLessThan(0.9);
    expect(detectCapabilityDrift("model/a", 0.8, 0.6, 0.1).drifted).toBe(true);
    const pareto = computeParetoFrontier([{ subject: "a", quality: 0.9, cost: 0, latencyMs: 10, privacy: 1, reliability: 0.9, allowed: true }, { subject: "b", quality: 0.8, cost: 1, latencyMs: 20, privacy: 1, reliability: 0.8, allowed: true }, { subject: "c", quality: 1, cost: 0, latencyMs: 5, privacy: 1, reliability: 1, allowed: false }]);
    expect(pareto.frontier.map((item) => item.subject)).toEqual(["a"]);
    expect(planShadowRoute("a", "b", ["quality"]).writesExternalState).toBe(false);
    expect(explainRoute("a", "evidence", "policy", ["measured"], [{ subject: "b", reason: "slow" }]).policyHash).toBe("policy");
    const trace = startTrace("org-1", "run-1", "trace-1");
    expect(addTraceSpan(trace, { spanId: "span-1", traceId: "trace-1", name: "router", startMs: 1, endMs: 2, attributes: {} }).attributes.organizationId).toBe("org-1");
    expect(normalizeFailure("timeout", "provider said secret-like details").retryable).toBe(true);
  });
});

describe("M26 secure knowledge fabric", () => {
  it("keeps graph, ACL, budget, freshness and lineage bounded", () => {
    expect(buildCodeGraph("org-1", "sha", [{ nodeId: "file", organizationId: "org-1", kind: "file", label: "src/a", revision: "sha" }], []).graphHash).toBeTruthy();
    const items = [{ itemId: "safe", organizationId: "org-1", projectId: "p", contentHash: "h1", tokenEstimate: 3, relevance: 0.9, trust: "verified" as const, taint: "clean" as const, allowedSubjectIds: ["u"], provenanceHash: "p", sourceRevision: "sha" }, { itemId: "secret", organizationId: "org-1", projectId: "p", contentHash: "h2", tokenEstimate: 1, relevance: 1, trust: "verified" as const, taint: "secret_like" as const, allowedSubjectIds: ["u"], provenanceHash: "p", sourceRevision: "sha" }];
    expect(filterContextByAcl(items, "org-1", "p", "u", 1)).toHaveLength(2);
    expect(packContext(items, 3).selectedItemIds).toEqual(["safe"]);
    expect(planMemoryPlacement("organization", 10, 100, false).requiresConsent).toBe(true);
    expect(detectStaleDocumentation([{ documentId: "d", sourceRevision: "new", documentRevision: "old" }])[0]?.stale).toBe(true);
    expect(createLineageRef("org-1", "out", ["src"], "pack").redacted).toBe(true);
  });
});

describe("M27 privacy-aware retrieval", () => {
  it("blocks secret-like PII and plans local, measurable deletion-safe retrieval", () => {
    expect(classifyPii("email a@example.com password: raw").action).toBe("block");
    expect(planDeletionPropagation([{ assetId: "a", organizationId: "org-1", locations: ["database", "index"], legalHold: false }, { assetId: "b", organizationId: "org-1", locations: ["backup"], legalHold: true }], "org-1", 1).allowed).toBe(false);
    expect(evaluateRetrieval(["a", "b"], ["a", "b"], ["a", "b"]).passed).toBe(true);
    expect(planLocalRepositoryIndex("org-1", "p", "sha", ["src/index.ts"]).networkAllowed).toBe(false);
  });
});

describe("M28 governance and transparency", () => {
  it("requires evidence, independent review and safe projections", () => {
    expect(validatePolicyBundle({ policyId: "p", organizationId: "org-1", version: "1", ownerId: "owner", effectiveAt: 1, expiresAt: 100, policyHash: "h" }, 10).allowed).toBe(true);
    expect(planGovernedChange({ changeId: "c", organizationId: "org-1", requesterId: "dev", reviewerId: "owner", currentHash: "a", proposedHash: "b", widensAccess: true, rollbackHash: "r" }).allowed).toBe(true);
    expect(validateModelCard({ modelId: "m", version: "1", languages: ["en"], limitations: ["unknown"], vendorClaims: ["fast"], measuredEvidenceHashes: ["e"], riskLevel: "medium", costNote: "free/BYOK" }).allowed).toBe(true);
    expect(evaluateFairness([{ locale: "en", score: 0.9, sampleSize: 10 }, { locale: "fa", score: 0.6, sampleSize: 10 }], 0.7, 0.2).passed).toBe(false);
    expect(evaluateAccessibility([{ id: "a11y-1", severity: "critical", resolved: false, evidenceHash: "e" }]).allowed).toBe(false);
    expect(decidePluginPublication({ pluginId: "p", signatureVerified: true, sbomPresent: true, licenseAllowed: true, sandboxTestPassed: true, reviewerId: "reviewer" }).allowed).toBe(true);
    expect(buildTransparencyProjection({ organizationId: "org-1", runCount: 1, tokenCount: 10, blockedCount: 1, providerShare: { local: 1 }, sourceHash: "s" }).containsSecrets).toBe(false);
    expect(validateAdr({ adrId: "adr-1", title: "Use local first", status: "accepted", decision: "local", alternatives: ["cloud"], tradeoffs: ["latency"], evidenceHashes: ["e"], rollbackReference: "r" }).allowed).toBe(true);
  });
});
