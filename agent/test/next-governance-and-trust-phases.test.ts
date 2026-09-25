import { describe, expect, it } from "vitest";

import { decideKnowledgeContextPack, validateKnowledgeDelegation, validateKnowledgeRepositoryIndex, validateKnowledgeSource } from "../src/core/knowledge-context-runtime.js";
import { decideModelOutputTrust, decidePromptIngress, decideStructuredOutputFallback, validatePromptSafetyPolicy } from "../src/core/prompt-safety-runtime.js";
import { decideNotificationDelivery, decideGovernedOnboardingPlan, validateCollaborationRunAccess, validateUsageEntitlement } from "../src/core/collaboration-usage-runtime.js";
import { decideIntegrationOperation, validateBrowserSessionPolicy, validateIntegrationAdapterManifest, validateIntegrationProbeEvidence } from "../src/core/integration-adapter-runtime.js";
import { decideGovernedAnalyticsQuery, decideVulnerabilityDisclosure, validateAnalyticsEventEnvelope, validateLegalPolicyAcceptance } from "../src/core/data-governance-runtime.js";

describe("M79 knowledge context runtime", () => {
  it("keeps repository authority, context budgets and delegation bounded", () => {
    expect(validateKnowledgeSource({ organizationId: "org", projectId: "project", sourceId: "source", kind: "repository", contentHash: "content", lineageHash: "lineage", trust: "git", aclSubjectHash: "subject", retentionDays: 90, piiRedacted: true }).allowed).toBe(true);
    expect(decideKnowledgeContextPack({ organizationId: "org", queryHash: "query", maxTokens: 100, maxItems: 2, candidates: [{ organizationId: "org", sourceId: "source", path: "src/app.ts", tokenCount: 20, relevance: 0.9, aclAllowed: true, trust: "git", stale: false, contentHash: "content" }] }, 1).allowed).toBe(true);
    expect(validateKnowledgeRepositoryIndex({ organizationId: "org", projectId: "project", snapshotHash: "snapshot", rootHash: "root", symbolCount: 10, importEdgeCount: 5, fileCount: 3, capturedAt: 1, incremental: false, trust: "workspace" }).allowed).toBe(true);
    expect(validateKnowledgeDelegation({ organizationId: "org", parentAgentId: "parent", childAgentId: "child", taskHash: "task", requestedCapabilities: ["read"], grantedCapabilities: ["read"], expiresAt: 100, sideEffect: false, approvalPresent: false }, 1).allowed).toBe(true);
    expect(decideKnowledgeContextPack({ organizationId: "org", queryHash: "query", maxTokens: 100, maxItems: 2, candidates: [{ organizationId: "other-org", sourceId: "other", path: "secret.txt", tokenCount: 1, relevance: 1, aclAllowed: true, trust: "git", stale: false, contentHash: "content" }] }, 1).allowed).toBe(false);
    expect(validateKnowledgeDelegation({ organizationId: "org", parentAgentId: "parent", childAgentId: "child", taskHash: "task", requestedCapabilities: ["write"], grantedCapabilities: [], expiresAt: 100, sideEffect: true, approvalPresent: false }, 1).allowed).toBe(false);
  });
});

describe("M80 prompt safety runtime", () => {
  it("blocks injection, credential patterns and untrusted model output", () => {
    const policy = { organizationId: "org", policyId: "policy", injectionBlockThreshold: 0.8, secretBlockThreshold: 0.8, tenantLeakBlockThreshold: 0.5, canaryTokenHash: "canary", classifierVersion: "v1", approved: true };
    expect(validatePromptSafetyPolicy(policy).allowed).toBe(true);
    expect(decidePromptIngress({ organizationId: "org", runId: "run", source: "user", contentHash: "input", injectionScore: 0.1, credentialPatternFound: false, canaryTriggered: false, requestedAction: "read", policyId: "policy", humanReviewed: false }, policy).allowed).toBe(true);
    expect(decideModelOutputTrust({ organizationId: "org", runId: "run", outputHash: "output", schemaHash: "schema", structuredValid: true, repairAttempts: 0, secretScanPassed: true, tenantIsolationPassed: true }).allowed).toBe(true);
    expect(decideStructuredOutputFallback({ organizationId: "org", runId: "run", modelReference: "local:model", supportsStructuredOutput: false, grammarAvailable: true, rawOutputHash: "output", repairAttempts: 1, repairedSchemaHash: "schema", validationPassed: true, localFallbackAvailable: true }).allowed).toBe(true);
    expect(decidePromptIngress({ organizationId: "org", runId: "run", source: "readme", contentHash: "input", injectionScore: 0.95, credentialPatternFound: true, canaryTriggered: true, requestedAction: "execute", policyId: "policy", humanReviewed: false }, policy).allowed).toBe(false);
    expect(decideModelOutputTrust({ organizationId: "org", runId: "run", outputHash: "output", schemaHash: "schema", structuredValid: false, repairAttempts: 4, secretScanPassed: false, tenantIsolationPassed: false }).allowed).toBe(false);
  });
});

