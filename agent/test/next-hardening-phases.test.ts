import { describe, expect, it } from "vitest";
import {
  decideM119Migration,
  validateM119Outbox,
  validateM119RlsEvidence,
  validateM119Transaction,
} from "../src/core/durable-tenant-runtime.js";
import {
  validateM120Accessibility,
  validateM120PipelineEvidence,
  validateM120SecurityCheck,
  validateM120TestMatrix,
} from "../src/core/verification-matrix-runtime.js";
import {
  decideM121CliRequest,
  validateM121ConfigBootstrap,
  validateM121DeveloperHandoff,
  validateM121SdkContract,
} from "../src/core/developer-sdk-cli-runtime.js";
import {
  decideM122Deletion,
  validateM122BackupRetention,
  validateM122DeletionProof,
  validateM122KeyRotation,
} from "../src/core/key-rotation-deletion-runtime.js";
import {
  validateM123CapacityAlert,
  validateM123CapacityPlan,
  validateM123CircuitBreaker,
  validateM123FailureExperiment,
} from "../src/core/resilience-capacity-runtime.js";

describe("M119-M123 deterministic contract kernels", () => {
  it("M119 enforces tenant transactions, RLS probes, migrations and outbox", () => {
    expect(validateM119Transaction({ organizationId: "org-1", transactionId: "tx", mode: "write", actorHash: "actor", requestId: "request", idempotencyKey: "idem", isolationLevel: "repeatable_read", tenantBound: true, startedAt: Date.now(), rolledBack: false, writeSetHash: "writes" }).allowed).toBe(true);
    expect(validateM119RlsEvidence({ organizationId: "org-1", probeId: "probe", tableName: "runs", actorTenant: "tenant-a", targetTenant: "tenant-b", policyName: "runs_rls", selectDenied: true, insertDenied: true, updateDenied: true, deleteDenied: true, parameterBound: true, evidenceHash: "evidence" }).allowed).toBe(true);
    expect(decideM119Migration({ organizationId: "org-1", migrationId: "migration", fromVersion: "v1", toVersion: "v2", action: "apply", dryRunPassed: true, backupHash: "backup", lockName: "schema-lock", approvalPresent: true, downMigrationTested: true, noClobber: true }).allowed).toBe(true);
    expect(validateM119Outbox({ organizationId: "org-1", outboxId: "outbox", aggregateId: "run", eventType: "completed", payloadHash: "payload", transactionId: "tx", idempotencyKey: "idem", attempts: 1, published: true, payloadRedacted: true, createdAt: Date.now() }).allowed).toBe(true);
    expect(validateM119Transaction({ organizationId: "org-1", transactionId: "tx", mode: "write", actorHash: "actor", requestId: "request", idempotencyKey: "idem", isolationLevel: "read_committed", tenantBound: false, startedAt: Date.now(), rolledBack: false }).allowed).toBe(false);
  });

  it("M120 gates reproducible matrix, pipeline, security and accessibility evidence", () => {
    expect(validateM120TestMatrix({ organizationId: "org-1", matrixId: "matrix", runtime: "node20", operatingSystem: "linux", locale: "fa-IR", computeMode: "local", checks: ["typecheck", "unit", "accessibility"], sandboxed: true, seed: 42, approved: true }).allowed).toBe(true);
    expect(validateM120PipelineEvidence({ organizationId: "org-1", pipelineId: "pipeline", commitHash: "commit", state: "passed", checks: [{ kind: "typecheck", passed: true, evidenceHash: "typecheck" }, { kind: "unit", passed: true, evidenceHash: "unit" }], startedAt: 1, completedAt: 2, artifactHash: "artifact", logsRedacted: true, reproducible: true }).allowed).toBe(true);
    expect(validateM120SecurityCheck({ organizationId: "org-1", scanId: "scan", scanner: "tenant_probe", findings: 0, criticalFindings: 0, policyVersion: "v1", falsePositiveReview: false, artifactHash: "artifact", passed: true }).allowed).toBe(true);
    expect(validateM120Accessibility({ organizationId: "org-1", auditId: "audit", locale: "fa-IR", rtl: true, keyboardPassed: true, screenReaderPassed: true, contrastPassed: true, reducedMotionPassed: true, violations: 0, reportHash: "report" }).allowed).toBe(true);
    expect(validateM120SecurityCheck({ organizationId: "org-1", scanId: "scan", scanner: "secret", findings: 1, criticalFindings: 1, policyVersion: "v1", falsePositiveReview: true, artifactHash: "artifact", passed: false }).allowed).toBe(false);
  });

  it("M121 gates SDK compatibility, safe CLI, config bootstrap and handoff", () => {
    expect(validateM121SdkContract({ organizationId: "org-1", sdkId: "sdk", language: "typescript", apiVersion: "v1", schemaBundleHash: "schema", generatedAt: Date.now(), compatibilityChecked: true, examplesTested: true, secretsExcluded: true, deprecationWarningsHandled: true }).allowed).toBe(true);
    expect(decideM121CliRequest({ organizationId: "org-1", commandId: "command", action: "plan", projectPath: "projects/demo", configPath: ".forge/config", argsHash: "args", confirmationPresent: false, idempotencyKey: "idem", outputRedacted: true, localMode: true }).allowed).toBe(true);
    expect(validateM121ConfigBootstrap({ organizationId: "org-1", configId: "config", targetPath: ".forge/config", existingConfigDetected: true, backupHash: "backup", noClobber: true, secretReferencesOnly: true, fileModeRestricted: true, generatedHash: "generated" }).allowed).toBe(true);
    expect(validateM121DeveloperHandoff({ organizationId: "org-1", sdkId: "sdk", version: "v1", changelogHash: "changelog", migrationGuideHash: "migration", breakingChanges: false, deprecationWindowDays: 0, testCommandHash: "tests", docsPublished: true }).allowed).toBe(true);
    expect(decideM121CliRequest({ organizationId: "org-1", commandId: "command", action: "approve", projectPath: "projects/demo", configPath: ".forge/config", argsHash: "args", confirmationPresent: false, idempotencyKey: "idem", outputRedacted: true, localMode: false }).allowed).toBe(false);
  });

  it("M122 gates key rotation, verified deletion and backup retention", () => {
    expect(validateM122KeyRotation({ organizationId: "org-1", keyId: "key-new", previousKeyId: "key-old", state: "active", algorithm: "aes-256-gcm", createdAt: Date.now() - 1000, expiresAt: Date.now() + 60_000, rotationReason: "scheduled", wrappedReference: "wrapped", oldKeyRevoked: false, dualReadWindowHours: 24 }).allowed).toBe(true);
    expect(decideM122Deletion({ organizationId: "org-1", requestId: "request", subjectHash: "subject", targets: ["database", "object_store", "vector_index"], propagationPlanHash: "plan", legalHold: false, identityVerified: true, approvalPresent: true, idempotencyKey: "idem" }).allowed).toBe(true);
    expect(validateM122DeletionProof({ organizationId: "org-1", proofId: "proof", requestId: "request", target: "database", tombstoneHash: "tombstone", deletedRecords: 3, residualRecords: 0, checkedAt: Date.now(), verifierHash: "verifier", immutable: true }).allowed).toBe(true);
    expect(validateM122BackupRetention({ organizationId: "org-1", backupId: "backup", subjectHash: "subject", retentionUntil: Date.now() + 60_000, legalHold: false, keyDestroyed: true, deletionDeferred: false, operatorHash: "operator" }).allowed).toBe(true);
    expect(decideM122Deletion({ organizationId: "org-1", requestId: "request", subjectHash: "subject", targets: ["database"], propagationPlanHash: "plan", legalHold: true, identityVerified: true, approvalPresent: true, idempotencyKey: "idem" }).allowed).toBe(false);
  });

  it("M123 gates capacity, circuit breakers, failure experiments and alerts", () => {
    expect(validateM123CapacityPlan({ organizationId: "org-1", planId: "plan", service: "api", expectedRps: 10, peakRps: 20, workerCapacity: 4, queueCapacity: 100, storageBudgetGb: 10, headroomPercent: 20, testedAt: Date.now(), loadEvidenceHash: "load", reviewed: true }).allowed).toBe(true);
    expect(validateM123CircuitBreaker({ organizationId: "org-1", breakerId: "breaker", dependency: "provider", state: "closed", failureCount: 0, failureThreshold: 5, cooldownMs: 1000, probePassed: true, fallbackAvailable: true }).allowed).toBe(true);
    expect(validateM123FailureExperiment({ organizationId: "org-1", experimentId: "experiment", kind: "worker_crash", blastRadius: "single_worker", approvalPresent: false, sandboxed: true, steadyStateHash: "steady", recoveryHash: "recovery", observedRecoveryMs: 100, recoveryBudgetMs: 1000, noDataLoss: true, stoppedOnImpact: true }).allowed).toBe(true);
    expect(validateM123CapacityAlert({ organizationId: "org-1", alertId: "alert", metric: "queue_age", observed: 100, threshold: 50, action: "throttle", actionEvidenceHash: "action", customerImpactRedacted: true }).allowed).toBe(true);
    expect(validateM123FailureExperiment({ organizationId: "org-1", experimentId: "experiment", kind: "storage_latency", blastRadius: "staging", approvalPresent: false, sandboxed: false, steadyStateHash: "steady", recoveryHash: "recovery", observedRecoveryMs: 2000, recoveryBudgetMs: 1000, noDataLoss: false, stoppedOnImpact: false }).allowed).toBe(false);
  });
});
