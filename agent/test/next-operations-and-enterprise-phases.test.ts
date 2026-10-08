import { describe, expect, it } from "vitest";

import { decideObservabilityAlert, validateIncidentRunbookAction, validateObservabilitySloMeasurement, validateObservabilityTelemetry } from "../src/core/observability-incident-runtime.js";
import { decideDurableMigration, decideDurableSearch, validateDurableEntity, validateDurableEvent } from "../src/core/durable-data-plane-runtime.js";
import { decideBillingSubscriptionChange, decideBillingUsageCharge, validateBillingInvoiceEvidence, validateBillingPlan } from "../src/core/billing-entitlement-runtime.js";
import { decideApprovalEscalation, decideReviewAssignment, validateApprovalRequestEnvelope, validateHumanDecisionRecord } from "../src/core/approval-review-runtime.js";
import { decideEnvironmentPromotion, validateDeploymentAdapter, validateDeploymentMigrationEvidence, validateSelfHostConfiguration } from "../src/core/deployment-operations-runtime.js";

describe("M89 observability and incident runtime", () => {
  it("requires redacted telemetry, valid SLO data and controlled incident actions", () => {
    expect(validateObservabilityTelemetry({ organizationId: "org", signalId: "signal", kind: "metric", serviceId: "api", metricName: "latency", value: 200, unit: "ms", labelsHash: "labels", payloadHash: "payload", redacted: true, occurredAt: 1 }).allowed).toBe(true);
    expect(validateObservabilitySloMeasurement({ organizationId: "org", serviceId: "api", window: "day", availability: 0.999, latencyP95Ms: 200, errorRate: 0.001, targetAvailability: 0.99, targetLatencyP95Ms: 500, measuredAt: 1, evidenceHash: "evidence" }).allowed).toBe(true);
    expect(decideObservabilityAlert({ organizationId: "org", alertId: "alert", serviceId: "api", severity: "high", threshold: 0.05, observed: 0.1, comparator: "gt", notificationSuppressed: false, evaluatedAt: 1, evidenceHash: "evidence" }).allowed).toBe(true);
    expect(validateIncidentRunbookAction({ organizationId: "org", incidentId: "incident", serviceId: "api", severity: "high", runbookId: "runbook", action: "failover", operatorId: "operator", approvalPresent: true, commandHash: "command", exitCode: 0, completedAt: 2 }).allowed).toBe(true);
    expect(validateObservabilityTelemetry({ organizationId: "org", signalId: "signal", kind: "log", serviceId: "api", metricName: "log", value: 1, unit: "count", labelsHash: "labels", payloadHash: "payload", redacted: false, occurredAt: 1 }).allowed).toBe(false);
    expect(validateIncidentRunbookAction({ organizationId: "org", incidentId: "incident", serviceId: "api", severity: "critical", runbookId: "runbook", action: "restore", operatorId: "operator", approvalPresent: false, commandHash: "command" }).allowed).toBe(false);
  });
});

describe("M90 durable data plane runtime", () => {
  it("keeps entities, append-only events, migrations and search tenant-safe", () => {
    expect(validateDurableEntity({ organizationId: "org", entityId: "entity", entityType: "run", version: 1, state: "active", payloadHash: "payload", createdAt: 1, updatedAt: 2, piiRedacted: true, idempotencyKey: "idem" }).allowed).toBe(true);
    expect(validateDurableEvent({ organizationId: "org", eventId: "event", entityId: "entity", eventType: "run.created", sequence: 1, payloadHash: "payload", retentionClass: "standard", appendedAt: 2, appendOnly: true }).allowed).toBe(true);
    expect(decideDurableMigration({ organizationId: "org", migrationId: "migration", fromVersion: "1", toVersion: "2", action: "apply", dryRunPassed: true, backupHash: "backup", lockAcquired: true, approvalPresent: true }).allowed).toBe(true);
    expect(decideDurableSearch({ organizationId: "org", requesterId: "user", dataset: "run", queryHash: "query", runId: "run", maxResults: 100, aclChecked: true, tenantScoped: true, exportRequested: false }).allowed).toBe(true);
    expect(validateDurableEvent({ organizationId: "org", eventId: "event", entityId: "entity", eventType: "audit", sequence: 1, payloadHash: "payload", retentionClass: "audit", appendedAt: 2, appendOnly: true }).allowed).toBe(false);
    expect(decideDurableSearch({ organizationId: "org", requesterId: "user", dataset: "run", queryHash: "query", maxResults: 100, aclChecked: false, tenantScoped: false, exportRequested: false }).allowed).toBe(false);
  });
});

