/** M28 governance, quality, publication and transparency decision contracts. */

export interface PolicyBundle {
  policyId: string;
  organizationId: string;
  version: string;
  ownerId: string;
  effectiveAt: number;
  expiresAt: number;
  policyHash: string;
}

export interface ChangeRequest {
  changeId: string;
  organizationId: string;
  requesterId: string;
  reviewerId?: string;
  currentHash: string;
  proposedHash: string;
  widensAccess: boolean;
  rollbackHash?: string;
}

export interface QualityGovernanceDecision {
  allowed: boolean;
  requiresApproval: boolean;
  reasons: string[];
  decisionHash: string;
}

export interface ModelCard {
  modelId: string;
  version: string;
  languages: string[];
  limitations: string[];
  vendorClaims: string[];
  measuredEvidenceHashes: string[];
  riskLevel: "low" | "medium" | "high";
  costNote: string;
}

export interface LanguageScore {
  locale: string;
  score: number;
  sampleSize: number;
}

export interface FairnessReport {
  minimumScore: number;
  maximumGap: number;
  passed: boolean;
  reasons: string[];
}

export interface AccessibilityFinding {
  id: string;
  severity: "minor" | "serious" | "critical";
  resolved: boolean;
  evidenceHash: string;
}

export interface PluginPublicationInput {
  pluginId: string;
  signatureVerified: boolean;
  sbomPresent: boolean;
  licenseAllowed: boolean;
  sandboxTestPassed: boolean;
  reviewerId?: string;
}

export interface TransparencyProjection {
  organizationId: string;
  runCount: number;
  tokenCount: number;
  blockedCount: number;
  providerShare: Record<string, number>;
  sourceHash: string;
  containsSecrets: false;
}

export interface AdrRecord {
  adrId: string;
  title: string;
  status: "proposed" | "accepted" | "superseded" | "rejected";
  decision: string;
  alternatives: string[];
  tradeoffs: string[];
  evidenceHashes: string[];
  rollbackReference?: string;
}

export class GovernanceQualityContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GovernanceQualityContractError";
  }
}

function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new GovernanceQualityContractError(`${label} is required`);
}

export function validatePolicyBundle(bundle: PolicyBundle, now: number): QualityGovernanceDecision {
  const reasons: string[] = [];
  required(bundle.policyId, "policyId");
  required(bundle.organizationId, "organizationId");
  required(bundle.ownerId, "ownerId");
  required(bundle.policyHash, "policyHash");
  if (!Number.isFinite(now) || bundle.expiresAt <= bundle.effectiveAt || now >= bundle.expiresAt) reasons.push("policy is expired or has invalid timestamps");
  return { allowed: reasons.length === 0, requiresApproval: false, reasons, decisionHash: hash(JSON.stringify({ bundle, reasons })) };
}

export function planGovernedChange(request: ChangeRequest): QualityGovernanceDecision {
  required(request.changeId, "changeId");
  const reasons: string[] = [];
  if (request.organizationId.trim().length === 0) reasons.push("organizationId is required");
  if (!request.currentHash || !request.proposedHash) reasons.push("current and proposed hashes are required");
  if (request.requesterId === request.reviewerId) reasons.push("self-approval is forbidden");
  if (request.widensAccess && !request.reviewerId) reasons.push("widening access requires an independent reviewer");
  if (request.widensAccess && !request.rollbackHash) reasons.push("widening access requires a rollback reference");
  return { allowed: reasons.length === 0, requiresApproval: request.widensAccess || request.requesterId !== request.reviewerId, reasons, decisionHash: hash(JSON.stringify({ request, reasons })) };
}

export function validateModelCard(card: ModelCard): QualityGovernanceDecision {
  const reasons: string[] = [];
  if (!card.modelId.trim() || !card.version.trim() || card.languages.length === 0) reasons.push("model identity and language coverage are required");
  if (card.limitations.length === 0) reasons.push("limitations are required");
  if (card.vendorClaims.length > 0 && card.measuredEvidenceHashes.length === 0) reasons.push("vendor claims cannot be promoted without measured evidence");
  if (!card.costNote.trim()) reasons.push("cost note is required");
  return { allowed: reasons.length === 0, requiresApproval: true, reasons, decisionHash: hash(JSON.stringify({ card, reasons })) };
}

export function evaluateFairness(scores: readonly LanguageScore[], minimumScore: number, maximumGap: number): FairnessReport {
  const reasons: string[] = [];
  if (scores.length === 0) reasons.push("at least one language score is required");
  if (scores.some((score) => score.sampleSize < 1 || score.score < 0 || score.score > 1)) reasons.push("language score is invalid");
  const values = scores.map((score) => score.score);
  const min = values.length === 0 ? 0 : Math.min(...values);
  const max = values.length === 0 ? 0 : Math.max(...values);
  if (min < minimumScore) reasons.push("a language score is below the minimum");
  if (max - min > maximumGap) reasons.push("language quality gap exceeds threshold");
  return { minimumScore: min, maximumGap: Number((max - min).toFixed(6)), passed: reasons.length === 0, reasons };
}

export function evaluateAccessibility(findings: readonly AccessibilityFinding[]): QualityGovernanceDecision {
  const reasons = findings.filter((finding) => finding.severity === "critical" && !finding.resolved).map((finding) => `unresolved critical finding: ${finding.id}`);
  return { allowed: reasons.length === 0, requiresApproval: false, reasons, decisionHash: hash(JSON.stringify(findings)) };
}

export function decidePluginPublication(input: PluginPublicationInput): QualityGovernanceDecision {
  const reasons: string[] = [];
  if (!input.signatureVerified) reasons.push("signature verification failed");
  if (!input.sbomPresent) reasons.push("SBOM is required");
  if (!input.licenseAllowed) reasons.push("license is not allowed");
  if (!input.sandboxTestPassed) reasons.push("sandbox test is required");
  if (!input.reviewerId) reasons.push("independent review is required");
  return { allowed: reasons.length === 0, requiresApproval: true, reasons, decisionHash: hash(JSON.stringify({ input, reasons })) };
}

export function buildTransparencyProjection(input: { organizationId: string; runCount: number; tokenCount: number; blockedCount: number; providerShare: Record<string, number>; sourceHash: string }): TransparencyProjection {
  if (!input.organizationId.trim() || !input.sourceHash.trim() || Object.values(input.providerShare).some((share) => share < 0 || share > 1)) throw new GovernanceQualityContractError("invalid transparency input");
  return { ...input, providerShare: { ...input.providerShare }, containsSecrets: false };
}

export function validateAdr(adr: AdrRecord): QualityGovernanceDecision {
  const reasons: string[] = [];
  required(adr.adrId, "adrId");
  required(adr.title, "title");
  required(adr.decision, "decision");
  if (adr.alternatives.length === 0) reasons.push("ADR must record alternatives");
  if (adr.tradeoffs.length === 0) reasons.push("ADR must record trade-offs");
  if (adr.status === "accepted" && adr.evidenceHashes.length === 0) reasons.push("accepted ADR requires evidence hashes");
  if (adr.status === "accepted" && !adr.rollbackReference) reasons.push("accepted ADR requires rollback reference");
  return { allowed: reasons.length === 0, requiresApproval: adr.status === "accepted", reasons, decisionHash: hash(JSON.stringify({ adr, reasons })) };
}
