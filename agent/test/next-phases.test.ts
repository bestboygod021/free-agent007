import { describe, expect, it } from "vitest";

import {
  acceptApprovalDelegation,
  acceptHandoff,
  createHandoff,
  createRunComment,
  delegateApproval,
  type Membership,
} from "../src/core/collaboration.js";
import { planScaffold, type ScaffoldTemplate } from "../src/core/project-scaffold.js";
import { decideConsensus } from "../src/core/consensus.js";
import { runEvaluation } from "../src/core/evaluation.js";
import { checkEntitlement } from "../src/core/entitlements.js";
import { createCatalog, formatNumber, localeDirection, resolveMessage } from "../src/core/i18n.js";
import { planPluginInstall, type PluginManifest } from "../src/core/plugin-registry.js";

describe("M9 collaboration and bootstrap", () => {
  const owner: Membership = { organizationId: "org-1", userId: "owner", roles: ["OWNER"], active: true };
  const reviewer: Membership = { organizationId: "org-1", userId: "reviewer", roles: ["REVIEWER"], active: true };

  it("binds comments and prevents self approval delegation", () => {
    const comment = createRunComment({ commentId: "c-1", organizationId: "org-1", runId: "run-1", authorId: "owner", body: "Review this", createdAt: 10 });
    expect(comment.bodyHash).toBeTruthy();
    expect(() => delegateApproval({ delegationId: "d-1", organizationId: "org-1", runId: "run-1", approvalId: "a-1", fromUserId: "owner", toUserId: "owner", requiredRole: "REVIEWER", expiresAt: 20 }, owner, owner)).toThrow("self-delegation");
  });

  it("expires handoffs and accepts valid approval delegation", () => {
    const handoff = createHandoff({ handoffId: "h-1", organizationId: "org-1", runId: "run-1", fromUserId: "owner", toUserId: "reviewer", reason: "vacation", createdAt: 1, expiresAt: 10 }, owner, reviewer);
    expect(acceptHandoff(handoff, reviewer, 10).status).toBe("expired");
    const delegation = delegateApproval({ delegationId: "d-1", organizationId: "org-1", runId: "run-1", approvalId: "a-1", fromUserId: "owner", toUserId: "reviewer", requiredRole: "REVIEWER", expiresAt: 20 }, owner, reviewer);
    expect(acceptApprovalDelegation(delegation, reviewer, 5).status).toBe("accepted");
  });

  it("creates deterministic, non-overwriting scaffold plans", () => {
    const template: ScaffoldTemplate = { templateId: "ts", version: "1.0.0", stack: "typescript", files: { "src/index.ts": "export const name = '{{name}}';", "README.md": "# {{name}}" }, requiredTools: ["node"], license: "MIT", signature: "sig" };
    const plan = planScaffold(template, { projectId: "p-1", templateId: "ts", templateVersion: "1.0.0", destination: "workspace", variables: { name: "demo" }, existingPaths: [], allowOverwrite: false });
    expect(plan.files.map((file) => file.path)).toEqual(["README.md", "src/index.ts"]);
    expect(plan.planHash).toBe(planScaffold(template, { projectId: "p-1", templateId: "ts", templateVersion: "1.0.0", destination: "workspace", variables: { name: "demo" }, existingPaths: [], allowOverwrite: false }).planHash);
    expect(() => planScaffold(template, { projectId: "p-1", templateId: "ts", templateVersion: "1.0.0", destination: "workspace", variables: { name: "demo" }, existingPaths: ["src/index.ts"], allowOverwrite: false })).toThrow("conflict");
  });
});

