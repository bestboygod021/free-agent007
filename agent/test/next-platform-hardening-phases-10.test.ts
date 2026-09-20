import { describe, expect, it } from "vitest";
import { decideM174Assignment, decideM174Rollback, validateM174Result, validateM174Variant } from "../src/core/prompt-experiment-runtime.js";
import { decideM175TieBreak, decideM175Vote, validateM175Consensus, validateM175Panel } from "../src/core/model-consensus-runtime.js";
import { decideM176Handoff, decideM176Message, validateM176Manifest, validateM176Response } from "../src/core/agent-interoperability-runtime.js";
import { decideM177Lookup, decideM177Purge, validateM177Entry, validateM177Write } from "../src/core/prompt-cache-runtime.js";
import { decideM178AdapterRequest, decideM178Rollback, validateM178AdapterResult, validateM178Plan } from "../src/core/deployment-adapter-runtime.js";

describe("M174-M178 deterministic contract kernels", () => {
  it("M174 gates prompt variants, deterministic assignments, results and rollback", () => {
    expect(validateM174Variant({ organizationId: "org-1", experimentId: "exp", variantId: "variant-b", promptHash: "prompt", policyHash: "policy", modelScope: "local", allocationBps: 5_000, metricName: "quality", metricDirection: "maximize", state: "running", approved: true, reversible: true, noRawSecrets: true, tenantBound: true }).allowed).toBe(true);
    expect(decideM174Assignment({ organizationId: "org-1", experimentId: "exp", assignmentId: "assignment", subjectHash: "subject", variantId: "variant-b", deterministicSeed: 42, assignedAt: 1_000, expiresAt: 2_000, holdout: false, tenantMatch: true }, 1_100).allowed).toBe(true);
    expect(validateM174Result({ organizationId: "org-1", experimentId: "exp", assignmentId: "assignment", resultId: "result", metricName: "quality", score: 0.9, evidenceHash: "evidence", valid: true, redacted: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM174Rollback({ organizationId: "org-1", experimentId: "exp", rollbackId: "rollback", fromVariantId: "variant-b", toVariantId: "control", reasonHash: "reason", approvalPresent: true, bounded: true, noDataLoss: true, operatorReference: "operator" }).allowed).toBe(true);
    expect(decideM174Assignment({ organizationId: "org-1", experimentId: "exp", assignmentId: "assignment", subjectHash: "subject", variantId: "variant-b", deterministicSeed: 42, assignedAt: 1_000, expiresAt: 1_050, holdout: false, tenantMatch: true }, 1_100).allowed).toBe(false);
  });

  it("M175 gates independent multi-model panels, votes, quorum and tie breaks", () => {
    expect(validateM175Panel({ organizationId: "org-1", panelId: "panel", proposalHash: "proposal", policyHash: "policy", participantIds: ["model-a", "model-b", "model-c"], minimumParticipants: 2, quorum: 3, thresholdBps: 6_000, state: "voting", independentPrompts: true, tenantBound: true, noSingleModelAuthority: true }).allowed).toBe(true);
    expect(decideM175Vote({ organizationId: "org-1", panelId: "panel", voteId: "vote", participantId: "model-a", vote: "approve", rationaleHash: "rationale", evidenceHash: "evidence", confidenceBps: 8_000, independent: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM175Consensus({ organizationId: "org-1", panelId: "panel", consensusId: "consensus", proposalHash: "proposal", voteCount: 3, approveCount: 2, rejectCount: 1, abstainCount: 0, quorum: 3, thresholdBps: 6_000, tieBreak: "deny", decision: "approved", evidenceHash: "evidence", independentEvidence: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM175TieBreak({ organizationId: "org-1", panelId: "panel", tieBreakId: "tie", tieBreak: "human_review", reviewerReference: "reviewer", reasonHash: "reason", approvalPresent: true, bounded: true }).allowed).toBe(true);
    expect(decideM175Vote({ organizationId: "org-1", panelId: "panel", voteId: "vote", participantId: "model-a", vote: "approve", rationaleHash: "rationale", evidenceHash: "evidence", confidenceBps: 8_000, independent: false, tenantMatch: true }).allowed).toBe(false);
  });

  it("M176 gates agent manifests, signed messages, typed responses and handoff", () => {
    expect(validateM176Manifest({ organizationId: "org-1", agentId: "agent-a", protocolVersion: "1.0", capabilities: ["review"], issuerHash: "issuer", endpointHash: "endpoint", inputSchemaHash: "input", outputSchemaHash: "output", trust: "approved", expiresAt: 2_000, approved: true, sandboxed: true, tenantBound: true, noTransitiveDelegation: true }, 1_000).allowed).toBe(true);
    expect(decideM176Message({ organizationId: "org-1", messageId: "message", conversationId: "conversation", senderAgentId: "agent-a", receiverAgentId: "agent-b", capability: "review", payloadHash: "payload", nonce: "nonce", correlationId: "correlation", signatureHash: "signature", issuedAt: 1_000, expiresAt: 2_000, state: "offered", redacted: true, tenantMatch: true }, 1_100).allowed).toBe(true);
    expect(validateM176Response({ organizationId: "org-1", messageId: "message", responseId: "response", outputHash: "output", evidenceHash: "evidence", schemaValid: true, capabilityMatched: true, idempotencyKey: "idem", state: "accepted", tenantMatch: true, redacted: true }).allowed).toBe(true);
    expect(decideM176Handoff({ organizationId: "org-1", handoffId: "handoff", senderAgentId: "agent-a", receiverAgentId: "agent-b", contextHash: "context", capability: "review", approvalPresent: true, bounded: true, noSecrets: true, expiresAt: 2_000, operatorReference: "operator" }, 1_100).allowed).toBe(true);
    expect(validateM176Manifest({ organizationId: "org-1", agentId: "agent-a", protocolVersion: "1.0", capabilities: ["review"], issuerHash: "issuer", endpointHash: "endpoint", inputSchemaHash: "input", outputSchemaHash: "output", trust: "untrusted", expiresAt: 2_000, approved: false, sandboxed: true, tenantBound: true, noTransitiveDelegation: true }, 1_000).allowed).toBe(false);
  });

  it("M177 gates private prompt caching, lookup integrity, writes and purge", () => {
    expect(validateM177Entry({ organizationId: "org-1", namespace: "safe", entryId: "entry", promptHash: "prompt", responseHash: "response", modelHash: "model", policyHash: "policy", tenantScope: "org-1", sensitivity: "public", state: "active", encrypted: true, redacted: true, consentPresent: true, createdAt: 1_000, expiresAt: 2_000, noRawPrompt: true }, 1_100).allowed).toBe(true);
    expect(decideM177Lookup({ organizationId: "org-1", namespace: "safe", lookupId: "lookup", promptHash: "prompt", modelHash: "model", policyHash: "policy", tenantScope: "org-1", now: 1_100, hit: true, allowed: true, crossTenant: false, poisoningScanPassed: true }).allowed).toBe(true);
    expect(validateM177Write({ organizationId: "org-1", namespace: "safe", writeId: "write", promptHash: "prompt", responseHash: "response", modelHash: "model", policyHash: "policy", tenantScope: "org-1", sensitivity: "tenant", encrypted: true, redacted: true, consentPresent: true, retentionSeconds: 3_600, noRawPrompt: true }).allowed).toBe(true);
    expect(decideM177Purge({ organizationId: "org-1", namespace: "safe", purgeId: "purge", entryId: "entry", reasonHash: "reason", approvalPresent: true, allReplicasPurged: true, bounded: true, evidenceHash: "evidence" }).allowed).toBe(true);
    expect(decideM177Lookup({ organizationId: "org-1", namespace: "safe", lookupId: "lookup", promptHash: "prompt", modelHash: "model", policyHash: "policy", tenantScope: "org-1", now: 1_100, hit: true, allowed: true, crossTenant: true, poisoningScanPassed: true }).allowed).toBe(false);
  });

  it("M178 gates adapter plans, target-safe execution, smoke evidence and rollback", () => {
    expect(validateM178Plan({ organizationId: "org-1", deploymentId: "deployment", artifactDigest: "sha256:artifact", releaseManifestHash: "manifest", adapterId: "local-adapter", targetEnvironment: "staging", targetReference: "staging/app", state: "approved", approvalPresent: true, protectedTarget: false, noMainMutation: true, rollbackDigest: "sha256:previous", smokeEvidenceHash: "smoke", tenantBound: true, sandboxVerified: true }).allowed).toBe(true);
    expect(decideM178AdapterRequest({ organizationId: "org-1", deploymentId: "deployment", adapterId: "local-adapter", targetEnvironment: "staging", artifactDigest: "sha256:artifact", idempotencyKey: "idem", preflightHash: "preflight", egressPolicyHash: "egress", timeoutMs: 30_000, redacted: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM178AdapterResult({ organizationId: "org-1", deploymentId: "deployment", adapterId: "local-adapter", state: "succeeded", deployedDigest: "sha256:artifact", evidenceHash: "evidence", smokePassed: true, targetMatched: true, rollbackAvailable: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM178Rollback({ organizationId: "org-1", deploymentId: "deployment", rollbackId: "rollback", targetEnvironment: "staging", fromDigest: "sha256:artifact", toDigest: "sha256:previous", reasonHash: "reason", approvalPresent: true, bounded: true, evidenceHash: "evidence", operatorReference: "operator" }).allowed).toBe(true);
    expect(validateM178Plan({ organizationId: "org-1", deploymentId: "deployment", artifactDigest: "sha256:artifact", releaseManifestHash: "manifest", adapterId: "prod-adapter", targetEnvironment: "production", targetReference: "production/app", state: "planned", approvalPresent: false, protectedTarget: false, noMainMutation: true, rollbackDigest: "sha256:previous", smokeEvidenceHash: "smoke", tenantBound: true, sandboxVerified: true }).allowed).toBe(false);
  });
});
