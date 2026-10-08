import { describe, expect, it } from "vitest";
import { decideM169Citation, decideM169Source, validateM169Context, validateM169InjectionScan } from "../src/core/context-integrity-runtime.js";
import { decideM170Commit, decideM170ToolCall, validateM170Approval, validateM170Plan } from "../src/core/tool-action-boundary-runtime.js";
import { decideM171Resolution, decideM171Sync, validateM171Conflict, validateM171Snapshot } from "../src/core/offline-sync-runtime.js";
import { decideM172A11yCheck, decideM172Fallback, validateM172Catalog, validateM172ScreenEvidence } from "../src/core/accessibility-localization-runtime.js";
import { decideM173Case, decideM173Learning, validateM173RunbookStep, validateM173Signal } from "../src/core/incident-learning-runtime.js";

describe("M169-M173 deterministic contract kernels", () => {
  it("M169 gates context provenance, freshness, injection and citations", () => {
    expect(validateM169Context({ organizationId: "org-1", contextId: "context", runId: "run", sourceIds: ["source"], sourceHashes: ["hash"], trustLevels: ["approved"], assembledHash: "assembled", policyHash: "policy", tokenCount: 100, maxTokens: 1_000, state: "admitted", tenantBound: true, redacted: true, untrustedSeparated: true }).allowed).toBe(true);
    expect(decideM169Source({ organizationId: "org-1", sourceId: "source", locatorHash: "locator", contentHash: "content", trust: "approved", fetchedAt: 1_000, expiresAt: 2_000, citationRequired: true, tenantMatch: true, externalContent: false }, 1_100).allowed).toBe(true);
    expect(validateM169InjectionScan({ organizationId: "org-1", contextId: "context", scanId: "scan", instructionOverride: false, secretRequest: false, toolTargetManipulation: false, suspiciousMarkup: false, evidenceHash: "evidence", blocked: true, redacted: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM169Citation({ organizationId: "org-1", contextId: "context", citationId: "citation", sourceId: "source", claimHash: "claim", sourceContentHash: "content", position: 0, citationRequired: true, sourceTrusted: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM169InjectionScan({ organizationId: "org-1", contextId: "context", scanId: "scan", instructionOverride: true, secretRequest: false, toolTargetManipulation: false, suspiciousMarkup: false, evidenceHash: "evidence", blocked: true, redacted: true, tenantMatch: true }).allowed).toBe(false);
  });

  it("M170 gates tool plans, calls, human approval and commits", () => {
    expect(validateM170Plan({ organizationId: "org-1", actionId: "action", runId: "run", toolName: "patch", actionClass: "write", targetReference: "feature/x", inputHash: "input", expectedOutputHash: "output", preconditionHash: "precondition", rollbackPlanHash: "rollback", state: "planned", tenantBound: true, noMainMutation: true, approvalRequired: true }).allowed).toBe(true);
    expect(decideM170ToolCall({ organizationId: "org-1", callId: "call", actionId: "action", toolName: "patch", actionClass: "write", targetReference: "feature/x", inputHash: "input", idempotencyKey: "idem", state: "approved", policyHash: "policy", timeoutMs: 10_000, redacted: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM170Approval({ organizationId: "org-1", approvalId: "approval", actionId: "action", reviewerReference: "reviewer", riskHash: "risk", approved: true, expiresAt: 2_000, separatedDuties: true, reversible: true, secondReviewerRequired: false }, 1_100).allowed).toBe(true);
    expect(decideM170Commit({ organizationId: "org-1", actionId: "action", commitId: "commit", outputHash: "output", evidenceHash: "evidence", state: "committed", preconditionMatched: true, noUnexpectedChanges: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM170ToolCall({ organizationId: "org-1", callId: "call", actionId: "action", toolName: "patch", actionClass: "write", targetReference: "main", inputHash: "input", idempotencyKey: "idem", state: "approved", policyHash: "policy", timeoutMs: 10_000, redacted: true, tenantMatch: true }).allowed).toBe(false);
  });

  it("M171 gates offline snapshots, sync, conflicts and resolutions", () => {
    expect(validateM171Snapshot({ organizationId: "org-1", clientId: "client", snapshotId: "snapshot", baseRevision: "base", localRevision: "local", state: "local", entityHashes: ["entity"], encrypted: true, tenantBound: true, deviceTrusted: true, capturedAt: 1_000, expiresAt: 2_000 }, 1_100).allowed).toBe(true);
    expect(decideM171Sync({ organizationId: "org-1", syncId: "sync", clientId: "client", snapshotId: "snapshot", baseRevision: "base", operationsHash: "operations", cursor: "cursor", idempotencyKey: "idem", state: "queued", networkAllowed: true, tenantMatch: true, redacted: true }, 1_100).allowed).toBe(true);
    expect(validateM171Conflict({ organizationId: "org-1", conflictId: "conflict", syncId: "sync", kind: "version", localHash: "local", remoteHash: "remote", baseHash: "base", resolutionRequired: true, autoMergeAllowed: false, tenantMatch: true, protectedTarget: true }).allowed).toBe(true);
    expect(decideM171Resolution({ organizationId: "org-1", conflictId: "conflict", resolutionId: "resolution", strategy: "merge", mergedHash: "merged", reviewerReference: "reviewer", approvalPresent: true, evidenceHash: "evidence", noClobber: true }).allowed).toBe(true);
    expect(decideM171Resolution({ organizationId: "org-1", conflictId: "conflict", resolutionId: "resolution", strategy: "local", reviewerReference: "reviewer", approvalPresent: false, evidenceHash: "evidence", noClobber: true }).allowed).toBe(false);
  });

  it("M172 gates locale catalogs, accessibility evidence, screen proof and fallback", () => {
    expect(validateM172Catalog({ organizationId: "org-1", catalogId: "catalog", locale: "fa-IR", fallbackLocale: "en-US", direction: "rtl", messageKeys: ["run.title"], translatedKeys: ["run.title"], version: 1, noRawUserData: true, tenantScoped: true, approved: true }).allowed).toBe(true);
    expect(decideM172A11yCheck({ organizationId: "org-1", checkId: "check", screenReference: "run-screen", locale: "fa-IR", wcagLevel: "AA", state: "passed", toolReference: "axe-ref", violations: 0, keyboardPassed: true, contrastPassed: true, screenReaderPassed: true, evidenceHash: "evidence", approvedWaiver: false }).allowed).toBe(true);
    expect(validateM172ScreenEvidence({ organizationId: "org-1", screenReference: "run-screen", locale: "fa-IR", screenshotHash: "screenshot", focusOrderHash: "focus", labelsHash: "labels", direction: "rtl", responsive: true, redacted: true, tenantMatch: true }).allowed).toBe(true);
    expect(decideM172Fallback({ organizationId: "org-1", locale: "fa-IR", fallbackLocale: "en-US", missingKeys: ["run.title"], allowed: true, reasonHash: "reason", approvalPresent: true }).allowed).toBe(true);
    expect(decideM172A11yCheck({ organizationId: "org-1", checkId: "check", screenReference: "run-screen", locale: "fa-IR", wcagLevel: "AA", state: "passed", toolReference: "axe-ref", violations: 1, keyboardPassed: true, contrastPassed: true, screenReaderPassed: true, evidenceHash: "evidence", approvedWaiver: false }).allowed).toBe(false);
  });

  it("M173 gates incident signals, cases, runbook actions and learning", () => {
    expect(validateM173Signal({ organizationId: "org-1", signalId: "signal", sourceReference: "alert-ref", category: "queue.failure", severity: "high", observedAt: 1_000, fingerprint: "fingerprint", evidenceHash: "evidence", tenantBound: true, redacted: true, dedupeKey: "dedupe" }).allowed).toBe(true);
    expect(decideM173Case({ organizationId: "org-1", caseId: "case", signalIds: ["signal"], severity: "high", state: "contained", commanderReference: "commander", customerImpactHash: "impact", containmentPlanHash: "containment", createdAt: 1_000, approvalPresent: true, tenantMatch: true }).allowed).toBe(true);
    expect(validateM173RunbookStep({ organizationId: "org-1", caseId: "case", stepId: "step", order: 1, action: "contain", commandHash: "command", reversible: true, approvalRequired: true, approved: true, evidenceHash: "evidence", noRawSecrets: true }).allowed).toBe(true);
    expect(decideM173Learning({ organizationId: "org-1", caseId: "case", learningId: "learning", rootCauseHash: "root", contributingFactorsHash: "factors", correctiveActionHash: "action", regressionTestHash: "test", ownerReference: "owner", dueAt: 2_000, privacyReviewed: true, approved: true }, 1_100).allowed).toBe(true);
    expect(validateM173RunbookStep({ organizationId: "org-1", caseId: "case", stepId: "step", order: 1, action: "rollback", commandHash: "command", reversible: false, approvalRequired: true, approved: false, evidenceHash: "evidence", noRawSecrets: true }).allowed).toBe(false);
  });
});
