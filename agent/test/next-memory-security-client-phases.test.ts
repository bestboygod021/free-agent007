import { describe, expect, it } from "vitest";

import { decideRetrievalFeedback, decideSecureRetrieval, validateRetrievalQualityEvidence, validateSecureMemoryRecord } from "../src/core/retrieval-memory-runtime.js";
import { decideSupplyChainArtifact, decideSupplyChainInjectionGuard, validateSupplyChainDependency, validateSupplyChainSecretLease } from "../src/core/supply-chain-security-runtime.js";
import { decideExternalSignalHarvest, decideWebhookReplayGuard, validateExternalBrowserSession, validateSignedWebhookDelivery } from "../src/core/browser-signal-delivery-runtime.js";
import { decideDegradedClientPolicy, validateLocaleCatalog, validateLocalizedAccessibilityEvidence, validateOfflineMutation } from "../src/core/localization-client-runtime.js";
import { decideWorkspaceBootstrap, validateWorkspaceComment, validateWorkspaceHandoffEvidence, validateWorkspaceProjectTemplate } from "../src/core/workspace-bootstrap-runtime.js";

describe("M94 retrieval and memory runtime", () => {
  it("keeps memory trusted, tenant-safe and feedback-governed", () => {
    expect(validateSecureMemoryRecord({ organizationId: "org", projectId: "project", memoryId: "memory", kind: "semantic", contentHash: "content", embeddingHash: "embedding", sourceHash: "source", trust: "verified", aclSubjectHash: "subject", tokenCount: 20, expiresAt: 100, deleted: false, piiRedacted: true }).allowed).toBe(true);
    expect(decideSecureRetrieval({ organizationId: "org", projectId: "project", requesterId: "user", queryHash: "query", maxResults: 5, maxTokens: 100, localOnly: true, candidates: [{ memoryId: "memory", organizationId: "org", relevance: 0.9, tokenCount: 20, aclAllowed: true, trust: "verified", stale: false }] }, 1).allowed).toBe(true);
    expect(validateRetrievalQualityEvidence({ organizationId: "org", queryHash: "query", selectedMemoryIds: ["memory"], relevantCount: 1, irrelevantCount: 0, staleCount: 0, tenantIsolationPassed: true, citationCoverage: 1, evidenceHash: "evidence" }).allowed).toBe(true);
    expect(decideRetrievalFeedback({ organizationId: "org", memoryId: "memory", feedbackId: "feedback", kind: "correct", reviewerHash: "reviewer", reasonHash: "reason", observedAt: 1, approvalPresent: false }).allowed).toBe(true);
    expect(decideSecureRetrieval({ organizationId: "org", projectId: "project", requesterId: "user", queryHash: "query", maxResults: 5, maxTokens: 100, localOnly: true, candidates: [{ memoryId: "other", organizationId: "other-org", relevance: 1, tokenCount: 1, aclAllowed: true, trust: "verified", stale: false }] }, 1).allowed).toBe(false);
    expect(decideRetrievalFeedback({ organizationId: "org", memoryId: "memory", feedbackId: "feedback", kind: "unsafe", reviewerHash: "reviewer", reasonHash: "reason", observedAt: 1, approvalPresent: false }).allowed).toBe(false);
  });
});

describe("M95 supply chain security runtime", () => {
  it("requires provenance, scan evidence and zero-persistence secret leases", () => {
    expect(validateSupplyChainDependency({ organizationId: "org", dependencyId: "dep", name: "safe", version: "1", kind: "runtime", sourceUrl: "https://registry.example/safe", integrityHash: "integrity", license: "MIT", vulnerabilityScanPassed: true, licenseScanPassed: true, allowlisted: true }).allowed).toBe(true);
    expect(decideSupplyChainArtifact({ organizationId: "org", artifactId: "artifact", kind: "container", digest: "sha256:image", sbomHash: "sbom", provenanceHash: "provenance", signerReference: "signer-ref", signatureVerified: true, buildReproducible: true, vulnerabilityScanPassed: true, approvalPresent: true }).allowed).toBe(true);
    expect(validateSupplyChainSecretLease({ organizationId: "org", leaseId: "lease", secretReference: "key-ref", scope: "provider", issuedAt: 1, expiresAt: 100, revoked: false, injectedIntoSandbox: false, zeroPersistence: true }, 2).allowed).toBe(true);
    expect(decideSupplyChainInjectionGuard({ organizationId: "org", guardId: "guard", surface: "prompt", inputHash: "input", classifierVersion: "v1", injectionScore: 0.1, blocked: false, canaryTriggered: false, humanReviewPresent: false }).allowed).toBe(true);
    expect(decideSupplyChainArtifact({ organizationId: "org", artifactId: "artifact", kind: "container", digest: "sha256:image", sbomHash: "sbom", provenanceHash: "provenance", signerReference: "raw-secret", signatureVerified: true, buildReproducible: true, vulnerabilityScanPassed: true, approvalPresent: true }).allowed).toBe(false);
    expect(decideSupplyChainInjectionGuard({ organizationId: "org", guardId: "guard", surface: "prompt", inputHash: "input", classifierVersion: "v1", injectionScore: 0.95, blocked: false, canaryTriggered: true, humanReviewPresent: false }).allowed).toBe(false);
  });
});

