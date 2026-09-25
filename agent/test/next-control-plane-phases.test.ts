import { describe, expect, it } from "vitest";
import {
  decideM104RateLimit,
  decideM104SseReconnect,
  validateM104ApiError,
  validateM104ApiVersion,
} from "../src/core/api-contract-runtime.js";
import {
  decideM105Invitation,
  decideM105RoleChange,
  validateM105IdentitySession,
  validateM105MfaEvidence,
} from "../src/core/identity-membership-runtime.js";
import {
  decideM106Delivery,
  decideM106Preview,
  validateM106Artifact,
  validateM106RollbackEvidence,
} from "../src/core/artifact-preview-delivery-runtime.js";
import {
  decideM107Slo,
  validateM107CostReport,
  validateM107Incident,
  validateM107Telemetry,
} from "../src/core/observability-finops-runtime.js";
import {
  decideM108Cutover,
  validateM108BackupRestore,
  validateM108ChaosEvidence,
  validateM108SelfHostPlan,
} from "../src/core/release-cutover-runtime.js";

describe("M104-M108 deterministic contract kernels", () => {
  it("M104 validates versioned API contracts, errors, SSE reconnect and limits", () => {
    expect(validateM104ApiVersion({ organizationId: "org-1", apiId: "api", protocol: "sse", version: "v1", operation: "stream", lifecycle: "stable", requestSchemaHash: "request", responseSchemaHash: "response", compatibilityWindowDays: 30, documented: true, tenantScoped: true }).allowed).toBe(true);
    expect(validateM104ApiError({ organizationId: "org-1", errorId: "error", code: "RATE_LIMITED", class: "rate_limit", httpStatus: 429, retryable: true, publicMessage: "try later", internalDetailHash: "detail", correlationId: "corr", secretRedacted: true }).allowed).toBe(true);
    expect(decideM104SseReconnect({ organizationId: "org-1", streamId: "stream", lastEventId: "event-4", protocolVersion: "v1", tenantMatch: true, cursorExpired: false, eventsRedacted: true, replayLimit: 100, terminalEventSeen: false }).allowed).toBe(true);
    expect(decideM104RateLimit({ organizationId: "org-1", subjectHash: "subject", bucket: "organization", limit: 100, remaining: 0, resetAt: Date.now() + 1000, retryAfterMs: 1000, headersEmitted: true, requestCost: 1 }).allowed).toBe(true);
    expect(decideM104SseReconnect({ organizationId: "org-1", streamId: "stream", lastEventId: "event", protocolVersion: "v1", tenantMatch: false, cursorExpired: false, eventsRedacted: true, replayLimit: 10, terminalEventSeen: false }).allowed).toBe(false);
  });

  it("M105 enforces session expiry, invitation approval, role separation and MFA", () => {
    expect(validateM105IdentitySession({ organizationId: "org-1", sessionId: "session", subjectHash: "subject", authMethod: "oidc", factor: "passkey", issuedAt: Date.now() - 1000, expiresAt: Date.now() + 60_000, tokenReference: "opaque-ref", deviceBound: true, revoked: false, reauthenticationRequired: false }).allowed).toBe(true);
    expect(decideM105Invitation({ organizationId: "org-1", invitationId: "invite", inviteeReference: "invitee", role: "member", inviterHash: "inviter", expiresAt: Date.now() + 60_000, revoked: false, approvalPresent: true, tokenHash: "token" }).allowed).toBe(true);
    expect(decideM105RoleChange({ organizationId: "org-1", membershipId: "membership", actorHash: "actor", subjectHash: "subject", fromRole: "member", toRole: "admin", approvalPresent: false, separationOfDuties: true, reauthenticationEvidenceHash: "reauth", activeSessionRevoked: false }).allowed).toBe(true);
    expect(validateM105MfaEvidence({ organizationId: "org-1", subjectHash: "subject", factor: "passkey", challengeId: "challenge", verified: true, attempts: 1, recoveryCodeUsed: false, recoveryCodeRotated: false, phishingResistant: true, observedAt: Date.now() }).allowed).toBe(true);
    expect(validateM105IdentitySession({ organizationId: "org-1", sessionId: "session", subjectHash: "subject", authMethod: "local", factor: "totp", issuedAt: 1, expiresAt: 2, tokenReference: "opaque", deviceBound: false, revoked: false, reauthenticationRequired: false }, 3).allowed).toBe(false);
  });

  it("M106 requires signed artifacts, isolated previews, logged delivery and rollback", () => {
    expect(validateM106Artifact({ organizationId: "org-1", artifactId: "artifact", kind: "build", digest: "sha256:digest", sizeBytes: 100, mediaType: "application/zip", sourceRunId: "run", provenanceHash: "provenance", signatureHash: "signature", retentionUntil: Date.now() + 60_000, secretsScanned: true, tenantScoped: true, revoked: false }).allowed).toBe(true);
    expect(decideM106Preview({ organizationId: "org-1", previewId: "preview", artifactDigest: "sha256:digest", state: "ready", hostname: "run.preview.local", tlsConfigured: true, tenantIsolationPassed: true, networkAllowlist: ["api.local"], expiresAt: Date.now() + 60_000, portBound: true }).allowed).toBe(true);
    expect(decideM106Delivery({ organizationId: "org-1", artifactId: "artifact", mode: "download", recipientHash: "recipient", signedUrlHash: "url", expiresAt: Date.now() + 60_000, approvalPresent: false, downloadLimit: 2, accessLogged: true, revoked: false }).allowed).toBe(true);
    expect(validateM106RollbackEvidence({ organizationId: "org-1", deploymentId: "deployment", previousDigest: "old", failedDigest: "new", reasonHash: "reason", backupAvailable: true, smokeTestPassed: true, rollbackExitCode: 0, operatorHash: "operator" }).allowed).toBe(true);
    expect(decideM106Preview({ organizationId: "org-1", previewId: "preview", artifactDigest: "digest", state: "ready", hostname: "unsafe.example", tlsConfigured: true, tenantIsolationPassed: true, networkAllowlist: ["api.local"], expiresAt: Date.now() + 60_000, portBound: true }).allowed).toBe(false);
  });

  it("M107 gates redacted telemetry, SLO burn, incident command and cost reconciliation", () => {
    expect(validateM107Telemetry({ organizationId: "org-1", runId: "run", eventId: "event", kind: "metric", name: "latency", value: 100, unit: "ms", traceId: "trace", sampled: true, redacted: true, occurredAt: Date.now() }).allowed).toBe(true);
    expect(decideM107Slo({ organizationId: "org-1", policyId: "slo", indicator: "availability", target: 0.99, windowDays: 30, budgetRemaining: 0.5, alertThreshold: 0.1, burnRate: 0.5, reviewed: true }).allowed).toBe(true);
    expect(validateM107Incident({ organizationId: "org-1", incidentId: "incident", severity: "sev2", startedAt: Date.now() - 1000, commanderHash: "commander", affectedService: "api", runbookId: "runbook", customerImpactRedacted: true, containmentAction: "hold", postmortemDueAt: Date.now() + 60_000, resolved: false }).allowed).toBe(true);
    expect(validateM107CostReport({ organizationId: "org-1", reportId: "report", periodStart: 1, periodEnd: 2, provider: "local", usageUnits: 10, recordedCost: 5, providerCost: 5, currency: "USD", budgetLimit: 10, varianceAllowed: 1, reconciled: true, sourceHash: "source" }).allowed).toBe(true);
    expect(validateM107Telemetry({ organizationId: "org-1", runId: "run", eventId: "event", kind: "log", name: "raw", value: 1, unit: "event", traceId: "trace", sampled: true, redacted: false, occurredAt: Date.now() }).allowed).toBe(false);
  });

  it("M108 gates self-host release, encrypted restore, cutover and chaos", () => {
    expect(validateM108SelfHostPlan({ organizationId: "org-1", releaseId: "release", version: "1.0.0", target: "compose", imageDigest: "sha256:image", configSchemaHash: "config", sbomHash: "sbom", signatureHash: "signature", tlsConfigured: true, noClobberConfig: true, migrationPlanHash: "migration", rollbackPlanHash: "rollback", approvalPresent: true }).allowed).toBe(true);
    expect(validateM108BackupRestore({ organizationId: "org-1", backupId: "backup", createdAt: Date.now() - 1000, encrypted: true, checksum: "checksum", retentionUntil: Date.now() + 60_000, restoreTested: true, restoredVersion: "1.0.0", rtoSeconds: 10, rpoSeconds: 5, exitCode: 0, operatorHash: "operator" }).allowed).toBe(true);
    expect(decideM108Cutover({ organizationId: "org-1", releaseId: "release", stage: "canary", artifactDigest: "sha256:image", canaryPercent: 10, smokeEvidenceHash: "smoke", openIncident: false, errorBudgetAvailable: true, approvalPresent: true, rollbackReady: true }).allowed).toBe(true);
    expect(validateM108ChaosEvidence({ organizationId: "org-1", experimentId: "experiment", kind: "process_restart", blastRadius: "single_worker", approvalPresent: false, sandboxed: true, steadyStateHash: "steady", recoveryEvidenceHash: "recovery", observedRecoverySeconds: 5, recoveryBudgetSeconds: 10, noDataLoss: true }).allowed).toBe(true);
    expect(decideM108Cutover({ organizationId: "org-1", releaseId: "release", stage: "promote", artifactDigest: "sha256:image", canaryPercent: 100, smokeEvidenceHash: "smoke", openIncident: true, errorBudgetAvailable: true, approvalPresent: true, rollbackReady: true }).allowed).toBe(false);
  });
});
