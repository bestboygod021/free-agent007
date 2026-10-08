import { describe, expect, it } from "vitest";
import { decideM149Dlq, decideM149Lease, validateM149Job, validateM149Policy } from "../src/core/worker-queue-runtime.js";
import { decideM150Run, validateM150Change, validateM150Plan, validateM150RlsCheck } from "../src/core/database-migration-runtime.js";
import { decideM151RepositoryAction, decideM151Webhook, validateM151Installation, validateM151TokenLease } from "../src/core/github-app-integration-runtime.js";
import { decideM152Route, validateM152DeploymentTarget, validateM152Environment, validateM152PortLease } from "../src/core/preview-environment-runtime.js";
import { decideM153FlowRun, validateM153Failure, validateM153Plan, validateM153Step } from "../src/core/product-e2e-orchestration-runtime.js";

describe("M149-M153 deterministic contract kernels", () => {
  it("M149 gates durable jobs, queue policy, worker leases and DLQ replay", () => {
    expect(validateM149Job({ organizationId: "org-1", jobId: "job", queueName: "runs", jobType: "build", payloadHash: "payload", idempotencyKey: "idem", attempt: 1, maxAttempts: 3, priority: "normal", notBeforeAt: 2_000, tenantBound: true, redacted: true, status: "queued" }, 1_000).allowed).toBe(true);
    expect(validateM149Policy({ organizationId: "org-1", queueName: "runs", maxConcurrency: 4, maxQueueDepth: 100, retryableErrors: ["timeout"], backoffSeconds: 10, maxAttempts: 3, dlqEnabled: true, approvalPresent: true, tenantScoped: true }).allowed).toBe(true);
    expect(decideM149Lease({ organizationId: "org-1", jobId: "job", leaseId: "lease", workerReference: "worker", issuedAt: 1_000, expiresAt: 2_000, heartbeatAt: 1_100, attempt: 1, revoked: false, idempotencyKey: "idem" }, 1_200).allowed).toBe(true);
    expect(decideM149Dlq({ organizationId: "org-1", dlqId: "dlq", jobId: "job", reasonHash: "reason", attempts: 3, createdAt: 2_000, replayAllowed: true, evidenceHash: "evidence", operatorReference: "operator" }).allowed).toBe(true);
    expect(decideM149Dlq({ organizationId: "org-1", dlqId: "dlq", jobId: "job", reasonHash: "reason", attempts: 3, createdAt: 2_000, replayAllowed: true, evidenceHash: "evidence" }).allowed).toBe(false);
  });

  it("M150 gates migration plans, schema changes, runs and RLS checks", () => {
    expect(validateM150Plan({ organizationId: "org-1", migrationId: "migration", version: "v2", fromSchemaHash: "old", toSchemaHash: "new", kind: "expand", stepsHash: "steps", dryRun: true, approvalPresent: false, noClobber: true, rollbackPlanHash: "rollback", tenantScoped: true }).allowed).toBe(true);
    expect(validateM150Change({ organizationId: "org-1", migrationId: "migration", tableName: "runs", operation: "add_column", columnName: "status", backwardCompatible: true, destructive: false, lockRisk: "low", tenantScoped: true, onlineSafe: true }).allowed).toBe(true);
    expect(decideM150Run({ organizationId: "org-1", migrationId: "migration", runId: "run", state: "succeeded", checksum: "checksum", startedAt: 1_000, completedAt: 1_100, exitCode: 0, lockAcquired: true, rowCount: 10, transactionBound: true, rollbackReady: true }, 2_000).allowed).toBe(true);
    expect(validateM150RlsCheck({ organizationId: "org-1", migrationId: "migration", tableName: "runs", tenantColumn: "organization_id", rlsEnabled: true, defaultDeny: true, policyHash: "policy", probeHash: "probe", noLeak: true, rollbackTested: true }).allowed).toBe(true);
    expect(validateM150Change({ organizationId: "org-1", migrationId: "migration", tableName: "runs", operation: "drop_column", columnName: "secret", backwardCompatible: true, destructive: true, lockRisk: "high", tenantScoped: true, onlineSafe: true }).allowed).toBe(false);
  });

  it("M151 gates GitHub installation, token, webhook and repository mutation", () => {
    expect(validateM151Installation({ organizationId: "org-1", installationId: "installation", appId: "app", repositoryId: "repo", permissionHash: "permissions", eventTypes: ["push"], webhookSecretReference: "opaque-hook-ref", sourceTrust: "official_app", approved: true, tenantMatch: true, noRawCredential: true }).allowed).toBe(true);
    expect(validateM151TokenLease({ organizationId: "org-1", installationId: "installation", leaseId: "lease", tokenReference: "opaque-lease-ref", scopes: ["contents:read"], issuedAt: 1, expiresAt: 2_000, revoked: false, encryptedReference: true, rawTokenStored: false }, 1_000).allowed).toBe(true);
    expect(decideM151Webhook({ organizationId: "org-1", installationId: "installation", deliveryId: "delivery", signatureHash: "signature", eventHash: "event", sentAt: 1_000, dedupeKey: "dedupe", verified: true, redacted: true, repositoryTenantMatch: true }).allowed).toBe(true);
    expect(decideM151RepositoryAction({ organizationId: "org-1", repositoryId: "repo", actionId: "action", operation: "open_pr", authorizationPassed: true, approvalPresent: true, idempotencyKey: "idem", branchName: "feature/x", protectedBranch: true, forcePush: false, tenantMatch: true, diffHash: "diff" }).allowed).toBe(true);
    expect(decideM151RepositoryAction({ organizationId: "org-1", repositoryId: "repo", actionId: "action", operation: "open_pr", authorizationPassed: true, approvalPresent: true, idempotencyKey: "idem", branchName: "feature/x", protectedBranch: true, forcePush: true, tenantMatch: true, diffHash: "diff" }).allowed).toBe(false);
  });

  it("M152 gates preview environments, port leases, routes and targets", () => {
    expect(validateM152Environment({ organizationId: "org-1", previewId: "preview", runId: "run", target: "docker", state: "ready", port: 3000, hostname: "preview.example", tlsConfigured: true, expiresAt: 2_000, tenantBound: true, sandboxed: true, readOnlyArtifacts: true }, 1_000).allowed).toBe(true);
    expect(validateM152PortLease({ organizationId: "org-1", leaseId: "lease", previewId: "preview", port: 3000, issuedAt: 1_000, expiresAt: 2_000, hostReference: "host", reserved: true, tenantMatch: true }, 1_100).allowed).toBe(true);
    expect(decideM152Route({ organizationId: "org-1", previewId: "preview", hostname: "preview.example", pathPrefix: "/", tlsConfigured: true, originAllowed: true, tenantMatch: true, expiresAt: 2_000, proxyReference: "proxy" }, 1_100).allowed).toBe(true);
    expect(validateM152DeploymentTarget({ organizationId: "org-1", targetId: "target", kind: "docker", imageDigest: "image", configHash: "config", smokeHash: "smoke", approvalPresent: true, rollbackPlanHash: "rollback", networkPolicyHash: "network", noClobber: true }).allowed).toBe(true);
    expect(decideM152Route({ organizationId: "org-1", previewId: "preview", hostname: "preview.example", pathPrefix: "../", tlsConfigured: true, originAllowed: true, tenantMatch: true, expiresAt: 2_000, proxyReference: "proxy" }, 1_100).allowed).toBe(false);
  });

  it("M153 gates product E2E plans, steps, flow results and failure evidence", () => {
    expect(validateM153Plan({ organizationId: "org-1", flowId: "flow", scenario: "signup_to_pr", stepsHash: "steps", testDataHash: "data", localFallback: true, tenantIsolationVerified: true, approvalPresent: true, noRawSecrets: true, deterministic: true, cleanupPlanHash: "cleanup" }).allowed).toBe(true);
    expect(validateM153Step({ organizationId: "org-1", flowId: "flow", stepId: "step", order: 1, action: "create project", status: "passed", evidenceHash: "evidence", deterministic: true, noSideEffects: true, tenantMatch: true, timeoutMs: 30_000 }).allowed).toBe(true);
    expect(decideM153FlowRun({ organizationId: "org-1", flowId: "flow", runId: "run", state: "passed", stepCount: 3, passedSteps: 3, failedSteps: 0, artifactsHash: "artifacts", correlationId: "correlation", cleanupComplete: true, customerImpactRedacted: true }).allowed).toBe(true);
    expect(validateM153Failure({ organizationId: "org-1", flowId: "flow", runId: "run", failedAtStepId: "step", reasonHash: "reason", containmentHash: "containment", rollbackHash: "rollback", observedAt: 1_000, customerImpactRedacted: true, secretsPurged: true, retryBounded: true }).allowed).toBe(true);
    expect(decideM153FlowRun({ organizationId: "org-1", flowId: "flow", runId: "run", state: "passed", stepCount: 3, passedSteps: 2, failedSteps: 1, artifactsHash: "artifacts", correlationId: "correlation", cleanupComplete: true, customerImpactRedacted: true }).allowed).toBe(false);
  });
});
