import { describe, expect, it } from "vitest";
import {
  decideM114OutputPublication,
  validateM114DisclosureReport,
  validateM114LegalPolicy,
  validateM114ProviderTerms,
} from "../src/core/legal-disclosure-runtime.js";
import {
  decideM115Route,
  validateM115ProviderOffer,
  validateM115Quota,
  validateM115RoutingOutcome,
} from "../src/core/provider-routing-economics-runtime.js";
import {
  decideM116Conflict,
  validateM116Connection,
  validateM116Cursor,
  validateM116Health,
} from "../src/core/platform-sync-health-runtime.js";
import {
  decideM117AccountActivity,
  decideM117SafetyAction,
  validateM117AbuseSignal,
  validateM117DlpInspection,
} from "../src/core/abuse-safety-runtime.js";
import {
  decideM118Cutover,
  decideM118Readiness,
  validateM118CanaryEvidence,
  validateM118EvidenceEnvelope,
} from "../src/core/production-evidence-runtime.js";

describe("M114-M118 deterministic contract kernels", () => {
  it("M114 gates legal policy, output rights, provider terms and disclosure", () => {
    expect(validateM114LegalPolicy({ organizationId: "org-1", policyId: "privacy", artifact: "privacy", version: "v1", jurisdiction: "US", effectiveAt: Date.now() - 1000, expiresAt: Date.now() + 60_000, status: "approved", ownerHash: "owner", reviewedByHash: "reviewer", userConsentRequired: true, publicNoticeHash: "notice" }).allowed).toBe(true);
    expect(decideM114OutputPublication({ organizationId: "org-1", outputId: "output", sourceRunId: "run", modelReference: "local:model", licenseReferences: ["MIT"], providerTermsReviewed: true, userInputSeparated: true, thirdPartyContentDetected: true, attributionRequired: true, attributionPresent: true, disclaimerPresent: true, publicationApproved: true }).allowed).toBe(true);
    expect(validateM114ProviderTerms({ organizationId: "org-1", provider: "local", termsUrl: "https://provider.example/terms", termsHash: "terms", reviewedAt: Date.now(), reviewedByHash: "reviewer", dataTrainingPolicyKnown: true, retentionPolicyKnown: true, allowedComputeModes: ["local", "byok", "free"], consentRequired: false, accepted: true }).allowed).toBe(true);
    expect(validateM114DisclosureReport({ organizationId: "org-1", reportId: "report", reporterHash: "reporter", vulnerabilityClass: "injection", evidenceHash: "evidence", privateChannel: true, triaged: true, remediationOwnerHash: "owner", publicDisclosureApproved: false }).allowed).toBe(true);
    expect(decideM114OutputPublication({ organizationId: "org-1", outputId: "output", sourceRunId: "run", modelReference: "model", licenseReferences: [], providerTermsReviewed: false, userInputSeparated: false, thirdPartyContentDetected: true, attributionRequired: true, attributionPresent: false, disclaimerPresent: false, publicationApproved: false }).allowed).toBe(false);
  });

  it("M115 enforces privacy-aware provider routing and quota evidence", () => {
    const offer = { organizationId: "org-1", providerId: "provider", modelReference: "local:model", mode: "local" as const, endpointReference: "http://localhost:11434", capabilityHashes: ["code"], pricePerUnit: 0, currency: "USD", quotaUnits: 1000, privacyReviewed: true, healthEvidenceHash: "health", termsAccepted: true, enabled: true };
    expect(validateM115ProviderOffer(offer).allowed).toBe(true);
    expect(decideM115Route({ organizationId: "org-1", requestId: "request", requiredCapability: "code", preferredMode: "local", allowedModes: ["local", "byok"], maxCost: 1, maxLatencyMs: 1000, dataLocalOnly: true, fallbackMode: "byok", userConsent: true }, offer).allowed).toBe(true);
    expect(validateM115Quota({ organizationId: "org-1", providerId: "provider", mode: "local", quotaLimit: 1000, quotaUsed: 10, resetAt: Date.now() + 60_000, requestCost: 1, rpmLimit: 60, rpmUsed: 1, headersObserved: true }).allowed).toBe(true);
    expect(validateM115RoutingOutcome({ organizationId: "org-1", requestId: "request", providerId: "provider", modelReference: "local:model", selectedMode: "local", reason: "privacy", estimatedCost: 0, estimatedLatencyMs: 100, fallbackAvailable: true, routeEvidenceHash: "route", privacyBoundaryPassed: true }).allowed).toBe(true);
    expect(decideM115Route({ organizationId: "org-1", requestId: "request", requiredCapability: "code", preferredMode: "free", allowedModes: ["free"], maxCost: 1, maxLatencyMs: 1000, dataLocalOnly: true, fallbackMode: "none", userConsent: true }, { ...offer, mode: "free", endpointReference: "https://free.example" }).allowed).toBe(false);
  });

  it("M116 gates sync consent, monotonic cursors, human conflicts and fallback health", () => {
    expect(validateM116Connection({ organizationId: "org-1", connectionId: "connection", provider: "github", direction: "bidirectional", scopeHash: "scope", credentialReference: "opaque-ref", consentRecorded: true, webhookVerified: true, cursorNamespace: "ns", revoked: false, localFallback: "read_only" }).allowed).toBe(true);
    expect(validateM116Cursor({ organizationId: "org-1", connectionId: "connection", cursorId: "cursor", providerCursor: "remote-1", localSequence: 2, lastEventHash: "event", dedupeWindowSeconds: 60, observedAt: Date.now(), monotonic: true }).allowed).toBe(true);
    expect(decideM116Conflict({ organizationId: "org-1", conflictId: "conflict", connectionId: "connection", kind: "version", localVersion: "1", remoteVersion: "2", resourceReference: "repo/file", localHash: "local", remoteHash: "remote", resolution: "remote", humanReviewed: true, dataRedacted: true }).allowed).toBe(true);
    expect(validateM116Health({ organizationId: "org-1", connectionId: "connection", state: "healthy", checkedAt: Date.now(), latencyMs: 100, consecutiveFailures: 0, lastSuccessAt: Date.now(), revokedConfirmed: false, fallbackAvailable: true }).allowed).toBe(true);
    expect(validateM116Health({ organizationId: "org-1", connectionId: "connection", state: "reconnect", checkedAt: Date.now(), latencyMs: 100, consecutiveFailures: 3, retryAfterMs: 1000, revokedConfirmed: false, fallbackAvailable: false }).allowed).toBe(false);
  });

  it("M117 blocks prohibited abuse and requires DLP redaction", () => {
    const policy = { organizationId: "org-1", policyId: "safety", blockedClasses: ["malware", "credential_abuse"] as const, reviewThreshold: 0.5, denyThreshold: 0.8, maxBulkItems: 10, scrapingRequiresApproval: true, malwareSandboxRequired: true, reviewed: true };
    const signal = { organizationId: "org-1", signalId: "signal", actorHash: "actor", abuseClass: "spam" as const, score: 0.1, source: "rule" as const, evidenceHash: "evidence", observedAt: Date.now(), repeatCount: 0, humanReview: false };
    expect(validateM117AbuseSignal(signal).allowed).toBe(true);
    expect(decideM117SafetyAction(signal, policy).allowed).toBe(true);
    expect(validateM117DlpInspection({ organizationId: "org-1", inspectionId: "inspection", artifactHash: "artifact", secretMatches: 0, personalDataMatches: 0, tenantMismatchMatches: 0, patternsVersion: "v1", redacted: true, blocked: false }).allowed).toBe(true);
    expect(decideM117AccountActivity({ organizationId: "org-1", actorHash: "actor", activityId: "activity", targetCount: 2, uniqueTargets: 2, intervalMs: 1000, captchaOrMfaBypassAttempt: false, bulkCreation: false, consentPresent: true, approvalPresent: true, idempotencyKey: "idem" }, policy).allowed).toBe(true);
    expect(decideM117AccountActivity({ organizationId: "org-1", actorHash: "actor", activityId: "activity", targetCount: 2, uniqueTargets: 2, intervalMs: 1000, captchaOrMfaBypassAttempt: true, bulkCreation: true, consentPresent: true, approvalPresent: true, idempotencyKey: "idem" }, policy).allowed).toBe(false);
  });

  it("M118 separates integration evidence from production claims and gates cutover", () => {
    expect(validateM118EvidenceEnvelope({ organizationId: "org-1", evidenceId: "evidence", phase: "M118", layer: "integration", environment: "staging", commandHash: "command", artifactHash: "artifact", testEvidenceHash: "tests", securityEvidenceHash: "security", tenantProbePassed: true, redacted: true, observedAt: Date.now(), operatorHash: "operator" }).allowed).toBe(true);
    expect(decideM118Readiness({ organizationId: "org-1", assessmentId: "assessment", releaseId: "release", requiredEvidence: ["e2e", "security"], completedEvidence: ["e2e", "security"], openGaps: [], openIncidents: 0, approvalPresent: true, rollbackReady: true, productionClaimAllowed: false }).allowed).toBe(true);
    expect(validateM118CanaryEvidence({ organizationId: "org-1", canaryId: "canary", releaseId: "release", trafficPercent: 10, durationMinutes: 10, errorRate: 0.011, latencyP95Ms: 110, baselineErrorRate: 0.01, baselineLatencyP95Ms: 100, state: "passed", rollbackTested: true, customerImpactRedacted: true }).allowed).toBe(true);
    expect(decideM118Cutover({ organizationId: "org-1", releaseId: "release", readiness: "ready", canaryPassed: true, approvalPresent: true, openIncidents: 0, rollbackReady: true, productionDeployRequested: true, localFallbackAvailable: true }).allowed).toBe(true);
    expect(decideM118Cutover({ organizationId: "org-1", releaseId: "release", readiness: "ready", canaryPassed: false, approvalPresent: true, openIncidents: 1, rollbackReady: false, productionDeployRequested: true, localFallbackAvailable: false }).allowed).toBe(false);
  });
});