describe("M96 browser and signal delivery runtime", () => {
  it("bounds browser egress, signal harvesting and signed webhook replay", () => {
    expect(validateExternalBrowserSession({ organizationId: "org", sessionId: "session", allowedDomains: ["example.com"], action: "read", targetUrl: "https://example.com/page", recordingHash: "recording", humanHandoverRequired: false, humanHandoverPresent: false, egressApprovalPresent: true, secretInjectionAllowed: false }).allowed).toBe(true);
    expect(decideExternalSignalHarvest({ organizationId: "org", harvestId: "harvest", source: "web", queryHash: "query", resultHash: "result", observedAt: 1, boundedResultCount: 10, sourceProvenanceHash: "provenance", trust: "reviewed", userConsent: true }).allowed).toBe(true);
    expect(validateSignedWebhookDelivery({ organizationId: "org", deliveryId: "delivery", endpointReference: "https://example.com/hook", eventType: "run.completed", payloadHash: "payload", signatureReference: "signing-ref", timestamp: 1, attempt: 1, dedupeKey: "dedupe", responseCode: 200, responseBodyRedacted: true }).allowed).toBe(true);
    expect(decideWebhookReplayGuard({ organizationId: "org", deliveryId: "delivery", dedupeKey: "dedupe", receivedAt: 5, originalTimestamp: 1, maxAgeSeconds: 10, signatureValid: true, alreadyProcessed: false }).allowed).toBe(true);
    expect(validateExternalBrowserSession({ organizationId: "org", sessionId: "session", allowedDomains: ["example.com"], action: "submit", targetUrl: "https://example.com/form", recordingHash: "recording", humanHandoverRequired: true, humanHandoverPresent: false, egressApprovalPresent: true, secretInjectionAllowed: false }).allowed).toBe(false);
    expect(decideWebhookReplayGuard({ organizationId: "org", deliveryId: "delivery", dedupeKey: "dedupe", receivedAt: 20, originalTimestamp: 1, maxAgeSeconds: 10, signatureValid: true, alreadyProcessed: false }).allowed).toBe(false);
  });
});

describe("M97 localization and degraded client runtime", () => {
  it("requires reviewed locale catalogs, accessible clients and safe offline mutations", () => {
    expect(validateLocaleCatalog({ organizationId: "org", catalogId: "fa", locale: "fa-IR", fallbackLocale: "en-US", messageCount: 100, translatedCount: 100, pluralRulesVersion: "v1", dateNumberFormatVersion: "v1", rtlSupported: true, reviewed: true }).allowed).toBe(true);
    expect(decideDegradedClientPolicy({ organizationId: "org", clientId: "client", surface: "web", mode: "offline", lastKnownStateHash: "state", queueMutation: true, mutationIdempotencyRequired: true, externalEgressAllowed: false, userNoticePresent: true }).allowed).toBe(true);
    expect(validateLocalizedAccessibilityEvidence({ organizationId: "org", evidenceId: "evidence", screenId: "runs", locale: "fa-IR", keyboardPassed: true, screenReaderPassed: true, contrastPassed: true, rtlPassed: true, pluralDateNumberPassed: true, reducedMotionPassed: true, reportHash: "report" }).allowed).toBe(true);
    expect(validateOfflineMutation({ organizationId: "org", clientId: "client", mutationId: "mutation", operation: "comment", payloadHash: "payload", idempotencyKey: "idem", queuedAt: 1, userNoticePresent: true }).allowed).toBe(true);
    expect(decideDegradedClientPolicy({ organizationId: "org", clientId: "client", surface: "web", mode: "offline", lastKnownStateHash: "state", queueMutation: true, mutationIdempotencyRequired: false, externalEgressAllowed: true, userNoticePresent: false }).allowed).toBe(false);
    expect(validateOfflineMutation({ organizationId: "org", clientId: "client", mutationId: "mutation", operation: "approval_request", payloadHash: "payload", idempotencyKey: "idem", queuedAt: 1, userNoticePresent: true }).allowed).toBe(false);
  });
});

describe("M98 workspace bootstrap runtime", () => {
  it("requires reviewed templates, no-clobber bootstrap and accepted handoff", () => {
    const template = { organizationId: "org", templateId: "template", kind: "web" as const, version: "1", filesHash: "files", setupCommandHash: "setup", allowedPaths: ["src", "public"], dependenciesReviewed: true, licenseReviewed: true, starterDataRedacted: true, approved: true };
    expect(validateWorkspaceProjectTemplate(template).allowed).toBe(true);
    expect(decideWorkspaceBootstrap({ organizationId: "org", projectId: "project", workspaceId: "workspace", templateId: "template", targetPath: "projects/app", mode: "local", noClobber: true, existingConfigBackedUp: true, approvalPresent: false, idempotencyKey: "idem" }, template).allowed).toBe(true);
    expect(validateWorkspaceHandoffEvidence({ organizationId: "org", workspaceId: "workspace", handoffId: "handoff", fromUserHash: "from", toUserHash: "to", mode: "handoff", contextPackHash: "context", diffHash: "diff", testEvidenceHash: "tests", secretsRedacted: true, accepted: true }).allowed).toBe(true);
    expect(validateWorkspaceComment({ organizationId: "org", workspaceId: "workspace", commentId: "comment", authorHash: "author", bodyHash: "body", referencedPath: "src/app.ts", resolved: false, createdAt: 1, piiRedacted: true }).allowed).toBe(true);
    expect(decideWorkspaceBootstrap({ organizationId: "org", projectId: "project", workspaceId: "workspace", templateId: "template", targetPath: "../escape", mode: "remote", noClobber: false, existingConfigBackedUp: false, approvalPresent: false, idempotencyKey: "idem" }, template).allowed).toBe(false);
    expect(validateWorkspaceHandoffEvidence({ organizationId: "org", workspaceId: "workspace", handoffId: "handoff", fromUserHash: "same", toUserHash: "same", mode: "handoff", contextPackHash: "context", diffHash: "diff", testEvidenceHash: "tests", secretsRedacted: false, accepted: false }).allowed).toBe(false);
  });
});
