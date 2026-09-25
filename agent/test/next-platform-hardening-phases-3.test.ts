import { describe, expect, it } from "vitest";
import { decideM139Alert, validateM139RunTrace, validateM139SloPolicy, validateM139TraceSpan } from "../src/core/observability-slo-trace-runtime.js";
import { decideM140Query, validateM140Index, validateM140Result, validateM140SearchAudit } from "../src/core/search-query-governance-runtime.js";
import { decideM141Concurrency, decideM141Trigger, validateM141RunLease, validateM141Schedule } from "../src/core/workflow-scheduler-runtime.js";
import { decideM142Preview, validateM142Artifact, validateM142Cleanup, validateM142Delivery } from "../src/core/artifact-preview-runtime.js";
import { decideM143Action, decideM143LiveEvent, validateM143RunView, validateM143UiEvidence } from "../src/core/operator-console-runtime.js";

describe("M139-M143 deterministic contract kernels", () => {
  it("M139 gates SLO policy, trace integrity and alert routing", () => {
    expect(validateM139SloPolicy({ organizationId: "org-1", sloId: "slo", serviceName: "agent", window: "rolling_24h", targetPercent: 99, errorBudgetPercent: 0.5, alertAfterMinutes: 5, queryHash: "query", routeReference: "route", tenantScoped: true, approvalPresent: true }).allowed).toBe(true);
    expect(validateM139TraceSpan({ organizationId: "org-1", traceId: "trace", spanId: "span", operation: "tool", kind: "tool_call", startedAt: 1, endedAt: 2, status: "ok", attributesHash: "attributes", tenantBound: true, redacted: true }).allowed).toBe(true);
    expect(validateM139RunTrace({ organizationId: "org-1", runId: "run", traceId: "trace", rootSpanId: "root", spanCount: 3, toolCallCount: 1, samplingRate: 1, complete: true, orphanSpanCount: 0, traceRootHash: "root-hash", tenantBound: true }).allowed).toBe(true);
    expect(decideM139Alert({ organizationId: "org-1", alertId: "alert", sloId: "slo", severity: "critical", signalHash: "signal", routeReference: "route", dedupeKey: "dedupe", observedAt: 2, redacted: true, tenantBound: true, actionReference: "action" }).allowed).toBe(true);
    expect(validateM139RunTrace({ organizationId: "org-1", runId: "run", traceId: "trace", rootSpanId: "root", spanCount: 3, toolCallCount: 1, samplingRate: 1, complete: true, orphanSpanCount: 1, traceRootHash: "root-hash", tenantBound: true }).allowed).toBe(false);
  });

  it("M140 gates ACL search, bounded query budgets and export audit", () => {
    const index = { organizationId: "org-1", indexId: "index", projectId: "project", snapshotHash: "snapshot", source: "workspace" as const, documentCount: 10, indexedAt: 1, aclFiltered: true, tenantBound: true, contentHash: "content", schemaVersion: "v1" };
    const request = { organizationId: "org-1", queryHash: "query", queryClass: "lookup" as const, indexId: "index", aclSubjectHash: "subject", maxResults: 20, maxBytes: 10_000, sort: "relevance" as const, requestedFields: ["path", "snippet"], exportAllowed: false, approvalPresent: false };
    expect(validateM140Index(index).allowed).toBe(true);
    expect(decideM140Query(request, index).allowed).toBe(true);
    expect(validateM140Result({ organizationId: "org-1", queryHash: "query", resultId: "result", documentId: "doc", rank: 1, score: 0.9, contentHash: "content", freshnessHash: "fresh", aclVerified: true, tenantMatch: true, redacted: true }).allowed).toBe(true);
    expect(validateM140SearchAudit({ organizationId: "org-1", queryHash: "query", queryClass: "lookup", returnedCount: 1, returnedBytes: 100, rowLimit: 20, exportAllowed: false, approvalPresent: false, resultHashes: ["result"], completedAt: 2 }).allowed).toBe(true);
    expect(decideM140Query({ ...request, queryClass: "export", exportAllowed: false, approvalPresent: false }, index).allowed).toBe(false);
  });

  it("M141 gates schedules, authorized triggers, leases and concurrency", () => {
    expect(validateM141Schedule({ organizationId: "org-1", scheduleId: "schedule", workflowId: "workflow", timezone: "UTC", expression: "0 * * * *", nextRunAt: 2_000, enabled: true, maxConcurrent: 2, misfirePolicy: "skip", ownerReference: "owner", approvalPresent: true, tenantBound: true }, 1_000).allowed).toBe(true);
    expect(decideM141Trigger({ organizationId: "org-1", triggerId: "trigger", kind: "event", eventType: "push", eventHash: "event", dedupeKey: "dedupe", occurredAt: 900, tenantMatch: true, authorized: true, redacted: true }, 1_000).allowed).toBe(true);
    expect(validateM141RunLease({ organizationId: "org-1", runId: "run", scheduleId: "schedule", attempt: 1, leaseIssuedAt: 1_000, leaseExpiresAt: 2_000, workerReference: "worker", idempotencyKey: "idem", maxAttempts: 3, concurrencySlot: 0, revoked: false }, 1_500).allowed).toBe(true);
    expect(decideM141Concurrency({ organizationId: "org-1", scheduleId: "schedule", activeRuns: 0, maxConcurrent: 2, queuedRuns: 1, tenantMatch: true, quotaAvailable: true, duplicateTrigger: false }).allowed).toBe(true);
    expect(decideM141Concurrency({ organizationId: "org-1", scheduleId: "schedule", activeRuns: 2, maxConcurrent: 2, queuedRuns: 1, tenantMatch: true, quotaAvailable: true, duplicateTrigger: false }).allowed).toBe(false);
  });

  it("M142 gates artifact lifecycle, preview isolation, delivery and cleanup", () => {
    expect(validateM142Artifact({ organizationId: "org-1", artifactId: "artifact", runId: "run", digest: "digest", mediaType: "text", sizeBytes: 100, createdAt: 100, expiresAt: 2_000, retentionDays: 30, encrypted: true, signed: true, tenantBound: true, rawSecretsScanned: true }, 1_000).allowed).toBe(true);
    expect(decideM142Preview({ organizationId: "org-1", artifactId: "artifact", previewId: "preview", allowedPath: "dist/index.html", origin: "https://preview.example", requestedAt: 1_000, expiresAt: 2_000, tenantMatch: true, readOnly: true, authzVerified: true, sandboxed: true }, 1_100).allowed).toBe(true);
    expect(validateM142Delivery({ organizationId: "org-1", artifactId: "artifact", deliveryId: "delivery", method: "signed_url", contentHash: "content", redacted: true, oneTime: true, issuedAt: 1_000, expiresAt: 2_000, originBound: true }, 1_100).allowed).toBe(true);
    expect(validateM142Cleanup({ organizationId: "org-1", artifactId: "artifact", deleteAfter: 2_000, deletedAt: 2_100, verificationHash: "verification", storageTargets: ["object-store", "cache"], storageTargetsCleared: true, signedUrlsRevoked: true, tenantBound: true }).allowed).toBe(true);
    expect(decideM142Preview({ organizationId: "org-1", artifactId: "artifact", previewId: "preview", allowedPath: "../secret", origin: "https://preview.example", requestedAt: 1_000, expiresAt: 2_000, tenantMatch: true, readOnly: true, authzVerified: true, sandboxed: true }, 1_100).allowed).toBe(false);
  });

  it("M143 gates redacted views, live events, safe actions and UI evidence", () => {
    expect(validateM143RunView({ organizationId: "org-1", runId: "run", viewId: "view", role: "operator", fieldsAllowed: ["status", "timeline"], timelineHash: "timeline", liveAllowed: true, tenantMatch: true, redacted: true, expiresAt: 2_000 }, 1_000).allowed).toBe(true);
    expect(decideM143LiveEvent({ organizationId: "org-1", runId: "run", eventId: "event", sequence: 1, kind: "status", payloadHash: "payload", piiRedacted: true, tenantMatch: true, replayable: true, emittedAt: 900 }).allowed).toBe(true);
    expect(decideM143Action({ organizationId: "org-1", runId: "run", actionId: "action", action: "pause", roleAllowed: true, reversible: true, approvalPresent: false, confirmationHash: "confirm", tenantMatch: true, idempotencyKey: "idem", requestedAt: 1_000 }).allowed).toBe(true);
    expect(validateM143UiEvidence({ organizationId: "org-1", screenId: "run-console", route: "/runs/run", state: "ready", rtlSupported: true, keyboardNavigable: true, focusVisible: true, errorRecoveryDocumented: true, redacted: true, evidenceHash: "evidence" }).allowed).toBe(true);
    expect(decideM143Action({ organizationId: "org-1", runId: "run", actionId: "action", action: "cancel", roleAllowed: true, reversible: true, approvalPresent: false, confirmationHash: "confirm", tenantMatch: true, idempotencyKey: "idem", requestedAt: 1_000 }).allowed).toBe(false);
  });
});
