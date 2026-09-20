import { describe, expect, it } from "vitest";
import { decideM134ImportPlan, decideM134Portability, validateM134ExportManifest, validateM134ExportRequest } from "../src/core/data-portability-runtime.js";
import { decideM135Pairing, decideM135Revocation, validateM135Device, validateM135Grant } from "../src/core/device-pairing-trust-runtime.js";
import { decideM136Distribution, decideM136Drift, validateM136Exception, validateM136PolicyBundle } from "../src/core/policy-drift-runtime.js";
import { decideM137Case, decideM137Containment, validateM137Postmortem, validateM137Signal } from "../src/core/incident-case-runtime.js";
import { decideM138Retention, decideM138Telemetry, validateM138Consent, validateM138Feedback } from "../src/core/privacy-telemetry-runtime.js";

describe("M134-M138 deterministic contract kernels", () => {
  it("M134 gates export manifests, import dry-runs and tenant portability", () => {
    const now = 1_000;
    const request = { organizationId: "org-1", exportId: "export", scopes: ["workspace" as const], format: "jsonl" as const, schemaVersion: "v1", redactionPolicyHash: "redaction", userConsent: true, approvalPresent: true, legalHoldPresent: false, includeSecrets: false as const, expiresAt: 2_000, tenantBound: true };
    const manifest = { organizationId: "org-source", exportId: "export", schemaVersion: "v1", format: "jsonl" as const, itemCount: 2, byteCount: 100, rootHash: "root", checksum: "checksum", encryptionKeyReference: "opaque-key-ref", createdAt: 100, expiresAt: 2_000, redactionPolicyHash: "redaction", tenantBound: true, rawSecretsStored: false as const };
    const plan = { organizationId: "org-target", importId: "import", sourceManifestHash: "manifest", sourceOrganizationId: "org-source", targetOrganizationId: "org-target", sourceSchemaVersion: "v1", targetSchemaVersion: "v1", schemaCompatible: true, mappingHash: "mapping", conflictPolicy: "fail" as const, dryRun: true, approvalPresent: true, secretsAbsent: true, tenantIsolationVerified: true, rollbackPlanHash: "rollback" };
    expect(validateM134ExportRequest(request, now).allowed).toBe(true);
    expect(validateM134ExportManifest(manifest, now).allowed).toBe(true);
    expect(decideM134ImportPlan(plan).allowed).toBe(true);
    expect(decideM134Portability(plan, manifest, now).allowed).toBe(true);
    expect(decideM134ImportPlan({ ...plan, dryRun: false }).allowed).toBe(false);
  });

  it("M135 gates device trust, consented pairing, grants and revocation", () => {
    const now = 1_000;
    expect(validateM135Device({ organizationId: "org-1", deviceId: "device", platform: "desktop", keyReference: "opaque-key-ref", attestationHash: "attestation", trustState: "trusted", capabilities: ["approved_remote"], localOnly: false, lastSeenAt: 900 }).allowed).toBe(true);
    expect(decideM135Pairing({ organizationId: "org-1", pairingId: "pair", deviceId: "device", method: "qr_challenge", challengeHash: "challenge", requestedScopes: ["workspace:read"], expiresAt: 2_000, userConsent: true, approvalPresent: true, tenantMatch: true, mfaSatisfied: true }, now).allowed).toBe(true);
    expect(validateM135Grant({ organizationId: "org-1", grantId: "grant", deviceId: "device", scopes: ["workspace:read"], issuedAt: 900, expiresAt: 2_000, tenantMatch: true, mfaSatisfied: true, approvalPresent: true, refreshable: false, rawPrivateKeyStored: false }, now).allowed).toBe(true);
    expect(decideM135Revocation({ organizationId: "org-1", deviceId: "device", reasonHash: "reason", requestedAt: 1_100, propagated: true, activeGrantsRevoked: true, localCacheInvalidated: true, auditReference: "audit" }).allowed).toBe(true);
    expect(decideM135Pairing({ organizationId: "org-1", pairingId: "pair", deviceId: "device", method: "qr_challenge", challengeHash: "challenge", requestedScopes: ["workspace:read"], expiresAt: 2_000, userConsent: false, approvalPresent: true, tenantMatch: true, mfaSatisfied: true }, now).allowed).toBe(false);
  });

  it("M136 gates signed policy distribution, drift and bounded exceptions", () => {
    const now = 1_000;
    const bundle = { organizationId: "org-1", policyId: "policy", version: "v2", bundleDigest: "digest", rulesHash: "rules", signerReference: "opaque-signer", issuedAt: 100, expiresAt: 2_000, targetKinds: ["runner" as const], failMode: "deny" as const, approvalPresent: true, tenantScoped: true, noRawSecrets: true };
    const target = { organizationId: "org-1", targetId: "runner", targetKind: "runner" as const, expectedPolicyId: "policy", expectedVersion: "v2", observedPolicyId: "policy", observedVersion: "v1", lastAppliedDigest: "old", enforcementActive: true, tenantMatch: true, lastCheckedAt: 900 };
    expect(validateM136PolicyBundle(bundle, now).allowed).toBe(true);
    expect(decideM136Distribution(bundle, target, now).allowed).toBe(true);
    expect(decideM136Drift({ organizationId: "org-1", findingId: "finding", targetId: "runner", expectedDigest: "digest", observedDigest: "old", driftClass: "stale", firstSeenAt: 900, remediationAllowed: true, approvalPresent: true, failClosed: true, evidenceHash: "evidence" }).allowed).toBe(true);
    expect(validateM136Exception({ organizationId: "org-1", exceptionId: "exception", policyId: "policy", targetId: "runner", reasonHash: "reason", approverReference: "approver", issuedAt: 900, expiresAt: 2_000, rollbackPlanHash: "rollback", compensatingControlHash: "control", noPrivilegeExpansion: true }, now).allowed).toBe(true);
    expect(decideM136Drift({ organizationId: "org-1", findingId: "finding", targetId: "runner", expectedDigest: "digest", observedDigest: "old", driftClass: "stale", firstSeenAt: 900, remediationAllowed: true, approvalPresent: false, failClosed: true, evidenceHash: "evidence" }).allowed).toBe(false);
  });

  it("M137 gates incident intake, bounded containment and postmortem evidence", () => {
    expect(validateM137Signal({ organizationId: "org-1", signalId: "signal", source: "alert", severity: "high", category: "availability", dedupeKey: "dedupe", evidenceHash: "evidence", detectedAt: 100, tenantBound: true, redacted: true }).allowed).toBe(true);
    expect(decideM137Case({ organizationId: "org-1", caseId: "case", signalId: "signal", severity: "high", state: "open", ownerReference: "owner", impactSummaryHash: "impact", evidenceHashes: ["evidence"], openedAt: 100, customerImpactRedacted: true, tenantBound: true, approvalPresent: false }).allowed).toBe(true);
    expect(decideM137Containment({ organizationId: "org-1", caseId: "case", actionId: "action", kind: "isolate_worker", blastRadius: "single_worker", reversible: true, sandboxed: true, approvalPresent: true, noDataDeletion: true, operatorReference: "operator", executedAt: 200 }).allowed).toBe(true);
    expect(validateM137Postmortem({ organizationId: "org-1", caseId: "case", timelineHash: "timeline", rootCauseHash: "root", contributingFactorsHash: "factors", actionItemsHash: "actions", customerImpactRedacted: true, reviewed: true, followUpDueAt: 3_000, evidenceComplete: true }).allowed).toBe(true);
    expect(decideM137Containment({ organizationId: "org-1", caseId: "case", actionId: "action", kind: "pause_run", blastRadius: "tenant_read_only", reversible: true, sandboxed: true, approvalPresent: true, noDataDeletion: true, operatorReference: "operator", executedAt: 200 }).allowed).toBe(false);
  });

  it("M138 gates consented telemetry, feedback and privacy retention", () => {
    const now = 1_000;
    const consent = { organizationId: "org-1", consentId: "consent", subjectReference: "opaque-subject", purposes: ["quality" as const], grantedAt: 100, expiresAt: 2_000, retentionDays: 30, samplingRate: 0.5, localOnly: true, exportAllowed: false, explicit: true, withdrawable: true };
    expect(validateM138Consent(consent, now).allowed).toBe(true);
    expect(decideM138Telemetry({ organizationId: "org-1", eventId: "event", consentId: "consent", schemaVersion: "v1", eventType: "quality", payloadHash: "payload", dimensionsHash: "dimensions", piiRedacted: true, rawPayloadStored: false, sampled: true, capturedAt: 900, sourceLocalOnly: true }, consent, now).allowed).toBe(true);
    expect(validateM138Feedback({ organizationId: "org-1", feedbackId: "feedback", category: "quality", rating: 5, commentHash: "comment", sourceHash: "source", consentId: "consent", state: "received", piiRedacted: true, secretFree: true, submittedAt: 900 }).allowed).toBe(true);
    expect(decideM138Retention({ organizationId: "org-1", consentId: "consent", deleteAfter: 2_000, legalHold: false, anonymized: true, deletionJobReference: "job", downstreamsNotified: true }, now).allowed).toBe(true);
    expect(decideM138Telemetry({ organizationId: "org-1", eventId: "event", consentId: "consent", schemaVersion: "v1", eventType: "quality", payloadHash: "payload", dimensionsHash: "dimensions", piiRedacted: false, rawPayloadStored: false, sampled: true, capturedAt: 900, sourceLocalOnly: true }, consent, now).allowed).toBe(false);
  });
});
