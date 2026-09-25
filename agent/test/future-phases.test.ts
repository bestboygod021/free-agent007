import { describe, expect, it } from "vitest";

import { classifyContent, decideDataAction, planRetentionSweep, type DataAsset, type DataGovernancePolicy } from "../src/core/data-governance.js";
import { planWorkflowRun, type WorkflowDefinition, type WorkflowPolicy } from "../src/core/workflow-automation.js";
import { createMemoryRecord, retrieveMemories } from "../src/core/memory-retrieval.js";
import { decideAgentMessage, ReplayWindow, type AgentMessage, type AgentProtocolPolicy } from "../src/core/agent-protocol.js";
import { compileEffectivePolicy, decideGovernance, planPolicyChange, type OrganizationPolicy } from "../src/core/org-governance.js";

describe("M14 data governance", () => {
  const policy: DataGovernancePolicy = { organizationId: "org-1", allowedPurposes: { restricted: ["support"] }, consentRequiredFor: ["restricted"], noExternalEgressFor: ["secret", "restricted"], minimumRetentionMs: {}, allowSubjectExport: true, allowSubjectDeletion: true };
  const asset: DataAsset = { assetId: "a-1", organizationId: "org-1", subjectId: "u-1", dataClass: "restricted", purpose: "support", createdAt: 1, retentionUntil: 100, contentHash: "h", encryptedAtRest: true, exportable: true, deletable: true };
  it("classifies secret-like content without storing it", () => {
    expect(classifyContent("password: hidden").dataClass).toBe("secret");
    expect(classifyContent("ticket for passport renewal").dataClass).toBe("restricted");
  });
  it("requires valid consent and blocks external egress", () => {
    expect(decideDataAction(asset, policy, "use", 10).allowed).toBe(false);
    const consent = { consentId: "c-1", organizationId: "org-1", subjectId: "u-1", purpose: "support", dataClasses: ["restricted" as const], granted: true, grantedAt: 2, proofHash: "p" };
    expect(decideDataAction(asset, policy, "use", 10, consent).allowed).toBe(true);
    expect(decideDataAction(asset, policy, "external_egress", 10, consent).allowed).toBe(false);
  });
  it("plans only deletable expired assets", () => {
    expect(planRetentionSweep([asset, { ...asset, assetId: "a-2", deletable: false }], "org-1", 101).eligibleAssetIds).toEqual(["a-1"]);
  });
});

describe("M15 workflow automation", () => {
  const policy: WorkflowPolicy = { allowedTriggers: ["manual", "webhook"], allowedStepKinds: ["model", "tool", "approval"], maxSteps: 3, requireApprovalFor: ["tool"], deniedCapabilities: ["credential.read_raw"], allowProtectedBranchWrite: false, cooldownMs: 1000 };
  const definition: WorkflowDefinition = { workflowId: "wf-1", organizationId: "org-1", version: "1", trigger: "webhook", steps: [{ stepId: "review", kind: "approval", requiresApproval: false, inputHash: "x" }, { stepId: "build", kind: "tool", capability: "build.run", requiresApproval: false, inputHash: "y" }], enabled: true, signedDefinitionHash: "sig" };
  it("requires signed events and produces an idempotency key", () => {
    expect(planWorkflowRun(definition, { organizationId: "org-1", eventId: "evt-1", now: 10, mode: "local", policyHash: "p" }, policy).allowed).toBe(false);
    const plan = planWorkflowRun(definition, { organizationId: "org-1", eventId: "evt-1", eventSignature: "signed", now: 10, mode: "local", policyHash: "p" }, policy);
    expect(plan.allowed).toBe(false);
    expect(plan.requiredApprovals).toEqual(["build"]);
    expect(plan.idempotencyKey).toContain("evt-1");
  });
});

describe("M16 memory retrieval", () => {
  it("filters tenant, expiry and trust while returning provenance", () => {
    const record = createMemoryRecord({ memoryId: "m-1", organizationId: "org-1", projectId: "p-1", kind: "decision", content: "Use local model for confidential tests", source: { sourceType: "test", sourceId: "t-1", evidenceHash: "e" }, trust: "verified", createdAt: 1, tags: ["local" ] });
    expect(retrieveMemories([record, { ...record, memoryId: "m-2", organizationId: "org-2" }], { organizationId: "org-1", projectId: "p-1", query: "local confidential", now: 2, maxResults: 5, allowedTrust: ["verified"] })[0]?.provenanceRequired).toBe(true);
    expect(() => createMemoryRecord({ ...record, memoryId: "m-3", content: "api_key: raw" })).toThrow("secret-like");
  });
});

describe("M17 agent protocol", () => {
  const policy: AgentProtocolPolicy = { organizationId: "org-1", allowedProtocols: ["a2a"], allowedCapabilities: ["review.read"], allowedScopes: ["project:read"], deniedCapabilities: [], maxTtlMs: 100, trustedSenders: ["agent-a"] };
  const message: AgentMessage = { messageId: "msg-1", protocol: "a2a", organizationId: "org-1", senderAgentId: "agent-a", recipientAgentId: "agent-b", capability: "review.read", scope: "project:read", nonce: "n-1", issuedAt: 10, expiresAt: 50, payloadHash: "payload", signature: "sig" };
  it("requires signature and rejects replay", () => {
    expect(decideAgentMessage(message, policy, 20, () => true).allowed).toBe(true);
    expect(decideAgentMessage({ ...message, organizationId: "org-2" }, policy, 20, () => true).allowed).toBe(false);
    const replay = new ReplayWindow();
    expect(replay.accept(message, 20)).toBe(true);
    expect(replay.accept(message, 20)).toBe(false);
  });
});

describe("M18 organization governance", () => {
  const parent: OrganizationPolicy = { policyId: "p", organizationId: "org-1", version: "1", allowedModes: ["local", "free"], egress: "approved", maxAutonomyLevel: 2, deniedCapabilities: ["credential.read_raw"], requiredApproval: "standard", policyHash: "parent", signedBy: "owner" };
  const child: OrganizationPolicy = { ...parent, policyId: "child", version: "1", allowedModes: ["local"], egress: "none", maxAutonomyLevel: 1, policyHash: "child", signedBy: "admin" };
  it("intersects child policy and denies disallowed requests", () => {
    const effective = compileEffectivePolicy(parent, child);
    expect(effective.allowedModes).toEqual(["local"]);
    expect(decideGovernance(effective, { organizationId: "org-1", mode: "free", egressRequested: false, autonomyLevel: 1, capability: "build.run", approvalClass: "standard" }).allowed).toBe(false);
  });
  it("marks weakening policy changes as not allowed", () => {
    const proposed = { ...parent, egress: "allowed" as const, maxAutonomyLevel: 3 };
    expect(planPolicyChange(parent, proposed).allowed).toBe(false);
  });
});
