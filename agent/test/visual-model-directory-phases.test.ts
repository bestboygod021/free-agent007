import { describe, expect, it } from "vitest";

import { planVisualStudioSession, validateVisualDesignCanvas, validateVisualDesignIntent } from "../src/core/visual-app-studio-runtime.js";
import { decideDesignCodeGeneration, validateAccessibilityReview, validateDesignCodeHandoff, validateDesignTokenHandoff } from "../src/core/design-to-code-runtime.js";
import { classifyModelCandidate, decideAutomaticCatalogIngestion, validateModelDiscoveryRequest, verifyFreeApiEvidence } from "../src/core/model-discovery-runtime.js";
import { decideDirectoryPublication, rankAiDirectoryEntry, validateAiDirectoryEntry, validateAiDirectoryQuery } from "../src/core/ai-directory-runtime.js";
import { decideCatalogPublication, decideCatalogRefresh, decideModelActivation, validateModelCatalogRecord, validateModelHealthEvidence } from "../src/core/model-catalog-governance-runtime.js";

describe("M54 visual app studio runtime", () => {
  it("validates prompt-to-visual intent, canvas graph and bounded studio sessions", () => {
    expect(validateVisualDesignIntent({ organizationId: "org", projectId: "project", sessionId: "session", prompt: "Design a dashboard for a local-first coding app", mode: "prototype", targetPlatforms: ["web"], theme: "dark", direction: "bidi", userApproved: true, containsRawCredential: false }).allowed).toBe(true);
    expect(validateVisualDesignCanvas({ organizationId: "org", projectId: "project", canvasId: "canvas", version: "1", nodes: [{ nodeId: "screen", type: "screen", label: "Dashboard", properties: {}, x: 0, y: 0, width: 1200, height: 800 }], tokenSetId: "tokens", previewHash: "preview", interactive: true, untrustedAssetRefs: [] }).allowed).toBe(true);
    expect(planVisualStudioSession("org", "project", "wireframe", 10, false, true).allowed).toBe(true);
  });
});

describe("M55 design-to-code and UX review runtime", () => {
  it("keeps generated UI sandboxed, path-bounded and accessible", () => {
    const handoff = { organizationId: "org", projectId: "project", canvasId: "canvas", designVersion: "1", target: "react" as const, mode: "handoff_preview" as const, componentMappings: [{ nodeType: "button" as const, componentName: "Button", target: "react" as const, allowedProps: ["label"], emitsEvents: ["click"] }], allowedPaths: ["src/components"], sandboxed: true, approvalPresent: true, outputHash: "output" };
    expect(validateDesignCodeHandoff(handoff).allowed).toBe(true);
    expect(decideDesignCodeGeneration(handoff, ["src/components/Button.tsx"], ["src/components/Button.tsx"]).allowed).toBe(true);
    expect(validateAccessibilityReview({ organizationId: "org", projectId: "project", canvasId: "canvas", direction: "bidi", testedFindings: ["rtl", "semantic"], blockingFindings: 0, contrastRatioMinimum: 4.5, keyboardPathVerified: true, reducedMotionSupported: true, reportHash: "report" }).allowed).toBe(true);
    expect(validateDesignTokenHandoff("org", "tokens", ["color", "spacing"], "--forge", true, true).allowed).toBe(true);
  });
});

describe("M56 model discovery runtime", () => {
  it("bounds web discovery and distinguishes verified free API evidence", () => {
    expect(validateModelDiscoveryRequest({ organizationId: "org", queryHash: "query", allowedDomains: ["huggingface.co", "github.com"], maxResults: 20, maxPagesPerDomain: 5, rateLimitPerMinute: 10, robotsPolicyChecked: true, termsPolicyChecked: true, userApproved: true, networkMode: "free" }).allowed).toBe(true);
    const candidate = { candidateId: "candidate", provider: "Provider", modelId: "provider/model", canonicalUrl: "https://provider.example/model", sourceKind: "official_catalog" as const, sourceUrlHash: "source", modelCardHash: "card", shortDescription: "A concise model summary.", capabilities: ["chat"], trust: "official" as const, discoveredAt: 1, containsInstruction: false };
    expect(classifyModelCandidate(candidate).catalogState).toBe("verified");
    const evidence = { provider: "Provider", modelId: "provider/model", status: "free_tier" as const, evidenceUrlHash: "url", evidenceTextHash: "text", checkedAt: 1, requiresApiKey: true, quotaSummary: "bounded daily quota", termsReviewed: true, verifiedBy: "official_docs" as const };
    expect(verifyFreeApiEvidence(evidence).freeApiBadge).toBe("free_tier");
    expect(decideAutomaticCatalogIngestion(candidate, evidence, true).allowed).toBe(true);
  });
});

describe("M57 AI directory runtime", () => {
  it("supports categories, search filters, descriptions and free API badges", () => {
    const entry = { entryId: "entry", provider: "Provider", modelId: "provider/model", displayName: "Provider Model", shortDescription: "A searchable model directory entry.", categories: ["chat", "code"] as const, modalities: ["text"], contextWindow: 128000, license: "Apache-2.0", regions: ["global"], freeApiStatus: "free_tier" as const, freeApiEvidenceHash: "evidence", sourceUrl: "https://provider.example/model", modelCardHash: "card", listingState: "listed" as const, updatedAt: 1 };
    expect(validateAiDirectoryEntry(entry).searchable).toBe(true);
    expect(validateAiDirectoryQuery({ query: "coding", categories: ["code"], freeApiOnly: true, modalities: ["text"], region: "global", includeCandidates: false, maxResults: 20 }).allowed).toBe(true);
    expect(decideDirectoryPublication(entry, true).allowed).toBe(true);
    expect(rankAiDirectoryEntry(entry, { query: "coding", categories: ["code"], freeApiOnly: true, modalities: ["text"], region: "global", includeCandidates: false, maxResults: 20 }, 0.9, 0.9).allowed).toBe(true);
  });
});

describe("M58 model catalog governance runtime", () => {
  it("keeps discovery, publication, activation and health as separate states", () => {
    const record = { organizationId: "org", catalogId: "catalog", provider: "Provider", modelId: "provider/model", displayName: "Provider Model", description: "A verified model.", categories: ["chat"] as const, freeApiStatus: "free_tier" as const, freeApiEvidenceHash: "evidence", sourceEvidenceHashes: ["source"], publicationState: "listed" as const, lastVerifiedAt: 1, retired: false };
    expect(validateModelCatalogRecord(record).allowed).toBe(true);
    expect(decideCatalogPublication(record, true, true).publicationState).toBe("listed");
    expect(decideModelActivation({ organizationId: "org", userId: "user", catalogId: "catalog", modelId: "provider/model", mode: "free_api", userConsentPresent: true, egressConsent: true, localRuntimeAvailable: false, freeApiEvidencePresent: true }, record).publicationState).toBe("enabled");
    expect(validateModelHealthEvidence({ organizationId: "org", catalogId: "catalog", modelId: "provider/model", checkedAt: 1, latencyMs: 120, status: "available", probeHash: "probe", capabilityResponseHash: "response" }, 2).allowed).toBe(true);
    expect(decideCatalogRefresh("org", "catalog", ["source"], 1, 2, true).allowed).toBe(true);
  });
});
