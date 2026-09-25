/** M27 privacy-aware retrieval and local index contracts. No asset is stored here. */

export type PiiKind = "email" | "phone" | "address" | "identity" | "medical" | "secret_like";

export interface PiiFinding {
  kind: PiiKind;
  start: number;
  end: number;
  evidenceHash: string;
}

export interface PiiDecision {
  findings: PiiFinding[];
  action: "allow" | "redact" | "block";
  rawContentStored: false;
}

export interface DeletionAsset {
  assetId: string;
  organizationId: string;
  locations: Array<"database" | "index" | "cache" | "log" | "artifact" | "backup">;
  legalHold: boolean;
}

export interface DeletionPlan {
  allowed: boolean;
  assetIds: string[];
  pendingLegalHold: string[];
  locations: string[];
  receiptHash: string;
}

export interface RetrievalEvaluation {
  precision: number;
  recall: number;
  grounding: number;
  passed: boolean;
  reasons: string[];
}

export interface LocalIndexPlan {
  organizationId: string;
  projectId: string;
  revision: string;
  locality: "local";
  networkAllowed: false;
  embeddingProvider: "local";
  paths: string[];
  planHash: string;
}

export class PrivacyRetrievalContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrivacyRetrievalContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function classifyPii(content: string): PiiDecision {
  if (!content.trim()) throw new PrivacyRetrievalContractError("content is required");
  const findings: PiiFinding[] = [];
  const patterns: Array<[PiiKind, RegExp]> = [
    ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
    ["phone", /\b(?:\+?\d[\d ()-]{7,}\d)\b/g],
    ["secret_like", /(?:password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*[^\s]+/gi],
    ["identity", /\b(?:ssn|national[- ]?id|passport)\s*[:#]?\s*[A-Z0-9-]{4,}\b/gi],
    ["medical", /\b(?:diagnosis|medical record|patient id)\s*[:#]?\s*[^\s]+/gi],
  ];
  for (const [kind, pattern] of patterns) {
    for (const match of content.matchAll(pattern)) {
      const start = match.index ?? 0;
      findings.push({ kind, start, end: start + match[0].length, evidenceHash: hash(match[0]) });
    }
  }
  const hasSecret = findings.some((finding) => finding.kind === "secret_like");
  return { findings: findings.sort((a, b) => a.start - b.start), action: hasSecret ? "block" : findings.length > 0 ? "redact" : "allow", rawContentStored: false };
}

export function planDeletionPropagation(assets: readonly DeletionAsset[], organizationId: string, now: number): DeletionPlan {
  if (!organizationId.trim() || !Number.isFinite(now)) throw new PrivacyRetrievalContractError("deletion identity is required");
  const scoped = assets.filter((asset) => asset.organizationId === organizationId);
  const pendingLegalHold = scoped.filter((asset) => asset.legalHold).map((asset) => asset.assetId);
  const deletable = scoped.filter((asset) => !asset.legalHold);
  return { allowed: pendingLegalHold.length === 0, assetIds: deletable.map((asset) => asset.assetId), pendingLegalHold, locations: [...new Set(deletable.flatMap((asset) => asset.locations))].sort(), receiptHash: hash(JSON.stringify({ organizationId, now, assets: deletable.map((asset) => [asset.assetId, asset.locations]) })) };
}

export function evaluateRetrieval(expectedIds: readonly string[], resultIds: readonly string[], groundedIds: readonly string[], minimumPrecision = 0.8, minimumRecall = 0.8): RetrievalEvaluation {
  const expected = new Set(expectedIds);
  const results = new Set(resultIds);
  const grounded = new Set(groundedIds);
  const truePositives = [...results].filter((id) => expected.has(id)).length;
  const precision = results.size === 0 ? 0 : truePositives / results.size;
  const recall = expected.size === 0 ? 1 : truePositives / expected.size;
  const grounding = results.size === 0 ? 0 : [...results].filter((id) => grounded.has(id)).length / results.size;
  const reasons: string[] = [];
  if (precision < minimumPrecision) reasons.push("precision below threshold");
  if (recall < minimumRecall) reasons.push("recall below threshold");
  if (grounding < minimumPrecision) reasons.push("grounding below threshold");
  return { precision: Number(precision.toFixed(6)), recall: Number(recall.toFixed(6)), grounding: Number(grounding.toFixed(6)), passed: reasons.length === 0, reasons };
}

export function planLocalRepositoryIndex(organizationId: string, projectId: string, revision: string, paths: readonly string[]): LocalIndexPlan {
  if (!organizationId.trim() || !projectId.trim() || !revision.trim() || paths.length === 0) throw new PrivacyRetrievalContractError("local index identity and paths are required");
  if (paths.some((path) => path.startsWith("/") || path.includes(".."))) throw new PrivacyRetrievalContractError("repository paths must stay inside the workspace");
  return { organizationId, projectId, revision, locality: "local", networkAllowed: false, embeddingProvider: "local", paths: [...paths].sort(), planHash: hash(JSON.stringify({ organizationId, projectId, revision, paths })) };
}