describe("M10 evaluation and consensus", () => {
  it("blocks a required safety regression", () => {
    const report = runEvaluation("suite-1", [{ caseId: "case-1", promptHash: "p", expectedSignals: ["schema"], forbiddenSignals: ["secret"], weight: 1, required: true }], [{ caseId: "case-1", outputHash: "o", observedSignals: ["secret"], invariantPass: true, latencyMs: 10, cost: 0 }], { minimumWeightedScore: 0.9, minimumRequiredPassRate: 1, maximumRegression: 0.01, maxCost: 1, maxLatencyMs: 100 });
    expect(report.passed).toBe(false);
    expect(report.reasons[0]).toContain("weighted score");
  });

  it("requires quorum and does not turn a tie into approval", () => {
    const candidates = [{ candidateId: "a", outputHash: "a", modelId: "m1", weight: 1 }, { candidateId: "b", outputHash: "b", modelId: "m2", weight: 1 }];
    const tie = decideConsensus(candidates, [{ voterId: "v1", candidateId: "a", confidence: 1, invariantPass: true, reason: "a" }, { voterId: "v2", candidateId: "b", confidence: 1, invariantPass: true, reason: "b" }], 0.5);
    expect(tie.status).toBe("undecided");
    expect(tie.reasons).toContain("tie requires human review");
  });
});

describe("M11 entitlements", () => {
  const plan = { tier: "free" as const, mode: "free" as const, monthlyRuns: 2, monthlyInputTokens: 1000, monthlyOutputTokens: 500, maxConcurrentRuns: 1, maxProjects: 1, allowedFeatures: ["local.run"], maxCost: 0, currency: "USD", paidProviderAllowed: false };
  it("allows bounded free usage and denies paid cost", () => {
    const decision = checkEntitlement(plan, { runs: 0, inputTokens: 0, outputTokens: 0, concurrentRuns: 0, projects: 0, cost: 0 }, { feature: "local.run", inputTokens: 10, outputTokens: 10, cost: 0, projectsAfter: 1, concurrentRunsAfter: 1 });
    expect(decision.allowed).toBe(true);
    const denied = checkEntitlement(plan, { runs: 1, inputTokens: 0, outputTokens: 0, concurrentRuns: 0, projects: 1, cost: 0 }, { feature: "local.run", inputTokens: 10, outputTokens: 10, cost: 0.01, projectsAfter: 1, concurrentRunsAfter: 1 });
    expect(denied.allowed).toBe(false);
    expect(denied.reasons).toContain("free mode cannot spend paid cost");
  });
});

describe("M12 localization", () => {
  it("uses explicit fallback and escapes interpolation", () => {
    const fa = createCatalog("fa-IR", "1", { "run.ready": "آماده {{name}}" });
    const en = createCatalog("en-US", "1", { "run.ready": "Ready {{name}}", "run.failed": "Failed" });
    expect(resolveMessage("run.ready", "fa-IR", [fa, en], { name: "<x>" }).text).toContain("&lt;x&gt;");
    expect(resolveMessage("run.failed", "fa-IR", [fa, en]).fallbackUsed).toBe(true);
    expect(localeDirection["fa-IR"]).toBe("rtl");
    expect(formatNumber(1234.5, "en-US")).toContain("1,234");
  });
});

describe("M13 plugin governance", () => {
  const manifest: PluginManifest = { pluginId: "private.tool", version: "1.2.0", sdkVersion: "1.0.0", organizationId: "org-1", capabilities: ["project.read"], requestedScopes: ["project:read"], runtime: "sandbox", packageDigest: "sha256:x", signature: "sig", license: "MIT", compatibility: { minPlatformVersion: "1.0.0" }, trust: "private", manifestHash: "hash" };
  it("requires signature, ownership and sandboxed trust", () => {
    const allowed = planPluginInstall(manifest, { organizationId: "org-1", platformVersion: "1.1.0", requestedCapabilities: ["project.read"], requestedScopes: ["project:read"], allowPrivate: true }, () => true);
    expect(allowed.allowed).toBe(true);
    const denied = planPluginInstall({ ...manifest, trust: "unverified" }, { organizationId: "org-1", platformVersion: "1.1.0", requestedCapabilities: ["project.read"], requestedScopes: ["project:read"], allowPrivate: true }, () => true);
    expect(denied.allowed).toBe(false);
    expect(denied.executionBoundary).toBe("none");
  });
});
