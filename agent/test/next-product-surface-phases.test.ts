import { describe, expect, it } from "vitest";
import {
  decideM109ContextAssembly,
  validateM109ContextQuality,
  validateM109ContextSource,
  validateM109RepositoryIndex,
} from "../src/core/context-assembly-runtime.js";
import {
  decideM110CatalogPublication,
  decideM110ModelActivation,
  validateM110FreeEndpointEvidence,
  validateM110ModelCandidate,
} from "../src/core/model-discovery-directory-runtime.js";
import {
  decideM111PluginInstall,
  decideM111PluginInvocation,
  validateM111PluginAttestation,
  validateM111PluginManifest,
} from "../src/core/plugin-marketplace-runtime.js";
import {
  decideM112ApprovalSurface,
  validateM112CollaborativeRun,
  validateM112Notification,
  validateM112Onboarding,
} from "../src/core/product-collaboration-runtime.js";
import {
  decideM113GovernedSearch,
  validateM113AnalyticsReport,
  validateM113AppendOnlyEvent,
  validateM113SeedFixture,
} from "../src/core/data-plane-analytics-runtime.js";

describe("M109-M113 deterministic contract kernels", () => {
  it("M109 bounds context sources, repository indexing and context quality", () => {
    expect(validateM109ContextSource({ organizationId: "org-1", sourceId: "source", kind: "repository", locator: "src/index.ts", contentHash: "content", snapshotHash: "snapshot", ownerTenantId: "org-1", accessSubjectHash: "subject", trust: "verified", redacted: true, freshUntil: Date.now() + 60_000, deleted: false }).allowed).toBe(true);
    expect(decideM109ContextAssembly({ organizationId: "org-1", taskId: "task", sourceIds: ["source"], requiredLayers: ["repository"], tokenBudget: 1000, pathAllowlist: ["src"], localOnly: false, staleAllowed: false, citationRequired: true }).allowed).toBe(true);
    expect(validateM109RepositoryIndex({ organizationId: "org-1", repositoryId: "repo", snapshotHash: "snapshot", parserVersion: "v1", symbolCount: 10, importEdgeCount: 4, indexedPaths: ["src/index.ts"], complete: true, untrustedFilesExcluded: true, pathTraversalChecked: true }).allowed).toBe(true);
    expect(validateM109ContextQuality({ organizationId: "org-1", taskId: "task", selectedSourceIds: ["source"], citationHashes: ["citation"], tokenBudget: 1000, tokenUsed: 400, staleSourceCount: 0, omittedSourceCount: 1, qualityReviewed: true }).allowed).toBe(true);
    expect(validateM109ContextSource({ organizationId: "org-1", sourceId: "source", kind: "document", locator: "../secret", contentHash: "content", snapshotHash: "snapshot", ownerTenantId: "other", accessSubjectHash: "subject", trust: "untrusted", redacted: false, freshUntil: Date.now() + 60_000, deleted: false }).allowed).toBe(false);
  });

  it("M110 separates untrusted discovery from verified free endpoint activation", () => {
    expect(validateM110ModelCandidate({ organizationId: "org-1", candidateId: "candidate", modelReference: "provider:model", source: "provider", sourceUrl: "https://provider.example/model", descriptionHash: "description", licenseReference: "license", capabilities: ["code"], contextWindow: 8192, freeTierClaimed: true, localCompatible: false, discoveredAt: Date.now(), untrustedDescription: true }).allowed).toBe(true);
    expect(validateM110FreeEndpointEvidence({ organizationId: "org-1", candidateId: "candidate", endpointReference: "https://api.example", protocol: "openai_compatible", authMode: "byok", requestHash: "request", responseSchemaHash: "response", observedStatus: 200, quotaDocumented: true, tosReviewed: true, noRawKeyStored: true, verifiedAt: Date.now() }).allowed).toBe(true);
    expect(decideM110CatalogPublication({ organizationId: "org-1", candidateId: "candidate", lifecycle: "listed", modelCardHash: "card", provenanceHash: "provenance", safetyReviewHash: "safety", freshnessUntil: Date.now() + 60_000, reviewerHash: "reviewer", publishApproved: true }).allowed).toBe(true);
    expect(decideM110ModelActivation({ organizationId: "org-1", modelReference: "provider:model", route: "free", candidateVerified: true, privacyReviewed: true, quotaKnown: true, fallbackRoute: "local", userConsent: true, active: true }).allowed).toBe(true);
    expect(validateM110FreeEndpointEvidence({ organizationId: "org-1", candidateId: "candidate", endpointReference: "http://remote.example", protocol: "custom", authMode: "byok", requestHash: "request", responseSchemaHash: "response", observedStatus: 200, quotaDocumented: true, tosReviewed: true, noRawKeyStored: true, verifiedAt: Date.now() }).allowed).toBe(false);
  });

  it("M111 gates plugin manifest, attestation, least privilege install and invocation", () => {
    expect(validateM111PluginManifest({ organizationId: "org-1", pluginId: "plugin", version: "1.0.0", kind: "tool", packageDigest: "digest", manifestHash: "manifest", signatureHash: "signature", publisherHash: "publisher", requestedPermissions: ["read"], allowedHosts: ["api.example.com"], sandboxRequired: true, sourceReviewHash: "review", lifecycle: "listed" }).allowed).toBe(true);
    expect(validateM111PluginAttestation({ organizationId: "org-1", pluginId: "plugin", version: "1.0.0", sbomHash: "sbom", dependencyScanHash: "dependencies", licenseReviewHash: "license", injectionScanHash: "injection", secretScanPassed: true, dependencyScanPassed: true, reproducibleBuild: true, untrustedCodeSandboxed: true }).allowed).toBe(true);
    expect(decideM111PluginInstall({ organizationId: "org-1", pluginId: "plugin", version: "1.0.0", grantedPermissions: ["read"], grantedHosts: ["api.example.com"], approvalPresent: true, tenantIsolationPassed: true, licenseAccepted: true, consentRecorded: true, rollbackPlanHash: "rollback", idempotencyKey: "idem" }, ["read"], ["api.example.com"]).allowed).toBe(true);
    expect(decideM111PluginInvocation({ organizationId: "org-1", pluginId: "plugin", operation: "list", permissionRequired: "read", host: "api.example.com", inputHash: "input", outputRedacted: true, approvalPresent: false, sandboxed: true, timeoutMs: 1000 }, ["read"], ["api.example.com"]).allowed).toBe(true);
    expect(decideM111PluginInvocation({ organizationId: "org-1", pluginId: "plugin", operation: "write", permissionRequired: "write", inputHash: "input", outputRedacted: false, approvalPresent: false, sandboxed: false, timeoutMs: 999999 }, ["read"], []).allowed).toBe(false);
  });

  it("M112 gates onboarding, actionable notifications, approval and collaborative runs", () => {
    expect(validateM112Onboarding({ organizationId: "org-1", userHash: "user", projectId: "project", state: "completed", computeMode: "free", consentRecorded: true, connectionChecked: true, firstRunEvidenceHash: "first-run", dismissedSafetyNotice: true, locale: "en", externalEgressAllowed: false }).allowed).toBe(true);
    expect(validateM112Notification({ organizationId: "org-1", notificationId: "notification", recipientHash: "recipient", kind: "approval", titleHash: "title", bodyHash: "body", sourceRunId: "run", dedupeKey: "dedupe", channel: "in_app", secretRedacted: true, actionable: true, acknowledged: false }).allowed).toBe(true);
    expect(decideM112ApprovalSurface({ organizationId: "org-1", approvalId: "approval", runId: "run", actorHash: "actor", action: "approve", riskSummaryHash: "risk", diffHash: "diff", reversible: true, expiresAt: Date.now() + 60_000, humanDecision: true, separationOfDuties: true }).allowed).toBe(true);
    expect(validateM112CollaborativeRun({ organizationId: "org-1", runId: "run", ownerHash: "owner", participantHashes: ["reviewer"], commentCount: 2, localMode: true, externalEgressAllowed: false, auditTrailHash: "audit" }).allowed).toBe(true);
    expect(validateM112Onboarding({ organizationId: "org-1", userHash: "user", projectId: "project", state: "completed", computeMode: "local", consentRecorded: true, connectionChecked: true, firstRunEvidenceHash: "first-run", dismissedSafetyNotice: true, locale: "en", externalEgressAllowed: true }).allowed).toBe(false);
  });

  it("M113 enforces deterministic seed data, immutable events, governed search and analytics", () => {
    expect(validateM113SeedFixture({ organizationId: "org-1", fixtureId: "fixture", version: "v1", schemaHash: "schema", fixtureHash: "fixture-hash", records: 10, piiRedacted: true, deterministic: true, idempotencyKey: "idem", approved: true }).allowed).toBe(true);
    expect(validateM113AppendOnlyEvent({ organizationId: "org-1", eventId: "event", aggregateId: "run", kind: "run", sequence: 0, payloadHash: "payload", previousEventHash: "root", eventHash: "event-hash", occurredAt: Date.now(), redacted: true, immutable: true }).allowed).toBe(true);
    expect(decideM113GovernedSearch({ organizationId: "org-1", queryId: "query", scope: "project", queryHash: "query-hash", projectId: "project", limit: 20, offset: 0, aclSubjectHash: "subject", tenantFilterApplied: true, piiSafe: true }).allowed).toBe(true);
    expect(validateM113AnalyticsReport({ organizationId: "org-1", reportId: "report", periodStart: 1, periodEnd: 2, eventCount: 10, uniqueRuns: 5, dimensions: ["kind"], aggregationHash: "aggregation", costRedacted: true, tenantScoped: true, sourceWatermark: "watermark" }).allowed).toBe(true);
    expect(decideM113GovernedSearch({ organizationId: "org-1", queryId: "query", scope: "project", queryHash: "query-hash", projectId: "project", limit: 20, offset: 0, aclSubjectHash: "subject", tenantFilterApplied: false, piiSafe: false }).allowed).toBe(false);
  });
});
