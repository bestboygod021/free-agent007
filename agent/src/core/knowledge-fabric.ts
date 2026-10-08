/**
 * M26 knowledge contracts. They describe graph, ACL, packing, memory tiers,
 * documentation freshness and lineage without persisting content or embeddings.
 */

export type GraphNodeKind = "file" | "symbol" | "api" | "test" | "dependency";
export type MemoryTier = "run" | "project" | "organization" | "general";
export type TaintLabel = "clean" | "untrusted" | "secret_like";

export interface CodeGraphNode {
  nodeId: string;
  organizationId: string;
  kind: GraphNodeKind;
  label: string;
  revision: string;
}

export interface CodeGraphEdge {
  from: string;
  to: string;
  relation: "imports" | "defines" | "calls" | "tests" | "depends_on";
}

export interface CodeGraph {
  organizationId: string;
  revision: string;
  nodes: CodeGraphNode[];
  edges: CodeGraphEdge[];
  graphHash: string;
}

export interface ContextItem {
  itemId: string;
  organizationId: string;
  projectId: string;
  contentHash: string;
  tokenEstimate: number;
  relevance: number;
  trust: "untrusted" | "observed" | "verified";
  taint: TaintLabel;
  allowedSubjectIds: string[];
  provenanceHash: string;
  sourceRevision: string;
  expiresAt?: number;
}

export interface PackedContext {
  selectedItemIds: string[];
  omittedItemIds: string[];
  tokenEstimate: number;
  budget: number;
  manifestHash: string;
}

export interface MemoryPlacement {
  tier: MemoryTier;
  expiresAt: number;
  requiresConsent: boolean;
  deletionScope: string;
  reason: string;
}

export interface StaleDocumentationFinding {
  documentId: string;
  sourceRevision: string;
  documentRevision: string;
  stale: boolean;
  reason: string;
}

export interface LineageRef {
  outputHash: string;
  sourceHashes: string[];
  transformation: string;
  organizationId: string;
  redacted: true;
}

export class KnowledgeFabricContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgeFabricContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new KnowledgeFabricContractError(`${label} is required`);
}

export function buildCodeGraph(organizationId: string, revision: string, nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): CodeGraph {
  required(organizationId, "organizationId");
  required(revision, "revision");
  const ids = new Set<string>();
  for (const node of nodes) {
    if (node.organizationId !== organizationId || !node.nodeId.trim() || ids.has(node.nodeId)) throw new KnowledgeFabricContractError("graph nodes must be unique and tenant-bound");
    ids.add(node.nodeId);
  }
  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) throw new KnowledgeFabricContractError("graph edge references an unknown node");
  }
  return { organizationId, revision, nodes: [...nodes].sort((a, b) => a.nodeId.localeCompare(b.nodeId)), edges: [...edges].sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`)), graphHash: hash(JSON.stringify({ organizationId, revision, nodes, edges })) };
}

export function filterContextByAcl(items: readonly ContextItem[], organizationId: string, projectId: string, subjectId: string, now: number): ContextItem[] {
  return items.filter((item) => item.organizationId === organizationId && item.projectId === projectId && item.allowedSubjectIds.includes(subjectId) && (item.expiresAt === undefined || now < item.expiresAt));
}

export function packContext(items: readonly ContextItem[], budget: number): PackedContext {
  if (!Number.isInteger(budget) || budget < 1) throw new KnowledgeFabricContractError("context budget must be positive");
  const ranked = [...items].filter((item) => item.taint !== "secret_like" && item.tokenEstimate > 0 && item.provenanceHash.trim()).sort((a, b) => b.relevance - a.relevance || a.itemId.localeCompare(b.itemId));
  const selected: ContextItem[] = [];
  let used = 0;
  for (const item of ranked) {
    if (used + item.tokenEstimate <= budget) {
      selected.push(item);
      used += item.tokenEstimate;
    }
  }
  const selectedIds = new Set(selected.map((item) => item.itemId));
  const omittedItemIds = items.filter((item) => !selectedIds.has(item.itemId)).map((item) => item.itemId);
  return { selectedItemIds: selected.map((item) => item.itemId), omittedItemIds, tokenEstimate: used, budget, manifestHash: hash(JSON.stringify({ selected: selected.map((item) => [item.itemId, item.contentHash, item.provenanceHash]), budget })) };
}

export function planMemoryPlacement(tier: MemoryTier, now: number, ttlMs: number, requiresConsent: boolean): MemoryPlacement {
  if (!Number.isFinite(now) || !Number.isFinite(ttlMs) || ttlMs <= 0) throw new KnowledgeFabricContractError("invalid memory TTL");
  const scope = tier === "run" ? "run" : tier === "project" ? "project" : tier === "organization" ? "organization" : "global-consent";
  return { tier, expiresAt: now + ttlMs, requiresConsent: requiresConsent || tier === "organization" || tier === "general", deletionScope: scope, reason: tier === "run" ? "short-lived run context" : "broader tier requires explicit retention and deletion" };
}

export function detectStaleDocumentation(findings: Array<{ documentId: string; sourceRevision: string; documentRevision: string }>): StaleDocumentationFinding[] {
  return findings.map((finding) => ({ ...finding, stale: finding.sourceRevision !== finding.documentRevision, reason: finding.sourceRevision === finding.documentRevision ? "document matches source revision" : "document must be reviewed; report is advisory and cannot change code authority" }));
}

export function createLineageRef(organizationId: string, outputHash: string, sourceHashes: string[], transformation: string): LineageRef {
  required(organizationId, "organizationId");
  required(outputHash, "outputHash");
  required(transformation, "transformation");
  if (sourceHashes.length === 0 || sourceHashes.some((sourceHash) => !sourceHash.trim())) throw new KnowledgeFabricContractError("lineage requires source hashes");
  return { organizationId, outputHash, sourceHashes: [...sourceHashes], transformation, redacted: true };
}
