import { describe, expect, it } from "vitest";
import { decideM144Compatibility, decideM144Request, validateM144Endpoint, validateM144OpenApiDocument } from "../src/core/public-api-surface-runtime.js";
import { decideM145OAuth, decideM145Webhook, validateM145Manifest, validateM145TokenLease } from "../src/core/connector-sdk-oauth-runtime.js";
import { decideM146DiffApply, decideM146FileOperation, validateM146SandboxBudget, validateM146Snapshot } from "../src/core/workspace-sandbox-boundary-runtime.js";
import { decideM147Access, validateM147Probe, validateM147ProofBundle, validateM147TenantPolicy } from "../src/core/tenant-isolation-proof-runtime.js";
import { decideM148GoNoGo, validateM148AcceptancePlan, validateM148GateResult, validateM148ReadinessReview } from "../src/core/release-acceptance-runtime.js";

describe("M144-M148 deterministic contract kernels", () => {
  it("M144 gates OpenAPI surface, endpoint contracts, compatibility and request admission", () => {
    expect(validateM144OpenApiDocument({ organizationId: "org-1", apiId: "public", version: "v1", specHash: "spec", endpointsHash: "endpoints", serverOrigin: "https://api.example", authScheme: "session", tenantScoped: true, errorCatalogHash: "errors", deprecatedOperations: [], documentedAt: 1 }).allowed).toBe(true);
    expect(validateM144Endpoint({ organizationId: "org-1", apiId: "public", operationId: "createRun", method: "POST", path: "/runs", requestSchemaHash: "request", responseSchemaHash: "response", idempotent: true, authzRequired: true, rateLimitClass: "write", documented: true, tenantScoped: true }).allowed).toBe(true);
    expect(decideM144Compatibility({ organizationId: "org-1", apiId: "public", previousSpecHash: "old", currentSpecHash: "new", breakingChanges: true, diffHash: "diff", consumerEvidenceHash: "consumer", migrationPlanHash: "migration", approvalPresent: true, deprecationWindowDays: 30 }).allowed).toBe(true);
    expect(decideM144Request({ organizationId: "org-1", requestId: "request", operationId: "createRun", tenantMatch: true, authzPassed: true, schemaValid: true, idempotencyKey: "idem", rateLimitRemaining: 10, redacted: true }).allowed).toBe(true);
    expect(decideM144Request({ organizationId: "org-1", requestId: "request", operationId: "createRun", tenantMatch: false, authzPassed: true, schemaValid: true, idempotencyKey: "idem", rateLimitRemaining: 10, redacted: true }).allowed).toBe(false);
  });

  it("M145 gates connector trust, OAuth PKCE, token leases and signed webhooks", () => {
    expect(validateM145Manifest({ organizationId: "org-1", connectorId: "github", version: "1.0.0", capabilities: ["repo_read"], requestedScopes: ["repo:read"], permissionHash: "permission", authMethod: "oauth_pkce", webhookSupport: false, localOnly: false, sourceTrust: "signed_registry", approvalPresent: true, noRawCredential: true }).allowed).toBe(true);
    expect(decideM145OAuth({ organizationId: "org-1", authorizationId: "auth", connectorId: "github", stateHash: "state", pkceVerified: true, redirectUriAllowed: true, consentAt: 1, expiresAt: 2_000, tokenReference: "opaque-ref", tenantMatch: true, userApproved: true }, 1_000).allowed).toBe(true);
    expect(validateM145TokenLease({ organizationId: "org-1", leaseId: "lease", connectorId: "github", tokenReference: "opaque-ref", scopeHash: "scope", issuedAt: 1, expiresAt: 2_000, revoked: false, encryptedReference: true, rawTokenStored: false }, 1_000).allowed).toBe(true);
    expect(decideM145Webhook({ organizationId: "org-1", connectorId: "github", deliveryId: "delivery", signatureHash: "signature", sentAt: 1_000, eventHash: "event", dedupeKey: "dedupe", verified: true, redacted: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM145OAuth({ organizationId: "org-1", authorizationId: "auth", connectorId: "github", stateHash: "state", pkceVerified: false, redirectUriAllowed: true, consentAt: 1, expiresAt: 2_000, tokenReference: "opaque-ref", tenantMatch: true, userApproved: true }, 1_000).allowed).toBe(false);
  });

  it("M146 gates workspace snapshots, file boundaries, sandbox budgets and diffs", () => {
    expect(validateM146Snapshot({ organizationId: "org-1", workspaceId: "workspace", snapshotId: "snapshot", rootHash: "root", fileCount: 3, totalBytes: 100, allowedPaths: ["src", "test"], diffHash: "diff", immutable: true, tenantBound: true }).allowed).toBe(true);
    expect(decideM146FileOperation({ organizationId: "org-1", operationId: "operation", workspaceId: "workspace", path: "src/index.ts", action: "write", bytes: 100, allowedPath: true, tenantMatch: true, sandboxed: true, noSymlinkEscape: true, approvalPresent: false, contentHash: "content" }).allowed).toBe(true);
    expect(validateM146SandboxBudget({ organizationId: "org-1", executionId: "execution", cpuMs: 10_000, memoryMb: 512, diskMb: 1_000, timeoutMs: 30_000, processLimit: 20, networkMode: "none", tenantMatch: true, sandboxed: true, approvalPresent: true }).allowed).toBe(true);
    expect(decideM146DiffApply({ organizationId: "org-1", workspaceId: "workspace", diffHash: "diff", additions: 2, deletions: 1, allowedPaths: true, approvalPresent: false, dryRun: true, rollbackHash: "rollback", snapshotId: "snapshot", noClobber: true }).allowed).toBe(true);
    expect(decideM146FileOperation({ organizationId: "org-1", operationId: "operation", workspaceId: "workspace", path: "../secret", action: "read", bytes: 100, allowedPath: false, tenantMatch: true, sandboxed: true, noSymlinkEscape: true, approvalPresent: true, contentHash: "content" }).allowed).toBe(false);
  });

  it("M147 gates RLS policy, cross-tenant denial and proof bundles", () => {
    expect(validateM147TenantPolicy({ organizationId: "org-1", policyVersion: "v1", tableNames: ["runs", "artifacts"], rlsEnabled: true, defaultDeny: true, serviceRoleBound: true, tenantColumn: "organization_id", reviewed: true }).allowed).toBe(true);
    expect(decideM147Access({ organizationId: "org-1", requestOrganizationId: "org-1", targetOrganizationId: "org-1", role: "operator", action: "read", rowVisible: true, tenantContextValidated: true, transactionId: "tx", policyDefaultDeny: true }).allowed).toBe(true);
    expect(validateM147Probe({ organizationId: "org-1", testId: "probe", subjectOrganizationId: "org-1", targetOrganizationId: "org-2", operation: "read", expectedDenied: true, observedDenied: true, dbPolicyHash: "policy", queryHash: "query", noLeak: true, transactionBound: true }).allowed).toBe(true);
    expect(validateM147ProofBundle({ organizationId: "org-1", bundleId: "bundle", testHashes: ["probe"], noLeakHash: "no-leak", replayHash: "replay", generatedAt: 1_000, reviewed: true, allDeniedProbes: true, policyVersion: "v1" }).allowed).toBe(true);
    expect(decideM147Access({ organizationId: "org-1", requestOrganizationId: "org-1", targetOrganizationId: "org-2", role: "operator", action: "read", rowVisible: true, tenantContextValidated: true, transactionId: "tx", policyDefaultDeny: true }).allowed).toBe(false);
  });

  it("M148 gates acceptance evidence, release gates, go-no-go and readiness review", () => {
    expect(validateM148AcceptancePlan({ organizationId: "org-1", releaseId: "release", version: "1.0.0", scope: "product", testMatrixHash: "matrix", securityEvidenceHash: "security", accessibilityEvidenceHash: "accessibility", e2eEvidenceHash: "e2e", rollbackEvidenceHash: "rollback", approvalPresent: true, localFallback: true, tenantMigrationReady: true }).allowed).toBe(true);
    expect(validateM148GateResult({ organizationId: "org-1", releaseId: "release", gateId: "security", name: "security", status: "pass", evidenceHash: "evidence", blocking: false, severity: "none", ownerReference: "owner", deterministic: true }).allowed).toBe(true);
    expect(decideM148GoNoGo({ organizationId: "org-1", releaseId: "release", canaryPercent: 10, openBlockers: 0, errorBudgetAvailable: true, rollbackReady: true, approvalPresent: true, tenantMigrationReady: true, supportRunbookReady: true, localFallback: true }).allowed).toBe(true);
    expect(validateM148ReadinessReview({ organizationId: "org-1", releaseId: "release", reviewerReference: "reviewer", checksHash: "checks", observedAt: 1_000, independentReview: true, productionEvidence: true, exceptionsExpired: true, rollbackReference: "rollback" }).allowed).toBe(true);
    expect(decideM148GoNoGo({ organizationId: "org-1", releaseId: "release", canaryPercent: 10, openBlockers: 1, errorBudgetAvailable: true, rollbackReady: true, approvalPresent: true, tenantMigrationReady: true, supportRunbookReady: true, localFallback: true }).allowed).toBe(false);
  });
});
