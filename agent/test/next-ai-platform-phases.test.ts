import { describe, expect, it } from "vitest";

import { decideStudioPublish, validateStudioPreviewArtifact, validateStudioRuntimeSurface } from "../src/core/visual-studio-integration-runtime.js";
import { aggregateModelEvaluation, decideModelTrustGate, validateModelEvaluationPlan } from "../src/core/model-evaluation-trust-runtime.js";
import { decideModelProviderFallback, decideModelRuntimeRoute, validateModelProviderEndpoint } from "../src/core/model-provider-runtime.js";
import { decideAiWorkflowExecution, validateAiWorkflow, validateWorkflowGraph } from "../src/core/ai-workflow-builder-runtime.js";
import { decideModelIncidentResponse, decideModelQuotaBudget, validateModelOperationalHealth, validateModelOperationsDashboard } from "../src/core/ai-platform-operations-runtime.js";

describe("M59 visual studio integration runtime", () => {
  it("keeps preview, publish and collaboration boundaries reviewable", () => {
    const canvas = { organizationId: "org", projectId: "project", canvasId: "canvas", version: "1", nodes: [{ nodeId: "screen", type: "screen" as const, label: "Home", properties: {}, x: 0, y: 0, width: 800, height: 600 }], tokenSetId: "tokens", previewHash: "preview", interactive: true, untrustedAssetRefs: [] };
    const surface = { organizationId: "org", projectId: "project", sessionId: "session", canvas, previewEnvironment: "local" as const, sandboxed: true, networkEgressAllowed: false, userApproved: true };
    const artifact = { artifactId: "artifact", projectId: "project", environment: "local" as const, artifactHash: "hash", screenshotHashes: ["screen"], exitCode: 0, generatedAt: 1 };
    expect(validateStudioRuntimeSurface(surface).allowed).toBe(true);
    expect(validateStudioPreviewArtifact(artifact, 2).allowed).toBe(true);
    expect(decideStudioPublish(surface, "preview", artifact, true).allowed).toBe(true);
  });
});

describe("M60 model evaluation and trust runtime", () => {
  it("requires reproducible evaluation before trusted activation", () => {
    const plan = { organizationId: "org", catalogId: "catalog", modelId: "model", datasetId: "dataset", caseIds: ["case"], dimensions: ["quality", "safety"] as const, runner: "sandbox" as const, environmentDigest: "env", seed: 7, budgetAllowed: true, providerTermsReviewed: true };
    expect(validateModelEvaluationPlan(plan).allowed).toBe(true);
    expect(aggregateModelEvaluation([{ caseId: "case", modelId: "model", dimension: "quality", passed: true, score: 0.9, latencyMs: 100, cost: 0, outputHash: "output", safetyFindingCount: 0, evidenceHash: "evidence" }]).allowed).toBe(true);
    expect(decideModelTrustGate({ organizationId: "org", catalogId: "catalog", modelId: "model", trustLevel: "screened", qualityScore: 0.9, safetyScore: 1, latencyP95Ms: 100, totalCost: 0, evaluationHash: "evaluation", evaluatedAt: 1, reviewerApproved: true }).trustLevel).toBe("trusted");
  });
});

describe("M61 model provider runtime", () => {
  it("routes through trusted endpoints and preserves honest fallback", () => {
    const endpoint = { providerId: "local-provider", catalogId: "catalog", modelId: "model", mode: "local" as const, locality: "local" as const, apiBaseReference: "http://127.0.0.1:11434", supportedTasks: ["chat"], contextWindow: 4096, freeApiStatus: "free" as const, trustLevel: "trusted" as const, enabled: true, maxConcurrent: 1, quotaReference: "quota" };
    expect(validateModelProviderEndpoint(endpoint).allowed).toBe(true);
    expect(decideModelRuntimeRoute({ organizationId: "org", runId: "run", taskType: "chat", mode: "local", privacy: "local_only", estimatedTokens: 100, egressConsent: false, budgetAllowed: true }, [endpoint]).allowed).toBe(true);
    expect(decideModelProviderFallback({ organizationId: "org", runId: "run", taskType: "chat", mode: "local", privacy: "local_only", estimatedTokens: 100, egressConsent: false, budgetAllowed: true }, "timeout", [endpoint]).selectedProviderId).toBe("local-provider");
  });
});

describe("M62 AI workflow builder runtime", () => {
  it("validates graph reachability, model/tool nodes and execution approval", () => {
    const definition = { organizationId: "org", projectId: "project", workflowId: "workflow", version: "1", nodes: [{ nodeId: "input", kind: "input" as const, label: "Input", inputNodeIds: [], requiresApproval: false, allowed: true }, { nodeId: "model", kind: "model" as const, label: "Model", modelId: "model", inputNodeIds: ["input"], outputSchemaHash: "schema", requiresApproval: false, allowed: true }, { nodeId: "output", kind: "output" as const, label: "Output", inputNodeIds: ["model"], requiresApproval: false, allowed: true }], entryNodeId: "input", outputNodeId: "output", mode: "preview" as const, userApproved: true, containsRawCredential: false as const };
    expect(validateAiWorkflow(definition).allowed).toBe(true);
    expect(validateWorkflowGraph(definition).allowed).toBe(true);
    expect(decideAiWorkflowExecution({ organizationId: "org", workflowId: "workflow", version: "1", runId: "run", mode: "preview", inputHash: "input", egressConsent: false, approvalPresent: false, budgetAllowed: true }, definition).allowed).toBe(true);
  });
});

describe("M63 AI platform operations runtime", () => {
  it("keeps health, quotas, incidents and dashboards tenant-scoped", () => {
    expect(validateModelOperationalHealth({ organizationId: "org", providerId: "provider", modelId: "model", status: "healthy", checkedAt: 1, latencyP95Ms: 100, errorRate: 0.01, availability: 0.999, capabilityProbeHash: "probe", evidenceHash: "evidence" }, 2).allowed).toBe(true);
    expect(decideModelQuotaBudget({ organizationId: "org", providerId: "provider", modelId: "model", period: "day", requestLimit: 100, tokenLimit: 10000, costLimit: 1, requestsUsed: 2, tokensUsed: 200, costUsed: 0.1, hardStop: true }).allowed).toBe(true);
    expect(decideModelIncidentResponse({ organizationId: "org", incidentId: "incident", providerId: "provider", modelId: "model", kind: "safety_regression", severity: "critical", observedAt: 1, evidenceHash: "evidence", acknowledged: false, selectedAction: "disable" }).allowed).toBe(true);
    expect(validateModelOperationsDashboard("org", ["model"], ["latency", "cost"], 1, 2, true).allowed).toBe(true);
  });
});
