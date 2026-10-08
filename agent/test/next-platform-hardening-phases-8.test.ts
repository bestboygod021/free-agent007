import { describe, expect, it } from "vitest";
import { decideM164Repair, decideM164Response, validateM164Contract, validateM164SafetyScan } from "../src/core/model-output-safety-runtime.js";
import { decideM165Revocation, decideM165Token, validateM165Delegation, validateM165Result } from "../src/core/agent-delegation-runtime.js";
import { decideM166Checkpoint, decideM166Compensation, validateM166Cancellation, validateM166Cleanup } from "../src/core/cancellation-compensation-runtime.js";
import { decideM167Build, decideM167Promotion, validateM167BuildPlan, validateM167Manifest } from "../src/core/reproducible-release-runtime.js";
import { decideM168Delivery, decideM168Replay, validateM168Endpoint, validateM168Response } from "../src/core/outbound-webhook-runtime.js";

describe("M164-M168 deterministic contract kernels", () => {
  it("M164 gates output contracts, model responses, repair and safety scans", () => {
    const contract = { organizationId: "org-1", contractId: "contract", schemaHash: "schema", requiredFields: ["status"], maxBytes: 10_000, allowedContentTypes: ["application/json"], deterministic: true, tenantBound: true, approvalPresent: true, version: 1 };
    expect(validateM164Contract(contract).allowed).toBe(true);
    expect(decideM164Response({ organizationId: "org-1", responseId: "response", contractId: "contract", modelReference: "model-ref", outputHash: "output", state: "validated", contentType: "application/json", byteLength: 100, fieldsPresent: ["status"], redacted: true, tenantMatch: true, refusalObserved: false }, contract).allowed).toBe(true);
    expect(decideM164Repair({ organizationId: "org-1", responseId: "response", repairId: "repair", reason: "schema", attempt: 1, maxAttempts: 2, inputHash: "input", schemaHash: "schema", noNewAuthority: true, approvalPresent: true }).allowed).toBe(true);
    expect(validateM164SafetyScan({ organizationId: "org-1", responseId: "response", scanId: "scan", secretLeak: false, crossTenantData: false, promptInjection: false, unsafeAction: false, evidenceHash: "evidence", redacted: true, blocked: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM164Response({ organizationId: "org-1", responseId: "response", contractId: "contract", modelReference: "model-ref", outputHash: "output", state: "validated", contentType: "application/json", byteLength: 100, fieldsPresent: [], redacted: true, tenantMatch: true, refusalObserved: false }, contract).allowed).toBe(false);
  });

  it("M165 gates delegation, capability tokens, results and revocation", () => {
    expect(validateM165Delegation({ organizationId: "org-1", delegationId: "delegation", parentAgentReference: "parent", childAgentReference: "child", taskReference: "task", inputHash: "input", outputContractHash: "contract", capabilities: ["read_context"], issuedAt: 1_000, expiresAt: 2_000, state: "issued", tenantBound: true, approvalPresent: true, noTransitiveEscalation: true }, 1_100).allowed).toBe(true);
    expect(decideM165Token({ organizationId: "org-1", tokenId: "token", delegationId: "delegation", capability: "read_context", resourceReference: "context-ref", conditionsHash: "conditions", issuedAt: 1_000, expiresAt: 2_000, singleUse: true, used: false, revoked: false }, 1_100).allowed).toBe(true);
    expect(validateM165Result({ organizationId: "org-1", delegationId: "delegation", resultId: "result", outputHash: "output", evidenceHash: "evidence", state: "accepted", contractMatch: true, capabilitiesUsed: ["read_context"], tenantMatch: true, redacted: true }).allowed).toBe(true);
    expect(decideM165Revocation({ organizationId: "org-1", delegationId: "delegation", revocationId: "revocation", reasonHash: "reason", revokedAt: 2_000, descendantsEnumerated: true, evidenceHash: "evidence", operatorReference: "operator" }).allowed).toBe(true);
    expect(decideM165Token({ organizationId: "org-1", tokenId: "token", delegationId: "delegation", capability: "write_patch", resourceReference: "main", conditionsHash: "conditions", issuedAt: 1_000, expiresAt: 2_000, singleUse: false, used: false, revoked: false }, 1_100).allowed).toBe(false);
  });

  it("M166 gates cancellation, checkpoints, compensation and cleanup", () => {
    expect(validateM166Cancellation({ organizationId: "org-1", runId: "run", cancellationId: "cancel", requestedBy: "operator", reasonHash: "reason", requestedAt: 1_000, state: "requested", tenantBound: true, approvalPresent: true, force: false }).allowed).toBe(true);
    expect(decideM166Checkpoint({ organizationId: "org-1", runId: "run", taskId: "task", state: "running", checkpointHash: "checkpoint", sideEffectClass: "reversible", cancelSafe: true, leaseRevoked: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM166Compensation({ organizationId: "org-1", runId: "run", compensationId: "compensation", taskId: "task", actionHash: "action", state: "succeeded", idempotencyKey: "idem", rollbackEvidenceHash: "rollback", noNewSideEffects: true, approvalPresent: true }).allowed).toBe(true);
    expect(validateM166Cleanup({ organizationId: "org-1", runId: "run", cleanupId: "cleanup", processCount: 0, volumeCount: 0, networkLeaseCount: 0, artifactManifestHash: "manifest", secretsPurged: true, tenantMatch: true, completedAt: 2_000, evidenceHash: "evidence" }).allowed).toBe(true);
    expect(decideM166Checkpoint({ organizationId: "org-1", runId: "run", taskId: "task", state: "running", checkpointHash: "checkpoint", sideEffectClass: "external", cancelSafe: false, leaseRevoked: false, tenantMatch: true }).allowed).toBe(false);
  });

  it("M167 gates reproducible builds, manifests and promotion", () => {
    const plan = { organizationId: "org-1", buildId: "build", sourceRevision: "revision", lockfileHash: "lock", toolchainDigest: "toolchain", buildConfigHash: "config", artifactKind: "container" as const, reproducible: true, sandboxed: true, noNetworkBuild: true, approvalPresent: true, tenantBound: true };
    expect(validateM167BuildPlan(plan).allowed).toBe(true);
    expect(decideM167Build({ organizationId: "org-1", buildId: "build", resultId: "result", state: "succeeded", artifactDigest: "artifact", sbomHash: "sbom", provenanceHash: "provenance", sourceRevision: "revision", toolchainDigest: "toolchain", exitCode: 0, testsPassed: true, secretsScanPassed: true, licenseScanPassed: true, reproducibilityHash: "repro" }, plan).allowed).toBe(true);
    expect(validateM167Manifest({ organizationId: "org-1", releaseId: "release", artifactDigest: "artifact", sourceRevision: "revision", sbomHash: "sbom", provenanceHash: "provenance", signatureReference: "signature-ref", vulnerabilityScanPassed: true, policyScanPassed: true, rollbackArtifactDigest: "rollback", promotion: "candidate", approvalPresent: true, noClobber: true }).allowed).toBe(true);
    expect(decideM167Promotion({ organizationId: "org-1", releaseId: "release", decisionId: "decision", targetEnvironment: "staging", smokeEvidenceHash: "smoke", canaryEvidenceHash: "canary", rollbackReady: true, operatorReference: "operator", approved: true, expiresAt: 2_000 }, 1_100).allowed).toBe(true);
    expect(validateM167Manifest({ organizationId: "org-1", releaseId: "release", artifactDigest: "artifact", sourceRevision: "revision", sbomHash: "sbom", provenanceHash: "provenance", signatureReference: "signature-ref", vulnerabilityScanPassed: false, policyScanPassed: true, rollbackArtifactDigest: "rollback", promotion: "candidate", approvalPresent: true, noClobber: true }).allowed).toBe(false);
  });

  it("M168 gates webhook endpoints, delivery, response and replay", () => {
    expect(validateM168Endpoint({ organizationId: "org-1", endpointId: "endpoint", url: "https://client.example/hooks", eventTypes: ["run.completed"], state: "verified", secretReference: "opaque-ref", signatureAlgorithm: "hmac-sha256", verificationHash: "verification", approvalPresent: true, tenantBound: true, tlsVerified: true, allowlistVerified: true }).allowed).toBe(true);
    expect(decideM168Delivery({ organizationId: "org-1", endpointId: "endpoint", deliveryId: "delivery", eventId: "event", eventType: "run.completed", payloadHash: "payload", signatureHash: "signature", attempt: 1, maxAttempts: 3, state: "queued", idempotencyKey: "idem", nextAttemptAt: 2_000, redacted: true, tenantMatch: true }, 1_000).allowed).toBe(true);
    expect(validateM168Response({ deliveryId: "delivery", statusCode: 200, responseHash: "response", receivedAt: 2_000, signatureAccepted: true, replayDetected: false }).allowed).toBe(true);
    expect(decideM168Replay({ organizationId: "org-1", endpointId: "endpoint", deliveryId: "delivery", replayId: "replay", operatorReference: "operator", reasonHash: "reason", approvalPresent: true, bounded: true, redacted: true }).allowed).toBe(true);
    expect(validateM168Endpoint({ organizationId: "org-1", endpointId: "endpoint", url: "http://client.example/hooks", eventTypes: ["run.completed"], state: "verified", secretReference: "opaque-ref", signatureAlgorithm: "hmac-sha256", verificationHash: "verification", approvalPresent: true, tenantBound: true, tlsVerified: false, allowlistVerified: true }).allowed).toBe(false);
  });
});
