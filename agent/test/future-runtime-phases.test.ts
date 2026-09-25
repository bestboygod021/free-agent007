import { describe, expect, it } from "vitest";

import { decideOfflineCollaboration, decideRunCollaboration, planOnboarding, validateCollaborationContent, validateProjectTemplate } from "../src/core/collaboration-onboarding-runtime.js";
import { decideOfflineAction, resolveLocaleFallback, validateDesignTokenSet, validateMessageCatalog, validatePwaManifest } from "../src/core/localization-design-runtime.js";
import { classifyExternalSignal, decideBrowserNavigation, planHumanHandover, validateBrowserSession, validateHarvesterRequest } from "../src/core/browser-signal-runtime.js";
import { decideDependencyLicense, decideOutputRights, planVulnerabilityDisclosure, validateEnterpriseUpgrade, validateLegalDocument } from "../src/core/legal-enterprise-governance-runtime.js";
import { decideReadinessGate, planCanary, planCutover, validateIntegrationEvidence, validateRollbackEvidence } from "../src/core/production-cutover-evidence.js";

describe("M44 collaboration and onboarding runtime", () => {
  it("keeps run collaboration, templates and offline actions bounded", () => {
    expect(decideRunCollaboration({ organizationId: "org", runId: "run", actorId: "dev", actorRole: "developer", action: "comment", contentHash: "comment" }).allowed).toBe(true);
    expect(planOnboarding({ organizationId: "org", userId: "user", mode: "local", steps: ["mode", "project"], completedSteps: ["mode"], externalEgressConsent: false, approvalPresent: false }).allowed).toBe(true);
    expect(validateProjectTemplate({ organizationId: "org", templateId: "starter", source: "curated", version: "1", contentHash: "content", license: "MIT", approved: true }).allowed).toBe(true);
    expect(validateCollaborationContent("org", "comment", false).allowed).toBe(true);
    expect(decideOfflineCollaboration("comment", false, "idempotent", false).allowed).toBe(true);
  });
});

describe("M45 localization and design runtime", () => {
  it("requires complete catalogs, RTL tokens and safe degraded clients", () => {
    expect(validateMessageCatalog({ locale: "fa-IR", version: "1", fallbackLocale: "en-US", messageKeys: ["run.title"], translatedKeys: ["run.title"], numberSystem: "arab", rtl: true }).allowed).toBe(true);
    expect(resolveLocaleFallback("de", ["en-US", "fa-IR"], "en-US").resolvedLocale).toBe("en-US");
    expect(validateDesignTokenSet({ version: "1", theme: "dark", direction: "rtl", colorTokens: { focus: "#fff" }, spacingTokens: { "inline-start": 8 }, focusToken: "focus", contrastVerified: true }).allowed).toBe(true);
    expect(decideOfflineAction({ organizationId: "org", action: "read_timeline", idempotencyKey: "i", queuedAt: 1, connectivity: "offline", localSnapshotHash: "snapshot" }).allowed).toBe(true);
    expect(validatePwaManifest({ appId: "forge", version: "1", startUrl: "/", display: "standalone", offlineReadModel: true, storesCredentials: false, cacheScope: "tenant:org" }).allowed).toBe(true);
  });
});

describe("M46 browser and external signal runtime", () => {
  it("enforces allowlists, human handover and untrusted harvesting", () => {
    expect(validateBrowserSession({ organizationId: "org", sessionId: "session", domain: "example.com", allowlisted: true, recordingEnabled: true, persistCookies: false, containsRawCredential: false }).allowed).toBe(true);
    expect(decideBrowserNavigation({ organizationId: "org", domain: "example.com", action: "read", urlHash: "url", allowlisted: true, hasCaptcha: false, requiresMfa: false, approvalPresent: false }, 1).allowed).toBe(true);
    expect(planHumanHandover({ organizationId: "org", sessionId: "session", reason: "captcha", redactedContextHash: "context", expiresAt: 100 }, 1).requiresHumanHandover).toBe(true);
    expect(classifyExternalSignal({ organizationId: "org", source: "webpage", sourceUrlHash: "url", contentHash: "content", fetchedAt: 1, containsInstruction: true, trust: "untrusted" }).allowed).toBe(false);
    expect(validateHarvesterRequest({ organizationId: "org", domain: "example.com", queryHash: "query", maxPages: 10, rateLimitPerMinute: 5, robotsPolicyChecked: true, bulkAccountCreation: false }).allowed).toBe(true);
  });
});

describe("M47 legal and enterprise governance runtime", () => {
  it("requires approved legal terms, license review and upgrade plans", () => {
    expect(validateLegalDocument({ documentId: "terms", kind: "terms", version: "1", locale: "en-US", contentHash: "content", effectiveAt: 1, reviewedBy: "legal", approved: true }).allowed).toBe(true);
    expect(decideOutputRights({ organizationId: "org", userOwnsOutput: true, providerTrainingOptOut: true, thirdPartyContentPresent: false, disclaimerAccepted: true, licenseReviewPresent: false }).allowed).toBe(true);
    expect(decideDependencyLicense({ organizationId: "org", dependency: "redis", license: "BSD", allowedForSelfHost: true, replacementDocumented: false, reviewedAt: 1, reviewerId: "legal" }).allowed).toBe(true);
    expect(planVulnerabilityDisclosure({ organizationId: "org", policyVersion: "1", contactReference: "security-contact", responseSlaHours: 72, severityMatrixHash: "matrix", publicDisclosureAllowed: false, approvalPresent: false }).allowed).toBe(true);
    expect(validateEnterpriseUpgrade({ organizationId: "org", fromEdition: "community", toEdition: "enterprise", fromVersion: "1", toVersion: "2", dataPortabilityPlanHash: "data", supportPlanHash: "support", approvalPresent: true }).allowed).toBe(true);
  });
});

describe("M48 production cutover evidence runtime", () => {
  it("does not treat design or kernel output as production evidence", () => {
    const integration = { organizationId: "org", capabilityId: "capability", adapterId: "adapter", environment: "staging" as const, commandHash: "command", artifactHash: "artifact", exitCode: 0, observedAt: 1, tenantProbePassed: true, evidenceLevel: "integration" as const };
    expect(validateIntegrationEvidence(integration).allowed).toBe(true);
    expect(decideReadinessGate({ organizationId: "org", capabilityId: "capability", requiredEvidence: ["integration"], evidence: [integration], securityFindings: 0, openIncidents: 0, rollbackPlanHash: "rollback", approvalPresent: true }).allowed).toBe(true);
    expect(planCanary({ organizationId: "org", capabilityId: "capability", target: "canary", percentage: 10, durationMs: 60_000, successMetric: "success", abortMetric: "error", approvalPresent: true }).allowed).toBe(true);
    expect(planCutover({ organizationId: "org", capabilityId: "capability", target: "production", changeHash: "change", dependencyEvidenceHashes: ["evidence"], dependencyEvidenceLevels: ["integration"], rollbackPlanHash: "rollback", approvalPresent: true }).allowed).toBe(true);
    expect(validateRollbackEvidence("org", "capability", "rollback", "metric_breach", false).allowed).toBe(true);
  });
});