describe("M91 billing and entitlement runtime", () => {
  it("keeps plans, charges, invoices and subscription changes reconciled", () => {
    expect(validateBillingPlan({ organizationId: "org", planId: "free", mode: "free", includedRuns: 100, includedTokens: 10_000, includedStorageMb: 100, connectorLimit: 2, effectiveAt: 1, approved: true, localFallbackAvailable: true }).allowed).toBe(true);
    expect(decideBillingUsageCharge({ organizationId: "org", chargeId: "charge", runId: "run", metric: "run", quantity: 2, unitPriceMicros: 10, totalMicros: 20, state: "authorized", usageLedgerHash: "ledger", idempotencyKey: "idem", rawCredentialPresent: false }).allowed).toBe(true);
    expect(validateBillingInvoiceEvidence({ organizationId: "org", invoiceId: "invoice", period: "month", invoiceHash: "invoice-hash", ledgerHash: "ledger", expectedMicros: 100, reportedMicros: 110, deltaMicros: 10, reconciled: true, providerReference: "provider" }).allowed).toBe(true);
    expect(decideBillingSubscriptionChange({ organizationId: "org", subscriptionId: "subscription", currentPlanId: "free", targetPlanId: "pro", action: "upgrade", approvalPresent: true, prorationAcknowledged: true, effectiveAt: 1, requestedBy: "owner" }).allowed).toBe(true);
    expect(decideBillingUsageCharge({ organizationId: "org", chargeId: "charge", metric: "run", quantity: 2, unitPriceMicros: 10, totalMicros: 30, state: "captured", usageLedgerHash: "ledger", idempotencyKey: "idem", rawCredentialPresent: false }).allowed).toBe(false);
    expect(decideBillingSubscriptionChange({ organizationId: "org", subscriptionId: "subscription", currentPlanId: "free", targetPlanId: "pro", action: "upgrade", approvalPresent: false, prorationAcknowledged: false, effectiveAt: 1, requestedBy: "owner" }).allowed).toBe(false);
  });
});

describe("M92 approval and review runtime", () => {
  it("enforces expiry, separation of duties, evidence review and escalation", () => {
    expect(validateApprovalRequestEnvelope({ organizationId: "org", requestId: "request", subjectType: "release", subjectHash: "subject", queue: "release", risk: "high", requestedBy: "agent", expiresAt: 100, evidenceHash: "evidence", separationRequired: true }, 1).allowed).toBe(true);
    expect(decideReviewAssignment({ organizationId: "org", requestId: "request", reviewerId: "reviewer", reviewerRole: "admin", assignedAt: 1, selfReviewForbidden: true, secondReviewerRequired: false, secondReviewerPresent: false }).allowed).toBe(true);
    expect(validateHumanDecisionRecord({ organizationId: "org", requestId: "request", reviewerId: "reviewer", decision: "approve", reasonHash: "reason", observedAt: 2, evidenceReviewed: true, conflictOfInterest: false, signatureReference: "signature" }).allowed).toBe(true);
    expect(decideApprovalEscalation({ organizationId: "org", requestId: "request", fromLevel: 1, toLevel: 2, trigger: "timeout", notifiedRole: "owner", approvalPresent: false, escalatedAt: 3 }).allowed).toBe(true);
    expect(validateApprovalRequestEnvelope({ organizationId: "org", requestId: "request", subjectType: "tool_call", subjectHash: "subject", queue: "tool_action", risk: "critical", requestedBy: "agent", expiresAt: 1, evidenceHash: "evidence", separationRequired: false }, 2).allowed).toBe(false);
    expect(validateHumanDecisionRecord({ organizationId: "org", requestId: "request", reviewerId: "reviewer", decision: "approve", reasonHash: "reason", observedAt: 2, evidenceReviewed: true, conflictOfInterest: true, signatureReference: "signature" }).allowed).toBe(false);
  });
});

describe("M93 deployment operations runtime", () => {
  it("requires reviewed adapters, smoke evidence, migration safety and self-host safeguards", () => {
    const adapter = { organizationId: "org", adapterId: "compose", target: "compose" as const, endpointReference: "local:compose", artifactHash: "artifact", configHash: "config", secretReferences: ["db-ref"], dryRunPassed: true, reviewed: true, rollbackSupported: true, productionAllowed: true };
    expect(validateDeploymentAdapter(adapter).allowed).toBe(true);
    expect(decideEnvironmentPromotion({ organizationId: "org", deploymentId: "deployment", fromEnvironment: "staging", toEnvironment: "canary", action: "promote", artifactHash: "artifact", operatorId: "operator", approvalPresent: false, smokeEvidenceHash: "smoke", openIncident: false }).allowed).toBe(true);
    expect(validateDeploymentMigrationEvidence({ organizationId: "org", deploymentId: "deployment", migrationId: "migration", dryRunPassed: true, backupHash: "backup", lockReleased: true, exitCode: 0, schemaVersion: "2", rollbackTested: true, evidenceHash: "evidence" }).allowed).toBe(true);
    expect(validateSelfHostConfiguration({ organizationId: "org", configId: "config", mode: "compose", imageDigest: "sha256:image", databaseUrlReference: "db-ref", secretReferences: ["signing-ref"], egressPolicy: "local_only", tlsConfigured: true, backupConfigured: true, noClobberExistingConfig: true }).allowed).toBe(true);
    expect(decideEnvironmentPromotion({ organizationId: "org", deploymentId: "deployment", fromEnvironment: "staging", toEnvironment: "production", action: "promote", artifactHash: "artifact", operatorId: "operator", approvalPresent: false, smokeEvidenceHash: "smoke", openIncident: false }).allowed).toBe(false);
    expect(validateSelfHostConfiguration({ ...adapter, configId: "config", mode: "compose", imageDigest: "image", databaseUrlReference: "db", secretReferences: ["raw-secret"], egressPolicy: "local_only", tlsConfigured: false, backupConfigured: true, noClobberExistingConfig: false }).allowed).toBe(false);
  });
});