describe("M81 collaboration and usage runtime", () => {
  it("enforces tenant-safe collaboration, honest onboarding and entitlements", () => {
    expect(validateCollaborationRunAccess({ organizationId: "org", actorOrganizationId: "org", runOrganizationId: "org", runId: "run", actorId: "user", role: "developer", action: "comment", commentHash: "comment", approvalDelegationPresent: false }).allowed).toBe(true);
    expect(decideGovernedOnboardingPlan({ organizationId: "org", userId: "user", mode: "local", steps: ["welcome", "first-run"], completedSteps: ["welcome"], localFallbackAvailable: true, byokConfigured: false, freeProviderReviewed: false, consentPresent: false }).allowed).toBe(true);
    expect(validateUsageEntitlement({ organizationId: "org", entitlementId: "entitlement", metric: "run", period: "month", allowance: 100, used: 10, requested: 5, planReference: "free", approved: true, localMode: false }).allowed).toBe(true);
    expect(decideNotificationDelivery({ organizationId: "org", eventId: "event", eventType: "run_failed", recipientHash: "recipient-hash", channel: "email_reference", templateVersion: "v1", preferenceAllowed: true, payloadHash: "payload", idempotencyKey: "idem" }).allowed).toBe(true);
    expect(validateCollaborationRunAccess({ organizationId: "org", actorOrganizationId: "other-org", runOrganizationId: "org", runId: "run", actorId: "user", role: "admin", action: "handoff", targetUserId: "target", approvalDelegationPresent: true }).allowed).toBe(false);
    expect(validateUsageEntitlement({ organizationId: "org", entitlementId: "entitlement", metric: "run", period: "month", allowance: 10, used: 10, requested: 1, planReference: "free", approved: true, localMode: false }).allowed).toBe(false);
  });
});

describe("M82 integration adapter runtime", () => {
  it("gates adapter review, scopes, browser evidence and tenant boundaries", () => {
    const manifest = { organizationId: "org", adapterId: "github", kind: "github_app" as const, endpointReference: "https://api.github.com", authReference: "installation-ref", requestedScopes: ["repo:read"], capabilities: ["read"], tenantScoped: true, localMode: false, reviewed: true, probeRequired: true };
    expect(validateIntegrationAdapterManifest(manifest).allowed).toBe(true);
    expect(decideIntegrationOperation({ organizationId: "org", adapterId: "github", actorId: "user", targetOrganizationId: "org", operation: "read", scope: "repo:read", targetReference: "repo:1", approvalPresent: false, idempotencyKey: "idem", localMode: false }, manifest).allowed).toBe(true);
    expect(validateBrowserSessionPolicy({ organizationId: "org", sessionId: "session", allowedDomains: ["github.com"], recordingEnabled: true, handoverRequired: true, humanHandoverPresent: true, egressApprovalPresent: true, secretInjectionAllowed: false }).allowed).toBe(true);
    expect(validateIntegrationProbeEvidence({ organizationId: "org", adapterId: "github", probeId: "probe", authenticated: true, leastPrivilegePassed: true, tenantIsolationPassed: true, webhookOrProtocolPassed: true, rollbackPassed: true, exitCode: 0, evidenceHash: "evidence" }).allowed).toBe(true);
    expect(decideIntegrationOperation({ organizationId: "org", adapterId: "github", actorId: "user", targetOrganizationId: "other-org", operation: "write", scope: "repo:read", targetReference: "repo:1", approvalPresent: true, idempotencyKey: "idem", localMode: false }, manifest).allowed).toBe(false);
    expect(validateIntegrationAdapterManifest({ ...manifest, authReference: "raw-secret" }).allowed).toBe(false);
  });
});

describe("M83 data governance runtime", () => {
  it("requires redacted analytics, controlled exports and accountable disclosure", () => {
    expect(validateAnalyticsEventEnvelope({ organizationId: "org", eventId: "event", runId: "run", eventType: "run.completed", actorHash: "actor", payloadHash: "payload", dataClass: "internal", retention: "standard", sequence: 1, piiRedacted: true, occurredAt: 1 }).allowed).toBe(true);
    expect(decideGovernedAnalyticsQuery({ organizationId: "org", requesterId: "user", dataset: "usage", from: 1, to: 2, aggregateOnly: true, exportRequested: false, approvalPresent: false, rowLimit: 100 }).allowed).toBe(true);
    expect(validateLegalPolicyAcceptance({ organizationId: "org", subjectHash: "subject", policyKind: "privacy", policyVersion: "v1", locale: "fa-IR", accepted: true, consentEvidenceHash: "consent", effectiveAt: 1 }).allowed).toBe(true);
    expect(decideVulnerabilityDisclosure({ organizationId: "org", disclosureId: "disclosure", reporterHash: "reporter", affectedComponent: "api", severity: "high", reportHash: "report", fixCommitHash: "fix", publicDisclosureApproved: false, bountyDecision: "review" }).allowed).toBe(true);
    expect(decideGovernedAnalyticsQuery({ organizationId: "org", requesterId: "user", dataset: "audit", from: 1, to: 2, aggregateOnly: false, exportRequested: true, approvalPresent: false, rowLimit: 100 }).allowed).toBe(false);
    expect(validateAnalyticsEventEnvelope({ organizationId: "org", eventId: "event", eventType: "run.completed", actorHash: "actor", payloadHash: "payload", dataClass: "private", retention: "standard", sequence: 1, piiRedacted: false, occurredAt: 1 }).allowed).toBe(false);
  });
});
