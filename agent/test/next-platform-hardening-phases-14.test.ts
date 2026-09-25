import { describe, expect, it } from "vitest";
import { decideM194Claim, decideM194Disclosure, validateM194Envelope, validateM194Replay } from "../src/core/evidence-envelope-runtime.js";
import { decideM195Circuit, decideM195Route, validateM195Health, validateM195Provider } from "../src/core/provider-health-runtime.js";
import { decideM196Execution, decideM196Revocation, validateM196Certification, validateM196Manifest } from "../src/core/plugin-certification-runtime.js";
import { decideM197Escalation, validateM197Delivery, validateM197Intent, validateM197Preference } from "../src/core/notification-governance-runtime.js";
import { decideM198Activation, decideM198Retirement, validateM198Discovery, validateM198Model } from "../src/core/model-catalog-freshness-runtime.js";

describe("M194-M198 deterministic contract kernels", () => {
  it("M194 gates evidence envelopes, claims, replay and disclosure", () => {
    expect(validateM194Envelope({ organizationId: "org-1", evidenceId: "evidence", claimId: "claim", claimType: "run-success", runId: "run", inputHash: "input", outputHash: "output", traceHash: "trace", testEvidenceHash: "tests", policyHash: "policy", createdAt: 1_000, expiresAt: 2_000, signerId: "signer", redacted: true, tenantBound: true }, 1_100).allowed).toBe(true);
    expect(decideM194Claim({ organizationId: "org-1", claimId: "claim", claimType: "run-success", requiredEvidenceIds: ["evidence"], suppliedEvidenceIds: ["evidence"], contradictionHashes: [], freshnessAt: 2_000, signerVerified: true, policySatisfied: true, tenantMatch: true }, 1_100).allowed).toBe(true);
    expect(validateM194Replay({ organizationId: "org-1", claimId: "claim", replayId: "replay", inputHash: "input", expectedOutputHash: "output", replayedOutputHash: "output", traceHash: "trace", outputMatches: true, deterministic: true, sandboxed: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM194Disclosure({ organizationId: "org-1", disclosureId: "disclosure", claimHash: "claim-hash", evidenceHash: "evidence-hash", userVisible: true, noFalseGuarantee: true, redacted: true, approved: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM194Claim({ organizationId: "org-1", claimId: "claim", claimType: "run-success", requiredEvidenceIds: ["evidence"], suppliedEvidenceIds: [], contradictionHashes: [], freshnessAt: 2_000, signerVerified: true, policySatisfied: true, tenantMatch: true }, 1_100).allowed).toBe(false);
  });

  it("M195 gates provider manifests, health, circuits and fallback routes", () => {
    expect(validateM195Provider({ organizationId: "org-1", providerId: "local", mode: "local", endpointReference: "local-runtime", capabilities: ["code"], quotaRemaining: 100, region: "local", termsReviewed: true, credentialReference: "none", healthPolicyHash: "policy", tenantBound: true }).allowed).toBe(true);
    expect(validateM195Health({ organizationId: "org-1", providerId: "local", sampleId: "sample", sampledAt: 1_000, latencyMs: 30, statusCode: 200, success: true, errorClass: "none", quotaRemaining: 90, evidenceHash: "evidence", signed: true, tenantMatch: true }, 1_100).allowed).toBe(true);
    expect(decideM195Circuit({ organizationId: "org-1", providerId: "local", circuitId: "circuit", state: "closed", consecutiveFailures: 0, failureThreshold: 3, cooldownUntil: 1_100, probeAllowed: true, fallbackDisclosed: true, approvalPresent: true, tenantMatch: true }, 1_000).allowed).toBe(true);
    expect(decideM195Route({ organizationId: "org-1", routeId: "route", requestedCapability: "code", candidateProviderIds: ["local", "free"], selectedProviderId: "local", healthFresh: true, quotaAvailable: true, dataEgress: "never", fallbackDisclosed: true, budgetAvailable: true, consentPresent: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM195Circuit({ organizationId: "org-1", providerId: "free", circuitId: "circuit", state: "open", consecutiveFailures: 3, failureThreshold: 3, cooldownUntil: 2_000, probeAllowed: false, fallbackDisclosed: false, approvalPresent: true, tenantMatch: true }, 1_000).allowed).toBe(false);
  });

  it("M196 gates plugin manifests, sandbox execution, certification and revocation", () => {
    expect(validateM196Manifest({ organizationId: "org-1", pluginId: "plugin", publisherId: "publisher", artifactDigest: "digest", apiVersion: "1", entrypoint: "index.js", capabilities: ["format"], permissions: ["workspace.read"], license: "MIT", signed: true, attestationHash: "attestation", sandboxed: true, noNetwork: true, noSecrets: true, tenantBound: true }).allowed).toBe(true);
    expect(decideM196Execution({ organizationId: "org-1", pluginId: "plugin", executionId: "execution", inputHash: "input", requestedCapability: "format", targetReference: "workspace-ref", timeoutSeconds: 30, sandboxed: true, networkAllowed: false, secretAccess: false, approvalPresent: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM196Certification({ organizationId: "org-1", pluginId: "plugin", certificationId: "certification", apiCompatible: true, licenseAllowed: true, staticScanHash: "static", behaviorTestHash: "behavior", permissionReviewHash: "permissions", publisherVerified: true, expiresAt: 2_000, approved: true, tenantMatch: true }, 1_000).allowed).toBe(true);
    expect(decideM196Revocation({ organizationId: "org-1", pluginId: "plugin", revocationId: "revocation", reasonHash: "reason", artifactDigest: "digest", revokedAt: 1_500, propagated: true, blocked: true, approvalPresent: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM196Execution({ organizationId: "org-1", pluginId: "plugin", executionId: "execution", inputHash: "input", requestedCapability: "format", targetReference: "workspace-ref", timeoutSeconds: 30, sandboxed: true, networkAllowed: true, secretAccess: false, approvalPresent: true, tenantMatch: true }).allowed).toBe(false);
  });

  it("M197 gates notification intent, preferences, delivery and escalation", () => {
    expect(validateM197Intent({ organizationId: "org-1", notificationId: "notification", eventType: "run.complete", sensitivity: "operational", contentHash: "content", recipientHash: "recipient", allowedChannels: ["in_app"], consentPresent: true, preferenceHash: "preference", dedupeKey: "dedupe", ttlSeconds: 3_600, tenantBound: true }).allowed).toBe(true);
    expect(validateM197Preference({ organizationId: "org-1", preferenceId: "preference", recipientHash: "recipient", enabledChannels: ["in_app"], optedIn: true, quietHoursStart: 22, quietHoursEnd: 7, criticalBypassesQuietHours: true, categoryVersion: "1", approved: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM197Delivery({ organizationId: "org-1", notificationId: "notification", deliveryId: "delivery", channel: "in_app", providerReference: "provider-message", status: "delivered", attempts: 1, deliveredAt: 2_000, redacted: true, consentChecked: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM197Escalation({ organizationId: "org-1", notificationId: "notification", escalationId: "escalation", currentLevel: 1, maximumLevel: 3, nextDeadlineAt: 2_000, humanApprovalPresent: true, noSpamProof: true, critical: true, tenantMatch: true }, 1_000).allowed).toBe(true);
    expect(validateM197Intent({ organizationId: "org-1", notificationId: "notification", eventType: "run.complete", sensitivity: "operational", contentHash: "content", recipientHash: "recipient", allowedChannels: ["email"], consentPresent: false, preferenceHash: "preference", dedupeKey: "dedupe", ttlSeconds: 3_600, tenantBound: true }).allowed).toBe(false);
  });

  it("M198 gates catalog records, discovery, activation and retirement", () => {
    expect(validateM198Model({ organizationId: "org-1", modelId: "local-model", providerId: "local", mode: "local", capabilityClaims: ["code"], modelCardHash: "card", license: "Apache-2.0", dataPolicyHash: "policy", quotaRemaining: 100, observedAt: 1_000, expiresAt: 2_000, verified: true, freeTierDisclosed: true, tenantBound: true }, 1_100).allowed).toBe(true);
    expect(validateM198Discovery({ organizationId: "org-1", modelId: "free-model", discoveryId: "discovery", sourceHash: "source", endpointReference: "catalog-ref", observedAt: 1_000, modelCardHash: "card", freeTierEvidenceHash: "free-tier", provenanceHash: "provenance", redacted: true, approved: true, tenantMatch: true }, 1_100).allowed).toBe(true);
    expect(decideM198Activation({ organizationId: "org-1", modelId: "local-model", activationId: "activation", requestedCapability: "code", modelFresh: true, capabilityProven: true, healthProven: true, budgetAvailable: true, consentPresent: true, fallbackMode: "local", disclosurePresent: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM198Retirement({ organizationId: "org-1", modelId: "old-model", retirementId: "retirement", reasonHash: "reason", replacementModelId: "new-model", migrationEvidenceHash: "migration", userDisclosed: true, trafficStopped: true, rollbackAvailable: true, approvalPresent: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM198Model({ organizationId: "org-1", modelId: "stale-model", providerId: "provider", mode: "hosted", capabilityClaims: ["code"], modelCardHash: "card", license: "license", dataPolicyHash: "policy", quotaRemaining: 1, observedAt: 1_000, expiresAt: 1_050, verified: true, freeTierDisclosed: true, tenantBound: true }, 1_100).allowed).toBe(false);
  });
});
