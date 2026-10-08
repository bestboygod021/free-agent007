import { describe, expect, it } from "vitest";
import { decideM179Merge, validateM179Changelog, validateM179Commit, validateM179PullRequest } from "../src/core/change-governance-runtime.js";
import { decideM180Task, decideM180Transition, validateM180Checkpoint, validateM180Graph } from "../src/core/agent-graph-runtime.js";
import { decideM181Admission, decideM181Shedding, validateM181Budget, validateM181LoadEvidence } from "../src/core/performance-budget-runtime.js";
import { decideM182Completion, decideM182FirstRun, validateM182Plan, validateM182Progress } from "../src/core/onboarding-runtime.js";
import { decideM183Admission, decideM183Disclosure, validateM183Entitlement, validateM183SlaEvidence } from "../src/core/service-entitlement-runtime.js";

describe("M179-M183 deterministic contract kernels", () => {
  it("M179 gates commit provenance, PR quality, merge approval and changelog", () => {
    expect(validateM179Commit({ organizationId: "org-1", changeId: "change", commitId: "commit", parentHashes: ["parent"], authorReference: "author", branch: "feature/m179", message: "feat(core): govern changes", diffHash: "diff", testsHash: "tests", state: "verified", signed: true, noSecrets: true, noDirectMainMutation: true, tenantBound: true }).allowed).toBe(true);
    expect(validateM179PullRequest({ organizationId: "org-1", changeId: "change", pullRequestId: "pr", sourceBranch: "feature/m179", targetBranch: "main", title: "Govern changes", summary: "Summary", testEvidenceHash: "tests", riskSummaryHash: "risk", changedFiles: 3, state: "approved", reviewerReference: "reviewer", approvalPresent: true, conflictsFree: true, tenantBound: true }).allowed).toBe(true);
    expect(decideM179Merge({ organizationId: "org-1", pullRequestId: "pr", mergeId: "merge", targetBranch: "main", approvalPresent: true, checksPassed: true, conflictsFree: true, directPush: false, rollbackReference: "rollback", operatorReference: "operator" }).allowed).toBe(true);
    expect(validateM179Changelog({ organizationId: "org-1", releaseId: "release", version: "v1.2.3", changeIds: ["change"], migrationNotesHash: "migration", securityNotesHash: "security", generatedFromEvidence: true, approved: true, tenantBound: true }).allowed).toBe(true);
    expect(decideM179Merge({ organizationId: "org-1", pullRequestId: "pr", mergeId: "merge", targetBranch: "main", approvalPresent: false, checksPassed: true, conflictsFree: true, directPush: true, rollbackReference: "rollback", operatorReference: "operator" }).allowed).toBe(false);
  });

  it("M180 gates acyclic agent graphs, tasks, checkpoints and transitions", () => {
    expect(validateM180Graph({ organizationId: "org-1", graphId: "graph", version: 1, nodeIds: ["plan", "code", "test"], edges: [["plan", "code"], ["code", "test"]], inputSchemaHash: "input", stateSchemaHash: "state", policyHash: "policy", maxNodes: 10, maxParallel: 2, state: "approved", deterministic: true, sandboxed: true, tenantBound: true }).allowed).toBe(true);
    expect(decideM180Task({ organizationId: "org-1", graphId: "graph", taskId: "task", nodeId: "code", dependencyIds: ["plan"], inputHash: "input", outputHash: "output", idempotencyKey: "idem", state: "running", timeoutMs: 30_000, leaseExpiry: 2_000, sandboxed: true, tenantMatch: true }, 1_000).allowed).toBe(true);
    expect(validateM180Checkpoint({ organizationId: "org-1", graphId: "graph", checkpointId: "checkpoint", sequence: 2, graphVersion: 1, stateHash: "state", resumeProofHash: "resume", durable: true, redacted: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM180Transition({ organizationId: "org-1", graphId: "graph", taskId: "task", transitionId: "transition", transition: "succeed", fromState: "running", toState: "succeeded", preconditionsMatched: true, evidenceHash: "evidence", idempotencyKey: "idem", tenantMatch: true }).allowed).toBe(true);
    expect(validateM180Graph({ organizationId: "org-1", graphId: "graph", version: 1, nodeIds: ["a", "b"], edges: [["a", "b"], ["b", "a"]], inputSchemaHash: "input", stateSchemaHash: "state", policyHash: "policy", maxNodes: 10, maxParallel: 2, state: "draft", deterministic: true, sandboxed: true, tenantBound: true }).allowed).toBe(false);
  });

  it("M181 gates budgets, admission, load evidence and explicit shedding", () => {
    expect(validateM181Budget({ organizationId: "org-1", budgetId: "budget", workload: "interactive", maxLatencyMs: 2_000, maxQueueAgeMs: 500, maxTokens: 4_000, maxConcurrency: 4, maxErrorRateBps: 200, priority: "interactive", degradedModeAllowed: true, tenantBound: true, approved: true }).allowed).toBe(true);
    expect(decideM181Admission({ organizationId: "org-1", budgetId: "budget", requestId: "request", estimatedLatencyMs: 100, estimatedTokens: 500, queueAgeMs: 10, currentConcurrency: 1, deadlineAt: 2_000, priority: "interactive", dataEgressApproved: true, idempotencyKey: "idem", tenantMatch: true }, 1_000).allowed).toBe(true);
    expect(validateM181LoadEvidence({ organizationId: "org-1", budgetId: "budget", windowStart: 1_000, windowEnd: 2_000, sampleCount: 100, p95LatencyMs: 500, p99LatencyMs: 800, errorRateBps: 100, queueAgeMs: 50, evidenceHash: "evidence", withinBudget: true, redacted: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM181Shedding({ organizationId: "org-1", budgetId: "budget", decisionId: "decision", action: "degrade", reasonHash: "reason", retryAfterMs: 0, safeDegradation: true, noSilentProviderChange: true, bounded: true, operatorApproval: false, tenantMatch: true }).allowed).toBe(true);
    expect(decideM181Admission({ organizationId: "org-1", budgetId: "budget", requestId: "request", estimatedLatencyMs: 100, estimatedTokens: 5_000, queueAgeMs: 10, currentConcurrency: 1, deadlineAt: 2_000, priority: "interactive", dataEgressApproved: false, idempotencyKey: "idem", tenantMatch: true }, 1_000).allowed).toBe(false);
  });

  it("M182 gates consented onboarding and synthetic safe first run", () => {
    expect(validateM182Plan({ organizationId: "org-1", onboardingId: "onboarding", mode: "local", steps: ["mode", "first-run"], locale: "fa-IR", consentPresent: true, dataEgressPolicy: "never", providerReference: "local", state: "consented", sandboxVerified: true, syntheticFixtureOnly: true, tenantBound: true }).allowed).toBe(true);
    expect(decideM182FirstRun({ organizationId: "org-1", onboardingId: "onboarding", runId: "run", fixtureHash: "fixture", mode: "local", noRealRepository: true, noExternalMutation: true, egressApproved: false, budgetTokens: 1_000, redacted: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM182Progress({ organizationId: "org-1", onboardingId: "onboarding", evidenceId: "progress", completedSteps: ["mode", "first-run"], failedSteps: [], evidenceHash: "evidence", secretsRedacted: true, syntheticData: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM182Completion({ organizationId: "org-1", onboardingId: "onboarding", completionId: "completion", mode: "local", consentHash: "consent", safetyChecklistHash: "safety", userConfirmed: true, fallbackDisclosed: true, noSecretsStored: true, evidenceHash: "evidence", tenantMatch: true }).allowed).toBe(true);
    expect(decideM182FirstRun({ organizationId: "org-1", onboardingId: "onboarding", runId: "run", fixtureHash: "fixture", mode: "free", noRealRepository: true, noExternalMutation: true, egressApproved: false, budgetTokens: 1_000, redacted: true, tenantMatch: true }).allowed).toBe(false);
  });

  it("M183 gates entitlements, quota admission, SLA evidence and honest disclosure", () => {
    expect(validateM183Entitlement({ organizationId: "org-1", entitlementId: "entitlement", planId: "free-local", mode: "local", capabilities: ["plan"], quotaRemaining: 10_000, monthlyBudgetCents: 0, providerPolicyHash: "policy", expiresAt: 2_000, approved: true, noSilentUpgrade: true, tenantBound: true }, 1_000).allowed).toBe(true);
    expect(decideM183Admission({ organizationId: "org-1", entitlementId: "entitlement", admissionId: "admission", requestedCapability: "plan", estimatedCostCents: 0, quotaRemaining: 10_000, dataEgress: "never", state: "admitted", degradedMode: false, fallbackDisclosed: true, idempotencyKey: "idem", tenantMatch: true }).allowed).toBe(true);
    expect(validateM183SlaEvidence({ organizationId: "org-1", entitlementId: "entitlement", windowStart: 1_000, windowEnd: 1_900, targetAvailabilityBps: 9_500, observedAvailabilityBps: 9_800, sampleCount: 100, incidentHash: "incident", evidenceHash: "evidence", redacted: true, approved: true, tenantMatch: true }, 2_000).allowed).toBe(true);
    expect(decideM183Disclosure({ organizationId: "org-1", disclosureId: "disclosure", claimHash: "claim", evidenceHash: "evidence", expiresAt: 2_000, fallbackDisclosed: true, noFalseGuarantee: true, approved: true, tenantMatch: true }, 1_000).allowed).toBe(true);
    expect(validateM183Entitlement({ organizationId: "org-1", entitlementId: "entitlement", planId: "free-local", mode: "local", capabilities: ["plan"], quotaRemaining: 10_000, monthlyBudgetCents: 0, providerPolicyHash: "policy", expiresAt: 900, approved: true, noSilentUpgrade: true, tenantBound: true }, 1_000).allowed).toBe(false);
  });
});
